import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Jobsite, JobsiteGroup, Employee } from '../types';
import { Layers, Plus, X, Save, Trash2, Users } from 'lucide-react';
import { motion } from 'motion/react';

interface GroupManagerProps {
  jobsites: Jobsite[];
  jobsiteGroups: JobsiteGroup[];
  employees: Employee[];
  onUpdate: () => void;
}

export default function GroupManager({ jobsites, jobsiteGroups, employees, onUpdate }: GroupManagerProps) {
  const [selectedGroup, setSelectedGroup] = useState<JobsiteGroup | null>(null);
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [targetJobsiteId, setTargetJobsiteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Helper to get group name
  const getGroupName = (groupId?: string) => {
    return jobsiteGroups.find(g => g.id === groupId)?.name || 'No Group';
  };

  const handleRemoveFromGroup = async (jobsiteId: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('jobsites')
        .update({ group_id: null, jobsite_group: null })
        .eq('id', jobsiteId);
        
      if (error) throw error;
      
      onUpdate();
      setMessage({ type: 'success', text: 'Jobsite removed from group successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDissolveGroup = async (groupId: string) => {
    // if (!window.confirm('Are you sure you want to dissolve this group? This will make all jobsites in this group individual sites.')) return;
    
    setLoading(true);
    try {
      // DEBUG: Verify group visibility
      const { data: debugGroup, error: debugError } = await supabase
        .from('jobsite_groups')
        .select('*')
        .eq('id', groupId)
        .maybeSingle();
      console.log('DEBUG: Group found in app:', debugGroup, 'Error:', debugError);

      // 1. Remove group_id from jobsites
      const { error: siteError } = await supabase
        .from('jobsites')
        .update({ group_id: null, jobsite_group: null })
        .eq('group_id', groupId);
        
      if (siteError) throw siteError;

      // 2. Delete group
      const { error: groupError } = await supabase
        .from('jobsite_groups')
        .delete()
        .eq('id', groupId);
        
      if (groupError) throw groupError;

      onUpdate();
      setMessage({ type: 'success', text: 'Group dissolved successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'An unexpected error occurred.' });
    } finally {
      setLoading(false);
    }
  };

  const handleReassignAndDissolve = async (groupId: string, targetJobsiteId: string) => {
    setLoading(true);
    try {
      // 1. Get all jobsites in the group
      const { data: groupJobsites, error: fetchError } = await supabase
        .from('jobsites')
        .select('id')
        .eq('group_id', groupId);

      if (fetchError) throw fetchError;

      const sourceJobsiteIds = groupJobsites?.map(j => j.id).filter(id => id !== targetJobsiteId) || [];

      // 2. Reassign employees from source jobsites to target jobsite
      if (sourceJobsiteIds.length > 0) {
        const { error: reassignError } = await supabase
          .from('assignment_items')
          .update({ jobsite_id: targetJobsiteId })
          .in('jobsite_id', sourceJobsiteIds);

        if (reassignError) throw reassignError;
      }

      // 3. Proceed with dissolution
      await handleDissolveGroup(groupId);
      
      setIsReassignModalOpen(false);
      setTargetJobsiteId(null);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Group Manager</h2>
      
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* List Groups */}
        <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Existing Groups</h3>
          <div className="space-y-2">
            {jobsiteGroups.map(group => (
              <div key={group.id} className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-emerald-900/30">
                <span className="text-white font-medium">{group.name}</span>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedGroup(group)} className="text-emerald-500 hover:text-emerald-400">Manage</button>
                  <button type="button" onClick={() => { setSelectedGroup(group); setIsReassignModalOpen(true); }} className="text-amber-500 hover:text-amber-400">Reassign & Dissolve</button>
                  <button type="button" onClick={() => handleDissolveGroup(group.id)} className="text-red-500 hover:text-red-400"><Trash2 size={18} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Reassign & Dissolve Modal */}
        {isReassignModalOpen && selectedGroup && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-6 w-full max-w-md">
              <h3 className="text-lg font-bold text-white mb-4">Reassign & Dissolve: {selectedGroup.name}</h3>
              <p className="text-gray-400 mb-4">Select a target jobsite to reassign employees to before dissolving the group:</p>
              <select 
                className="w-full p-2 bg-black/20 text-white rounded-lg border border-emerald-900/30 mb-4"
                onChange={(e) => setTargetJobsiteId(e.target.value)}
                value={targetJobsiteId || ''}
              >
                <option value="">Select a jobsite</option>
                {jobsites.filter(j => j.group_id === selectedGroup.id).map(site => (
                  <option key={site.id} value={site.id}>{site.jobsite_name}</option>
                ))}
              </select>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setIsReassignModalOpen(false)} className="text-gray-400">Cancel</button>
                <button 
                  onClick={() => targetJobsiteId && handleReassignAndDissolve(selectedGroup.id, targetJobsiteId)}
                  disabled={!targetJobsiteId || loading}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Reassign & Dissolve'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manage Selected Group */}
        <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-6">
          {selectedGroup ? (
            <>
              <h3 className="text-lg font-bold text-white mb-4">Managing: {selectedGroup.name}</h3>
              <p className="text-gray-400 mb-4">Jobsites in this group:</p>
              <div className="space-y-2">
                {jobsites.filter(j => j.group_id === selectedGroup.id).map(site => (
                  <div key={site.id} className="flex items-center justify-between p-3 bg-black/20 rounded-lg">
                    <span className="text-white text-sm">{site.jobsite_name}</span>
                    <button onClick={() => handleRemoveFromGroup(site.id)} className="text-red-500 text-xs hover:text-red-400">Remove</button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center text-gray-500 py-12">Select a group to manage</div>
          )}
        </div>
      </div>
    </div>
  );
}
