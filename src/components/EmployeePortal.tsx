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
  MessageSquare,
  LayoutGrid,
  MapPin,
  ClipboardList
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Announcement, AssignmentWeek, AssignmentItem, PortalAction, Jobsite, RotationConfig, JobsiteGroup } from '../types';
import { isRotationWeek } from '../utils/rotation';
import { IconComponent } from './PortalComponents';
import PortalLayout from './PortalLayout';
import MapPortal from './MapPortal';
import JobsiteInfoCard from './JobsiteInfoCard';
import Chat from './Chat';
import { useNotifications } from './NotificationToast';
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

import { DashboardSkeleton } from './DashboardSkeleton';
import { haptics } from '../services/hapticsService';

export default function EmployeePortal() {
  const { employee, user } = useAuth();
  const { showNotification } = useNotifications();
  
  useEffect(() => {
    console.log('EmployeePortal: employee object:', employee);
    if (employee) {
      showNotification(
        `Welcome back, ${employee.first_name}!`,
        `You have ${portalActions.filter(a => a.priority === 'high').length} urgent tasks to complete this week.`,
        'info'
      );
    }
  }, [employee?.id]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'links' | 'map' | 'chat' | 'surveys'>('dashboard');
  const [loading, setLoading] = useState(true);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutGrid size={18} /> },
    { id: 'chat', label: 'Crew Chat', icon: <MessageSquare size={18} /> },
    { id: 'map', label: 'Site Map', icon: <MapPin size={18} /> },
    { id: 'surveys', label: 'Surveys', icon: <ClipboardList size={18} /> },
    { id: 'links', label: 'Resources', icon: <ExternalLink size={18} /> },
  ];
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data states
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<AssignmentWeek | null>(null);
  const [upcomingAssignments, setUpcomingAssignments] = useState<AssignmentWeek[]>([]);
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentWeek[]>([]);
  const [assignmentItems, setAssignmentItems] = useState<AssignmentItem[]>([]);
  const [portalActions, setPortalActions] = useState<PortalAction[]>([]);
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
      .replace(/{{current_site}}/g, encodeURIComponent(currentAssignment?.assignment_name || ''))
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
          supabase.from('portal_action_completions').select('action_id').eq('employee_id', employee.id)
        );
      } else {
        console.log('No employee object available, skipping assignment data fetch.');
      }

      const results = await Promise.all(queries);
      
      const annRes = results[0];
      const actionsRes = results[1];
      const sitesRes = results[2];
      const groupRes = results[3];
      const rotRes = results[4];

      if (annRes.error) console.error('Error fetching announcements:', annRes.error);
      if (actionsRes.error) console.error('Error fetching portal actions:', actionsRes.error);
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

      if (employee && results.length > 4) {
        const assignRes = results[5];
        const itemsRes = results[6];
        const reqRes = results[7];
        const actRes = results[8];
        const completionsRes = results[9];

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
        if (completionsRes?.data) setMyCompletions(completionsRes.data.map((c: any) => c.action_id));
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
    return upcomingAssignments.find(a => a.assignment_name !== currentAssignment.assignment_name) || null;
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
    try {
      const { error } = await supabase.from('portal_action_completions').insert({
        action_id: action.id,
        employee_id: employee.id,  // UUID, not employee_id_ref
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

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const rotationProgress = useMemo(() => {
    if (!employee || !rotationConfigs[employee.id]) return 0;
    const config = rotationConfigs[employee.id];
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    
    // Simple logic: if rotation week, progress is 100%, else 0% for now
    // In a real app, we'd calculate days into the rotation cycle
    return isRotationWeek(weekStart, config) ? 100 : 0;
  }, [employee, rotationConfigs]);

  if (loading && !employee) {
    return (
      <PortalLayout 
        title="BESS Tech" 
        tabs={tabs} 
        activeTab={activeTab} 
        onTabChange={setActiveTab}
      >
        <DashboardSkeleton />
      </PortalLayout>
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
            className="space-y-6"
          >
            {/* Native-style Header */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight">{greeting}, {employee?.first_name || 'Tech'}</h1>
                <p className="text-emerald-500 font-bold text-[10px] uppercase tracking-[0.2em] mt-1">⚡️ GreEnergy Resources Portal</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-black text-lg">
                {employee?.first_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
              </div>
            </div>

            {/* Bento Grid Layout */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              
              {/* Featured Tile: Current Assignment */}
              <motion.div 
                whileTap={{ scale: 0.97 }}
                className="col-span-2 row-span-2 bg-emerald-500 rounded-[32px] p-6 text-black flex flex-col justify-between shadow-xl shadow-emerald-500/20 relative overflow-hidden group"
              >
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                  <Construction size={120} />
                </div>
                
                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 bg-black rounded-full animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Active Assignment</span>
                  </div>
                  <h2 className="text-3xl font-black leading-tight truncate">
                    {[...new Set(currentJobsites.map(j => {
                      const group = jobsiteGroups.find(g => g.id === j.group_id);
                      return group ? group.name : j.jobsite_name;
                    }))].join(', ') || 'Standby'}
                  </h2>
                  <p className="text-sm font-bold opacity-70 mt-1">{currentCustomer || 'GreEnergy Resources'}</p>
                </div>

                <div className="relative z-10 mt-8">
                  <div className="flex items-center justify-between border-t border-black/10 pt-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-50">Week Start</p>
                      <p className="text-sm font-bold">{currentAssignment ? format(new Date(currentAssignment.week_start + 'T12:00:00'), 'MMM dd, yyyy') : '—'}</p>
                    </div>
                    <div className="bg-black/10 px-4 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest">
                      Details
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Crew Chat Tile */}
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  haptics.impact();
                  setActiveTab('chat');
                }}
                className="bg-[#0A120F] rounded-[32px] p-6 border border-white/5 flex flex-col items-center justify-center gap-3 group hover:border-emerald-500/30 transition-all"
              >
                <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                  <MessageSquare size={24} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Crew Chat</span>
              </motion.button>

              {/* Performance Pulse Tile */}
              <motion.div
                whileTap={{ scale: 0.95 }}
                className="bg-[#0A120F] rounded-[32px] p-6 border border-white/5 flex flex-col items-center justify-center gap-3"
              >
                <div className="text-3xl font-black text-emerald-500">98</div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 text-center leading-tight">Safety Score</span>
              </motion.div>

              {/* Rotation Progress Tile (Wide) */}
              <motion.div
                whileTap={{ scale: 0.98 }}
                className="col-span-2 bg-[#0A120F] rounded-[32px] p-6 border border-white/5 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Rotation Cycle</span>
                  <span className="text-[10px] font-bold text-emerald-500">{rotationProgress}%</span>
                </div>
                <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${rotationProgress}%` }}
                    className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                  />
                </div>
                <div className="flex justify-between mt-3">
                  <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">On-Site</span>
                  <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">Rotation</span>
                </div>
              </motion.div>

              {/* Required Actions Tile */}
              <div className="col-span-2 bg-[#0A120F] rounded-[32px] p-6 border border-white/5">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold text-white">Required Tasks</h2>
                  <span className="px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-[9px] font-black uppercase tracking-widest">
                    {portalActions.filter(a => a.priority === 'high').length} Urgent
                  </span>
                </div>
                <div className="space-y-3">
                  {portalActions.filter(a => a.priority === 'high').slice(0, 2).map(action => {
                    const isCompleted = myCompletions.includes(action.id);
                    return (
                      <button
                        key={action.id}
                        onClick={() => {
                          haptics.impact();
                          setExpandedAction(expandedAction === action.id ? null : action.id);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all active-scale ${isCompleted ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/5 border-white/5'}`}
                      >
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isCompleted ? 'bg-emerald-500 text-black' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          <IconComponent name={action.icon} className="w-4 h-4" />
                        </div>
                        <span className="text-xs font-bold text-white truncate flex-1 text-left">{action.title}</span>
                        {isCompleted ? <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> : <ChevronRight size={14} className="text-gray-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Actions Tile */}
              <div className="col-span-2 bg-[#0A120F] rounded-[32px] p-6 border border-white/5">
                <h2 className="text-lg font-bold text-white mb-6">Quick Requests</h2>
                <div className="grid grid-cols-2 gap-3">
                  <motion.button 
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      haptics.impact();
                      setIsRequestModalOpen(true);
                    }}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-all"
                  >
                    <Calendar size={20} className="text-emerald-500" />
                    <span className="text-[10px] font-bold text-gray-400">Schedule</span>
                  </motion.button>
                  <SurveyInitiator userId={employee?.id || ''} email={employee?.email || ''} userRole={employee?.role || 'bess_tech'} />
                </div>
              </div>

            </div>

            {/* Announcements Section - Native Style */}
            {announcements.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em] px-2">Company News</h3>
                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide px-2">
                  {announcements.map(ann => (
                    <div key={ann.id} className="min-w-[280px] bg-[#0A120F] border border-white/5 rounded-[28px] p-5 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${ann.level === 'high' ? 'bg-red-500/20 text-red-500' : 'bg-emerald-500/20 text-emerald-500'}`}>
                          {ann.level === 'high' ? 'Urgent' : 'Update'}
                        </span>
                        <span className="text-[9px] font-bold text-gray-600">{format(new Date(ann.start_date + 'T12:00:00'), 'MMM dd')}</span>
                      </div>
                      <h4 className="text-sm font-bold text-white">{ann.title}</h4>
                      <p className="text-xs text-gray-500 line-clamp-2">{ann.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline Section - Native Style */}
            <div className="bg-[#0A120F] border border-white/5 rounded-[32px] p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white">Rotation Timeline</h2>
                <div className="flex gap-2">
                  <button onClick={() => setTimelineIndex(Math.max(0, timelineIndex - 1))} disabled={timelineIndex === 0} className="p-2 bg-white/5 rounded-xl disabled:opacity-20"><ChevronLeft size={16} /></button>
                  <button onClick={() => setTimelineIndex(timelineIndex + 1)} className="p-2 bg-white/5 rounded-xl"><ChevronRight size={16} /></button>
                </div>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {(() => {
                  const allWeeks = [
                    ...(currentAssignment ? [currentAssignment] : []),
                    ...upcomingAssignments.filter(a => a.id !== currentAssignment?.id)
                  ];
                  return allWeeks.slice(timelineIndex, timelineIndex + 8).map((wk) => {
                    const isCurrent = currentAssignment && wk.id === currentAssignment.id;
                    const weekDate = new Date(wk.week_start + 'T12:00:00');
                    const config = employee?.id ? rotationConfigs[employee.id] : undefined;
                    const isScheduledRotation = config ? isRotationWeek(weekDate, config) : (employee ? isRotationWeek(weekDate, employee) : false);
                    
                    return (
                      <div key={wk.id} className={`min-w-[100px] p-3 rounded-2xl border transition-all ${isCurrent ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/5'}`}>
                        <p className="text-[9px] font-black text-gray-600 uppercase mb-1">{format(weekDate, 'MMM dd')}</p>
                        <div className={`w-full h-1 rounded-full mb-2 ${isScheduledRotation ? 'bg-purple-500/40' : 'bg-emerald-500/40'}`} />
                        <p className="text-[10px] font-bold text-white truncate">
                          {isScheduledRotation ? 'Rotation' : (wk.assignment_name || 'Standby')}
                        </p>
                      </div>
                    );
                  });
                })()}
              </div>
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
