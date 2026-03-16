-- SQL to delete rows from assignment_weeks where assignment_name matches an employee's full name
DELETE FROM assignment_weeks
WHERE EXISTS (
    SELECT 1
    FROM employees
    WHERE assignment_weeks.assignment_name = (employees.first_name || ' ' || employees.last_name)
);
