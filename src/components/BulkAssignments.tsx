import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, Jobsite } from '../types';
import { format, startOfWeek, addWeeks } from 'date-fns';
import { Users, MapPin, Calendar, CheckCircle2, AlertCircle, ChevronRight, Search, Filter, Trash2, Save, X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { logActivity } from '../lib/logger';
import { sendNotification } from '../utils/notifications';

interface BulkAssignmentsProps {
  employees: Employee[];
  jobsites: Jobsite[];
}

interface PlannedChange {
  employeeId: string;
  employeeName: string;
  jobsiteId: string;
  jobsiteName: string;
  weekStart: string;
}

export default function BulkAssignments({ employees, jobsites }: BulkAssignmentsProps) {
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedJobsite, setSelectedJobsite] = useState<string>('');
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'select' | 'review'>('select');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const nextFourWeeks = useMemo(() => {
    const weeks = [];
    // Start of week on Monday
    let current = startOfWeek(new Date(), { weekStartsOn: 1 });
    for (let i = 0; i < 8; i++) {
      weeks.push(format(current, 'yyyy-MM-dd'));
      current = addWeeks(current, 1);
    }
    return weeks;
  }, []);

  const groupedJobsites = useMemo(() => {
    const groups: Record<string, Jobsite[]> = {};
    const individualJobsites: Jobsite[] = [];
    
    jobsites.filter(j => j.is_active).forEach(site => {
      if (site.jobsite_group) {
        if (!groups[site.jobsite_group]) groups[site.jobsite_group] = [];
        groups[site.jobsite_group].push(site);
      } else {
        individualJobsites.push(site);
      }
    });
    return { groups, individualJobsites };
  }, [jobsites]);

  const filteredEmployees = employees.filter(e => 
    e.is_active && (
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.job_title?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const plannedChanges = useMemo(() => {
    const changes: PlannedChange[] = [];
    
    let targetJobsites: Jobsite[] = [];
    let jobsiteName = '';

    if (selectedJobsite.startsWith('group:')) {
        const groupName = selectedJobsite.split(':')[1];
        targetJobsites = groupedJobsites.groups[groupName] || [];
        jobsiteName = groupName;
    } else {
        const jobsite = jobsites.find(j => j.id === selectedJobsite);
        if (jobsite) {
            targetJobsites = [jobsite];
            jobsiteName = jobsite.jobsite_name;
        }
    }

    if (targetJobsites.length === 0) return [];

    selectedEmployees.forEach(empId => {
      const emp = employees.find(e => e.id === empId);
      if (!emp) return;

      selectedWeeks.forEach(week => {
        changes.push({
          employeeId: empId,
          employeeName: `${emp.first_name} ${emp.last_name}`,
          jobsiteId: selectedJobsite,
          jobsiteName: jobsiteName,
          weekStart: week
        });
      });
    });
    return changes;
  }, [selectedEmployees, selectedJobsite, selectedWeeks, employees, groupedJobsites, jobsites]);

  const handleToggleEmployee = (id: string) => {
    setSelectedEmployees(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedEmployees.length === filteredEmployees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(filteredEmployees.map(e => e.id));
    }
  };

  const handleToggleWeek = (week: string) => {
    setSelectedWeeks(prev => 
      prev.includes(week) ? prev.filter(w => w !== week) : [...prev, week]
    );
  };

  const handleApply = async () => {
    setLoading(true);
    try {
      // 1. Prepare updates for assignment_weeks
      const updates = plannedChanges.map(change => {
        const emp = employees.find(e => e.id === change.employeeId)!;
        return {
          employee_id: emp.employee_id_ref,
          email: emp.email,
          first_name: emp.first_name,
          last_name: emp.last_name,
          week_start: change.weekStart,
          assignment_name: change.jobsiteName,
          value_type: 'jobsite'
        };
      });

      // 2. Upsert assignment weeks
      const { error: upsertError } = await supabase
        .from('assignment_weeks')
        .upsert(updates, { onConflict: 'email,week_start' });
      
      if (upsertError) throw upsertError;

      // 3. Get the IDs of the created/updated weeks to link items
      const { data: weeks, error: weeksError } = await supabase
        .from('assignment_weeks')
        .select('id, email, week_start')
        .in('email', updates.map(u => u.email))
        .in('week_start', updates.map(u => u.week_start));
      
      if (weeksError) throw weeksError;

      // 4. Prepare assignment_items
      const itemsToInsert: any[] = [];
      
      plannedChanges.forEach(change => {
        const emp = employees.find(e => e.id === change.employeeId);
        const week = weeks?.find(w => w.email === emp?.email && w.week_start === change.weekStart);
        if (!week) return;

        let targetJobsites: Jobsite[] = [];
        if (change.jobsiteId.startsWith('group:')) {
            const groupName = change.jobsiteId.split(':')[1];
            targetJobsites = groupedJobsites.groups[groupName] || [];
        } else {
            const jobsite = jobsites.find(j => j.id === change.jobsiteId);
            if (jobsite) targetJobsites = [jobsite];
        }

        targetJobsites.forEach(site => {
            itemsToInsert.push({
                assignment_week_fk: week.id,
                jobsite_fk: site.id
            });
        });
      });

      // 5. Clear existing items and insert new ones
      const affectedWeekIds = weeks?.map(w => w.id) || [];
      const { error: deleteError } = await supabase
        .from('assignment_items')
        .delete()
        .in('assignment_week_fk', affectedWeekIds);
      
      if (deleteError) throw deleteError;

      const { error: itemError } = await supabase
        .from('assignment_items')
        .insert(itemsToInsert);

      if (itemError) throw itemError;

      // 6. Send notifications to all affected employees
      const uniqueEmployeeIds = Array.from(new Set(plannedChanges.map(c => c.employeeId))) as string[];
      
      for (const empId of uniqueEmployeeIds) {
        await sendNotification({
          employeeId: empId,
          title: 'Schedule Update',
          message: `You have been assigned to "${plannedChanges.find(c => c.employeeId === empId)?.jobsiteName}" for ${selectedWeeks.length} upcoming week(s).`,
          type: 'info',
          sendEmail: true,
          updateType: 'Bulk Assignment',
          jobsiteName: plannedChanges.find(c => c.employeeId === empId)?.jobsiteName || 'N/A',
          weekStartDate: selectedWeeks[0] || 'N/A'
        });
      }

      logActivity('bulk_assignment', {
        employee_count: selectedEmployees.length,
        week_count: selectedWeeks.length,
        jobsite_id: selectedJobsite
      });

      setMessage({ type: 'success', text: `Successfully applied ${plannedChanges.length} assignments.` });
      setStep('select');
      setSelectedEmployees([]);
      setSelectedWeeks([]);
      setSelectedJobsite('');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Bulk Assignments</h2>
          <p className="text-gray-500 text-sm">Assign multiple employees to jobsites across multiple weeks.</p>
        </div>
        {step === 'review' && (
          <button 
            onClick={() => setStep('select')}
            className="px-4 py-2 bg-white/5 border border-white/10 text-gray-400 rounded-xl hover:text-white transition-colors"
          >
            Back to Selection
          </button>
        )}
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

      {step === 'select' ? (
        <div className="grid lg:grid-cols-12 gap-6">
          {/* Employee Selection */}
          <div className="lg:col-span-4 bg-[#0A120F] border border-emerald-900/30 rounded-3xl flex flex-col h-[600px]">
            <div className="p-4 border-b border-emerald-900/10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                  <Users size={14} />
                  Select Employees ({selectedEmployees.length})
                </h3>
                <button 
                  onClick={handleSelectAll}
                  className="text-[10px] text-emerald-500 hover:text-emerald-400 font-bold uppercase"
                >
                  {selectedEmployees.length === filteredEmployees.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                <input 
                  type="text"
                  placeholder="Search employees..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-black/40 border border-emerald-900/30 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {filteredEmployees.map(emp => (
                <label 
                  key={emp.id}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                    selectedEmployees.includes(emp.id) ? 'bg-emerald-500/10 border border-emerald-500/30' : 'hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <input 
                    type="checkbox"
                    checked={selectedEmployees.includes(emp.id)}
                    onChange={() => handleToggleEmployee(emp.id)}
                    className="w-4 h-4 rounded border-emerald-900/50 bg-black/40 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                  />
                  <div>
                    <p className="text-xs font-bold text-white">{emp.first_name} {emp.last_name}</p>
                    <p className="text-[10px] text-gray-500">{emp.job_title}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Jobsite & Week Selection */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-6">
              <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2 mb-6">
                <MapPin size={14} />
                Target Jobsite
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Groups */}
                {Object.entries(groupedJobsites.groups).map(([groupName, sites]: [string, Jobsite[]]) => (
                  <button
                    key={`group-${groupName}`}
                    onClick={() => setSelectedJobsite(`group:${groupName}`)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      selectedJobsite === `group:${groupName}` 
                        ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                        : 'bg-black/20 border-emerald-900/30 hover:border-emerald-500/30'
                    }`}
                  >
                    <p className="text-sm font-bold text-white">{groupName}</p>
                    <p className="text-[10px] text-gray-500">{sites.length} Jobsites</p>
                  </button>
                ))}
                {/* Individual Jobsites */}
                {groupedJobsites.individualJobsites.map(site => (
                  <button
                    key={site.id}
                    onClick={() => setSelectedJobsite(site.id)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      selectedJobsite === site.id 
                        ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                        : 'bg-black/20 border-emerald-900/30 hover:border-emerald-500/30'
                    }`}
                  >
                    <p className="text-sm font-bold text-white">{site.jobsite_name}</p>
                    <p className="text-[10px] text-gray-500">{site.customer}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-6">
              <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2 mb-6">
                <Calendar size={14} />
                Select Weeks
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {nextFourWeeks.map(week => (
                  <button
                    key={week}
                    onClick={() => handleToggleWeek(week)}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      selectedWeeks.includes(week) 
                        ? 'bg-emerald-500/10 border-emerald-500' 
                        : 'bg-black/20 border-emerald-900/30 hover:border-emerald-500/30'
                    }`}
                  >
                    <p className="text-[10px] font-bold text-white">{format(new Date(week + 'T00:00:00'), 'MMM dd')}</p>
                    <p className="text-[8px] text-gray-500 uppercase tracking-wider">Start Date</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                disabled={selectedEmployees.length === 0 || !selectedJobsite || selectedWeeks.length === 0}
                onClick={() => setStep('review')}
                className="flex items-center gap-2 px-8 py-4 bg-emerald-500 text-black font-bold rounded-2xl hover:bg-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
              >
                Review Assignments
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-emerald-900/10 bg-emerald-500/5">
            <h3 className="text-lg font-bold text-white">Review Planned Changes</h3>
            <p className="text-sm text-gray-500">Please review the following {plannedChanges.length} assignments before applying.</p>
          </div>
          <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-emerald-900/10">
                  <th className="px-6 py-4 text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Employee</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Target Jobsite</th>
                  <th className="px-6 py-4 text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Work Week</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-900/10">
                {plannedChanges.map((change, idx) => (
                  <tr key={idx} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-sm text-white font-medium">{change.employeeName}</td>
                    <td className="px-6 py-4 text-sm text-gray-400">{change.jobsiteName}</td>
                    <td className="px-6 py-4 text-sm font-mono text-emerald-500/70">{change.weekStart}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-6 bg-black/40 border-t border-emerald-900/10 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-emerald-500" />
                <span>{selectedEmployees.length} Employees</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-emerald-500" />
                <span>{selectedWeeks.length} Weeks</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep('select')}
                className="px-6 py-3 bg-white/5 border border-white/10 text-white font-bold rounded-xl hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={loading}
                className="flex items-center gap-2 px-8 py-3 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
              >
                {loading ? <RefreshCw className="animate-spin" size={18} /> : <Save size={18} />}
                Confirm & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
