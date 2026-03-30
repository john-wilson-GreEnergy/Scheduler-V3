import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Employee } from '../types';
import { PromotionReadinessView } from './PromotionReadinessView';
import { Search } from 'lucide-react';

export const PromotionReadinessTab: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from('employees').select('*').order('last_name').then(({ data }) => {
      if (data) setEmployees(data);
      setLoading(false);
    });
  }, []);

  const filteredEmployees = employees.filter(e => 
    `${e.first_name} ${e.last_name}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div>Loading...</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 bg-[#0A120F] border border-white/5 rounded-3xl p-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 text-gray-500" size={18} />
          <input 
            type="text" 
            placeholder="Search employees..." 
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/5 rounded-xl text-white text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="space-y-2 overflow-y-auto max-h-[600px]">
          {filteredEmployees.map(emp => (
            <button 
              key={emp.id}
              onClick={() => setSelectedEmployee(emp)}
              className={`w-full p-3 rounded-xl text-left transition-colors ${selectedEmployee?.id === emp.id ? 'bg-emerald-500/20 text-emerald-500' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
            >
              <p className="font-bold text-sm">{emp.first_name} {emp.last_name}</p>
              <p className="text-xs opacity-70">{emp.role}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="lg:col-span-2">
        {selectedEmployee ? (
          <PromotionReadinessView 
            employeeUserId={selectedEmployee.id} 
            targetRole={selectedEmployee.role === 'technician' ? 'site_lead' : 'site_manager'} 
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 bg-[#0A120F] border border-white/5 rounded-3xl">
            Select an employee to view readiness
          </div>
        )}
      </div>
    </div>
  );
};
