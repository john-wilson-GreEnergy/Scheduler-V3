import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Users, 
  MapPin, 
  Calendar, 
  Shield, 
  Clock,
  ArrowRight,
  Command,
  ChevronRight,
  LayoutGrid,
  History,
  Activity,
  MessageSquare,
  Megaphone,
  TrendingUp,
  BarChart3,
  Layers,
  Map as MapIcon,
  User,
  Building2,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { Employee, Jobsite } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  category: 'Navigation' | 'Management' | 'System' | 'Employees' | 'Jobsites';
  subtitle?: string;
  tabId?: string;
}

export default function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      fetchSearchData();
    } else {
      setQuery('');
    }
  }, [isOpen]);

  const fetchSearchData = async () => {
    setLoading(true);
    try {
      const [empRes, siteRes] = await Promise.all([
        supabase.from('employees').select('id, first_name, last_name, job_title, email').eq('is_active', true).limit(50),
        supabase.from('jobsites').select('id, jobsite_name, city, state').eq('is_active', true).limit(50)
      ]);
      if (empRes.data) setEmployees(empRes.data as any);
      if (siteRes.data) setJobsites(siteRes.data as any);
    } catch (err) {
      console.error('Error fetching search data:', err);
    } finally {
      setLoading(false);
    }
  };

  const staticCommands: CommandItem[] = [
    // Navigation
    { id: 'dashboard', label: 'Dashboard Overview', icon: <Calendar size={16} />, category: 'Navigation', tabId: 'dashboard' },
    { id: 'scheduler', label: 'Workforce Scheduler', icon: <Calendar size={16} />, category: 'Navigation', tabId: 'dashboard' },
    { id: 'map', label: 'Map View Portal', icon: <MapIcon size={16} />, category: 'Navigation', tabId: 'map' },
    { id: 'manpower', label: 'Manpower Distribution', icon: <LayoutGrid size={16} />, category: 'Navigation', tabId: 'manpower' },
    
    // Management
    { id: 'employees-nav', label: 'Employee Directory', icon: <Users size={16} />, category: 'Management', tabId: 'employees' },
    { id: 'jobsites-nav', label: 'Jobsite Management', icon: <MapPin size={16} />, category: 'Management', tabId: 'jobsites' },
    { id: 'requests', label: 'Pending Requests', icon: <Clock size={16} />, category: 'Management', tabId: 'requests' },
    { id: 'rotations', label: 'Rotation Planning', icon: <RefreshCw size={16} />, category: 'Management', tabId: 'rotations' },
    
    // System
    { id: 'analytics', label: 'Operations Analytics', icon: <BarChart3 size={16} />, category: 'System', tabId: 'analytics' },
    { id: 'health', label: 'Data Health Monitor', icon: <Activity size={16} />, category: 'System', tabId: 'health' },
    { id: 'logs', label: 'System Audit Logs', icon: <History size={16} />, category: 'System', tabId: 'logs' },
    { id: 'chatsync', label: 'Chat Sync Status', icon: <MessageSquare size={16} />, category: 'System', tabId: 'chatsync' },
  ];

  const dynamicCommands: CommandItem[] = [
    ...employees.map(emp => ({
      id: `emp-${emp.id}`,
      label: `${emp.first_name} ${emp.last_name}`,
      subtitle: emp.job_title,
      icon: <User size={16} />,
      category: 'Employees' as const,
      tabId: 'employees'
    })),
    ...jobsites.map(site => ({
      id: `site-${site.id}`,
      label: site.jobsite_name,
      subtitle: `${site.city}, ${site.state}`,
      icon: <Building2 size={16} />,
      category: 'Jobsites' as const,
      tabId: 'jobsites'
    }))
  ];

  const allCommands = [...staticCommands, ...dynamicCommands];

  const filteredCommands = allCommands.filter(cmd => 
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.subtitle?.toLowerCase().includes(query.toLowerCase()) ||
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  const categories = ['Navigation', 'Management', 'Employees', 'Jobsites', 'System'] as const;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -20 }}
        className="relative w-full max-w-2xl bg-[#0A120F] border border-emerald-900/30 rounded-3xl shadow-2xl overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-white/5 flex items-center gap-4">
          <Search className="text-emerald-500" size={20} />
          <input 
            ref={inputRef}
            type="text"
            placeholder="Search commands, employees, or jobsites..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-white text-lg placeholder:text-gray-600"
          />
          <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg border border-white/5 text-[10px] font-bold text-gray-500">
            <Command size={10} />
            <span>K</span>
          </div>
        </div>

        <div className="flex-1 max-h-[450px] overflow-y-auto p-2 custom-scrollbar">
          {filteredCommands.length > 0 ? (
            <div className="space-y-4 p-2">
              {categories.map(category => {
                const catCmds = filteredCommands.filter(c => c.category === category);
                if (catCmds.length === 0) return null;
                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 px-3 mb-2">
                      <h4 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">{category}</h4>
                      <div className="h-px flex-1 bg-white/5" />
                    </div>
                    <div className="space-y-1">
                      {catCmds.map(cmd => (
                        <button
                          key={cmd.id}
                          onClick={() => {
                            if (cmd.tabId) onNavigate(cmd.tabId);
                            onClose();
                          }}
                          className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-emerald-500/10 group transition-all text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-500 group-hover:text-emerald-500 group-hover:bg-emerald-500/10 transition-all">
                              {cmd.icon}
                            </div>
                            <div>
                              <span className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors block">
                                {cmd.label}
                              </span>
                              {cmd.subtitle && (
                                <span className="text-[10px] text-gray-600 group-hover:text-emerald-500/70 transition-colors uppercase tracking-wider font-bold">
                                  {cmd.subtitle}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-gray-700 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-600">
                <Search size={32} />
              </div>
              <p className="text-gray-500 text-sm">No results found for "{query}"</p>
              <p className="text-[10px] text-gray-700 mt-2 uppercase tracking-widest font-bold">Try searching for "Dashboard" or "John Doe"</p>
            </div>
          )}
        </div>

        <div className="p-4 bg-black/20 border-t border-white/5 flex items-center justify-between text-[10px] text-gray-600 font-bold uppercase tracking-widest">
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded border border-white/5">
              <ArrowRight size={10} /> 
              <span>Select</span>
            </span>
            <span className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded border border-white/5">
              <span>ESC</span>
              <span>Close</span>
            </span>
          </div>
          <div className="text-emerald-500/30 flex items-center gap-2">
            <Shield size={10} />
            <span>GreEnergy Workforce OS v2.5</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

