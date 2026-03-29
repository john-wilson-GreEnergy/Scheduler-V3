import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { logActivity } from '../lib/logger';
import { RequestForm } from './RequestForm';
import { PerformancePulseTile } from './PerformancePulseTile';
import { SurveyReviewTab } from './SurveyReviewTab';
import { SurveyInitiator } from './SurveyInitiator';
import { 
  ExternalLink, 
  Calendar, 
  RefreshCw, 
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  AlertTriangle,
  Construction,
  Info,
  Truck,
  Clock,
  X,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Announcement, AssignmentWeek, AssignmentItem, PortalAction, Jobsite, RotationConfig, JobsiteGroup } from '../types';
import { isRotationWeek } from '../utils/rotation';
import { IconComponent } from './PortalComponents';
import PortalLayout from './PortalLayout';
import MapPortal from './MapPortal';
import JobsiteInfoCard from './JobsiteInfoCard';
import Chat from './Chat';
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, isWithinInterval, addDays, subDays, getDay, getDate, getMonth, startOfWeek, addWeeks } from 'date-fns';
import { parseAssignmentNames } from '../utils/assignmentParser';

const isScheduledActive = (item: Announcement | PortalAction, now: Date): boolean => {
  // If manual dates are set, they take precedence or act as a boundary
  if (item.start_date && item.start_date.trim() !== '') {
    const start = new Date(item.start_date + 'T00:00:00');
    if (!isNaN(start.getTime()) && now < start) return false;
  }
  if (item.end_date && item.end_date.trim() !== '') {
    const end = new Date(item.end_date + 'T23:59:59');
    if (!isNaN(end.getTime()) && now > end) return false;
  }

  // Check Announcement specific schedule
  if ('scheduling_mode' in item && item.scheduling_mode === 'weeks') {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
    const endOfWeekRange = addWeeks(weekStart, item.weeks_count || 1);
    return isWithinInterval(now, { start: weekStart, end: endOfWeekRange });
  }

  // Check PortalAction specific schedule
  if ('schedule_type' in item && item.schedule_type && item.schedule_type !== 'none') {
    const portalAction = item as PortalAction;
    const duration = portalAction.duration_days || 7;
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    const quarterStart = startOfQuarter(now);
    const quarterEnd = endOfQuarter(now);

    let triggerDate: Date;
    switch (item.schedule_type) {
      case 'first_week_month':
        triggerDate = monthStart;
        break;
      case 'last_week_month':
        triggerDate = subDays(monthEnd, 6);
        break;
      case 'first_week_quarter':
        triggerDate = quarterStart;
        break;
      case 'last_week_quarter':
        triggerDate = subDays(quarterEnd, 6);
        break;
      default:
        return true;
    }
    
    return isWithinInterval(now, { 
      start: triggerDate, 
      end: addDays(triggerDate, duration - 1) 
    });
  }

  // Check PortalAction specific recurrence
  if ('recurrence_type' in item && item.recurrence_type && item.recurrence_type !== 'none') {
    const portalAction = item as PortalAction;
    const duration = portalAction.duration_days || 7;
    const dayOfMonth = getDate(now);
    const dayOfWeek = getDay(now); // 0-6
    const month = getMonth(now); // 0-11
    const year = now.getFullYear();

    let triggerDate: Date;

    switch (item.recurrence_type) {
      case 'weekly': {
        // Find the most recent occurrence of the recurrence_day
        const targetDay = item.recurrence_day ?? 1;
        triggerDate = subDays(now, (dayOfWeek - targetDay + 7) % 7);
        triggerDate.setHours(0, 0, 0, 0);
        break;
      }
      case 'monthly': {
        const targetDay = item.recurrence_day ?? 1;
        triggerDate = new Date(year, month, targetDay);
        // If today is before the trigger date this month, check last month's trigger
        if (now < triggerDate) {
          triggerDate = new Date(year, month - 1, targetDay);
        }
        break;
      }
      case 'quarterly': {
        const targetDay = item.recurrence_day ?? 1;
        const quarterMonths = [0, 3, 6, 9];
        const currentQuarterMonth = quarterMonths.find(m => m <= month) ?? 0;
        triggerDate = new Date(year, currentQuarterMonth, targetDay);
        // If today is before the trigger date this quarter, check last quarter's trigger
        if (now < triggerDate) {
          const lastQuarterMonth = quarterMonths.reverse().find(m => m < currentQuarterMonth) ?? 9;
          triggerDate = new Date(year - (currentQuarterMonth === 0 ? 1 : 0), lastQuarterMonth, targetDay);
        }
        break;
      }
      default:
        return true;
    }

    return isWithinInterval(now, { 
      start: triggerDate, 
      end: addDays(triggerDate, duration - 1) 
    });
  }

  return true;
};

export default function EmployeePortal() {
  const { employee, user } = useAuth();
  
  useEffect(() => {
    console.log('EmployeePortal: employee object:', employee);
  }, [employee]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'links' | 'map'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data states
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<AssignmentWeek | null>(null);
  const [upcomingAssignments, setUpcomingAssignments] = useState<AssignmentWeek[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentWeek[]>([]);
  const [assignmentItems, setAssignmentItems] = useState<AssignmentItem[]>([]);
  const [portalActions, setPortalActions] = useState<PortalAction[]>([]);
  const [requiredActions, setRequiredActions] = useState<PortalAction[]>([]);
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [jobsiteGroups, setJobsiteGroups] = useState<JobsiteGroup[]>([]);
  const [portalRequests, setPortalRequests] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedRequestType, setSelectedRequestType] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [rotationConfigs, setRotationConfigs] = useState<Record<string, RotationConfig>>({});
  const [myCompletions, setMyCompletions] = useState<string[]>([]); // action_ids already completed
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [embeddedFormAction, setEmbeddedFormAction] = useState<PortalAction | null>(null);

  const filteredJobsites = useMemo(() => {
    const currentJobsiteIds = currentAssignment?.assignment_items?.map(item => item.jobsites?.id) || [];
    const nextAssignment = upcomingAssignments[0];
    const nextJobsiteIds = nextAssignment?.assignment_items?.map(item => item.jobsites?.id) || [];
    const allowedIds = new Set([...currentJobsiteIds, ...nextJobsiteIds]);
    
    return jobsites.filter(j => allowedIds.has(j.id));
  }, [jobsites, currentAssignment, upcomingAssignments]);

  const resolveUrl = (url: string) => {
    if (!employee || !url) return url;
    return url
      .replace(/{{email}}/g, encodeURIComponent(employee.email))
      .replace(/{{first_name}}/g, encodeURIComponent(employee.first_name))
      .replace(/{{last_name}}/g, encodeURIComponent(employee.last_name))
      .replace(/{{employee_id}}/g, encodeURIComponent(employee.employee_id_ref))
      .replace(/{{current_site}}/g, encodeURIComponent(currentAssignment?.assignment_type || ''))
      .replace(/{{current_customer}}/g, encodeURIComponent(currentCustomer || ''))
      .replace(/{{id}}/g, encodeURIComponent(employee.id));
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const todayStr = format(now, 'yyyy-MM-dd');

      const queries: any[] = [
        supabase.from('announcements')
          .select('*')
          .eq('active', true)
          .lte('start_date', todayStr)
          .gte('end_date', todayStr),
        supabase.from('portal_actions')
          .select('*')
          .eq('active', true)
          .order('sort_order', { ascending: true }),
        supabase.from('portal_required_actions')
          .select('*')
          .eq('active', true)
          .order('sort_order', { ascending: true }),
        supabase.from('jobsites').select('*').eq('is_active', true),
        supabase.from('jobsite_groups').select('*'),
        supabase.from('rotation_configs').select('*')
      ];

      if (employee) {
        console.log('Fetching assignment data for employee:', employee.email);
        queries.push(
          supabase.from('assignment_weeks')
            .select('*, assignment_items(*, jobsites(*))')
            .eq('employee_fk', employee.id)
            .order('week_start', { ascending: false }),
          supabase.from('portal_requests').select('*').eq('employee_fk', employee.id).order('created_at', { ascending: false }),
          supabase.from('recent_activity').select('*').eq('employee_fk', employee.id).order('created_at', { ascending: false }).limit(5),
          supabase.from('portal_action_completions').select('action_id').eq('employee_fk', employee.id),
          supabase.from('portal_required_action_completions').select('action_id').eq('employee_fk', employee.id)
        );
      } else {
        console.log('No employee object available, skipping assignment data fetch.');
      }

      const results = await Promise.all(queries);
      
      const annRes = results[0];
      const actionsRes = results[1];
      const reqActionsRes = results[2];
      const sitesRes = results[3];
      const groupRes = results[4];
      const rotRes = results[5];

      if (annRes.error) console.error('Error fetching announcements:', annRes.error);
      if (actionsRes.error) console.error('Error fetching portal actions:', actionsRes.error);
      if (reqActionsRes.error) console.error('Error fetching required actions:', reqActionsRes.error);
      if (sitesRes.error) console.error('Error fetching jobsites:', sitesRes.error);
      if (groupRes.error) console.error('Error fetching jobsite groups:', groupRes.error);
      if (rotRes.error) console.error('Error fetching rotation configs:', rotRes.error);

      if (annRes.data) {
        const filteredAnnouncements = annRes.data.filter(ann => isScheduledActive(ann, now));
        setAnnouncements(filteredAnnouncements);
      }
      if (actionsRes.data) {
        const filteredActions = actionsRes.data.filter(action => {
          // If it's a link (low priority or link category), show it
          const isLink = action.priority === 'low' || 
                        action.category?.toLowerCase().includes('link');

          if (isLink) return true;
          
          // Check if it's active based on schedule/recurrence
          return isScheduledActive(action, now);
        });
        setPortalActions(filteredActions);
      }
      if (reqActionsRes.data) {
        const filteredReqActions = reqActionsRes.data.filter(action => isScheduledActive(action, now));
        setRequiredActions(filteredReqActions);
      }
      if (sitesRes.data) setJobsites(sitesRes.data);
      if (groupRes.data) {
        console.log('Jobsite Groups (EmployeePortal):', groupRes.data);
        setJobsiteGroups(groupRes.data);
      }
      if (rotRes.data) {
        const configMap: Record<string, RotationConfig> = {};
        rotRes.data.forEach(config => {
          configMap[config.employee_fk] = config;
        });
        setRotationConfigs(configMap);
      }

      if (employee && results.length > 5) {
        const assignRes = results[6];
        const reqRes = results[7];
        const actRes = results[8];
        const completionsRes = results[9];
        const reqCompletionsRes = results[10];

        if (assignRes.data) {
          console.log('EmployeePortal: assignment data:', assignRes.data);
          const now = new Date();
          
          // Use T12:00:00 when comparing to avoid UTC timezone shift on date-only strings
          const current = assignRes.data.find(a => new Date(a.week_start + 'T12:00:00') <= now);
          // upcoming: future weeks, sorted ascending (soonest first)
          const upcoming = assignRes.data
            .filter(a => new Date(a.week_start + 'T12:00:00') > now)
            .sort((a, b) => new Date(a.week_start).getTime() - new Date(b.week_start).getTime());
          
          console.log('EmployeePortal: current assignment:', current);
          console.log('EmployeePortal: upcoming assignments:', upcoming);
          
          setCurrentAssignment(current || upcoming[0] || null);
          setUpcomingAssignments(upcoming);
          setAssignmentHistory([]); // not used in timeline anymore

          if (current && current.assignment_items) {
            setAssignmentItems(current.assignment_items);
          } else {
            setAssignmentItems([]);
          }
        }
        if (reqRes.data) setPortalRequests(reqRes.data);
        if (actRes.data) setRecentActivity(actRes.data);
        
        const allCompletions = [
          ...(completionsRes?.data || []),
          ...(reqCompletionsRes?.data || [])
        ];
        setMyCompletions(allCompletions.map((c: any) => c.action_id));
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employee?.id) {
      fetchData();
    }
  }, [employee?.id]);

  useEffect(() => {
    const updateTime = () => {
      setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const findNextDifferentAssignment = () => {
    if (!currentAssignment || upcomingAssignments.length === 0) return null;
    return upcomingAssignments.find(a => a.assignment_type !== currentAssignment.assignment_type) || null;
  };

  const getRequestProgress = (status: string) => {
    switch (status) {
      case 'approved': return { step: 3, tone: 'emerald', label: 'Approved' };
      case 'denied': return { step: 3, tone: 'red', label: 'Denied' };
      default: return { step: 2, tone: 'amber', label: 'Review' };
    }
  };

  const handleRequestSubmit = async (details: string, startDate: string, endDate: string) => {
    if (!employee || !selectedRequestType) return;
    
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const { error } = await supabase
        .from('portal_requests')
        .insert({
          employee_fk: employee.id,
          request_type: selectedRequestType,
          details,
          start_date: startDate,
          end_date: endDate,
          status: 'pending'
        });

      if (error) throw error;
      
      fetchData();
      setIsRequestModalOpen(false);
      setSelectedRequestType(null);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMarkComplete = async (action: PortalAction) => {
    if (!employee) return;
    const table = action.priority === 'high' ? 'portal_required_action_completions' : 'portal_action_completions';
    try {
      const { error } = await supabase.from(table).insert({
        action_id: action.id,
        employee_fk: employee.id,  // UUID, not employee_id_ref
        email: employee.email,
        first_name: employee.first_name,
        last_name: employee.last_name,
        completed_at: new Date().toISOString()
      });
      if (error) {
        console.error('Insert error:', error);
        return;
      }
      // Write to activity log
      await logActivity('action_completed', {
        action_title: action.title,
        action_id: action.id,
        employee_fk: employee.id,
        employee_name: `${employee.first_name} ${employee.last_name}`,
        employee_email: employee.email,
        completed_at: new Date().toISOString()
      });
      setMyCompletions(prev => [...prev, action.id]);
      setExpandedAction(null);
    } catch (err) {
      console.error('Error marking complete:', err);
    }
  };

  const currentJobsites = useMemo(() => {
    if (!currentAssignment || !currentAssignment.assignment_items || currentAssignment.assignment_items.length === 0) return [];
    return currentAssignment.assignment_items
      .map(item => item.jobsites)
      .filter((jobsite): jobsite is Jobsite => !!jobsite);
  }, [currentAssignment]);

  const groupJobsites = useMemo(() => {
    if (currentJobsites.length === 0) return [];

    // Get all group names/IDs from assigned sites
    const groupNames = new Set(currentJobsites.map(s => s.jobsite_group).filter(Boolean));
    const groupIds = new Set(currentJobsites.map(s => s.group_id).filter(Boolean));

    // If no groups, just return assigned sites
    if (groupNames.size === 0 && groupIds.size === 0) return currentJobsites;

    // Filter all jobsites that match any of the groups
    return jobsites.filter(j => 
      (j.jobsite_group && groupNames.has(j.jobsite_group)) || 
      (j.group_id && groupIds.has(j.group_id)) ||
      currentJobsites.some(as => as.id === j.id)
    );
  }, [currentJobsites, jobsites]);

  const currentCustomer = useMemo(() => {
    const assignedSites = currentAssignment?.assignment_items
      ?.map(item => item.jobsites)
      .filter((jobsite): jobsite is Jobsite => !!jobsite) || [];
    return assignedSites.length > 0 ? assignedSites[0].customer : null;
  }, [currentAssignment]);

  const currentSitesCount = useMemo(() => {
    return groupJobsites.length;
  }, [groupJobsites]);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <Calendar size={18} /> },
    { id: 'surveys', label: 'Surveys', icon: <MessageSquare size={18} /> },
    { id: 'chat', label: 'Crew Chat', icon: <MessageSquare size={18} /> },
    { id: 'map', label: 'Map Portal', icon: <Construction size={18} /> },
    { id: 'links', label: 'GreEnergy Links', icon: <ExternalLink size={18} /> },
  ];

  if (loading && !employee) {
    return (
      <div className="min-h-screen bg-[#050A08] flex items-center justify-center">
        <RefreshCw className="text-emerald-500 animate-spin" size={32} />
      </div>
    );
  }

  return (
    <PortalLayout 
      title="BESS Tech" 
      tabs={tabs} 
      activeTab={activeTab} 
      onTabChange={setActiveTab}
      lastUpdated={lastUpdated}
    >
      <AnimatePresence mode="wait">
        {activeTab === 'dashboard' && (
          <motion.div 
            key="dashboard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            {/* Top Row: Announcements & Actions */}
            {!employee && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-3xl p-6 flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-amber-500/20 rounded-2xl flex items-center justify-center text-amber-500">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-amber-200">No Employee Profile Found</h3>
                  <p className="text-sm text-amber-500/80">
                    You are viewing the portal as an administrator, but your account is not linked to an employee record. 
                    Some features like assignments and requests will be unavailable.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-[#0A120F] border border-white/5 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">Today at GreEnergy</h2>
                  <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-gray-500">
                    {announcements.length + recentActivity.length}
                  </span>
                </div>
                
                <div className="space-y-6">
                  {announcements.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Announcements</h3>
                      {announcements.map(ann => (
                        <div key={ann.id} className={`p-4 rounded-2xl border ${ann.level === 'high' ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/5'} ${ann.is_reminder ? 'border-l-4 border-l-emerald-500' : ''}`}>
                          <div className="flex items-center justify-between mb-1">
                            <h3 className={`font-bold text-sm ${ann.level === 'high' ? 'text-red-400' : 'text-white'}`}>{ann.title}</h3>
                            {ann.is_reminder && (
                              <span className="flex items-center gap-1 text-[8px] font-bold text-emerald-500 uppercase tracking-wider">
                                <Clock size={10} /> Reminder
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{ann.message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {recentActivity.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Recent Activity</h3>
                      <div className="space-y-3">
                        {recentActivity.map((act, index) => (
                          <div key={act.id || act.created_at || index} className="flex items-center gap-3 text-xs">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            <span className="text-gray-400">{(act.event_type || 'activity').replace('_', ' ')}</span>
                            <span className="text-gray-600 ml-auto">{new Date(act.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-[#0A120F] border border-white/5 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white">Required Actions</h2>
                  <span className="px-3 py-1 bg-white/5 rounded-full text-[10px] font-bold text-gray-500">
                    {requiredActions.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {requiredActions.map(action => {
                    const isCompleted = myCompletions.includes(action.id);
                    const isExpanded = expandedAction === action.id;
                    return (
                      <div key={action.id} className={`border rounded-2xl overflow-hidden transition-all ${isCompleted ? 'border-emerald-500/20' : 'border-white/5'}`}>
                        {/* Clickable header row */}
                        <button
                          onClick={() => setExpandedAction(isExpanded ? null : action.id)}
                          className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${isCompleted ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'bg-white/5 hover:bg-white/[0.08]'}`}
                        >
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 ${isCompleted ? 'bg-emerald-500 text-black' : 'bg-emerald-500/10 text-emerald-500'}`}>
                            <IconComponent name={action.icon} className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-bold text-white truncate">{action.title}</h3>
                            {isCompleted && (
                              <p className="text-[10px] text-emerald-500/70">Completed — pending manager confirmation</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isCompleted && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                            {isExpanded ? <ChevronLeft size={14} className="text-gray-500 rotate-90" /> : <ChevronRight size={14} className="text-gray-500 -rotate-90" />}
                          </div>
                        </button>

                        {/* Dropdown content — simple show/hide, no animation height issues */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-2 space-y-3 border-t border-white/5">
                            <p className="text-xs text-gray-400">{action.description}</p>
                            <div className="flex flex-col gap-2">
                              {action.url && (
                                <button
                                  onClick={() => {
                                    if (action.embed_in_portal) {
                                      setEmbeddedFormAction(action);
                                    } else {
                                      window.open(resolveUrl(action.url), action.open_in_new_tab ? "_blank" : "_self");
                                    }
                                  }}
                                  className="flex items-center justify-center gap-2 py-2 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-gray-300 transition-all"
                                >
                                  <ExternalLink size={12} />
                                  {action.embed_in_portal ? 'Open in Portal' : 'Open Task'}
                                </button>
                              )}
                              <button
                                onClick={() => !isCompleted && handleMarkComplete(action)}
                                disabled={isCompleted}
                                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
                                  isCompleted
                                    ? 'bg-emerald-500/10 text-emerald-400 cursor-default'
                                    : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
                                }`}
                              >
                                {isCompleted ? (
                                  <><Info size={12} /> Submitted — Awaiting Confirmation</>
                                ) : (
                                  <><Construction size={12} /> Mark as Complete</>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Middle Row: Performance Pulse, Assignment & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <PerformancePulseTile targetId={employee?.id || ''} />

              <div className="bg-[#0A120F] border border-white/5 rounded-3xl p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-xl font-bold text-white">My Assignment</h2>
                    <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">Current week</p>
                  </div>
                  {currentAssignment && (
                    <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-lg text-[10px] font-bold border border-emerald-500/20">
                      {new Date(currentAssignment.week_start + 'T12:00:00').toLocaleDateString()}
                    </div>
                  )}
                </div>

                {currentAssignment ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 mb-8">
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Assignment</span>
                        <p className="text-sm font-bold text-white truncate">
                          {[...new Set(currentJobsites.map(j => {
                            const group = jobsiteGroups.find(g => g.id === j.group_id);
                            return group ? group.name : j.jobsite_name;
                          }))].join(', ') || 'N/A'}
                        </p>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Customer</span>
                        <p className="text-sm font-bold text-white truncate">{currentCustomer || 'N/A'}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-32 flex items-center justify-center text-gray-600 italic border border-dashed border-white/10 rounded-2xl text-xs">No active assignment found.</div>
                )}
              </div>

              <div className="bg-[#0A120F] border border-white/5 rounded-3xl p-8">
                <h2 className="text-xl font-bold text-white mb-2">Quick Actions</h2>
                <p className="text-[10px] text-gray-500 mb-8 uppercase tracking-wider">Common requests</p>
                <div className="space-y-4">
                  <button onClick={() => setIsRequestModalOpen(true)} className="w-full p-4 bg-white/5 hover:bg-emerald-500 hover:text-black rounded-2xl border border-white/5 flex items-center justify-between transition-all group">
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-500 group-hover:text-black"><Calendar size={16} /></span>
                      <span className="text-xs font-bold">Schedule Change Request</span>
                    </div>
                    <Plus size={16} className="opacity-50" />
                  </button>
                  <SurveyInitiator userId={employee?.id || ''} email={employee?.email || ''} userRole={employee?.role || 'bess_tech'} />
                </div>
              </div>
            </div>

            {/* Jobsite Info Cards */}
            {groupJobsites.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="grid grid-cols-1 gap-6"
              >
                {groupJobsites.map((jobsite) => (
                  <JobsiteInfoCard key={jobsite.id} jobsite={jobsite} title={`Jobsite Details: ${jobsite.jobsite_name}`} />
                ))}
              </motion.div>
            )}

            {/* Timeline Section */}
            <div className="bg-[#0A120F] border border-white/5 rounded-3xl p-8">
              {(() => {
                const allWeeks = [
                  ...(currentAssignment ? [currentAssignment] : []),
                  ...upcomingAssignments.filter(a => a.id !== currentAssignment?.id)
                ];
                const visibleWeeks = allWeeks.slice(timelineIndex, timelineIndex + 6);
                return (
                  <>
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h2 className="text-2xl font-bold text-white">Assignment Timeline</h2>
                        <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Rolling view</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setTimelineIndex(Math.max(0, timelineIndex - 1))} disabled={timelineIndex === 0} className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-xl transition-all"><ChevronLeft size={18} /></button>
                        <button onClick={() => setTimelineIndex(timelineIndex + 1)} disabled={timelineIndex + 6 >= allWeeks.length} className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-xl transition-all"><ChevronRight size={18} /></button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                      {visibleWeeks.map((wk) => {
                        const isCurrent = currentAssignment && wk.id === currentAssignment.id;
                      const weekDate = new Date(wk.week_start + 'T12:00:00');
                      const config = employee?.id ? rotationConfigs[employee.id] : undefined;
                      const isScheduledRotation = config ? isRotationWeek(weekDate, config) : (employee ? isRotationWeek(weekDate, employee) : false);
                      const isActuallyRotation = wk.assignment_items?.some(item => item.jobsites?.jobsite_name.toLowerCase() === 'rotation') || false;
                      const assignmentNames = wk.assignment_items?.map(item => {
                        const group = jobsiteGroups.find(g => g.id === item.jobsites?.group_id);
                        return group ? group.name : item.jobsites?.jobsite_name;
                      }) || [];
                      const assignmentName = [...new Set(assignmentNames)].join(', ') || '—';
                      const rotationConflict = isScheduledRotation !== isActuallyRotation;

                      return (
                        <div key={wk.id} className={`p-4 rounded-2xl border transition-all relative overflow-hidden ${isCurrent ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/5'}`}>
                          {isScheduledRotation && <div className="absolute top-0 right-0 px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[8px] font-bold uppercase rounded-bl-lg">Rotation</div>}
                          <p className="text-[10px] text-gray-500 font-mono mb-1">{weekDate.toLocaleDateString()}</p>
                          <p className={`text-sm font-bold truncate ${rotationConflict ? 'text-amber-400' : 'text-white'}`}>{assignmentName}</p>
                          <div className="flex items-center justify-between mt-2">
                            <p className="text-[10px] text-gray-500">{isCurrent ? 'Current' : 'Scheduled'}</p>
                            {rotationConflict && <AlertTriangle size={10} className="text-amber-400" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
          </motion.div>
        )}

        {activeTab === 'chat' && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="h-[calc(100vh-12rem)]"
          >
            <Chat 
              jobsiteId={groupJobsites[0]?.id} 
              jobsiteGroup={groupJobsites[0]?.jobsite_group} 
              jobsiteName={groupJobsites[0]?.jobsite_group || groupJobsites[0]?.jobsite_name}
              jobsiteGroupName={jobsiteGroups.find(g => g.id === groupJobsites[0]?.group_id)?.name || groupJobsites[0]?.jobsite_group || groupJobsites[0]?.jobsite_name}
            />
          </motion.div>
        )}

        {activeTab === 'map' && (
          <motion.div key="map" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
            <MapPortal jobsites={filteredJobsites} jobsiteGroups={jobsiteGroups} />
          </motion.div>
        )}

        {activeTab === 'surveys' && (
          <motion.div key="surveys" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <SurveyReviewTab userRole="employee" userId={employee?.id || ''} />
          </motion.div>
        )}

        {activeTab === 'links' && (
          <motion.div key="links" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-4xl font-bold text-white">GreEnergy Links</h2>
                <p className="text-gray-500 mt-2">Company forms, documents, and employee resources</p>
              </div>
              <div className="relative max-w-md w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                <input type="text" placeholder="Search resources..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-emerald-500 transition-all" />
              </div>
            </div>

            <div className="space-y-12">
              {Array.from(new Set(portalActions.map(a => a.category))).map(category => {
                const categoryLinks = portalActions.filter(a => 
                  a.category === category && 
                  (a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                   a.description.toLowerCase().includes(searchQuery.toLowerCase()))
                );

                if (categoryLinks.length === 0) return null;

                return (
                  <div key={category} className="space-y-6">
                    <div className="flex items-center gap-4">
                      <h3 className="text-xs font-bold text-emerald-500 uppercase tracking-widest">{category}</h3>
                      <div className="h-px flex-1 bg-emerald-500/10" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {categoryLinks.map((link) => (
                        <motion.button 
                          key={link.id} 
                          onClick={() => {
                            if (link.embed_in_portal) {
                              setEmbeddedFormAction(link);
                            } else {
                              window.open(resolveUrl(link.url), link.open_in_new_tab ? "_blank" : "_self");
                            }
                          }}
                          whileHover={{ y: -4 }} 
                          className="bg-[#0A120F] border border-white/5 p-6 rounded-3xl hover:border-emerald-500/30 transition-all group text-left w-full"
                        >
                          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-6 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                            <IconComponent name={link.icon} className="w-6 h-6" />
                          </div>
                          <h4 className="text-lg font-bold text-white mb-2 group-hover:text-emerald-500 transition-colors">{link.title}</h4>
                          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{link.description}</p>
                        </motion.button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Request Modal */}
      <AnimatePresence>
        {isRequestModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsRequestModalOpen(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="relative w-full max-w-lg bg-[#0A120F] border border-white/10 rounded-3xl p-8 shadow-2xl">
              <RequestForm onSuccess={() => setIsRequestModalOpen(false)} />
              <button onClick={() => setIsRequestModalOpen(false)} className="mt-4 w-full py-4 bg-white/5 text-white font-bold rounded-2xl transition-all">Cancel</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>      {/* Embedded Form Modal */}
      <AnimatePresence>
        {embeddedFormAction && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-0 sm:p-4 md:p-8">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setEmbeddedFormAction(null)} 
              className="absolute inset-0 bg-black/90 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }} 
              className="relative w-full h-full sm:h-auto sm:max-h-[90vh] max-w-6xl bg-[#0A120F] border border-white/10 rounded-none sm:rounded-[2rem] overflow-hidden shadow-2xl flex flex-col"
            >
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500">
                    <IconComponent name={embeddedFormAction.icon} className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-lg font-bold text-white truncate max-w-[200px] sm:max-w-none">{embeddedFormAction.title}</h3>
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Embedded Form View</p>
                  </div>
                </div>
                <button 
                  onClick={() => setEmbeddedFormAction(null)}
                  className="p-2 hover:bg-white/5 rounded-xl text-gray-500 hover:text-white transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 bg-white relative">
                <iframe 
                  src={resolveUrl(embeddedFormAction.url)} 
                  className="w-full h-full border-none"
                  title={embeddedFormAction.title}
                />
              </div>
              <div className="p-4 border-t border-white/5 bg-white/[0.02] flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest italic text-center sm:text-left">
                  Note: Data entered here is submitted directly to the form provider.
                </p>
                <button 
                  onClick={() => {
                    handleMarkComplete(embeddedFormAction);
                    setEmbeddedFormAction(null);
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold rounded-xl transition-all shadow-lg shadow-emerald-500/20"
                >
                  Mark Task as Finished
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PortalLayout>
  );
}
