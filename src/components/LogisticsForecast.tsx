import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, Jobsite, JobsiteGroup } from '../types';
import { format, startOfWeek, addWeeks, parseISO } from 'date-fns';
import { 
  Calendar, 
  Users, 
  MapPin, 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Filter, 
  Search,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseAssignmentNames } from '../utils/assignmentParser';

interface LogisticsForecastProps {
  employees: Employee[];
  jobsites: Jobsite[];
  jobsiteGroups: JobsiteGroup[];
  onNavigate?: (tab: string) => void;
}

interface AssignmentData {
  employee_id: string;
  email?: string;
  jobsite_name: string;
  week_start: string;
}

export default function LogisticsForecast({ employees, jobsites, jobsiteGroups, onNavigate }: LogisticsForecastProps) {
  const fieldEmployees = useMemo(() => employees.filter(e => e.role !== 'hr'), [employees]);
  const [startWeek, setStartWeek] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [assignments, setAssignments] = useState<AssignmentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCell, setSelectedCell] = useState<{ siteKey: string, week: string } | null>(null);

  const weeks = useMemo(() => {
    const w = [];
    for (let i = 0; i < 8; i++) {
      w.push(format(addWeeks(startWeek, i), 'yyyy-MM-dd'));
    }
    return w;
  }, [startWeek]);

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const startStr = format(startWeek, 'yyyy-MM-dd');
      const endStr = format(addWeeks(startWeek, 8), 'yyyy-MM-dd');
      
      const { data: weeksRes } = await supabase.from('assignment_weeks')
          .select('*, items:assignment_items(*)')
          .gte('week_start', startStr)
          .lt('week_start', endStr);

      const assignmentsMap = new Map<string, any>();
      weeksRes?.forEach(row => {
        const key = `${row.employee_fk}-${row.week_start}`;
        if (!assignmentsMap.has(key)) {
          assignmentsMap.set(key, { ...row, items: [...(row.items || [])] });
        } else {
          const existing = assignmentsMap.get(key);
          existing.items = [...existing.items, ...(row.items || [])];
        }
      });
      const mergedWeeks = Array.from(assignmentsMap.values());

      const combined: AssignmentData[] = [];
      const seen = new Set<string>();

      const processRow = (row: any) => {
        const status = row.status?.toLowerCase().trim();
        if (status === 'rotation' || status === 'vacation') return;

        const jobsiteNames = parseAssignmentNames(row.assignment_name);
        
        if (row.items) {
          row.items.forEach((item: any) => {
            const jobsite = jobsites.find(j => j.id === item.jobsite_fk);
            if (jobsite) {
              jobsiteNames.push(jobsite.jobsite_name);
            }
          });
        }

        jobsiteNames.forEach(name => {
          if (['vacation', 'rotation'].includes(name.toLowerCase().trim())) return;
          const key = `${row.employee_fk || row.email}-${row.week_start}-${name}`;
          if (!seen.has(key)) {
            combined.push({
              employee_id: row.employee_fk,
              email: row.email,
              jobsite_name: name,
              week_start: row.week_start
            });
            seen.add(key);
          }
        });
      };

      mergedWeeks.forEach(processRow);

      setAssignments(combined);
    } catch (err) {
      console.error('Error fetching forecast data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, [startWeek]);

  const getCellData = (siteKey: string, week: string) => {
    const assigned = assignments.filter(a => {
      if (a.week_start !== week) return false;
      
      const jobsite = jobsites.find(j => j.jobsite_name.trim().toLowerCase() === a.jobsite_name.trim().toLowerCase());
      const group = jobsite?.group_id ? jobsiteGroups.find(g => g.id === jobsite.group_id) : null;
      const key = (group ? group.name : jobsite?.jobsite_name || a.jobsite_name).trim().toLowerCase();
      
      return key === siteKey.toLowerCase();
    });
    
    const assignedEmployeesMap = new Map<string, Employee>();
    assigned.forEach(a => {
      const emp = fieldEmployees.find(e => 
        (a.email && e.email.toLowerCase() === a.email.toLowerCase()) ||
        (a.employee_id && e.id === a.employee_id)
      );
      if (emp && !assignedEmployeesMap.has(emp.id)) {
        assignedEmployeesMap.set(emp.id, emp);
      }
    });
    
    const uniqueEmployees = Array.from(assignedEmployeesMap.values());

    return {
      count: uniqueEmployees.length,
      employees: uniqueEmployees
    };
  };

  const siteGroups = useMemo(() => {
    const groups: Record<string, { name: string, customer: string, isGroup: boolean, requirement: number }> = {};
    
    jobsites.forEach(site => {
      if (site.is_active) {
        const group = site.group_id ? jobsiteGroups.find(g => g.id === site.group_id) : null;
        const key = (group ? group.name : site.jobsite_name).trim();
        if (!groups[key]) {
          groups[key] = {
            name: key,
            customer: site.customer,
            isGroup: !!group,
            requirement: 0
          };
        }
        groups[key].requirement += (site.min_staffing || 0);
      }
    });

    const alwaysShow = ['rotation', 'vacation', 'oklahoma', 'personal'];
    return Object.values(groups)
      .filter(g => {
        const matchesSearch = g.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              g.customer.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesSearch) return false;

        if (alwaysShow.includes(g.name.toLowerCase())) return true;

        return weeks.some(week => getCellData(g.name, week).count > 0);
      })
      .sort((a, b) => {
        if (a.name.toLowerCase() === 'rotation') return -1;
        if (b.name.toLowerCase() === 'rotation') return 1;
        
        const countA = weeks.reduce((sum, week) => sum + getCellData(a.name, week).count, 0);
        const countB = weeks.reduce((sum, week) => sum + getCellData(b.name, week).count, 0);
        
        return countB - countA;
      });
  }, [jobsites, jobsiteGroups, searchQuery, assignments, fieldEmployees, weeks, getCellData]);

  const exportToCSV = () => {
    const headers = ['Jobsite', 'Customer', ...weeks.map(w => format(parseISO(w), 'MMM dd'))];
    const rows = siteGroups.map(group => {
      const row = [group.name, group.customer];
      weeks.forEach(week => {
        row.push(getCellData(group.name, week).count.toString());
      });
      return row;
    });

    const csvContent = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logistics-forecast-${format(startWeek, 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Logistics Forecast</h2>
          <p className="text-gray-500 text-sm">8-week rolling view of jobsite staffing levels.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text"
              placeholder="Search sites or customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-black/20 border border-emerald-900/30 rounded-xl text-sm text-white focus:outline-none focus:border-emerald-500 transition-colors w-64"
            />
          </div>
          
          <div className="flex items-center bg-black/20 border border-emerald-900/30 rounded-xl p-1">
            <button 
              onClick={() => setStartWeek(addWeeks(startWeek, -1))}
              className="p-2 hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-4 text-xs font-bold text-emerald-500 uppercase tracking-widest">
              {format(startWeek, 'MMM dd')}
            </div>
            <button 
              onClick={() => setStartWeek(addWeeks(startWeek, 1))}
              className="p-2 hover:bg-white/5 rounded-lg text-gray-400 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-white text-sm font-bold rounded-xl hover:bg-white/10 transition-all"
          >
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-emerald-900/30 bg-emerald-500/5">
                <th className="px-6 py-4 text-[10px] font-bold text-emerald-500 uppercase tracking-widest sticky left-0 bg-[#0A120F] z-10 border-r border-emerald-900/30">
                  Jobsite / Group
                </th>
                {weeks.map(week => (
                  <th key={week} className="px-4 py-4 text-center min-w-[100px]">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">
                      {format(parseISO(week), 'MMM dd')}
                    </p>
                    <p className="text-[8px] text-gray-500 uppercase font-black">Week Start</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/10">
              {siteGroups.map(group => (
                <tr key={group.name} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 sticky left-0 bg-[#0A120F] z-10 border-r border-emerald-900/30">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-white truncate max-w-[180px]">{group.name}</p>
                      {group.isGroup && (
                        <span className="text-[7px] bg-emerald-500/10 text-emerald-500 px-1 py-0.5 rounded border border-emerald-500/20 font-black uppercase">Group</span>
                      )}
                    </div>
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{group.customer}</p>
                  </td>
                  {weeks.map(week => {
                    const data = getCellData(group.name, week);
                    const isUnderstaffed = data.count < group.requirement;
                    const isOptimal = data.count === group.requirement;
                    const isOverstaffed = data.count > group.requirement;

                    return (
                      <td 
                        key={week} 
                        className="p-2 text-center"
                        onClick={() => setSelectedCell({ siteKey: group.name, week })}
                      >
                        <div className={`
                          mx-auto w-12 h-12 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all border
                          ${isUnderstaffed ? 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20' : ''}
                          ${isOptimal ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20' : ''}
                          ${isOverstaffed ? 'bg-blue-500/10 border-blue-500/20 text-blue-500 hover:bg-blue-500/20' : ''}
                          ${data.count === 0 ? 'bg-white/5 border-white/5 text-gray-600 opacity-30' : ''}
                        `}>
                          <span className="text-sm font-black">{data.count}/{group.requirement}</span>
                          <span className="text-[7px] font-bold uppercase opacity-60">Staff</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-emerald-500/20 bg-emerald-500/5">
                <td className="px-6 py-4 sticky left-0 bg-[#0A120F] z-10 border-r border-emerald-900/30">
                  <p className="text-xs font-black text-emerald-500 uppercase tracking-widest">Total Manpower</p>
                  <p className="text-[8px] text-gray-500 uppercase font-bold">Across All Sites</p>
                </td>
                {weeks.map(week => {
                  // Calculate unique employees assigned to any jobsite for this week
                  const uniqueEmployees = new Set<string>();
                  assignments.filter(a => a.week_start === week).forEach(a => {
                    const emp = fieldEmployees.find(e => 
                      (a.email && e.email.toLowerCase() === a.email.toLowerCase()) ||
                      (a.employee_id && e.employee_id_ref === a.employee_id)
                    );
                    if (emp) uniqueEmployees.add(emp.id);
                    else if (a.employee_id) uniqueEmployees.add(a.employee_id); // Fallback
                  });
                  const total = uniqueEmployees.size;
                  
                  return (
                    <td key={week} className="p-2 text-center">
                      <div className="mx-auto w-12 h-12 flex flex-col items-center justify-center">
                        <span className="text-sm font-black text-white">{total}</span>
                        <span className="text-[7px] font-bold text-emerald-500/70 uppercase">Total</span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Roster Modal */}
      <AnimatePresence>
        {selectedCell && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-emerald-900/10 bg-emerald-500/5 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedCell.siteKey}</h3>
                  <p className="text-xs text-emerald-500 font-bold uppercase tracking-widest">
                    Week of {format(parseISO(selectedCell.week), 'MMMM dd, yyyy')}
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedCell(null)}
                  className="p-2 hover:bg-white/5 rounded-xl text-gray-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-6 space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar">
                {getCellData(selectedCell.siteKey, selectedCell.week).employees.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="mx-auto text-gray-700 mb-2" size={32} />
                    <p className="text-gray-500 italic text-sm">No employees assigned for this week.</p>
                  </div>
                ) : (
                  getCellData(selectedCell.siteKey, selectedCell.week).employees.map(emp => (
                    <div key={emp.id} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                      <div>
                        <p className="text-sm font-bold text-white">{emp.first_name} {emp.last_name}</p>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{emp.role}</p>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                        <Users size={14} />
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="p-6 bg-black/40 border-t border-emerald-900/10 flex justify-between items-center">
                {onNavigate && (
                  <button 
                    onClick={() => onNavigate('dashboard')}
                    className="text-xs text-emerald-500 font-bold uppercase tracking-widest hover:text-emerald-400 transition-colors flex items-center gap-2"
                  >
                    <LayoutGrid size={14} />
                    Open in Scheduler
                  </button>
                )}
                <button 
                  onClick={() => setSelectedCell(null)}
                  className="px-6 py-2 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-all"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <div className="flex items-center gap-6 p-4 bg-black/20 border border-emerald-900/10 rounded-2xl">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/40" />
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Understaffed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Optimal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500/20 border border-blue-500/40" />
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Overstaffed</span>
        </div>
      </div>
    </div>
  );
}

function X({ size, className }: { size: number, className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
