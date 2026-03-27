import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Announcement, PortalAction } from '../types';
import { sendNotification } from '../utils/notifications';
import { 
  Megaphone, 
  Link as LinkIcon, 
  ClipboardCheck, 
  RefreshCw,
  Plus, 
  Trash2, 
  Edit3, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  X,
  Save,
  Calendar,
  ExternalLink,
  ChevronRight,
  Search,
  Filter,
  LayoutGrid,
  List as ListIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, addDays, startOfWeek } from 'date-fns';
import { IconComponent } from './PortalComponents';

export default function PortalContentManager() {
  const [activeTab, setActiveTab] = useState<'all' | 'announcements' | 'actions' | 'links'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [actions, setActions] = useState<PortalAction[]>([]);
  const [requiredActions, setRequiredActions] = useState<PortalAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [schedulingMode, setSchedulingMode] = useState<'custom' | 'weeks'>('custom');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchData = async () => {
    setLoading(true);
    const [annRes, actRes, reqRes] = await Promise.all([
      supabase.from('announcements').select('*').order('created_at', { ascending: false }),
      supabase.from('portal_actions').select('*').order('sort_order', { ascending: true }),
      supabase.from('portal_required_actions').select('*').order('sort_order', { ascending: true })
    ]);

    if (annRes.data) setAnnouncements(annRes.data);
    if (actRes.data) setActions(actRes.data);
    if (reqRes.data) setRequiredActions(reqRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (editingItem) {
      setSchedulingMode(editingItem.scheduling_mode || 'custom');
    } else {
      setSchedulingMode('custom');
    }
  }, [editingItem]);

  const handleSaveAnnouncement = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    let start_date = formData.get('start_date') as string;
    let end_date = formData.get('end_date') as string;

    if (schedulingMode === 'weeks') {
      const weeks = parseInt(formData.get('weeks_count') as string) || 1;
      const today = new Date();
      const startOfWeekDate = startOfWeek(today, { weekStartsOn: 1 }); // Monday
      start_date = format(startOfWeekDate, 'yyyy-MM-dd');
      end_date = format(addDays(startOfWeekDate, weeks * 7), 'yyyy-MM-dd');
    }

    const data = {
      title: formData.get('title') as string,
      message: formData.get('message') as string,
      start_date: start_date || null,
      end_date: end_date || null,
      active: formData.get('active') === 'on',
      scheduling_mode: schedulingMode,
      weeks_count: schedulingMode === 'weeks' ? parseInt(formData.get('weeks_count') as string) : null,
      is_reminder: formData.get('is_reminder') === 'on'
    };

    try {
      if (editingItem) {
        await supabase.from('announcements').update(data).eq('id', editingItem.id);
      } else {
        const { data: newAnn, error: insertError } = await supabase.from('announcements').insert(data).select().single();
        if (insertError) throw insertError;
      }
      fetchData();
      setIsModalOpen(false);
      setEditingItem(null);
    } catch (err) {
      console.error('Error saving announcement:', err);
    }
  };

  const handleSaveAction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const priority = formData.get('priority') as 'high' | 'low' || (activeTab === 'actions' ? 'high' : 'low');
    const table = priority === 'high' ? 'portal_required_actions' : 'portal_actions';

    const data = {
      title: formData.get('title') as string,
      description: formData.get('description') as string,
      url: formData.get('url') as string,
      icon: formData.get('icon') as string,
      category: formData.get('category') as string,
      priority: priority,
      active: formData.get('active') === 'on',
      start_date: formData.get('start_date') as string || null,
      end_date: formData.get('end_date') as string || null,
      sort_order: parseInt(formData.get('sort_order') as string) || 0,
      open_in_new_tab: formData.get('open_in_new_tab') === 'on',
      recurrence_type: formData.get('recurrence_type') as string || 'none',
      recurrence_interval: parseInt(formData.get('recurrence_interval') as string) || 1,
      recurrence_day: parseInt(formData.get('recurrence_day') as string) || 1,
      duration_days: parseInt(formData.get('duration_days') as string) || 7,
      automated: formData.get('automated') === 'on',
      embed_in_portal: formData.get('embed_in_portal') === 'on'
    };

    try {
      if (editingItem) {
        // If priority changed, we might need to move between tables, but for simplicity we'll just update the current table
        // or handle the move if priority changed.
        const originalTable = editingItem.priority === 'high' ? 'portal_required_actions' : 'portal_actions';
        
        if (originalTable !== table) {
          // Move between tables
          await supabase.from(originalTable).delete().eq('id', editingItem.id);
          await supabase.from(table).insert(data);
        } else {
          await supabase.from(table).update(data).eq('id', editingItem.id);
        }
      } else {
        await supabase.from(table).insert(data);
      }
      fetchData();
      setIsModalOpen(false);
      setEditingItem(null);
    } catch (err) {
      console.error('Error saving portal action:', err);
    }
  };

  const handleDelete = async (id: string, table: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      await supabase.from(table).delete().eq('id', id);
      fetchData();
    } catch (err) {
      console.error('Error deleting item:', err);
    }
  };

  const toggleActive = async (id: string, currentActive: boolean, table: string) => {
    try {
      await supabase.from(table).update({ active: !currentActive }).eq('id', id);
      fetchData();
    } catch (err) {
      console.error('Error toggling active status:', err);
    }
  };

  const filteredAnnouncements = announcements.filter(a => {
    const matchesSearch = a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         a.message.toLowerCase().includes(searchTerm.toLowerCase());
    if (activeTab === 'all') return matchesSearch;
    return activeTab === 'announcements' && matchesSearch;
  });

  const filteredActions = actions.filter(a => {
    const matchesSearch = a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         a.description.toLowerCase().includes(searchTerm.toLowerCase());
    if (activeTab === 'all') return matchesSearch;
    
    if (activeTab === 'links') {
      return matchesSearch;
    }
    return false;
  });

  const filteredRequiredActions = requiredActions.filter(a => {
    const matchesSearch = a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         a.description.toLowerCase().includes(searchTerm.toLowerCase());
    if (activeTab === 'all') return matchesSearch;
    
    if (activeTab === 'actions') {
      return matchesSearch;
    }
    return false;
  });

  const allItems = [
    ...filteredAnnouncements.map(a => ({ ...a, type: 'announcement' })),
    ...filteredActions.map(a => ({ ...a, type: 'action' })),
    ...filteredRequiredActions.map(a => ({ ...a, type: 'required_action' }))
  ].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  const displayItems = activeTab === 'all' 
    ? allItems 
    : (activeTab === 'announcements' 
        ? filteredAnnouncements 
        : (activeTab === 'actions' ? filteredRequiredActions : filteredActions));

  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-bold text-white">Portal Content</h2>
          <p className="text-gray-500 mt-2">Manage announcements, links, and required actions for the employee portal</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={fetchData}
            className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-emerald-500 transition-all"
            title="Refresh Content"
          >
            <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
          </button>
          <button 
            onClick={() => {
              setEditingItem(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-2xl transition-all shadow-lg shadow-emerald-500/20"
          >
            <Plus size={20} />
            <span>Add {activeTab === 'announcements' ? 'Announcement' : activeTab === 'actions' ? 'Action' : activeTab === 'links' ? 'Link' : 'Item'}</span>
          </button>
        </div>
      </div>

      {/* Tabs & View Toggle */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1 bg-white/5 rounded-2xl w-fit overflow-x-auto">
          {[
            { id: 'all', label: 'All Content', icon: <Filter size={16} /> },
            { id: 'announcements', label: 'Announcements', icon: <Megaphone size={16} /> },
            { id: 'actions', label: 'Required Actions', icon: <ClipboardCheck size={16} /> },
            { id: 'links', label: 'GreEnergy Links', icon: <LinkIcon size={16} /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeTab === tab.id 
                  ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                  : 'text-gray-500 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 p-1 bg-white/5 rounded-2xl w-fit">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2.5 rounded-xl transition-all ${
              viewMode === 'grid' 
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                : 'text-gray-500 hover:text-white hover:bg-white/5'
            }`}
            title="Grid View"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-2.5 rounded-xl transition-all ${
              viewMode === 'list' 
                ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20' 
                : 'text-gray-500 hover:text-white hover:bg-white/5'
            }`}
            title="List View"
          >
            <ListIcon size={18} />
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
        <input 
          type="text" 
          placeholder="Search items..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-[#0A120F] border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-all"
        />
      </div>

      {/* Content Area */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayItems.map((item: any) => {
            const isAnnouncement = 'message' in item || item.type === 'announcement';
            return (
              <motion.div 
                layout
                key={item.id}
                className={`bg-[#0A120F] border rounded-3xl p-6 flex flex-col h-full transition-all ${
                  item.active ? 'border-white/10' : 'border-white/5 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isAnnouncement 
                      ? (item.level === 'high' ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500')
                      : (item.type === 'required_action' || item.priority === 'high' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500')
                  }`}>
                    {isAnnouncement ? `${item.level} Priority` : item.category}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setEditingItem(item); setIsModalOpen(true); setActiveTab(isAnnouncement ? 'announcements' : (item.priority === 'high' || item.type === 'required_action' ? 'actions' : 'links')); }} className="p-2 hover:bg-white/5 text-gray-400 hover:text-white rounded-lg transition-colors"><Edit3 size={14} /></button>
                    <button onClick={() => handleDelete(item.id, isAnnouncement ? 'announcements' : (item.priority === 'high' || item.type === 'required_action' ? 'portal_required_actions' : 'portal_actions'))} className="p-2 hover:bg-white/5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
                
                <div className="flex items-start gap-4 mb-4">
                  {!isAnnouncement && (
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 shrink-0">
                      <IconComponent name={item.icon} className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">{item.title}</h3>
                    <p className="text-sm text-gray-500 line-clamp-2">{isAnnouncement ? item.message : item.description}</p>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-white/5 flex items-center justify-between text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                  <div className="flex items-center gap-2">
                    <Clock size={12} />
                    <span>
                      {item.schedule_type && item.schedule_type !== 'none' ? (
                        <span className="text-emerald-500">{item.schedule_type.replace(/_/g, ' ')} ({item.duration_days || 7}d)</span>
                      ) : item.recurrence_type && item.recurrence_type !== 'none' ? (
                        <span className="text-blue-500">{item.recurrence_type} (Day {item.recurrence_day}, {item.duration_days || 7}d)</span>
                      ) : (
                        <>
                          {item.start_date ? format(new Date(item.start_date), 'MMM d') : 'Always'} 
                          {item.end_date ? ` - ${format(new Date(item.end_date), 'MMM d')}` : ''}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${item.active ? 'bg-emerald-500' : 'bg-gray-700'}`} />
                    <span>{item.active ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#0A120F] border border-white/10 rounded-3xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-white/10">
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Type</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Title</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Category/Priority</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Date Range</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {displayItems.map((item: any) => {
                const isAnnouncement = 'message' in item || item.type === 'announcement';
                return (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-4">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isAnnouncement ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                      }`}>
                        {isAnnouncement ? <Megaphone size={14} /> : <IconComponent name={item.icon} className="w-4 h-4" />}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-white text-sm">{item.title}</div>
                      <div className="text-xs text-gray-500 line-clamp-1 mt-0.5">{isAnnouncement ? item.message : item.description}</div>
                    </td>
                    <td className="px-6 py-4">
                      {isAnnouncement ? (
                        <span className="text-gray-500 text-xs italic">N/A</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-500/10 text-blue-500">
                          {item.category}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400 font-mono">
                      {isAnnouncement ? (
                        item.scheduling_mode === 'weeks' ? (
                          <span className="text-emerald-500 font-bold uppercase text-[10px]">Scheduled ({item.weeks_count || 1} Weeks)</span>
                        ) : item.start_date ? (
                          `${format(new Date(item.start_date), 'MMM d, yyyy')} - ${item.end_date ? format(new Date(item.end_date), 'MMM d, yyyy') : 'No End'}`
                        ) : (
                          'Always Active'
                        )
                      ) : (
                        item.schedule_type && item.schedule_type !== 'none' ? (
                          <span className="text-emerald-500 font-bold uppercase text-[10px]">{item.schedule_type.replace(/_/g, ' ')} ({item.duration_days || 7}D)</span>
                        ) : item.recurrence_type && item.recurrence_type !== 'none' ? (
                          <span className="text-blue-500 font-bold uppercase text-[10px]">{item.recurrence_type} (Day {item.recurrence_day}, {item.duration_days || 7}D)</span>
                        ) : item.start_date ? (
                          `${format(new Date(item.start_date), 'MMM d, yyyy')} - ${item.end_date ? format(new Date(item.end_date), 'MMM d, yyyy') : 'No End'}`
                        ) : (
                          'Always Active'
                        )
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => toggleActive(item.id, item.active, isAnnouncement ? 'announcements' : (item.priority === 'high' || item.type === 'required_action' ? 'portal_required_actions' : 'portal_actions'))}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider hover:opacity-80 transition-opacity"
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${item.active ? 'bg-emerald-500' : 'bg-gray-700'}`} />
                        <span className={item.active ? 'text-emerald-500' : 'text-gray-600'}>{item.active ? 'Active' : 'Inactive'}</span>
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingItem(item); setIsModalOpen(true); setActiveTab(isAnnouncement ? 'announcements' : (item.priority === 'high' || item.type === 'required_action' ? 'actions' : 'links')); }} className="p-2 hover:bg-white/5 text-gray-400 hover:text-white rounded-lg transition-colors"><Edit3 size={14} /></button>
                        <button onClick={() => handleDelete(item.id, isAnnouncement ? 'announcements' : (item.priority === 'high' || item.type === 'required_action' ? 'portal_required_actions' : 'portal_actions'))} className="p-2 hover:bg-white/5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {displayItems.length === 0 && (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-gray-600 mx-auto mb-4">
                <Search size={32} />
              </div>
              <p className="text-gray-500 font-bold">No items found matching your criteria</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl max-h-[90vh] bg-[#0A120F] border border-emerald-900/30 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
            >
              <form onSubmit={activeTab === 'announcements' ? handleSaveAnnouncement : handleSaveAction} className="flex flex-col min-h-0">
                <div className="p-6 border-b border-white/5 flex items-center justify-between bg-emerald-500/5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                      {activeTab === 'announcements' ? <Megaphone size={20} /> : <ClipboardCheck size={20} />}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        {editingItem ? 'Edit' : 'New'} {activeTab === 'announcements' ? 'Announcement' : 'Portal Item'}
                      </h3>
                      <p className="text-xs text-emerald-500/70 uppercase font-bold tracking-wider">Portal Content Configuration</p>
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingItem(null);
                    }}
                    className="p-2 hover:bg-white/5 rounded-xl text-gray-500 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2 col-span-2">
                      <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Title</label>
                      <input 
                        name="title"
                        type="text"
                        defaultValue={editingItem?.title || ''}
                        required
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>

                    {activeTab === 'announcements' ? (
                      <>
                        <div className="space-y-2 col-span-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Scheduling Mode</label>
                          <div className="flex gap-4">
                            <button
                              type="button"
                              onClick={() => setSchedulingMode('custom')}
                              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${schedulingMode === 'custom' ? 'bg-emerald-500 text-black' : 'bg-black/40 text-gray-400'}`}
                            >
                              Custom Dates
                            </button>
                            <button
                              type="button"
                              onClick={() => setSchedulingMode('weeks')}
                              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all ${schedulingMode === 'weeks' ? 'bg-emerald-500 text-black' : 'bg-black/40 text-gray-400'}`}
                            >
                              Scheduled Duration (Weeks)
                            </button>
                          </div>
                        </div>

                        {schedulingMode === 'weeks' ? (
                          <div className="space-y-2 col-span-2">
                            <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Number of Weeks</label>
                            <input 
                              name="weeks_count"
                              type="number"
                              min="1"
                              defaultValue={editingItem?.weeks_count || 1}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="space-y-2">
                              <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Start Date</label>
                              <input 
                                name="start_date"
                                type="date"
                                defaultValue={editingItem?.start_date || ''}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">End Date</label>
                              <input 
                                name="end_date"
                                type="date"
                                defaultValue={editingItem?.end_date || ''}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                              />
                            </div>
                          </>
                        )}
                        <div className="space-y-2 col-span-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Message</label>
                          <textarea 
                            name="message"
                            defaultValue={editingItem?.message || ''}
                            required
                            rows={3}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all resize-none"
                          />
                        </div>
                        <div className="flex items-center gap-3 pt-6">
                          <input 
                            name="is_reminder"
                            type="checkbox"
                            defaultChecked={editingItem?.is_reminder ?? false}
                            className="w-4 h-4 rounded border-white/10 bg-black/40 text-emerald-500 focus:ring-emerald-500"
                          />
                          <label className="text-xs text-gray-400">Mark as Action Reminder</label>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2 col-span-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Description</label>
                          <textarea 
                            name="description"
                            defaultValue={editingItem?.description || ''}
                            required
                            rows={2}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all resize-none"
                          />
                        </div>
                        <div className="space-y-2 col-span-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Target URL</label>
                          <input 
                            name="url"
                            type="url"
                            defaultValue={editingItem?.url || ''}
                            required
                            placeholder="https://..."
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Icon Name (Lucide)</label>
                          <input 
                            name="icon"
                            type="text"
                            defaultValue={editingItem?.icon || 'Link'}
                            placeholder="e.g. ExternalLink, Globe..."
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                          />
                          <p className="text-[9px] text-gray-600 mt-1">
                            Common icons: ExternalLink, Globe, FileText, Layout, Mail, Phone, Truck, Users, Calendar, ClipboardCheck, Construction, Info, AlertTriangle
                          </p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Type / Priority</label>
                          <select 
                            name="priority"
                            defaultValue={editingItem?.priority || (activeTab === 'actions' ? 'high' : 'low')}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all appearance-none"
                          >
                            <option value="high">Required Action (High Priority)</option>
                            <option value="low">GreEnergy Link (Low Priority)</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Category</label>
                          <input 
                            name="category"
                            type="text"
                            defaultValue={editingItem?.category || 'General'}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Sort Order</label>
                          <input 
                            name="sort_order"
                            type="number"
                            defaultValue={editingItem?.sort_order || 0}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Recurrence Type</label>
                          <select 
                            name="recurrence_type"
                            defaultValue={editingItem?.recurrence_type || 'none'}
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all appearance-none"
                          >
                            <option value="none">One-time / Manual</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Recurrence Settings</label>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[9px] text-gray-600 uppercase font-bold ml-1">Every (Interval)</label>
                              <input 
                                name="recurrence_interval"
                                type="number"
                                placeholder="e.g. 1"
                                defaultValue={editingItem?.recurrence_interval || 1}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] text-gray-600 uppercase font-bold ml-1">On Day</label>
                              <input 
                                name="recurrence_day"
                                type="number"
                                placeholder="e.g. 1"
                                defaultValue={editingItem?.recurrence_day || 1}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                              />
                            </div>
                          </div>
                          <div className="space-y-1 mt-4">
                            <label className="text-[9px] text-gray-600 uppercase font-bold ml-1">Duration (Days Active)</label>
                            <input 
                              name="duration_days"
                              type="number"
                              placeholder="e.g. 7"
                              defaultValue={editingItem?.duration_days || 7}
                              className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                            />
                          </div>
                          <p className="text-[9px] text-gray-600 mt-1 px-1">
                            Monthly: Day 1-31. Weekly: Day 0-6 (0=Sun, 1=Mon).
                          </p>
                        </div>
                        <div className="flex items-center gap-3 pt-6">
                          <input 
                            name="automated"
                            type="checkbox"
                            defaultChecked={editingItem?.automated ?? false}
                            className="w-4 h-4 rounded border-white/10 bg-black/40 text-emerald-500 focus:ring-emerald-500"
                          />
                          <label className="text-xs text-gray-400">Auto-generate Reminders</label>
                        </div>
                        <div className="flex items-center gap-3 pt-6">
                          <input 
                            name="open_in_new_tab"
                            type="checkbox"
                            defaultChecked={editingItem?.open_in_new_tab ?? true}
                            className="w-4 h-4 rounded border-white/10 bg-black/40 text-emerald-500 focus:ring-emerald-500"
                          />
                          <label className="text-xs text-gray-400">Open in new tab</label>
                        </div>
                        <div className="flex items-center gap-3 pt-2">
                          <input 
                            name="embed_in_portal"
                            type="checkbox"
                            defaultChecked={editingItem?.embed_in_portal ?? false}
                            className="w-4 h-4 rounded border-white/10 bg-black/40 text-emerald-500 focus:ring-emerald-500"
                          />
                          <label className="text-xs text-gray-400">Embed directly in portal (Iframe)</label>
                        </div>
                      </>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Start Date</label>
                      <input 
                        name="start_date"
                        type="date"
                        defaultValue={editingItem?.start_date || ''}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">End Date</label>
                      <input 
                        name="end_date"
                        type="date"
                        defaultValue={editingItem?.end_date || ''}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                      />
                    </div>
                    <div className="flex items-center gap-3 pt-6">
                      <input 
                        name="active"
                        type="checkbox"
                        defaultChecked={editingItem?.active ?? true}
                        className="w-4 h-4 rounded border-white/10 bg-black/40 text-emerald-500 focus:ring-emerald-500"
                      />
                      <label className="text-xs text-gray-400">Active / Visible</label>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-black/40 border-t border-white/5 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setEditingItem(null);
                    }}
                    className="px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold text-white transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-sm font-bold text-black transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                  >
                    <Save size={18} />
                    <span>{editingItem ? 'Update' : 'Create'} Item</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
