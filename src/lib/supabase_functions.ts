import { supabase } from './supabase';
import { Employee, RotationConfig, PortalRequest } from '../types';

/**
 * GreEnergy Backend Function Wrappers
 * These call the PostgreSQL functions defined in backend_logic.sql
 */

/**
 * Checks if a specific date is a rotation week for an employee.
 * This uses the backend logic to ensure consistency across all platforms.
 */
export async function isRotationWeekBackend(employeeId: string, date: string | Date): Promise<boolean> {
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
  
  const { data, error } = await supabase.rpc('is_rotation_week', {
    emp_id: employeeId,
    check_date: dateStr
  });

  if (error) {
    console.error('Error calling is_rotation_week RPC:', error);
    return false;
  }

  return !!data;
}

/**
 * Synchronizes an employee's assignments based on their rotation logic.
 * This should be called whenever a rotation config or group is updated.
 */
export async function syncEmployeeAssignmentsBackend(employeeId: string, startDate?: string, weeksCount: number = 52) {
  const start = startDate || new Date().toISOString().split('T')[0];
  
  const { error } = await supabase.rpc('sync_employee_assignments', {
    emp_id: employeeId,
    start_date: start,
    weeks_count: weeksCount
  });

  if (error) {
    console.error('Error calling sync_employee_assignments RPC:', error);
    throw error;
  }

  return { success: true };
}

/**
 * Analyzes workforce conflicts for a specific week and generates notifications.
 */
export async function analyzeWorkforceConflictsBackend(weekStart: string) {
  const { data, error } = await supabase.rpc('analyze_workforce_conflicts', {
    target_week: weekStart
  });

  if (error) {
    console.error('Error calling analyze_workforce_conflicts RPC:', error);
    throw error;
  }

  return data;
}

/**
 * Assigns an employee to a jobsite for a specific week.
 * Centralizes the assignment, logging, and notification logic in the database.
 */
export async function assignEmployeeToJobsiteBackend(
  employeeId: string,
  jobsiteId: string,
  weekStart: string,
  adminId: string,
  days: number[] = [1, 2, 3, 4, 5]
) {
  const { error } = await supabase.rpc('assign_employee_to_jobsite', {
    emp_id: employeeId,
    site_id: jobsiteId,
    target_week: weekStart,
    admin_id: adminId,
    days_arr: days
  });

  if (error) {
    console.error('Error calling assign_employee_to_jobsite RPC:', error);
    throw error;
  }

  return { success: true };
}

/**
 * Fetches the current schedule for a specific week using the v_current_schedule view.
 */
export async function fetchCurrentScheduleBackend(weekStart: string) {
  const { data, error } = await supabase
    .from('v_current_schedule')
    .select('*')
    .eq('week_start', weekStart);

  if (error) {
    console.error('Error fetching v_current_schedule:', error);
    throw error;
  }

  return data;
}

/**
 * Fetches weekly stats (assigned, rotation, etc.) for a specific week.
 */
export async function getWeeklyStatsBackend(targetWeek: string) {
  const { data, error } = await supabase.rpc('get_weekly_stats', {
    target_week: targetWeek
  });

  if (error) {
    console.error('Error calling get_weekly_stats RPC:', error);
    throw error;
  }

  return data?.[0] || { assigned: 0, rotation: 0, vacation: 0, training: 0, unassigned: 0 };
}

/**
 * Fetches the schedule for a specific employee over a date range.
 */
export async function getEmployeeScheduleBackend(employeeId: string, startDate: string, endDate: string) {
  const { data, error } = await supabase.rpc('get_employee_schedule', {
    emp_id: employeeId,
    start_date: startDate,
    end_date: endDate
  });

  if (error) {
    console.error('Error calling get_employee_schedule RPC:', error);
    throw error;
  }

  return data;
}

/**
 * Handles the approval or denial of a portal request.
 * This updates the request status and the schedule in a single transaction.
 */
export async function handlePortalRequestApprovalBackend(
  requestId: string, 
  adminId: string, 
  status: 'approved' | 'denied', 
  jobsiteId?: string
) {
  const { error } = await supabase.rpc('handle_portal_request_approval', {
    req_id: requestId,
    admin_id: adminId,
    action_status: status,
    admin_jobsite_id: jobsiteId || null
  });

  if (error) {
    console.error('Error calling handle_portal_request_approval RPC:', error);
    throw error;
  }

  return { success: true };
}
