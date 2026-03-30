-- Create a function to atomically import assignments
CREATE OR REPLACE FUNCTION public.import_assignments(assignment_data jsonb)
RETURNS void AS $$
DECLARE
  item jsonb;
  assignment_week_id uuid;
BEGIN
  -- Loop through the assignment data
  FOR item IN SELECT * FROM jsonb_array_elements(assignment_data)
  LOOP
    -- 1. Upsert assignment_week
    INSERT INTO public.assignment_weeks (employee_fk, week_start, status, assignment_type)
    VALUES (
      (item->>'employee_fk')::uuid,
      (item->>'week_start')::date,
      'active',
      item->>'assignment_type'
    )
    ON CONFLICT (employee_fk, week_start) 
    DO UPDATE SET 
      assignment_type = EXCLUDED.assignment_type,
      status = 'active'
    RETURNING id INTO assignment_week_id;

    -- 2. Delete existing assignment_items for this week
    DELETE FROM public.assignment_items WHERE assignment_week_fk = assignment_week_id;

    -- 3. Insert new assignment_items
    INSERT INTO public.assignment_items (assignment_week_fk, jobsite_fk, days, item_order)
    SELECT 
      assignment_week_id,
      (site->>'jobsite_fk')::uuid,
      ARRAY(SELECT jsonb_array_elements_text(site->'days')),
      1
    FROM jsonb_array_elements(item->'target_jobsites') AS site;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
