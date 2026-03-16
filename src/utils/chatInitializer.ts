import { supabase } from '../lib/supabase';

export async function initializeChatThreads(userId: string) {
  // 1. Get all active jobsites
  const { data: jobsites, error: jobsitesError } = await supabase
    .from('jobsites')
    .select('id, jobsite_name, jobsite_group')
    .eq('is_active', true);

  if (jobsitesError) throw jobsitesError;
  if (!jobsites) return;

  // 2. Get all jobsite groups that already have messages
  const { data: existingMessages, error: messagesError } = await supabase
    .from('chat_messages')
    .select('jobsite_id, jobsite_group');

  if (messagesError) throw messagesError;

  const jobsitesWithMessages = new Set(existingMessages?.map(m => m.jobsite_id).filter(Boolean));
  const groupsWithMessages = new Set(existingMessages?.map(m => m.jobsite_group).filter(Boolean));

  // 3. Identify jobsites/groups without messages
  const jobsitesToInitialize = jobsites.filter(js => !jobsitesWithMessages.has(js.id));
  
  // For groups, we want to initialize if the group itself has no messages
  const groupsToInitialize = Array.from(new Set(jobsites.map(js => js.jobsite_group).filter(Boolean)))
    .filter(group => !groupsWithMessages.has(group));

  if (jobsitesToInitialize.length === 0 && groupsToInitialize.length === 0) {
    return { message: 'All active jobsites and groups already have chat threads.' };
  }

  // 4. Insert welcome messages
  const newMessages = [
    ...jobsitesToInitialize.map(js => ({
      user_id: userId,
      user_name: 'System',
      content: `Welcome to the crew chat for ${js.jobsite_name}!`,
      jobsite_id: js.id,
      jobsite_group: js.jobsite_group, // Associate with group if it exists
      created_at: new Date().toISOString(),
    })),
    ...groupsToInitialize.map(group => ({
      user_id: userId,
      user_name: 'System',
      content: `Welcome to the crew chat for ${group}!`,
      jobsite_group: group,
      created_at: new Date().toISOString(),
    }))
  ];

  const { error: insertError } = await supabase
    .from('chat_messages')
    .insert(newMessages);

  if (insertError) throw insertError;

  return { message: `Initialized ${newMessages.length} new chat threads.` };
}
