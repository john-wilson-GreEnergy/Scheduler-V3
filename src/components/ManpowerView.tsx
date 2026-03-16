import { 
  DndContext, 
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, Jobsite } from '../types';
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
  Info
} from 'lucide-react';
import { format, startOfWeek, addWeeks, isSameWeek, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { isRotationWeek } from '../utils/rotation';
import { RotationConfig } from '../types';

function DraggableEmployee({ employee, children, key }: { employee: Employee, children: React.ReactNode, key?: string | number }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: employee.id,
  });
  const style = transform ? {
    transform: CSS.Translate.toString(transform),
    zIndex: 100,
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing">
      {children}
    </div>
  );
}

function DroppableJobsite({ id, children, className, key }: { id: string, children: React.ReactNode, className?: string, key?: string | number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: id,
  });
  
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? 'ring-2 ring-emerald-500/50' : ''}`}>
      {children}
    </div>
  );
}

interface ManpowerViewProps {
  employees: Employee[];
  jobsites: Jobsite[];
}

interface AssignmentData {
  employee_id: string;
  email?: string;
  jobsite_name: string;
  week_start: string;
}

export default function ManpowerView({ employees, jobsites }: ManpowerViewProps) {
  const [currentWeek, setCurrentWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [assignments, setAssignments] = useState<AssignmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [rotationConfigs, setRotationConfigs] = useState<Record<string, RotationConfig>>({});
  const [selectedConflict, setSelectedConflict] = useState<Employee | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const weekStr = format(currentWeek, 'yyyy-MM-dd');
      
      // Fetch from both tables to ensure we don't miss anything
      const [weeksRes, assignRes, rotRes] = await Promise.all([
        supabase.from('assignment_weeks').select('*').eq('week_start', weekStr),
        supabase.from('assignments').select('*').eq('week_start', weekStr),
        supabase.from('rotation_configs').select('*')
      ]);

      if (rotRes.data) {
        const configMap: Record<string, RotationConfig> = {};
        rotRes.data.forEach(c => configMap[c.employee_fk] = c);
        setRotationConfigs(configMap);
      }

      const combined: AssignmentData[] = [];
      const seen = new Set<string>();

      const processRow = (row: any) => {
        const key = `${row.employee_id || row.email}-${row.week_start}`;
        if (!seen.has(key) && row.assignment_name) {
          combined.push({
            employee_id: row.employee_id,
            email: row.email,
            jobsite_name: row.assignment_name,
            week_start: row.week_start
          });
          seen.add(key);
        }
      };

      weeksRes.data?.forEach(processRow);
      assignRes.data?.forEach(processRow);

      setAssignments(combined);
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
      
      const employee = employees.find(e => e.id === employeeId);
      if (!employee) return;

      const weekStr = format(currentWeek, 'yyyy-MM-dd');

      // Update local state
      const newAssignments = assignments.filter(a => 
        !( (a.employee_id === employee.employee_id_ref || (a.email && a.email.toLowerCase() === employee.email.toLowerCase())) && a.week_start === weekStr)
      );
      
      if (targetJobsiteName !== 'Unassigned') {
        newAssignments.push({
          employee_id: employee.employee_id_ref,
          email: employee.email,
          jobsite_name: targetJobsiteName,
          week_start: weekStr
        });
      }
      setAssignments(newAssignments);

      // Save to Supabase
      try {
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
  }, [currentWeek]);

  const activeEmployees = useMemo(() => employees.filter(e => e.is_active), [employees]);
  const activeJobsites = useMemo(() => jobsites.filter(j => j.is_active), [jobsites]);

  const manpowerMatrix = useMemo(() => {
    const matrix: Record<string, Employee[]> = {
      'On Rotation': [],
      'On Vacation': [],
      'Off-Site': [],
      'Unassigned': []
    };
    
    const offSiteStatuses = ['personal', 'training', 'sick', 'holiday', 'home office'];
    const jobsiteAliases: Record<string, string> = {
      'prospect power': 'prospect',
      'oklahoma': 'oklahoma'
    };

    // Initialize matrix with group names or jobsite names
    jobsites.forEach(site => {
      const key = (site.jobsite_group || site.jobsite_name).trim();
      if (!matrix[key]) {
        matrix[key] = [];
      }
    });

    const assignedEmployeeIds = new Set<string>();

    assignments.forEach(asgn => {
      const emp = activeEmployees.find(e => 
        (asgn.email && e.email.toLowerCase() === asgn.email.toLowerCase()) ||
        (asgn.employee_id && e.employee_id_ref === asgn.employee_id)
      );
      
      if (!emp) return;
      
      const assignmentName = asgn.jobsite_name.trim();
      const lowerAssignment = assignmentName.toLowerCase();
      const normalizedAssignment = jobsiteAliases[lowerAssignment] || lowerAssignment;

      // Treat "-" as unassigned
      if (assignmentName === '-' || assignmentName === '') {
        return;
      }

      assignedEmployeeIds.add(emp.id);

      if (normalizedAssignment === 'rotation') {
        matrix['On Rotation'].push(emp);
      } else if (normalizedAssignment === 'vacation') {
        matrix['On Vacation'].push(emp);
      } else if (offSiteStatuses.includes(normalizedAssignment)) {
        matrix['Off-Site'].push(emp);
      } else {
        // 1. Try to find a matching key in the matrix (case-insensitive)
        let existingKey = Object.keys(matrix).find(key => 
          key.toLowerCase() === normalizedAssignment
        );

        // 2. Fallback: Try to find if this assignment name matches a jobsite name that belongs to a group
        if (!existingKey) {
          const siteMatch = jobsites.find(j => 
            j.jobsite_name.toLowerCase() === normalizedAssignment ||
            (j.jobsite_group && j.jobsite_group.toLowerCase() === normalizedAssignment)
          );
          if (siteMatch) {
            existingKey = (siteMatch.jobsite_group || siteMatch.jobsite_name).trim();
          }
        }

        if (existingKey) {
          matrix[existingKey].push(emp);
        } else {
          matrix[assignmentName] = [emp];
        }
      }
    });

    // Add unassigned active employees
    activeEmployees.forEach(emp => {
      if (!assignedEmployeeIds.has(emp.id)) {
        const isScheduledForRotation = isRotationWeek(currentWeek, rotationConfigs[emp.id], emp.rotation_group);
        if (isScheduledForRotation) {
          matrix['On Rotation'].push(emp);
        } else {
          matrix['Unassigned'].push(emp);
        }
      }
    });

    return matrix;
  }, [activeJobsites, activeEmployees, assignments, rotationConfigs, currentWeek]);

  const filteredMatrix = useMemo(() => {
    if (!searchQuery) return manpowerMatrix;
    
    const lowerQuery = searchQuery.toLowerCase();
    const newMatrix: Record<string, Employee[]> = {};
    
    (Object.entries(manpowerMatrix) as [string, Employee[]][]).forEach(([key, emps]) => {
      const matchingEmps = emps.filter(emp => 
        emp.first_name.toLowerCase().includes(lowerQuery) ||
        emp.last_name.toLowerCase().includes(lowerQuery) ||
        emp.email.toLowerCase().includes(lowerQuery) ||
        emp.job_title.toLowerCase().includes(lowerQuery)
      );
      
      const keyMatches = key.toLowerCase().includes(lowerQuery);
      
      if (keyMatches || matchingEmps.length > 0) {
        newMatrix[key] = keyMatches ? emps : matchingEmps;
      }
    });
    
    return newMatrix;
  }, [manpowerMatrix, searchQuery]);

  const allDisplaySites = useMemo(() => {
    // Get all active jobsites
    const activeSiteNames = activeJobsites.map(j => (j.jobsite_group || j.jobsite_name).trim().toLowerCase());
    
    // Get all names from matrix that aren't special groups
    const specialGroups = ['On Rotation', 'On Vacation', 'Off-Site', 'Unassigned'];
    const matrixSiteNames = Object.keys(filteredMatrix).filter(name => !specialGroups.includes(name));
    
    // Combine and unique
    const allNames = Array.from(new Set([...activeSiteNames, ...matrixSiteNames.map(n => n.toLowerCase())]));
    
    // Convert to display objects
    return allNames.map(name => {
      // Find any site that matches this name (either by name or group)
      const site = jobsites.find(j => 
        j.jobsite_name.trim().toLowerCase() === name.toLowerCase() ||
        (j.jobsite_group && j.jobsite_group.trim().toLowerCase() === name.toLowerCase())
      );
      
      const isGroup = jobsites.some(j => j.jobsite_group && j.jobsite_group.trim().toLowerCase() === name.toLowerCase());
      const groupSites = isGroup ? jobsites.filter(j => j.jobsite_group && j.jobsite_group.trim().toLowerCase() === name.toLowerCase()) : [site];

      return {
        id: site?.id || `virtual-${name}`,
        jobsite_name: site?.jobsite_name || name,
        customer: site?.customer || 'Unmapped Site',
        city: isGroup ? 'Multiple Locations' : (site?.city || 'Unknown'),
        state: isGroup ? '' : (site?.state || '??'),
        isVirtual: !site,
        is_active: groupSites.some(s => s?.is_active),
        min_staffing: site?.min_staffing || 2,
        isGroup
      };
    }).filter(site => site.is_active);
  }, [filteredMatrix, jobsites, activeJobsites]);

  const showRotation = useMemo(() => {
    return (filteredMatrix['On Rotation'] || []).length > 0;
  }, [filteredMatrix]);

  const showVacation = useMemo(() => {
    return (filteredMatrix['On Vacation'] || []).length > 0;
  }, [filteredMatrix]);

  const showOffSite = useMemo(() => {
    return (filteredMatrix['Off-Site'] || []).length > 0;
  }, [filteredMatrix]);

  const showUnassigned = useMemo(() => {
    return (filteredMatrix['Unassigned'] || []).length > 0;
  }, [filteredMatrix]);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={(e) => setActiveId(e.active.id)}>
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
                    key="on-rotation-group"
                    className="bg-[#0A120F] border border-purple-900/30 rounded-2xl overflow-hidden transition-all group hover:border-purple-500/50"
                  >
                    <div className="p-4 border-b border-white/5 bg-purple-500/10 flex items-center justify-between">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">On Rotation</h3>
                        <p className="text-[10px] text-purple-400 uppercase tracking-tighter font-bold">Cycle Break</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-lg font-mono font-bold text-purple-500">
                          {(filteredMatrix['On Rotation']?.length || 0).toString().padStart(2, '0')}
                        </span>
                        <span className="text-[8px] text-purple-400 uppercase font-bold">Personnel</span>
                      </div>
                    </div>

                    <DroppableJobsite id="On Rotation" className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                      {filteredMatrix['On Rotation']?.map(emp => (
                        <DraggableEmployee key={emp.id} employee={emp}>
                          <div className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-purple-500/30 transition-colors group/item">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-purple-500/10 flex items-center justify-center text-[10px] font-bold text-purple-500 border border-purple-500/20">
                                {emp.first_name[0]}{emp.last_name[0]}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold text-white truncate">{emp.first_name} {emp.last_name}</div>
                                <div className="text-[9px] text-gray-500 truncate">{emp.job_title}</div>
                              </div>
                            </div>
                            <div className="text-[8px] font-bold text-purple-500/50 uppercase tracking-widest group-hover/item:text-purple-500 transition-colors">
                              {emp.role}
                            </div>
                          </div>
                        </DraggableEmployee>
                      ))}
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
                      {filteredMatrix['On Vacation']?.map(emp => (
                        <DraggableEmployee key={emp.id} employee={emp}>
                          <div className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-blue-500/30 transition-colors group/item">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-[10px] font-bold text-blue-500 border border-blue-500/20">
                                {emp.first_name[0]}{emp.last_name[0]}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold text-white truncate">{emp.first_name} {emp.last_name}</div>
                                <div className="text-[9px] text-gray-500 truncate">{emp.job_title}</div>
                              </div>
                            </div>
                            <div className="text-[8px] font-bold text-blue-500/50 uppercase tracking-widest group-hover/item:text-blue-500 transition-colors">
                              {emp.role}
                            </div>
                          </div>
                        </DraggableEmployee>
                      ))}
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
                      {filteredMatrix['Off-Site']?.map(emp => (
                        <DraggableEmployee key={emp.id} employee={emp}>
                          <div className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-amber-500/30 transition-colors group/item">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-6 h-6 rounded-lg bg-amber-500/10 flex items-center justify-center text-[10px] font-bold text-amber-500 border border-amber-500/20">
                                {emp.first_name[0]}{emp.last_name[0]}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[11px] font-bold text-white truncate">{emp.first_name} {emp.last_name}</div>
                                <div className="text-[9px] text-gray-500 truncate">{emp.job_title}</div>
                              </div>
                            </div>
                            <div className="text-[8px] font-bold text-amber-500/50 uppercase tracking-widest group-hover/item:text-amber-500 transition-colors">
                              {emp.role}
                            </div>
                          </div>
                        </DraggableEmployee>
                      ))}
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
                    {filteredMatrix['Unassigned']?.map(emp => (
                      <DraggableEmployee key={emp.id} employee={emp}>
                        <div className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-gray-500/30 transition-colors group/item">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center text-[10px] font-bold text-gray-400 border border-white/10">
                              {emp.first_name[0]}{emp.last_name[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="text-[11px] font-bold text-white truncate">{emp.first_name} {emp.last_name}</div>
                              <div className="text-[9px] text-gray-500 truncate">{emp.job_title}</div>
                            </div>
                          </div>
                          <div className="text-[8px] font-bold text-gray-500/50 uppercase tracking-widest group-hover/item:text-gray-500 transition-colors">
                            {emp.role}
                          </div>
                        </div>
                      </DraggableEmployee>
                    ))}
                  </DroppableJobsite>

                  <div className="px-4 py-3 bg-black/40 border-t border-white/5 flex items-center justify-end">
                    <span className="text-[8px] text-gray-500 uppercase font-bold">Unassigned Staff</span>
                  </div>
                </motion.div>
                {allDisplaySites.map((site) => {
                  const assigned = filteredMatrix[site.jobsite_name] || [];
                  
                  return (
                    <DroppableJobsite id={site.jobsite_name} key={site.id} className="h-full">
                      <motion.div
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={`bg-[#0A120F] border rounded-2xl overflow-hidden transition-all group h-full ${
                          assigned.length === 0 ? 'border-white/5 opacity-50' : 
                          site.isVirtual ? 'border-amber-900/30 hover:border-amber-500/50' :
                          'border-emerald-900/30 hover:border-emerald-500/50'
                        }`}
                      >
                        <div className={`p-4 border-b border-white/5 flex items-center justify-between ${
                          site.isVirtual ? 'bg-amber-500/5' : 'bg-black/20'
                        }`}>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-bold text-white truncate">{site.jobsite_name}</h3>
                              {site.isGroup && (
                                <span className="text-[8px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold uppercase">Group</span>
                              )}
                              {site.isVirtual && (
                                <span className="text-[8px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold uppercase">Unmapped</span>
                              )}
                              {!site.is_active && !site.isVirtual && (
                                <span className="text-[8px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded border border-red-500/20 font-bold uppercase">Inactive</span>
                              )}
                            </div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-tighter font-bold">{site.customer}</p>
                          </div>
                          <div className="flex flex-col items-end">
                            <div className="flex items-baseline gap-1">
                              <span className={`text-lg font-mono font-bold ${assigned.length >= site.min_staffing ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {assigned.length.toString().padStart(2, '0')}
                              </span>
                              <span className="text-[10px] text-gray-600 font-mono">/ {site.min_staffing}</span>
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
                            assigned.map(emp => {
                              const isScheduledForRotation = isRotationWeek(currentWeek, rotationConfigs[emp.id], emp.rotation_group);
                              const isAssignedToRotation = site.jobsite_name.toLowerCase() === 'rotation';
                              const isAssignedToOffSite = site.jobsite_name.toLowerCase() === 'off-site';
                              const isConflict = isScheduledForRotation && !isAssignedToRotation && !isAssignedToOffSite;
                              
                              const groupColor = emp.rotation_group === 'A' ? 'bg-black border border-white/20' :
                                               emp.rotation_group === 'B' ? 'bg-red-500' :
                                               emp.rotation_group === 'C' ? 'bg-yellow-500' :
                                               emp.rotation_group === 'D' ? 'bg-blue-500' : 'bg-purple-500';
                              
                              const textColor = emp.rotation_group === 'A' ? 'text-white' :
                                              emp.rotation_group === 'B' ? 'text-red-400' :
                                              emp.rotation_group === 'C' ? 'text-yellow-400' :
                                              emp.rotation_group === 'D' ? 'text-blue-400' : 'text-purple-400';

                              return (
                                <DraggableEmployee key={emp.id} employee={emp}>
                                  <div 
                                    onClick={() => isConflict && setSelectedConflict(emp)}
                                    className={`flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors group/item relative ${isConflict ? 'cursor-help' : ''}`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-[10px] font-bold text-emerald-500 border border-emerald-500/20">
                                        {emp.first_name[0]}{emp.last_name[0]}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
                                          {emp.first_name} {emp.last_name}
                                          {isConflict && (
                                            <div className={`w-2 h-2 rounded-full ${groupColor} animate-pulse`} title={`Scheduled for Rotation (Group ${emp.rotation_group || 'Custom'})`} />
                                          )}
                                        </div>
                                        <div className="text-[9px] text-gray-500 truncate flex items-center gap-1.5">
                                          {emp.job_title}
                                          {isConflict && (
                                            <span className={`text-[8px] ${textColor} font-bold uppercase tracking-tighter`}>
                                              {emp.rotation_group ? `Group ${emp.rotation_group}` : 'Rotation'} Conflict
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="text-[8px] font-bold text-emerald-500/50 uppercase tracking-widest group-hover/item:text-emerald-500 transition-colors">
                                      {emp.role}
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
                            {site.city}, {site.state}
                          </div>
                          <button className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 transition-colors uppercase tracking-wider">
                            View Site
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

        <DragOverlay>
          {activeId ? (() => {
            const emp = employees.find(e => e.id === activeId);
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
