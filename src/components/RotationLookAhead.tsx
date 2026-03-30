import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format, startOfWeek, addWeeks, subWeeks, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { Employee, AssignmentWeek, Jobsite } from '../types';
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
  assignments,
  onAdd, 
  onMove, 
  onDelete,
  onConvert,
  onSwap,
  allWeeks,
  assignmentType,
  isX
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  employee?: Employee; 
  weekStart: string; 
  assignment?: AssignmentWeek; 
  assignments: AssignmentWeek[];
  onAdd: () => void; 
  onMove: (newWeek: string) => void; 
  onDelete: () => void;
  onConvert?: () => void;
  onSwap: (targetWeek: string) => void;
  allWeeks: Date[];
  assignmentType?: 'rotation' | 'jobsite';
  isX?: boolean;
}) {
  const [targetWeek, setTargetWeek] = useState<string>('');
  const [swapTargetAssignment, setSwapTargetAssignment] = useState<AssignmentWeek | null>(null);

  // Filter weeks: exclude those already assigned as rotation, vacation, or personal
  const availableWeeks = allWeeks.filter(w => {
    const wStr = format(w, 'yyyy-MM-dd');
    const isAssigned = assignments.some(a =>
      String(a.employee_fk) === String(employee?.id) &&
      a.week_start === wStr &&
      ['rotation', 'vacation', 'personal'].includes(a.status?.toLowerCase() || '')
    );
    return !isAssigned;
  });

  useEffect(() => {
    if (targetWeek && employee) {
      const target = assignments.find(a => String(a.employee_fk) === String(employee.id) && a.week_start === targetWeek);
      setSwapTargetAssignment(target || null);
    } else {
      setSwapTargetAssignment(null);
    }
  }, [targetWeek, assignments, employee]);

  if (!isOpen || !employee) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-8 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white">
            {assignmentType === 'jobsite' ? 'Convert Jobsite' : 'Manage Rotation'}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20}/></button>
        </div>
        <p className="text-sm text-gray-400 mb-6">
          Employee: {employee.first_name} {employee.last_name}<br/>
          Week: {weekStart}
        </p>

        <div className="space-y-4">
          {assignmentType === 'jobsite' && onConvert && (
            <button onClick={onConvert} className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl">Convert to Rotation</button>
          )}

          {assignmentType === 'rotation' && (
            !assignment || isX ? (
              <div className="space-y-4">
                <button onClick={onAdd} className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl">Add Rotation</button>
                {assignment && (
                  <button onClick={onDelete} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-xl flex items-center justify-center gap-2"><Trash2 size={16}/> Delete Assignment</button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Swap to Week</label>
                  <select value={targetWeek} onChange={(e) => setTargetWeek(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white">
                    <option value="">Select an available week...</option>
                    {availableWeeks.map(w => {
                      const wStr = format(w, 'yyyy-MM-dd');
                      return <option key={wStr} value={wStr}>{format(w, 'MMM dd, yyyy')}</option>;
                    })}
                  </select>
                </div>
                
                <button onClick={() => onSwap(targetWeek)} disabled={!targetWeek} className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-xl disabled:opacity-50">Swap Rotation</button>
                <button onClick={onDelete} className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold rounded-xl flex items-center justify-center gap-2"><Trash2 size={16}/> Delete Rotation</button>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default function RotationLookAhead({ employees }: RotationLookAheadProps) {
  const fieldEmployees = useMemo(() => employees.filter(e => e.role !== 'hr'), [employees]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [assignments, setAssignments] = useState<AssignmentWeek[]>([]);
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalState, setModalState] = useState<{
    isOpen: boolean,
    employeeId: string,
    weekStart: string,
    assignmentType?: 'rotation' | 'jobsite',
    isX?: boolean
  }>({isOpen: false, employeeId: '', weekStart: '', isX: false});

  useEffect(() => {
    const fetchJobsites = async () => {
      const { data } = await supabase.from('jobsites').select('*');
      if (data) setJobsites(data);
    };
    fetchJobsites();
  }, []);

  const fetchAssignments = useCallback(async (offset: number) => {
    setLoading(true);
    const start = startOfWeek(addWeeks(new Date(), offset), { weekStartsOn: 1 });
    const end = addWeeks(start, 8); // 9 weeks total

    const { data, error } = await supabase
      .from('assignment_weeks')
      .select('*, assignment_items(*)')
      .gte('week_start', format(start, 'yyyy-MM-dd'))
      .lte('week_start', format(end, 'yyyy-MM-dd'))
      .order('week_start');

    if (error) {
      console.error('Error fetching assignments:', error);
    } else {
      console.log('DEBUG: fetched assignments', data);
      setAssignments(data || []);
      if (data && data.length > 0) {
        console.log('DEBUG: Assignment sample', {
          sample: data[0],
          keys: Object.keys(data[0]),
          employee_fk: data[0].employee_fk,
          week_start: data[0].week_start,
          items: data[0].assignment_items,
          firstItem: data[0].assignment_items && data[0].assignment_items[0]
        });
      } else {
        console.log('DEBUG: No assignments found for range');
      }
    }
    setLoading(false);
  }, []);

  const handleAddRotation = async (employeeId: string, weekStart: string) => {
    const emp = fieldEmployees.find(e => e.id === employeeId);
    if (!emp) return;

    const existing = assignments.filter(a => String(a.employee_fk) === String(employeeId) && a.week_start === weekStart);
    
    if (existing.length > 0) {
        await cleanupAssignmentsForWeek(employeeId, weekStart);
        fetchAssignments(weekOffset);
        setModalState({isOpen: false, employeeId: '', weekStart: '', assignmentType: undefined});
        return;
    }

    const rotationJobsite = jobsites.find(j => j.jobsite_name === 'Rotation');
    if (!rotationJobsite) {
        console.error('Rotation jobsite not found');
        return;
    }

    const { data: weekData, error: weekError } = await supabase.from('assignment_weeks').insert({
      employee_fk: emp.id,
      week_start: weekStart,
      assignment_type: null,
      status: 'rotation',
      value_type: 'rotation'
    }).select().single();

    if (weekError) {
        console.error(weekError);
        return;
    }

    const { error: itemError } = await supabase.from('assignment_items').insert({
        assignment_week_fk: weekData.id,
        jobsite_fk: rotationJobsite.id,
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        item_order: 1
    });

    if (itemError) console.error(itemError);
    else fetchAssignments(weekOffset);
    setModalState({isOpen: false, employeeId: '', weekStart: '', assignmentType: undefined});
  };

  const handleMoveRotation = async (assignmentId: string, newWeek: string) => {
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    
    const { error } = await supabase.from('assignment_weeks').update({ week_start: newWeek }).eq('id', assignmentId);
    if (error) {
        console.error(error);
        return;
    }
    
    await cleanupAssignmentsForWeek(String(assignment.employee_fk), newWeek);
    fetchAssignments(weekOffset);
    setModalState({isOpen: false, employeeId: '', weekStart: '', assignmentType: undefined});
  };

  const handleConvertRotation = async (assignmentId: string) => {
    const assignment = assignments.find(a => a.id === assignmentId);
    if (!assignment) return;

    const { error } = await supabase.from('assignment_weeks').update({ 
      assignment_type: null,
      status: 'rotation',
      value_type: 'rotation'
    }).eq('id', assignmentId);
    
    if (error) {
        console.error(error);
        return;
    }
    
    await cleanupAssignmentsForWeek(String(assignment.employee_fk), assignment.week_start);
    fetchAssignments(weekOffset);
    setModalState({isOpen: false, employeeId: '', weekStart: '', assignmentType: undefined});
  };

  const handleSwapRotation = async (assignmentId: string, targetWeek: string) => {
    const sourceAssignment = assignments.find(a => a.id === assignmentId);
    const targetAssignment = assignments.find(a => String(a.employee_fk) === String(sourceAssignment?.employee_fk) && a.week_start === targetWeek);

    if (!sourceAssignment) return;

    // Swap week_start
    if (targetAssignment) {
        // Swap
        await supabase.from('assignment_weeks').update({ week_start: targetWeek }).eq('id', sourceAssignment.id);
        await supabase.from('assignment_weeks').update({ week_start: sourceAssignment.week_start }).eq('id', targetAssignment.id);
    } else {
        // Move
        await supabase.from('assignment_weeks').update({ week_start: targetWeek }).eq('id', sourceAssignment.id);
    }
    
    // Cleanup both weeks
    await cleanupAssignmentsForWeek(String(sourceAssignment.employee_fk), targetWeek);
    await cleanupAssignmentsForWeek(String(sourceAssignment.employee_fk), sourceAssignment.week_start);

    fetchAssignments(weekOffset);
    setModalState({isOpen: false, employeeId: '', weekStart: '', assignmentType: undefined});
  };

  const handleDeleteRotation = async (assignmentId: string) => {
    const { error } = await supabase.from('assignment_weeks').delete().eq('id', assignmentId);
    if (error) console.error(error);
    else fetchAssignments(weekOffset);
    setModalState({isOpen: false, employeeId: '', weekStart: '', assignmentType: undefined});
  };

  const cleanupAssignmentsForWeek = async (employeeId: string, weekStart: string) => {
    const empAssignments = assignments.filter(a => String(a.employee_fk) === String(employeeId) && a.week_start === weekStart);
    if (empAssignments.length === 0) return null;

    const [first, ...rest] = empAssignments;

    // Delete the rest
    for (const assignment of rest) {
        await supabase.from('assignment_weeks').delete().eq('id', assignment.id);
    }

    // Update the first one to be a rotation
    const { data, error } = await supabase.from('assignment_weeks').update({
        status: 'rotation',
        value_type: 'rotation',
        assignment_type: null
    }).eq('id', first.id).select().single();

    if (error) {
        console.error(error);
        return null;
    }
    return data;
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
    return fieldEmployees.filter(emp => {
      const matchesSearch = `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGroup = filterGroup === 'All' || emp.rotation_group === filterGroup;
      return matchesSearch && matchesGroup;
    });
  }, [fieldEmployees, searchTerm, filterGroup]);

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
                      a => String(a.employee_fk) === String(emp.id) && a.week_start === weekStr
                    );
                    
                    const symbols = weekAssignments.map(a => {
                      // Check assignment_items for assignment_type
                      const item = a.assignment_items && a.assignment_items[0];
                      const type = item?.assignment_type?.toLowerCase();
                      const status = a.status?.toLowerCase();
                      const weekAssignmentType = a.assignment_type?.toLowerCase();

                      // Check for rotation
                      if (status === 'rotation' || type === 'rotation' || weekAssignmentType === 'rotation') return 'R';
                      // Check for vacation
                      if (status === 'vacation' || type === 'vacation' || weekAssignmentType === 'vacation') return 'V';
                      // Check for personal
                      if (status === 'personal' || type === 'personal' || weekAssignmentType === 'personal') return 'P';
                      
                      // If it's a jobsite (and not one of the above), return lightning
                      if (item?.jobsite_fk) return '⚡';
                      
                      return 'X';
                    });
                    
                    const symbol = symbols.length > 0 ? symbols.join(' ') : '-';
                    
                    return (
                      <td key={week.toString()} className="p-3 text-center text-xs text-gray-400 min-w-[100px]">
                        <button 
                          onClick={() => {
                            if (symbol === 'R') {
                              setModalState({isOpen: true, employeeId: emp.id, weekStart: weekStr, assignmentType: 'rotation'});
                            } else if (symbol === '⚡') {
                              setModalState({isOpen: true, employeeId: emp.id, weekStart: weekStr, assignmentType: 'jobsite'});
                            } else if (symbol === '-' || symbol === 'X') {
                              setModalState({isOpen: true, employeeId: emp.id, weekStart: weekStr, assignmentType: 'rotation', isX: symbol === 'X'});
                            }
                          }}
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
        onClose={() => setModalState({isOpen: false, employeeId: '', weekStart: '', assignmentType: undefined})}
        employee={fieldEmployees.find(e => e.id === modalState.employeeId)}
        weekStart={modalState.weekStart}
        assignment={assignments.find(a => String(a.employee_fk) === String(modalState.employeeId) && a.week_start === modalState.weekStart)}
        assignments={assignments}
        onAdd={() => handleAddRotation(modalState.employeeId, modalState.weekStart)}
        onMove={(newWeek) => {
          const assignment = assignments.find(a => String(a.employee_fk) === String(modalState.employeeId) && a.week_start === modalState.weekStart);
          if (assignment) handleMoveRotation(assignment.id, newWeek);
        }}
        onConvert={() => {
          const assignment = assignments.find(a => String(a.employee_fk) === String(modalState.employeeId) && a.week_start === modalState.weekStart);
          if (assignment) handleConvertRotation(assignment.id);
        }}
        onSwap={(targetWeek) => {
          const assignment = assignments.find(a => String(a.employee_fk) === String(modalState.employeeId) && a.week_start === modalState.weekStart);
          if (assignment) handleSwapRotation(assignment.id, targetWeek);
        }}
        onDelete={() => {
          const assignment = assignments.find(a => String(a.employee_fk) === String(modalState.employeeId) && a.week_start === modalState.weekStart);
          if (assignment) handleDeleteRotation(assignment.id);
        }}
        allWeeks={weeks}
        assignmentType={modalState.assignmentType}
        isX={modalState.isX}
      />
    </div>
  );
}
