import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, RefreshCw, Save, User, Clock, AlertCircle, Database, CheckSquare, Square, Users, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Employee, RotationConfig } from '../types';
import { seedRotationGroups } from '../utils/seedRotations';
import { addWeeks, format, startOfWeek, eachWeekOfInterval, endOfYear, parseISO } from 'date-fns';
import { sendNotification } from '../utils/notifications';
import { isRotationWeek } from '../utils/rotation';

interface RotationManagementProps {
  employees: Employee[];
  onUpdate: (silent?: boolean) => void;
}

export default function RotationManagement({ employees, onUpdate }: RotationManagementProps) {
  const fieldEmployees = useMemo(() => employees.filter(e => e.role !== 'hr'), [employees]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGroup, setFilterGroup] = useState<'All' | 'A' | 'B' | 'C' | 'D'>('All');
  const [rotationType, setRotationType] = useState<'custom' | 'group'>('custom');
  const [rotationGroup, setRotationGroup] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [weeksOn, setWeeksOn] = useState(3);
  const [weeksOff, setWeeksOff] = useState(1);
  const [anchorDate, setAnchorDate] = useState('2026-03-09');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [configs, setConfigs] = useState<Record<string, RotationConfig>>({});
  
  // Schedule Population State
  const [lastWeek, setLastWeek] = useState<string>('');
  const [popStartDate, setPopStartDate] = useState<string>('');
  const [popWeeks, setPopWeeks] = useState<number>(12);
  const [isPopulating, setIsPopulating] = useState(false);

  // Generate all Mondays for the year starting from 03/09/2026
  const mondays = useMemo(() => {
    const start = new Date(2026, 2, 9); // March 9, 2026
    const end = endOfYear(start);
    return eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
  }, []);

  useEffect(() => {
    fetchConfigs();
    fetchLastWeek();
  }, []);

  const fetchLastWeek = async () => {
    const { data, error } = await supabase
      .from('assignment_weeks')
      .select('week_start')
      .order('week_start', { ascending: false })
      .limit(1);
    
    if (data && data.length > 0) {
      const last = addWeeks(parseISO(data[0].week_start), 1);
      setLastWeek(format(last, 'yyyy-MM-dd'));
      setPopStartDate(format(last, 'yyyy-MM-dd'));
    } else {
      setLastWeek('2026-03-09');
      setPopStartDate('2026-03-09');
    }
  };

  const handlePopulate = async () => {
    setIsPopulating(true);
    try {
      // 1. Get last week per employee
      const { data: lastWeeks, error: lastWeeksError } = await supabase
        .from('assignment_weeks')
        .select('employee_fk, week_start')
        .order('week_start', { ascending: false });

      if (lastWeeksError) throw lastWeeksError;

      const lastWeekMap = new Map<string, Date>();
      lastWeeks?.forEach(row => {
        if (!lastWeekMap.has(row.employee_fk)) {
          lastWeekMap.set(row.employee_fk, parseISO(row.week_start));
        }
      });

      const { data: jobsites } = await supabase.from('jobsites').select('id, jobsite_name');
      const rotationJobsite = jobsites?.find(j => j.jobsite_name === 'Rotation');

      const updates = [];
      const now = startOfWeek(new Date(), { weekStartsOn: 1 });
      const nextWeek = addWeeks(now, 1);
      const startDate = parseISO(popStartDate);
      const targetDate = addWeeks(startDate, popWeeks);

      const employeesToPopulate = selectedEmployees.length > 0
        ? fieldEmployees.filter(e => selectedEmployees.includes(e.id))
        : fieldEmployees;

      for (const emp of employeesToPopulate) {
        let current = startDate;
        while (current <= targetDate) {
          const weekStr = format(current, 'yyyy-MM-dd');
          const isRotation = isRotationWeek(current, emp.rotation_config, emp.rotation_group);
          console.log(`Checking rotation for ${emp.first_name} ${emp.last_name} on ${weekStr}: isRotation=${isRotation}`);
          
          // Check if assignment_week exists
          const { data: existingWeek, error: fetchError } = await supabase
            .from('assignment_weeks')
            .select('id, status')
            .eq('employee_fk', emp.id)
            .eq('week_start', weekStr)
            .maybeSingle();

          if (fetchError) throw fetchError;

          let weekData = existingWeek;

          if (!existingWeek) {
            // Insert new
            const { data: insertedWeek, error: insertError } = await supabase
              .from('assignment_weeks')
              .insert({
                employee_fk: emp.id,
                week_start: weekStr,
                status: isRotation ? 'assigned' : 'unassigned',
                assignment_type: isRotation ? 'Rotation' : null
              })
              .select('id, status')
              .single();
            if (insertError) throw insertError;
            weekData = insertedWeek;
          } else if (existingWeek.status !== (isRotation ? 'assigned' : 'unassigned')) {
            // Update status if it changed
            const { data: updatedWeek, error: updateError } = await supabase
              .from('assignment_weeks')
              .update({ 
                status: isRotation ? 'assigned' : 'unassigned',
                assignment_type: isRotation ? 'Rotation' : null
              })
              .eq('id', existingWeek.id)
              .select('id, status')
              .single();
            if (updateError) throw updateError;
            weekData = updatedWeek;
          }

          if (isRotation && rotationJobsite && weekData) {
            // Check if assignment_item exists
            const { data: existingItem, error: itemFetchError } = await supabase
              .from('assignment_items')
              .select('id')
              .eq('assignment_week_fk', weekData.id)
              .eq('jobsite_fk', rotationJobsite.id)
              .maybeSingle();
            
            if (itemFetchError) throw itemFetchError;

            if (!existingItem) {
              console.log(`Creating assignment item for ${emp.first_name} on ${weekStr}`);
              await supabase.from('assignment_items').insert({
                assignment_week_fk: weekData.id,
                jobsite_fk: rotationJobsite.id,
                days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
                item_order: 0,
                week_start: weekStr,
                assignment_type: 'Rotation'
              });
            }
          } else if (isRotation && !rotationJobsite) {
            console.error(`Rotation jobsite not found!`);
          }

          if (isRotation && current.getTime() === nextWeek.getTime()) {
            const weeksUntil = Math.max(0, Math.round((new Date(weekStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 7)));
            const portalMessage = `Update Type: Rotation Assignment\r\nEmployee: ${emp.first_name} ${emp.last_name}\r\nDate Updated: ${new Date().toISOString().split('T')[0]}\r\nWork Week: ${weekStr}\r\nPrevious Assignment: N/A\r\nNew Assignment: Rotation\r\nDays: Mon, Tue, Wed, Thu, Fri, Sat, Sun\r\nWeeks Until New Assignment: ${weeksUntil}`;

            await sendNotification({
              employeeId: emp.id,
              title: 'Rotation Assignment',
              message: portalMessage,
              type: 'info',
              sendEmail: true,
              emailData: {
                updateType: 'Rotation Assignment',
                jobsiteName: 'Rotation',
                weekStartDate: weekStr,
                customEmailBody: portalMessage
              }
            });
          }
          current = addWeeks(current, 1);
        }
      }
      alert(`Successfully populated schedule.`);
      onUpdate();
    } catch (err: any) {
      console.error('Population error:', err);
      alert(`Failed to populate schedule: ${err.message || JSON.stringify(err)}`);
    } finally {
      setIsPopulating(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await seedRotationGroups();
      await fetchConfigs();
      await onUpdate(true);
      alert('Rotation groups synchronized successfully based on the master schedule.');
    } catch (err) {
      console.error('Sync error:', err);
      alert('Failed to synchronize rotation groups.');
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchConfigs = async () => {
    const { data } = await supabase.from('rotation_configs').select('*');
    if (data) {
      const configMap: Record<string, RotationConfig> = {};
      data.forEach(c => {
        configMap[c.employee_fk] = c;
      });
      setConfigs(configMap);
    }
  };

  const toggleEmployee = (id: string) => {
    setSelectedEmployees(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedEmployees(fieldEmployees.map(e => e.id));
  const clearSelection = () => setSelectedEmployees([]);

  const handleSave = async () => {
    if (selectedEmployees.length === 0) return;
    setIsLoading(true);

    try {
      for (const empId of selectedEmployees) {
        if (rotationType === 'group') {
          // Save group to employee table
          console.log('Updating employee rotation_group:', empId, rotationGroup);
          const { data, error: empError } = await supabase
            .from('employees')
            .update({ rotation_group: rotationGroup })
            .eq('id', empId)
            .select();
          
          console.log('Update result:', { data, empError });
          if (empError) throw empError;

          // Deactivate custom config if it exists
          const existing = configs[empId];
          if (existing) {
            await supabase
              .from('rotation_configs')
              .update({ is_active: false })
              .eq('id', existing.id);
          }
        } else {
          // Save custom config
          const configData = {
            employee_fk: empId,
            weeks_on: weeksOn,
            weeks_off: weeksOff,
            anchor_date: anchorDate,
            is_active: true
          };

          const existing = configs[empId];
          if (existing) {
            await supabase
              .from('rotation_configs')
              .update(configData)
              .eq('id', existing.id);
          } else {
            await supabase
              .from('rotation_configs')
              .insert([configData]);
          }

          // Clear group from employee table
          await supabase
            .from('employees')
            .update({ rotation_group: null })
            .eq('id', empId);
        }

        const emp = fieldEmployees.find(e => e.id === empId);
        if (!emp) continue;

        // Send notification to employee
        const portalMessage = `Update Type: Rotation Pattern Updated\r\nEmployee: ${emp.first_name} ${emp.last_name}\r\nDate Updated: ${new Date().toISOString().split('T')[0]}\r\nWork Week: N/A\r\nPrevious Assignment: N/A\r\nNew Assignment: Rotation Pattern Updated\r\nDays: N/A\r\nWeeks Until New Assignment: N/A`;

        await sendNotification({
          employeeId: empId,
          title: 'Rotation Pattern Updated',
          message: portalMessage,
          type: 'info',
          sendEmail: true,
          emailData: {
            updateType: 'Rotation Pattern Updated',
            jobsiteName: 'Rotation',
            weekStartDate: new Date().toISOString().split('T')[0],
            customEmailBody: portalMessage
          }
        });
      }

      await fetchConfigs();
      onUpdate();
      setSelectedEmployees([]); // Clear selection after save
    } catch (err) {
      console.error('Error saving rotation:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // When a single employee is selected, we can pre-fill the form with their current config
  // If multiple are selected, we leave it as is or default
  useEffect(() => {
    if (selectedEmployees.length === 1) {
      const empId = selectedEmployees[0];
      const emp = fieldEmployees.find(e => e.id === empId);
      const config = configs[empId];

      if (emp?.rotation_group) {
        setRotationType('group');
        setRotationGroup(emp.rotation_group as any);
      } else if (config) {
        setRotationType('custom');
        setWeeksOn(config.weeks_on);
        setWeeksOff(config.weeks_off);
        setAnchorDate(config.anchor_date);
      }
    }
  }, [selectedEmployees, configs, fieldEmployees]);

  return (
    <div className="space-y-6">
      <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-8">
        <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
          <Users size={20} className="text-emerald-500" />
          Group Overview
        </h3>
        <div className="grid grid-cols-4 gap-4">
          {(['A', 'B', 'C', 'D'] as const).map(group => {
            const groupEmployees = fieldEmployees.filter(e => e.rotation_group === group);
            const groupStyles = {
              A: 'border-white/20',
              B: 'border-red-900/30',
              C: 'border-yellow-900/30',
              D: 'border-blue-900/30'
            };
            return (
              <div key={group} className={`bg-black/40 border ${groupStyles[group]} rounded-2xl p-4`}>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-lg font-bold text-white">Group {group}</span>
                  <span className="text-xs font-bold text-gray-500">{groupEmployees.length} Employees</span>
                </div>
                <div className="space-y-2 max-h-[200px] overflow-y-auto scrollbar-hide">
                  {groupEmployees.map(emp => (
                    <div key={emp.id} className="text-xs text-gray-300 bg-white/5 p-2 rounded-lg">
                      {emp.first_name} {emp.last_name}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-8">
          <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
            <RefreshCw className="text-emerald-500" size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white">Rotation Pattern Manager</h2>
            <p className="text-gray-400">Define the work/rotation cycle for each employee.</p>
          </div>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-2xl font-bold transition-all disabled:opacity-50"
          >
            {isSyncing ? <RefreshCw className="animate-spin" size={18} /> : <Database size={18} />}
            Sync All Groups
          </button>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider">Select Employees ({selectedEmployees.length})</label>
              <div className="flex gap-2">
                <button 
                  onClick={selectAll}
                  className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 uppercase tracking-widest"
                >
                  Select All
                </button>
                <span className="text-gray-700">|</span>
                <button 
                  onClick={clearSelection}
                  className="text-[10px] font-bold text-gray-500 hover:text-gray-400 uppercase tracking-widest"
                >
                  Clear
                </button>
              </div>
            </div>
            
            <div className="flex gap-2">
              <input 
                type="text"
                placeholder="Search employees..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-emerald-500 outline-none"
              />
              <select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value as any)}
                className="bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:border-emerald-500 outline-none"
              >
                <option value="All">All Groups</option>
                <option value="A">Group A</option>
                <option value="B">Group B</option>
                <option value="C">Group C</option>
                <option value="D">Group D</option>
              </select>
              <button
                onClick={() => {
                  if (filterGroup === 'All') return;
                  const groupEmployees = fieldEmployees.filter(e => e.rotation_group === filterGroup).map(e => e.id);
                  setSelectedEmployees(prev => Array.from(new Set([...prev, ...groupEmployees])));
                }}
                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 px-4 py-2 rounded-xl text-xs font-bold transition-all"
              >
                Select Group
              </button>
            </div>

            <div className="grid gap-2 max-h-[500px] overflow-y-auto pr-2 scrollbar-hide">
              {fieldEmployees
                .filter(emp => {
                  const matchesSearch = `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchQuery.toLowerCase());
                  const matchesGroup = filterGroup === 'All' || emp.rotation_group === filterGroup;
                  return matchesSearch && matchesGroup;
                })
                .map(emp => {
                  const isSelected = selectedEmployees.includes(emp.id);
                  const groupColor = emp.rotation_group === 'A' ? 'bg-black border border-white/20' :
                                   emp.rotation_group === 'B' ? 'bg-red-500' :
                                   emp.rotation_group === 'C' ? 'bg-yellow-500' :
                                   emp.rotation_group === 'D' ? 'bg-blue-500' : 'bg-emerald-500';

                return (
                  <button
                    key={emp.id}
                    onClick={() => toggleEmployee(emp.id)}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                      isSelected 
                      ? 'bg-emerald-500/10 border-emerald-500 text-white' 
                      : 'bg-black/20 border-white/5 text-gray-400 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-emerald-500">
                        {isSelected ? <CheckSquare size={18} /> : <Square size={18} className="opacity-30" />}
                      </div>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        configs[emp.id] || emp.rotation_group ? `${groupColor} text-white` : 'bg-white/10 text-gray-500'
                      }`}>
                        {emp.first_name[0]}{emp.last_name[0]}
                      </div>
                      <div className="text-left">
                        <div className="font-bold">{emp.first_name} {emp.last_name}</div>
                        <div className="text-[10px] opacity-50">{emp.job_title}</div>
                      </div>
                    </div>
                    {(configs[emp.id] || emp.rotation_group) && (
                      <div className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-lg font-bold">
                        {emp.rotation_group ? `Group ${emp.rotation_group}` : `${configs[emp.id].weeks_on}:${configs[emp.id].weeks_off}`}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={`space-y-6 transition-all ${selectedEmployees.length === 0 ? 'opacity-30 pointer-events-none' : ''}`}>
            <div className="bg-black/20 rounded-3xl p-6 border border-white/5">
              <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                <Clock size={18} className="text-emerald-500" />
                Cycle Configuration
              </h3>

              <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/5 mb-6">
                <button
                  onClick={() => setRotationType('custom')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    rotationType === 'custom' ? 'bg-emerald-500 text-black' : 'text-gray-500 hover:text-white'
                  }`}
                >
                  Custom Pattern
                </button>
                <button
                  onClick={() => setRotationType('group')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                    rotationType === 'group' ? 'bg-emerald-500 text-black' : 'text-gray-500 hover:text-white'
                  }`}
                >
                  Standard Group
                </button>
              </div>
              
              {rotationType === 'custom' ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Weeks On (Work)</label>
                      <input
                        type="number"
                        value={weeksOn}
                        onChange={(e) => setWeeksOn(parseInt(e.target.value))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-emerald-500 outline-none"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase">Weeks Off (Rotation)</label>
                      <input
                        type="number"
                        value={weeksOff}
                        onChange={(e) => setWeeksOff(parseInt(e.target.value))}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-emerald-500 outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase">Anchor Date (Cycle Start)</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                      <select
                        value={anchorDate}
                        onChange={(e) => setAnchorDate(e.target.value)}
                        className="w-full bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-white focus:border-emerald-500 outline-none appearance-none cursor-pointer"
                      >
                        {mondays.map(monday => (
                          <option key={monday.toISOString()} value={format(monday, 'yyyy-MM-dd')}>
                            {format(monday, 'MMM dd, yyyy')} (Monday)
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2">
                      Select the Monday that represents the start of a "Work" block.
                    </p>
                  </div>
                </div>
              ) : (
              <div className="space-y-6">
                  <div className="grid grid-cols-4 gap-3">
                    {(['A', 'B', 'C', 'D'] as const).map(group => {
                      const groupStyles = {
                        A: rotationGroup === 'A' ? 'bg-black border-white/40 text-white' : 'bg-black/40 border-white/5 text-gray-500 hover:border-white/20',
                        B: rotationGroup === 'B' ? 'bg-red-600 border-red-400 text-white' : 'bg-red-900/20 border-red-900/30 text-red-900/50 hover:border-red-500/30',
                        C: rotationGroup === 'C' ? 'bg-yellow-500 border-yellow-400 text-black' : 'bg-yellow-900/20 border-yellow-900/30 text-yellow-900/50 hover:border-yellow-500/30',
                        D: rotationGroup === 'D' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-blue-900/20 border-blue-900/30 text-blue-900/50 hover:border-blue-500/30'
                      };
                      
                      return (
                        <button
                          key={group}
                          onClick={() => setRotationGroup(group)}
                          className={`py-6 rounded-2xl border transition-all flex flex-col items-center gap-2 ${groupStyles[group]}`}
                        >
                          <span className="text-2xl font-bold">{group}</span>
                          <span className="text-[8px] uppercase tracking-widest font-bold">Group</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                    <p className="text-[10px] text-emerald-500/70 leading-relaxed">
                      <span className="font-bold">Group {rotationGroup} Pattern:</span> 3 weeks on, 1 week off. Staggered to ensure continuous staffing across the project.
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={isLoading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-500/20 mt-8"
              >
                {isLoading ? <RefreshCw className="animate-spin" size={20} /> : <Save size={20} />}
                Save Rotation for {selectedEmployees.length} {selectedEmployees.length === 1 ? 'Employee' : 'Employees'}
              </button>
            </div>

            <div className="bg-black/20 rounded-3xl p-6 border border-white/5">
              <h3 className="text-white font-bold mb-6 flex items-center gap-2">
                <Database size={18} className="text-emerald-500" />
                Schedule Population
              </h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Start Date</label>
                  <input
                    type="date"
                    value={popStartDate}
                    onChange={(e) => setPopStartDate(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-emerald-500 outline-none"
                  />
                  <p className="text-[10px] text-gray-500">Next available week: {lastWeek}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase">Weeks to Populate</label>
                  <select
                    value={popWeeks}
                    onChange={(e) => setPopWeeks(parseInt(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-emerald-500 outline-none"
                  >
                    <option value={12}>12 Weeks</option>
                    <option value={36}>36 Weeks</option>
                    <option value={52}>52 Weeks</option>
                    <option value={104}>104 Weeks</option>
                  </select>
                </div>
                <button
                  onClick={handlePopulate}
                  disabled={isPopulating}
                  className="w-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 transition-all"
                >
                  {isPopulating ? <RefreshCw className="animate-spin" size={20} /> : <Database size={20} />}
                  Populate Schedule
                </button>
              </div>
            </div>

            <div className="p-6 bg-blue-500/5 border border-blue-500/20 rounded-3xl">
              <div className="flex gap-3">
                <AlertCircle className="text-blue-400 shrink-0" size={20} />
                <div className="text-xs text-blue-200/70 leading-relaxed">
                  <span className="font-bold text-blue-400">How it works:</span> The system uses this pattern to predict future rotations. If an employee is 3:1, the app will automatically suggest "Rotation" every 4th week. You can always override this by manually assigning a jobsite if they "skip" a rotation.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
