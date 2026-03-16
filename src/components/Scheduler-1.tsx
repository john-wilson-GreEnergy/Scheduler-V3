import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, Jobsite, AssignmentWeek, RotationConfig } from '../types';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format, startOfWeek, addWeeks, isSameWeek } from 'date-fns';
import { Users, MapPin, Calendar, Sparkles, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { isRotationWeek } from '../utils/rotation';

interface SchedulerProps {
  employees: Employee[];
  jobsites: Jobsite[];
}

interface ScheduledAssignment {
  employeeId: string;
  jobsiteId: string;
  weekStart: string;
  isRotation?: boolean;
}

export default function Scheduler({ employees, jobsites }: SchedulerProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<ScheduledAssignment[]>([]);
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [optimizing, setOptimizing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rotationConfigs, setRotationConfigs] = useState<Record<string, RotationConfig>>({});
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [jobsiteSearch, setJobsiteSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchData();
  }, [currentWeek]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const weekStr = format(currentWeek, 'yyyy-MM-dd');
      
      // Fetch assignments for the current week from both tables
      const [weeksRes, assignRes] = await Promise.all([
        supabase.from('assignment_weeks').select('*, items:assignment_items(*)').eq('week_start', weekStr),
        supabase.from('assignments').select('*').eq('week_start', weekStr)
      ]);

      // Fetch rotation configs
      const { data: rotData } = await supabase
        .from('rotation_configs')
        .select('*');

      if (rotData) {
        const configMap: Record<string, RotationConfig> = {};
        rotData.forEach(c => configMap[c.employee_fk] = c);
        setRotationConfigs(configMap);
      }

      const mapped: ScheduledAssignment[] = [];
      const seen = new Set<string>();

      const processWeek = (week: any) => {
        // Match by email (most reliable) or employee_id_ref
        const employee = employees.find(e => 
          (week.email && e.email.toLowerCase() === week.email.toLowerCase()) ||
          (week.employee_id && e.employee_id_ref === week.employee_id)
        );
        
        if (!employee || !employee.is_active) return;

        const key = `${employee.id}-${week.week_start}`;
        if (seen.has(key)) return;

        if (week.assignment_name === 'Rotation' || week.assignment_name === 'Vacation') {
          mapped.push({
            employeeId: employee.id,
            jobsiteId: week.assignment_name.toLowerCase(),
            weekStart: week.week_start,
            isRotation: week.assignment_name === 'Rotation'
          });
          seen.add(key);
          return;
        }

        // Check items first
        if (week.items && week.items.length > 0) {
          week.items.forEach((item: any) => {
            if (item.jobsite_fk) {
              mapped.push({
                employeeId: employee.id,
                jobsiteId: item.jobsite_fk,
                weekStart: week.week_start
              });
              seen.add(key);
            }
          });
        } else if (week.assignment_name) {
          const trimmedName = week.assignment_name.trim().toLowerCase();
          
          // Fallback to assignment_name matching jobsite_name OR jobsite_group
          const jobsite = jobsites.find(j => 
            j.jobsite_name.toLowerCase() === trimmedName ||
            (j.jobsite_group && j.jobsite_group.toLowerCase() === trimmedName)
          );
          
          if (jobsite) {
            mapped.push({
              employeeId: employee.id,
              jobsiteId: jobsite.id,
              weekStart: week.week_start
            });
            seen.add(key);
          } else {
            // Even if jobsite not found in table, track it as a named assignment
            // This helps visibility in other views
            mapped.push({
              employeeId: employee.id,
              jobsiteId: `unmapped-${week.assignment_name}`,
              weekStart: week.week_start
            });
            seen.add(key);
          }
        }
      };

      weeksRes.data?.forEach(processWeek);
      assignRes.data?.forEach(processWeek);
      
      setAssignments(mapped);
    } catch (err) {
      console.error('Error fetching scheduler data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const employeeId = active.id; // This is the UUID
      const weekStr = format(currentWeek, 'yyyy-MM-dd');
      
      const targetDisplaySite = displayJobsites.find(s => s.id === over.id);
      if (!targetDisplaySite) return;

      const actualJobsiteId = targetDisplaySite.isGroup ? targetDisplaySite.siteIds[0] : targetDisplaySite.id;
      const jobsite = jobsites.find(j => j.id === actualJobsiteId);
      const employee = employees.find(e => e.id === employeeId);
      
      if (!jobsite || !employee) return;

      // 1. Update local state
      const newAssignment = {
        employeeId,
        jobsiteId: actualJobsiteId,
        weekStart: weekStr
      };
      
      setAssignments(prev => [
        ...prev.filter(a => a.employeeId !== employeeId || a.weekStart !== weekStr), 
        newAssignment
      ]);

      // 2. Save to Supabase
      try {
        // Find or create assignment week using employee_id (text)
        let { data: week } = await supabase
          .from('assignment_weeks')
          .select('id')
          .eq('employee_id', employee.employee_id_ref)
          .eq('week_start', weekStr)
          .maybeSingle();

        if (!week) {
          const { data: newWeek, error: createError } = await supabase
            .from('assignment_weeks')
            .insert({
              employee_fk: employee.id,
              employee_id: employee.employee_id_ref,
              email: employee.email,
              first_name: employee.first_name,
              last_name: employee.last_name,
              week_start: weekStr,
              assignment_name: targetDisplaySite.jobsite_name, // Use group name if it's a group
              value_type: 'jobsite'
            })
            .select()
            .single();
          
          if (createError) throw createError;
          week = newWeek;
        } else {
          // Update existing week display value and ensure employee_fk is linked
          await supabase
            .from('assignment_weeks')
            .update({
              assignment_name: targetDisplaySite.jobsite_name,
              employee_fk: employee.id
            })
            .eq('id', week.id);
        }

        // Upsert assignment item
        const { error: itemError } = await supabase
          .from('assignment_items')
          .upsert({
            assignment_week_fk: week.id,
            jobsite_fk: actualJobsiteId,
            customer: jobsite.customer,
            normalized_value: targetDisplaySite.jobsite_name,
            item_type: 'jobsite',
            item_order: 0
          }, { onConflict: 'assignment_week_fk' });

        if (itemError) throw itemError;

      } catch (err) {
        console.error('Error saving assignment:', err);
        // Revert local state on error
        fetchData();
      }
    }
    
    setActiveId(null);
  };

  const optimizeWithAI = async () => {
    setOptimizing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `
        Optimize workforce scheduling for GreEnergy Resources for the week of ${format(currentWeek, 'yyyy-MM-dd')}.
        
        Employees: ${JSON.stringify(employees.map(e => ({ 
          id: e.id, 
          name: e.first_name + ' ' + e.last_name, 
          role: e.role,
          onRotation: rotationConfigs[e.id] ? isRotationWeek(currentWeek, rotationConfigs[e.id]) : false
        })))}
        
        Jobsites: ${JSON.stringify(jobsites.map(j => ({ 
          id: j.id, 
          name: j.jobsite_name, 
          customer: j.customer,
          minPersonnel: 2 
        })))}
        
        Current Assignments: ${JSON.stringify(assignments)}
        
        Rules:
        1. Each jobsite MUST have at least 2 people.
        2. Do NOT assign employees who are on rotation (onRotation: true).
        3. Prioritize matching roles to site needs.
        4. If a site is understaffed, suggest moving available employees.
        
        Return a JSON array of NEW assignments to add or change: 
        [{ "employeeId": "...", "jobsiteId": "...", "reason": "..." }]
        Only return the JSON array.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const suggestions = JSON.parse(response.text);
      
      // Apply suggestions (for demo, we just update local state)
      if (Array.isArray(suggestions)) {
        const newAssignments = [...assignments];
        suggestions.forEach(s => {
          const idx = newAssignments.findIndex(a => a.employeeId === s.employeeId && a.weekStart === format(currentWeek, 'yyyy-MM-dd'));
          if (idx > -1) {
            newAssignments[idx].jobsiteId = s.jobsiteId;
          } else {
            newAssignments.push({
              employeeId: s.employeeId,
              jobsiteId: s.jobsiteId,
              weekStart: format(currentWeek, 'yyyy-MM-dd')
            });
          }
        });
        setAssignments(newAssignments);
        // In real app, we would save all these to Supabase
      }
    } catch (err) {
      console.error('AI Optimization error:', err);
    } finally {
      setOptimizing(false);
    }
  };

  const copyPreviousWeek = async () => {
    const prevWeek = addWeeks(currentWeek, -1);
    const prevWeekStr = format(prevWeek, 'yyyy-MM-dd');
    const currentWeekStr = format(currentWeek, 'yyyy-MM-dd');

    setLoading(true);
    try {
      // 1. Get previous week's assignments
      const { data: prevData } = await supabase
        .from('assignment_weeks')
        .select('*')
        .eq('week_start', prevWeekStr);

      if (!prevData || prevData.length === 0) {
        alert("No assignments found for the previous week.");
        return;
      }

      // 2. Prepare new assignments, respecting rotation logic
      const newAssignments = [];
      for (const row of prevData) {
        // Match by email or employee_id
        const employee = employees.find(e => 
          (row.email && e.email.toLowerCase() === row.email.toLowerCase()) ||
          (row.employee_id && e.employee_id_ref === row.employee_id)
        );
        
        if (!employee || !employee.is_active) continue;

        // Check if employee is on rotation for the CURRENT week
        const config = rotationConfigs[employee.id];
        const onRotation = config ? isRotationWeek(currentWeek, config) : false;

        newAssignments.push({
          employee_id: employee.employee_id_ref,
          email: employee.email,
          first_name: employee.first_name,
          last_name: employee.last_name,
          week_start: currentWeekStr,
          assignment_name: onRotation ? 'Rotation' : row.assignment_name,
          value_type: 'jobsite'
        });
      }

      // 3. Upsert to Supabase
      const { error } = await supabase
        .from('assignment_weeks')
        .upsert(newAssignments, { onConflict: 'email,week_start' }); // Use email for conflict since it's most reliable

      if (error) throw error;
      
      fetchData();
    } catch (err) {
      console.error('Error copying previous week:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRotationStatus = (empId: string) => {
    // 1. Check explicit assignment first
    const explicit = assignments.find(a => a.employeeId === empId && a.weekStart === format(currentWeek, 'yyyy-MM-dd'));
    if (explicit?.isRotation) return true;

    // 2. Fallback to calculated config or group
    const employee = employees.find(e => e.id === empId);
    if (!employee) return false;
    
    const config = rotationConfigs[empId];
    return isRotationWeek(currentWeek, config, employee.rotation_group);
  };

  const filteredEmployees = employees.filter(emp => 
    emp.is_active && (
      `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(employeeSearch.toLowerCase()) ||
      emp.job_title?.toLowerCase().includes(employeeSearch.toLowerCase())
    )
  );

  const displayJobsites = useMemo(() => {
    const groups: Record<string, Jobsite[]> = {};
    const ungrouped: Jobsite[] = [];

    jobsites.forEach(site => {
      if (site.jobsite_group) {
        if (!groups[site.jobsite_group]) groups[site.jobsite_group] = [];
        groups[site.jobsite_group].push(site);
      } else {
        ungrouped.push(site);
      }
    });

    const result: any[] = [];

    // Add groups
    Object.entries(groups).forEach(([groupName, sites]) => {
      result.push({
        id: `group-${groupName}`,
        jobsite_name: groupName,
        customer: sites[0].customer,
        city: 'Multiple Locations',
        is_active: sites.some(s => s.is_active),
        isGroup: true,
        siteIds: sites.map(s => s.id),
        min_staffing: sites[0].min_staffing || 2
      });
    });

    // Add ungrouped
    ungrouped.forEach(site => {
      result.push({
        ...site,
        isGroup: false,
        siteIds: [site.id],
        min_staffing: site.min_staffing || 2
      });
    });

    return result;
  }, [jobsites]);

  const filteredJobsites = displayJobsites.filter(site => 
    site.is_active &&
    (site.jobsite_name.toLowerCase().includes(jobsiteSearch.toLowerCase()) ||
    site.customer.toLowerCase().includes(jobsiteSearch.toLowerCase())) &&
    (!selectedGroup || site.customer === selectedGroup)
  );

  const jobsiteGroups = Array.from(new Set(jobsites.map(j => j.customer))).sort();

  const stats = {
    assigned: assignments.length,
    rotation: employees.filter(emp => {
      const config = rotationConfigs[emp.id];
      return isRotationWeek(currentWeek, config, emp.rotation_group);
    }).length,
    vacation: 0, // Placeholder
    training: 0  // Placeholder
  };

  return (
    <div className="h-full flex flex-col bg-[#050A08]">
      {/* Sub Header / Controls */}
      <div className="flex items-center justify-between p-4 border-b border-emerald-900/20 bg-[#0A120F]/50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentWeek(addWeeks(currentWeek, -1))}
              className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
            >
              <Calendar size={16} className="rotate-180" />
            </button>
            <span className="text-white font-mono text-sm bg-emerald-500/10 px-3 py-1.5 rounded-lg border border-emerald-500/20">
              {format(currentWeek, 'MMM dd')} - {format(addWeeks(currentWeek, 1), 'MMM dd, yyyy')}
            </span>
            <button 
              onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
              className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
            >
              <Calendar size={16} />
            </button>
          </div>

          <div className="flex items-center gap-4 border-l border-emerald-900/20 pl-6">
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Assigned</span>
              <span className="text-emerald-500 font-mono font-bold">{stats.assigned}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Rotation</span>
              <span className="text-purple-500 font-mono font-bold">{stats.rotation}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Vacation</span>
              <span className="text-amber-500 font-mono font-bold">{stats.vacation}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={copyPreviousWeek}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white text-sm font-bold rounded-lg hover:bg-white/10 transition-all"
          >
            <RefreshCw size={16} />
            Copy Previous
          </button>
          
          <button 
            onClick={optimizeWithAI}
            disabled={optimizing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-black text-sm font-bold rounded-lg hover:bg-emerald-400 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
          >
            {optimizing ? (
              <RefreshCw className="animate-spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            AI Optimize
          </button>
        </div>
      </div>

      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
          {/* Column 1: Employee Pool */}
          <div className="col-span-3 border-right border-emerald-900/20 flex flex-col bg-[#0A120F]/30">
            <div className="p-4 border-b border-emerald-900/10">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                  <Users size={14} />
                  Employee Pool
                </h3>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-bold">
                  {filteredEmployees.length}
                </span>
              </div>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Search employees..."
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="w-full bg-black/40 border border-emerald-900/30 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
              {filteredEmployees.map(emp => (
                <DraggableEmployee 
                  key={emp.id} 
                  employee={emp} 
                  onRotation={getRotationStatus(emp.id)}
                />
              ))}
            </div>
          </div>

          {/* Column 2: Active Projects */}
          <div className="col-span-6 border-right border-emerald-900/20 flex flex-col">
            <div className="p-4 border-b border-emerald-900/10 bg-[#0A120F]/20">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                  <MapPin size={14} />
                  Active Jobsites
                </h3>
                <div className="flex items-center gap-2">
                  <input 
                    type="text"
                    placeholder="Filter sites..."
                    value={jobsiteSearch}
                    onChange={(e) => setJobsiteSearch(e.target.value)}
                    className="bg-black/40 border border-emerald-900/30 rounded-lg px-3 py-1.5 text-[10px] text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors w-40"
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 gap-4 custom-scrollbar bg-black/10">
              {filteredJobsites.map(site => (
                <DroppableJobsite 
                  key={site.id} 
                  site={site} 
                  currentWeek={currentWeek}
                  rotationConfigs={rotationConfigs}
                  assignedEmployees={employees.filter(e => 
                    assignments.some(a => a.employeeId === e.id && site.siteIds.includes(a.jobsiteId))
                  )}
                />
              ))}
            </div>
          </div>

          {/* Column 3: Jobsite Groups */}
          <div className="col-span-3 flex flex-col bg-[#0A120F]/30">
            <div className="p-4 border-b border-emerald-900/10">
              <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2 mb-4">
                <Users size={14} />
                Jobsite Groups
              </h3>
              <div className="space-y-1">
                <button 
                  onClick={() => setSelectedGroup(null)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${!selectedGroup ? 'bg-emerald-500/10 text-emerald-500 font-bold' : 'text-gray-400 hover:bg-white/5'}`}
                >
                  All Projects
                </button>
                {jobsiteGroups.map(group => (
                  <button 
                    key={group}
                    onClick={() => setSelectedGroup(group)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${selectedGroup === group ? 'bg-emerald-500/10 text-emerald-500 font-bold' : 'text-gray-400 hover:bg-white/5'}`}
                  >
                    {group}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="p-4 mt-auto border-t border-emerald-900/10">
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                <h4 className="text-[10px] font-bold text-emerald-500 uppercase mb-2">Scheduling Health</h4>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                      <span>Total Staffing</span>
                      <span>{Math.round((stats.assigned / employees.length) * 100)}%</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-500" 
                        style={{ width: `${(stats.assigned / employees.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="p-3 bg-emerald-500 text-black font-bold rounded-lg shadow-[0_0_30px_rgba(16,185,129,0.4)] scale-105 border border-emerald-400">
              <div className="text-sm">{employees.find(e => e.id === activeId)?.first_name} {employees.find(e => e.id === activeId)?.last_name}</div>
              <div className="text-[10px] opacity-70">{employees.find(e => e.id === activeId)?.job_title}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function DraggableEmployee({ employee, onRotation, isCompact }: { employee: Employee, onRotation: boolean, isCompact?: boolean, key?: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: employee.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  if (isCompact) {
    return (
      <div 
        ref={setNodeRef} 
        style={style} 
        {...attributes} 
        {...listeners}
        className={`flex items-center justify-between p-1.5 rounded border cursor-grab active:cursor-grabbing transition-all ${
          onRotation 
            ? 'bg-purple-500/10 border-purple-500/30' 
            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-emerald-500/30'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[10px] truncate ${onRotation ? 'text-purple-300' : 'text-white'}`}>{employee.first_name} {employee.last_name}</span>
          {onRotation && <AlertTriangle size={8} className="text-purple-500 flex-shrink-0" />}
        </div>
        <span className={`text-[8px] uppercase font-bold flex-shrink-0 ${onRotation ? 'text-purple-500' : 'text-emerald-500/70'}`}>{employee.role}</span>
      </div>
    );
  }

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      className={`p-2.5 border rounded-lg transition-all cursor-grab active:cursor-grabbing group ${
        onRotation 
          ? 'bg-purple-500/5 border-purple-500/20 opacity-60' 
          : 'bg-white/5 border-white/10 hover:border-emerald-500/50 hover:bg-emerald-500/5'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-white text-xs font-medium truncate">{employee.first_name} {employee.last_name}</div>
            {onRotation && (
              <span className="px-1 py-0.5 bg-purple-500/20 text-purple-400 text-[7px] font-bold uppercase rounded">Rot</span>
            )}
          </div>
          <div className="text-[10px] text-gray-500 truncate">{employee.job_title}</div>
        </div>
        <div className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-all ${
          onRotation ? 'bg-purple-500/10 text-purple-500' : 'bg-emerald-500/10 text-emerald-500 opacity-0 group-hover:opacity-100'
        }`}>
          {onRotation ? <RefreshCw size={12} className="animate-spin-slow" /> : <Users size={12} />}
        </div>
      </div>
    </div>
  );
}

function DroppableJobsite({ site, assignedEmployees, rotationConfigs, currentWeek }: { site: any, assignedEmployees: Employee[], rotationConfigs: Record<string, RotationConfig>, currentWeek: Date, key?: string }) {
  const { setNodeRef, isOver } = useSortable({
    id: site.id,
  });

  const minStaffing = site.min_staffing || 2;
  const isUnderstaffed = assignedEmployees.length < minStaffing;
  const rotationConflicts = assignedEmployees.filter(emp => {
    const config = rotationConfigs[emp.id];
    return isRotationWeek(currentWeek, config, emp.rotation_group);
  });

  return (
    <div 
      ref={setNodeRef}
      className={`p-4 rounded-xl border transition-all flex flex-col h-full ${
        isOver 
          ? 'bg-emerald-500/10 border-emerald-500 scale-[1.02] shadow-[0_0_20px_rgba(16,185,129,0.1)]' 
          : 'bg-[#0A120F] border-emerald-900/30 hover:border-emerald-500/30'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-white truncate">{site.jobsite_name}</h4>
            {site.isGroup && (
              <span className="text-[8px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold uppercase">Group</span>
            )}
          </div>
          <p className="text-[10px] text-gray-500 truncate">{site.customer}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {rotationConflicts.length > 0 && (
            <div className="flex items-center gap-1 text-purple-500 text-[8px] font-bold bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20">
              <RefreshCw size={10} className="animate-spin-slow" />
              ROTATION CONFLICT
            </div>
          )}
          {isUnderstaffed ? (
            <div className="flex items-center gap-1 text-amber-500 text-[8px] font-bold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              <AlertTriangle size={10} />
              LOW STAFF
            </div>
          ) : (
            <div className="flex items-center gap-1 text-emerald-500 text-[8px] font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
              <CheckCircle2 size={10} />
              OK
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-1.5 min-h-[80px] bg-black/40 rounded-lg p-2 border border-emerald-900/10">
        {assignedEmployees.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-700 text-[10px] italic">
            Empty
          </div>
        ) : (
          assignedEmployees.map(emp => (
            <DraggableEmployee 
              key={emp.id} 
              employee={emp} 
              onRotation={isRotationWeek(currentWeek, rotationConfigs[emp.id], emp.rotation_group)}
              isCompact
            />
          ))
        )}
      </div>
      
      <div className="mt-3 flex items-center justify-between text-[9px]">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">Staff: <span className="text-white font-bold">{assignedEmployees.length}</span></span>
          <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all ${isUnderstaffed ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min((assignedEmployees.length / 2) * 100, 100)}%` }}
            />
          </div>
        </div>
        <span className="text-gray-500 flex items-center gap-1 truncate max-w-[80px]">
          <MapPin size={8} />
          {site.city}
        </span>
      </div>
    </div>
  );
}
