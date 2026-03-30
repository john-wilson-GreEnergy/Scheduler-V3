
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  RefreshCw, MapPin, Users, Calendar, 
  Building2, Search, BarChart3, Info,
  ExternalLink, Map as MapIcon, ShieldCheck, Shield,
  ArrowUpDown, X, ChevronLeft, ChevronRight, ClipboardList, AlertCircle
} from 'lucide-react';
import RequestsManagement from './RequestsManagement';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, Jobsite, AssignmentWeek, RotationConfig, JobsiteGroup } from '../types';
import PortalLayout from './PortalLayout';
import MapPortal from './MapPortal';
import JobsiteInfoCard from './JobsiteInfoCard';
import { format, startOfWeek, addWeeks, subWeeks } from 'date-fns';
import { fetchCurrentScheduleBackend } from '../lib/supabase_functions';

export default function HRPortal() {
  const { employee } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [loading, setLoading] = useState(true);
  const [allJobsites, setAllJobsites] = useState<Jobsite[]>([]);
  const [jobsiteGroups, setJobsiteGroups] = useState<JobsiteGroup[]>([]);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWeek[]>([]);
  const [availableWeeks, setAvailableWeeks] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [jobsiteSearchQuery, setJobsiteSearchQuery] = useState('');
  const [sortByStaffed, setSortByStaffed] = useState(true);
  const [sortByManpower, setSortByManpower] = useState(true);
  const [selectedJobsite, setSelectedJobsite] = useState<Jobsite | null>(null);
  const getMonday = (d: Date) => {
    const date = new Date(d);
    const day = date.getUTCDay();
    const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
    date.setUTCDate(diff);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  };

  const [currentWeekStart, setCurrentWeekStart] = useState<string>(getMonday(new Date()).toISOString().split('T')[0]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: sites } = await supabase
        .from('jobsites')
        .select('*')
        .eq('is_active', true)
        .order('jobsite_name');

      const { data: groups } = await supabase
        .from('jobsite_groups')
        .select('*');

      const { data: emps } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('last_name');

      const { data: weeks } = await supabase
        .from('assignment_weeks')
        .select('week_start')
        .gte('week_start', currentWeekStart)
        .order('week_start', { ascending: true });

      const distinctWeeks = Array.from(new Set(weeks?.map(w => w.week_start) || []));
      setAvailableWeeks(distinctWeeks);
      // Only update if the currentWeekStart is not in the available weeks and we have available weeks
      if (distinctWeeks.length > 0 && !distinctWeeks.includes(currentWeekStart)) {
        setCurrentWeekStart(distinctWeeks[0]);
      }

      const currentSchedule = await fetchCurrentScheduleBackend(currentWeekStart);

      // Group by employee to match AssignmentWeek structure
      const groupedAssignments: Record<string, AssignmentWeek> = {};
      currentSchedule.forEach(row => {
        if (!row.employee_fk) return;
        if (!groupedAssignments[row.employee_fk]) {
          groupedAssignments[row.employee_fk] = {
            id: row.id,
            week_start: row.week_start,
            employee_fk: row.employee_fk,
            status: row.status,
            assignment_type: row.assignment_type || row.jobsite_name,
            created_at: new Date().toISOString(),
            assignment_items: []
          };
        }
        if (row.jobsite_fk) {
          groupedAssignments[row.employee_fk].assignment_items?.push({
            id: `item-${row.id}-${row.jobsite_fk}`,
            assignment_week_fk: row.id,
            jobsite_fk: row.jobsite_fk,
            days: row.days || [],
            item_order: 0,
            week_start: row.week_start,
            created_at: new Date().toISOString()
          });
        }
      });

      const hrEmployeeIds = (emps || []).filter(e => e.role === 'hr').map(e => e.id);
      const filteredAssignments = Object.values(groupedAssignments).filter(a => !hrEmployeeIds.includes(a.employee_fk || ''));

      setAllJobsites(sites || []);
      setJobsiteGroups(groups || []);
      setAllEmployees(emps || []);
      setAssignments(filteredAssignments);
    } catch (err) {
      console.error('HRPortal fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentWeekStart]);

  const formatDate = (dateString: string, formatStr: string) => {
    const d = new Date(dateString + 'T00:00:00Z');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (formatStr === 'MMM dd') {
      return `${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    if (formatStr === 'MMM dd, yyyy') {
      return `${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')}, ${d.getUTCFullYear()}`;
    }
    return dateString;
  };

  const changeWeek = (amount: number) => {
    const nextWeek = addWeeks(new Date(currentWeekStart + 'T00:00:00Z'), amount);
    setCurrentWeekStart(nextWeek.toISOString().split('T')[0]);
  };

  const tabs = [
    { id: 'overview', label: 'Manpower Overview', icon: <BarChart3 size={16} />, category: 'Global' },
    { id: 'jobsites', label: 'Active Jobsites', icon: <Building2 size={16} />, category: 'Global' },
    { id: 'roster', label: 'Employee Roster', icon: <Users size={16} />, category: 'Global' },
    { id: 'map', label: 'Distribution Map', icon: <MapPin size={16} />, category: 'Global' },
    { id: 'requests', label: 'General Requests', icon: <ClipboardList size={16} />, category: 'Requests' },
    { id: 'ppe_requests', label: 'PPE & Safety Requests', icon: <AlertCircle size={16} />, category: 'Requests' },
  ];

  const stats = useMemo(() => {
    const rotationJobsite = allJobsites.find(j => j.jobsite_name.toLowerCase() === 'rotation');
    const rotationJobsiteId = rotationJobsite?.id;

    const rotationSet = new Set<string>();
    const vacationSet = new Set<string>();
    const trainingSet = new Set<string>();
    const jobsiteSet = new Set<string>();

    assignments.forEach(a => {
      const employeeId = a.employee_fk;
      if (!employeeId) return;

      const hasRotationItem = a.assignment_items?.some(i => i.jobsite_fk === rotationJobsiteId);
      const isRotation = a.status?.toLowerCase() === 'rotation' || a.assignment_type?.toLowerCase() === 'rotation' || hasRotationItem;
      const isVacation = a.status?.toLowerCase() === 'vacation' || a.assignment_type?.toLowerCase() === 'vacation';
      const isTraining = a.status?.toLowerCase() === 'training';

      if (isRotation) {
        rotationSet.add(employeeId);
      } else if (isVacation) {
        vacationSet.add(employeeId);
      } else if (isTraining) {
        trainingSet.add(employeeId);
      } else if (a.assignment_items && a.assignment_items.length > 0) {
        jobsiteSet.add(employeeId);
      }
    });

    // Remove employees from jobsiteSet if they are in any other set (to match Scheduler logic)
    rotationSet.forEach(id => jobsiteSet.delete(id));
    vacationSet.forEach(id => jobsiteSet.delete(id));
    trainingSet.forEach(id => jobsiteSet.delete(id));

    const activeFieldEmployees = allEmployees.filter(e => e.role !== 'hr');
    const totalActive = activeFieldEmployees.length;
    const unassigned = Math.max(0, totalActive - (rotationSet.size + vacationSet.size + trainingSet.size + jobsiteSet.size));

    return {
      assigned: jobsiteSet.size,
      rotation: rotationSet.size,
      vacation: vacationSet.size,
      training: trainingSet.size,
      unassigned,
      total: totalActive,
      activeJobsites: allJobsites.length
    };
  }, [assignments, allEmployees, allJobsites]);

  const distributionItems = useMemo(() => {
    const items: { id: string; name: string; count: number; percentage: number }[] = [];

    // Groups
    jobsiteGroups.forEach(group => {
      const groupSites = allJobsites.filter(s => s.group_id === group.id);
      const groupSiteIds = groupSites.map(s => s.id);
      const groupAssignments = assignments.filter(a => 
        a.assignment_items?.some(item => groupSiteIds.includes(item.jobsite_fk))
      );
      const count = groupAssignments.length;
      if (count > 0) {
        items.push({
          id: group.id,
          name: group.name,
          count,
          percentage: stats.total > 0 ? (count / stats.total) * 100 : 0
        });
      }
    });

    // Ungrouped sites
    allJobsites.filter(s => !s.group_id).forEach(site => {
      const siteAssignments = assignments.filter(a => 
        a.assignment_items?.some(item => item.jobsite_fk === site.id)
      );
      const count = siteAssignments.length;
      if (count > 0) {
        items.push({
          id: site.id,
          name: site.jobsite_name,
          count,
          percentage: stats.total > 0 ? (count / stats.total) * 100 : 0
        });
      }
    });

    if (sortByManpower) {
      return items.sort((a, b) => b.count - a.count);
    }
    return items;
  }, [jobsiteGroups, allJobsites, assignments, stats.total, sortByManpower]);

  return (
    <PortalLayout
      title="HR Visibility Portal"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onRefresh={fetchData}
      currentWeekStart={currentWeekStart}
    >
      <AnimatePresence mode="wait">
        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              {[
                { label: 'Total Employees', value: stats.total, icon: <Users size={20} />, color: 'emerald' },
                { label: 'Active Jobsites', value: stats.activeJobsites, icon: <Building2 size={20} />, color: 'emerald' },
                { label: 'Assigned', value: stats.assigned, icon: <ShieldCheck size={20} />, color: 'emerald' },
                { label: 'On Rotation', value: stats.rotation, icon: <RefreshCw size={20} />, color: 'purple' },
                { label: 'Vacation', value: stats.vacation, icon: <Calendar size={20} />, color: 'amber' },
                { label: 'Unassigned', value: stats.unassigned, icon: <Info size={20} />, color: 'rose' },
              ].map((kpi, i) => (
                <div key={i} className="bg-[#0A120F] border border-white/5 rounded-2xl p-6">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                    kpi.color === 'purple' ? 'bg-purple-500/10 text-purple-400' : 
                    kpi.color === 'amber' ? 'bg-amber-500/10 text-amber-500' :
                    kpi.color === 'rose' ? 'bg-rose-500/10 text-rose-500' :
                    'bg-emerald-500/10 text-emerald-500'
                  }`}>
                    {kpi.icon}
                  </div>
                  <p className="text-3xl font-bold text-white font-mono">{kpi.value}</p>
                  <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">{kpi.label}</p>
                </div>
              ))}
            </div>

            <div className="bg-[#0A120F] border border-white/5 rounded-3xl p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">Manpower Distribution</h2>
                <button
                  onClick={() => setSortByManpower(!sortByManpower)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    sortByManpower 
                      ? 'bg-emerald-500 text-black border-emerald-500' 
                      : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <ArrowUpDown size={12} />
                  Sort by Staffing
                </button>
              </div>
              <div className="space-y-4">
                {distributionItems.map(item => (
                  <div key={item.id} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white font-medium">{item.name}</span>
                      <span className="text-emerald-500 font-bold">{item.count} Employees</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${item.percentage}%` }}
                        className="h-full bg-emerald-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── JOBSITES ── */}
        {activeTab === 'jobsites' && (
          <motion.div key="jobsites" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="relative w-full sm:max-w-md">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search jobsites..."
                  value={jobsiteSearchQuery}
                  onChange={e => setJobsiteSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
              <button
                onClick={() => setSortByStaffed(!sortByStaffed)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                  sortByStaffed 
                    ? 'bg-emerald-500 text-black border-emerald-500' 
                    : 'bg-white/5 text-gray-400 border-white/10 hover:text-white hover:bg-white/10'
                }`}
              >
                <ArrowUpDown size={14} />
                Sort by Staffed
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {allJobsites
                .filter(s => 
                  s.jobsite_name.toLowerCase().includes(jobsiteSearchQuery.toLowerCase()) || 
                  s.customer.toLowerCase().includes(jobsiteSearchQuery.toLowerCase())
                )
                .sort((a, b) => {
                  if (!sortByStaffed) return 0;
                  const countA = assignments.filter(as => as.assignment_items?.some(item => item.jobsite_fk === a.id)).length;
                  const countB = assignments.filter(as => as.assignment_items?.some(item => item.jobsite_fk === b.id)).length;
                  return countB - countA;
                })
                .map(site => {
                  const staffCount = assignments.filter(as => as.assignment_items?.some(item => item.jobsite_fk === site.id)).length;
                  return (
                    <div key={site.id} className="bg-[#0A120F] border border-white/5 rounded-3xl p-6 hover:border-emerald-500/20 transition-all group">
                      <div className="flex items-start justify-between mb-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center">
                            <Building2 size={24} />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-white">{site.jobsite_name}</h3>
                            <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">{site.customer}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] font-bold text-emerald-500 uppercase tracking-wider">
                            {staffCount} Staffed
                          </div>
                          <button 
                            onClick={() => setSelectedJobsite(site)}
                            className="px-4 py-2 bg-white/5 hover:bg-emerald-500 hover:text-black rounded-xl transition-all text-xs font-bold uppercase tracking-wider"
                          >
                            Roster
                          </button>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <MapPin size={14} className="text-gray-500 mt-1 shrink-0" />
                          <div className="text-sm text-gray-400">
                            <p>{site.address1}</p>
                            <p>{site.city}, {site.state} {site.zip}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Users size={14} className="text-gray-500 shrink-0" />
                          <p className="text-sm text-gray-400">
                            Manager: <span className="text-white">{site.manager || 'Unassigned'}</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </motion.div>
        )}

        {/* ── ROSTER ── */}
        {activeTab === 'roster' && (
          <motion.div key="roster" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div className="relative max-w-md flex-1">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
              <div className="flex items-center gap-2 bg-black/40 p-1 rounded-xl border border-white/10">
                <button onClick={() => changeWeek(-1)} className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 transition-colors">
                  <Calendar size={16} className="rotate-180" />
                </button>
                <span className="text-white font-mono text-sm px-3 py-1.5">
                  {formatDate(currentWeekStart, 'MMM dd')} - {formatDate(addWeeks(new Date(currentWeekStart + 'T00:00:00Z'), 1).toISOString().split('T')[0], 'MMM dd, yyyy')}
                </span>
                <button onClick={() => changeWeek(1)} className="p-1.5 hover:bg-white/5 rounded-lg text-gray-400 transition-colors">
                  <Calendar size={16} />
                </button>
              </div>
            </div>

            <div className="bg-[#0A120F] border border-white/5 rounded-3xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02]">
                      <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Employee</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">System Role</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Current Assignment</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {allEmployees
                      .filter(emp => `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchQuery.toLowerCase()))
                      .map(emp => {
                        const assignment = assignments.find(a => a.employee_fk === emp.id);
                        const assignmentItems = assignment?.assignment_items || [];
                        const itemSiteNames = assignmentItems.map(item => {
                          const site = allJobsites.find(s => s.id === item.jobsite_fk);
                          return site?.jobsite_name || 'Unknown';
                        });
                        
                        let displayAssignment = [...new Set(itemSiteNames)].join(', ');
                        if (!displayAssignment) {
                          displayAssignment = assignment?.assignment_type || 'Unassigned';
                        }

                        const status = assignment?.status?.toLowerCase() || 'unassigned';
                        const isRotation = status === 'rotation' || assignment?.assignment_type?.toLowerCase() === 'rotation';
                        const isVacation = status === 'vacation' || assignment?.assignment_type?.toLowerCase() === 'vacation';

                        return (
                          <tr key={emp.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-[10px] font-bold">
                                  {emp.first_name[0]}{emp.last_name[0]}
                                </div>
                                <div>
                                  <p className="text-sm font-bold text-white">{emp.first_name} {emp.last_name}</p>
                                  <p className="text-[10px] text-gray-500 font-mono">{emp.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                                emp.role === 'admin' || emp.role === 'super_admin'
                                  ? 'text-purple-400 bg-purple-400/10 border-purple-400/20' 
                                  : emp.role === 'hr'
                                  ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                                  : 'text-blue-400 bg-blue-400/10 border-blue-400/20'
                              }`}>
                                <Shield size={10} />
                                <span className="uppercase tracking-wider">{(emp.role || 'employee').replace('_', ' ')}</span>
                              </div>
                              <p className="text-[10px] text-gray-500 mt-0.5">{emp.job_title || 'No Title'}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`text-xs font-medium ${
                                isRotation ? 'text-purple-400' :
                                isVacation ? 'text-amber-500' :
                                displayAssignment === 'Unassigned' ? 'text-gray-500' : 'text-white'
                              }`}>
                                {displayAssignment}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                                isRotation ? 'bg-purple-500/10 text-purple-400' : 
                                isVacation ? 'bg-amber-500/10 text-amber-500' :
                                displayAssignment === 'Unassigned' ? 'bg-white/5 text-gray-500' :
                                'bg-emerald-500/10 text-emerald-500'
                              }`}>
                                {isRotation ? 'Rotation' : isVacation ? 'Vacation' : displayAssignment === 'Unassigned' ? 'Unassigned' : 'Active'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── MAP ── */}
        {activeTab === 'map' && (
          <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-[calc(100vh-200px)] rounded-3xl overflow-hidden border border-white/5">
            <MapPortal jobsites={allJobsites} jobsiteGroups={jobsiteGroups} employees={allEmployees} />
          </motion.div>
        )}

        {/* ── REQUESTS ── */}
        {activeTab === 'requests' && (
          <motion.div key="requests" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <RequestsManagement requestTypeFilter="other" />
          </motion.div>
        )}

        {/* ── PPE REQUESTS ── */}
        {activeTab === 'ppe_requests' && (
          <motion.div key="ppe_requests" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <RequestsManagement requestTypeFilter="ppe_safety" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Jobsite Info Modal */}
      <AnimatePresence>
        {selectedJobsite && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setSelectedJobsite(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-[#0A120F] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center">
                      <Building2 size={28} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-white">{selectedJobsite.jobsite_name}</h2>
                      <p className="text-xs text-gray-500 uppercase tracking-widest font-bold">{selectedJobsite.customer}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedJobsite(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all">
                    <X size={20} />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-3">Location Details</h4>
                      <div className="space-y-3">
                        <div className="flex items-start gap-3">
                          <MapPin size={16} className="text-emerald-500 mt-0.5" />
                          <div className="text-sm text-gray-300">
                            <p>{selectedJobsite.address1}</p>
                            <p>{selectedJobsite.city}, {selectedJobsite.state} {selectedJobsite.zip}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Users size={16} className="text-emerald-500" />
                          <p className="text-sm text-gray-300">Manager: {selectedJobsite.manager || 'Unassigned'}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-3">Site Metrics</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <p className="text-[10px] text-gray-500 mb-1">Min Staffing</p>
                          <p className="text-lg font-bold text-white">{selectedJobsite.min_staffing || 'N/A'}</p>
                        </div>
                        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <p className="text-[10px] text-gray-500 mb-1">Safety Score</p>
                          <p className="text-lg font-bold text-emerald-500">{selectedJobsite.safety_score || '100'}%</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h4 className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-3">Current Roster</h4>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                        {assignments
                          .filter(a => a.assignment_items?.some(item => item.jobsite_fk === selectedJobsite.id))
                          .map(a => {
                            const emp = allEmployees.find(e => e.id === a.employee_fk);
                            if (!emp) return null;
                            return (
                              <div key={a.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                <div className="flex items-center gap-3">
                                  <div className="w-6 h-6 bg-emerald-500/10 text-emerald-500 rounded flex items-center justify-center text-[8px] font-bold">
                                    {emp.first_name[0]}{emp.last_name[0]}
                                  </div>
                                  <span className="text-xs text-white">{emp.first_name} {emp.last_name}</span>
                                </div>
                                <span className="text-[10px] text-gray-500">{emp.job_title}</span>
                              </div>
                            );
                          })}
                        {assignments.filter(a => a.assignment_items?.some(item => item.jobsite_fk === selectedJobsite.id)).length === 0 && (
                          <p className="text-xs text-gray-600 italic">No employees currently assigned.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PortalLayout>
  );
}
