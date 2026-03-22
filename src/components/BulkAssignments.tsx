import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, Jobsite, JobsiteGroup } from '../types';
import { format, startOfWeek, addWeeks } from 'date-fns';
import { Users, MapPin, Calendar, CheckCircle2, AlertCircle, ChevronRight, Search, Filter, Trash2, Save, X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { logActivity } from '../lib/logger';
import { sendNotification } from '../utils/notifications';

interface BulkAssignmentsProps {
  employees: Employee[];
  jobsites: Jobsite[];
  jobsiteGroups: JobsiteGroup[];
}

interface PlannedChange {
  employeeId: string;
  employeeName: string;
  jobsiteId: string;
  jobsiteName: string;
  assignmentName: string;
  weekStart: string;
  days: string[];
}

export default function BulkAssignments({ employees, jobsites, jobsiteGroups }: BulkAssignmentsProps) {
  const fieldEmployees = useMemo(() => employees.filter(e => e.role !== 'hr'), [employees]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [selectedJobsites, setSelectedJobsites] = useState<string[]>([]);
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const [jobsiteDays, setJobsiteDays] = useState<Record<string, string[]>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'select' | 'review'>('select');
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const handleToggleDay = (jobsiteId: string, day: string) => {
    setJobsiteDays(prev => {
      const currentDays = prev[jobsiteId] || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const newDays = currentDays.includes(day) 
        ? currentDays.filter(d => d !== day) 
        : [...currentDays, day];
      return { ...prev, [jobsiteId]: newDays };
    });
  };

  const nextSixteenWeeks = useMemo(() => {
    const weeks = [];
    // Start of week on Monday
    let current = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), weekOffset * 16);
    for (let i = 0; i < 16; i++) {
      weeks.push(format(current, 'yyyy-MM-dd'));
      current = addWeeks(current, 1);
    }
    return weeks;
  }, [weekOffset]);

  const groupedJobsites = useMemo(() => {
    const groups: Record<string, Jobsite[]> = {};
    const individualJobsites: Jobsite[] = [];
    
    // Add permanent tiles
    const permanentTiles = [
      { id: 'rotation', jobsite_name: 'Rotation', customer: 'System' },
      { id: 'vacation', jobsite_name: 'Vacation', customer: 'System' }
    ];
    
    jobsites.filter(j => showInactive || j.is_active).forEach(site => {
      if (site.group_id) {
        const group = jobsiteGroups.find(g => g.id === site.group_id);
        const groupName = group ? group.name : 'Unknown';
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push(site);
      } else {
        individualJobsites.push(site);
      }
    });
    return { groups, individualJobsites, permanentTiles };
  }, [jobsites, jobsiteGroups, showInactive]);

  const filteredEmployees = fieldEmployees.filter(e => 
    e.is_active && (
      `${e.first_name} ${e.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.job_title?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const plannedChanges = useMemo(() => {
    const changes: PlannedChange[] = [];
    console.log('Calculating plannedChanges:', { selectedEmployees, selectedJobsites, selectedWeeks });
    
    selectedJobsites.forEach(selectedJobsite => {
        let targetJobsites: Jobsite[] = [];
        let assignmentName = '';

        if (selectedJobsite.startsWith('group:')) {
            const groupName = selectedJobsite.split(':')[1];
            targetJobsites = groupedJobsites.groups[groupName] || [];
            assignmentName = groupName;
        } else {
            const jobsite = jobsites.find(j => j.id === selectedJobsite) || 
                            jobsites.find(j => j.jobsite_name.toLowerCase() === selectedJobsite.toLowerCase());
            if (jobsite) {
                targetJobsites = [jobsite];
                assignmentName = jobsite.jobsite_name;
            }
        }

        if (targetJobsites.length === 0) return;

        selectedEmployees.forEach(empId => {
          const emp = fieldEmployees.find(e => e.id === empId);
          if (!emp) return;

          selectedWeeks.forEach(week => {
            targetJobsites.forEach(site => {
              const days = jobsiteDays[selectedJobsite] || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
              changes.push({
                employeeId: emp.id,
                employeeName: `${emp.first_name} ${emp.last_name}`,
                jobsiteId: site.id,
                jobsiteName: site.jobsite_name,
                assignmentName: assignmentName,
                weekStart: week,
                days: days
              });
            });
          });
        });
    });

    return changes;
  }, [selectedEmployees, selectedJobsites, selectedWeeks, jobsiteDays, fieldEmployees, jobsites, groupedJobsites]);

  const handleToggleEmployee = (id: string) => {
    console.log('Toggling employee:', id);
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

  const handleToggleJobsite = (id: string) => {
    console.log('Toggling jobsite:', id);
    setSelectedJobsites(prev => {
      const next = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id];
      console.log('New selectedJobsites:', next);
      return next;
    });
  };

  const handleToggleWeek = (week: string) => {
    setSelectedWeeks(prev => 
      prev.includes(week) ? prev.filter(w => w !== week) : [...prev, week]
    );
  };

  const handleApply = async () => {
    setLoading(true);
    console.log('Applying assignments:', { plannedChanges, selectedEmployees, selectedJobsites, selectedWeeks });
    try {
      // 1. Prepare updates for assignment_weeks
      const map = new Map<string, { employee_fk: string, week_start: string, assignment_type: string }>(plannedChanges.map(change => {
        const emp = fieldEmployees.find(e => e.id === change.employeeId)!;
        return [`${emp.id}-${change.weekStart}`, {
          employee_fk: emp.id,
          week_start: change.weekStart,
          assignment_type: change.jobsiteId === 'rotation' || change.jobsiteId === 'vacation' ? change.jobsiteId : 'jobsite'
        }];
      }));
      const uniqueUpdates = Array.from(map.values());

      // 2. Upsert assignment weeks
      const { error: upsertError } = await supabase
        .from('assignment_weeks')
        .upsert(uniqueUpdates, { onConflict: 'employee_fk,week_start' });
      
      if (upsertError) {
        console.error('Upsert error:', upsertError);
        throw upsertError;
      }

      // 3. Get the IDs of the created/updated weeks to link items
      const uniqueEmployeeFks = Array.from(new Set(uniqueUpdates.map(u => u.employee_fk)));
      const uniqueWeeks = Array.from(new Set(uniqueUpdates.map(u => u.week_start)));

      const { data: weeks, error: weeksError } = await supabase
        .from('assignment_weeks')
        .select('id, employee_fk, week_start, items:assignment_items(jobsite_fk, assignment_type)')
        .in('employee_fk', uniqueEmployeeFks)
        .in('week_start', uniqueWeeks);
      
      if (weeksError) throw weeksError;

      // Store previous assignments for notification
      const previousAssignmentsMap = new Map<string, string>();
      weeks?.forEach(w => {
        const item = w.items?.[0]; // Assuming one assignment per week per employee
        if (item) {
          const jobsite = jobsites.find(j => j.id === item.jobsite_fk);
          previousAssignmentsMap.set(`${w.employee_fk}-${w.week_start}`, jobsite?.jobsite_name || item.assignment_type);
        }
      });

      // 4. Prepare assignment_items
      const itemsToInsert: any[] = [];
      
      plannedChanges.forEach(change => {
        const emp = fieldEmployees.find(e => e.id === change.employeeId);
        const week = weeks?.find(w => w.employee_fk === emp?.id && w.week_start === change.weekStart);
        if (!week || !emp) return;

        let targetJobsites: Jobsite[] = [];
        if (change.jobsiteId.startsWith('group:')) {
            const groupName = change.jobsiteId.split(':')[1];
            targetJobsites = groupedJobsites.groups[groupName] || [];
        } else {
            const jobsite = jobsites.find(j => j.id === change.jobsiteId) || 
                            jobsites.find(j => j.jobsite_name.toLowerCase() === change.jobsiteId.toLowerCase());
            if (jobsite) targetJobsites = [jobsite];
        }

        targetJobsites.forEach(site => {
            itemsToInsert.push({
                assignment_week_fk: week.id,
                jobsite_fk: site.id,
                days: change.days,
                week_start: week.week_start,
                item_order: 0,
                assignment_type: change.jobsiteId === 'rotation' || change.jobsiteId === 'vacation' ? change.jobsiteId : 'jobsite'
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
// ...

      if (itemError) throw itemError;

      // 6. Send notifications to all affected employees
      const uniqueEmployeeIds = Array.from(new Set(plannedChanges.map(c => c.employeeId))) as string[];
      const today = new Date().toLocaleDateString();
      
      for (const empId of uniqueEmployeeIds) {
        const empChanges = plannedChanges.filter(c => c.employeeId === empId);
        const emp = fieldEmployees.find(e => e.id === empId);
        
        const messageLines = empChanges.map(change => {
            const prev = previousAssignmentsMap.get(`${empId}-${change.weekStart}`) || 'None';
            const weeksUntil = Math.max(0, Math.round((new Date(change.weekStart).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 7)));
            const daysStr = change.days ? ` (${change.days.join(', ')})` : '';
            return `• Week Of: ${change.weekStart}${daysStr} | ${prev} ➔ ${change.jobsiteName} (In ${weeksUntil} weeks)`;
        });

        const portalMessage = empChanges.map(change => {
            const prev = previousAssignmentsMap.get(`${empId}-${change.weekStart}`) || 'None';
            const weeksUntil = Math.max(0, Math.round((new Date(change.weekStart).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 7)));
            return `Update Type: Assignment Change\r\nEmployee: ${emp?.first_name} ${emp?.last_name}\r\nDate Updated: ${new Date().toISOString().split('T')[0]}\r\nWork Week: ${change.weekStart}\r\nPrevious Assignment: ${prev}\r\nNew Assignment: ${change.assignmentName}\r\nDays: ${change.days?.join(', ') || 'N/A'}\r\nWeeks Until New Assignment: ${weeksUntil}`;
        }).join('\r\n\r\n');
        
        const emailMessage = portalMessage;

        await sendNotification({
          employeeId: empId,
          title: 'Assignment Change',
          message: portalMessage,
          type: 'info',
          sendEmail: true,
          emailData: {
            updateType: 'Assignment Change',
            jobsiteName: empChanges.map(c => c.jobsiteName).join(', '),
            weekStartDate: selectedWeeks[0] || 'N/A',
            customEmailBody: emailMessage
          }
        });
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      logActivity('bulk_assignment', {
        employee_count: selectedEmployees.length,
        week_count: selectedWeeks.length,
        jobsite_ids: selectedJobsites
      });

      setMessage({ type: 'success', text: `Successfully applied ${plannedChanges.length} assignments.` });
      setStep('select');
      setSelectedEmployees([]);
      setSelectedWeeks([]);
      setSelectedJobsites([]);
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
                <button 
                  onClick={() => setShowInactive(!showInactive)}
                  className={`ml-auto text-[10px] font-bold uppercase ${showInactive ? 'text-emerald-400' : 'text-gray-500'}`}
                >
                  {showInactive ? 'Hide Inactive' : 'Show Inactive'}
                </button>
              </h3>
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Permanent Tiles */}
                {groupedJobsites.permanentTiles.map(site => (
                  <button
                    key={site.id}
                    onClick={() => handleToggleJobsite(site.id)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      selectedJobsites.includes(site.id) 
                        ? 'bg-emerald-500/10 border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
                        : 'bg-black/20 border-emerald-900/30 hover:border-emerald-500/30'
                    }`}
                  >
                    <p className="text-sm font-bold text-white">{site.jobsite_name}</p>
                    <p className="text-[10px] text-gray-500">{site.customer}</p>
                  </button>
                ))}
                {/* Groups */}
                {Object.entries(groupedJobsites.groups).map(([groupName, sites]: [string, Jobsite[]]) => (
                  <button
                    key={`group-${groupName}`}
                    onClick={() => handleToggleJobsite(`group:${groupName}`)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      selectedJobsites.includes(`group:${groupName}`) 
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
                    onClick={() => handleToggleJobsite(site.id)}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      selectedJobsites.includes(site.id) 
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
                <div className="flex gap-2 ml-auto">
                  <button onClick={() => setWeekOffset(prev => Math.max(0, prev - 1))} className="p-1 hover:bg-white/10 rounded">
                    <ChevronRight size={14} className="rotate-180" />
                  </button>
                  <button onClick={() => setWeekOffset(prev => prev + 1)} className="p-1 hover:bg-white/10 rounded">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {nextSixteenWeeks.map(week => (
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

            <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-6">
              <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2 mb-6">
                <Calendar size={14} />
                Select Days per Jobsite
              </h3>
              {selectedJobsites.length === 0 && <p className="text-xs text-gray-500">Please select at least one jobsite.</p>}
              {selectedJobsites.map(jobsiteId => {
                const jobsiteName = jobsiteId.startsWith('group:') ? jobsiteId.split(':')[1] : (jobsites.find(j => j.id === jobsiteId)?.jobsite_name || jobsiteId);
                return (
                  <div key={jobsiteId} className="mb-6">
                    <p className="text-sm font-bold text-white mb-3">{jobsiteName}</p>
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-3">
                      {daysOfWeek.map(day => (
                        <button
                          key={day}
                          onClick={() => handleToggleDay(jobsiteId, day)}
                          className={`p-3 rounded-xl border text-center transition-all ${
                            (jobsiteDays[jobsiteId] || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).includes(day)
                              ? 'bg-emerald-500/10 border-emerald-500' 
                              : 'bg-black/20 border-emerald-900/30 hover:border-emerald-500/30'
                          }`}
                        >
                          <p className="text-[10px] font-bold text-white">{day}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                disabled={
                  selectedEmployees.length === 0 || 
                  selectedJobsites.length === 0 || 
                  selectedWeeks.length === 0 ||
                  selectedJobsites.some(id => (jobsiteDays[id] || []).length === 0)
                }
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
