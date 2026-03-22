import { supabase } from '../lib/supabase';
import { Employee } from '../types';
import { format, addWeeks, startOfWeek } from 'date-fns';
import { isRotationWeek } from './rotation';

export async function generateAssignmentWeeksForEmployee(employee: Employee, weeks: number = 104, startDate?: Date) {
  const start = startDate || startOfWeek(new Date(), { weekStartsOn: 1 });
  const updates = [];
  
  const { data: jobsites } = await supabase.from('jobsites').select('id, jobsite_name');
  
  for (let i = 0; i < weeks; i++) {
    const week = addWeeks(start, i);
    const weekStr = format(week, 'yyyy-MM-dd');
    
    const isRotation = isRotationWeek(week, employee.rotation_config, employee.rotation_group);
    
    updates.push({
      employee_id: employee.id,
      email: employee.email,
      week_start: weekStr,
      assignment_name: isRotation ? 'Rotation' : null,
      value_type: isRotation ? 'rotation' : 'work',
      status: isRotation ? 'assigned' : 'unassigned',
      first_name: employee.first_name,
      last_name: employee.last_name
    });
  }

  if (updates.length > 0) {
    const { error } = await supabase
      .from('assignment_weeks')
      .upsert(updates);
    
    if (error) throw error;

    // Fetch IDs for the inserted weeks
    const { data: weeksData, error: fetchError } = await supabase
      .from('assignment_weeks')
      .select('id, week_start, assignment_name')
      .eq('employee_id', employee.id)
      .in('week_start', updates.map(u => u.week_start));
    
    if (fetchError) throw fetchError;

    // Insert assignment_items
    const items = weeksData.map(week => {
      const jobsite = jobsites.find(j => j.jobsite_name === week.assignment_name);
      return {
        assignment_week_fk: week.id,
        jobsite_fk: jobsite?.id || null,
        days: [1, 2, 3, 4, 5]
      };
    }).filter(item => item.jobsite_fk);

    if (items.length > 0) {
      const { error: itemError } = await supabase
        .from('assignment_items')
        .upsert(items);
      
      if (itemError) throw itemError;
    }
  }
}
