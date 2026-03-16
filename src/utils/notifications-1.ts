import { supabase } from '../lib/supabase';

export interface SendNotificationParams {
  employeeId: string;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'alert';
  sendSms?: boolean;
}

/**
 * Utility to send notifications to employees via the portal and optionally SMS.
 */
export async function sendNotification({ 
  employeeId, 
  title, 
  message, 
  type = 'info',
  sendSms = false 
}: SendNotificationParams) {
  try {
    // 1. Save to database for the portal UI
    const { error: dbError } = await supabase
      .from('notifications')
      .insert({
        employee_fk: employeeId,
        title,
        message,
        type,
        read: false
      });

    if (dbError) throw dbError;

    // 2. If SMS requested, trigger SMS service
    if (sendSms) {
      await triggerSmsAlert(employeeId, `${title}: ${message}`);
    }

    return { success: true };
  } catch (err) {
    console.error('Error sending notification:', err);
    return { success: false, error: err };
  }
}

/**
 * Mock SMS service. In a real app, this would call Twilio or a similar API.
 */
async function triggerSmsAlert(employeeId: string, message: string) {
  // Fetch employee phone number
  const { data: employee } = await supabase
    .from('employees')
    .select('first_name, last_name') // Assuming phone field exists or would be added
    .eq('id', employeeId)
    .single();

  if (employee) {
    console.log(`[SMS ALERT] To: ${employee.first_name} ${employee.last_name} | Message: ${message}`);
    // Real implementation:
    // await fetch('/api/sms/send', { method: 'POST', body: JSON.stringify({ to: employee.phone, message }) });
  }
}

import { isRotationWeek } from './rotation';

/**
 * AI-powered workforce optimization logic.
 * Analyzes schedules and flags potential shortages or conflicts.
 */
export async function analyzeWorkforceConflicts(weekStart: string) {
  try {
    // 1. Fetch all jobsites
    const { data: jobsites } = await supabase.from('jobsites').select('*').eq('is_active', true);
    if (!jobsites) return;

    // 2. Fetch all assignments for this week
    const { data: assignments } = await supabase
      .from('assignment_weeks')
      .select('*, items:assignment_items(*)')
      .eq('week_start', weekStart);
    
    // 3. Fetch rotation configs
    const { data: rotations } = await supabase.from('rotation_configs').select('*');
    const rotationMap: Record<string, any> = {};
    rotations?.forEach(r => rotationMap[r.employee_fk] = r);

    const weekDate = new Date(weekStart);

    for (const site of jobsites) {
      const assignedToSite = assignments?.filter(a => 
        a.items?.some((item: any) => item.jobsite_fk === site.id)
      ) || [];

      // Check for understaffing
      const minPersonnel = 2; // Default or from site metadata
      if (assignedToSite.length < minPersonnel) {
        // Find admins to notify
        const { data: admins } = await supabase.from('employees').select('id').eq('role', 'admin');
        for (const admin of admins || []) {
          await sendNotification({
            employeeId: admin.id,
            title: 'Understaffing Alert',
            message: `Jobsite "${site.jobsite_name}" is understaffed for week ${weekStart}. (Current: ${assignedToSite.length}, Min: ${minPersonnel})`,
            type: 'alert'
          });
        }
      }

      // Check for rotation conflicts
      for (const assignment of assignedToSite) {
        const config = rotationMap[assignment.employee_fk];
        if (config && isRotationWeek(weekDate, config)) {
          // Employee is assigned but should be on rotation
          const { data: admins } = await supabase.from('employees').select('id').eq('role', 'admin');
          for (const admin of admins || []) {
            await sendNotification({
              employeeId: admin.id,
              title: 'Rotation Conflict',
              message: `Employee assigned to "${site.jobsite_name}" should be on rotation for week ${weekStart}.`,
              type: 'warning'
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('Error analyzing workforce conflicts:', err);
  }
}
