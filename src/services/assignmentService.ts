import { supabase } from '../lib/supabase';
import { AssignmentWeek, AssignmentItem } from '../types';

export const assignmentService = {
  /**
   * Fetches assignments for a specific employee ID.
   */
  async getAssignmentsByEmployeeId(employeeId: string) {
    const { data, error } = await supabase
      .from('assignment_weeks')
      .select(`
        *,
        assignment_items (
          *,
          jobsites (*)
        )
      `)
      .eq('employee_fk', employeeId)
      .order('week_start', { ascending: true });

    if (error) throw error;
    return data as (AssignmentWeek & { assignment_items: (AssignmentItem & { jobsites: any })[] })[];
  },

  /**
   * Updates the status of an assignment week.
   */
  async updateWeekStatus(weekId: string, status: string) {
    const { error } = await supabase
      .from('assignment_weeks')
      .update({ status })
      .eq('id', weekId);

    if (error) throw error;
  },

  /**
   * Adds a new assignment item to a week.
   */
  async addAssignmentItem(item: Omit<AssignmentItem, 'id' | 'created_at'>) {
    const { data, error } = await supabase
      .from('assignment_items')
      .insert(item)
      .select()
      .single();

    if (error) throw error;
    return data as AssignmentItem;
  },

  /**
   * Removes an assignment item.
   */
  async removeAssignmentItem(itemId: string) {
    const { error } = await supabase
      .from('assignment_items')
      .delete()
      .eq('id', itemId);

    if (error) throw error;
  }
};
