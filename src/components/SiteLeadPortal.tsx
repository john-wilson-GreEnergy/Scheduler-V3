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
import { SurveyInitiator } from './SurveyInitiator';
import { SurveyReviewTab } from './SurveyReviewTab';
import { PerformancePulseTile } from './PerformancePulseTile';
import { SurveyModal } from './SurveyModal';
import { TargetSelectionModal } from './TargetSelectionModal';
import { AssignmentImporter } from './AssignmentImporter';
import { IconComponent } from './PortalComponents';
import { format, startOfWeek, addWeeks, parseISO } from 'date-fns';
import { parseAssignmentNames } from '../utils/assignmentParser';
import { isRotationWeek } from '../utils/rotation';
import ScheduleTab from './ScheduleTab';
import RequestsManagement from './RequestsManagement';

interface SiteEmployee extends Employee {
  rotation_config?: RotationConfig;
  current_assignments?: AssignmentItem[];
  is_on_rotation?: boolean;
}

export default function SiteLeadPortal() {
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
  const [requiredActions, setRequiredActions] = useState<PortalAction[]>([]);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [rotationConfigs, setRotationConfigs] = useState<Record<string, RotationConfig>>({});

  const filteredJobsites = useMemo(() => {
    const currentJobsiteIds = currentAssignment?.assignment_items?.map(item => item.jobsite_fk) || [];
    const nextAssignment = upcomingAssignments[0];
    const nextJobsiteIds = nextAssignment?.assignment_items?.map(item => item.jobsite_fk) || [];
    const allowedIds = new Set([...currentJobsiteIds, ...nextJobsiteIds]);
    
    return allJobsites.filter(j => allowedIds.has(j.id));
  }, [allJobsites, currentAssignment, upcomingAssignments]);

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
        .from('portal_actions')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      const { data: reqActions } = await supabase
        .from('portal_required_actions')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });

      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const { data: announcements } = await supabase
        .from('announcements')
        .select('*')
        .eq('active', true)
        .lte('start_date', todayStr)
        .gte('end_date', todayStr);

      const { data: recentActivity } = await supabase
        .from('recent_activity')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      setAllJobsites(allSites || []);
      setJobsiteGroups(groups || []);
      setPortalActions(portalActions || []);
      setRequiredActions(reqActions || []);
      setAnnouncements(announcements || []);
      setRecentActivity(recentActivity || []);

      if (employee) {
        const now = new Date();
        const assignments = await assignmentService.getAssignmentsByEmployeeId(employee.id);
        const { data: rotationConfigs } = await supabase
          .from('rotation_configs')
          .select('*');

        if (assignments) {
          const current = assignments.filter(a => new Date(a.week_start + 'T12:00:00') <= now).pop();
          const upcoming = assignments.filter(a => new Date(a.week_start + 'T12:00:00') > now);
          
          // Use the joined assignment_items data
          const currentWithItems = current ? {
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

    // If no manager match, find site via current week assignment_weeks email
      let assignmentSite: Jobsite | null = null;
      if (!managedSite && employee?.email) {
        const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const { data: currentAssignment } = await supabase
          .from('assignment_weeks')
          .select('assignment_type')
          .eq('employee_fk', employee.id)
          .eq('week_start', weekStart)
          .maybeSingle();

        if (currentAssignment?.assignment_type) {
          const assignmentNames = parseAssignmentNames(currentAssignment.assignment_type);
          assignmentSite = (allSites || []).find(
            s => assignmentNames.includes(s.jobsite_group || '') ||
                 assignmentNames.includes(s.jobsite_name || '')
          ) || null;
        }
      }

      const siteToUse = managedSite || assignmentSite || (allSites && allSites[0]) || null;
      console.log('SiteLeadPortal: managedSite:', managedSite, 'assignmentSite:', assignmentSite, 'siteToUse:', siteToUse);
      setJobsite(siteToUse);

      // Resolve the group: if the site has a jobsite_group, combine all sites in that group
      const resolvedGroupName = siteToUse?.jobsite_group || siteToUse?.jobsite_name || '';
      const resolvedGroupSites = siteToUse?.jobsite_group
        ? (allSites || []).filter(s => s.jobsite_group === siteToUse.jobsite_group)
        : siteToUse ? [siteToUse] : [];

      setSiteGroupName(resolvedGroupName);
      setGroupJobsites(resolvedGroupSites);

      if (siteToUse) {
        const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

        // Build list of names to match against assignment_type:
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
        
        // Get all current week assignments for the assignment map
        const { data: allCurrentWeek } = await supabase
          .from('assignment_weeks')
          .select('*')
          .eq('week_start', weekStart);
        
        // Build set of employee identifiers assigned to this site/group
        const assignedRefs = new Set<string>(
          (siteAssignments || [])
            .map(aw => aw.employee_fk)
            .filter(Boolean)
        );

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
          .filter(emp =>
            assignedRefs.has(emp.id) ||
            assignedRefs.has(emp.email)
          )
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
          const [compData, reqCompData] = await Promise.all([
            supabase
              .from('portal_action_completions')
              .select('*, action:portal_actions(title, description, icon), employee:employees(first_name, last_name, email, job_title)')
              .in('employee_fk', empIds)
              .order('completed_at', { ascending: false }),
            supabase
              .from('portal_required_action_completions')
              .select('*, action:portal_required_actions(title, description, icon), employee:employees(first_name, last_name, email, job_title)')
              .in('employee_fk', empIds)
              .order('completed_at', { ascending: false })
          ]);

          const allCompletions = [
            ...(compData.data || []),
            ...(reqCompData.data || [])
          ].sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());

          setCompletions(allCompletions);
        }
      }
    } catch (err) {
      console.error('SiteLeadPortal fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employee) fetchData();
  }, [employee]);

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const activeCount = siteEmployees.filter(e => !e.is_on_rotation).length;
  const onRotationCount = siteEmployees.filter(e => e.is_on_rotation).length;
  const pendingCompletions = completions.filter(c => !c.confirmed_at).length;

  const tabs = useMemo(() => [
    { id: 'overview', label: 'Overview', icon: <BarChart3 size={16} />, category: 'Site' },
    { id: 'chat', label: 'Crew Chat', icon: <MessageSquare size={16} />, category: 'Site' },
    { id: 'jobsite-info', label: 'Jobsite', icon: <Info size={16} />, category: 'Site' },
    { id: 'roster', label: 'Roster', icon: <Users size={16} />, category: 'Site' },
    { id: 'schedule', label: 'Schedule', icon: <Calendar size={16} />, category: 'Site' },
    { id: 'surveys', label: 'Surveys', icon: <MessageSquare size={16} />, category: 'Management' },
    { id: 'actions', label: 'GreEnergy Links', icon: <Layers size={16} />, category: 'Management' },
    { id: 'map', label: 'Map', icon: <MapPin size={16} />, category: 'Management' },
  ], [pendingCount]);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050A08] flex items-center justify-center">
        <RefreshCw className="text-emerald-500 animate-spin" size={32} />
      </div>
    );
  }

  return (
    <PortalLayout
      title={siteGroupName ? `Site Lead — ${siteGroupName}` : 'Site Lead'}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onRefresh={fetchData}
    >
      <AnimatePresence>
        {/* ── OVERVIEW ── */}
        {activeTab === 'overview' && (
          <motion.div key="overview" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            {/* KPI strip */}
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
          </motion.div>
        )}
        {activeTab === 'chat' && (
          <motion.div key="chat" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-[calc(100vh-12rem)]">
            <Chat jobsiteId={jobsite?.id} jobsiteGroup={jobsite?.jobsite_group} jobsiteName={siteGroupName} jobsiteGroupName={siteGroupName} />
          </motion.div>
        )}
        {activeTab === 'requests' && (
          <motion.div key="requests" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <RequestsManagement canApprove={false} />
          </motion.div>
        )}
        {activeTab === 'jobsite-info' && (
          <motion.div key="jobsite-info" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            {groupJobsites.map(js => (
              <JobsiteInfoCard key={js.id} jobsite={js} title={js.jobsite_name} />
            ))}
          </motion.div>
        )}
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
                              <p className="text-sm text-white mt-1">{emp.current_assignments?.map(a => a.jobsites?.jobsite_name).join(', ') || 'N/A'}</p>
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
        {activeTab === 'schedule' && (
          <motion.div key="schedule" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ScheduleTab jobsite={jobsite} allJobsites={allJobsites} siteEmployees={siteEmployees} />
          </motion.div>
        )}
        {activeTab === 'surveys' && (
          <motion.div key="surveys" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="mb-6">
              <SurveyInitiator 
                userId={employee?.id || ''} 
                email={employee?.email || ''} 
                userRole={employee?.role || 'site_lead'} 
                weekStartDate={currentWeekStart}
              />
            </div>
            <SurveyReviewTab />
          </motion.div>
        )}
        {activeTab === 'actions' && (
          <motion.div key="actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
            {requiredActions.length > 0 && (
              <div>
                <h3 className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-4">Required Actions</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {requiredActions.map(action => (
                    <button
                      key={action.id}
                      onClick={() => {
                        if (action.embed_in_portal) {
                          setEmbeddedFormAction(action);
                        } else {
                          window.open(resolveUrl(action.url), action.open_in_new_tab ? "_blank" : "_self");
                        }
                      }}
                      className="bg-[#0A120F] border border-emerald-500/20 rounded-2xl p-6 text-left hover:border-emerald-500/50 transition-all group"
                    >
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 mb-4 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                        <IconComponent name={action.icon} className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-white mb-1">{action.title}</h3>
                      <p className="text-xs text-gray-500">{action.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mb-4">GreEnergy Links</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {portalActions.map(action => (
                  <button
                    key={action.id}
                    onClick={() => {
                      if (action.embed_in_portal) {
                        setEmbeddedFormAction(action);
                      } else {
                        window.open(resolveUrl(action.url), action.open_in_new_tab ? "_blank" : "_self");
                      }
                    }}
                    className="bg-[#0A120F] border border-white/5 rounded-2xl p-6 text-left hover:border-emerald-500/30 transition-all group"
                  >
                    <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 mb-4 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                      <IconComponent name={action.icon} className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-white mb-1">{action.title}</h3>
                    <p className="text-xs text-gray-500">{action.description}</p>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'map' && (
          <motion.div key="map" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-[calc(100vh-12rem)]">
            <MapPortal jobsites={filteredJobsites} employees={siteEmployees} jobsiteGroups={jobsiteGroups} />
          </motion.div>
        )}
      </AnimatePresence>
    </PortalLayout>
  );
}
