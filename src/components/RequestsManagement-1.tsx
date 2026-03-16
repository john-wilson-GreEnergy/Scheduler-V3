import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PortalRequest, Employee } from '../types';
import { 
  ClipboardList, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Calendar, 
  User, 
  AlertCircle,
  RefreshCw,
  Search,
  Filter
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { logActivity } from '../lib/logger';
import { format } from 'date-fns';

export default function RequestsManagement() {
  const [requests, setRequests] = useState<(PortalRequest & { employee?: Employee })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'denied'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('portal_requests')
        .select(`
          *,
          employee:employees(*)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (err) {
      console.error('Error fetching requests:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleAction = async (request: PortalRequest & { employee?: Employee }, action: 'approved' | 'denied') => {
    setProcessingId(request.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get admin employee ID
      const { data: admin } = await supabase
        .from('employees')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      const { error: updateError } = await supabase
        .from('portal_requests')
        .update({
          status: action,
          approver_fk: admin?.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      // If approved and it's a time off request, update assignments
      if (action === 'approved' && request.request_type === 'time_off') {
        const start = new Date(request.start_date);
        const end = new Date(request.end_date);
        
        // Find all Monday week starts between start and end
        const weekStarts: string[] = [];
        let current = new Date(start);
        // Adjust to Monday if not already
        const day = current.getDay();
        const diff = current.getDate() - day + (day === 0 ? -6 : 1);
        current.setDate(diff);

        while (current <= end) {
          if (current >= start) {
            weekStarts.push(format(current, 'yyyy-MM-dd'));
          }
          current.setDate(current.getDate() + 7);
        }

        if (weekStarts.length > 0 && request.employee) {
          // For each week, update or insert an assignment as "Time Off"
          for (const weekStart of weekStarts) {
            const { error: assignError } = await supabase
              .from('assignments')
              .upsert({
                employee_id: request.employee.employee_id_ref,
                email: request.employee.email,
                first_name: request.employee.first_name,
                last_name: request.employee.last_name,
                week_start: weekStart,
                assignment_name: 'Time Off'
              }, {
                onConflict: 'employee_id,week_start'
              });
            
            if (assignError) console.error('Error updating assignment:', assignError);
          }
        }

        // Log the approval
        logActivity('request_approved', {
          request_id: request.id,
          employee: `${request.employee?.first_name} ${request.employee?.last_name}`,
          type: request.request_type,
          dates: `${request.start_date} to ${request.end_date}`,
          weeks_affected: weekStarts.length
        });
      } else if (action === 'denied') {
        logActivity('request_denied', {
          request_id: request.id,
          employee: `${request.employee?.first_name} ${request.employee?.last_name}`,
          type: request.request_type
        });
      }

      await fetchRequests();
    } catch (err) {
      console.error(`Error ${action} request:`, err);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredRequests = requests.filter(r => filterStatus === 'all' || r.status === filterStatus);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#0A120F] border border-emerald-900/20 p-1 rounded-xl">
            {(['all', 'pending', 'approved', 'denied'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  filterStatus === status 
                    ? 'bg-emerald-500 text-black' 
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
        <button 
          onClick={fetchRequests}
          className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-emerald-500 transition-all"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <AnimatePresence mode="popLayout">
          {filteredRequests.map((req) => (
            <motion.div
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key={req.id}
              className="bg-[#0A120F] border border-emerald-900/20 rounded-2xl p-6 hover:border-emerald-500/30 transition-all group"
            >
              <div className="flex flex-col md:flex-row gap-6 justify-between">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                    <ClipboardList size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg font-bold text-white">
                        {req.employee?.first_name} {req.employee?.last_name}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${
                        req.status === 'pending' ? 'bg-amber-500/10 text-amber-500' :
                        req.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500' :
                        'bg-rose-500/10 text-rose-500'
                      }`}>
                        {req.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-400 font-medium mb-4">
                      Requested <span className="text-emerald-500 font-bold uppercase tracking-tighter">{req.request_type.replace('_', ' ')}</span>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Calendar size={14} className="text-emerald-500/50" />
                        <span className="font-bold text-gray-300">
                          {format(new Date(req.start_date), 'MMM d, yyyy')} — {format(new Date(req.end_date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Clock size={14} className="text-emerald-500/50" />
                        <span>Submitted {format(new Date(req.created_at), 'MMM d, h:mm a')}</span>
                      </div>
                    </div>

                    {req.details && (
                      <div className="mt-4 p-3 bg-black/40 rounded-xl border border-white/5 text-xs text-gray-400 italic">
                        "{req.details}"
                      </div>
                    )}
                  </div>
                </div>

                {req.status === 'pending' && (
                  <div className="flex md:flex-col gap-2 justify-end">
                    <button
                      disabled={processingId === req.id}
                      onClick={() => handleAction(req, 'approved')}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                    >
                      <CheckCircle2 size={16} />
                      Approve
                    </button>
                    <button
                      disabled={processingId === req.id}
                      onClick={() => handleAction(req, 'denied')}
                      className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-rose-500 font-black text-xs uppercase tracking-widest border border-rose-500/20 rounded-xl transition-all"
                    >
                      <XCircle size={16} />
                      Deny
                    </button>
                  </div>
                )}

                {req.status !== 'pending' && (
                  <div className="flex flex-col items-end justify-center text-right">
                    <div className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mb-1">Processed By</div>
                    <div className="text-xs text-white font-bold">Administrator</div>
                    <div className="text-[10px] text-gray-600 mt-1">
                      {req.approved_at && format(new Date(req.approved_at), 'MMM d, yyyy')}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {!loading && filteredRequests.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 bg-[#0A120F] border border-emerald-900/20 rounded-3xl">
            <div className="w-16 h-16 rounded-full bg-emerald-500/5 flex items-center justify-center text-emerald-500/20 mb-4">
              <ClipboardList size={32} />
            </div>
            <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">No requests found</p>
          </div>
        )}
      </div>
    </div>
  );
}
