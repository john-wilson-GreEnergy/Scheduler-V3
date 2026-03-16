import React, { useState, useEffect, useMemo } from 'react';
import { 
  Clock, 
  User, 
  MapPin, 
  Shield, 
  AlertCircle, 
  CheckCircle2,
  Search,
  Filter,
  ArrowDown,
  RefreshCw
} from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';

interface LogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  category: 'security' | 'scheduling' | 'system' | 'data';
  status: 'success' | 'warning' | 'error';
  details: string;
}

export default function SystemLogs() {
  const [query, setQuery] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_log')
        .select(`
          *,
          actor:employees(*)
        `)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const mappedLogs: LogEntry[] = (data || []).map(log => ({
        id: log.id,
        timestamp: log.created_at,
        user: log.actor ? `${log.actor.first_name} ${log.actor.last_name}` : 'System',
        action: log.event_type.replace(/_/g, ' ').toUpperCase(),
        category: log.event_type.includes('security') ? 'security' : 
                  log.event_type.includes('toggle') ? 'data' : 'system',
        status: 'success',
        details: JSON.stringify(log.details)
      }));

      setLogs(mappedLogs);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const filteredLogs = logs.filter(log => 
    log.action.toLowerCase().includes(query.toLowerCase()) ||
    log.user.toLowerCase().includes(query.toLowerCase()) ||
    log.details.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">System Activity</h2>
          <p className="text-gray-500 text-sm">Audit trail of all administrative and system actions.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text"
              placeholder="Filter logs..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-all w-64"
            />
          </div>
          <button 
            onClick={fetchLogs}
            className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-emerald-500 transition-all"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-400 hover:text-white transition-all">
            <Filter size={18} />
          </button>
        </div>
      </div>

      <div className="bg-[#0A120F] border border-emerald-900/20 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/5 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredLogs.map((log) => (
                <motion.tr 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={log.id} 
                  className="hover:bg-white/[0.02] transition-colors group"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Clock size={12} />
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center text-[10px] font-bold text-emerald-500">
                        {log.user.charAt(0)}
                      </div>
                      <span className="text-xs text-white font-medium">{log.user}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-white font-bold">{log.action}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <CategoryIcon category={log.category} />
                      <span className="text-[10px] text-gray-500 uppercase font-bold">{log.category}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={log.status} />
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className="text-xs text-gray-500 max-w-xs ml-auto truncate group-hover:text-gray-300 transition-colors">
                      {log.details}
                    </p>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 bg-black/20 border-t border-white/5 flex items-center justify-center">
          <button className="text-[10px] font-bold text-gray-500 hover:text-white flex items-center gap-2 transition-colors">
            <ArrowDown size={12} />
            Load More Activity
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryIcon({ category }: { category: LogEntry['category'] }) {
  switch (category) {
    case 'security': return <Shield size={12} className="text-purple-500" />;
    case 'scheduling': return <Clock size={12} className="text-emerald-500" />;
    case 'system': return <Clock size={12} className="text-blue-500" />;
    case 'data': return <Shield size={12} className="text-amber-500" />;
    default: return null;
  }
}

function StatusBadge({ status }: { status: LogEntry['status'] }) {
  switch (status) {
    case 'success':
      return (
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded-full text-[9px] font-bold uppercase">
          <CheckCircle2 size={10} />
          Success
        </div>
      );
    case 'warning':
      return (
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded-full text-[9px] font-bold uppercase">
          <AlertCircle size={10} />
          Warning
        </div>
      );
    case 'error':
      return (
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-rose-500/10 text-rose-500 rounded-full text-[9px] font-bold uppercase">
          <AlertCircle size={10} />
          Error
        </div>
      );
  }
}
