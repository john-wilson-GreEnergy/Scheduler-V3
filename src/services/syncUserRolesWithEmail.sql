-- 1. Add email column to user_roles
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS email text;

-- 2. One-time sync: Populate user_roles from employees (including email)
INSERT INTO public.user_roles (user_id, role, email)
SELECT auth_user_id, role, email
FROM public.employees
WHERE auth_user_id IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
SET role = EXCLUDED.role,
    email = EXCLUDED.email;

-- 3. Update trigger to keep email in sync automatically
CREATE OR REPLACE FUNCTION public.sync_employee_role_to_user_roles()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.auth_user_id IS NOT NULL) THEN
    INSERT INTO public.user_roles (user_id, role, email)
    VALUES (NEW.auth_user_id, NEW.role, NEW.email)
    ON CONFLICT (user_id) DO UPDATE SET 
        role = EXCLUDED.role,
        email = EXCLUDED.email;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
