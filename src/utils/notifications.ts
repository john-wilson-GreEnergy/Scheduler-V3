import { supabase } from '../lib/supabase';

export interface SendNotificationParams {
  employeeId: string;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'alert';
  sendEmail?: boolean;
  emailData?: {
    updateType?: string;
    jobsiteName?: string;
    weekStartDate?: string;
    previousAssignment?: string;
    newAssignment?: string;
    travelDate?: string;
    customEmailBody?: string;
  };
}

/**
 * Utility to send notifications to employees via the portal and optionally Email.
 */
export async function sendNotification({ 
  employeeId, 
  title, 
  message, 
  type = 'info',
  sendEmail = false,
  emailData
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

    // 2. If Email requested, trigger Email service
    if (sendEmail) {
      await triggerEmailAlert(employeeId, title, message, emailData);
    }

    return { success: true };
  } catch (err) {
    console.error('Error sending notification:', err);
    return { success: false, error: err };
  }
}

/**
 * Real Email service using Resend API.
 */
async function triggerEmailAlert(
  employeeId: string, 
  title: string, 
  message: string,
  emailData?: SendNotificationParams['emailData']
) {
  const { data: employee } = await supabase
    .from('employees')
    .select('email, first_name, last_name')
    .eq('id', employeeId)
    .single();

  if (!employee?.email) return;

  try {
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: employee.email,
        subject: `[GreEnergy Scheduler] ${title}`,
        employeeName: `${employee.first_name} ${employee.last_name}`,
        updateDetails: emailData?.customEmailBody || message,
        ...emailData
      }),
    });
    
    const result = await response.json();
    if (!result.success) {
      console.error('Failed to send email:', result.error);
    } else {
      console.log(`[EMAIL SENT] To: ${employee.email} | Subject: ${title}`);
    }
  } catch (err) {
    console.error('Error calling email API:', err);
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
