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
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { format, startOfWeek, addWeeks, isSameWeek } from 'date-fns';
import { parseAssignmentNames } from '../utils/assignmentParser';
import { Users, MapPin, Calendar, Sparkles, AlertTriangle, CheckCircle2, RefreshCw, ChevronRight, Filter, Download, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { logActivity } from '../lib/logger';
import { isRotationWeek } from '../utils/rotation';
import { sendNotification } from '../utils/notifications';
import { useAuth } from '../contexts/AuthContext';

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
        
        const message = `Your assignments for the week of ${format(currentWeek, 'MMM dd')}: ${empAssignments.map(a => jobsites.find(j => j.id === a.jobsiteId)?.jobsite_name || 'Unknown').join(', ')}`;
        
        await sendNotification({
          employeeId: emp.id,
          title: 'Weekly Schedule Assignment',
          message,
          type: 'info',
          sendEmail: true,
          updateType: 'Weekly Schedule',
          jobsiteName: 'Multiple',
          weekStartDate: format(currentWeek, 'MMM dd, yyyy')
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
        const message = empAssignments.length > 0 
          ? `Your assignments for the week of ${format(currentWeek, 'MMM dd')} have been updated: ${empAssignments.map(a => jobsites.find(j => j.id === a.jobsiteId)?.jobsite_name || 'Unknown').join(', ')}`
          : `Your assignments for the week of ${format(currentWeek, 'MMM dd')} have been cleared.`;
        
        await sendNotification({
          employeeId: emp.id,
          title: 'Schedule Update',
          message,
          type: 'info',
          sendEmail: true,
          updateType: 'Schedule Update',
          jobsiteName: 'Multiple',
          weekStartDate: format(currentWeek, 'MMM dd, yyyy')
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
  }, [currentWeek]);

  const fetchData = async () => {
    console.log('Fetching data...');
    setLoading(true);
    setInitialAssignments(null);
    try {
      const weekStr = format(currentWeek, 'yyyy-MM-dd');
      
      // Fetch assignments for the current week from assignment_weeks table
      const { data: weeksData, error: weeksError } = await supabase
        .from('assignment_weeks')
        .select('*, items:assignment_items(*)')
        .eq('week_start', weekStr);

      if (weeksError) console.error('Error fetching assignment_weeks:', weeksError);
      
      // Group by employee_id and pick latest created_at
      const latestAssignments = new Map<string, any>();
      weeksData?.forEach(row => {
        const key = `${row.employee_id}-${row.week_start}`;
        if (!latestAssignments.has(key) || new Date(row.created_at) > new Date(latestAssignments.get(key).created_at)) {
          latestAssignments.set(key, row);
        }
      });
      const uniqueWeeksData = Array.from(latestAssignments.values());
      console.log('Unique weeksData:', uniqueWeeksData);

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
        
        if (!employee || !employee.is_active) {
          return;
        }

        // Use a more granular key to allow multiple assignments per employee per week
        // We will handle duplicate prevention at the assignment level
        if (week.items) {
        // Removed debug log
        }

        if (week.assignment_name === 'Rotation' || week.assignment_name === 'Vacation') {
          const key = `${employee.id}-${week.week_start}-${week.assignment_name.toLowerCase()}`;
          mapped.push({
            employeeId: employee.id,
            jobsiteId: week.assignment_name.toLowerCase(),
            weekStart: week.week_start,
            isRotation: week.assignment_name === 'Rotation'
          });
          seen.add(key);
          return;
        }

        if (week.items && week.items.length > 0) {
          // Only take the first item to prevent multiple assignments
          const item = week.items[0];
          if (item.jobsite_fk) {
            const key = `${employee.id}-${week.week_start}-${item.jobsite_fk}`;
            if (!seen.has(key)) {
              mapped.push({
                employeeId: employee.id,
                jobsiteId: item.jobsite_fk,
                weekStart: week.week_start
              });
              seen.add(key);
            }
          }
        } else if (week.assignment_name) {
          const assignmentNames = parseAssignmentNames(week.assignment_name);
          
          assignmentNames.forEach(name => {
            const trimmedName = name.trim().toLowerCase();
            
            // Fallback to assignment_name matching jobsite_name OR jobsite_group
            const jobsite = jobsites.find(j => 
              j.jobsite_name.toLowerCase().includes(trimmedName) ||
              (j.jobsite_group && j.jobsite_group.toLowerCase().includes(trimmedName))
            );
            
            const key = `${employee.id}-${week.week_start}-${jobsite ? jobsite.id : trimmedName}`;
            if (seen.has(key)) return;
            
            console.log(`Mapping assignment: ${employee.first_name} ${employee.last_name} -> ${trimmedName}. Found jobsite:`, jobsite?.jobsite_name);
            
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
                jobsiteId: `unmapped-${name.trim()}`,
                weekStart: week.week_start
              });
              seen.add(key);
            }
          });
        }
      };

      uniqueWeeksData.forEach(processWeek);
      
      setAssignments(mapped);
      if (initialAssignments === null) {
        setInitialAssignments(mapped);
      }
    } catch (err) {
      console.error('Error fetching scheduler data:', err);
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
      const jobsite = jobsites.find(j => j.id === actualJobsiteId);
      const employee = employees.find(e => e.id === employeeId);
      
      if (!jobsite || !employee) {
          console.error('Jobsite or employee not found:', { jobsite, employee });
          return;
      }

      // Get admin email
      const { data: { user } } = await supabase.auth.getUser();
      const adminEmail = user?.email || 'Unknown';

      // 1. Update local state
      const newAssignment = {
        employeeId,
        jobsiteId: actualJobsiteId,
        weekStart: weekStr
      };
      
      const previousAssignments = assignments;
      setHistory(prev => [...prev, assignments]);
      setAssignments(prev => [
        ...prev.filter(a => a.employeeId !== employeeId || a.weekStart !== weekStr), 
        newAssignment
      ]);

        // 2. Save to Supabase
      try {
        const payload = {
            employee_id: employee.employee_id_ref,
            email: employee.email,
            first_name: employee.first_name,
            last_name: employee.last_name,
            week_start: weekStr,
            assignment_name: targetDisplaySite?.jobsite_name || 'Unknown Jobsite',
            value_type: 'jobsite'
        };
        console.log('Upserting assignment payload:', JSON.stringify(payload, null, 2));
        
        // 1. Check if assignment already exists
        const { data: existingAssignments, error: fetchError } = await supabase
          .from('assignment_weeks')
          .select('id')
          .eq('email', employee.email)
          .eq('week_start', weekStr);
        
        if (fetchError) throw fetchError;

        let assignmentWeek;

        if (existingAssignments && existingAssignments.length > 0) {
            // Take the first one to update
            assignmentWeek = existingAssignments[0];
            
            // Update existing
            const { data, error } = await supabase
                .from('assignment_weeks')
                .update(payload)
                .eq('id', assignmentWeek.id)
                .select();
            
            if (error) throw error;
            assignmentWeek = data[0];

            // Delete any other duplicate assignment_weeks
            if (existingAssignments.length > 1) {
                const idsToDelete = existingAssignments.slice(1).map(a => a.id);
                await supabase
                    .from('assignment_items')
                    .delete()
                    .in('assignment_week_fk', idsToDelete);
                
                await supabase
                    .from('assignment_weeks')
                    .delete()
                    .in('id', idsToDelete);
            }
        } else {
            // Insert new
            const { data, error } = await supabase
                .from('assignment_weeks')
                .insert(payload)
                .select();
            
            if (error) throw error;
            assignmentWeek = data[0];
        }
        console.log('Supabase upsert success, assignmentWeek:', assignmentWeek);
        
        // 2. Clear existing items for this assignment_week_fk and insert the new one
        const { error: deleteError } = await supabase
          .from('assignment_items')
          .delete()
          .eq('assignment_week_fk', assignmentWeek.id);
        
        if (deleteError) throw deleteError;

        const { error: itemError } = await supabase
          .from('assignment_items')
          .insert({
            assignment_week_fk: assignmentWeek.id,
            jobsite_fk: actualJobsiteId,
            employee_first_name: employee.first_name,
            employee_last_name: employee.last_name,
            jobsite_removed_from: previousJobsiteName,
            jobsite_added_to: targetDisplaySite?.jobsite_name || 'Unknown Jobsite',
            admin_email: adminEmail
          });

        if (itemError) {
            console.error('Supabase item insert error:', itemError);
            throw itemError;
        }
        
        console.log('Supabase item upsert success');

        // 3. Log activity
        await logActivity('assignment_update', {
            employeeId: employee.id,
            jobsiteId: actualJobsiteId,
            weekStart: weekStr,
            jobsiteName: targetDisplaySite.jobsite_name
        }, employee.id);

        // 5. Send notification to employee
        const isSpecial = actualJobsiteId === 'rotation' || actualJobsiteId === 'vacation' || actualJobsiteId === 'time off';
        const jobsiteName = targetDisplaySite?.jobsite_name || 'Unknown Jobsite';
        const assignmentLabel = isSpecial 
          ? jobsiteName 
          : `assigned to "${jobsiteName}"`;

        await sendNotification({
          employeeId: employee.id,
          title: isSpecial ? 'Schedule Update' : 'New Jobsite Assignment',
          message: `You have been ${assignmentLabel} for the week of ${format(currentWeek, 'MMM dd')}.`,
          type: 'info',
          sendEmail: true,
          updateType: isSpecial ? 'Schedule Change' : 'New Assignment',
          jobsiteName: jobsiteName,
          weekStartDate: format(currentWeek, 'MMM dd, yyyy'),
          previousAssignment: previousJobsiteName,
          newAssignment: targetDisplaySite?.jobsite_name
        });
      } catch (err) {
        console.error('Error saving assignment:', err);
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
      console.log('Target display site:', targetDisplaySite);
      if (!targetDisplaySite) return;

      const actualJobsiteId = targetDisplaySite.isGroup ? targetDisplaySite.siteIds[0] : targetDisplaySite.id;
      console.log('Actual jobsite ID:', actualJobsiteId);
      
      // Check for conflict
      const existingAssignment = assignments.find(a => a.employeeId === employeeId && a.weekStart === weekStr);
      console.log('Existing assignment:', existingAssignment);
      
      const previousJobsite = existingAssignment ? jobsites.find(j => j.id === existingAssignment.jobsiteId) : null;
      const previousJobsiteName = previousJobsite ? previousJobsite.jobsite_name : 'None';

      if (existingAssignment && existingAssignment.jobsiteId !== actualJobsiteId) {
        setConflictModal({ employeeId, jobsiteId: actualJobsiteId, displaySiteId: over.id, weekStr, previousJobsiteName });
        return;
      }
      
      await executeAssignment(employeeId, actualJobsiteId, weekStr, targetDisplaySite, previousJobsiteName);
      return; // Skip the rest of the original code
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
      for (const assignment of newAssignments) {
        const { data: existing, error: fetchError } = await supabase
          .from('assignment_weeks')
          .select('id')
          .eq('employee_id', assignment.employee_id)
          .eq('week_start', assignment.week_start)
          .maybeSingle();
        
        if (fetchError) throw fetchError;

        if (existing) {
          const { error } = await supabase
            .from('assignment_weeks')
            .update(assignment)
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('assignment_weeks')
            .insert(assignment);
          if (error) throw error;
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
    return isRotationWeek(currentWeek, config, employee.rotation_group);
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
          
          <button 
            onClick={optimizeWithAI}
            disabled={!canEdit || optimizing}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-black text-xs sm:text-sm font-bold rounded-lg hover:bg-emerald-400 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
          >
            {optimizing ? (
              <RefreshCw className="animate-spin" size={14} />
            ) : (
              <Sparkles size={14} />
            )}
            <span className="hidden xs:inline">AI Optimize</span>
            <span className="xs:hidden">AI</span>
          </button>
        </div>
      </div>

      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <DragOverlay>
          {activeId && employees.find(e => e.id === activeId) ? (
            <DraggableEmployee 
              employee={employees.find(e => e.id === activeId)!} 
              onRotation={getRotationStatus(activeId)}
              isInternal={false}
              isVacation={false}
              activeId={activeId}
              canEdit={canEdit}
            />
          ) : null}
        </DragOverlay>
        <div className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-0 overflow-hidden">
          {/* Column 1: Employee Pool */}
          <div className={`lg:col-span-3 border-b lg:border-b-0 lg:border-r border-emerald-900/20 flex flex-col bg-[#0A120F]/30 transition-all duration-300 ${isEmployeePoolOpen ? 'max-h-[500px]' : 'max-h-[60px] lg:max-h-none'}`}>
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
                    onRotation={getRotationStatus(emp.id)}
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
          <div className="flex-1 lg:col-span-6 border-b lg:border-b-0 lg:border-r border-emerald-900/20 flex flex-col min-h-0">
            <div className="p-4 border-b border-emerald-900/10 bg-[#0A120F]/20">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                  <MapPin size={14} />
                  Active Jobsites
                </h3>
                <div className="flex items-center gap-2">
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
            <div className="flex-1 overflow-y-auto p-4 lg:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 custom-scrollbar bg-black/10">
              {filteredJobsites.map(site => (
                <DroppableJobsite 
                  key={site.id} 
                  site={site} 
                  currentWeek={currentWeek}
                  rotationConfigs={rotationConfigs}
                  assignedEmployees={employees.filter(e => 
                    assignments.some(a => a.employeeId === e.id && site.siteIds.includes(a.jobsiteId))
                  )}
                  activeId={activeId}
                  assignments={assignments}
                  jobsites={jobsites}
                  canEdit={canEdit}
                />
              ))}
            </div>
          </div>

          {/* Column 3: Jobsite Groups */}
          <div className={`lg:col-span-3 flex flex-col bg-[#0A120F]/30 transition-all duration-300 ${isGroupsOpen ? 'max-h-[500px]' : 'max-h-[60px] lg:max-h-none'}`}>
            <button 
              onClick={() => setIsGroupsOpen(!isGroupsOpen)}
              className="p-4 border-b border-emerald-900/10 flex items-center justify-between lg:cursor-default w-full"
            >
              <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                <Users size={14} />
                Jobsite Groups
              </h3>
              <div className="lg:hidden">
                <ChevronRight size={16} className={`text-emerald-500 transition-transform ${isGroupsOpen ? 'rotate-90' : ''}`} />
              </div>
            </button>
            <div className={`flex-1 flex flex-col overflow-hidden transition-opacity duration-300 ${isGroupsOpen ? 'opacity-100' : 'opacity-0 lg:opacity-100'}`}>
              <div className="p-4 border-b border-emerald-900/10">
                <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 custom-scrollbar">
                  <button 
                    onClick={() => setSelectedGroup(null)}
                    className={`whitespace-nowrap lg:whitespace-normal text-left px-3 py-2 rounded-lg text-xs transition-colors shrink-0 lg:shrink ${!selectedGroup ? 'bg-emerald-500/10 text-emerald-500 font-bold' : 'text-gray-400 hover:bg-white/5'}`}
                  >
                    All Projects
                  </button>
                  {jobsiteGroups.map(group => (
                    <button 
                      key={group}
                      onClick={() => setSelectedGroup(group)}
                      className={`whitespace-nowrap lg:whitespace-normal text-left px-3 py-2 rounded-lg text-xs transition-colors shrink-0 lg:shrink ${selectedGroup === group ? 'bg-emerald-500/10 text-emerald-500 font-bold' : 'text-gray-400 hover:bg-white/5'}`}
                    >
                      {group}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="p-4 mt-auto border-t border-emerald-900/10 hidden lg:block">
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

function DraggableEmployee({ employee, onRotation, isInternal, isVacation, isCompact, activeId, canEdit }: { employee: Employee, onRotation: boolean, isInternal: boolean, isVacation: boolean, isCompact?: boolean, key?: string, activeId: string | null, canEdit: boolean }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: employee.id,
    disabled: !canEdit,
  });
  const isDragging = activeId === employee.id;

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  // Color logic
  let bgColor = 'bg-white/5';
  let borderColor = 'border-white/10';
  let textColor = 'text-white';
  let hoverBorder = 'hover:border-emerald-500/30';

  if (onRotation) {
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
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-[10px] truncate ${textColor}`}>{employee.first_name} {employee.last_name}</span>
          {onRotation && <AlertTriangle size={8} className="text-purple-500 flex-shrink-0" />}
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
      title={employee.updated_by ? `Last modified by ${employee.updated_by} on ${new Date(employee.updated_at).toLocaleString()}` : undefined}
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className={`${textColor} text-xs font-medium truncate`}>{employee.first_name} {employee.last_name}</div>
            {onRotation && (
              <span className="px-1 py-0.5 bg-purple-500/20 text-purple-400 text-[7px] font-bold uppercase rounded">Rot</span>
            )}
            {isVacation && (
              <span className="px-1 py-0.5 bg-red-500/20 text-red-400 text-[7px] font-bold uppercase rounded">Vac</span>
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

function DroppableJobsite({ site, assignedEmployees, rotationConfigs, currentWeek, activeId, assignments, jobsites, canEdit }: { site: any, assignedEmployees: Employee[], rotationConfigs: Record<string, RotationConfig>, currentWeek: Date, key?: string, activeId: string | null, assignments: ScheduledAssignment[], jobsites: Jobsite[], canEdit: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
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
          assignedEmployees.map(emp => {
            const assignment = assignments.find(a => a.employeeId === emp.id && (site.isGroup ? site.siteIds.includes(a.jobsiteId) : a.jobsiteId === site.id));
            const jobsite = jobsites.find(j => j.id === assignment?.jobsiteId);
            const isInternal = jobsite?.internal || false;
            const isVacation = assignment?.jobsiteId === 'vacation';

            return (
              <DraggableEmployee 
                key={emp.id} 
                employee={emp} 
                onRotation={isRotationWeek(currentWeek, rotationConfigs[emp.id], emp.rotation_group)}
                isInternal={isInternal}
                isVacation={isVacation}
                isCompact
                activeId={activeId}
                canEdit={canEdit}
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
