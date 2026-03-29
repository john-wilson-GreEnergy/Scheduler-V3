import React, { useState, useEffect, useMemo } from 'react';
import { Employee, RotationConfig, Role } from '../types';
import { 
  Users, 
  Search, 
  Filter, 
  MoreVertical, 
  Mail, 
  Shield, 
  RefreshCw,
  ChevronRight,
  UserPlus,
  Download,
  AlertCircle,
  CheckCircle2,
  Clock,
  ToggleLeft,
  ToggleRight,
  Settings2,
  CalendarDays,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { supabase } from '../lib/supabase';
import { logActivity } from '../lib/logger';
import { format, parseISO, startOfWeek } from 'date-fns';
import { syncEmployeeAssignmentsBackend } from '../lib/supabase_functions';
import { sendNotification } from '../utils/notifications';

interface EmployeeManagementProps {
  employees: Employee[];
  onUpdate: (silent?: boolean) => void;
}

type SortField = 'name' | 'job_title' | 'role' | 'rotation' | 'status';
type SortDirection = 'asc' | 'desc';

export default function EmployeeManagement({ employees: initialEmployees, onUpdate }: EmployeeManagementProps) {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'admin' | 'site_manager' | 'site_lead' | 'bess_tech' | 'hr'>('all');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [isBatchEditModalOpen, setIsBatchEditModalOpen] = useState(false);
  const [batchRole, setBatchRole] = useState<Role>('bess_tech');
  const [editingRotation, setEditingRotation] = useState<Employee | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [rotationForm, setRotationForm] = useState({
    weeks_on: 3,
    weeks_off: 1,
    anchor_date: format(new Date(), 'yyyy-MM-dd')
  });

  const selectedEmployees = useMemo(() => {
    return employees.filter(e => selectedEmployeeIds.includes(e.id));
  }, [employees, selectedEmployeeIds]);

  const availableRoles = useMemo(() => {
    const roles = ['bess_tech', 'site_lead', 'site_manager', 'admin', 'hr'] as Role[];
    const uniqueSelectedRoles = new Set(selectedEmployees.map(e => e.role));
    console.log('Selected employees:', selectedEmployees);
    console.log('Unique selected roles:', uniqueSelectedRoles);
    if (uniqueSelectedRoles.size === 1) {
      const currentRole = Array.from(uniqueSelectedRoles)[0];
      const filteredRoles = roles.filter(r => r !== currentRole);
      console.log('Available roles (filtered):', filteredRoles);
      return filteredRoles;
    }
    console.log('Available roles (all):', roles);
    return roles;
  }, [selectedEmployees]);

  useEffect(() => {
    if (availableRoles.length > 0) {
      setBatchRole(availableRoles[0]);
    }
  }, [availableRoles]);

  const [employeeForm, setEmployeeForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    job_title: '',
    role: 'bess_tech' as Role,
    rotation_group: '' as any,
    employee_id_ref: ''
  });

  useEffect(() => {
    setEmployees(initialEmployees);
  }, [initialEmployees]);

  const handleOpenRotation = (emp: Employee) => {
    setEditingRotation(emp);
    if (emp.rotation_config) {
      setRotationForm({
        weeks_on: emp.rotation_config.weeks_on,
        weeks_off: emp.rotation_config.weeks_off,
        anchor_date: emp.rotation_config.anchor_date
      });
    } else {
      setRotationForm({
        weeks_on: 3,
        weeks_off: 1,
        anchor_date: format(new Date(), 'yyyy-MM-dd')
      });
    }
  };

  const handleSaveRotation = async () => {
    if (!editingRotation) return;

    try {
      const { error } = await supabase
        .from('rotation_configs')
        .upsert({
          employee_fk: editingRotation.id,
          weeks_on: rotationForm.weeks_on,
          weeks_off: rotationForm.weeks_off,
          anchor_date: rotationForm.anchor_date,
          is_active: true
        }, { onConflict: 'employee_fk' });

      if (error) throw error;

      // Send notification to employee
      await sendNotification({
        employeeId: editingRotation.id,
        title: 'Rotation Pattern Updated',
        message: `Your work rotation pattern has been updated by an administrator.`,
        type: 'info',
        sendEmail: false
      });

      // Clear the group from employees table to ensure custom config takes precedence
      await supabase
        .from('employees')
        .update({ rotation_group: null })
        .eq('id', editingRotation.id);

      // Use backend to sync assignments based on new rotation config
      await syncEmployeeAssignmentsBackend(editingRotation.id);

      logActivity('rotation_update', {
        employee_fk: editingRotation.id,
        name: `${editingRotation.first_name} ${editingRotation.last_name}`,
        config: rotationForm
      });

      setEditingRotation(null);
      onUpdate(true);
    } catch (err) {
      console.error('Error saving rotation config:', err);
    }
  };

  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setEmployeeForm({
      first_name: emp.first_name,
      last_name: emp.last_name,
      email: emp.email,
      job_title: emp.job_title || '',
      role: emp.role as any,
      rotation_group: emp.rotation_group || '',
      employee_id_ref: emp.employee_id_ref || ''
    });
  };

  const handleSaveEmployee = async () => {
    try {
      let employeeIdRef = employeeForm.employee_id_ref;
      if (!employeeIdRef) {
        const existingIds = employees.map(e => parseInt(e.employee_id_ref)).filter(id => !isNaN(id));
        const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
        employeeIdRef = (maxId + 1).toString();
      }

      const payload = {
        ...employeeForm,
        employee_id_ref: employeeIdRef,
        rotation_group: employeeForm.rotation_group || null
      };
      console.log('Saving employee payload:', payload);

      if (editingEmployee) {
        const { error } = await supabase
          .from('employees')
          .update({ ...payload, is_active: true })
          .eq('id', editingEmployee.id);
        console.log('Update error:', error);
        if (error) throw error;
        
        // Reactivate: sync assignments from backend
        if (!editingEmployee.is_active) {
            await syncEmployeeAssignmentsBackend(editingEmployee.id, rotationForm.anchor_date);
        }
        
        logActivity('employee_update', { employee_fk: editingEmployee.id, ...payload });
      } else {
        const { data, error } = await supabase
          .from('employees')
          .insert([{ ...payload, is_active: true }])
          .select();
        if (error) throw error;
        const newEmployee = data[0];
        
        // Use backend to generate initial assignments
        await syncEmployeeAssignmentsBackend(newEmployee.id);
        
        logActivity('employee_create', { employee_fk: newEmployee.id, ...payload });
      }

      setEditingEmployee(null);
      setIsAddingEmployee(false);
      onUpdate(true);
    } catch (err) {
      console.error('Error saving employee:', err);
    }
  };

  const handleRemoveEmployee = async () => {
    if (!editingEmployee) return;
    if (!confirm('Are you sure you want to remove this employee? This will set them to inactive and remove all future assignments.')) return;

    try {
      const currentWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      
      // 1. Set employee to inactive
      await supabase.from('employees').update({ is_active: false }).eq('id', editingEmployee.id);
      
      // 2. Delete future assignments
      await supabase.from('assignment_weeks').delete().eq('employee_fk', editingEmployee.id).gte('week_start', currentWeek);
      
      logActivity('employee_remove', { employee_fk: editingEmployee.id, name: `${editingEmployee.first_name} ${editingEmployee.last_name}` });
      
      setEditingEmployee(null);
      onUpdate(true);
    } catch (err) {
      console.error('Error removing employee:', err);
    }
  };

  const handleNuclearDelete = async () => {
    if (!editingEmployee) return;
    if (!confirm('NUCLEAR OPTION: Are you sure you want to PERMANENTLY delete this employee and ALL their data? This cannot be undone.')) return;

    try {
      // 1. Delete all assignments
      await supabase.from('assignment_weeks').delete().eq('employee_fk', editingEmployee.id);
      
      // 2. Delete employee
      await supabase.from('employees').delete().eq('id', editingEmployee.id);
      
      logActivity('employee_nuclear_delete', { employee_fk: editingEmployee.id, name: `${editingEmployee.first_name} ${editingEmployee.last_name}` });
      
      setEditingEmployee(null);
      onUpdate(true);
    } catch (err) {
      console.error('Error nuclear deleting employee:', err);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedAndFilteredEmployees = useMemo(() => {
    let result = employees.filter(emp => {
      const matchesSearch = 
        `${emp.first_name} ${emp.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.job_title?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = filterRole === 'all' || 
        emp.role === filterRole;
      return matchesSearch && matchesRole;
    });

    result.sort((a, b) => {
      let valA: any = '';
      let valB: any = '';

      switch (sortField) {
        case 'name':
          valA = `${a.first_name} ${a.last_name}`.toLowerCase();
          valB = `${b.first_name} ${b.last_name}`.toLowerCase();
          break;
        case 'job_title':
          valA = (a.job_title || '').toLowerCase();
          valB = (b.job_title || '').toLowerCase();
          break;
        case 'role':
          valA = a.role.toLowerCase();
          valB = b.role.toLowerCase();
          break;
        case 'rotation':
          valA = a.rotation_group || (a.rotation_config ? `${a.rotation_config.weeks_on}:${a.rotation_config.weeks_off}` : '');
          valB = b.rotation_group || (b.rotation_config ? `${b.rotation_config.weeks_on}:${b.rotation_config.weeks_off}` : '');
          break;
        case 'status':
          valA = a.is_active ? 1 : 0;
          valB = b.is_active ? 1 : 0;
          break;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [employees, searchTerm, filterRole, sortField, sortDirection]);

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    // Optimistic update
    setEmployees(prev => prev.map(e => e.id === id ? { ...e, is_active: newStatus } : e));

    try {
      const { error } = await supabase
        .from('employees')
        .update({ is_active: newStatus })
        .eq('id', id);

      if (error) throw error;
      
      onUpdate(true); // Silent refresh
      
      const emp = employees.find(e => e.id === id);
      logActivity('employee_toggle', { 
        employee_fk: id, 
        name: `${emp?.first_name} ${emp?.last_name}`,
        new_status: newStatus 
      });
    } catch (err) {
      // Rollback
      setEmployees(prev => prev.map(e => e.id === id ? { ...e, is_active: currentStatus } : e));
      console.error('Error toggling employee status:', err);
    }
  };

  const SortIndicator = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="opacity-20 group-hover:opacity-50 transition-opacity" />;
    return sortDirection === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />;
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text"
              placeholder="Search by name, email, or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0A120F] border border-emerald-900/20 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-1 bg-[#0A120F] border border-emerald-900/20 p-1 rounded-xl w-full sm:w-auto overflow-x-auto no-scrollbar">
            {(['all', 'admin', 'site_manager', 'site_lead', 'hr', 'client'] as const).map((role) => (
              <button
                key={role}
                onClick={() => setFilterRole(role)}
                className={`px-3 sm:px-4 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold capitalize transition-all whitespace-nowrap ${
                  filterRole === role 
                ? 'bg-emerald-500 text-black' 
                : 'text-gray-500 hover:text-white'
                }`}
              >
                {role === 'client' ? 'BESS Tech' : role.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full lg:w-auto">
          <button className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white transition-all">
            <Download size={16} />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={() => setIsBatchEditModalOpen(true)}
            disabled={selectedEmployeeIds.length === 0}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Batch Edit ({selectedEmployeeIds.length})</span>
          </button>
          <button 
            onClick={() => {
              setIsAddingEmployee(true);
              setEmployeeForm({
                first_name: '',
                last_name: '',
                email: '',
                job_title: '',
                role: 'client',
                rotation_group: '',
                employee_id_ref: ''
              });
            }}
            className="flex-1 lg:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-sm font-bold text-black transition-all shadow-lg shadow-emerald-500/20"
          >
            <UserPlus size={16} />
            <span>Add Employee</span>
          </button>
        </div>
      </div>

      {/* Employee Table (Desktop) / Cards (Mobile) */}
      <div className="bg-[#0A120F] border border-emerald-900/20 rounded-3xl overflow-hidden">
        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto overflow-y-auto max-h-[600px]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className="border-b border-white/5 bg-[#0A120F]">
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  <input 
                    type="checkbox"
                    checked={selectedEmployeeIds.length === sortedAndFilteredEmployees.length && sortedAndFilteredEmployees.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedEmployeeIds(sortedAndFilteredEmployees.map(emp => emp.id));
                      } else {
                        setSelectedEmployeeIds([]);
                      }
                    }}
                    className="rounded border-emerald-900/20 bg-black/40 text-emerald-500 focus:ring-emerald-500/20"
                  />
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest cursor-pointer group hover:text-emerald-500 transition-colors"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-2">
                    Employee
                    <SortIndicator field="name" />
                  </div>
                </th>
                <th 
                  className="hidden md:table-cell px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest cursor-pointer group hover:text-emerald-500 transition-colors"
                  onClick={() => handleSort('job_title')}
                >
                  <div className="flex items-center gap-2">
                    Job Title
                    <SortIndicator field="job_title" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest cursor-pointer group hover:text-emerald-500 transition-colors"
                  onClick={() => handleSort('role')}
                >
                  <div className="flex items-center gap-2">
                    Role
                    <SortIndicator field="role" />
                  </div>
                </th>
                <th 
                  className="hidden lg:table-cell px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest cursor-pointer group hover:text-emerald-500 transition-colors"
                  onClick={() => handleSort('rotation')}
                >
                  <div className="flex items-center gap-2">
                    Rotation
                    <SortIndicator field="rotation" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest cursor-pointer group hover:text-emerald-500 transition-colors"
                  onClick={() => handleSort('status')}
                >
                  <div className="flex items-center gap-2">
                    Status
                    <SortIndicator field="status" />
                  </div>
                </th>
                <th className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence mode="popLayout">
                {sortedAndFilteredEmployees.map((emp) => (
                  <motion.tr 
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    key={emp.id} 
                    className="hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <input 
                        type="checkbox"
                        checked={selectedEmployeeIds.includes(emp.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedEmployeeIds(prev => [...prev, emp.id]);
                          } else {
                            setSelectedEmployeeIds(prev => prev.filter(id => id !== emp.id));
                          }
                        }}
                        className="rounded border-emerald-900/20 bg-black/40 text-emerald-500 focus:ring-emerald-500/20"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center text-emerald-500 font-bold text-sm border border-emerald-500/20 group-hover:scale-110 transition-transform shrink-0">
                          {emp.first_name[0]}{emp.last_name[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white truncate">{emp.first_name} {emp.last_name}</div>
                          <div className="text-[10px] text-gray-500 flex items-center gap-1 truncate">
                            <Mail size={10} className="shrink-0" />
                            <span className="truncate">{emp.email}</span>
                          </div>
                          <div className="md:hidden text-[10px] text-emerald-500/70 mt-0.5 truncate">{emp.job_title}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell px-6 py-4">
                      <div className="text-xs text-gray-300">{emp.job_title}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                        emp.role === 'admin' 
                          ? 'text-purple-400 bg-purple-400/10 border-purple-400/20' 
                          : emp.role === 'hr'
                          ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                          : 'text-blue-400 bg-blue-400/10 border-blue-400/20'
                      }`}>
                        <Shield size={10} />
                        <span className="uppercase tracking-wider">{emp.role}</span>
                      </div>
                    </td>
                    <td className="hidden lg:table-cell px-6 py-4">
                      {emp.rotation_group ? (
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            emp.rotation_group === 'A' ? 'bg-black border border-white/20' :
                            emp.rotation_group === 'B' ? 'bg-red-500' :
                            emp.rotation_group === 'C' ? 'bg-yellow-500' :
                            'bg-blue-500'
                          }`} />
                          <span className="text-xs font-bold text-white">Group {emp.rotation_group}</span>
                        </div>
                      ) : emp.rotation_config ? (
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-white font-mono">{emp.rotation_config.weeks_on}:{emp.rotation_config.weeks_off}</div>
                          <div className="flex gap-0.5">
                            {Array.from({ length: emp.rotation_config.weeks_on }).map((_, i) => (
                              <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            ))}
                            {Array.from({ length: emp.rotation_config.weeks_off }).map((_, i) => (
                              <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-700" />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-600 italic">Not Configured</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        emp.is_active 
                          ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' 
                          : 'text-gray-500 bg-gray-500/10 border-gray-500/20'
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${emp.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'}`} />
                        <span className="uppercase tracking-wider">{emp.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button 
                          onClick={() => handleOpenEdit(emp)}
                          className="p-2 hover:bg-white/5 text-gray-400 hover:text-white rounded-lg transition-colors"
                        >
                          <Settings2 size={14} />
                        </button>
                        <button 
                          onClick={() => handleOpenRotation(emp)}
                          className="p-2 hover:bg-white/5 text-gray-400 hover:text-white rounded-lg transition-colors"
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="sm:hidden divide-y divide-white/5">
          <AnimatePresence mode="popLayout">
            {sortedAndFilteredEmployees.map((emp) => (
              <motion.div
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                key={emp.id}
                className="p-4 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center text-emerald-500 font-bold text-sm border border-emerald-500/20 shrink-0">
                      {emp.first_name[0]}{emp.last_name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">{emp.first_name} {emp.last_name}</div>
                      <div className="text-[10px] text-gray-500 truncate">{emp.job_title}</div>
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    emp.is_active 
                      ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' 
                      : 'text-gray-500 bg-gray-500/10 border-gray-500/20'
                  }`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${emp.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-500'}`} />
                    <span className="uppercase tracking-wider">{emp.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-[10px]">
                  <div className="space-y-1">
                    <span className="text-gray-500 uppercase font-bold tracking-widest">Role</span>
                    <div className={`flex items-center gap-1.5 text-blue-400`}>
                      <Shield size={10} />
                      <span className="uppercase font-bold">{emp.role.replace('_', ' ')}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <span className="text-gray-500 uppercase font-bold tracking-widest">Rotation</span>
                    <div className="text-white font-bold">
                      {emp.rotation_group ? `Group ${emp.rotation_group}` : emp.rotation_config ? `${emp.rotation_config.weeks_on}:${emp.rotation_config.weeks_off}` : 'Not Set'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-[10px] text-gray-500 flex items-center gap-1 truncate max-w-[150px]">
                    <Mail size={10} className="shrink-0" />
                    <span className="truncate">{emp.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handleOpenEdit(emp)}
                      className="p-2 bg-white/5 text-gray-400 hover:text-white rounded-lg transition-colors border border-white/5"
                    >
                      <Settings2 size={14} />
                    </button>
                    <button 
                      onClick={() => handleOpenRotation(emp)}
                      className="p-2 bg-white/5 text-gray-400 hover:text-white rounded-lg transition-colors border border-white/5"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* Employee Edit Modal */}
      <AnimatePresence>
        {(editingEmployee || isAddingEmployee) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-[#0A120F] border border-emerald-900/30 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-emerald-500/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                    {isAddingEmployee ? <UserPlus size={20} /> : <Settings2 size={20} />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{isAddingEmployee ? 'Add New Employee' : 'Edit Employee'}</h3>
                    <p className="text-xs text-emerald-500/70 uppercase font-bold tracking-wider">Personnel Information</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setEditingEmployee(null);
                    setIsAddingEmployee(false);
                  }}
                  className="p-2 hover:bg-white/5 rounded-xl text-gray-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 grid grid-cols-2 gap-6">
                {isAddingEmployee && (
                  <div className="col-span-2 space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Reactivate Inactive Employee</label>
                      <select 
                        onChange={(e) => {
                          const emp = employees.find(e => e.id === e.target.value);
                          if (emp) {
                            setEmployeeForm({
                              first_name: emp.first_name,
                              last_name: emp.last_name,
                              email: emp.email,
                              job_title: emp.job_title || '',
                              role: emp.role as any,
                              rotation_group: emp.rotation_group || '',
                              employee_id_ref: emp.employee_id_ref || ''
                            });
                            setEditingEmployee(emp);
                            setIsAddingEmployee(false);
                          }
                        }}
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all appearance-none"
                      >
                        <option value="">Select an inactive employee to reactivate...</option>
                        {employees.filter(e => !e.is_active).map(e => (
                          <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                        ))}
                      </select>
                    </div>
                    {editingEmployee && (
                      <div className="space-y-2">
                        <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Reactivation Date</label>
                        <input 
                          type="date"
                          value={rotationForm.anchor_date}
                          onChange={(e) => setRotationForm(prev => ({ ...prev, anchor_date: e.target.value }))}
                          className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                        />
                      </div>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">First Name</label>
                  <input 
                    type="text"
                    value={employeeForm.first_name}
                    onChange={(e) => setEmployeeForm(prev => ({ ...prev, first_name: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Last Name</label>
                  <input 
                    type="text"
                    value={employeeForm.last_name}
                    onChange={(e) => setEmployeeForm(prev => ({ ...prev, last_name: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Email Address</label>
                  <input 
                    type="email"
                    value={employeeForm.email}
                    onChange={(e) => setEmployeeForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Employee ID Ref</label>
                  <input 
                    type="text"
                    value={employeeForm.employee_id_ref}
                    onChange={(e) => setEmployeeForm(prev => ({ ...prev, employee_id_ref: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Job Title</label>
                  <input 
                    type="text"
                    value={employeeForm.job_title}
                    onChange={(e) => setEmployeeForm(prev => ({ ...prev, job_title: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">System Role</label>
                  <select 
                    value={employeeForm.role}
                    onChange={(e) => setEmployeeForm(prev => ({ ...prev, role: e.target.value as any }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all appearance-none"
                  >
                    <option value="client">BESS Tech (Standard User)</option>
                    <option value="site_manager">Site Manager</option>
                    <option value="hr">HR Visibility (Read-Only)</option>
                    <option value="admin">Admin (Full Access)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Rotation Group</label>
                  <select 
                    value={employeeForm.rotation_group}
                    onChange={(e) => setEmployeeForm(prev => ({ ...prev, rotation_group: e.target.value as any }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all appearance-none"
                  >
                    <option value="">None / Custom</option>
                    <option value="A">Group A</option>
                    <option value="B">Group B</option>
                    <option value="C">Group C</option>
                    <option value="D">Group D</option>
                  </select>
                </div>
              </div>

              <div className="p-6 bg-black/40 border-t border-white/5 flex justify-between gap-3">
                <div className="flex gap-3">
                  <button 
                    onClick={handleRemoveEmployee}
                    className="px-6 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 rounded-xl text-sm font-bold text-amber-500 transition-all"
                  >
                    Remove Employee
                  </button>
                  <button 
                    onClick={handleNuclearDelete}
                    className="px-6 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl text-sm font-bold text-rose-500 transition-all"
                  >
                    Nuclear Delete
                  </button>
                </div>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      setEditingEmployee(null);
                      setIsAddingEmployee(false);
                    }}
                    className="px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold text-white transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSaveEmployee}
                    className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-sm font-bold text-black transition-all shadow-lg shadow-emerald-500/20"
                  >
                    {isAddingEmployee ? 'Create Employee' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rotation Modal */}
      <AnimatePresence>
        {editingRotation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
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
                    <h3 className="text-lg font-bold text-white">Rotation Schedule</h3>
                    <p className="text-xs text-emerald-500/70 uppercase font-bold tracking-wider">Custom Configuration</p>
                  </div>
                </div>
                <button 
                  onClick={() => setEditingRotation(null)}
                  className="p-2 hover:bg-white/5 rounded-xl text-gray-500 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Weeks On</label>
                  <input 
                    type="number"
                    value={rotationForm.weeks_on}
                    onChange={(e) => setRotationForm(prev => ({ ...prev, weeks_on: parseInt(e.target.value) }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Weeks Off</label>
                  <input 
                    type="number"
                    value={rotationForm.weeks_off}
                    onChange={(e) => setRotationForm(prev => ({ ...prev, weeks_off: parseInt(e.target.value) }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">Anchor Date (Start of an 'On' week)</label>
                  <input 
                    type="date"
                    value={rotationForm.anchor_date}
                    onChange={(e) => setRotationForm(prev => ({ ...prev, anchor_date: e.target.value }))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="p-6 bg-black/40 border-t border-white/5 flex justify-end gap-3">
                <button 
                  onClick={() => setEditingRotation(null)}
                  className="px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold text-white transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveRotation}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-sm font-bold text-black transition-all shadow-lg shadow-emerald-500/20"
                >
                  Save Schedule
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Stats Footer */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#0A120F] border border-emerald-900/20 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center text-purple-500">
            <Shield size={20} />
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-bold">Admins</div>
            <div className="text-xl font-bold text-white">{employees.filter(e => e.role === 'admin').length}</div>
          </div>
        </div>
        <div className="bg-[#0A120F] border border-emerald-900/20 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
            <Users size={20} />
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-bold">Site Managers</div>
            <div className="text-xl font-bold text-white">{employees.filter(e => e.role === 'site_manager').length}</div>
          </div>
        </div>
        <div className="bg-[#0A120F] border border-emerald-900/20 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
            <Users size={20} />
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-bold">Site Leads</div>
            <div className="text-xl font-bold text-white">{employees.filter(e => e.role === 'site_lead').length}</div>
          </div>
        </div>
        <div className="bg-[#0A120F] border border-emerald-900/20 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
            <Users size={20} />
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-bold">BESS Techs</div>
            <div className="text-xl font-bold text-white">{employees.filter(e => e.role === 'bess_tech').length}</div>
          </div>
        </div>
      </div>
        {isBatchEditModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#0A120F] border border-emerald-900/20 rounded-3xl w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-white/5">
                <h2 className="text-xl font-bold text-white">Batch Edit Roles</h2>
                <p className="text-sm text-gray-500">Update {selectedEmployeeIds.length} employees</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] text-gray-500 uppercase font-bold ml-1">New Role</label>
                  <select 
                    value={batchRole}
                    onChange={(e) => setBatchRole(e.target.value as Role)}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all appearance-none"
                  >
                    {availableRoles.map((role) => (
                      <option key={role} value={role}>
                        {role === 'bess_tech' ? 'BESS Tech (Standard User)' : 
                         role === 'site_lead' ? 'Site Lead' :
                         role === 'site_manager' ? 'Site Manager' : 'Admin (Full Access)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="p-6 bg-black/40 border-t border-white/5 flex justify-end gap-3">
                <button 
                  onClick={() => setIsBatchEditModalOpen(false)}
                  className="px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold text-white transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={async () => {
                    try {
                      const { error } = await supabase
                        .from('employees')
                        .update({ role: batchRole })
                        .in('id', selectedEmployeeIds);

                      if (error) throw error;

                      await logActivity('batch_update_roles', {
                        employee_fks: selectedEmployeeIds,
                        new_role: batchRole,
                        count: selectedEmployeeIds.length
                      });
                      onUpdate();
                      setIsBatchEditModalOpen(false);
                      setSelectedEmployeeIds([]);
                    } catch (error) {
                      console.error('Error updating roles:', error);
                      alert('Failed to update roles. Please try again.');
                    }
                  }}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-sm font-bold text-black transition-all shadow-lg shadow-emerald-500/20"
                >
                  Update Roles
                </button>
              </div>
            </motion.div>
          </div>
        )}
    </div>
  );
}
