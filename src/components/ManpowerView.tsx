import { 
  DndContext, 
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, Jobsite, JobsiteGroup } from '../types';
import { 
  Users, 
  MapPin, 
  Calendar, 
  Search, 
  Filter, 
  Download,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  RefreshCw,
  X,
  AlertCircle,
  AlertTriangle,
  Info,
  ListOrdered
} from 'lucide-react';
import AssignmentModal from './AssignmentModal';
import { format, startOfWeek, addWeeks, isSameWeek, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { isRotationWeek } from '../utils/rotation';
import { parseAssignmentNames } from '../utils/assignmentParser';
import { RotationConfig } from '../types';
import { fetchCurrentScheduleBackend, assignEmployeeToJobsiteBackend } from '../lib/supabase_functions';

const DraggableEmployee: React.FC<{ employee: Employee, days?: string[], activeId: string | null }> = ({ employee, children, days, activeId }) => {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: employee.id,
  });
  const isDragging = activeId === employee.id;
  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: 100,
  } : undefined;

  return (
    <div ref={setNodeRef} style={{ ...style, opacity: isDragging ? 0.5 : 1 }} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing flex flex-col gap-1">
      {children}
      {days && <span className="text-[8px] font-bold text-emerald-500">({days.join(', ')})</span>}
    </div>
  );
};

const DroppableJobsite: React.FC<{ id: string, children: React.ReactNode, className?: string }> = ({ id, children, className }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });
  
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? 'ring-2 ring-emerald-500/50' : ''}`}>
      {children}
    </div>
  );
};

interface ManpowerViewProps {
  employees: Employee[];
  jobsites: Jobsite[];
  jobsiteGroups: JobsiteGroup[];
}

interface AssignmentData {
  employee_id: string;
  employee_fk?: string;
  email?: string;
  jobsite_names: string[];
  week_start: string;
  days: string[][]; // Array of arrays, one per jobsite
  status: string;
}

export default function ManpowerView({ employees, jobsites, jobsiteGroups }: ManpowerViewProps) {
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [assignments, setAssignments] = useState<AssignmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const fieldEmployees = useMemo(() => employees.filter(e => e.role !== 'hr'), [employees]);
  const getGroupName = (groupId?: string) => {
    return jobsiteGroups.find(g => g.id === groupId)?.name;
  };

  const getRotationGroupStyles = (rotationGroup?: string) => {
    const groupColor = rotationGroup === 'A' ? 'bg-black border border-white/20' :
                       rotationGroup === 'B' ? 'bg-red-500' :
                       rotationGroup === 'C' ? 'bg-yellow-500' :
                       rotationGroup === 'D' ? 'bg-blue-500' : 'bg-purple-500';
    
    const textColor = rotationGroup === 'A' ? 'text-white' :
                      rotationGroup === 'B' ? 'text-red-400' :
                      rotationGroup === 'C' ? 'text-yellow-400' :
                      rotationGroup === 'D' ? 'text-blue-400' : 'text-purple-400';
    
    return { groupColor, textColor };
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortByStaffing, setSortByStaffing] = useState(false);
  const [rotationConfigs, setRotationConfigs] = useState<Record<string, RotationConfig>>({});
  const [selectedConflict, setSelectedConflict] = useState<Employee | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<{
    employeeId: string;
    targetJobsites: Jobsite[];
    weekStr: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const weekStr = format(currentWeek, 'yyyy-MM-dd');
      
      // 1. Fetch current schedule from backend view
      const scheduleData = await fetchCurrentScheduleBackend(weekStr);
      
      // 2. Fetch rotation configs
      const { data: rotData } = await supabase
        .from('rotation_configs')
        .select('*');

      if (rotData) {
        const configMap: Record<string, RotationConfig> = {};
        rotData.forEach(c => configMap[c.employee_fk] = c);
        setRotationConfigs(configMap);
      }

      // 3. Process schedule data into AssignmentData format
      const employeeMap = new Map<string, AssignmentData>();
      const seen = new Set<string>();

      scheduleData.forEach((row: any) => {
        const employee = fieldEmployees.find(e => e.id === row.employee_id);
        if (!employee || !employee.is_active) return;

        const key = employee.id;
        
        // Determine jobsite name
        let jobsiteName = row.week_assignment_name || 'Unknown';
        if (row.jobsite_id) {
          const jobsite = jobsites.find(j => j.id === row.jobsite_id);
          if (jobsite) {
            jobsiteName = jobsite.jobsite_name;
          }
        }

        if (!employeeMap.has(key)) {
          employeeMap.set(key, {
            employee_id: employee.employee_id_ref.toString(),
            employee_fk: employee.id,
            email: employee.email,
            jobsite_names: [jobsiteName],
            week_start: row.week_start,
            days: [row.days || []],
            status: row.week_status || row.value_type || 'assigned'
          });
          seen.add(`${key}-${jobsiteName}`);
        } else {
          const existing = employeeMap.get(key)!;
          const assignmentKey = `${key}-${jobsiteName}`;
          if (!seen.has(assignmentKey)) {
            existing.jobsite_names.push(jobsiteName);
            existing.days.push(row.days || []);
            seen.add(assignmentKey);
          }
        }
      });

      setAssignments(Array.from(employeeMap.values()));
    } catch (err) {
      console.error('Error fetching manpower data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    setActiveId(null);
    
    if (over && active.id !== over.id) {
      const employeeId = active.id;
      const targetJobsiteName = over.id; // The key in manpowerMatrix
      
      const employee = fieldEmployees.find(e => e.id === employeeId);
      if (!employee) return;

      const weekStr = format(currentWeek, 'yyyy-MM-dd');

      // Update local state
      const newAssignments = assignments.filter(a => 
        !( (a.employee_id === employee.employee_id_ref || (a.email && a.email.toLowerCase() === employee.email.toLowerCase())) && a.week_start === weekStr)
      );
      
      if (targetJobsiteName !== 'Unassigned') {
        const targetJobsites = jobsites.filter(j => 
          j.jobsite_name === targetJobsiteName || 
          getGroupName(j.group_id) === targetJobsiteName
        );
        if (targetJobsites.length === 0) return;
        
        setAssignmentModal({
          employeeId,
          targetJobsites,
          weekStr
        });
        return;
      }
      setAssignments(newAssignments);

      // Save to Supabase
      try {
        await supabase.rpc('set_audit_reason', { reason: 'manpower_drag_drop' });
        const { data: existing, error: fetchError } = await supabase
          .from('assignment_weeks')
          .select('id')
          .eq('email', employee.email)
          .eq('week_start', weekStr)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (targetJobsiteName === 'Unassigned') {
          if (existing) {
            await supabase.from('assignment_weeks').delete().eq('id', existing.id);
          }
        } else {
          const payload = {
            employee_id: employee.employee_id_ref,
            email: employee.email,
            first_name: employee.first_name,
            last_name: employee.last_name,
            week_start: weekStr,
            assignment_name: targetJobsiteName,
            status: 'assigned',
            value_type: 'jobsite'
          };

          if (existing) {
            await supabase.from('assignment_weeks').update(payload).eq('id', existing.id);
          } else {
            await supabase.from('assignment_weeks').insert(payload);
          }
        }
      } catch (err) {
        console.error('Error saving assignment:', err);
        fetchAssignments(); // Revert local state
      }
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, [currentWeek, jobsites]);

  const activeEmployees = useMemo(() => fieldEmployees.filter(e => e.is_active), [fieldEmployees]);
  const activeJobsites = useMemo(() => jobsites.filter(j => j.is_active), [jobsites]);

  const manpowerMatrix = useMemo(() => {
    const matrix: Record<string, { employee: Employee, days: string[] }[]> = {
      'Rotation': [],
      'Unassigned': [],
      'On Vacation': [],
      'Off-Site': [],
    };
    
    const offSiteStatuses = ['personal', 'training', 'sick', 'holiday', 'home office'];
    const jobsiteAliases: Record<string, string> = {
      'oklahoma': 'oklahoma'
    };

    const assignedJobsiteNames = new Set<string>();
    assignments.forEach(asgn => {
      asgn.jobsite_names.forEach(name => {
        const normalized = (jobsiteAliases[name.toLowerCase()] || name.toLowerCase()).trim();
        if (normalized !== '-' && normalized !== '' && normalized !== 'rotation' && normalized !== 'vacation') {
          assignedJobsiteNames.add(normalized);
        }
      });
    });

    // Initialize matrix with group names or jobsite names
    jobsites.forEach(site => {
      const key = (getGroupName(site.group_id) || site.jobsite_name).trim();
      if (!matrix[key]) {
        matrix[key] = [];
      }
    });

    const assignedEmployeeIds = new Set<string>();
    const jobsitesWithAssignments = new Set<string>();

    assignments.forEach(asgn => {
      const emp = activeEmployees.find(e => {
        const emailMatch = asgn.email && e.email && e.email.toLowerCase() === asgn.email.toLowerCase();
        const fkMatch = asgn.employee_fk && e.id && e.id.toString() === asgn.employee_fk.toString();
        return emailMatch || fkMatch;
      });
      
      if (!emp) {
        // Log only a few times to avoid console spam
        if (Math.random() < 0.1) {
        }
        return;
      }
      
      asgn.jobsite_names.forEach(assignmentName => {
        const normalizedAssignment = (jobsiteAliases[assignmentName.toLowerCase()] || assignmentName.toLowerCase()).trim();

        // Treat "-" as unassigned
        if (assignmentName === '-' || assignmentName === '') {
          return;
        }

        if (asgn.status === 'rotation' || normalizedAssignment === 'rotation') {
          matrix['Rotation'].push({ employee: emp, days: asgn.days[asgn.jobsite_names.indexOf(assignmentName)] });
          assignedEmployeeIds.add(emp.id);
        } else if (asgn.status === 'vacation' || normalizedAssignment === 'vacation') {
          matrix['On Vacation'].push({ employee: emp, days: asgn.days[asgn.jobsite_names.indexOf(assignmentName)] });
          assignedEmployeeIds.add(emp.id);
        } else if (offSiteStatuses.includes(asgn.status)) {
          matrix['Off-Site'].push({ employee: emp, days: asgn.days[asgn.jobsite_names.indexOf(assignmentName)] });
          assignedEmployeeIds.add(emp.id);
        } else {
          assignedEmployeeIds.add(emp.id);
          
          // Find the site to determine the correct group/key
          const siteMatch = jobsites.find(j => 
            j.jobsite_name.toLowerCase().trim() === normalizedAssignment ||
            (j.group_id && getGroupName(j.group_id)?.toLowerCase().trim() === normalizedAssignment)
          );
          
          if (!siteMatch) {
          }
          
          const key = siteMatch ? (getGroupName(siteMatch.group_id) || siteMatch.jobsite_name).trim() : assignmentName;
          jobsitesWithAssignments.add(key);

          if (matrix[key]) {
            // Check if employee is already in matrix[key] to avoid duplicates
            const isAlreadyAssigned = matrix[key].some(item => item.employee.id === emp.id);
            if (!isAlreadyAssigned) {
              matrix[key].push({ employee: emp, days: asgn.days[asgn.jobsite_names.indexOf(assignmentName)] });
            }
          } else {
            // If it wasn't in the initial matrix, it might be a new/unrecognized site
            matrix[key] = [{ employee: emp, days: asgn.days[asgn.jobsite_names.indexOf(assignmentName)] }];
          }
        }
      });
    });

    // Add unassigned active employees
    activeEmployees.forEach(emp => {
      if (!assignedEmployeeIds.has(emp.id)) {
        const isScheduledForRotation = isRotationWeek(currentWeek, { ...emp, rotation_config: rotationConfigs[emp.id] });
        if (isScheduledForRotation) {
          matrix['Rotation'].push({ employee: emp, days: [] });
        } else {
          matrix['Unassigned'].push({ employee: emp, days: [] });
        }
      }
    });

    // Filter out jobsites that have no assignments, EXCEPT for special keys
    const specialKeys = ['Rotation', 'On Vacation', 'Off-Site', 'Unassigned'];
    Object.keys(matrix).forEach(key => {
      if (!specialKeys.includes(key) && matrix[key].length === 0) {
        delete matrix[key];
      }
    });

    return matrix;
  }, [activeJobsites, activeEmployees, assignments, rotationConfigs, currentWeek]);

  const filteredMatrix: Record<string, { employee: Employee, days: string[] }[]> = useMemo(() => {
    if (!searchQuery) return manpowerMatrix;
    
    const lowerQuery = searchQuery.toLowerCase();
    const newMatrix: Record<string, { employee: Employee, days: string[] }[]> = {};
    
    (Object.entries(manpowerMatrix) as [string, { employee: Employee, days: string[] }[]][]).forEach(([key, items]) => {
      const matchingItems = items.filter(item => 
        item.employee.first_name.toLowerCase().includes(lowerQuery) ||
        item.employee.last_name.toLowerCase().includes(lowerQuery) ||
        item.employee.email.toLowerCase().includes(lowerQuery) ||
        item.employee.job_title.toLowerCase().includes(lowerQuery)
      );
      
      const keyMatches = key.toLowerCase().includes(lowerQuery);
      
      // Always include Rotation and Unassigned
      const isSpecial = ['Rotation', 'Unassigned'].includes(key);
      
      if (isSpecial || keyMatches || matchingItems.length > 0) {
        newMatrix[key] = keyMatches ? items : matchingItems;
      }
    });
    
    return newMatrix;
  }, [manpowerMatrix, searchQuery]);

  const groupedJobsites = useMemo(() => {
    const groups: Record<string, Jobsite[]> = {};
    activeJobsites.forEach(site => {
      const key = (getGroupName(site.group_id) || site.jobsite_name).trim();
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(site);
    });
    return groups;
  }, [activeJobsites]);

  const showRotation = true;

  const showVacation = useMemo(() => {
    return (filteredMatrix['On Vacation'] || []).length > 0;
  }, [filteredMatrix]);

  const showOffSite = useMemo(() => {
    return (filteredMatrix['Off-Site'] || []).length > 0;
  }, [filteredMatrix]);

  const showUnassigned = true;

  const handleConfirmAssignment = async (action: 'replace' | 'add', jobsiteDays: Record<string, string[]>) => {
    if (!assignmentModal) return;
    
    const { employeeId, weekStr } = assignmentModal;
    const employee = fieldEmployees.find(e => e.id === employeeId);
    if (!employee) return;

    // Update local state
    const newAssignments = assignments.filter(a => 
      !( (a.employee_id === employee.employee_id_ref || (a.email && a.email.toLowerCase() === employee.email.toLowerCase())) && a.week_start === weekStr)
    );
    
    const jobsiteNames: string[] = [];
    const daysList: string[][] = [];

    Object.entries(jobsiteDays).forEach(([jobsiteId, days]) => {
      const jobsite = jobsites.find(j => j.id === jobsiteId);
      if (jobsite) {
        jobsiteNames.push(jobsite.jobsite_name);
        daysList.push(days);
      }
    });

    newAssignments.push({
      employee_id: employee.employee_id_ref.toString(),
      email: employee.email,
      jobsite_names: jobsiteNames,
      week_start: weekStr,
      days: daysList,
      status: 'assigned'
    });
    setAssignments(newAssignments);

    // Save to Supabase
    try {
      await supabase.rpc('set_audit_reason', { reason: 'manpower_manual_assignment' });
      
      // 1. Get or create assignment_week
      let { data: week, error: weekError } = await supabase
        .from('assignment_weeks')
        .select('id')
        .eq('email', employee.email)
        .eq('week_start', weekStr)
        .maybeSingle();

      if (weekError) throw weekError;

      let weekId = week?.id;

      if (!weekId) {
        const { data: newWeek, error: insertWeekError } = await supabase
          .from('assignment_weeks')
          .insert({
            employee_id: employee.employee_id_ref,
            email: employee.email,
            first_name: employee.first_name,
            last_name: employee.last_name,
            week_start: weekStr,
            status: 'assigned'
          })
          .select('id')
          .single();
        
        if (insertWeekError) throw insertWeekError;
        weekId = newWeek.id;
      }

      // 2. Delete existing assignment_items
      await supabase.from('assignment_items').delete().eq('assignment_week_fk', weekId);

      // 3. Insert new assignment_items
      const itemsToInsert = Object.entries(jobsiteDays).map(([jobsiteId, days]) => ({
        assignment_week_fk: weekId,
        jobsite_fk: jobsiteId,
        days: days
      }));

      const { error: insertItemsError } = await supabase.from('assignment_items').insert(itemsToInsert);
      if (insertItemsError) throw insertItemsError;

    } catch (err) {
      console.error('Error updating assignment:', err);
      // Revert local state on error
      fetchAssignments();
    }
    
    setAssignmentModal(null);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={(e) => setActiveId(e.active.id)}>
      {assignmentModal && (
        <AssignmentModal
          isOpen={!!assignmentModal}
          onClose={() => setAssignmentModal(null)}
          employee={fieldEmployees.find(e => e.id === assignmentModal.employeeId)!}
          targetJobsites={assignmentModal.targetJobsites}
          allJobsites={activeJobsites}
          weekStart={assignmentModal.weekStr}
          onConfirm={handleConfirmAssignment}
        />
      )}
      <div className="h-full flex flex-col bg-[#050A08]">
        {/* Header Controls */}
        <div className="flex flex-col md:flex-row items-center justify-between p-6 gap-4 border-b border-emerald-900/20 bg-[#0A120F]/50">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                <LayoutGrid size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Manpower Distribution</h2>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Real-time Personnel Tracking</p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => setCurrentWeek(addWeeks(currentWeek, -1))}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="px-4 py-1.5 text-xs font-mono text-emerald-500 font-bold">
                WEEK OF {format(currentWeek, 'MMM dd, yyyy').toUpperCase()}
              </div>
              <button 
                onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
              <input 
                type="text"
                placeholder="Search jobsites..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/40 border border-emerald-900/30 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:border-emerald-500 outline-none transition-all"
              />
            </div>
            
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
              <button 
                onClick={() => setSortByStaffing(!sortByStaffing)}
                className={`p-2 rounded-lg transition-all ${sortByStaffing ? 'bg-emerald-500 text-black' : 'text-gray-500 hover:text-white'}`}
                title="Sort by staffing level"
              >
                <ListOrdered size={16} />
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-emerald-500 text-black' : 'text-gray-500 hover:text-white'}`}
              >
                <LayoutGrid size={16} />
              </button>
              <button 
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-emerald-500 text-black' : 'text-gray-500 hover:text-white'}`}
              >
                <List size={16} />
              </button>
            </div>

            <button 
              onClick={fetchAssignments}
              className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-emerald-500 transition-all"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <RefreshCw className="text-emerald-500 animate-spin" size={32} />
            </div>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6' : 'space-y-4'}>
              <AnimatePresence mode="popLayout">
                {showRotation && (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key="rotation-group"
                    className="bg-purple-950/20 border border-purple-900/30 rounded-2xl overflow-hidden transition-all group hover:border-purple-500/50"
                  >
                    <div className="p-4 border-b border-white/5 bg-purple-500/10 flex items-center justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">Rotation</h3>
                        <p className="text-[10px] text-purple-400 uppercase tracking-tighter font-bold">Cycle Break</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-lg font-mono font-bold text-purple-500">
                          {(filteredMatrix['Rotation']?.length || 0).toString().padStart(2, '0')}
                        </span>
                        <span className="text-[8px] text-purple-400 uppercase font-bold">Personnel</span>
                      </div>
                    </div>

                    <DroppableJobsite id="Rotation" className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                      {filteredMatrix['Rotation']?.map(({ employee, days }, index) => {
                        const { groupColor } = getRotationGroupStyles(employee.rotation_group);
                        return (
                        <DraggableEmployee key={`${employee.id}-${days?.join('-') || 'no-days'}-${index}`} employee={employee} days={days} activeId={activeId}>
                          <div className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-purple-500/30 transition-colors group/item">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center text-[10px] font-bold text-purple-500 border border-purple-500/20">
                                {employee.first_name?.[0]}{employee.last_name?.[0]}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${groupColor}`} title={`Rotation Group ${employee.rotation_group || 'None'}`} />
                                  {employee.first_name} {employee.last_name}
                                </div>
                                <div className="text-[9px] text-gray-500 truncate">{employee.job_title}</div>
                              </div>
                            </div>
                            <div className="text-[8px] font-bold text-purple-500/50 uppercase tracking-widest group-hover/item:text-purple-500 transition-colors">
                              {employee.role}
                            </div>
                          </div>
                        </DraggableEmployee>
                        );
                      })}
                    </DroppableJobsite>

                    <div className="px-4 py-3 bg-black/40 border-t border-white/5 flex items-center justify-end">
                      <span className="text-[8px] text-gray-500 uppercase font-bold">Rotation Staff</span>
                    </div>
                  </motion.div>
                )}

                {showVacation && (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key="on-vacation-group"
                    className="bg-[#0A120F] border border-blue-900/30 rounded-2xl overflow-hidden transition-all group hover:border-blue-500/50"
                  >
                    <div className="p-4 border-b border-white/5 bg-blue-500/10 flex items-center justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">On Vacation</h3>
                        <p className="text-[10px] text-blue-400 uppercase tracking-tighter font-bold">Time Off</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-lg font-mono font-bold text-blue-500">
                          {(filteredMatrix['On Vacation']?.length || 0).toString().padStart(2, '0')}
                        </span>
                        <span className="text-[8px] text-blue-400 uppercase font-bold">Personnel</span>
                      </div>
                    </div>

                    <DroppableJobsite id="On Vacation" className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                      {filteredMatrix['On Vacation']?.map(({ employee, days }, index) => {
                        const { groupColor } = getRotationGroupStyles(employee.rotation_group);
                        return (
                        <DraggableEmployee key={`${employee.id}-${days?.join('-') || 'no-days'}-${index}`} employee={employee} days={days} activeId={activeId}>
                          <div className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-blue-500/30 transition-colors group/item">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-[10px] font-bold text-blue-500 border border-blue-500/20">
                                {employee.first_name?.[0]}{employee.last_name?.[0]}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${groupColor}`} title={`Rotation Group ${employee.rotation_group || 'None'}`} />
                                  {employee.first_name} {employee.last_name}
                                </div>
                                <div className="text-[9px] text-gray-500 truncate">{employee.job_title}</div>
                              </div>
                            </div>
                            <div className="text-[8px] font-bold text-blue-500/50 uppercase tracking-widest group-hover/item:text-blue-500 transition-colors">
                              {employee.role}
                            </div>
                          </div>
                        </DraggableEmployee>
                        );
                      })}
                    </DroppableJobsite>

                    <div className="px-4 py-3 bg-black/40 border-t border-white/5 flex items-center justify-end">
                      <span className="text-[8px] text-gray-500 uppercase font-bold">Vacation Staff</span>
                    </div>
                  </motion.div>
                )}

                {showOffSite && (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key="off-site-group"
                    className="bg-[#0A120F] border border-amber-900/30 rounded-2xl overflow-hidden transition-all group hover:border-amber-500/50"
                  >
                    <div className="p-4 border-b border-white/5 bg-amber-500/10 flex items-center justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">Off-Site</h3>
                        <p className="text-[10px] text-amber-400 uppercase tracking-tighter font-bold">Training / Personal / Other</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-lg font-mono font-bold text-amber-500">
                          {(filteredMatrix['Off-Site']?.length || 0).toString().padStart(2, '0')}
                        </span>
                        <span className="text-[8px] text-amber-400 uppercase font-bold">Personnel</span>
                      </div>
                    </div>

                    <DroppableJobsite id="Off-Site" className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                      {filteredMatrix['Off-Site']?.map(({ employee, days }, index) => {
                        const { groupColor } = getRotationGroupStyles(employee.rotation_group);
                        return (
                        <DraggableEmployee key={`${employee.id}-${days?.join('-') || 'no-days'}-${index}`} employee={employee} days={days} activeId={activeId}>
                          <div className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-amber-500/30 transition-colors group/item">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-[10px] font-bold text-amber-500 border border-amber-500/20">
                                {employee.first_name?.[0]}{employee.last_name?.[0]}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${groupColor}`} title={`Rotation Group ${employee.rotation_group || 'None'}`} />
                                  {employee.first_name} {employee.last_name}
                                </div>
                                <div className="text-[9px] text-gray-500 truncate">{employee.job_title}</div>
                              </div>
                            </div>
                            <div className="text-[8px] font-bold text-amber-500/50 uppercase tracking-widest group-hover/item:text-amber-500 transition-colors">
                              {employee.role}
                            </div>
                          </div>
                        </DraggableEmployee>
                        );
                      })}
                    </DroppableJobsite>

                    <div className="px-4 py-3 bg-black/40 border-t border-white/5 flex items-center justify-end">
                      <span className="text-[8px] text-gray-500 uppercase font-bold">Off-Site Staff</span>
                    </div>
                  </motion.div>
                )}

                <motion.div
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  key="unassigned-group"
                  className="bg-[#0A120F] border border-gray-800 rounded-2xl overflow-hidden transition-all group hover:border-gray-600"
                >
                  <div className="p-4 border-b border-white/5 bg-white/5 flex items-center justify-between">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white truncate">Unassigned</h3>
                      <p className="text-[10px] text-gray-400 uppercase tracking-tighter font-bold">Available Personnel</p>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-lg font-mono font-bold text-gray-400">
                        {(filteredMatrix['Unassigned']?.length || 0).toString().padStart(2, '0')}
                      </span>
                      <span className="text-[8px] text-gray-400 uppercase font-bold">Personnel</span>
                    </div>
                  </div>

                  <DroppableJobsite id="Unassigned" className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                    {filteredMatrix['Unassigned']?.map(({ employee, days }, index) => {
                      const { groupColor } = getRotationGroupStyles(employee.rotation_group);
                      return (
                      <DraggableEmployee key={`${employee.id}-${days?.join('-') || 'no-days'}-${index}`} employee={employee} days={days} activeId={activeId}>
                        <div className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-gray-500/30 transition-colors group/item">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-bold text-gray-400 border border-white/10">
                              {employee.first_name?.[0]}{employee.last_name?.[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
                                <div className={`w-2 h-2 rounded-full ${groupColor}`} title={`Rotation Group ${employee.rotation_group || 'None'}`} />
                                {employee.first_name} {employee.last_name}
                              </div>
                              <div className="text-[9px] text-gray-500 truncate">{employee.job_title}</div>
                            </div>
                          </div>
                          <div className="text-[8px] font-bold text-gray-500/50 uppercase tracking-widest group-hover/item:text-gray-500 transition-colors">
                            {employee.role}
                          </div>
                        </div>
                      </DraggableEmployee>
                      );
                    })}
                  </DroppableJobsite>

                  <div className="px-4 py-3 bg-black/40 border-t border-white/5 flex items-center justify-end">
                    <span className="text-[8px] text-gray-500 uppercase font-bold">Unassigned Staff</span>
                  </div>
                </motion.div>
                {Object.entries(groupedJobsites)
                  .filter(([groupName]) => groupName.toLowerCase() !== 'rotation' && (filteredMatrix[groupName] || []).length > 0)
                  .sort((a, b) => {
                    if (!sortByStaffing) return 0;
                    const aCount = (filteredMatrix[a[0]] || []).length;
                    const bCount = (filteredMatrix[b[0]] || []).length;
                    return bCount - aCount;
                  })
                  .map(([groupName, sites]: [string, Jobsite[]]) => {
                  const assigned = filteredMatrix[groupName] || [];
                  
                  return (
                    <DroppableJobsite id={groupName} key={groupName} className="h-full">
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`bg-[#0A120F] border rounded-2xl overflow-hidden transition-all group h-full border-emerald-900/30 hover:border-emerald-500/50`}
                      >
                        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-white truncate">{groupName}</h3>
                              {sites.length > 1 && (
                                <span className="text-[8px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold uppercase">Group</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {sites.map(s => (
                                <span key={s.id} className="text-[8px] bg-white/5 text-gray-400 px-1.5 py-0.5 rounded border border-white/10 font-bold uppercase">{s.jobsite_name}</span>
                              ))}
                            </div>
                          </div>
                          <div className="flex flex-col items-end">
                            <div className="flex items-baseline gap-1">
                              <span className={`text-lg font-mono font-bold ${assigned.length >= sites.reduce((acc, s) => acc + (s.min_staffing || 0), 0) ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {assigned.length.toString().padStart(2, '0')}
                              </span>
                              <span className="text-[10px] text-gray-600 font-mono">/ {sites.reduce((acc, s) => acc + (s.min_staffing || 0), 0)}</span>
                            </div>
                            <span className="text-[8px] text-gray-600 uppercase font-bold">Personnel</span>
                          </div>
                        </div>

                        <div className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                          {assigned.length === 0 ? (
                            <div className="py-8 text-center">
                              <Users size={24} className="text-gray-800 mx-auto mb-2" />
                              <p className="text-[10px] text-gray-700 font-bold uppercase">No Personnel Assigned</p>
                            </div>
                          ) : (
                            assigned.map(({ employee, days }, index) => {
                              const isScheduledForRotation = isRotationWeek(currentWeek, { ...employee, rotation_config: rotationConfigs[employee.id] });
                              const isAssignedToRotation = groupName.toLowerCase() === 'rotation';
                              const isAssignedToOffSite = groupName.toLowerCase() === 'off-site';
                              const isAssignedToVacation = groupName.toLowerCase() === 'on vacation';
                              const hasAssignment = days && days.length > 0;
                              const isConflict = isScheduledForRotation && !isAssignedToRotation && !isAssignedToOffSite && !isAssignedToVacation && !hasAssignment;
                              
                              const { groupColor, textColor } = getRotationGroupStyles(employee.rotation_group);

                              return (
                                <DraggableEmployee key={`${employee.id}-${days?.join('-') || 'no-days'}-${index}`} employee={employee} days={days} activeId={activeId}>
                                  <div 
                                    onClick={() => isConflict && setSelectedConflict(employee)}
                                    className={`flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors group/item relative ${isConflict ? 'cursor-help' : ''}`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-[10px] font-bold text-emerald-500 border border-emerald-500/20">
                                        {employee.first_name?.[0]}{employee.last_name?.[0]}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
                                          <div className={`w-2 h-2 rounded-full ${groupColor}`} title={`Rotation Group ${employee.rotation_group || 'None'}`} />
                                          {employee.first_name} {employee.last_name}
                                          {isConflict && (
                                            <div className={`w-2 h-2 rounded-full ${groupColor} animate-pulse`} title={`Scheduled for Rotation (Group ${employee.rotation_group || 'Custom'})`} />
                                          )}
                                        </div>
                                        <div className="text-[9px] text-gray-500 truncate flex items-center gap-1.5">
                                          {employee.job_title}
                                          {isConflict && (
                                            <span className={`text-[8px] ${textColor} font-bold uppercase tracking-tighter`}>
                                              {employee.rotation_group ? `Group ${employee.rotation_group}` : 'Rotation'} Conflict
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-[8px] font-bold text-emerald-500/50 uppercase tracking-widest group-hover/item:text-emerald-500 transition-colors">
                                      {employee.role}
                                    </div>
                                  </div>
                                </DraggableEmployee>
                              );
                            })
                          )}
                        </div>

                        <div className="px-4 py-3 bg-black/40 border-t border-white/5 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                            <MapPin size={12} />
                            {sites.length > 1 ? 'Multiple Locations' : `${sites[0].city}, ${sites[0].state}`}
                          </div>
                          <button className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 transition-colors uppercase tracking-wider">
                            View Sites
                          </button>
                        </div>
                      </motion.div>
                    </DroppableJobsite>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        <DragOverlay style={{ zIndex: 1000 }}>
          {activeId ? (() => {
            const emp = fieldEmployees.find(e => e.id === activeId);
            if (!emp) return null;
            return (
              <div className="p-2 bg-emerald-900/50 rounded-xl border border-emerald-500/50 shadow-2xl cursor-grabbing flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-[10px] font-bold text-emerald-500 border border-emerald-500/20">
                  {emp.first_name[0]}{emp.last_name[0]}
                </div>
                <div className="text-[11px] font-bold text-white truncate">{emp.first_name} {emp.last_name}</div>
              </div>
            );
          })() : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
