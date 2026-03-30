import { supabase } from './supabase';

/**
 * Fetches the current schedule for a given week from the backend view.
 */
export async function fetchCurrentScheduleBackend(weekStart: string, options: { employeeId?: string, gte?: string, lt?: string, lte?: string, limit?: number, order?: { column: string, ascending: boolean } } = {}) {
  try {
    let query = supabase
      .from('assignment_weeks')
      .select(`
        id,
        employee_fk,
        week_start,
        status,
        assignment_type,
        assignment_items (
          jobsite_fk,
          days,
          jobsites (
            jobsite_name
          )
        )
      `);

    if (weekStart && !options.gte && !options.lte) {
      query = query.eq('week_start', weekStart);
    }
    
    if (options.employeeId) {
      if (options.employeeId.includes(',')) {
        query = query.in('employee_fk', options.employeeId.split(','));
      } else {
        query = query.eq('employee_fk', options.employeeId);
      }
    }
    
    if (options.gte) {
      query = query.gte('week_start', options.gte);
    }
    
    if (options.lt) {
      query = query.lt('week_start', options.lt);
    }
    
    if (options.lte) {
      query = query.lte('week_start', options.lte);
    }
    
    if (options.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending });
    }
    
    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
      
    if (error) {
      console.error('Error fetching current schedule from backend:', error);
      return [];
    }
    
    // Flatten the data to match the expected view structure
    const flattenedData: any[] = [];
    data?.forEach((week: any) => {
      if (!week.assignment_items || week.assignment_items.length === 0) {
        flattenedData.push({
          id: week.id,
          employee_fk: week.employee_fk,
          week_start: week.week_start,
          status: week.status,
          assignment_type: week.assignment_type,
          jobsite_fk: null,
          jobsite_id: null,
          days: [],
          jobsite_name: null
        });
      } else {
        week.assignment_items.forEach((item: any) => {
          flattenedData.push({
            id: week.id,
            employee_fk: week.employee_fk,
            week_start: week.week_start,
            status: week.status,
            assignment_type: week.assignment_type,
            jobsite_fk: item.jobsite_fk,
            jobsite_id: item.jobsite_fk,
            days: item.days,
            jobsite_name: item.jobsites?.jobsite_name
          });
        });
      }
    });
    
    return flattenedData;
  } catch (err) {
    console.error('Unexpected error in fetchCurrentScheduleBackend:', err);
    return [];
  }
}

/**
 * Assigns an employee to a jobsite for a specific week.
 */
export async function assignEmployeeToJobsiteBackend(
  employeeId: string, 
  jobsiteId: string, 
  weekStart: string, 
  days: string[]
) {
  try {
    // 1. Ensure an assignment_week exists for this employee and week
    const { data: weekData, error: weekError } = await supabase
      .from('assignment_weeks')
      .select('id')
      .eq('employee_fk', employeeId)
      .eq('week_start', weekStart)
      .single();
      
    let weekId = weekData?.id;
    
    if (weekError && weekError.code === 'PGRST116') {
      // Not found, create it
      const { data: newWeek, error: createError } = await supabase
        .from('assignment_weeks')
        .insert({
          employee_fk: employeeId,
          week_start: weekStart,
          status: 'active'
        })
        .select('id')
        .single();
        
      if (createError) throw createError;
      weekId = newWeek.id;
    } else if (weekError) {
      throw weekError;
    }
    
    // 2. Create/Update assignment items
    // This is a simplified version. Real logic might involve deleting old items.
    const { error: itemError } = await supabase
      .from('assignment_items')
      .upsert({
        assignment_week_fk: weekId,
        jobsite_fk: jobsiteId,
        days: days
      });
      
    if (itemError) throw itemError;
    
    return { success: true };
  } catch (err) {
    console.error('Error in assignEmployeeToJobsiteBackend:', err);
    return { success: false, error: err };
  }
}

/**
 * AI-powered workforce optimization logic.
 * Analyzes schedules and flags potential shortages or conflicts.
 */
export async function analyzeWorkforceConflictsBackend(weekStart: string) {
  try {
    // This would typically be a complex query or an AI call.
    // For now, we'll return an empty array or basic validation.
    return [];
  } catch (err) {
    console.error('Error in analyzeWorkforceConflictsBackend:', err);
    return [];
  }
}
