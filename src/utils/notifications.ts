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

import { analyzeWorkforceConflictsBackend } from '../lib/supabase_functions';

/**
 * AI-powered workforce optimization logic.
 * Analyzes schedules and flags potential shortages or conflicts.
 * Now uses the backend logic for consistency.
 */
export async function analyzeWorkforceConflicts(weekStart: string) {
  try {
    const conflicts = await analyzeWorkforceConflictsBackend(weekStart);
    console.log(`[CONFLICT ANALYSIS] Week: ${weekStart} | Found ${conflicts?.length || 0} issues.`);
    return conflicts;
  } catch (err) {
    console.error('Error analyzing workforce conflicts:', err);
    return [];
  }
}
