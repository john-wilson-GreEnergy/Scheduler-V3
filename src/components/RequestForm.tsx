import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { format, startOfWeek } from 'date-fns';
import { AssignmentWeek } from '../types';

export function RequestForm({ onSuccess }: { onSuccess?: () => void }) {
  const { employee } = useAuth();
  const [requestType, setRequestType] = useState<'vacation' | 'time_off' | 'rotation_change' | 'jobsite_change'>('vacation');
  const [details, setDetails] = useState('');
  const [selectedWeek, setSelectedWeek] = useState('');
  const [targetWeek, setTargetWeek] = useState('');
  const [selectedRotation, setSelectedRotation] = useState('');
  const [assignments, setAssignments] = useState<AssignmentWeek[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchAssignments = async () => {
      if (!employee) return;
      const { data, error } = await supabase
        .from('assignment_weeks')
        .select('*')
        .eq('employee_fk', employee.id)
        .order('week_start', { ascending: true });
      
      if (error) {
        console.error('Error fetching assignments:', error);
        return;
      }
      setAssignments(data || []);
    };
    fetchAssignments();
  }, [employee]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;
    setLoading(true);

    const { error } = await supabase.from('portal_requests').insert({
      employee_fk: employee.id,
      request_type: requestType,
      status: 'pending',
      details,
      requested_week_start: selectedWeek,
      target_week_start: requestType === 'rotation_change' ? targetWeek : null,
      start_date: requestType !== 'rotation_change' ? selectedWeek : null,
      created_at: new Date().toISOString(),
    });

    setLoading(false);
    if (error) {
      console.error('Error submitting request:', error);
      alert('Failed to submit request: ' + error.message);
    } else {
      setDetails('');
      if (onSuccess) onSuccess();
    }
  };

  const getAvailableWeeks = () => {
    const now = new Date();
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    
    switch (requestType) {
      case 'vacation':
        // From current week forward, omit "Rotation"
        return assignments.filter(a => {
          const weekDate = new Date(a.week_start + 'T12:00:00');
          return weekDate >= currentWeekStart && a.status !== 'rotation';
        });
      case 'time_off':
        // Next available work week, omit "Rotation"
        return assignments.filter(a => {
          const weekDate = new Date(a.week_start + 'T12:00:00');
          return weekDate >= currentWeekStart && a.status !== 'rotation';
        });
      case 'rotation_change':
        // Next available rotation week (future weeks without rotation assigned)
        return assignments.filter(a => new Date(a.week_start + 'T12:00:00') > now && a.status !== 'rotation');
      case 'jobsite_change':
        // Next available work week (jobsite assigned that isn't Vacation, Rotation, or Personal)
        return assignments.filter(a => {
          const weekDate = new Date(a.week_start + 'T12:00:00');
          return weekDate >= currentWeekStart && !['Vacation', 'Rotation', 'Personal'].includes(a.assignment_name || '');
        });
      default:
        return assignments;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-[#0A120F] p-8 rounded-3xl border border-white/10 shadow-2xl space-y-6">
      <h2 className="text-2xl font-bold text-white">Submit Request</h2>
      
      <div>
        <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-2">Request Type</label>
        <select 
          value={requestType} 
          onChange={(e) => setRequestType(e.target.value as any)}
          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-emerald-500 transition-all"
        >
          <option value="vacation">Vacation</option>
          <option value="time_off">Time Off</option>
          <option value="rotation_change">Rotation Change</option>
          <option value="jobsite_change">Jobsite Change</option>
        </select>
      </div>

      {requestType === 'rotation_change' && (
        <>
          <div>
            <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-2">Rotation Week to Change</label>
            <select 
              value={selectedWeek} 
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-emerald-500 transition-all"
              required
            >
              <option value="">Select rotation week</option>
              {assignments.filter(a => a.status === 'rotation' && new Date(a.week_start + 'T12:00:00') > new Date()).map(a => (
                <option key={a.id} value={a.week_start}>{a.week_start} - {a.status}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-2">Work Week to Swap With</label>
            <select 
              value={targetWeek} 
              onChange={(e) => setTargetWeek(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-emerald-500 transition-all"
              required
            >
              <option value="">Select work week</option>
              {assignments.filter(a => a.status !== 'rotation' && new Date(a.week_start + 'T12:00:00') > new Date()).map(a => (
                <option key={a.id} value={a.week_start}>{a.week_start} - {a.status}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {requestType !== 'rotation_change' && (
        <div>
          <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-2">Work Week</label>
          <select 
            value={selectedWeek} 
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-emerald-500 transition-all"
            required
          >
            <option value="">Select a week</option>
            {getAvailableWeeks().map(a => (
              <option key={a.id} value={a.week_start}>{format(new Date(a.week_start), 'yyyy-MM-dd')} - {a.assignment_name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-2">Details</label>
        <textarea 
          value={details} 
          onChange={(e) => setDetails(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-emerald-500 transition-all resize-none"
          rows={4}
          required
        />
      </div>

      <button 
        type="submit" 
        disabled={loading}
        className="w-full py-4 bg-emerald-500 text-black font-bold rounded-2xl transition-all shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:bg-gray-600 disabled:shadow-none"
      >
        {loading ? 'Submitting...' : 'Submit Request'}
      </button>
    </form>
  );
}
