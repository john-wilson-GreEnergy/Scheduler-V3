import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, Jobsite, AssignmentWeek, RotationConfig, JobsiteGroup } from '../types';
import { hasCredential } from '../utils';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { format, startOfWeek, addWeeks, isSameWeek } from 'date-fns';
import { assignEmployeeToJobsiteBackend, fetchCurrentScheduleBackend } from '../lib/supabase_functions';
import { parseAssignmentNames } from '../utils/assignmentParser';
import { Users, MapPin, Calendar, AlertTriangle, CheckCircle2, RefreshCw, ChevronRight, Filter, Download, Bell } from 'lucide-react';
import AssignmentModal from './AssignmentModal';
import { motion, AnimatePresence } from 'motion/react';
import { logActivity } from '../lib/logger';
import { isRotationWeek, GROUP_COLORS } from '../utils/rotation';
import { sendNotification } from '../utils/notifications';
import { useAuth } from '../contexts/AuthContext';

interface SchedulerProps {
  employees: Employee[];
  jobsites: Jobsite[];
  jobsiteGroups: JobsiteGroup[];
}

interface ScheduledAssignment {
  employeeId: string;
  jobsiteId: string;
  weekStart: string;
  isRotation?: boolean;
  days?: string[];
  status?: string;
}

export default function Scheduler({ employees, jobsites, jobsiteGroups }: SchedulerProps) {
  const { isAdmin, isSiteManager } = useAuth();
  const canEdit = isAdmin || isSiteManager;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<ScheduledAssignment[]>([]);
  const [initialAssignments, setInitialAssignments] = useState<ScheduledAssignment[] | null>(null);
  const [history, setHistory] = useState<ScheduledAssignment[][]>([]);
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [optimizing, setOptimizing] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rotationConfigs, setRotationConfigs] = useState<Record<string, RotationConfig>>({});
  const getGroupName = (groupId?: string) => {
    return jobsiteGroups.find(g => g.id === groupId)?.name;
  };

  const [employeeSearch, setEmployeeSearch] = useState('');
  const [empFilterFirst, setEmpFilterFirst] = useState('');
  const [empFilterLast, setEmpFilterLast] = useState('');
  const [empFilterTitle, setEmpFilterTitle] = useState('');
  const [empFilterStatus, setEmpFilterStatus] = useState<'all' | 'available' | 'rotation' | 'vacation'>('all');
  const [showEmpFilters, setShowEmpFilters] = useState(false);
  
  const [jobsiteSearch, setJobsiteSearch] = useState('');
  const [jobsiteSort, setJobsiteSort] = useState<'staff-desc' | 'staff-asc' | 'name-asc' | 'name-desc'>('staff-desc');

  const undoAssignment = () => {
    if (history.length === 0) return;
    const previousAssignments = history[history.length - 1];
    setAssignments(previousAssignments);
    setHistory(prev => prev.slice(0, -1));
    // Note: This only reverts local state. Reverting Supabase would require more complex logic.
    // For now, we'll keep it simple.
  };

  const exportToCSV = () => {
    const headers = ['Employee Name', 'Jobsite', 'Week Start'];
    const rows = assignments.map(a => {
      const emp = employees.find(e => e.id === a.employeeId);
      const jobsite = jobsites.find(j => j.id === a.jobsiteId);
      return [
        emp ? `${emp.first_name} ${emp.last_name}` : 'Unknown',
        jobsite ? jobsite.jobsite_name : a.jobsiteId,
        a.weekStart
      ];
    });

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `schedule_${format(currentWeek, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const notifyAllEmployees = async () => {
    setNotifying(true);
    try {
      for (const emp of employees) {
        const empAssignments = assignments.filter(a => a.employeeId === emp.id);
        if (empAssignments.length === 0) continue;
        
        const weekStr = format(currentWeek, 'yyyy-MM-dd');
        const weeksUntil = Math.max(0, Math.round((new Date(weekStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 7)));
        const jobsiteName = empAssignments.map(a => jobsites.find(j => j.id === a.jobsiteId)?.jobsite_name || 'Unknown').join(', ');
        const portalMessage = `Update Type: Schedule Published\r\nEmployee: ${emp.first_name} ${emp.last_name}\r\nDate Updated: ${new Date().toISOString().split('T')[0]}\r\nWork Week: ${weekStr}\r\nAssignment: ${jobsiteName}\r\nDays: Mon, Tue, Wed, Thu, Fri, Sat, Sun\r\nWeeks Until New Assignment: ${weeksUntil}`;
        
        await sendNotification({
          employeeId: emp.id,
          title: 'Weekly Schedule Assignment',
          message: portalMessage,
          type: 'info',
          sendEmail: true,
          emailData: {
            updateType: 'Weekly Schedule',
            jobsiteName: jobsiteName,
            weekStartDate: format(currentWeek, 'MMM dd, yyyy'),
            customEmailBody: portalMessage
          }
        });
      }
      console.log('Notifications sent to all employees with assignments.');
    } catch (err) {
      console.error('Error notifying employees:', err);
    } finally {
      setNotifying(false);
    }
  };

  const notifyChangedEmployees = async () => {
    if (!initialAssignments) return;
    setNotifying(true);
    try {
      const initialMap = new Map<string, string>(initialAssignments.map(a => [a.employeeId, a.jobsiteId]));
      const currentMap = new Map<string, string>(assignments.map(a => [a.employeeId, a.jobsiteId]));
      
      const changedEmployees = new Set<string>();
      
      // Check for changes
      for (const [empId, jobsiteId] of currentMap.entries()) {
        if (initialMap.get(empId) !== jobsiteId) {
          changedEmployees.add(empId);
        }
      }
      for (const [empId] of initialMap.entries()) {
        if (!currentMap.has(empId)) {
          changedEmployees.add(empId);
        }
      }

      for (const empId of changedEmployees) {
        const emp = employees.find(e => e.id === empId);
        if (!emp) continue;
        
        const empAssignments = assignments.filter(a => a.employeeId === emp.id);
        const weekStr = format(currentWeek, 'yyyy-MM-dd');
        const weeksUntil = Math.max(0, Math.round((new Date(weekStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 7)));
        const jobsiteName = empAssignments.length > 0 
          ? empAssignments.map(a => jobsites.find(j => j.id === a.jobsiteId)?.jobsite_name || 'Unknown').join(', ')
          : 'None';
        
        const portalMessage = `Update Type: Schedule Update\r\nEmployee: ${emp.first_name} ${emp.last_name}\r\nDate Updated: ${new Date().toISOString().split('T')[0]}\r\nWork Week: ${weekStr}\r\nNew Assignment: ${jobsiteName}\r\nDays: Mon, Tue, Wed, Thu, Fri, Sat, Sun\r\nWeeks Until New Assignment: ${weeksUntil}`;
        
        await sendNotification({
          employeeId: emp.id,
          title: 'Schedule Update',
          message: portalMessage,
          type: 'info',
          sendEmail: true,
          emailData: {
            updateType: 'Schedule Update',
            jobsiteName: jobsiteName,
            weekStartDate: format(currentWeek, 'MMM dd, yyyy'),
            customEmailBody: portalMessage
          }
        });
      }
      console.log('Notifications sent to employees with changed assignments.');
    } catch (err) {
      console.error('Error notifying employees:', err);
    } finally {
      setNotifying(false);
    }
  };
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [isEmployeePoolOpen, setIsEmployeePoolOpen] = useState(false);
  const [conflictModal, setConflictModal] = useState<{
    employeeId: string;
    jobsiteId: string;
    displaySiteId?: string;
    weekStr: string;
    previousJobsiteName: string;
  } | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<{
    employeeId: string;
    targetJobsites: Jobsite[];
    weekStr: string;
  } | null>(null);
  const [isGroupsOpen, setIsGroupsOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  useEffect(() => {
    fetchData();
  }, [currentWeek, employees, jobsites]);

  const fetchData = async () => {
    console.log('Scheduler: Fetching data for week:', format(currentWeek, 'yyyy-MM-dd'));
    setLoading(true);
    setInitialAssignments(null);
    try {
      const weekStr = format(currentWeek, 'yyyy-MM-dd');
      
      // 1. Fetch current schedule from backend view
      const scheduleData = await fetchCurrentScheduleBackend(weekStr);
      console.log('Scheduler: scheduleData from view:', scheduleData);

      // 2. Fetch rotation configs
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

      scheduleData.forEach((row: any) => {
        // Skip inactive employees (view already filters, but being safe)
        if (!row.employee_fk) return;

        // Robustly determine assignment type if missing
        const effectiveAssignmentType = row.assignment_type || row.jobsite_name || 'Unassigned';

        const key = `${row.employee_fk}-${row.week_start}-${row.jobsite_id || effectiveAssignmentType}`;
        if (seen.has(key)) return;

        mapped.push({
          employeeId: row.employee_fk,
          jobsiteId: row.jobsite_id || effectiveAssignmentType.toLowerCase(),
          weekStart: row.week_start,
          isRotation: row.value_type === 'rotation' || effectiveAssignmentType.toLowerCase() === 'rotation',
          days: row.days,
          status: row.status || 'assigned'
        });
        seen.add(key);
      });

      setAssignments(mapped);
      setInitialAssignments(mapped);
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (event: any) => {
    setActiveId(event.active.id);
  };

  const executeAssignment = async (employeeId: string, actualJobsiteId: string, weekStr: string, targetDisplaySite: any, previousJobsiteName: string = 'None') => {
      console.log('Executing assignment:', { employeeId, actualJobsiteId, weekStr, targetDisplaySite, previousJobsiteName });
      if (!targetDisplaySite) {
        console.error('executeAssignment called with missing targetDisplaySite');
        return;
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const previousAssignments = assignments;
      setHistory(prev => [...prev, assignments]);
      setAssignments(prev => [
        ...prev.filter(a => a.employeeId !== employeeId || a.weekStart !== weekStr), 
        { employeeId, jobsiteId: actualJobsiteId, weekStart: weekStr }
      ]);

      try {
        await assignEmployeeToJobsiteBackend(employeeId, actualJobsiteId, weekStr, user.id);
        console.log('Backend assignment success');
        
        // Log the activity
        await logActivity('assignment_update', {
          employee_fk: employeeId,
          jobsite_fk: actualJobsiteId,
          week_start: weekStr,
          jobsite_name: targetDisplaySite.jobsite_name,
          previous_jobsite: previousJobsiteName
        });
      } catch (err) {
        console.error('Error saving assignment via backend:', err);
        setAssignments(previousAssignments); // Revert local state
      }
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    console.log('Drag end:', { activeId: active.id, overId: over?.id });
    setActiveId(null);
    
    if (over && active.id !== over.id) {
      const employeeId = active.id; // This is the UUID
      const weekStr = format(currentWeek, 'yyyy-MM-dd');
      
      const targetDisplaySite = displayJobsites.find(s => s.id === over.id);
      if (!targetDisplaySite) return;

      const targetJobsites = targetDisplaySite.isGroup 
        ? jobsites.filter(j => targetDisplaySite.siteIds.includes(j.id))
        : [targetDisplaySite];
        
      setAssignmentModal({
        employeeId,
        targetJobsites,
        weekStr
      });
      return; // Skip the rest of the original code
    }
    
    setActiveId(null);
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
        // Match by employee_fk (UUID)
        const employee = employees.find(e => 
          (row.employee_fk && e.id === row.employee_fk)
        );
        
        if (!employee || !employee.is_active) continue;

        // Check if employee is on rotation for the CURRENT week
        const config = rotationConfigs[employee.id];
        const onRotation = config ? isRotationWeek(currentWeek, config) : false;

        newAssignments.push({
          employee_fk: employee.id,
          week_start: currentWeekStr,
          assignment_type: onRotation ? 'Rotation' : row.assignment_type,
          status: onRotation ? 'rotation' : (row.status || 'unassigned')
        });
      }

      // 3. Upsert to Supabase
      for (const assignment of newAssignments) {
        const { data: existing, error: fetchError } = await supabase
          .from('assignment_weeks')
          .select('id')
          .eq('employee_fk', assignment.employee_fk)
          .eq('week_start', assignment.week_start)
          .maybeSingle();
        
        if (fetchError) throw fetchError;

        if (existing) {
          const { data, error } = await supabase
            .from('assignment_weeks')
            .update(assignment)
            .eq('id', existing.id)
            .select('id')
            .single();
          if (error) throw error;
          const assignmentWeekId = data.id;
          
          // Update assignment_items
          await supabase
            .from('assignment_items')
            .delete()
            .eq('assignment_week_fk', assignmentWeekId);
            
          const jobsite = jobsites.find(j => j.jobsite_name === assignment.assignment_type);
          if (jobsite) {
            await supabase
              .from('assignment_items')
              .insert({
                assignment_week_fk: assignmentWeekId,
                jobsite_fk: jobsite.id,
                days: [1, 2, 3, 4, 5],
                week_start: assignment.week_start
              });
          }
        } else {
          const { data, error } = await supabase
            .from('assignment_weeks')
            .insert(assignment)
            .select('id')
            .single();
          if (error) throw error;
          const assignmentWeekId = data.id;
          
          // Insert assignment_items
          const jobsite = jobsites.find(j => j.jobsite_name === assignment.assignment_type);
          if (jobsite) {
            await supabase
              .from('assignment_items')
              .insert({
                assignment_week_fk: assignmentWeekId,
                jobsite_fk: jobsite.id,
                days: [1, 2, 3, 4, 5],
                week_start: assignment.week_start
              });
          }
        }
      }
      
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
    const employeeWithConfig = { ...employee, rotation_config: config };
    return isRotationWeek(currentWeek, employeeWithConfig);
  };

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (!emp.is_active) return false;

      const matchFirst = emp.first_name.toLowerCase().includes(empFilterFirst.toLowerCase());
      const matchLast = emp.last_name.toLowerCase().includes(empFilterLast.toLowerCase());
      const matchTitle = (emp.job_title || '').toLowerCase().includes(empFilterTitle.toLowerCase());
      
      let matchStatus = true;
      if (empFilterStatus !== 'all') {
        const isRot = getRotationStatus(emp.id);
        const isVac = assignments.some(a => a.employeeId === emp.id && a.weekStart === format(currentWeek, 'yyyy-MM-dd') && a.jobsiteId === 'vacation');
        
        if (empFilterStatus === 'rotation') matchStatus = isRot;
        else if (empFilterStatus === 'vacation') matchStatus = isVac;
        else if (empFilterStatus === 'available') matchStatus = !isRot && !isVac;
      }

      const matchGeneral = employeeSearch === '' || (
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(employeeSearch.toLowerCase()) ||
        emp.job_title?.toLowerCase().includes(employeeSearch.toLowerCase())
      );

      return matchFirst && matchLast && matchTitle && matchStatus && matchGeneral;
    });
  }, [employees, empFilterFirst, empFilterLast, empFilterTitle, empFilterStatus, employeeSearch, assignments, currentWeek, rotationConfigs]);

  const displayJobsites = useMemo(() => {
    const groups: Record<string, Jobsite[]> = {};
    const ungrouped: Jobsite[] = [];

    jobsites.forEach(site => {
      if (site.group_id) {
        if (!groups[site.group_id]) groups[site.group_id] = [];
        groups[site.group_id].push(site);
      } else {
        ungrouped.push(site);
      }
    });

    const result: any[] = [];

    // Add groups
    Object.entries(groups).forEach(([groupId, sites]) => {
      const group = jobsiteGroups.find(g => g.id === groupId);
      const groupName = group ? group.name : 'Unknown Group';
      
      const isActive = assignments.some(a => 
        a.weekStart === format(currentWeek, 'yyyy-MM-dd') && 
        sites.some(s => s.id === a.jobsiteId)
      );

      result.push({
        id: `group-${groupId}`,
        jobsite_name: groupName,
        customer: sites[0].customer,
        city: 'Multiple Locations',
        is_active: isActive,
        isGroup: true,
        siteIds: sites.map(s => s.id),
        min_staffing: sites[0].min_staffing || 2
      });
    });

    // Add ungrouped
    ungrouped.forEach(site => {
      const isActive = assignments.some(a => 
        a.weekStart === format(currentWeek, 'yyyy-MM-dd') && 
        a.jobsiteId === site.id
      );

      result.push({
        ...site,
        is_active: isActive,
        isGroup: false,
        siteIds: [site.id],
        min_staffing: site.min_staffing || 2
      });
    });

    return result;
  }, [jobsites, jobsiteGroups, assignments, currentWeek]);

  const getJobsiteStaffCount = (site: any) => {
    return assignments.filter(a => 
      a.weekStart === format(currentWeek, 'yyyy-MM-dd') && 
      (site.isGroup ? site.siteIds.includes(a.jobsiteId) : a.jobsiteId === site.id)
    ).length;
  };

  const filteredJobsites = useMemo(() => {
    let result = displayJobsites.filter(site => 
      site.is_active &&
      (site.jobsite_name.toLowerCase().includes(jobsiteSearch.toLowerCase()) ||
      site.customer.toLowerCase().includes(jobsiteSearch.toLowerCase())) &&
      (!selectedGroup || site.customer === selectedGroup)
    );

    result.sort((a, b) => {
      if (jobsiteSort === 'staff-desc' || jobsiteSort === 'staff-asc') {
        const countA = getJobsiteStaffCount(a);
        const countB = getJobsiteStaffCount(b);
        if (countA !== countB) {
          return jobsiteSort === 'staff-desc' ? countB - countA : countA - countB;
        }
      }
      
      const nameA = a.jobsite_name.toLowerCase();
      const nameB = b.jobsite_name.toLowerCase();
      if (jobsiteSort === 'name-desc') return nameB.localeCompare(nameA);
      return nameA.localeCompare(nameB);
    });

    return result;
  }, [displayJobsites, jobsiteSearch, selectedGroup, jobsiteSort, assignments, currentWeek]);

  const sortedJobsiteGroups = useMemo(() => {
    return jobsiteGroups.sort((a, b) => a.name.localeCompare(b.name));
  }, [jobsiteGroups]);

  const stats = useMemo(() => {
    const rotationJobsite = jobsites.find(j => j.jobsite_name.toLowerCase() === 'rotation');
    const rotationJobsiteId = rotationJobsite?.id;

    const rotationSet = new Set<string>();
    const vacationSet = new Set<string>();
    const trainingSet = new Set<string>();
    const jobsiteSet = new Set<string>();

    assignments.forEach(a => {
      // Check if it's the rotation jobsite OR the old rotation status
      if ((rotationJobsiteId && a.jobsiteId === rotationJobsiteId) || a.status === 'rotation' || a.jobsiteId === 'rotation') {
        rotationSet.add(a.employeeId);
      } else if (a.jobsiteId === 'vacation') {
        vacationSet.add(a.employeeId);
      } else if (a.status === 'training') {
        trainingSet.add(a.employeeId);
      } else {
        jobsiteSet.add(a.employeeId);
      }
    });

    // Remove employees from jobsiteSet if they are in any other set
    rotationSet.forEach(id => jobsiteSet.delete(id));
    vacationSet.forEach(id => jobsiteSet.delete(id));
    trainingSet.forEach(id => jobsiteSet.delete(id));

    const activeFieldEmployees = employees.filter(e => e.is_active && e.role !== 'hr');
    const unassigned = Math.max(0, activeFieldEmployees.length - (rotationSet.size + vacationSet.size + trainingSet.size + jobsiteSet.size));

    return {
      assigned: jobsiteSet.size,
      rotation: rotationSet.size,
      vacation: vacationSet.size,
      training: trainingSet.size,
      unassigned
    };
  }, [assignments, employees, jobsites]);

  const handleConfirmAssignment = async (action: 'replace' | 'add', jobsiteDays: Record<string, string[]>) => {
    if (!assignmentModal) return;
    
    const { employeeId, weekStr } = assignmentModal;
    const employee = employees.find(e => e.id === employeeId);
    if (!employee) return;

    // TODO: Handle 'replace' vs 'add' logic with days
    // For now, just call executeAssignment for each jobsite
    for (const [jobsiteId, days] of Object.entries(jobsiteDays)) {
      const jobsite = jobsites.find(j => j.id === jobsiteId);
      if (jobsite) {
        await executeAssignment(employeeId, jobsiteId, weekStr, jobsite, 'None');
      }
    }
    setAssignmentModal(null);
  };

  return (
    <div className="h-full flex flex-col bg-[#050A08]">
      {assignmentModal && (
        <AssignmentModal
          isOpen={!!assignmentModal}
          onClose={() => setAssignmentModal(null)}
          employee={employees.find(e => e.id === assignmentModal.employeeId)!}
          targetJobsites={assignmentModal.targetJobsites}
          allJobsites={jobsites}
          weekStart={assignmentModal.weekStr}
          onConfirm={handleConfirmAssignment}
        />
      )}
      {/* Sub Header / Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between p-4 gap-4 border-b border-emerald-900/20 bg-[#0A120F]/50">
        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-emerald-900/30 w-full sm:w-auto justify-between sm:justify-start">
            <button 
              onClick={() => setCurrentWeek(addWeeks(currentWeek, -1))}
              className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
            >
              <Calendar size={16} className="rotate-180" />
            </button>
            <span className="text-white font-mono text-[10px] sm:text-sm px-3 py-1.5">
              {format(currentWeek, 'MMM dd')} - {format(addWeeks(currentWeek, 1), 'MMM dd, yyyy')}
            </span>
            <button 
              onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
              className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
            >
              <Calendar size={16} />
            </button>
          </div>

          <div className="flex items-center gap-6 sm:border-l sm:border-emerald-900/20 sm:pl-6 w-full sm:w-auto justify-around sm:justify-start">
            <div className="flex flex-col items-center sm:items-start">
              <span className="text-[9px] sm:text-[10px] text-gray-500 uppercase font-bold tracking-wider">Assigned</span>
              <span className="text-emerald-500 font-mono font-bold text-sm sm:text-base">{stats.assigned}</span>
            </div>
            <div className="flex flex-col items-center sm:items-start">
              <span className="text-[9px] sm:text-[10px] text-gray-500 uppercase font-bold tracking-wider">Rotation</span>
              <span className="text-purple-500 font-mono font-bold text-sm sm:text-base">{stats.rotation}</span>
            </div>
            <div className="flex flex-col items-center sm:items-start">
              <span className="text-[9px] sm:text-[10px] text-gray-500 uppercase font-bold tracking-wider">Vacation</span>
              <span className="text-amber-500 font-mono font-bold text-sm sm:text-base">{stats.vacation}</span>
            </div>
            <div className="flex flex-col items-center sm:items-start">
              <span className="text-[9px] sm:text-[10px] text-gray-500 uppercase font-bold tracking-wider">Unassigned</span>
              <span className="text-rose-500 font-mono font-bold text-sm sm:text-base">{stats.unassigned}</span>
            </div>
            <div className="flex flex-col items-center sm:items-start">
              <span className="text-[9px] sm:text-[10px] text-gray-500 uppercase font-bold tracking-wider">Rotation Group</span>
              <div className="flex gap-2 mt-1">
                {['A', 'B', 'C', 'D'].map((group) => {
                  const isRotation = isRotationWeek(currentWeek, undefined, group as any);
                  const color = GROUP_COLORS[group as keyof typeof GROUP_COLORS];
                  return (
                    <div key={group} className={`flex items-center gap-1 px-1.5 py-0.5 rounded ${isRotation ? 'bg-opacity-20' : 'bg-white/5'}`} style={{ backgroundColor: isRotation ? `${color}20` : undefined }}>
                      <div className={`w-1.5 h-1.5 rounded-full`} style={{ backgroundColor: isRotation ? color : '#4b5563' }} />
                      <span className={`text-[9px] font-bold ${isRotation ? 'text-white' : 'text-gray-500'}`}>{group}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button 
            onClick={undoAssignment}
            disabled={!canEdit || history.length === 0}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-bold rounded-lg hover:bg-white/10 transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} />
            <span className="hidden xs:inline">Undo</span>
          </button>

          <button 
            onClick={exportToCSV}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-bold rounded-lg hover:bg-white/10 transition-all"
          >
            <Download size={14} />
            <span className="hidden xs:inline">Export CSV</span>
          </button>

          <button 
            onClick={notifyAllEmployees}
            disabled={!canEdit || notifying}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-500/20 border border-blue-500/30 text-blue-400 text-xs sm:text-sm font-bold rounded-lg hover:bg-blue-500/30 transition-all disabled:opacity-50"
          >
            {notifying ? (
              <RefreshCw className="animate-spin" size={14} />
            ) : (
              <Bell size={14} />
            )}
            <span className="hidden xs:inline">Notify All</span>
          </button>

          <button 
            onClick={notifyChangedEmployees}
            disabled={!canEdit || notifying || !initialAssignments}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600/20 border border-blue-600/30 text-blue-300 text-xs sm:text-sm font-bold rounded-lg hover:bg-blue-600/30 transition-all disabled:opacity-50"
          >
            {notifying ? (
              <RefreshCw className="animate-spin" size={14} />
            ) : (
              <Bell size={14} />
            )}
            <span className="hidden xs:inline">Notify Changes</span>
          </button>

          <button 
            onClick={copyPreviousWeek}
            disabled={!canEdit}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white text-xs sm:text-sm font-bold rounded-lg hover:bg-white/10 transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} />
            <span className="hidden xs:inline">Copy Previous</span>
            <span className="xs:hidden">Copy</span>
          </button>
        </div>
      </div>

      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <DragOverlay style={{ zIndex: 1000 }}>
          {activeId && employees.find(e => e.id === activeId) ? (
            <DraggableEmployee 
              employee={employees.find(e => e.id === activeId)!} 
              isRotation={getRotationStatus(activeId)}
              isInternal={false}
              isVacation={false}
              activeId={activeId}
              canEdit={canEdit}
              isOverlay={true}
            />
          ) : null}
        </DragOverlay>
        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-0 overflow-hidden">
          {/* Column 1: Employee Pool */}
          <div className={`lg:col-span-2 border-b lg:border-b-0 lg:border-r border-emerald-900/20 flex flex-col bg-[#0A120F]/30 transition-all duration-300 ${isEmployeePoolOpen ? 'max-h-[500px]' : 'max-h-[60px] lg:max-h-none'}`}>
            <button 
              onClick={() => setIsEmployeePoolOpen(!isEmployeePoolOpen)}
              className="p-4 border-b border-emerald-900/10 flex items-center justify-between lg:cursor-default w-full"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-[10px] sm:text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                  <Users size={14} />
                  Employee Pool
                </h3>
                <span className="text-[9px] sm:text-[10px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full font-bold">
                  {filteredEmployees.length}
                </span>
              </div>
              <div className="lg:hidden">
                <ChevronRight size={16} className={`text-emerald-500 transition-transform ${isEmployeePoolOpen ? 'rotate-90' : ''}`} />
              </div>
            </button>
            <div className={`flex-1 flex flex-col overflow-hidden transition-opacity duration-300 ${isEmployeePoolOpen ? 'opacity-100' : 'opacity-0 lg:opacity-100'}`}>
              <div className="p-4 border-b border-emerald-900/10">
                <div className="flex items-center gap-2 mb-2">
                  <div className="relative flex-1">
                    <input 
                      type="text"
                      placeholder="Search employees..."
                      value={employeeSearch}
                      onChange={(e) => setEmployeeSearch(e.target.value)}
                      className="w-full bg-black/40 border border-emerald-900/30 rounded-lg px-3 py-2 text-xs text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
                    />
                  </div>
                  <button
                    onClick={() => setShowEmpFilters(!showEmpFilters)}
                    className={`p-2 rounded-lg border transition-colors ${showEmpFilters ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'bg-black/40 border-emerald-900/30 text-gray-400 hover:text-white'}`}
                  >
                    <Filter size={16} />
                  </button>
                </div>
                
                <AnimatePresence>
                  {showEmpFilters && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-2 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input 
                            type="text"
                            placeholder="First Name"
                            value={empFilterFirst}
                            onChange={(e) => setEmpFilterFirst(e.target.value)}
                            className="w-full bg-black/40 border border-emerald-900/30 rounded-lg px-2 py-1.5 text-[10px] text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50"
                          />
                          <input 
                            type="text"
                            placeholder="Last Name"
                            value={empFilterLast}
                            onChange={(e) => setEmpFilterLast(e.target.value)}
                            className="w-full bg-black/40 border border-emerald-900/30 rounded-lg px-2 py-1.5 text-[10px] text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                        <input 
                          type="text"
                          placeholder="Job Title"
                          value={empFilterTitle}
                          onChange={(e) => setEmpFilterTitle(e.target.value)}
                          className="w-full bg-black/40 border border-emerald-900/30 rounded-lg px-2 py-1.5 text-[10px] text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50"
                        />
                        <select
                          value={empFilterStatus}
                          onChange={(e) => setEmpFilterStatus(e.target.value as any)}
                          className="w-full bg-black/40 border border-emerald-900/30 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-emerald-500/50"
                        >
                          <option value="all">All Statuses</option>
                          <option value="available">Available</option>
                          <option value="rotation">On Rotation</option>
                          <option value="vacation">On Vacation</option>
                        </select>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {filteredEmployees.map(emp => (
                  <DraggableEmployee 
                    key={emp.id} 
                    employee={emp} 
                    isRotation={getRotationStatus(emp.id)}
                    isInternal={false}
                    isVacation={false}
                    activeId={activeId}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Column 2: Active Projects */}
          <div className="flex-1 lg:col-span-10 border-b lg:border-b-0 lg:border-r border-emerald-900/20 flex flex-col min-h-0">
            <div className="p-4 border-b border-emerald-900/10 bg-[#0A120F]/20">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                  <MapPin size={14} />
                  Active Jobsites
                </h3>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedGroup || 'all'}
                    onChange={(e) => setSelectedGroup(e.target.value === 'all' ? null : e.target.value)}
                    className="bg-black/40 border border-emerald-900/30 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                  >
                    <option value="all">All Groups</option>
                    {sortedJobsiteGroups.map(group => (
                      <option key={group.id} value={group.name}>{group.name}</option>
                    ))}
                  </select>
                  <select
                    value={jobsiteSort}
                    onChange={(e) => setJobsiteSort(e.target.value as any)}
                    className="bg-black/40 border border-emerald-900/30 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                  >
                    <option value="staff-desc">Most Staffed</option>
                    <option value="staff-asc">Least Staffed</option>
                    <option value="name-asc">Name (A-Z)</option>
                    <option value="name-desc">Name (Z-A)</option>
                  </select>
                  <input 
                    type="text"
                    placeholder="Filter sites..."
                    value={jobsiteSearch}
                    onChange={(e) => setJobsiteSearch(e.target.value)}
                    className="bg-black/40 border border-emerald-900/30 rounded-lg px-3 py-1.5 text-[10px] text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50 transition-colors w-32 sm:w-40"
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 lg:p-6 flex flex-wrap gap-4 content-start custom-scrollbar bg-black/10">
              {filteredJobsites.map(site => (
                <div key={site.id} className="w-full sm:w-[calc(50%-8px)] lg:w-[calc(33.33%-11px)]">
                  <DroppableJobsite 
                    site={site} 
                    currentWeek={currentWeek}
                    rotationConfigs={rotationConfigs}
                    assignedEmployees={employees.filter(e => 
                      assignments.some(a => a.employeeId === e.id && (site.isGroup ? site.siteIds.includes(a.jobsiteId) : a.jobsiteId === site.id))
                    )}
                    activeId={activeId}
                    assignments={assignments}
                    jobsites={jobsites}
                    canEdit={canEdit}
                  />
                </div>
              ))}
            </div>
          </div>

        </div>

        
      </DndContext>
      {conflictModal && (
        <ConflictModal 
          conflict={conflictModal} 
          onResolve={async () => {
            const targetDisplaySite = displayJobsites.find(s => s.id === conflictModal.displaySiteId);
            if (!targetDisplaySite) {
              console.error('Target display site not found for conflict resolution:', conflictModal.displaySiteId);
              setConflictModal(null);
              return;
            }
            await executeAssignment(conflictModal.employeeId, conflictModal.jobsiteId, conflictModal.weekStr, targetDisplaySite, conflictModal.previousJobsiteName);
            setConflictModal(null);
          }}
          onCancel={() => setConflictModal(null)}
          displayJobsites={displayJobsites}
        />
      )}
    </div>
  );
}

function ConflictModal({ conflict, onResolve, onCancel, displayJobsites }: { conflict: any, onResolve: () => void, onCancel: () => void, displayJobsites: any[] }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[#0A120F] border border-emerald-900/30 p-6 rounded-xl max-w-sm w-full">
        <h3 className="text-lg font-bold text-white mb-4">Conflict Detected</h3>
        <p className="text-gray-400 mb-6">This employee is already assigned to another jobsite for this week. Do you want to reassign them?</p>
        <div className="flex gap-4">
          <button onClick={onCancel} className="flex-1 px-4 py-2 bg-white/5 text-white rounded-lg">Cancel</button>
          <button onClick={onResolve} className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg">Reassign</button>
        </div>
      </div>
    </div>
  );
}

const DraggableEmployee: React.FC<{ employee: Employee, isRotation: boolean, isInternal: boolean, isVacation: boolean, isCompact?: boolean, activeId: string | null, canEdit: boolean, days?: string[], rotationConfigs?: Record<string, RotationConfig>, currentWeek: Date, isOverlay?: boolean }> = ({ employee, isRotation, isInternal, isVacation, isCompact, activeId, canEdit, days, rotationConfigs = {}, currentWeek, isOverlay }) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: employee.id,
    disabled: !canEdit || !!isOverlay,
  });
  const isDragging = activeId === employee.id;
  
  const config = rotationConfigs[employee.id];
  const isScheduledForRotation = isRotationWeek(currentWeek, { ...employee, rotation_config: config });
  const isRotationConflict = isScheduledForRotation && !isInternal && !isVacation;

  const groupColor = employee.rotation_group === 'A' ? 'bg-black border border-white/20' :
                   employee.rotation_group === 'B' ? 'bg-red-500' :
                   employee.rotation_group === 'C' ? 'bg-yellow-500' :
                   employee.rotation_group === 'D' ? 'bg-blue-500' : 'bg-purple-500';

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  // Color logic
  let bgColor = 'bg-white/5';
  let borderColor = 'border-white/10';
  let textColor = 'text-white';
  let hoverBorder = 'hover:border-emerald-500/30';

  if (isRotationConflict) {
    bgColor = 'bg-purple-500/10';
    borderColor = 'border-purple-500/30';
    textColor = 'text-purple-300';
    hoverBorder = 'hover:border-purple-500/50';
  } else if (isRotation) {
    bgColor = 'bg-purple-500/10';
    borderColor = 'border-purple-500/30';
    textColor = 'text-purple-300';
    hoverBorder = 'hover:border-purple-500/50';
  } else if (isVacation) {
    bgColor = 'bg-red-500/10';
    borderColor = 'border-red-500/30';
    textColor = 'text-red-300';
    hoverBorder = 'hover:border-red-500/50';
  } else if (isInternal) {
    bgColor = 'bg-yellow-500/10';
    borderColor = 'border-yellow-500/30';
    textColor = 'text-yellow-300';
    hoverBorder = 'hover:border-yellow-500/50';
  }

  if (isCompact) {
    return (
      <div 
        ref={setNodeRef} 
        style={style} 
        {...attributes} 
        {...listeners}
        className={`flex items-center justify-between p-1.5 rounded border cursor-grab active:cursor-grabbing transition-all ${bgColor} ${borderColor} hover:bg-white/10 ${hoverBorder}`}
        title={isRotationConflict ? 'Rotation Conflict: Employee is scheduled for rotation but assigned to a jobsite.' : undefined}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {employee.rotation_group && <div className={`w-1.5 h-1.5 rounded-full ${groupColor}`} title={`Rotation Group ${employee.rotation_group}`} />}
          <span className={`text-[10px] truncate ${textColor}`}>{employee.first_name} {employee.last_name}</span>
            {days && days.length > 0 && <span className="text-[8px] font-bold text-emerald-500">({days.join(', ')})</span>}
          {employee.credentials && <span className="text-[8px] font-bold text-gray-500">({employee.credentials})</span>}
          {isRotationConflict && <AlertTriangle size={8} className="text-purple-500 flex-shrink-0" />}
          {isRotation && !isRotationConflict && <AlertTriangle size={8} className="text-purple-500 flex-shrink-0" />}
          {isVacation && <AlertTriangle size={8} className="text-red-500 flex-shrink-0" />}
        </div>
        <span className={`text-[8px] uppercase font-bold flex-shrink-0 ${textColor}`}>{employee.role}</span>
      </div>
    );
  }

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      {...attributes} 
      {...listeners}
      className={`p-2.5 border rounded-lg transition-all cursor-grab active:cursor-grabbing group ${bgColor} ${borderColor} hover:bg-emerald-500/5 ${hoverBorder}`}
      title={isRotationConflict ? 'Rotation Conflict: Employee is scheduled for rotation but assigned to a jobsite.' : (employee.updated_by ? `Last modified by ${employee.updated_by} on ${new Date(employee.updated_at).toLocaleString()}` : undefined)}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`${textColor} text-xs font-medium truncate flex items-center gap-1.5`}>
              {employee.rotation_group && <div className={`w-1.5 h-1.5 rounded-full ${groupColor}`} title={`Rotation Group ${employee.rotation_group}`} />}
              {employee.first_name} {employee.last_name}
            </div>
            {employee.credentials && <span className="text-[10px] font-bold text-gray-500">({employee.credentials})</span>}
            {isRotationConflict && (
              <span className="px-1 py-0.5 bg-purple-500/20 text-purple-400 text-[7px] font-bold uppercase rounded">Conflict</span>
            )}
            {isRotation && !isRotationConflict && (
              <span className="px-1 py-0.5 bg-purple-500/20 text-purple-400 text-[7px] font-bold uppercase rounded">Rot</span>
            )}
            {isVacation && (
              <span className="px-1 py-0.5 bg-red-500/20 text-red-400 text-[7px] font-bold uppercase rounded">Vac</span>
            )}
          </div>
          <div className="text-[10px] text-gray-500 truncate">{employee.job_title}</div>
        </div>
        <div className={`flex-shrink-0 w-6 h-6 rounded flex items-center justify-center transition-all ${
          isRotation ? 'bg-purple-500/10 text-purple-500' : 'bg-emerald-500/10 text-emerald-500 opacity-0 group-hover:opacity-100'
        }`}>
          {isRotation ? <RefreshCw size={12} className="animate-spin-slow" /> : <Users size={12} />}
        </div>
      </div>
    </div>
  );
}

function DroppableJobsite({ site, assignedEmployees, rotationConfigs, currentWeek, activeId, assignments, jobsites, canEdit }: { site: any, assignedEmployees: Employee[], rotationConfigs: Record<string, RotationConfig>, currentWeek: Date, key?: string, activeId: string | null, assignments: ScheduledAssignment[], jobsites: Jobsite[], canEdit: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: site.id,
  });

  const minStaffing = site.min_staffing || 2;
  const isUnderstaffed = assignedEmployees.length < minStaffing;
  const rotationConflicts = assignedEmployees.filter(emp => {
    const config = rotationConfigs[emp.id];
    const isRotationJobsite = site.id === 'rotation' || site.id === 'vacation' || site.id === 'time off';
    return isRotationWeek(currentWeek, { ...emp, rotation_config: config }) && !isRotationJobsite;
  });

  const credentialViolations = assignedEmployees.filter(emp => !hasCredential(emp.credentials, site.required_credentials));

  return (
    <div 
      ref={setNodeRef}
      className={`p-4 rounded-xl border transition-all flex flex-col ${
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
          {site.required_credentials && (
            <p className="text-[9px] text-emerald-500 mt-1">Req: {site.required_credentials}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {rotationConflicts.length > 0 && (
            <div 
              className="flex items-center gap-1 text-purple-500 text-[8px] font-bold bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/20 cursor-help"
              title={`Employees on rotation: ${rotationConflicts.map(e => `${e.first_name} ${e.last_name}`).join(', ')}`}
            >
              <RefreshCw size={10} className="animate-spin-slow" />
              ROTATION CONFLICT
            </div>
          )}
          {credentialViolations.length > 0 && (
            <div className="flex items-center gap-1 text-red-500 text-[8px] font-bold bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">
              <AlertTriangle size={10} />
              CREDENTIAL VIOLATION
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

      <div className="space-y-1.5 min-h-[40px] bg-black/40 rounded-lg p-2 border border-emerald-900/10">
        {assignedEmployees.length === 0 ? (
          <div className="flex items-center justify-center text-gray-700 text-[10px] italic py-2">
            Empty
          </div>
        ) : (
          assignedEmployees.map(emp => {
            const assignment = assignments.find(a => a.employeeId === emp.id && (site.isGroup ? site.siteIds.includes(a.jobsiteId) : a.jobsiteId === site.id));
            const jobsite = jobsites.find(j => j.id === assignment?.jobsiteId);
            const isInternal = jobsite?.internal || false;
            const isVacation = assignment?.jobsiteId === 'vacation';

            return (
              <DraggableEmployee 
                key={emp.id} 
                employee={emp} 
                isRotation={assignment?.jobsiteId === 'rotation'}
                isInternal={isInternal}
                isVacation={isVacation}
                isCompact
                activeId={activeId}
                canEdit={canEdit}
                days={assignment?.days}
                rotationConfigs={rotationConfigs}
                currentWeek={currentWeek}
              />
            );
          })
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
