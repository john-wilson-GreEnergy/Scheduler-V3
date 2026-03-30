-- Enable RLS on tables
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobsites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobsite_groups ENABLE ROW LEVEL SECURITY;

-- Policies for jobsite_groups table
CREATE POLICY "Admin/Super Admin full access on jobsite_groups" ON public.jobsite_groups
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Site Manager/Lead read jobsite_groups" ON public.jobsite_groups
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) IN ('site_manager', 'site_lead'));

-- Helper function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id uuid)
RETURNS text AS $$
  SELECT role FROM public.user_roles WHERE user_id = $1;
$$ LANGUAGE sql STABLE;

-- Policies for employees table
-- Admin/Super Admin: Full access
CREATE POLICY "Admin/Super Admin full access on employees" ON public.employees
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

-- Site Manager: Read all employees
CREATE POLICY "Site Manager read all employees" ON public.employees
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) = 'site_manager');

-- Site Lead: Read employees in their site (assuming site_lead has a jobsite_fk or similar)
-- BESS Tech: Read own data
CREATE POLICY "BESS Tech read own employee record" ON public.employees
  FOR SELECT TO authenticated
  USING (auth.uid() = auth_user_id);

-- Policies for jobsites table
CREATE POLICY "Admin/Super Admin full access on jobsites" ON public.jobsites
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Site Manager/Lead read jobsites" ON public.jobsites
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) IN ('site_manager', 'site_lead'));

-- Policies for assignment_weeks table
CREATE POLICY "Admin/Super Admin full access on assignment_weeks" ON public.assignment_weeks
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Site Manager/Lead full access assignment_weeks" ON public.assignment_weeks
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('site_manager', 'site_lead'));

CREATE POLICY "BESS Tech read own assignment_weeks" ON public.assignment_weeks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = assignment_weeks.employee_fk
    AND e.auth_user_id = auth.uid()
-- Policies for assignment_items table
CREATE POLICY "Admin/Super Admin full access on assignment_items" ON public.assignment_items
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Site Manager/Lead full access assignment_items" ON public.assignment_items
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('site_manager', 'site_lead'));

CREATE POLICY "BESS Tech read own assignment_items" ON public.assignment_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.assignment_weeks aw
    JOIN public.employees e ON aw.employee_fk = e.id
    WHERE aw.id = assignment_items.assignment_week_fk
    AND e.auth_user_id = auth.uid()
  ));

-- Policies for portal_requests table
CREATE POLICY "Admin/Super Admin full access on portal_requests" ON public.portal_requests
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('admin', 'super_admin'));

CREATE POLICY "Site Manager/Lead full access portal_requests" ON public.portal_requests
  FOR ALL TO authenticated
  USING (get_user_role(auth.uid()) IN ('site_manager', 'site_lead'));

CREATE POLICY "BESS Tech full access own portal_requests" ON public.portal_requests
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = portal_requests.employee_fk
    AND e.auth_user_id = auth.uid()
  ));
