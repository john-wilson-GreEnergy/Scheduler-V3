import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { PortalRequest } from '../types';

export function RequestDashboard() {
  const { employee, isAdmin, isSiteManager } = useAuth();
  const [requests, setRequests] = useState<PortalRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRequests = async () => {
      let query = supabase.from('portal_requests').select('*');

      if (isSiteManager && employee) {
        // Assuming manager field in Jobsite matches employee name or email
        // This might need adjustment based on how manager is stored
        query = query.eq('requested_jobsite', employee.first_name + ' ' + employee.last_name);
      }

      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching requests:', error);
      } else {
        setRequests(data || []);
      }
      setLoading(false);
    };
    fetchRequests();
  }, [isAdmin, isSiteManager, employee]);

  const handleAction = async (id: string, status: 'approved' | 'denied', reason?: string) => {
    const updates: any = { status };
    if (reason) updates.deny_reason = reason;

    const { error } = await supabase.from('portal_requests').update(updates).eq('id', id);

    if (error) {
      console.error('Error updating request:', error);
      alert('Failed to update request');
      return;
    }

    if (status === 'approved') {
      const req = requests.find(r => r.id === id);
      if (req && req.requested_week_start && req.requested_jobsite) {
        // Fetch employee details
        const { data: emp } = await supabase.from('employees').select('email, first_name, last_name, employee_id_ref').eq('id', req.employee_fk).single();
        
        if (emp) {
          // Update or insert assignment_weeks
          const { data: existing } = await supabase
            .from('assignment_weeks')
            .select('id')
            .eq('email', emp.email)
            .eq('week_start', req.requested_week_start)
            .maybeSingle();

          const payload = {
            employee_id: emp.employee_id_ref,
            email: emp.email,
            first_name: emp.first_name,
            last_name: emp.last_name,
            week_start: req.requested_week_start,
            assignment_name: req.requested_jobsite,
            status: 'assigned',
            value_type: 'jobsite'
          };

          if (existing) {
            await supabase.from('assignment_weeks').update(payload).eq('id', existing.id);
          } else {
            await supabase.from('assignment_weeks').insert(payload);
          }
        }
      }
    }
    
    setRequests(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-4">Requests</h2>
      <table className="w-full">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Type</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map(req => (
            <tr key={req.id}>
              <td>{req.employee_fk}</td>
              <td>{req.request_type}</td>
              <td>{req.status}</td>
              <td>
                {req.status === 'pending' && isAdmin && (
                  <>
                    <button onClick={() => handleAction(req.id, 'approved')} className="bg-green-500 text-white px-2 py-1 rounded mr-2">Approve</button>
                    <button onClick={() => handleAction(req.id, 'denied', 'Reason...')} className="bg-red-500 text-white px-2 py-1 rounded">Deny</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
