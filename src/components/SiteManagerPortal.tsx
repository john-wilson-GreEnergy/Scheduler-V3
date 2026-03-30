
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { assignmentService } from '../services/assignmentService';
import { useAuth } from '../contexts/AuthContext';
import {
  RefreshCw, MapPin, Users, Calendar, ClipboardList,
  CheckCircle2, XCircle, Clock, ChevronRight, Phone,
  Mail, AlertTriangle, Construction, BarChart3, Info,
  Search, Filter, Building2, UserCheck, UserX, Layers,
  MessageSquare, X, ExternalLink, Plus, ChevronLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Employee, Jobsite, PortalRequest, PortalAction, Announcement, AssignmentWeek, AssignmentItem, RotationConfig, JobsiteGroup } from '../types';
import { logActivity } from '../lib/logger';
import PortalLayout from './PortalLayout';
import MapPortal from './MapPortal';
import JobsiteInfoCard from './JobsiteInfoCard';
import WeatherWidget from './WeatherWidget';
import RotationPreview from './RotationPreview';
import ActivityFeed from './ActivityFeed';
import Chat from './Chat';
import { SurveyReviewTab } from './SurveyReviewTab';
import { PerformancePulseTile } from './PerformancePulseTile';
import { SurveyModal } from './SurveyModal';
import { SurveyInitiator } from './SurveyInitiator';
import { TargetSelectionModal } from './TargetSelectionModal';
import { AssignmentImporter } from './AssignmentImporter';
import { IconComponent } from './PortalComponents';
import { PromotionReadinessTab } from './PromotionReadinessTab';
import { Award } from 'lucide-react';
import { isScheduledActive } from '../utils/portal';
import { format, startOfWeek, addWeeks, parseISO } from 'date-fns';
import { parseAssignmentNames } from '../utils/assignmentParser';
import { isRotationWeek } from '../utils/rotation';
import { submitSurvey, getSurveyQuestions } from '../services/surveyService';
import { SurveyType } from '../types/surveys';

interface SiteEmployee extends Employee {
  rotation_config?: RotationConfig;
  current_assignments?: AssignmentItem[];
  is_on_rotation?: boolean;
}


export default function SiteManagerPortal() {
  const { employee, isSiteLead } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [loading, setLoading] = useState(true);
  const [jobsite, setJobsite] = useState<Jobsite | null>(null);
  const [siteGroupName, setSiteGroupName] = useState<string>('');
  const [groupJobsites, setGroupJobsites] = useState<Jobsite[]>([]);
  const [allJobsites, setAllJobsites] = useState<Jobsite[]>([]);
  const [jobsiteGroups, setJobsiteGroups] = useState<JobsiteGroup[]>([]);
  const [siteEmployees, setSiteEmployees] = useState<SiteEmployee[]>([]);
  const [completions, setCompletions] = useState<any[]>([]);
  const [requests, setRequests] = useState<(PortalRequest & { employee?: Employee })[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [requestFilter, setRequestFilter] = useState<'all' | 'pending' | 'approved' | 'denied'>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<SiteEmployee | null>(null);
  const [matchNames, setMatchNames] = useState<string[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState<string>(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [portalActions, setPortalActions] = useState<PortalAction[]>([]);
  const [isSurveyModalOpen, setIsSurveyModalOpen] = useState(false);
  const [isTargetModalOpen, setIsTargetModalOpen] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [embeddedFormAction, setEmbeddedFormAction] = useState<PortalAction | null>(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<AssignmentWeek | null>(null);
  const [upcomingAssignments, setUpcomingAssignments] = useState<AssignmentWeek[]>([]);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [rotationConfigs, setRotationConfigs] = useState<Record<string, RotationConfig>>({});

  const PLACEHOLDER_SITES = ['Rotation', 'Vacation', 'Personal'];

  const isPlaceholderMode = useMemo(() => {
    if (!jobsite) return false;
    return PLACEHOLDER_SITES.some(s => s.toLowerCase() === jobsite.jobsite_name.toLowerCase());
  }, [jobsite]);

  const personalStatus = useMemo(() => {
    if (!currentAssignment) return null;
    const status = currentAssignment.status?.toLowerCase();
    const name = currentAssignment.assignment_name?.toLowerCase();
    const found = PLACEHOLDER_SITES.find(s => s.toLowerCase() === status || s.toLowerCase() === name);
    return found || null;
  }, [currentAssignment]);

  const canWrite = useMemo(() => {
    if (!jobsite || !jobsite.manager || !employee) return false;
    const managers = jobsite.manager.split(',').map(m => m.trim().toLowerCase());
    const fullName = `${employee.first_name} ${employee.last_name}`.toLowerCase();
    return managers.includes(fullName);
  }, [jobsite, employee]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Find the jobsite managed by this employee — try full name match first
      const fullName = `${employee?.first_name} ${employee?.last_name}`;
      const { data: managedSites } = await supabase
        .from('jobsites')
        .select('*')
        .ilike('manager', `%${fullName}%`)
        .eq('is_active', true)
        .limit(1);
      const managedSite = managedSites?.[0] || null;

      const { data: allSites } = await supabase
        .from('jobsites')
        .select('*')
        .eq('is_active', true)
        .order('jobsite_name');

      const { data: groups } = await supabase
        .from('jobsite_groups')
        .select('*');

      const { data: portalActions } = await supabase
        .from('portal_required_actions')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      const { data: greEnergyLinks } = await supabase
        .from('greenergy_links')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const { data: announcements } = await supabase
        .from('announcements')
        .select('*')
        .eq('active', true);

      const { data: recentActivity } = await supabase
        .from('recent_activity')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      setAllJobsites(allSites || []);
      setJobsiteGroups(groups || []);
      const combinedActions = [
        ...(portalActions || []).map(a => ({ ...a, type: 'required_action' })),
        ...(greEnergyLinks || []).map(l => ({ ...l, type: 'greenergy_link' }))
      ];
      
      const now = new Date();
      const filteredActions = combinedActions.filter(action => isScheduledActive(action, now));

      setPortalActions(filteredActions);
      setAnnouncements((announcements || []).filter(ann => isScheduledActive(ann, now)));
      setRecentActivity(recentActivity || []);

      let currentWithItems: any = null;
      let upcoming: any[] = [];

      if (employee) {
        const now = new Date();
        const assignments = await assignmentService.getAssignmentsByEmployeeId(employee.id);
        const { data: rotationConfigs } = await supabase
          .from('rotation_configs')
          .select('*');

        if (assignments) {
          const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
          // Prioritize exact match for current week
          const exactCurrent = assignments.find(a => a.week_start === weekStart);
          const current = exactCurrent || assignments.filter(a => new Date(a.week_start + 'T12:00:00') <= now).pop();
          upcoming = assignments.filter(a => new Date(a.week_start + 'T12:00:00') > now);
          
          // Use the joined assignment_items data
          currentWithItems = current ? {
            ...current,
            assignment_items: current.assignment_items || []
          } : null;

          setCurrentAssignment(currentWithItems);
          setUpcomingAssignments(upcoming);

          if (rotationConfigs) {
            const configMap: Record<string, RotationConfig> = {};
            rotationConfigs.forEach(config => {
              configMap[config.employee_fk] = config;
            });
            setRotationConfigs(configMap);
          }
        }
      }

      // Resolve the jobsite based on current assignment items first
      let assignmentSite: Jobsite | null = null;
      let assignedSites: Jobsite[] = [];

      if (currentWithItems?.assignment_items && currentWithItems.assignment_items.length > 0) {
        assignedSites = currentWithItems.assignment_items
          .map((item: any) => item.jobsites)
          .filter((s: any): s is Jobsite => !!s);
        
        if (assignedSites.length > 0) {
          assignmentSite = assignedSites[0];
        }
      }

      // Fallback to the old logic if no items found (e.g. legacy data or placeholder status)
      if (!assignmentSite && employee?.id) {
        const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const { data: currentAssignmentData } = await supabase
          .from('assignment_weeks')
          .select('*')
          .eq('employee_fk', employee.id)
          .eq('week_start', weekStart)
          .maybeSingle();

        console.log('SiteManagerPortal: CurrentAssignmentData (fallback):', currentAssignmentData);

        if (currentAssignmentData) {
          const assignmentNames = parseAssignmentNames(currentAssignmentData.assignment_name || '');
          const status = currentAssignmentData.status || '';
          
          assignmentSite = (allSites || []).find(
            s => assignmentNames.includes(s.jobsite_group || '') ||
                 assignmentNames.includes(s.jobsite_name || '') ||
                 s.jobsite_name.toLowerCase() === status.toLowerCase()
          ) || null;

          // Handle placeholder statuses if no jobsite matched
          if (!assignmentSite && status) {
            const isPlaceholder = PLACEHOLDER_SITES.some(p => p.toLowerCase() === status.toLowerCase());
            if (isPlaceholder) {
              assignmentSite = {
                id: 'placeholder-' + status.toLowerCase(),
                jobsite_name: status.charAt(0).toUpperCase() + status.slice(1).toLowerCase(),
                customer: 'Internal',
                is_active: true,
                full_address: 'N/A'
              } as Jobsite;
            }
          }
        }
      }

      // Priority: 1. Assignment (including placeholder), 2. Managed site, 3. First site
      const siteToUse = assignmentSite || managedSite || (allSites && allSites[0]) || null;
      const isPlaceholderAssignment = siteToUse?.id?.toString().startsWith('placeholder-') || 
                                     (siteToUse && PLACEHOLDER_SITES.some(s => s.toLowerCase() === siteToUse.jobsite_name.toLowerCase()));
      
      console.log('SiteManagerPortal: siteToUse Logic:', {
        managedSite: managedSite?.jobsite_name,
        assignmentSite: assignmentSite?.jobsite_name,
        assignedSitesCount: assignedSites.length,
        siteToUse: siteToUse?.jobsite_name
      });

      setJobsite(siteToUse);

      // Resolve the group: if the site has a jobsite_group, combine all sites in that group
      const resolvedGroupName = siteToUse?.jobsite_group || siteToUse?.jobsite_name || '';
      
      // If we have assigned sites from items, use those as the base for the group
      let resolvedGroupSites: Jobsite[] = [];
      if (assignedSites.length > 0 && !isPlaceholderAssignment) {
        // Get all group names/IDs from assigned sites
        const groupNames = new Set(assignedSites.map(s => s.jobsite_group).filter(Boolean));
        const groupIds = new Set(assignedSites.map(s => s.group_id).filter(Boolean));

        if (groupNames.size > 0 || groupIds.size > 0) {
          resolvedGroupSites = (allSites || []).filter(j => 
            (j.jobsite_group && groupNames.has(j.jobsite_group)) || 
            (j.group_id && groupIds.has(j.group_id)) ||
            assignedSites.some(as => as.id === j.id)
          );
        } else {
          resolvedGroupSites = assignedSites;
        }
      } else if (siteToUse?.jobsite_group) {
        resolvedGroupSites = (allSites || []).filter(s => s.jobsite_group === siteToUse.jobsite_group);
      } else if (siteToUse) {
        resolvedGroupSites = [siteToUse];
      }

      setSiteGroupName(resolvedGroupName);
      setGroupJobsites(resolvedGroupSites);

      if (siteToUse) {
        const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const isPlaceholder = PLACEHOLDER_SITES.some(s => s.toLowerCase() === siteToUse.jobsite_name.toLowerCase());

        // Build list of names to match against assignment_name:
        // includes the site itself, its group, and any site in the same group
        const siteGroup = siteToUse.jobsite_group;
        const groupSites = siteGroup
          ? (allSites || []).filter(s => s.jobsite_group === siteGroup)
          : [siteToUse];

        const matchNamesList = Array.from(new Set([
          siteToUse.jobsite_name,
          siteToUse.jobsite_alias,
          siteToUse.jobsite_id_ref,
          siteGroup,
          ...groupSites.map(s => s.jobsite_name),
          ...groupSites.map(s => s.jobsite_alias),
          ...groupSites.map(s => s.jobsite_id_ref),
        ].filter(Boolean) as string[]));

        setMatchNames(matchNamesList);
        setCurrentWeekStart(weekStart);

        // Get current week assignments matching this site or group
        const jobsiteIds = resolvedGroupSites.map(s => s.id);
        const { data: siteAssignments } = await supabase
          .from('assignment_weeks')
          .select(`
            *,
            assignment_items!inner(*)
          `)
          .eq('week_start', weekStart)
          .in('assignment_items.jobsite_fk', jobsiteIds);
        
        console.log('SiteAssignments:', siteAssignments);

        // Get all current week assignments for the assignment map
        const { data: allCurrentWeek } = await supabase
          .from('assignment_weeks')
          .select('*')
          .eq('week_start', weekStart);
        
        console.log('AllCurrentWeek:', allCurrentWeek);

        // Build set of employee identifiers assigned to this site/group
        const assignedRefs = new Set<string>(
          (siteAssignments || [])
            .map(aw => aw.employee_fk)
            .filter(Boolean)
        );

        // Fallback: Add employees whose assignment_name matches the site/group
        (allCurrentWeek || []).forEach(aw => {
          if (!aw.employee_fk) return;
          const names = parseAssignmentNames(aw.assignment_name || '');
          const matches = names.some(n => matchNamesList.includes(n));
          if (matches) {
            assignedRefs.add(aw.employee_fk);
          }
        });

        // Get all employees + their rotation configs
        const { data: empData } = await supabase
          .from('employees')
          .select('*')
          .eq('is_active', true)
          .order('last_name');

        const { data: rotConfigs } = await supabase
          .from('rotation_configs')
          .select('*');

        const configMap: Record<string, RotationConfig> = {};
        (rotConfigs || []).forEach(c => { configMap[c.employee_fk] = c; });

        // Map employee_fk -> assignment_week for this week
        const assignmentMap: Record<string, AssignmentWeek> = {};
        (allCurrentWeek || []).forEach(aw => {
          if (aw.employee_fk) assignmentMap[aw.employee_fk] = aw;
        });

        const enriched: SiteEmployee[] = (empData || [])
          .filter(emp => {
            // If in placeholder mode, only show the manager themselves
            if (isPlaceholder) {
              return emp.id === employee?.id;
            }
            return (assignedRefs.has(emp.id) || assignedRefs.has(emp.email)) && emp.role !== 'hr';
          })
          .map(emp => {
            const config = configMap[emp.id];
            const assignmentForWeek = assignmentMap[emp.id];
            const isOnRotation = assignmentForWeek?.status?.toLowerCase() === 'rotation';
            return {
              ...emp,
              rotation_config: config || null,
              current_assignments:
                assignmentForWeek?.assignment_items ||
                [],
              is_on_rotation: isOnRotation,
            };
          });

        setSiteEmployees(enriched);



        // Get requests for employees on this site
        if (enriched.length > 0) {
          const empIds = enriched.map(e => e.id);
          const { data: reqData } = await supabase
            .from('portal_requests')
            .select('*, employee:employees(*)')
            .in('employee_fk', empIds)
            .order('created_at', { ascending: false });
          setRequests(reqData || []);

          // Fetch action completions for site employees
          const { data: compData } = await supabase
            .from('portal_action_completions')
            .select('*, action:portal_required_actions(title, description, icon), employee:employees!employee_id(first_name, last_name, email, job_title), confirmer:employees!confirmed_by(first_name, last_name)')
            .in('employee_id', empIds)
            .order('completed_at', { ascending: false });
          setCompletions(compData || []);
        }
      }
    } catch (err) {
      console.error('SiteManagerPortal fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employee) fetchData();
  }, [employee]);

  const handleRequestAction = async (request: PortalRequest, action: 'approved' | 'denied') => {
    setProcessingId(request.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: admin } = await supabase
        .from('employees')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      await supabase
        .from('portal_requests')
        .update({ status: action, approver_fk: admin?.id, approved_at: new Date().toISOString() })
        .eq('id', request.id);

      setRequests(prev => prev.map(r => r.id === request.id ? { ...r, status: action } : r));
    } catch (err) {
      console.error('Error updating request:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredRequests = requests.filter(r => {
    if (requestFilter !== 'all' && r.status !== requestFilter) return false;
    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const activeCount = siteEmployees.filter(e => !e.is_on_rotation).length;
  const onRotationCount = siteEmployees.filter(e => e.is_on_rotation).length;
  const pendingCompletions = completions.filter(c => !c.confirmed_at).length;

  const tabs = useMemo(() => {
    const allTabs = [
      { id: 'overview', label: 'Overview', icon: <BarChart3 size={16} />, category: 'Site' },
      { id: 'chat', label: 'Crew Chat', icon: <MessageSquare size={16} />, category: 'Site' },
      { id: 'jobsite-info', label: 'Jobsite', icon: <Info size={16} />, category: 'Site' },
      { id: 'roster', label: 'Roster', icon: <Users size={16} />, category: 'Site' },
      { id: 'schedule', label: 'Schedule', icon: <Calendar size={16} />, category: 'Site' },
      { id: 'surveys', label: 'Surveys', icon: <MessageSquare size={16} />, category: 'Management' },
      { id: 'readiness', label: 'Promotion Readiness', icon: <Award size={16} />, category: 'Management' },
      { id: 'requests', label: `Requests${pendingCount > 0 ? ` (${pendingCount})` : ''}`, icon: <ClipboardList size={16} />, category: 'Management' },
      { id: 'actions', label: 'GreEnergy Links', icon: <Layers size={16} />, category: 'Management' },
      { id: 'completions', label: `Action Completions${pendingCompletions > 0 ? ` (${pendingCompletions})` : ''}`, icon: <CheckCircle2 size={16} />, category: 'Management' },
      { id: 'importer', label: 'Assignment Importer', icon: <ClipboardList size={16} />, category: 'Management' },
      { id: 'map', label: 'Map', icon: <MapPin size={16} />, category: 'Management' },
    ];

    if (isPlaceholderMode) {
      // Only show personal/management tabs when on rotation/vacation/personal
      return allTabs.filter(t => ['overview', 'requests', 'actions', 'completions'].includes(t.id));
    }

    return allTabs;
  }, [isPlaceholderMode, pendingCount, pendingCompletions]);

  const handleMarkComplete = async (action: PortalAction) => {
    if (!employee) return;
    try {
      await supabase
        .from('portal_action_completions')
        .insert({
          action_id: action.id,
          email: employee.email,
          employee_id: employee.id,
          completed_at: new Date().toISOString()
        });
      setCompletions(prev => [...prev, { action_id: action.id, email: employee.email, employee_id: employee.id, completed_at: new Date().toISOString(), action }]);
    } catch (err) {
      console.error('Error marking complete:', err);
    }
  };

  const resolveUrl = (url: string) => {
    if (!employee || !url) return url;
    return url
      .replace(/{{email}}/g, encodeURIComponent(employee.email))
      .replace(/{{first_name}}/g, encodeURIComponent(employee.first_name))
      .replace(/{{last_name}}/g, encodeURIComponent(employee.last_name))
      .replace(/{{employee_id}}/g, encodeURIComponent(employee.employee_id_ref))
      .replace(/{{current_site}}/g, encodeURIComponent(jobsite?.jobsite_name || ''))
      .replace(/{{current_customer}}/g, encodeURIComponent(jobsite?.customer || ''))
      .replace(/{{id}}/g, encodeURIComponent(employee.id));
  };

  const seedTestData = async () => {
    if (!employee) return;
    try {
      const surveyType: SurveyType = 'tech_eval_manager';
      const questions = await getSurveyQuestions(surveyType);
      const scores: Record<string, number> = {};
      questions.forEach(q => scores[q.id] = Math.floor(Math.random() * 5) + 1);
      
      await submitSurvey(
        employee.id,
        employee.id,
        surveyType,
        currentWeekStart,
        JSON.stringify(scores), // Pass as string if backend expects JSON string
        { well: 'Test', improve: 'Test', notes: 'Test' }
      );
      alert('Test survey submitted!');
      fetchData();
    } catch (err: any) {
      console.error('Error seeding test data:', err);
      alert(`Error seeding test data: ${err.message || 'Unknown error'}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050A08] flex items-center justify-center">
        <RefreshCw className="text-emerald-500 animate-spin" size={32} />
      </div>
    );
  }

  return (
    <PortalLayout
      title={siteGroupName ? `Site Manager — ${siteGroupName}` : 'Site Manager'}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onRefresh={fetchData}
    >
      <AnimatePresence>

        {/* ── PERSONAL STATUS BANNER ── */}
        {personalStatus && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-6 p-4 rounded-2xl border flex items-center justify-between ${
              personalStatus.toLowerCase() === 'rotation' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
              personalStatus.toLowerCase() === 'vacation' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
              'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                personalStatus.toLowerCase() === 'rotation' ? 'bg-purple-500/20' :
                personalStatus.toLowerCase() === 'vacation' ? 'bg-blue-500/20' :
                'bg-amber-500/20'
              }`}>
                {personalStatus.toLowerCase() === 'rotation' ? <RefreshCw size={20} /> :
                 personalStatus.toLowerCase() === 'vacation' ? <Calendar size={20} /> :
                 <Clock size={20} />}
              </div>
              <div>
                <p className="text-sm font-bold">You are currently on {personalStatus}</p>
                <p className="text-[10px] opacity-70 uppercase tracking-wider">Week of {currentWeekStart}</p>
              </div>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 bg-white/5 rounded-full">
              Personal Dashboard Mode
            </div>
          </motion.div>
        )}

        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">

            {/* Weather at the top */}
            {jobsite?.lat && jobsite?.lng && !isPlaceholderMode && (
              <WeatherWidget lat={jobsite.lat} lng={jobsite.lng} locationName={jobsite.jobsite_name} />
            )}

            {/* KPI strip */}
            {!isPlaceholderMode ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Assigned', value: siteEmployees.length, icon: <Users size={20} />, color: 'emerald' },
                  { label: 'Active on Site', value: activeCount, icon: <UserCheck size={20} />, color: 'emerald' },
                  { label: 'On Rotation', value: onRotationCount, icon: <RefreshCw size={20} />, color: 'purple' },
                  { label: 'Open Requests', value: pendingCount, icon: <ClipboardList size={20} />, color: pendingCount > 0 ? 'amber' : 'emerald' },
                ].map((kpi, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                    className="bg-[#0A120F] border border-white/5 rounded-2xl p-6">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${
                      kpi.color === 'amber' ? 'bg-amber-500/10 text-amber-400' :
                      kpi.color === 'purple' ? 'bg-purple-500/10 text-purple-400' :
                      'bg-emerald-500/10 text-emerald-500'
                    }`}>
                      {kpi.icon}
                    </div>
                    <p className="text-3xl font-bold text-white">{kpi.value}</p>
                    <p className="text-xs text-gray-500 mt-1 uppercase tracking-widest font-bold">{kpi.label}</p>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-[#0A120F] border border-white/5 rounded-3xl p-8">
                  <h3 className="text-xl font-bold text-white mb-4">Personal Dashboard</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    You are currently on <span className="text-emerald-500 font-bold">{personalStatus}</span>. 
                    Your jobsite management tools are restricted during this period.
                  </p>
                </div>
                <div className="bg-[#0A120F] border border-white/5 rounded-3xl p-8">
                  <h3 className="text-xl font-bold text-white mb-4">Quick Links</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setActiveTab('requests')} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-center transition-all">
                      <ClipboardList className="mx-auto mb-2 text-emerald-500" size={20} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Requests</span>
                    </button>
                    <button onClick={() => setActiveTab('actions')} className="p-4 bg-white/5 hover:bg-white/10 rounded-2xl text-center transition-all">
                      <Layers className="mx-auto mb-2 text-emerald-500" size={20} />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Links</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Today at GreEnergy & Required Actions */}
            {!isPlaceholderMode && (
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
                          {recentActivity.map(act => (
                            <div key={act.id} className="flex items-center gap-3 text-xs">
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                              <span className="text-gray-400">{act.event_type.replace('_', ' ')}</span>
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
                      {portalActions.filter(a => a.type === 'required_action').length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {portalActions.filter(a => a.type === 'required_action').map(action => {
                      const isCompleted = completions.some(c => c.action_id === action.id && c.employee_id === employee?.id);
                      return (
                        <div key={action.id} className={`border rounded-2xl overflow-hidden transition-all ${isCompleted ? 'border-emerald-500/20' : 'border-white/5'}`}>
                          <button
                            onClick={() => {
                              if (action.embed_in_portal) {
                                setEmbeddedFormAction(action);
                              } else {
                                window.open(resolveUrl(action.url), action.open_in_new_tab ? "_blank" : "_self");
                              }
                            }}
                            className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${isCompleted ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'bg-white/5 hover:bg-white/[0.08]'}`}
                          >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shrink-0 ${isCompleted ? 'bg-emerald-500 text-black' : 'bg-emerald-500/10 text-emerald-500'}`}>
                              <IconComponent name={action.icon} className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-bold text-white truncate">{action.title}</h3>
                            </div>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

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
                        {[...new Set(currentAssignment?.assignment_items?.map(item => {
                          const group = jobsiteGroups.find(g => g.id === item.jobsites?.group_id);
                          return group ? group.name : item.jobsites?.jobsite_name;
                        }) || [])].join(', ') || 'N/A'}
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                        <span className="text-[10px] uppercase font-bold text-gray-500 block mb-1">Customer</span>
                        {[...new Set(currentAssignment?.assignment_items?.map(item => item.jobsites?.customer || 'N/A') || [])].join(', ') || 'N/A'}
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
                  <SurveyInitiator 
                    userId={employee?.id || ''} 
                    email={employee?.email || ''} 
                    userRole={employee?.role || 'site_manager'} 
                    jobsiteGroup={jobsite?.jobsite_group || undefined}
                    weekStartDate={currentWeekStart}
                  />
                  <button onClick={seedTestData} className="w-full p-4 bg-white/5 hover:bg-emerald-500 hover:text-black rounded-2xl border border-white/5 flex items-center justify-between transition-all group">
                    <div className="flex items-center gap-3">
                      <span className="text-emerald-500 group-hover:text-black"><ClipboardList size={16} /></span>
                      <span className="text-xs font-bold">Seed Test Data</span>
                    </div>
                    <Plus size={16} className="opacity-50" />
                  </button>
                </div>
              </div>
            </div>
            {/* Jobsite Info Card & Assignment Timeline */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                {groupJobsites.length > 0 && !isPlaceholderMode && groupJobsites.map(js => {
                  const siteManager = siteEmployees.find(m => m.role?.toLowerCase().includes('manager') && m.current_assignments?.some(a => a.jobsite_fk === js.id));
                  return (
                    <JobsiteInfoCard 
                      key={js.id} 
                      jobsite={js} 
                      currentManager={siteManager ? `${siteManager.first_name} ${siteManager.last_name}` : undefined}
                    />
                  );
                })}
              </div>
              <div className={`${isPlaceholderMode ? 'lg:col-span-2' : ''} bg-[#0A120F] border border-white/5 rounded-3xl p-8`}>
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-white">Assignment Timeline</h2>
                    <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Rolling view</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setTimelineIndex(Math.max(0, timelineIndex - 1))} disabled={timelineIndex === 0} className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-xl transition-all"><ChevronLeft size={18} /></button>
                    <button onClick={() => setTimelineIndex(timelineIndex + 1)} disabled={timelineIndex + 6 >= (currentAssignment ? 1 : 0) + upcomingAssignments.length} className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-xl transition-all"><ChevronRight size={18} /></button>
                  </div>
                </div>
                
                {(() => {
                  // Show current week + upcoming only, already in ascending order
                  const allWeeks = [...(currentAssignment ? [currentAssignment] : []), ...upcomingAssignments];
                  const visibleWeeks = allWeeks.slice(timelineIndex, timelineIndex + 6);
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                      {visibleWeeks.map((wk, index) => {
                        const isCurrent = currentAssignment && wk.id === currentAssignment.id;
                        const weekDate = new Date(wk.week_start + 'T12:00:00');
                        const emp = siteEmployees.find(e => e.id === wk.employee_fk);
                        const config = emp?.rotation_config;
                        const isScheduledRotation = config ? isRotationWeek(weekDate, config) : (emp ? isRotationWeek(weekDate, emp) : false);
                        const isActuallyRotation = wk.status?.toLowerCase() === 'rotation';
                        const assignmentNames = wk.assignment_items?.map(item => {
                          const group = jobsiteGroups.find(g => g.id === item.jobsites?.group_id);
                          return group ? group.name : item.jobsites?.jobsite_name;
                        }) || [];
                        const assignmentName = [...new Set(assignmentNames)].join(', ') || '—';
                        const rotationConflict = isScheduledRotation !== isActuallyRotation;

                        return (
                          <div key={`${wk.id}-${wk.week_start}-${index}`} className={`p-4 rounded-2xl border transition-all relative overflow-hidden ${isCurrent ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/5'}`}>
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
                  );
                })()}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── ROSTER ── */}
        {activeTab === 'roster' && (
          <motion.div key="roster" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500/50 transition-colors"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {siteEmployees
                .filter(emp =>
                  `${emp.first_name} ${emp.last_name} ${emp.job_title}`.toLowerCase().includes(searchQuery.toLowerCase())
                )
                .map(emp => (
                  <motion.div
                    key={emp.id}
                    layoutId={`emp-${emp.id}`}
                    onClick={() => setSelectedEmployee(emp === selectedEmployee ? null : emp)}
                    className={`bg-[#0A120F] border rounded-2xl p-5 cursor-pointer transition-all ${
                      selectedEmployee?.id === emp.id
                        ? 'border-emerald-500/30 shadow-lg shadow-emerald-500/5'
                        : 'border-white/5 hover:border-white/10'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${
                        emp.is_on_rotation ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-500'
                      }`}>
                        {emp.first_name[0]}{emp.last_name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-white">{emp.first_name} {emp.last_name}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            emp.is_on_rotation
                              ? 'bg-purple-500/10 text-purple-400'
                              : 'bg-emerald-500/10 text-emerald-500'
                          }`}>
                            {emp.is_on_rotation ? 'On Rotation' : 'Active'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{emp.job_title}</p>
                        <p className="text-xs text-gray-600 mt-1 font-mono">{emp.email}</p>
                      </div>
                    </div>

                    <AnimatePresence>
                      {selectedEmployee?.id === emp.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Current Assignment</p>
                              <p className="text-sm text-white mt-1">{emp.current_assignment}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Rotation Group</p>
                              <p className="text-sm text-white mt-1">{emp.rotation_group || 'N/A'}</p>
                            </div>
                            {emp.rotation_config && (
                              <>
                                <div>
                                  <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Weeks On</p>
                                  <p className="text-sm text-white mt-1">{emp.rotation_config.weeks_on}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Weeks Off</p>
                                  <p className="text-sm text-white mt-1">{emp.rotation_config.weeks_off}</p>
                                </div>
                              </>
                            )}
                            <div className="col-span-2">
                              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold">Employee ID</p>
                              <p className="text-sm text-white font-mono mt-1">{emp.employee_id_ref}</p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              {siteEmployees.length === 0 && (
                <div className="col-span-2 py-16 text-center text-gray-600 italic border border-dashed border-white/10 rounded-2xl">
                  No employees assigned to this site this week.
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── SCHEDULE ── */}
        {activeTab === 'schedule' && (
          <ScheduleTab jobsite={jobsite} allJobsites={allJobsites} siteEmployees={siteEmployees} />
        )}

        {activeTab === 'completions' && (
          <motion.div key="completions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-5">
                <p className="text-[10px] uppercase font-bold text-gray-500 mb-1">Total Submissions</p>
                <p className="text-3xl font-bold text-white">{completions.length}</p>
              </div>
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                <p className="text-[10px] uppercase font-bold text-amber-500/70 mb-1">Pending Review</p>
                <p className="text-3xl font-bold text-amber-400">{pendingCompletions}</p>
              </div>
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
                <p className="text-[10px] uppercase font-bold text-emerald-500/70 mb-1">Confirmed</p>
                <p className="text-3xl font-bold text-emerald-400">{completions.filter(c => !!c.confirmed_at).length}</p>
              </div>
            </div>

            {/* Grouped by action */}
            {completions.length === 0 ? (
              <div className="bg-[#0A120F] border border-white/5 rounded-2xl p-12 text-center">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-gray-600 mx-auto mb-4">
                  <CheckCircle2 size={32} />
                </div>
                <p className="text-gray-500 font-bold">No completions yet</p>
                <p className="text-xs text-gray-600 mt-1">Employees haven't marked any required actions complete yet.</p>
              </div>
            ) : (
              (() => {
                // Group completions by action title
                const grouped: Record<string, typeof completions> = {};
                completions.forEach(c => {
                  const key = c.action?.title || 'Unknown Action';
                  if (!grouped[key]) grouped[key] = [];
                  grouped[key].push(c);
                });

                return (
                  <div className="space-y-4">
                    {Object.entries(grouped).map(([actionTitle, actionCompletions]) => {
                      const pendingInGroup = actionCompletions.filter(c => !c.confirmed_at).length;
                      const confirmedInGroup = actionCompletions.filter(c => !!c.confirmed_at).length;

                      return (
                        <div key={actionTitle} className="bg-[#0A120F] border border-white/5 rounded-2xl overflow-hidden">
                          {/* Action header */}
                          <div className="flex items-center gap-4 px-5 py-4 border-b border-white/5 bg-white/[0.02]">
                            <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 shrink-0">
                              <CheckCircle2 size={16} />
                            </div>
                            <div className="flex-1">
                              <h3 className="text-sm font-bold text-white">{actionTitle}</h3>
                              <p className="text-[10px] text-gray-500">{actionCompletions[0]?.action?.description}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {pendingInGroup > 0 && (
                                <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 text-[10px] font-bold rounded-full flex items-center gap-1">
                                  <Clock size={10} /> {pendingInGroup} pending
                                </span>
                              )}
                              {confirmedInGroup > 0 && (
                                <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-full flex items-center gap-1">
                                  <CheckCircle2 size={10} /> {confirmedInGroup} confirmed
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Employee rows */}
                          <div className="divide-y divide-white/5">
                            {actionCompletions.map(comp => (
                              <div key={comp.id} className={`flex items-center gap-4 px-5 py-4 transition-colors ${comp.confirmed_at ? 'bg-emerald-500/[0.03]' : 'hover:bg-white/[0.02]'}`}>
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${comp.confirmed_at ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-gray-400'}`}>
                                  {comp.first_name?.[0]}{comp.last_name?.[0]}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-white">{comp.first_name} {comp.last_name}</p>
                                  <p className="text-[10px] text-gray-500">
                                    Completed {format(new Date(comp.completed_at), 'MMM d, yyyy h:mm a')}
                                  </p>
                                  {comp.confirmed_at && comp.confirmed_by && (
                                    <p className="text-[10px] text-emerald-500/70 mt-0.5 flex items-center gap-1">
                                      <UserCheck size={10} />
                                      Confirmed by {comp.confirmer?.first_name} {comp.confirmer?.last_name} · {format(new Date(comp.confirmed_at), 'MMM d, h:mm a')}
                                    </p>
                                  )}
                                </div>
                                {comp.confirmed_at ? (
                                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-400 rounded-xl text-xs font-bold shrink-0">
                                    <CheckCircle2 size={12} /> Confirmed
                                  </div>
                                ) : (
                                  <button
                                    onClick={async () => {
                                      const confirmedBy = `${employee?.first_name} ${employee?.last_name}`;
                                      const confirmedAt = new Date().toISOString();
                                      await supabase
                                        .from('portal_action_completions')
                                        .update({ confirmed_at: confirmedAt, confirmed_by: confirmedBy })
                                        .eq('id', comp.id);
                                      await logActivity('action_confirmed', {
                                        action_title: actionTitle,
                                        action_id: comp.action_id,
                                        employee_name: `${comp.first_name} ${comp.last_name}`,
                                        employee_email: comp.email,
                                        confirmed_by: confirmedBy,
                                        confirmed_at: confirmedAt,
                                        originally_completed_at: comp.completed_at
                                      });
                                      setCompletions(prev => prev.map(c =>
                                        c.id === comp.id ? { ...c, confirmed_at: confirmedAt, confirmed_by: confirmedBy } : c
                                      ));
                                    }}
                                    disabled={isSiteLead}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-500/20 shrink-0 disabled:opacity-50"
                                  >
                                    <UserCheck size={12} /> Confirm
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </motion.div>
        )}

        {activeTab === 'surveys' && (
          <motion.div key="surveys" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <SurveyReviewTab userRole="manager" userId={employee?.id || ''} />
          </motion.div>
        )}

        {activeTab === 'readiness' && (
          <motion.div key="readiness" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <PromotionReadinessTab />
          </motion.div>
        )}

        {activeTab === 'chat' && (
          <motion.div key="chat" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-[calc(100vh-12rem)]">
            <Chat jobsiteId={jobsite?.id} jobsiteGroup={jobsite?.jobsite_group} jobsiteName={siteGroupName} jobsiteGroupName={siteGroupName} />
          </motion.div>
        )}

        {activeTab === 'importer' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">Assignment Importer</h2>
            <AssignmentImporter onImportComplete={fetchData} />
          </div>
        )}
        {activeTab === 'map' && (
          <motion.div key="map" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <MapPortal jobsites={allJobsites} employees={siteEmployees} jobsiteGroups={jobsiteGroups} />
          </motion.div>
        )}

        {/* ── REQUESTS ── */}
        {activeTab === 'requests' && (
          <motion.div key="requests" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">

            {/* Filter bar */}
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'pending', 'approved', 'denied'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setRequestFilter(f)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all capitalize ${
                    requestFilter === f
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-white/5 text-gray-500 border border-transparent hover:text-gray-300'
                  }`}
                >
                  {f} {f !== 'all' && `(${requests.filter(r => r.status === f).length})`}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {filteredRequests.map(req => (
                <motion.div
                  key={req.id}
                  layout
                  className="bg-[#0A120F] border border-white/5 rounded-2xl p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        req.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                        req.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {req.status === 'pending' ? <Clock size={16} /> :
                         req.status === 'approved' ? <CheckCircle2 size={16} /> :
                         <XCircle size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-white text-sm capitalize">
                            {req.request_type?.replace(/_/g, ' ')}
                          </p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${
                            req.status === 'pending' ? 'bg-amber-500/10 text-amber-400' :
                            req.status === 'approved' ? 'bg-emerald-500/10 text-emerald-500' :
                            'bg-red-500/10 text-red-400'
                          }`}>
                            {req.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {(req as any).employee
                            ? `${(req as any).employee.first_name} ${(req as any).employee.last_name}`
                            : 'Unknown employee'}
                          {' · '}
                          {format(new Date(req.created_at), 'MMM d, yyyy')}
                        </p>
                        {req.details && (
                          <p className="text-sm text-gray-400 mt-2 leading-relaxed">{req.details}</p>
                        )}
                        {(req.start_date || req.end_date) && (
                          <p className="text-xs text-gray-600 mt-1 font-mono">
                            {req.start_date && format(new Date(req.start_date), 'MMM d')}
                            {req.start_date && req.end_date && ' → '}
                            {req.end_date && format(new Date(req.end_date), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                    </div>

                    {req.status === 'pending' && (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleRequestAction(req, 'approved')}
                          disabled={processingId === req.id || isSiteLead || !canWrite}
                          className={`px-4 py-2 border rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${canWrite ? 'bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-black border-emerald-500/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed'}`}
                        >
                          {processingId === req.id ? <RefreshCw size={12} className="animate-spin" /> : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleRequestAction(req, 'denied')}
                          disabled={processingId === req.id || isSiteLead || !canWrite}
                          className={`px-4 py-2 border rounded-xl text-xs font-bold transition-all disabled:opacity-50 ${canWrite ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700 cursor-not-allowed'}`}
                        >
                          Deny
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {filteredRequests.length === 0 && (
                <div className="py-16 text-center text-gray-600 italic border border-dashed border-white/10 rounded-2xl">
                  No {requestFilter !== 'all' ? requestFilter : ''} requests found.
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── ACTIONS ── */}
        {activeTab === 'actions' && (
          <motion.div key="actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {portalActions.filter(a => a.type === 'greenergy_link').map((action) => (
                <motion.button 
                  key={action.id} 
                  onClick={() => {
                    if (action.embed_in_portal) {
                      setEmbeddedFormAction(action);
                    } else {
                      window.open(resolveUrl(action.url), action.open_in_new_tab ? "_blank" : "_self");
                    }
                  }}
                  whileHover={{ y: -4 }} 
                  className="bg-[#0A120F] border border-white/5 p-6 rounded-3xl hover:border-emerald-500/30 transition-all group text-left w-full"
                >
                  <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-6 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                    <IconComponent name={action.icon} className="w-6 h-6" />
                  </div>
                  <h4 className="text-lg font-bold text-white mb-2 group-hover:text-emerald-500 transition-colors">{action.title}</h4>
                  <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{action.description}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── SITE INFO ── */}
        {activeTab === 'jobsite-info' && (
          <motion.div key="jobsite-info" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            {groupJobsites.length > 0 ? (
              <div className="space-y-6">
                {groupJobsites.map(site => (
                  <JobsiteInfoCard 
                    key={site.id} 
                    jobsite={site} 
                    title={site.jobsite_name} 
                    currentManager={(() => {
                      const sm = siteEmployees.find(m => 
                        m.role?.toLowerCase().includes('manager') && 
                        m.current_assignments?.some(a => 
                          a.jobsite_fk === site.id || 
                          (site.group_id && allJobsites.find(js => js.id === a.jobsite_fk)?.group_id === site.group_id)
                        )
                      );
                      return sm ? `${sm.first_name} ${sm.last_name}` : undefined;
                    })()}
                  />
                ))}
              </div>
            ) : (
              <div className="py-16 text-center text-gray-600 italic border border-dashed border-white/10 rounded-2xl">
                No site information available.
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      <TargetSelectionModal
        isOpen={isTargetModalOpen}
        onClose={() => setIsTargetModalOpen(false)}
        targets={siteEmployees.filter(e => e.id !== employee?.id)}
        onSelect={(targetId) => {
          setSelectedTargetId(targetId);
          setIsSurveyModalOpen(true);
        }}
      />
      {selectedTargetId && (
        <SurveyModal
          isOpen={isSurveyModalOpen}
          onClose={() => { setIsSurveyModalOpen(false); setSelectedTargetId(null); }}
          surveyType="manager_eval_tech"
          raterId={employee?.id || ''}
          targetId={selectedTargetId}
          weekStartDate={currentWeekStart}
        />
      )}
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
                  disabled={!canWrite}
                  className={`w-full sm:w-auto px-6 py-3 text-xs font-bold rounded-xl transition-all shadow-lg ${canWrite ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
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
import ScheduleTab from './ScheduleTab';

