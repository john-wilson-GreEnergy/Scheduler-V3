import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, Jobsite } from '../types';
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

interface LogisticsForecastProps {
  employees: Employee[];
  jobsites: Jobsite[];
  onNavigate?: (tab: string) => void;
}

interface AssignmentData {
  employee_id: string;
  email?: string;
  jobsite_name: string;
  week_start: string;
}

export default function LogisticsForecast({ employees, jobsites, onNavigate }: LogisticsForecastProps) {
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
      
      const [weeksRes, assignRes] = await Promise.all([
        supabase.from('assignment_weeks')
          .select('*')
          .gte('week_start', startStr)
          .lt('week_start', endStr),
        supabase.from('assignments')
          .select('*')
          .gte('week_start', startStr)
          .lt('week_start', endStr)
      ]);

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
      console.error('Error fetching forecast data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignments();
  }, [startWeek]);

  const siteGroups = useMemo(() => {
    const groups: Record<string, { name: string, customer: string, isGroup: boolean }> = {};
    
    jobsites.forEach(site => {
      if (site.is_active) {
        const key = (site.jobsite_group || site.jobsite_name).trim();
        if (!groups[key]) {
          groups[key] = {
            name: key,
            customer: site.customer,
            isGroup: !!site.jobsite_group
          };
        }
      }
    });

    return Object.values(groups)
      .filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()) || g.customer.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [jobsites, searchQuery]);

  const getCellData = (siteKey: string, week: string) => {
    const assigned = assignments.filter(a => 
      a.week_start === week && 
      a.jobsite_name.trim().toLowerCase() === siteKey.toLowerCase()
    );
    
    const assignedEmployees = assigned.map(a => {
      const emp = employees.find(e => 
        (a.email && e.email.toLowerCase() === a.email.toLowerCase()) ||
        (a.employee_id && e.employee_id_ref === a.employee_id)
      );
      return emp;
    }).filter(Boolean) as Employee[];

    return {
      count: assignedEmployees.length,
      employees: assignedEmployees
    };
  };

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
                    const isUnderstaffed = data.count < 2;
                    const isOptimal = data.count === 2;
                    const isOverstaffed = data.count > 2;

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
                          <span className="text-sm font-black">{data.count}</span>
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
                  const total = siteGroups.reduce((acc, group) => acc + getCellData(group.name, week).count, 0);
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
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Understaffed (&lt;2)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Optimal (2)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500/20 border border-blue-500/40" />
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Overstaffed (&gt;2)</span>
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
