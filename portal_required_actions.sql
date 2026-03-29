-- Create portal_required_actions table
CREATE TABLE IF NOT EXISTS public.portal_required_actions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now(),
    title text NOT NULL,
    description text,
    url text,
    icon text DEFAULT 'ClipboardCheck',
    category text DEFAULT 'General',
    active boolean DEFAULT true,
    start_date date,
    end_date date,
    sort_order integer DEFAULT 0,
    open_in_new_tab boolean DEFAULT true,
    recurrence_type text DEFAULT 'none', -- none, weekly, monthly, quarterly
    recurrence_interval integer DEFAULT 1,
    recurrence_day integer DEFAULT 1,
    duration_days integer DEFAULT 7,
    automated boolean DEFAULT false,
    embed_in_portal boolean DEFAULT false
);

-- Create completions table for required actions
CREATE TABLE IF NOT EXISTS public.portal_required_action_completions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now(),
    action_id uuid REFERENCES public.portal_required_actions(id) ON DELETE CASCADE,
    employee_fk uuid REFERENCES public.employees(id) ON DELETE CASCADE,
    email text,
    first_name text,
    last_name text,
    completed_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.portal_required_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_required_action_completions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for portal_required_actions
DROP POLICY IF EXISTS "Admin/Super Admin full access on required actions" ON public.portal_required_actions;
CREATE POLICY "Admin/Super Admin full access on required actions" ON public.portal_required_actions
    FOR ALL TO authenticated
    USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "All authenticated users can read active required actions" ON public.portal_required_actions;
CREATE POLICY "All authenticated users can read active required actions" ON public.portal_required_actions
    FOR SELECT TO authenticated
    USING (active = true);

-- RLS Policies for portal_required_action_completions
DROP POLICY IF EXISTS "Admin/Super Admin full access on completions" ON public.portal_required_action_completions;
CREATE POLICY "Admin/Super Admin full access on completions" ON public.portal_required_action_completions
    FOR ALL TO authenticated
    USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

DROP POLICY IF EXISTS "Employees can read their own completions" ON public.portal_required_action_completions;
CREATE POLICY "Employees can read their own completions" ON public.portal_required_action_completions
    FOR SELECT TO authenticated
    USING (employee_fk IN (SELECT id FROM public.employees WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "Employees can insert their own completions" ON public.portal_required_action_completions;
CREATE POLICY "Employees can insert their own completions" ON public.portal_required_action_completions
    FOR INSERT TO authenticated
    WITH CHECK (employee_fk IN (SELECT id FROM public.employees WHERE auth_user_id = auth.uid()));

-- Migration: Move existing high priority actions to the new table
-- Note: This assumes portal_actions still has the data.
-- INSERT INTO public.portal_required_actions (
--     id, created_at, title, description, url, icon, category, active, 
--     start_date, end_date, sort_order, open_in_new_tab, recurrence_type, 
--     recurrence_interval, recurrence_day, duration_days, automated, embed_in_portal
-- )
-- SELECT 
--     id, created_at, title, description, url, icon, category, active, 
--     start_date, end_date, sort_order, open_in_new_tab, recurrence_type, 
--     recurrence_interval, recurrence_day, duration_days, automated, embed_in_portal
-- FROM public.portal_actions
-- WHERE priority = 'high';

-- Migration: Move completions
-- INSERT INTO public.portal_required_action_completions (
--     id, created_at, action_id, employee_fk, email, first_name, last_name, completed_at
-- )
-- SELECT 
--     c.id, c.created_at, c.action_id, c.employee_fk, c.email, c.first_name, c.last_name, c.completed_at
-- FROM public.portal_action_completions c
-- JOIN public.portal_actions a ON c.action_id = a.id
-- WHERE a.priority = 'high';

-- Cleanup: Remove high priority actions from portal_actions
-- DELETE FROM public.portal_actions WHERE priority = 'high';
