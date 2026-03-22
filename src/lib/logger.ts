import { supabase } from './supabase';

export type LogEventType = 
  | 'jobsite_toggle' 
  | 'employee_toggle' 
  | 'request_approved' 
  | 'request_denied' 
  | 'assignment_update'
  | 'rotation_update'
  | 'bulk_assignment'
  | 'BulkAssignments'
  | 'safety_score_update'
  | 'employee_update'
  | 'employee_create'
  | 'employee_remove'
  | 'employee_nuclear_delete'
  | 'action_completed'
  | 'action_confirmed'
  | 'batch_update_roles'
  | 'chat_sync';

export async function logActivity(
  eventType: LogEventType,
  details: any,
  actorId?: string
) {
  try {
    // If no actorId provided, try to get current user
    let finalActorId = actorId;
    if (!finalActorId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: employee } = await supabase
          .from('employees')
          .select('id')
          .eq('auth_user_id', user.id)
          .maybeSingle();
        if (employee) finalActorId = employee.id;
      }
    }

    const { error } = await supabase
      .from('activity_log')
      .insert({
        actor_fk: finalActorId,
        event_type: eventType,
        details: details
      });

    if (error) console.error('Error logging activity:', error);
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}
