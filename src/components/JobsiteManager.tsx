import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Jobsite } from '../types';
import { Search, MapPin, ToggleLeft, ToggleRight, Edit2, Save, X, Trash2, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { logActivity } from '../lib/logger';

interface JobsiteManagerProps {
  jobsites: Jobsite[];
  onUpdate: (silent?: boolean) => void;
}

export default function JobsiteManager({ jobsites: initialJobsites, onUpdate }: JobsiteManagerProps) {
  const [jobsites, setJobsites] = useState<Jobsite[]>(initialJobsites);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Jobsite>>({});
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    setJobsites(initialJobsites);
  }, [initialJobsites]);

  const filteredJobsites = jobsites.filter(j => 
    j.jobsite_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    j.customer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    j.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    // Optimistic update
    const newStatus = !currentStatus;
    setJobsites(prev => prev.map(j => j.id === id ? { ...j, is_active: newStatus } : j));

    try {
      const { error } = await supabase
        .from('jobsites')
        .update({ is_active: newStatus })
        .eq('id', id);

      if (error) throw error;
      
      // Silent update to sync with server without flash
      onUpdate(true);
      
      const site = jobsites.find(j => j.id === id);
      logActivity('jobsite_toggle', {
        jobsite_id: id,
        name: site?.jobsite_name,
        new_status: newStatus
      });
      
      setMessage({ type: 'success', text: `Jobsite ${newStatus ? 'activated' : 'deactivated'} successfully.` });
    } catch (err: any) {
      // Rollback on error
      setJobsites(prev => prev.map(j => j.id === id ? { ...j, is_active: currentStatus } : j));
      setMessage({ type: 'error', text: err.message });
    }
  };

  const startEditing = (site: Jobsite) => {
    setEditingId(site.id);
    setEditForm(site);
  };

  const handleSave = async () => {
    if (!editingId) return;
    setLoading(true);
    try {
      const { min_staffing, ...payload } = editForm;
      
      // Ensure required fields have defaults if missing
      if (!payload.full_address) {
        payload.full_address = [payload.city, payload.state].filter(Boolean).join(', ') || 'TBD';
      }
      if (!payload.zip) payload.zip = '00000';
      if (!payload.city) payload.city = 'TBD';
      if (!payload.state) payload.state = 'TBD';
      if (!payload.jobsite_name) payload.jobsite_name = 'Unnamed Jobsite';
      if (!payload.customer) payload.customer = 'Unknown Customer';

      // Remove empty strings for optional fields that might have unique constraints
      if (payload.jobsite_id_ref === '') delete payload.jobsite_id_ref;
      if (payload.jobsite_alias === '') delete payload.jobsite_alias;

      const { error } = await supabase
        .from('jobsites')
        .update(payload)
        .eq('id', editingId);

      if (error) throw error;
      setEditingId(null);
      onUpdate();
      
      logActivity('safety_score_update', {
        jobsite_id: editingId,
        name: editForm.jobsite_name,
        new_score: editForm.safety_score
      });

      setMessage({ type: 'success', text: 'Jobsite updated successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    setLoading(true);
    try {
      const { min_staffing, ...payload } = editForm;
      
      // Ensure required fields have defaults if missing
      if (!payload.full_address) {
        payload.full_address = [payload.city, payload.state].filter(Boolean).join(', ') || 'TBD';
      }
      if (!payload.zip) payload.zip = '00000';
      if (!payload.city) payload.city = 'TBD';
      if (!payload.state) payload.state = 'TBD';
      if (!payload.jobsite_name) payload.jobsite_name = 'Unnamed Jobsite';
      if (!payload.customer) payload.customer = 'Unknown Customer';

      // Remove empty strings for optional fields that might have unique constraints
      if (payload.jobsite_id_ref === '') delete payload.jobsite_id_ref;
      if (payload.jobsite_alias === '') delete payload.jobsite_alias;

      const { error } = await supabase
        .from('jobsites')
        .insert([payload]);

      if (error) throw error;
      setIsAdding(false);
      setEditForm({});
      onUpdate();
      setMessage({ type: 'success', text: 'Jobsite added successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this jobsite? This may affect historical assignments.')) return;
    try {
      const { error } = await supabase
        .from('jobsites')
        .delete()
        .eq('id', id);

      if (error) throw error;
      onUpdate();
      setMessage({ type: 'success', text: 'Jobsite deleted successfully.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            placeholder="Search jobsites, customers, or cities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-black/20 border border-emerald-900/30 rounded-2xl text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
        <button
          onClick={() => {
            setIsAdding(true);
            setEditForm({ is_active: true });
          }}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-black font-bold rounded-2xl hover:bg-emerald-400 transition-colors"
        >
          <Plus size={18} />
          Add Jobsite
        </button>
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-2xl flex items-center gap-3 ${
            message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}
        >
          {message.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <p className="text-sm font-medium">{message.text}</p>
          <button onClick={() => setMessage(null)} className="ml-auto">
            <X size={14} />
          </button>
        </motion.div>
      )}

      <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className="border-bottom border-emerald-900/30 bg-[#0A120F]">
                <th className="px-6 py-4 text-xs font-bold text-emerald-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-emerald-500 uppercase tracking-wider">Jobsite Name</th>
                <th className="px-6 py-4 text-xs font-bold text-emerald-500 uppercase tracking-wider">Customer</th>
                <th className="px-6 py-4 text-xs font-bold text-emerald-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-4 text-xs font-bold text-emerald-500 uppercase tracking-wider">Coordinates</th>
                <th className="px-6 py-4 text-xs font-bold text-emerald-500 uppercase tracking-wider">Staffing</th>
                <th className="px-6 py-4 text-xs font-bold text-emerald-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/10">
              <AnimatePresence mode="popLayout">
                {isAdding && (
                  <motion.tr
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-emerald-500/5"
                  >
                    <td className="px-6 py-4">
                      <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-500">
                        <Plus size={20} />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Jobsite ID</label>
                          <input
                            type="text"
                            placeholder="e.g. SITE-001"
                            value={editForm.jobsite_id_ref || ''}
                            onChange={(e) => setEditForm({ ...editForm, jobsite_id_ref: e.target.value })}
                            className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Jobsite Name</label>
                          <input
                            type="text"
                            placeholder="e.g. Main Substation"
                            value={editForm.jobsite_name || ''}
                            onChange={(e) => setEditForm({ ...editForm, jobsite_name: e.target.value })}
                            className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Customer</label>
                          <input
                            type="text"
                            placeholder="e.g. Idaho Power"
                            value={editForm.customer || ''}
                            onChange={(e) => setEditForm({ ...editForm, customer: e.target.value })}
                            className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Jobsite Group</label>
                          <input
                            type="text"
                            placeholder="e.g. Regional Grid"
                            value={editForm.jobsite_group || ''}
                            onChange={(e) => setEditForm({ ...editForm, jobsite_group: e.target.value })}
                            className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-3">
                        <div>
                          <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">City</label>
                          <input
                            type="text"
                            placeholder="City"
                            value={editForm.city || ''}
                            onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                            className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">State</label>
                          <input
                            type="text"
                            placeholder="State"
                            value={editForm.state || ''}
                            onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                            className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Zip Code</label>
                          <input
                            type="text"
                            placeholder="Zip"
                            value={editForm.zip || ''}
                            onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })}
                            className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Lat</label>
                            <input
                              type="number"
                              placeholder="Lat"
                              step="any"
                              value={editForm.lat || ''}
                              onChange={(e) => setEditForm({ ...editForm, lat: parseFloat(e.target.value) })}
                              className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Lng</label>
                            <input
                              type="number"
                              placeholder="Lng"
                              step="any"
                              value={editForm.lng || ''}
                              onChange={(e) => setEditForm({ ...editForm, lng: parseFloat(e.target.value) })}
                              className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Safety Score</label>
                          <input
                            type="number"
                            placeholder="0-100"
                            min="0"
                            max="100"
                            value={editForm.safety_score || ''}
                            onChange={(e) => setEditForm({ ...editForm, safety_score: parseInt(e.target.value) })}
                            className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Min Staffing</label>
                        <input
                          type="number"
                          placeholder="Default: 2"
                          min="1"
                          value={editForm.min_staffing || ''}
                          onChange={(e) => setEditForm({ ...editForm, min_staffing: parseInt(e.target.value) })}
                          className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={handleAdd} disabled={loading} className="p-2 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400">
                          <Save size={16} />
                        </button>
                        <button onClick={() => setIsAdding(false)} className="p-2 bg-white/5 text-gray-400 rounded-lg hover:text-white">
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                )}

                {filteredJobsites.map((site) => (
                  <motion.tr
                    key={site.id}
                    layout
                    className={`group hover:bg-white/5 transition-colors ${!site.is_active ? 'opacity-60' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <button
                        onClick={() => handleToggleActive(site.id, site.is_active)}
                        className={`transition-colors ${site.is_active ? 'text-emerald-500' : 'text-gray-600'}`}
                      >
                        {site.is_active ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      {editingId === site.id ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Jobsite ID</label>
                            <input
                              type="text"
                              placeholder="ID"
                              value={editForm.jobsite_id_ref || ''}
                              onChange={(e) => setEditForm({ ...editForm, jobsite_id_ref: e.target.value })}
                              className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Jobsite Name</label>
                            <input
                              type="text"
                              placeholder="Name"
                              value={editForm.jobsite_name || ''}
                              onChange={(e) => setEditForm({ ...editForm, jobsite_name: e.target.value })}
                              className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-bold text-white">{site.jobsite_name}</p>
                          <p className="text-xs text-gray-500">{site.jobsite_id_ref || site.id.slice(0, 8)}</p>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingId === site.id ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Customer</label>
                            <input
                              type="text"
                              placeholder="Customer"
                              value={editForm.customer || ''}
                              onChange={(e) => setEditForm({ ...editForm, customer: e.target.value })}
                              className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Jobsite Group</label>
                            <input
                              type="text"
                              placeholder="Group"
                              value={editForm.jobsite_group || ''}
                              onChange={(e) => setEditForm({ ...editForm, jobsite_group: e.target.value })}
                              className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm text-gray-400">{site.customer || '—'}</p>
                          {site.jobsite_group && <p className="text-[10px] text-emerald-500/50 uppercase tracking-wider">{site.jobsite_group}</p>}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingId === site.id ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">City</label>
                            <input
                              type="text"
                              placeholder="City"
                              value={editForm.city || ''}
                              onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                              className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">State</label>
                            <input
                              type="text"
                              placeholder="State"
                              value={editForm.state || ''}
                              onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                              className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Zip Code</label>
                            <input
                              type="text"
                              placeholder="Zip"
                              value={editForm.zip || ''}
                              onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })}
                              className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <MapPin size={14} className="text-emerald-500/50" />
                          {site.city && site.state ? `${site.city}, ${site.state}` : 'No location'}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingId === site.id ? (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Lat</label>
                              <input
                                type="number"
                                step="any"
                                value={editForm.lat || ''}
                                onChange={(e) => setEditForm({ ...editForm, lat: parseFloat(e.target.value) })}
                                className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Lng</label>
                              <input
                                type="number"
                                step="any"
                                value={editForm.lng || ''}
                                onChange={(e) => setEditForm({ ...editForm, lng: parseFloat(e.target.value) })}
                                className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Safety Score</label>
                            <input
                              type="number"
                              placeholder="Safety"
                              min="0"
                              max="100"
                              value={editForm.safety_score || ''}
                              onChange={(e) => setEditForm({ ...editForm, safety_score: parseInt(e.target.value) })}
                              className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs font-mono text-gray-500">
                          {site.lat && site.lng ? (
                            <span className="text-emerald-500/70">{site.lat.toFixed(4)}, {site.lng.toFixed(4)}</span>
                          ) : (
                            <span className="text-red-500/50 italic">Missing Coords</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {editingId === site.id ? (
                        <div>
                          <label className="block text-[10px] font-bold text-emerald-500 uppercase tracking-wider mb-1">Min Staffing</label>
                          <input
                            type="number"
                            placeholder="Min Staffing"
                            min="1"
                            value={editForm.min_staffing || ''}
                            onChange={(e) => setEditForm({ ...editForm, min_staffing: parseInt(e.target.value) })}
                            className="w-full bg-black/40 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400">
                          <span className="text-emerald-500 font-bold">{site.min_staffing || 2}</span>
                          <span className="text-[10px] ml-1 uppercase tracking-wider opacity-50">Required</span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {editingId === site.id ? (
                          <>
                            <button onClick={handleSave} disabled={loading} className="p-2 bg-emerald-500 text-black rounded-lg hover:bg-emerald-400">
                              <Save size={16} />
                            </button>
                            <button onClick={() => setEditingId(null)} className="p-2 bg-white/5 text-gray-400 rounded-lg hover:text-white">
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEditing(site)} className="p-2 bg-white/5 text-gray-400 rounded-lg hover:text-white hover:bg-emerald-500/20">
                              <Edit2 size={16} />
                            </button>
                            <button onClick={() => handleDelete(site.id)} className="p-2 bg-white/5 text-gray-400 rounded-lg hover:text-red-500 hover:bg-red-500/20">
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {filteredJobsites.length === 0 && (
          <div className="p-12 text-center">
            <MapPin size={48} className="mx-auto text-emerald-900/30 mb-4" />
            <p className="text-gray-500">No jobsites found matching your search.</p>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-3xl">
          <p className="text-emerald-500 text-xs font-bold uppercase tracking-wider mb-1">Total Jobsites</p>
          <p className="text-3xl font-bold text-white">{jobsites.length}</p>
        </div>
        <div className="bg-blue-500/5 border border-blue-500/20 p-6 rounded-3xl">
          <p className="text-blue-500 text-xs font-bold uppercase tracking-wider mb-1">Geocoded</p>
          <p className="text-3xl font-bold text-white">{jobsites.filter(j => j.lat && j.lng).length}</p>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 p-6 rounded-3xl">
          <p className="text-amber-500 text-xs font-bold uppercase tracking-wider mb-1">Active Contracts</p>
          <p className="text-3xl font-bold text-white">{jobsites.filter(j => j.is_active).length}</p>
        </div>
      </div>
    </div>
  );
}
