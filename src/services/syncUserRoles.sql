-- 1. One-time sync: Populate user_roles from employees
INSERT INTO public.user_roles (user_id, role)
SELECT auth_user_id, role
FROM public.employees
WHERE auth_user_id IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
SET role = EXCLUDED.role;

-- 2. Create a trigger to keep them in sync automatically
CREATE OR REPLACE FUNCTION public.sync_employee_role_to_user_roles()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.auth_user_id IS NOT NULL) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.auth_user_id, NEW.role)
    ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_employee_role ON public.employees;

CREATE TRIGGER sync_employee_role
AFTER INSERT OR UPDATE OF role, auth_user_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.sync_employee_role_to_user_roles();
