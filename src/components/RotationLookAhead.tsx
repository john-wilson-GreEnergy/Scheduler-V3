import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, startOfWeek, addWeeks, subWeeks, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { Employee, AssignmentWeek } from '../types';
import { ChevronLeft, ChevronRight, RefreshCw, X, Save, Trash2, ArrowRight } from 'lucide-react';

interface RotationLookAheadProps {
  employees: Employee[];
}

// Modal component for rotation actions
function RotationActionModal({ 
  isOpen, 
  onClose, 
  employee, 
  weekStart, 
  assignment, 
  onAdd, 
  onMove, 
  onDelete,
  allWeeks 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  employee: Employee; 
  weekStart: string; 
  assignment?: AssignmentWeek; 
  onAdd: () => void; 
  onMove: (newWeek: string) => void; 
  onDelete: () => void;
  allWeeks: Date[];
}) {
  const [targetWeek, setTargetWeek] = useState<string>('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-8 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white">Manage Rotation</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20}/></button>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          Employee: {employee.first_name} {employee.last_name}<br/>
          Week: {weekStart}
        </p>

        <div className="space-y-4">
          {!assignment ? (
            <button onClick={onAdd} className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl">Add Rotation</button>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Move to Week</label>
                <select value={targetWeek} onChange={(e) => setTargetWeek(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white">
                  <option value="">Select a week...</option>
                  {allWeeks.map(w => {
                    const wStr = format(w, 'yyyy-MM-dd');
                    return <option key={wStr} value={wStr}>{format(w, 'MMM dd, yyyy')}</option>;
                  })}
                </select>
                <button onClick={() => onMove(targetWeek)} disabled={!targetWeek} className="w-full py-3 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl disabled:opacity-50">Move Rotation</button>
              </div>
              <button onClick={onDelete} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-xl flex items-center justify-center gap-2"><Trash2 size={16}/> Delete Rotation</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RotationLookAhead({ employees }: RotationLookAheadProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [assignments, setAssignments] = useState<AssignmentWeek[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalState, setModalState] = useState<{isOpen: boolean, employeeId: string, weekStart: string}>({isOpen: false, employeeId: '', weekStart: ''});

  const fetchAssignments = useCallback(async (offset: number) => {
    setLoading(true);
    const start = startOfWeek(addWeeks(new Date(), offset), { weekStartsOn: 1 });
    const end = addWeeks(start, 8); // 9 weeks total

    const { data, error } = await supabase
      .from('assignment_weeks')
      .select('*')
      .gte('week_start', format(start, 'yyyy-MM-dd'))
      .lte('week_start', format(end, 'yyyy-MM-dd'))
      .order('week_start');

    if (error) {
      console.error('Error fetching assignments:', error);
    } else {
      setAssignments(data || []);
    }
    setLoading(false);
  }, []);

  const handleAddRotation = async (employeeId: string, weekStart: string) => {
    const emp = employees.find(e => e.employee_id_ref === employeeId);
    if (!emp) return;
    const { error } = await supabase.from('assignment_weeks').insert({
      employee_id: emp.employee_id_ref,
      email: emp.email,
      week_start: weekStart,
      assignment_name: 'Internal',
      value_type: 'rotation',
      first_name: emp.first_name,
      last_name: emp.last_name
    });
    if (error) console.error(error);
    else fetchAssignments(weekOffset);
    setModalState({isOpen: false, employeeId: '', weekStart: ''});
  };

  const handleMoveRotation = async (assignmentId: string, newWeek: string) => {
    const { error } = await supabase.from('assignment_weeks').update({ week_start: newWeek }).eq('id', assignmentId);
    if (error) console.error(error);
    else fetchAssignments(weekOffset);
    setModalState({isOpen: false, employeeId: '', weekStart: ''});
  };

  const handleDeleteRotation = async (assignmentId: string) => {
    const { error } = await supabase.from('assignment_weeks').delete().eq('id', assignmentId);
    if (error) console.error(error);
    else fetchAssignments(weekOffset);
    setModalState({isOpen: false, employeeId: '', weekStart: ''});
  };

  useEffect(() => {
    fetchAssignments(weekOffset);
  }, [weekOffset, fetchAssignments]);

  // No debug logs here

  const weeks = useMemo(() => {
    const w = [];
    let current = startOfWeek(addWeeks(new Date(), weekOffset), { weekStartsOn: 1 });
    for (let i = 0; i < 9; i++) {
      w.push(current);
      current = addWeeks(current, 1);
    }
    return w;
  }, [weekOffset]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterGroup, setFilterGroup] = useState<string>('All');

  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchesSearch = `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGroup = filterGroup === 'All' || emp.rotation_group === filterGroup;
      return matchesSearch && matchesGroup;
    });
  }, [employees, searchTerm, filterGroup]);

  // ... inside return ...
  return (
    <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-white">Rotation Look-Ahead</h2>
        <div className="flex gap-4">
          <input 
            type="text" 
            placeholder="Search employees..." 
            value={searchTerm} 
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-black/20 border border-emerald-900/30 rounded-lg px-4 py-2 text-white text-sm focus:border-emerald-500 outline-none"
          />
          <select 
            value={filterGroup} 
            onChange={(e) => setFilterGroup(e.target.value)}
            className="bg-black/20 border border-emerald-900/30 rounded-lg px-4 py-2 text-white text-sm focus:border-emerald-500 outline-none"
          >
            <option value="All">All Groups</option>
            <option value="A">Group A</option>
            <option value="B">Group B</option>
            <option value="C">Group C</option>
            <option value="D">Group D</option>
          </select>
          <div className="flex gap-2">
            <button onClick={() => setWeekOffset(o => o - 9)} className="p-2 bg-black/20 border border-emerald-900/30 rounded-lg text-white hover:border-emerald-500/30"><ChevronLeft size={20}/></button>
            <button onClick={() => setWeekOffset(o => o + 9)} className="p-2 bg-black/20 border border-emerald-900/30 rounded-lg text-white hover:border-emerald-500/30"><ChevronRight size={20}/></button>
          </div>
        </div>
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="text-emerald-500 animate-spin" size={32} />
        </div>
      ) : (
        <div className="overflow-x-auto overflow-y-auto max-h-[600px] scrollbar-hide">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead className="sticky top-0 bg-[#0A120F] z-20">
              <tr>
                <th className="p-3 text-emerald-500 font-bold text-xs uppercase sticky left-0 bg-[#0A120F] z-30">Employee</th>
                {weeks.map(week => (
                  <th key={week.toString()} className="p-3 text-emerald-500 font-bold text-xs uppercase text-center min-w-[100px]">
                    {format(week, 'MMM dd, yyyy')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/10">
              {filteredEmployees.map(emp => (
                <tr key={emp.id} className="hover:bg-white/5">
                  <td className="p-3 text-white font-bold text-sm sticky left-0 bg-[#0A120F] z-10">{emp.first_name} {emp.last_name}</td>
                  {weeks.map(week => {
                    const weekStr = format(week, 'yyyy-MM-dd');
                    const weekAssignments = assignments.filter(
                      a => String(a.employee_id) === String(emp.employee_id_ref) && a.week_start === weekStr
                    );
                    
                    const symbols = weekAssignments.map(a => {
                      if (a.assignment_name === 'Rotation') return 'R';
                      if (a.value_type === 'jobsite') return '⚡';
                      return '?';
                    });
                    
                    const symbol = symbols.length > 0 ? symbols.join(' ') : '-';
                    
                    return (
                      <td key={week.toString()} className="p-3 text-center text-xs text-gray-400 min-w-[100px]">
                        <button 
                          onClick={() => setModalState({isOpen: true, employeeId: emp.employee_id_ref, weekStart: weekStr})}
                          className="hover:bg-emerald-500/20 px-2 py-1 rounded-lg transition-all"
                        >
                          {symbol}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <RotationActionModal 
        isOpen={modalState.isOpen}
        onClose={() => setModalState({isOpen: false, employeeId: '', weekStart: ''})}
        employee={employees.find(e => e.employee_id_ref === modalState.employeeId)!}
        weekStart={modalState.weekStart}
        assignment={assignments.find(a => String(a.employee_id) === String(modalState.employeeId) && a.week_start === modalState.weekStart)}
        onAdd={() => handleAddRotation(modalState.employeeId, modalState.weekStart)}
        onMove={(newWeek) => {
          const assignment = assignments.find(a => String(a.employee_id) === String(modalState.employeeId) && a.week_start === modalState.weekStart);
          if (assignment) handleMoveRotation(assignment.id, newWeek);
        }}
        onDelete={() => {
          const assignment = assignments.find(a => String(a.employee_id) === String(modalState.employeeId) && a.week_start === modalState.weekStart);
          if (assignment) handleDeleteRotation(assignment.id);
        }}
        allWeeks={weeks}
      />
    </div>
  );
}
