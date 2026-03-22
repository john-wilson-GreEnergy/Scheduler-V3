-- Enable RLS on tables
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobsites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_requests ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Site Manager/Lead read assignment_weeks" ON public.assignment_weeks
  FOR SELECT TO authenticated
  USING (get_user_role(auth.uid()) IN ('site_manager', 'site_lead'));

CREATE POLICY "BESS Tech read own assignment_weeks" ON public.assignment_weeks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = assignment_weeks.employee_fk
    AND e.auth_user_id = auth.uid()
  ));
