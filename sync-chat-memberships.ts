// Supabase Edge Function: sync-chat-memberships
// Runs on cron every Monday at 6:00 AM, or manually triggered from Admin portal.
//
// Workflow:
// 1. For each jobsite group, find all employees assigned within the 14-day window
//    (current week Monday -14 days  →  current week Monday +14 days)
// 2. Diff against chat_space_memberships table (current tracked state)
// 3. Add new members  → call addMemberToSpace() + write notification
// 4. Remove stale members → call removeMemberFromSpace() + write notification
// 5. Update chat_space_memberships to reflect new state
//
// Google Chat API calls are STUBBED. When you have service account credentials,
// replace the stub functions at the bottom with real API calls.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUFFER_DAYS = 14;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─────────────────────────────────────────────────────────────
// STUBBED Google Chat API functions
// Replace these with real implementations once you have:
//   - A Google Cloud service account JSON key (store in Supabase secrets)
//   - Domain-wide delegation granted by your Google Workspace admin
//   - Chat API enabled in Google Cloud Console
// ─────────────────────────────────────────────────────────────

async function addMemberToSpace(spaceId: string, userEmail: string): Promise<boolean> {
  // STUB — log and return true to simulate success
  console.log(`[STUB] ADD ${userEmail} to space ${spaceId}`);
  // Real implementation:
  // const token = await getServiceAccountToken();
  // const res = await fetch(`https://chat.googleapis.com/v1/${spaceId}/members`, {
  //   method: 'POST',
  //   headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ member: { name: `users/${userEmail}`, type: 'HUMAN' } })
  // });
  // return res.ok;
  return true;
}

async function removeMemberFromSpace(spaceId: string, membershipName: string): Promise<boolean> {
  // STUB — log and return true to simulate success
  console.log(`[STUB] REMOVE membership ${membershipName} from space ${spaceId}`);
  // Real implementation:
  // const token = await getServiceAccountToken();
  // const res = await fetch(`https://chat.googleapis.com/v1/${membershipName}`, {
  //   method: 'DELETE',
  //   headers: { Authorization: `Bearer ${token}` }
  // });
  // return res.ok;
  return true;
}

// ─────────────────────────────────────────────────────────────
// Main sync logic
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Allow manual trigger via POST from Admin portal
  // Cron trigger also hits this endpoint (no body needed)
  try {
    const result = await runSync();
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (err: any) {
    console.error('Sync failed:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500
    });
  }
});

async function runSync() {
  const now = new Date();
  // Current week Monday
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const windowStart = new Date(monday);
  windowStart.setDate(monday.getDate() - BUFFER_DAYS);

  const windowEnd = new Date(monday);
  windowEnd.setDate(monday.getDate() + BUFFER_DAYS);

  const windowStartStr = windowStart.toISOString().split('T')[0];
  const windowEndStr = windowEnd.toISOString().split('T')[0];

  console.log(`Sync window: ${windowStartStr} → ${windowEndStr}`);

  // 1. Get all active jobsite groups that have a chat_space_id configured
  const { data: jobsites } = await supabase
    .from('jobsites')
    .select('id, jobsite_name, jobsite_group, chat_space_id, customer')
    .eq('is_active', true)
    .not('chat_space_id', 'is', null);

  if (!jobsites || jobsites.length === 0) {
    return { message: 'No jobsites with chat_space_id configured. Add chat_space_id to jobsites table to enable sync.', synced: 0 };
  }

  // Deduplicate by group (treat group as one space)
  const groupMap: Record<string, { spaceId: string; groupName: string; sites: any[] }> = {};
  for (const site of jobsites) {
    const key = site.jobsite_group || site.jobsite_name;
    if (!groupMap[key]) {
      groupMap[key] = { spaceId: site.chat_space_id, groupName: key, sites: [] };
    }
    groupMap[key].sites.push(site);
  }

  // 2. Get all assignment_items in the window
  const { data: assignments } = await supabase
    .from('assignment_items')
    .select(`
      assignment_type,
      assignment_weeks!inner(
        week_start,
        employees!fk_assignment_weeks_employee(email)
      )
    `)
    .gte('assignment_weeks.week_start', windowStartStr)
    .lte('assignment_weeks.week_start', windowEndStr);

  if (!assignments) return { message: 'No assignments found in window', synced: 0 };

  // 3. Get all employees for email → id + name lookup
  const { data: employees } = await supabase
    .from('employees')
    .select('id, email, first_name, last_name')
    .eq('is_active', true);

  const employeeByEmail: Record<string, any> = {};
  (employees || []).forEach(e => { employeeByEmail[e.email] = e; });

  // 4. Get current tracked memberships
  const { data: currentMemberships } = await supabase
    .from('chat_space_memberships')
    .select('*');

  const membershipMap: Record<string, any> = {};
  (currentMemberships || []).forEach(m => {
    membershipMap[`${m.space_id}:${m.email}`] = m;
  });

  const stats = { added: 0, removed: 0, skipped: 0, errors: 0 };

  // 5. For each group space, compute desired members and diff
  for (const [groupName, { spaceId, sites }] of Object.entries(groupMap)) {
    // Find all emails assigned to this group within the window
    const desiredEmails = new Set<string>(
      assignments
        .filter(a => {
          const type = a.assignment_type?.toLowerCase() || '';
          return type === groupName.toLowerCase() ||
            sites.some(s =>
              type === s.jobsite_name?.toLowerCase() ||
              type === s.jobsite_group?.toLowerCase()
            );
        })
        .map(a => (a.assignment_weeks as any)?.employees?.email)
        .filter(Boolean)
    );

    // Current tracked members for this space
    const currentEmails = new Set<string>(
      (currentMemberships || [])
        .filter(m => m.space_id === spaceId)
        .map(m => m.email)
    );

    // Add members who should be in but aren't
    for (const email of desiredEmails) {
      if (currentEmails.has(email)) { stats.skipped++; continue; }

      const emp = employeeByEmail[email];
      if (!emp) continue;

      const success = await addMemberToSpace(spaceId, email);
      if (success) {
        // Track in DB
        await supabase.from('chat_space_memberships').insert({
          space_id: spaceId,
          group_name: groupName,
          employee_id: emp.id,
          email,
          added_at: new Date().toISOString()
        });

        // Write portal notification
        await supabase.from('notifications').insert({
          employee_fk: emp.id,
          title: `Added to ${groupName} workspace`,
          message: `You've been added to the ${groupName} Google Chat space. You'll have access for 14 days after your last assignment there.`,
          type: 'info',
          read: false
        });

        stats.added++;
        console.log(`Added ${email} to ${groupName}`);
      } else {
        stats.errors++;
      }
    }

    // Remove members who are no longer in the window
    for (const email of currentEmails) {
      if (desiredEmails.has(email)) continue;

      const membership = membershipMap[`${spaceId}:${email}`];
      if (!membership) continue;

      const success = await removeMemberFromSpace(spaceId, membership.membership_name || spaceId);
      if (success) {
        await supabase
          .from('chat_space_memberships')
          .delete()
          .eq('space_id', spaceId)
          .eq('email', email);

        const emp = employeeByEmail[email];
        if (emp) {
          await supabase.from('notifications').insert({
            employee_fk: emp.id,
            title: `Removed from ${groupName} workspace`,
            message: `Your access to the ${groupName} Google Chat space has ended as you are no longer assigned there.`,
            type: 'info',
            read: false
          });
        }

        stats.removed++;
        console.log(`Removed ${email} from ${groupName}`);
      } else {
        stats.errors++;
      }
    }
  }

  // Log the sync run to activity_log
  await supabase.from('activity_log').insert({
    event_type: 'chat_sync',
    details: {
      window_start: windowStartStr,
      window_end: windowEndStr,
      ...stats
    }
  });

  return {
    message: 'Sync complete',
    window: `${windowStartStr} → ${windowEndStr}`,
    ...stats
  };
}
