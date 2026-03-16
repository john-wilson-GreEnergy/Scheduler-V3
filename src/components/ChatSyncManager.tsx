import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { initializeChatThreads } from '../utils/chatInitializer';
import {
  MessageSquare, RefreshCw, CheckCircle2, AlertTriangle,
  Clock, Users, Plus, Edit3, Save, X, Info, Play, MessageCirclePlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';

interface SpaceMembership {
  id: string;
  space_id: string;
  group_name: string;
  email: string;
  added_at: string;
}

interface Jobsite {
  id: string;
  jobsite_name: string;
  jobsite_group: string;
  chat_space_id: string | null;
  is_active: boolean;
}

interface SyncResult {
  message: string;
  window?: string;
  added?: number;
  removed?: number;
  skipped?: number;
  errors?: number;
  error?: string;
}

export default function ChatSyncManager() {
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [memberships, setMemberships] = useState<SpaceMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [sitesRes, membersRes] = await Promise.all([
      supabase.from('jobsites').select('id, jobsite_name, jobsite_group, chat_space_id, is_active').eq('is_active', true).order('jobsite_name'),
      supabase.from('chat_space_memberships').select('*').order('added_at', { ascending: false })
    ]);
    if (sitesRes.data) setJobsites(sitesRes.data);
    if (membersRes.data) setMemberships(membersRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  // Deduplicate jobsites by group
  const groupedSites = (() => {
    const groups: Record<string, { groupName: string; sites: Jobsite[]; chat_space_id: string | null }> = {};
    jobsites.forEach(site => {
      const key = site.jobsite_group || site.jobsite_name;
      if (!groups[key]) groups[key] = { groupName: key, sites: [], chat_space_id: site.chat_space_id };
      groups[key].sites.push(site);
      // Use any non-null space ID found in the group
      if (site.chat_space_id) groups[key].chat_space_id = site.chat_space_id;
    });
    return Object.values(groups).sort((a, b) => a.groupName.localeCompare(b.groupName));
  })();

  const configuredCount = groupedSites.filter(g => g.chat_space_id).length;

  const handleSaveSpaceId = async (groupName: string, spaceId: string) => {
    setSaving(true);
    // Update all sites in the group with the same space ID
    const siteIds = jobsites
      .filter(s => (s.jobsite_group || s.jobsite_name) === groupName)
      .map(s => s.id);

    await supabase
      .from('jobsites')
      .update({ chat_space_id: spaceId.trim() || null })
      .in('id', siteIds);

    await fetchData();
    setEditingId(null);
    setEditValue('');
    setSaving(false);
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setLastSyncResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = (supabase as any).supabaseUrl || import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/sync-chat-memberships`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: '{}'
      });
      const result = await res.json();
      setLastSyncResult(result);
    } catch (err: any) {
      setLastSyncResult({ message: 'Failed to reach sync function', error: err.message });
    } finally {
      setSyncing(false);
      fetchData();
    }
  };

  const handleInitializeThreads = async () => {
    setInitializing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const result = await initializeChatThreads(user.id);
      alert(result?.message || 'Threads initialized.');
    } catch (err: any) {
      alert('Failed to initialize threads: ' + err.message);
    } finally {
      setInitializing(false);
      fetchData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <RefreshCw className="text-emerald-500 animate-spin" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-bold text-white">Google Chat Sync</h2>
          <p className="text-gray-500 mt-2">
            Automatically manage jobsite workspace memberships based on assignment schedules.
            Employees are added 14 days before their assignment and removed 14 days after.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleInitializeThreads}
            disabled={initializing}
            className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shrink-0"
          >
            {initializing ? <RefreshCw size={18} className="animate-spin" /> : <MessageCirclePlus size={18} />}
            {initializing ? 'Initializing...' : 'Initialize Chat Threads'}
          </button>
          <button
            onClick={handleManualSync}
            disabled={syncing || configuredCount === 0}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold rounded-2xl transition-all shadow-lg shadow-emerald-500/20 shrink-0"
          >
            {syncing ? <RefreshCw size={18} className="animate-spin" /> : <Play size={18} />}
            {syncing ? 'Syncing...' : 'Run Sync Now'}
          </button>
        </div>
      </div>

      {/* Status banner */}
      <div className={`p-5 rounded-2xl border flex items-start gap-4 ${
        configuredCount === 0
          ? 'bg-amber-500/5 border-amber-500/20'
          : 'bg-emerald-500/5 border-emerald-500/20'
      }`}>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          configuredCount === 0 ? 'bg-amber-500/10 text-amber-400' : 'bg-emerald-500/10 text-emerald-400'
        }`}>
          {configuredCount === 0 ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
        </div>
        <div>
          <p className="font-bold text-white">
            {configuredCount === 0
              ? 'No spaces configured yet'
              : `${configuredCount} of ${groupedSites.length} site groups configured`}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {configuredCount === 0
              ? 'Add a Google Chat Space ID to each jobsite group below to enable automatic sync. Space IDs look like "spaces/XXXXXXXXX".'
              : `Sync runs automatically every Monday at 6:00 AM UTC. You can also trigger it manually above.`}
          </p>
        </div>
      </div>

      {/* Stub notice */}
      <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl flex items-start gap-3">
        <Info size={16} className="text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-blue-300">Google API not yet connected</p>
          <p className="text-xs text-gray-500 mt-0.5">
            The sync engine is built and running. Google Chat API calls are currently stubbed — 
            membership changes are logged but not applied to Google Chat until a service account 
            with domain-wide delegation is configured. Notifications and membership tracking are fully active.
          </p>
        </div>
      </div>

      {/* Last sync result */}
      <AnimatePresence>
        {lastSyncResult && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`p-5 rounded-2xl border ${
              lastSyncResult.error
                ? 'bg-red-500/5 border-red-500/20'
                : 'bg-emerald-500/5 border-emerald-500/20'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              {lastSyncResult.error
                ? <AlertTriangle size={16} className="text-red-400" />
                : <CheckCircle2 size={16} className="text-emerald-400" />}
              <p className="font-bold text-white text-sm">{lastSyncResult.message}</p>
            </div>
            {!lastSyncResult.error && (
              <div className="flex gap-6 text-xs text-gray-400">
                {lastSyncResult.window && <span className="font-mono text-gray-500">{lastSyncResult.window}</span>}
                <span className="text-emerald-400">+{lastSyncResult.added ?? 0} added</span>
                <span className="text-red-400">-{lastSyncResult.removed ?? 0} removed</span>
                <span className="text-gray-500">{lastSyncResult.skipped ?? 0} unchanged</span>
                {(lastSyncResult.errors ?? 0) > 0 && <span className="text-amber-400">{lastSyncResult.errors} errors</span>}
              </div>
            )}
            {lastSyncResult.error && (
              <p className="text-xs text-red-400 mt-1">{lastSyncResult.error}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-5">
          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Site Groups</p>
          <p className="text-3xl font-bold text-white">{groupedSites.length}</p>
        </div>
        <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-5">
          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Spaces Configured</p>
          <p className="text-3xl font-bold text-emerald-400">{configuredCount}</p>
        </div>
        <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-5">
          <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Active Members</p>
          <p className="text-3xl font-bold text-white">{memberships.length}</p>
        </div>
      </div>

      {/* Site group configuration table */}
      <div className="bg-[#0A120F] border border-white/10 rounded-3xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center gap-3">
          <MessageSquare size={18} className="text-emerald-500" />
          <h3 className="font-bold text-white">Jobsite Group → Chat Space Mapping</h3>
        </div>
        <div className="divide-y divide-white/5">
          {groupedSites.map(group => {
            const isEditing = editingId === group.groupName;
            const groupMemberships = memberships.filter(m => m.group_name === group.groupName);
            const isConfigured = !!group.chat_space_id;

            return (
              <div key={group.groupName} className="px-6 py-4">
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isConfigured ? 'bg-emerald-500' : 'bg-gray-700'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-bold text-white">{group.groupName}</p>
                      {group.sites.length > 1 && (
                        <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                          {group.sites.map(s => s.jobsite_name).join(', ')}
                        </span>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          placeholder="spaces/XXXXXXXXX"
                          className="flex-1 bg-black/40 border border-emerald-500/40 rounded-xl px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSaveSpaceId(group.groupName, editValue)}
                          disabled={saving}
                          className="p-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl transition-all"
                        >
                          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        </button>
                        <button
                          onClick={() => { setEditingId(null); setEditValue(''); }}
                          className="p-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-xl transition-all"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs font-mono mt-0.5 text-gray-500">
                        {group.chat_space_id || <span className="text-amber-500/70 not-italic font-sans">No space ID — click edit to configure</span>}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {groupMemberships.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full font-bold">
                        <Users size={10} /> {groupMemberships.length} members
                      </span>
                    )}
                    {!isEditing && (
                      <button
                        onClick={() => { setEditingId(group.groupName); setEditValue(group.chat_space_id || ''); }}
                        className="p-2 hover:bg-white/5 text-gray-500 hover:text-white rounded-xl transition-colors"
                      >
                        {isConfigured ? <Edit3 size={14} /> : <Plus size={14} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Member list for this group */}
                {groupMemberships.length > 0 && !isEditing && (
                  <div className="mt-3 ml-5 flex flex-wrap gap-2">
                    {groupMemberships.map(m => (
                      <span key={m.id} className="text-[10px] bg-white/5 text-gray-400 px-2 py-1 rounded-lg font-mono">
                        {m.email.split('@')[0]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Setup instructions */}
      <div className="bg-[#0A120F] border border-white/5 rounded-3xl p-6 space-y-4">
        <h3 className="font-bold text-white flex items-center gap-2">
          <Info size={16} className="text-emerald-500" />
          Setup Instructions — When You Have Admin Access
        </h3>
        <div className="space-y-3 text-sm text-gray-400">
          {[
            { step: '1', text: 'In Google Cloud Console, create a project and enable the Google Chat API.' },
            { step: '2', text: 'Create a service account and download the JSON key. Store the key contents as a Supabase secret named GOOGLE_SERVICE_ACCOUNT_JSON.' },
            { step: '3', text: 'In Google Workspace Admin, grant domain-wide delegation to the service account with scope: https://www.googleapis.com/auth/chat.memberships' },
            { step: '4', text: 'Create one Google Chat Space per jobsite group. Copy the Space ID from the URL (spaces/XXXXXXXXX) and paste it above.' },
            { step: '5', text: 'In supabase/functions/sync-chat-memberships/index.ts, replace the two STUB functions (addMemberToSpace, removeMemberFromSpace) with real API calls using the service account token.' },
            { step: '6', text: 'Run the SQL migration file (supabase/migrations/chat_space_memberships.sql) to enable the Monday cron schedule.' },
          ].map(({ step, text }) => (
            <div key={step} className="flex gap-3">
              <span className="w-6 h-6 bg-emerald-500/10 text-emerald-400 rounded-lg flex items-center justify-center text-xs font-bold shrink-0">{step}</span>
              <p className="leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
