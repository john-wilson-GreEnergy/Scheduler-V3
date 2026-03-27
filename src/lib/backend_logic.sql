-- GreEnergy Scheduler: Backend Logic Migration
-- This file contains PostgreSQL functions to move frontend logic to the database.

-- 1. Rotation Logic Function
CREATE OR REPLACE FUNCTION is_rotation_week(emp_id UUID, check_date DATE)
RETURNS BOOLEAN AS $$
DECLARE
    emp RECORD;
    config RECORD;
    anchor_date DATE;
    weeks_diff INTEGER;
    cycle INTEGER;
    normalized_weeks INTEGER;
    group_anchor DATE := '2026-03-09'; -- Fixed anchor for group-based rotations
BEGIN
    -- Get employee and their config
    SELECT * INTO emp FROM employees WHERE id = emp_id;
    IF NOT FOUND THEN RETURN FALSE; END IF;

    SELECT * INTO config FROM rotation_configs WHERE employee_fk = emp_id AND is_active = true;

    -- 1. Custom Config Logic (Flexible system) - PRIORITIZE THIS
    IF NOT emp.uses_group_rotation AND config IS NOT NULL THEN
        anchor_date := config.anchor_date;
        -- Normalize to start of week (Monday)
        -- PostgreSQL extract(dow) returns 0 for Sunday, 1 for Monday
        -- We want to calculate weeks from anchor to check_date
        weeks_diff := floor(extract(day from (check_date - anchor_date)) / 7);
        cycle := config.weeks_on + config.weeks_off;
        normalized_weeks := ((weeks_diff % cycle) + cycle) % cycle;
        RETURN normalized_weeks >= config.weeks_on;
    END IF;

    -- 2. Group-based Logic (Fixed system) - FALLBACK
    IF emp.uses_group_rotation AND emp.rotation_group IS NOT NULL THEN
        DECLARE
            offset_val INTEGER := CASE 
                WHEN emp.rotation_group = 'A' THEN 3
                WHEN emp.rotation_group = 'B' THEN 2
                WHEN emp.rotation_group = 'C' THEN 1
                ELSE 0 END;
        BEGIN
            weeks_diff := floor(extract(day from (check_date - group_anchor)) / 7);
            cycle := 4; -- 3 on, 1 off
            normalized_weeks := (((weeks_diff - offset_val) % cycle) + cycle) % cycle;
            RETURN normalized_weeks >= 3;
        END;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Automatic Assignment Generation Function
CREATE OR REPLACE FUNCTION sync_employee_assignments(emp_id UUID, start_date DATE, weeks_count INTEGER DEFAULT 52)
RETURNS VOID AS $$
DECLARE
    emp RECORD;
    current_week DATE;
    is_rot BOOLEAN;
    rot_jobsite_id UUID;
    week_id UUID;
BEGIN
    SELECT * INTO emp FROM employees WHERE id = emp_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Get the system 'Rotation' jobsite ID
    SELECT id INTO rot_jobsite_id FROM jobsites WHERE jobsite_name = 'Rotation' LIMIT 1;

    FOR i IN 0..(weeks_count - 1) LOOP
        current_week := start_date + (i * interval '1 week');
        is_rot := is_rotation_week(emp_id, current_week);

        -- Upsert assignment_weeks
        INSERT INTO assignment_weeks (employee_id, email, week_start, assignment_name, value_type, status, first_name, last_name)
        VALUES (
            emp_id, 
            emp.email, 
            current_week, 
            CASE WHEN is_rot THEN 'Rotation' ELSE NULL END,
            CASE WHEN is_rot THEN 'rotation' ELSE 'work' END,
            CASE WHEN is_rot THEN 'assigned' ELSE 'unassigned' END,
            emp.first_name,
            emp.last_name
        )
        ON CONFLICT (employee_id, week_start) DO UPDATE SET
            assignment_name = EXCLUDED.assignment_name,
            value_type = EXCLUDED.value_type,
            status = EXCLUDED.status
        RETURNING id INTO week_id;

        -- Handle assignment_items for Rotation
        IF is_rot AND rot_jobsite_id IS NOT NULL THEN
            INSERT INTO assignment_items (assignment_week_fk, jobsite_fk, days)
            VALUES (week_id, rot_jobsite_id, ARRAY[1,2,3,4,5])
            ON CONFLICT (assignment_week_fk, jobsite_fk) DO NOTHING;
        ELSE
            -- Remove rotation item if it's no longer a rotation week
            DELETE FROM assignment_items 
            WHERE assignment_week_fk = week_id AND jobsite_fk = rot_jobsite_id;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Assign Employee to Jobsite Function
CREATE OR REPLACE FUNCTION assign_employee_to_jobsite(
    emp_id UUID,
    site_id UUID,
    target_week DATE,
    admin_id UUID,
    days_arr INTEGER[] DEFAULT ARRAY[1,2,3,4,5]
)
RETURNS VOID AS $$
DECLARE
    emp RECORD;
    site RECORD;
    week_id UUID;
    is_special BOOLEAN;
    status_val TEXT;
    prev_site_name TEXT;
BEGIN
    SELECT * INTO emp FROM employees WHERE id = emp_id;
    SELECT * INTO site FROM jobsites WHERE id = site_id;
    
    IF NOT FOUND THEN RETURN; END IF;

    -- Determine status and special handling
    is_special := site.jobsite_name IN ('Rotation', 'Vacation', 'Personal', 'Time Off');
    status_val := CASE WHEN is_special THEN lower(site.jobsite_name) ELSE 'assigned' END;

    -- Get previous assignment name for notification
    SELECT assignment_name INTO prev_site_name 
    FROM assignment_weeks 
    WHERE employee_id = emp_id AND week_start = target_week;

    -- 1. Upsert assignment_weeks
    INSERT INTO assignment_weeks (employee_id, email, week_start, assignment_name, value_type, status, first_name, last_name)
    VALUES (
        emp_id, 
        emp.email, 
        target_week, 
        site.jobsite_name,
        CASE WHEN is_special THEN lower(site.jobsite_name) ELSE 'work' END,
        status_val,
        emp.first_name,
        emp.last_name
    )
    ON CONFLICT (employee_id, week_start) DO UPDATE SET
        assignment_name = EXCLUDED.assignment_name,
        value_type = EXCLUDED.value_type,
        status = EXCLUDED.status
    RETURNING id INTO week_id;

    -- 2. Update assignment_items
    DELETE FROM assignment_items WHERE assignment_week_fk = week_id;
    INSERT INTO assignment_items (assignment_week_fk, jobsite_fk, days)
    VALUES (week_id, site_id, days_arr);

    -- 3. Log Activity
    INSERT INTO logs (action, details, user_id)
    VALUES (
        'assignment_update', 
        jsonb_build_object(
            'employeeId', emp_id,
            'jobsiteId', site_id,
            'weekStart', target_week,
            'jobsiteName', site.jobsite_name
        ),
        admin_id
    );

    -- 4. Create Notification
    INSERT INTO notifications (employee_fk, title, message, type)
    VALUES (
        emp_id,
        'Assignment Change',
        'Your assignment for week ' || target_week || ' has been updated to "' || site.jobsite_name || '".',
        'info'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Workforce Conflict Analysis Function
CREATE OR REPLACE FUNCTION analyze_workforce_conflicts(target_week DATE)
RETURNS TABLE (
    conflict_type TEXT,
    jobsite_name TEXT,
    employee_name TEXT,
    message TEXT
) AS $$
DECLARE
    site RECORD;
    asgn RECORD;
    is_rot BOOLEAN;
    min_personnel INTEGER := 2;
    admin_id UUID;
BEGIN
    -- 1. Check Understaffing
    FOR site IN SELECT * FROM jobsites WHERE is_active = true LOOP
        DECLARE
            staff_count INTEGER;
        BEGIN
            SELECT count(*) INTO staff_count
            FROM assignment_items ai
            JOIN assignment_weeks aw ON ai.assignment_week_fk = aw.id
            WHERE ai.jobsite_fk = site.id AND aw.week_start = target_week;

            IF staff_count < min_personnel THEN
                conflict_type := 'understaffing';
                jobsite_name := site.jobsite_name;
                employee_name := 'N/A';
                message := 'Jobsite "' || site.jobsite_name || '" is understaffed for week ' || target_week || '. (Current: ' || staff_count || ', Min: ' || min_personnel || ')';
                
                -- Create notifications for admins
                FOR admin_id IN SELECT id FROM employees WHERE role = 'admin' LOOP
                    INSERT INTO notifications (employee_fk, title, message, type)
                    VALUES (admin_id, 'Understaffing Alert', message, 'alert');
                END LOOP;
                
                RETURN NEXT;
            END IF;
        END;
    END LOOP;

    -- 2. Check Rotation Conflicts
    FOR asgn IN 
        SELECT aw.*, e.first_name || ' ' || e.last_name as full_name, j.jobsite_name as site_name
        FROM assignment_weeks aw
        JOIN employees e ON aw.employee_id = e.id
        JOIN assignment_items ai ON ai.assignment_week_fk = aw.id
        JOIN jobsites j ON ai.jobsite_fk = j.id
        WHERE aw.week_start = target_week AND j.jobsite_name != 'Rotation'
    LOOP
        is_rot := is_rotation_week(asgn.employee_id, target_week);
        IF is_rot THEN
            conflict_type := 'rotation_conflict';
            jobsite_name := asgn.site_name;
            employee_name := asgn.full_name;
            message := 'Employee ' || asgn.full_name || ' assigned to "' || asgn.site_name || '" should be on rotation for week ' || target_week || '.';
            
            -- Create notifications for admins
            FOR admin_id IN SELECT id FROM employees WHERE role = 'admin' LOOP
                INSERT INTO notifications (employee_fk, title, message, type)
                VALUES (admin_id, 'Rotation Conflict', message, 'warning');
            END LOOP;
            
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Portal Request Approval Handler
CREATE OR REPLACE FUNCTION handle_portal_request_approval(
    req_id UUID, 
    admin_id UUID, 
    action_status TEXT, 
    admin_jobsite_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    req RECORD;
    week_id UUID;
    rot_jobsite_id UUID;
BEGIN
    SELECT * INTO req FROM portal_requests WHERE id = req_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Update request status
    UPDATE portal_requests 
    SET status = action_status, 
        approver_fk = admin_id, 
        approved_at = NOW() 
    WHERE id = req_id;

    IF action_status = 'approved' THEN
        -- Handle Rotation Change
        IF req.request_type = 'rotation_change' THEN
            -- Get rotation jobsite
            SELECT id INTO rot_jobsite_id FROM jobsites WHERE jobsite_name = 'Rotation' LIMIT 1;
            
            -- Find or create the week
            SELECT id INTO week_id FROM assignment_weeks 
            WHERE employee_id = req.employee_fk AND week_start = req.target_week_start;
            
            IF week_id IS NOT NULL THEN
                -- Update the week to be a rotation
                UPDATE assignment_weeks 
                SET assignment_name = 'Rotation', 
                    value_type = 'rotation', 
                    status = 'assigned' 
                WHERE id = week_id;
                
                -- Ensure rotation item exists
                INSERT INTO assignment_items (assignment_week_fk, jobsite_fk, days)
                VALUES (week_id, rot_jobsite_id, ARRAY[1,2,3,4,5])
                ON CONFLICT (assignment_week_fk, jobsite_fk) DO NOTHING;
            END IF;
        END IF;

        -- Handle Jobsite Change
        IF req.request_type = 'jobsite_change' AND admin_jobsite_id IS NOT NULL THEN
            SELECT id INTO week_id FROM assignment_weeks 
            WHERE employee_id = req.employee_fk AND week_start = req.start_date;
            
            IF week_id IS NOT NULL THEN
                -- Update the week
                UPDATE assignment_weeks 
                SET assignment_name = (SELECT jobsite_name FROM jobsites WHERE id = admin_jobsite_id),
                    value_type = 'work',
                    status = 'assigned'
                WHERE id = week_id;
                
                -- Replace assignment items
                DELETE FROM assignment_items WHERE assignment_week_fk = week_id;
                INSERT INTO assignment_items (assignment_week_fk, jobsite_fk, days)
                VALUES (week_id, admin_jobsite_id, ARRAY[1,2,3,4,5]);
            END IF;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Current Schedule View
-- Provides a flattened, joined view of all assignments
CREATE OR REPLACE VIEW v_current_schedule AS
SELECT 
    aw.id as week_id,
    aw.employee_id,
    aw.email as employee_email,
    aw.week_start,
    aw.assignment_name as week_assignment_name,
    aw.status as week_status,
    aw.value_type,
    e.first_name,
    e.last_name,
    e.employee_id_ref,
    e.role as employee_role,
    e.rotation_group,
    ai.id as item_id,
    ai.jobsite_fk as jobsite_id,
    ai.days,
    j.jobsite_name,
    j.customer,
    j.city,
    j.jobsite_group,
    j.internal as is_internal
FROM assignment_weeks aw
JOIN employees e ON aw.employee_id = e.id
LEFT JOIN assignment_items ai ON ai.assignment_week_fk = aw.id
LEFT JOIN jobsites j ON ai.jobsite_fk = j.id
WHERE e.is_active = true;

-- 7. Get Weekly Stats Function
CREATE OR REPLACE FUNCTION get_weekly_stats(target_week DATE)
RETURNS TABLE (
    assigned INTEGER,
    rotation INTEGER,
    vacation INTEGER,
    training INTEGER,
    unassigned INTEGER
) AS $$
DECLARE
    total_active INTEGER;
BEGIN
    SELECT count(*) INTO total_active FROM employees WHERE is_active = true AND role != 'hr';
    
    RETURN QUERY
    SELECT 
        count(DISTINCT employee_id) FILTER (WHERE value_type = 'work')::INTEGER as assigned,
        count(DISTINCT employee_id) FILTER (WHERE value_type = 'rotation')::INTEGER as rotation,
        count(DISTINCT employee_id) FILTER (WHERE value_type = 'vacation')::INTEGER as vacation,
        count(DISTINCT employee_id) FILTER (WHERE value_type = 'personal' OR value_type = 'training')::INTEGER as training,
        (total_active - count(DISTINCT employee_id))::INTEGER as unassigned
    FROM assignment_weeks
    WHERE week_start = target_week;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Get Employee Schedule Function
CREATE OR REPLACE FUNCTION get_employee_schedule(emp_id UUID, start_date DATE, end_date DATE)
RETURNS TABLE (
    week_start DATE,
    jobsite_name TEXT,
    status TEXT,
    days INTEGER[]
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        aw.week_start,
        COALESCE(j.jobsite_name, aw.assignment_name) as jobsite_name,
        aw.status,
        ai.days
    FROM assignment_weeks aw
    LEFT JOIN assignment_items ai ON ai.assignment_week_fk = aw.id
    LEFT JOIN jobsites j ON ai.jobsite_fk = j.id
    WHERE aw.employee_id = emp_id 
      AND aw.week_start >= start_date 
      AND aw.week_start <= end_date
    ORDER BY aw.week_start ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
