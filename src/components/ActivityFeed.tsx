import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Clock, CheckCircle2, XCircle, AlertTriangle, User, FileText, Settings } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ActivityLog {
  id: string;
  event_type: string;
  details: any;
  created_at: string;
  actor?: {
    first_name: string;
    last_name: string;
  };
}

const getEventIcon = (type: string) => {
  switch (type) {
    case 'request_approved': return <CheckCircle2 size={14} className="text-emerald-500" />;
    case 'request_denied': return <XCircle size={14} className="text-red-500" />;
    case 'action_completed': return <CheckCircle2 size={14} className="text-emerald-400" />;
    case 'safety_score_update': return <AlertTriangle size={14} className="text-amber-500" />;
    case 'employee_update': return <User size={14} className="text-blue-500" />;
    case 'assignment_update': return <FileText size={14} className="text-purple-500" />;
    default: return <Settings size={14} className="text-gray-500" />;
  }
};

const formatEventMessage = (log: ActivityLog) => {
  const actorName = log.actor ? `${log.actor.first_name} ${log.actor.last_name}` : 'System';
  const details = log.details || {};

  switch (log.event_type) {
    case 'request_approved':
      return `${actorName} approved ${details.request_type || 'request'} for ${details.employee_name || 'employee'}`;
    case 'request_denied':
      return `${actorName} denied ${details.request_type || 'request'} for ${details.employee_name || 'employee'}`;
    case 'action_completed':
      return `${details.employee_name || 'Employee'} completed ${details.action_title || 'an action'}`;
    case 'safety_score_update':
      return `Safety score updated for ${details.jobsite_name || 'site'}`;
    case 'assignment_update':
      return `Assignment updated for ${details.employee_name || 'employee'}`;
    default:
      return `${actorName} performed ${log.event_type.replace(/_/g, ' ')}`;
  }
};

export default function ActivityFeed({ 
  employeeIds, 
  siteNames = [], 
  weekStart 
}: { 
  employeeIds: string[];
  siteNames?: string[];
  weekStart?: string;
}) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        let query = supabase
          .from('activity_log')
          .select('*, actor:employees(first_name, last_name)')
          .order('created_at', { ascending: false })
          .limit(15);

        // Filter by current week if provided
        if (weekStart) {
          query = query.gte('created_at', `${weekStart}T00:00:00Z`);
        }

        // Build OR conditions for site-specific activity
        const conditions = [];
        
        // 1. Actions performed by site employees
        if (employeeIds.length > 0) {
          conditions.push(`actor_fk.in.(${employeeIds.join(',')})`);
          // 2. Actions about site employees (e.g. request approval)
          conditions.push(`details->>employee_fk.in.(${employeeIds.join(',')})`);
        }
        
        // 3. Actions explicitly mentioning the site/group
        if (siteNames.length > 0) {
          siteNames.forEach(name => {
            const escapedName = name.replace(/'/g, "''");
            conditions.push(`details->>jobsite_name.ilike.%${escapedName}%`);
            conditions.push(`details->>assignment_type.ilike.%${escapedName}%`);
          });
        }

        if (conditions.length > 0) {
          query = query.or(conditions.join(','));
        } else if (!weekStart) {
          // If no filters at all, just return empty to be safe
          setLogs([]);
          setLoading(false);
          return;
        }

        const { data, error } = await query;

        if (error) throw error;
        setLogs(data || []);
      } catch (err) {
        console.error('Error fetching logs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();

    // Subscribe to new logs
    const channel = supabase
      .channel('activity_log_changes')
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'activity_log' },
        () => {
          fetchLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employeeIds, siteNames, weekStart]);

  if (loading) return (
    <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-6 animate-pulse">
      <div className="h-4 w-32 bg-white/5 rounded mb-6"></div>
      <div className="space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-10 bg-white/5 rounded-xl"></div>)}
      </div>
    </div>
  );

  return (
    <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-6">
      <h3 className="font-bold text-white mb-6 flex items-center gap-2">
        <Clock size={16} className="text-emerald-500" />
        Recent Activity
      </h3>

      <div className="space-y-4">
        {logs.length > 0 ? (
          logs.map(log => (
            <div key={log.id} className="flex gap-4 group">
              <div className="mt-1 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center group-hover:border-emerald-500/20 transition-colors">
                  {getEventIcon(log.event_type)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-300 leading-relaxed">
                  {formatEventMessage(log)}
                </p>
                <p className="text-[10px] text-gray-600 mt-1">
                  {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-600 italic py-4 text-center">No recent activity recorded.</p>
        )}
      </div>
    </div>
  );
}
