import React, { useState, useEffect, useMemo } from 'react';
import { Employee, RotationConfig } from '../types';
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
import { format } from 'date-fns';

interface EmployeeManagementProps {
  employees: Employee[];
  onUpdate: (silent?: boolean) => void;
}

type SortField = 'name' | 'job_title' | 'role' | 'rotation' | 'status';
type SortDirection = 'asc' | 'desc';

export default function EmployeeManagement({ employees: initialEmployees, onUpdate }: EmployeeManagementProps) {
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | 'admin' | 'client'>('all');
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

  const [employeeForm, setEmployeeForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    job_title: '',
    role: 'client' as 'admin' | 'client',
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

      logActivity('rotation_update', {
        employee_id: editingRotation.id,
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
      const payload = {
        ...employeeForm,
        rotation_group: employeeForm.rotation_group || null
      };

      if (editingEmployee) {
        const { error } = await supabase
          .from('employees')
          .update(payload)
          .eq('id', editingEmployee.id);
        if (error) throw error;
        logActivity('employee_update', { id: editingEmployee.id, ...payload });
      } else {
        const { error } = await supabase
          .from('employees')
          .insert([{ ...payload, is_active: true }]);
        if (error) throw error;
        logActivity('employee_create', payload);
      }

      setEditingEmployee(null);
      setIsAddingEmployee(false);
      onUpdate(true);
    } catch (err) {
      console.error('Error saving employee:', err);
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
      const matchesRole = filterRole === 'all' || emp.role === filterRole;
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
        employee_id: id, 
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
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text"
              placeholder="Search by name, email, or title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0A120F] border border-emerald-900/20 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-all"
            />
          </div>
          <div className="flex items-center gap-2 bg-[#0A120F] border border-emerald-900/20 p-1 rounded-xl">
            {(['all', 'admin', 'client'] as const).map((role) => (
              <button
                key={role}
                onClick={() => setFilterRole(role)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  filterRole === role 
                ? 'bg-emerald-500 text-black' 
                : 'text-gray-500 hover:text-white'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white transition-all">
            <Download size={16} />
            Export
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
            className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 rounded-xl text-sm font-bold text-black transition-all shadow-lg shadow-emerald-500/20"
          >
            <UserPlus size={16} />
            Add Employee
          </button>
        </div>
      </div>

      {/* Employee Table */}
      <div className="bg-[#0A120F] border border-emerald-900/20 rounded-3xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-black/20">
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
                  className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest cursor-pointer group hover:text-emerald-500 transition-colors"
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
                  className="px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest cursor-pointer group hover:text-emerald-500 transition-colors"
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
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center text-emerald-500 font-bold text-sm border border-emerald-500/20 group-hover:scale-110 transition-transform">
                          {emp.first_name[0]}{emp.last_name[0]}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">{emp.first_name} {emp.last_name}</div>
                          <div className="text-[10px] text-gray-500 flex items-center gap-1">
                            <Mail size={10} />
                            {emp.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-gray-300">{emp.job_title}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                        emp.role === 'admin' 
                          ? 'text-purple-400 bg-purple-400/10 border-purple-400/20' 
                          : 'text-blue-400 bg-blue-400/10 border-blue-400/20'
                      }`}>
                        <Shield size={10} />
                        <span className="uppercase tracking-wider">{emp.role}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
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
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => handleToggleActive(emp.id, emp.is_active)}
                        className={`transition-colors ${emp.is_active ? 'text-emerald-500' : 'text-gray-600'}`}
                      >
                        {emp.is_active ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                    <option value="client">Client (Standard User)</option>
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

              <div className="p-6 bg-black/40 border-t border-white/5 flex justify-end gap-3">
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0A120F] border border-emerald-900/20 rounded-2xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-bold">Active Staff</div>
            <div className="text-xl font-bold text-white">{employees.filter(e => e.is_active).length}</div>
          </div>
        </div>
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
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-500">
            <Clock size={20} />
          </div>
          <div>
            <div className="text-[10px] text-gray-500 uppercase font-bold">Pending Setup</div>
            <div className="text-xl font-bold text-white">{employees.filter(e => !e.rotation_config).length}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
