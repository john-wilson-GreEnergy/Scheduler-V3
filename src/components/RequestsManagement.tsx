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
import { sendNotification } from '../utils/notifications';

export default function RequestsManagement({ canApprove = true }: { canApprove?: boolean }) {
  const [requests, setRequests] = useState<PortalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'denied'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isJobsiteModalOpen, setIsJobsiteModalOpen] = useState(false);
  const [isDenyModalOpen, setIsDenyModalOpen] = useState(false);
  const [denyReason, setDenyReason] = useState('');
  const [selectedJobsite, setSelectedJobsite] = useState('');
  const [jobsites, setJobsites] = useState<any[]>([]);
  const [jobsiteGroups, setJobsiteGroups] = useState<any[]>([]);
  const [requestToApprove, setRequestToApprove] = useState<PortalRequest | null>(null);
  const [requestToDeny, setRequestToDeny] = useState<PortalRequest | null>(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('portal_requests')
        .select('*, employee:employees!portal_requests_employee_fk_fkey(*), approver:employees!portal_requests_approver_fk_fkey(*)')
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
    const fetchJobsites = async () => {
      const { data, error } = await supabase.from('jobsites').select('id, jobsite_name, jobsite_group').eq('is_active', true);
      if (data) {
        setJobsites(data);
        const groups = Array.from(new Set(data.filter(j => j.jobsite_group).map(j => j.jobsite_group)));
        setJobsiteGroups(groups);
      }
    };
    fetchJobsites();
  }, []);

  const handleAction = async (request: PortalRequest, action: 'approved' | 'denied') => {
    if (action === 'approved' && request.request_type === 'rotation_change') {
      setRequestToApprove(request);
      setIsJobsiteModalOpen(true);
      return;
    }
    if (action === 'denied') {
      setRequestToDeny(request);
      setIsDenyModalOpen(true);
      return;
    }
    await performAction(request, action);
  };

  const performAction = async (request: PortalRequest, action: 'approved' | 'denied', jobsite?: string, reason?: string) => {
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

      const updateData: any = {
        status: action,
        approver_fk: admin?.id,
        approved_at: new Date().toISOString()
      };
      if (jobsite) updateData.requested_jobsite = jobsite;
      if (reason) updateData.deny_reason = reason;

      const { data: updatedData, error: updateError } = await supabase
        .from('portal_requests')
        .update(updateData)
        .eq('id', request.id)
        .select();

      if (updateError) throw updateError;
      if (!updatedData || updatedData.length === 0) {
        throw new Error('No rows updated. Check RLS policies.');
      }

      // Send notification to employee
      if (request.employee) {
        await sendNotification({
          employeeId: request.employee.id,
          title: `Request ${action === 'approved' ? 'Approved' : 'Denied'}`,
          message: `Your ${request.request_type.replace('_', ' ')} request for ${request.start_date ? format(new Date(request.start_date), 'MMM dd') : 'N/A'} - ${request.end_date ? format(new Date(request.end_date), 'MMM dd') : 'N/A'} has been ${action}.`,
          type: action === 'approved' ? 'info' : 'warning',
          sendEmail: true,
          emailData: {
            updateType: 'Request Update',
            jobsiteName: 'N/A',
            weekStartDate: request.start_date ? format(new Date(request.start_date), 'MMM dd, yyyy') : 'N/A'
          }
        });
      }

      // If approved and it's a time off or vacation request, update assignments
      if (action === 'approved' && (request.request_type === 'time_off' || request.request_type === 'vacation')) {
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
          // For each week, update or insert an assignment as "working" and add "Vacation" or "Time Off" to assignment_items
          await supabase.rpc('set_audit_reason', { reason: 'request_approval_time_off_vacation' });
          for (const weekStart of weekStarts) {
            // Upsert assignment_weeks
            const { data: week, error: upsertError } = await supabase
              .from('assignment_weeks')
              .upsert({
                employee_id: request.employee.employee_id_ref,
                email: request.employee.email,
                first_name: request.employee.first_name,
                last_name: request.employee.last_name,
                week_start: weekStart,
                assignment_name: request.request_type === 'vacation' ? 'Vacation' : 'Time Off',
                status: 'assigned'
              }, {
                onConflict: 'employee_id,week_start'
              })
              .select('id')
              .single();
            
            if (upsertError) {
              console.error('Error upserting assignment_week:', upsertError);
              continue;
            }

            // Delete existing items and insert new one
            await supabase.from('assignment_items').delete().eq('assignment_week_id', week.id);
            await supabase.from('assignment_items').insert({
              assignment_week_id: week.id,
              jobsite_name: request.request_type === 'vacation' ? 'Vacation' : 'Time Off',
              days: 'Mon,Tue,Wed,Thu,Fri,Sat,Sun'
            });
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
      
      // Handle rotation change approval
      if (action === 'approved' && request.request_type === 'rotation_change') {
        const { data: assignments, error: assignError } = await supabase
          .from('assignment_weeks')
          .select('*')
          .eq('employee_id', request.employee?.employee_id_ref)
          .in('week_start', [request.requested_week_start, request.target_week_start]);

        if (assignError) throw assignError;

        const requestedWeek = assignments?.find(a => a.week_start === request.requested_week_start);
        const targetWeek = assignments?.find(a => a.week_start === request.target_week_start);

        if (requestedWeek && targetWeek) {
          // Swap assignment_name and status
          const tempName = requestedWeek.assignment_name;
          const tempStatus = requestedWeek.status;
          await supabase.from('assignment_weeks').update({ assignment_name: targetWeek.assignment_name, status: targetWeek.status }).eq('id', requestedWeek.id);
          await supabase.from('assignment_weeks').update({ assignment_name: tempName, status: tempStatus }).eq('id', targetWeek.id);
          
          // If admin provided a jobsite, update the requested week (which was rotation)
          let finalJobsite = targetWeek.assignment_name;
          if (jobsite) {
             finalJobsite = jobsite;
             if (jobsite.startsWith('group:')) {
               const groupName = jobsite.split(':')[1];
               const { data: groupJobsites } = await supabase.from('jobsites').select('jobsite_name').eq('jobsite_group', groupName).eq('is_active', true);
               if (groupJobsites && groupJobsites.length > 0) {
                 finalJobsite = groupJobsites[0].jobsite_name;
               }
             }
             await supabase.from('assignment_weeks').update({ assignment_name: finalJobsite, status: 'assigned' }).eq('id', requestedWeek.id);
          }

          // Send standard assignment change notification
          const weeksUntil = Math.max(0, Math.round((new Date(request.requested_week_start).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 7)));
          const portalMessage = `Update Type: Assignment Change\r\nEmployee: ${request.employee?.first_name} ${request.employee?.last_name}\r\nDate Updated: ${new Date().toISOString().split('T')[0]}\r\nWork Week: ${request.requested_week_start}\r\nPrevious Assignment: ${tempName}\r\nNew Assignment: ${finalJobsite}\r\nDays: Mon, Tue, Wed, Thu, Fri, Sat, Sun\r\nWeeks Until New Assignment: ${weeksUntil}`;

          await sendNotification({
            employeeId: request.employee.id,
            title: 'Assignment Change',
            message: portalMessage,
            type: 'info',
            sendEmail: true,
            emailData: {
              updateType: 'Assignment Change',
              jobsiteName: finalJobsite,
              weekStartDate: request.requested_week_start,
              customEmailBody: portalMessage
            }
          });
        }
      }

      await fetchRequests();
    } catch (err) {
      console.error(`Error ${action} request:`, err);
    } finally {
      setProcessingId(null);
      setIsJobsiteModalOpen(false);
      setIsDenyModalOpen(false);
      setRequestToApprove(null);
      setRequestToDeny(null);
      setDenyReason('');
    }
  };

  const filteredRequests = requests.filter(r => filterStatus === 'all' || r.status === filterStatus);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex items-center gap-1 bg-[#0A120F] border border-emerald-900/20 p-1 rounded-xl w-full md:w-auto overflow-x-auto no-scrollbar">
            {(['all', 'pending', 'approved', 'denied'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={`px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold capitalize transition-all whitespace-nowrap ${
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
          className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-emerald-500 transition-all ml-auto md:ml-0"
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
                          {req.start_date ? `${format(new Date(req.start_date), 'MMM d, yyyy')} — ${format(new Date(req.end_date), 'MMM d, yyyy')}` : 'N/A'}
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

                {req.status === 'pending' && canApprove && (
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
                    <div className="text-xs text-white font-bold">
                      {req.approver ? `${req.approver.first_name} ${req.approver.last_name}` : 'Unknown'}
                    </div>
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
      {isJobsiteModalOpen && requestToApprove && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0A120F] border border-white/10 rounded-3xl p-8 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Select Jobsite for Rotation Swap</h2>
            <select 
              value={selectedJobsite} 
              onChange={(e) => setSelectedJobsite(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-emerald-500 transition-all mb-6"
            >
              <option value="">Select jobsite or group</option>
              {jobsiteGroups.length > 0 && (
                <optgroup label="Groups">
                  {jobsiteGroups.map(group => (
                    <option key={`group-${group}`} value={`group:${group}`}>{group}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Individual Jobsites">
                {jobsites.map(j => (
                  <option key={j.id} value={j.jobsite_name}>{j.jobsite_name}</option>
                ))}
              </optgroup>
            </select>
            <div className="flex gap-4">
              <button onClick={() => setIsJobsiteModalOpen(false)} className="flex-1 py-3 bg-white/5 text-white font-bold rounded-xl">Cancel</button>
              <button 
                onClick={() => performAction(requestToApprove, 'approved', selectedJobsite)} 
                className="flex-1 py-3 bg-emerald-500 text-black font-bold rounded-xl"
                disabled={!selectedJobsite}
              >
                Approve & Swap
              </button>
            </div>
          </div>
        </div>
      )}
      {isDenyModalOpen && requestToDeny && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#0A120F] border border-white/10 rounded-3xl p-8 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">Reason for Denial</h2>
            <textarea 
              value={denyReason} 
              onChange={(e) => setDenyReason(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-rose-500 transition-all mb-6 resize-none"
              rows={4}
              placeholder="Enter reason for denial..."
            />
            <div className="flex gap-4">
              <button onClick={() => setIsDenyModalOpen(false)} className="flex-1 py-3 bg-white/5 text-white font-bold rounded-xl">Cancel</button>
              <button 
                onClick={() => performAction(requestToDeny, 'denied', undefined, denyReason)} 
                className="flex-1 py-3 bg-rose-500 text-black font-bold rounded-xl"
                disabled={!denyReason}
              >
                Confirm Denial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
