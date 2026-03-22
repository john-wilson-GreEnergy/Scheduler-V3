import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Jobsite, JobsiteGroup, Employee, AssignmentWeek, RotationConfig } from '../types';
import { Users, Calendar, Layers, Save, X, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import { format, addWeeks, startOfWeek } from 'date-fns';
import { isRotationWeek } from '../utils/rotation';
import { sendNotification } from '../utils/notifications';

interface GroupAssignmentToolProps {
  jobsites: Jobsite[];
  jobsiteGroups: JobsiteGroup[];
  employees: Employee[];
  onUpdate: () => void;
}

export default function GroupAssignmentTool({ jobsites, jobsiteGroups, employees, onUpdate }: GroupAssignmentToolProps) {
  const fieldEmployees = useMemo(() => employees.filter(e => e.role !== 'hr'), [employees]);
  const [selectedJobsites, setSelectedJobsites] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [employeesData, setEmployeesData] = useState<Employee[]>([]);
  const [rotationConfigs, setRotationConfigs] = useState<RotationConfig[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);

  useEffect(() => {
    const fetchRotationConfigs = async () => {
      const { data } = await supabase.from('rotation_configs').select('*');
      if (data) setRotationConfigs(data);
    };
    fetchRotationConfigs();
  }, []);

  const handleAssign = async (employeeId: string, weekStart: string) => {
    if (selectedJobsites.length === 0) return;
    
    setLoading(true);
    try {
      // For now, assign to the first selected jobsite
      const jobsiteId = selectedJobsites[0];
      
      // 1. Get or create assignment_week
      const { data: week, error: weekError } = await supabase
        .from('assignment_weeks')
        .upsert({ employee_fk: employeeId, week_start: weekStart }, { onConflict: 'employee_fk, week_start' })
        .select('id')
        .single();
        
      if (weekError) throw weekError;

      // 2. Create assignment_item
      const { error: itemError } = await supabase
        .from('assignment_items')
        .insert({ 
            assignment_week_fk: week.id, 
            jobsite_fk: jobsiteId, 
            days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            item_order: 1
        });
        
      if (itemError) throw itemError;

      // 3. Send notification to employee
      const emp = fieldEmployees.find(e => e.id === employeeId);
      const jobsite = jobsites.find(j => j.id === jobsiteId);
      if (emp && jobsite) {
        const weeksUntil = Math.max(0, Math.round((new Date(weekStart).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 7)));
        const portalMessage = `Update Type: Assignment Change\r\nEmployee: ${emp.first_name} ${emp.last_name}\r\nDate Updated: ${new Date().toISOString().split('T')[0]}\r\nWork Week: ${weekStart}\r\nPrevious Assignment: None\r\nNew Assignment: ${jobsite.jobsite_name}\r\nDays: Mon, Tue, Wed, Thu, Fri, Sat, Sun\r\nWeeks Until New Assignment: ${weeksUntil}`;

        await sendNotification({
          employeeId: emp.id,
          title: 'Assignment Change',
          message: portalMessage,
          type: 'info',
          sendEmail: true,
          emailData: {
            updateType: 'Assignment Change',
            jobsiteName: jobsite.jobsite_name,
            weekStartDate: weekStart,
            customEmailBody: portalMessage
          }
        });
      }

      onUpdate();
      setMessage({ type: 'success', text: 'Assignment created successfully.' });
      
      // Refresh assignments
      const { data: newAssignments } = await supabase
        .from('assignment_items')
        .select('assignment_week_fk, jobsite_fk, assignment_weeks(employee_fk, week_start)')
        .in('jobsite_fk', selectedJobsites);
      if (newAssignments) setAssignments(newAssignments);

    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleJobsiteToggle = (id: string) => {
    setSelectedJobsites(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Generate next 8 weeks
  const weeks = Array.from({ length: 8 }).map((_, i) => 
    format(addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), i), 'yyyy-MM-dd')
  );

  useEffect(() => {
    setEmployeesData(fieldEmployees);
  }, [fieldEmployees]);

  useEffect(() => {
    const fetchAssignments = async () => {
      if (selectedJobsites.length === 0) {
        setAssignments([]);
        return;
      }
      
      const { data } = await supabase
        .from('assignment_items')
        .select('assignment_week_fk, jobsite_fk, assignment_weeks(employee_fk, week_start)')
        .in('jobsite_fk', selectedJobsites);
        
      if (data) {
        setAssignments(data);
      }
    };
    fetchAssignments();
  }, [selectedJobsites]);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Bulk Group Assignment Tool</h2>
      
      {message && (
        <div className={`p-4 rounded-lg ${message.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
          {message.text}
        </div>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Select Jobsites */}
        <div className="bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Select Jobsites</h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {jobsites.map(site => (
              <button
                key={site.id}
                onClick={() => handleJobsiteToggle(site.id)}
                className={`w-full text-left p-3 rounded-lg border ${
                  selectedJobsites.includes(site.id) 
                    ? 'bg-emerald-500/20 border-emerald-500 text-white' 
                    : 'bg-black/20 border-emerald-900/30 text-gray-400'
                }`}
              >
                {site.jobsite_name}
              </button>
            ))}
          </div>
        </div>

        {/* Employee Assignments */}
        <div className="lg:col-span-2 bg-[#0A120F] border border-emerald-900/30 rounded-3xl p-6">
          <h3 className="text-lg font-bold text-white mb-4">Employee Assignments</h3>
          {selectedJobsites.length === 0 ? (
            <div className="text-center text-gray-500 py-12">Select jobsites to see assigned employees</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-emerald-900/30">
                    <th className="p-2 text-emerald-500 text-xs">Employee</th>
                    {weeks.map(week => (
                      <th key={week} className="p-2 text-emerald-500 text-xs text-center">{format(new Date(week), 'MMM dd')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employeesData.map(emp => {
                    const config = rotationConfigs.find(c => c.employee_fk === emp.id);
                    return (
                      <tr key={emp.id} className="border-b border-emerald-900/10 hover:bg-white/5">
                        <td className="p-2 text-sm text-white">{emp.first_name} {emp.last_name}</td>
                        {weeks.map(week => {
                          const isRotation = config ? isRotationWeek(new Date(week), config) : false;
                          const assignment = assignments.find(a => 
                            a.assignment_weeks.employee_fk === emp.id && 
                            a.assignment_weeks.week_start === week &&
                            selectedJobsites.includes(a.jobsite_fk)
                          );
                          return (
                            <td key={week} className="p-2 text-center">
                              <button 
                                onClick={() => !assignment && handleAssign(emp.id, week)}
                                className={`text-xs px-2 py-1 rounded ${
                                  assignment ? 'bg-emerald-500/50 text-white' : 
                                  isRotation ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                                }`}
                              >
                                {assignment ? 'Assigned' : isRotation ? '(Rotation)' : 'Assign'}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
