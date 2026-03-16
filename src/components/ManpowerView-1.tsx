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

  const allDisplaySites = useMemo(() => {
    // Get all keys from matrix that aren't special groups
    const specialGroups = ['On Rotation', 'On Vacation', 'Off-Site', 'Unassigned'];
    const siteNames = Object.keys(manpowerMatrix).filter(name => !specialGroups.includes(name));
    
    // Convert to display objects
    const displaySites = siteNames.map(name => {
      // Find any site that matches this name (either by name or group)
      const site = jobsites.find(j => 
        j.jobsite_name.trim().toLowerCase() === name.toLowerCase() ||
        (j.jobsite_group && j.jobsite_group.trim().toLowerCase() === name.toLowerCase())
      );
      
      const isGroup = jobsites.some(j => j.jobsite_group && j.jobsite_group.trim().toLowerCase() === name.toLowerCase());
      const groupSites = isGroup ? jobsites.filter(j => j.jobsite_group && j.jobsite_group.trim().toLowerCase() === name.toLowerCase()) : [site];

      return {
        id: site?.id || `virtual-${name}`,
        jobsite_name: name,
        customer: site?.customer || 'Unmapped Site',
        city: isGroup ? 'Multiple Locations' : (site?.city || 'Unknown'),
        state: isGroup ? '' : (site?.state || '??'),
        isVirtual: !site,
        is_active: groupSites.some(s => s?.is_active),
        min_staffing: site?.min_staffing || 2,
        isGroup
      };
    });

    return displaySites.filter(site => 
      site.jobsite_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      site.customer?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [manpowerMatrix, activeJobsites, searchQuery]);

  const showRotation = useMemo(() => {
    const rotationList = manpowerMatrix['On Rotation'] || [];
    return rotationList.length > 0 || searchQuery.toLowerCase().includes('rotation');
  }, [manpowerMatrix, searchQuery]);

  const showVacation = useMemo(() => {
    const vacationList = manpowerMatrix['On Vacation'] || [];
    return vacationList.length > 0 || searchQuery.toLowerCase().includes('vacation');
  }, [manpowerMatrix, searchQuery]);

  const showOffSite = useMemo(() => {
    const offSiteList = manpowerMatrix['Off-Site'] || [];
    return offSiteList.length > 0 || searchQuery.toLowerCase().includes('off-site') || searchQuery.toLowerCase().includes('personal') || searchQuery.toLowerCase().includes('training');
  }, [manpowerMatrix, searchQuery]);

  const showUnassigned = useMemo(() => {
    const unassignedList = manpowerMatrix['Unassigned'] || [];
    return unassignedList.length > 0 || searchQuery.toLowerCase().includes('unassigned');
  }, [manpowerMatrix, searchQuery]);

  return (
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
                        {(manpowerMatrix['On Rotation']?.length || 0).toString().padStart(2, '0')}
                      </span>
                      <span className="text-[8px] text-purple-400 uppercase font-bold">Personnel</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                    {manpowerMatrix['On Rotation']?.map(emp => (
                      <div key={emp.id} className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-purple-500/30 transition-colors group/item">
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
                    ))}
                  </div>

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
                        {(manpowerMatrix['On Vacation']?.length || 0).toString().padStart(2, '0')}
                      </span>
                      <span className="text-[8px] text-blue-400 uppercase font-bold">Personnel</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                    {manpowerMatrix['On Vacation']?.map(emp => (
                      <div key={emp.id} className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-blue-500/30 transition-colors group/item">
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
                    ))}
                  </div>

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
                        {(manpowerMatrix['Off-Site']?.length || 0).toString().padStart(2, '0')}
                      </span>
                      <span className="text-[8px] text-amber-400 uppercase font-bold">Personnel</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                    {manpowerMatrix['Off-Site']?.map(emp => (
                      <div key={emp.id} className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-amber-500/30 transition-colors group/item">
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
                    ))}
                  </div>

                  <div className="px-4 py-3 bg-black/40 border-t border-white/5 flex items-center justify-end">
                    <span className="text-[8px] text-gray-500 uppercase font-bold">Off-Site Staff</span>
                  </div>
                </motion.div>
              )}

              {showUnassigned && (
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
                        {(manpowerMatrix['Unassigned']?.length || 0).toString().padStart(2, '0')}
                      </span>
                      <span className="text-[8px] text-gray-400 uppercase font-bold">Personnel</span>
                    </div>
                  </div>

                  <div className="p-4 space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                    {manpowerMatrix['Unassigned']?.map(emp => (
                      <div key={emp.id} className="flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-gray-500/30 transition-colors group/item">
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
                    ))}
                  </div>

                  <div className="px-4 py-3 bg-black/40 border-t border-white/5 flex items-center justify-end">
                    <span className="text-[8px] text-gray-500 uppercase font-bold">Unassigned Staff</span>
                  </div>
                </motion.div>
              )}
              {allDisplaySites.map((site) => {
                const assigned = manpowerMatrix[site.jobsite_name] || [];
                if (assigned.length === 0 && searchQuery === '') return null; // Only show active sites or searched sites

                return (
                  <motion.div
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    key={site.id}
                    className={`bg-[#0A120F] border rounded-2xl overflow-hidden transition-all group ${
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
                          const groupColor = emp.rotation_group === 'A' ? 'bg-black border border-white/20' :
                                           emp.rotation_group === 'B' ? 'bg-red-500' :
                                           emp.rotation_group === 'C' ? 'bg-yellow-500' :
                                           emp.rotation_group === 'D' ? 'bg-blue-500' : 'bg-purple-500';
                          
                          const textColor = emp.rotation_group === 'A' ? 'text-white' :
                                          emp.rotation_group === 'B' ? 'text-red-400' :
                                          emp.rotation_group === 'C' ? 'text-yellow-400' :
                                          emp.rotation_group === 'D' ? 'text-blue-400' : 'text-purple-400';

                          return (
                            <div 
                              key={emp.id} 
                              onClick={() => isScheduledForRotation && setSelectedConflict(emp)}
                              className={`flex items-center justify-between p-2 bg-white/5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-colors group/item relative ${isScheduledForRotation ? 'cursor-help' : ''}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-[10px] font-bold text-emerald-500 border border-emerald-500/20">
                                  {emp.first_name[0]}{emp.last_name[0]}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[11px] font-bold text-white truncate flex items-center gap-1.5">
                                    {emp.first_name} {emp.last_name}
                                    {isScheduledForRotation && (
                                      <div className={`w-2 h-2 rounded-full ${groupColor} animate-pulse`} title={`Scheduled for Rotation (Group ${emp.rotation_group || 'Custom'})`} />
                                    )}
                                  </div>
                                  <div className="text-[9px] text-gray-500 truncate flex items-center gap-1.5">
                                    {emp.job_title}
                                    {isScheduledForRotation && (
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
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Conflict Explanation Modal */}
      <AnimatePresence>
        {selectedConflict && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[#0A120F] border border-emerald-900/30 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-emerald-500/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                    <RefreshCw size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Rotation Conflict</h3>
                    <p className="text-xs text-emerald-500/70 uppercase font-bold tracking-wider">Group {selectedConflict.rotation_group} Schedule</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedConflict(null)}
                  className="p-2 hover:bg-white/5 rounded-xl text-gray-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-sm text-gray-300 leading-relaxed">
                    <span className="text-emerald-500 font-bold">{selectedConflict.first_name} {selectedConflict.last_name}</span> is currently assigned to <span className="text-white font-bold">{assignments.find(a => (a.email && a.email.toLowerCase() === selectedConflict.email.toLowerCase()) || (a.employee_id && a.employee_id_ref === selectedConflict.employee_id))?.jobsite_name}</span>, but their rotation schedule (Group {selectedConflict.rotation_group}) indicates they should be <span className="text-purple-500 font-bold uppercase tracking-widest">Off-Site</span> this week.
                  </p>
                </div>

                <div className="flex items-center gap-3 p-4 bg-amber-500/5 rounded-2xl border border-amber-500/10">
                  <AlertCircle size={20} className="text-amber-500 shrink-0" />
                  <p className="text-[11px] text-amber-200/70 font-medium">
                    This conflict occurs when an employee is manually assigned to a jobsite during their scheduled time off.
                  </p>
                </div>
              </div>

              <div className="p-6 bg-black/40 border-t border-white/5 flex justify-end">
                <button 
                  onClick={() => setSelectedConflict(null)}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-sm font-bold text-black transition-all"
                >
                  Understood
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Stats Footer */}
      <div className="p-4 bg-[#0A120F] border-t border-emerald-900/20 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
          <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Total Deployed</div>
          <div className="text-xl font-mono font-bold text-emerald-500">{assignments.length}</div>
        </div>
        <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
          <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Active Sites</div>
          <div className="text-xl font-mono font-bold text-blue-500">
            {new Set(assignments.map(a => a.jobsite_name)).size}
          </div>
        </div>
        <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
          <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Avg. Staffing</div>
          <div className="text-xl font-mono font-bold text-purple-500">
            {(assignments.length / (new Set(assignments.map(a => a.jobsite_name)).size || 1)).toFixed(1)}
          </div>
        </div>
        <div className="p-3 bg-white/5 rounded-2xl border border-white/5">
          <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Unassigned</div>
          <div className="text-xl font-mono font-bold text-amber-500">
            {activeEmployees.length - assignments.length}
          </div>
        </div>
      </div>
    </div>
  );
}
