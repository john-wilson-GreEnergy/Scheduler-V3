import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { assignmentService } from '../services/assignmentService';
import { Employee, AssignmentWeek } from '../types';
import { Search, Calendar, MapPin, Clock, ChevronLeft, ChevronRight, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfWeek, addWeeks, parseISO } from 'date-fns';

export default function ScheduleLookup() {
  const [searchTerm, setSearchTerm] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    if (searchTerm.length < 2) {
      setEmployees([]);
      return;
    }

    const searchEmployees = async () => {
      setSearchLoading(true);
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .or(`first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`)
        .eq('is_active', true)
        .limit(5);

      if (error) console.error(error);
      else setEmployees(data || []);
      setSearchLoading(false);
    };

    const timer = setTimeout(searchEmployees, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleSelectEmployee = async (emp: Employee) => {
    setSelectedEmployee(emp);
    setSearchTerm('');
    setEmployees([]);
    setLoading(true);

    try {
      const data = await assignmentService.getAssignmentsByEmployeeId(emp.id);
      setAssignments(data || []);
    } catch (err) {
      console.error('Error fetching assignments:', err);
    } finally {
      setLoading(false);
    }
  };

  const today = startOfWeek(new Date(), { weekStartsOn: 1 });
  const currentWeekStr = format(today, 'yyyy-MM-dd');

  return (
    <div className="space-y-6">
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            placeholder="Search employee to lookup schedule..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0A120F] border border-emerald-900/20 rounded-2xl pl-12 pr-4 py-4 text-white focus:border-emerald-500 outline-none transition-all shadow-xl"
          />
          {searchLoading && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2">
              <div className="w-5 h-5 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          )}
        </div>

        <AnimatePresence>
          {employees.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute top-full left-0 right-0 mt-2 bg-[#0A120F] border border-emerald-900/30 rounded-2xl overflow-hidden z-50 shadow-2xl"
            >
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => handleSelectEmployee(emp)}
                  className="w-full px-6 py-4 text-left hover:bg-emerald-500/5 flex items-center gap-4 border-b border-white/5 last:border-0 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold">
                    {emp.first_name[0]}{emp.last_name[0]}
                  </div>
                  <div>
                    <p className="font-bold text-white">{emp.first_name} {emp.last_name}</p>
                    <p className="text-xs text-gray-500">{emp.job_title} • {emp.email}</p>
                  </div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {selectedEmployee && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#0A120F] border border-emerald-900/20 rounded-3xl overflow-hidden"
        >
          <div className="p-8 border-b border-white/5 bg-emerald-500/5 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-2xl font-bold text-emerald-500 border border-emerald-500/20">
                {selectedEmployee.first_name[0]}{selectedEmployee.last_name[0]}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{selectedEmployee.first_name} {selectedEmployee.last_name}</h2>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-sm text-emerald-500/80 font-medium uppercase tracking-wider">{selectedEmployee.job_title}</span>
                  <span className="text-gray-600">•</span>
                  <span className="text-sm text-gray-500 font-mono">{selectedEmployee.employee_id_ref}</span>
                </div>
              </div>
            </div>
            <button 
              onClick={() => setSelectedEmployee(null)}
              className="p-2 hover:bg-white/5 rounded-xl text-gray-500 hover:text-white transition-colors"
            >
              Clear
            </button>
          </div>

          <div className="p-8">
            {loading ? (
              <div className="py-20 flex flex-col items-center justify-center gap-4">
                <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-gray-500 animate-pulse">Fetching assignment history...</p>
              </div>
            ) : assignments.length === 0 ? (
              <div className="py-20 text-center">
                <Calendar className="mx-auto text-gray-700 mb-4" size={48} />
                <p className="text-gray-500">No assignment history found for this employee.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {assignments.map((a) => {
                  const isCurrent = a.week_start === currentWeekStr;
                  const isPast = a.week_start < currentWeekStr;
                  const isRotation = a.status?.toLowerCase() === 'rotation' || a.assignment_items?.some((i: any) => i.assignment_type?.toLowerCase() === 'rotation');
                  
                  return (
                    <div 
                      key={a.id}
                      className={`relative p-6 rounded-2xl border transition-all ${
                        isCurrent 
                          ? 'bg-emerald-500/10 border-emerald-500/30 ring-1 ring-emerald-500/20' 
                          : 'bg-white/5 border-white/5 hover:border-white/10'
                      } ${isPast ? 'opacity-60' : ''}`}
                    >
                      {isCurrent && (
                        <div className="absolute -top-3 left-6 px-3 py-1 bg-emerald-500 text-black text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg">
                          Current Week
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-gray-400">
                          <Calendar size={14} />
                          <span className="text-xs font-bold uppercase tracking-wider">
                            {format(parseISO(a.week_start), 'MMM dd, yyyy')}
                          </span>
                        </div>
                        {isRotation && (
                          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-bold rounded uppercase tracking-wider border border-amber-500/20">
                            Rotation
                          </span>
                        )}
                      </div>

                      <div className="space-y-3">
                        {a.assignment_items && a.assignment_items.length > 0 ? (
                          a.assignment_items.map((item: any, idx: number) => (
                            <div key={item.id} className="flex items-start gap-3">
                              <div className="mt-1">
                                <MapPin size={14} className="text-emerald-500" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white">
                                  {item.jobsites?.jobsite_name || 'Unassigned'}
                                </p>
                                <p className="text-[10px] text-gray-500 uppercase font-bold mt-0.5">
                                  {item.jobsites?.jobsite_group || item.jobsites?.customer || 'No Group'}
                                </p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="flex items-center gap-3 text-gray-600">
                            <Clock size={14} />
                            <p className="text-sm italic">No specific jobsite items</p>
                          </div>
                        )}
                      </div>

                      {a.assignment_name && (
                        <div className="mt-4 pt-4 border-t border-white/5">
                          <p className="text-[10px] text-gray-600 uppercase font-bold mb-1">Legacy Reference</p>
                          <p className="text-xs text-gray-400 truncate">{a.assignment_name}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
