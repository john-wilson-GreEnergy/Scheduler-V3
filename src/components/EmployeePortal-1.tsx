import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
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
  Truck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Announcement, AssignmentWeek, AssignmentItem, PortalAction, Jobsite, RotationConfig } from '../types';
import { isRotationWeek } from '../utils/rotation';
import { IconComponent } from './PortalComponents';
import PortalLayout from './PortalLayout';
import MapPortal from './MapPortal';
import { format } from 'date-fns';

export default function EmployeePortal() {
  const { employee, user } = useAuth();
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
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [portalRequests, setPortalRequests] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedRequestType, setSelectedRequestType] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [rotationConfigs, setRotationConfigs] = useState<Record<string, RotationConfig>>({});

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
        supabase.from('rotation_configs').select('*')
      ];

      if (employee) {
        queries.push(
          supabase.from('assignment_weeks')
            .select('*')
            .or(`employee_fk.eq.${employee.id},employee_id.eq.${employee.employee_id_ref}`)
            .order('week_start', { ascending: false }),
          supabase.from('assignment_items').select('*, jobsite:jobsites(*)'),
          supabase.from('portal_requests').select('*').eq('employee_fk', employee.id).order('created_at', { ascending: false }),
          supabase.from('recent_activity').select('*').eq('employee_fk', employee.id).order('created_at', { ascending: false }).limit(5)
        );
      }

      const results = await Promise.all(queries);
      
      const annRes = results[0];
      const actionsRes = results[1];
      const sitesRes = results[2];
      const rotRes = results[3];

      if (annRes.data) setAnnouncements(annRes.data);
      if (actionsRes.data) {
        const now = new Date();
        const filteredActions = actionsRes.data.filter(action => {
          // Links are instantly available - check priority or category
          const isLink = action.priority === 'low' || 
                        action.category?.toLowerCase().includes('link') ||
                        !action.start_date;

          if (isLink) return true;
          
          if (!action.start_date) return true;
          
          const start = new Date(action.start_date);
          start.setHours(0, 0, 0, 0); // 12:00 AM
          
          const end = action.end_date ? new Date(action.end_date) : null;
          if (end) {
            end.setHours(23, 59, 59, 999); // 11:59 PM
          }
          
          return now >= start && (!end || now <= end);
        });
        setPortalActions(filteredActions);
      }
      if (sitesRes.data) setJobsites(sitesRes.data);
      if (rotRes.data) {
        const configMap: Record<string, RotationConfig> = {};
        rotRes.data.forEach(config => {
          configMap[config.employee_fk] = config;
        });
        setRotationConfigs(configMap);
      }

      if (employee && results.length > 4) {
        const assignRes = results[4];
        const itemsRes = results[5];
        const reqRes = results[6];
        const actRes = results[7];

        if (assignRes.data) {
          const now = new Date();
          // Find current week (the one that started most recently but before or on now)
          const current = assignRes.data.find(a => new Date(a.week_start) <= now);
          const upcoming = assignRes.data.filter(a => new Date(a.week_start) > now).reverse();
          const history = assignRes.data.filter(a => new Date(a.week_start) < (current ? new Date(current.week_start) : now));
          
          setCurrentAssignment(current || null);
          setUpcomingAssignments(upcoming);
          setAssignmentHistory(history);

          if (current) {
            const filteredItems = itemsRes.data?.filter(item => 
              item.assignment_week_fk === current.id || item.assignment_fk === current.id
            ) || [];
            setAssignmentItems(filteredItems);
          }
        }
        if (reqRes.data) setPortalRequests(reqRes.data);
        if (actRes.data) setRecentActivity(actRes.data);
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [employee]);

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
    return upcomingAssignments.find(a => a.display_value !== currentAssignment.display_value) || null;
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

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <Calendar size={18} /> },
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
      title="Employee Portal" 
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
                        <div key={ann.id} className={`p-4 rounded-2xl border ${ann.level === 'high' ? 'bg-red-500/5 border-red-500/20' : 'bg-white/5 border-white/5'}`}>
                          <h3 className={`font-bold text-sm ${ann.level === 'high' ? 'text-red-400' : 'text-white'}`}>{ann.title}</h3>
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
                    {portalActions.filter(a => a.priority === 'high').length}
                  </span>
                </div>
                <div className="space-y-4">
                  {portalActions.filter(a => a.priority === 'high').map(action => (
                    <a key={action.id} href={action.url} target="_blank" rel="noreferrer" className="flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group">
                      <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                        <IconComponent name={action.icon} className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-bold text-white">{action.title}</h3>
                        <p className="text-[10px] text-gray-500 line-clamp-1">{action.description}</p>
                      </div>
                      <ChevronRight size={16} className="text-gray-600 group-hover:text-emerald-500" />
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* Middle Row: Assignment & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-[#0A120F] border border-white/5 rounded-3xl p-8">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-white">My Assignment</h2>
                    <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Current week and group details</p>
                  </div>
                  {currentAssignment && (
                    <div className="px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-xl text-xs font-bold border border-emerald-500/20">
                      Week of {new Date(currentAssignment.week_start).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {currentAssignment ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                      <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                        <span className="text-[10px] uppercase font-bold text-gray-500 block mb-2">Assignment</span>
                        <p className="text-lg font-bold text-white truncate">{currentAssignment.display_value}</p>
                      </div>
                      <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                        <span className="text-[10px] uppercase font-bold text-gray-500 block mb-2">Customer</span>
                        <p className="text-lg font-bold text-white truncate">{currentAssignment.customer || 'N/A'}</p>
                      </div>
                      <div className="bg-white/5 p-6 rounded-2xl border border-white/5">
                        <span className="text-[10px] uppercase font-bold text-gray-500 block mb-2">Sites in group</span>
                        <p className="text-3xl font-bold text-emerald-500">{assignmentItems.length}</p>
                      </div>
                    </div>

                    <div className="h-px bg-white/5 mb-8" />

                    {findNextDifferentAssignment() && (
                      <div className="mb-8 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex items-start gap-3">
                        <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                        <div>
                          <p className="text-sm font-bold text-amber-200">Upcoming assignment change</p>
                          <p className="text-xs text-amber-500/80 mt-1">
                            {currentAssignment.display_value} → {findNextDifferentAssignment()?.display_value} on week of {new Date(findNextDifferentAssignment()!.week_start).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    )}

                    <div>
                      <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-widest">Sites</h3>
                      <div className="space-y-3">
                        {assignmentItems.map(item => (
                          <div key={item.id} className="flex items-center justify-between p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors cursor-pointer group">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 bg-emerald-500/10 rounded-lg flex items-center justify-center text-emerald-500">
                                <Construction size={18} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white">{item.normalized_value}</p>
                                <p className="text-[10px] text-gray-500">{item.jobsite?.full_address || item.customer || 'No address details'}</p>
                              </div>
                            </div>
                            <ChevronRight size={16} className="text-gray-600 group-hover:text-emerald-500 transition-colors" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-48 flex items-center justify-center text-gray-600 italic border border-dashed border-white/10 rounded-2xl">No active assignment found.</div>
                )}
              </div>

              <div className="bg-[#0A120F] border border-white/5 rounded-3xl p-8">
                <h2 className="text-2xl font-bold text-white mb-2">Quick Actions</h2>
                <p className="text-xs text-gray-500 mb-8 uppercase tracking-wider">Common requests</p>
                <div className="space-y-4">
                  {[
                    { label: 'Request Vacation', type: 'vacation', icon: <Calendar size={18} /> },
                    { label: 'Request Rotation Change', type: 'rotation_change', icon: <RefreshCw size={18} /> },
                    { label: 'Request Jobsite Change', type: 'jobsite_change', icon: <Truck size={18} /> }
                  ].map((action, i) => (
                    <button key={i} onClick={() => { setSelectedRequestType(action.type); setIsRequestModalOpen(true); }} className="w-full p-4 bg-white/5 hover:bg-emerald-500 hover:text-black rounded-2xl border border-white/5 flex items-center justify-between transition-all group">
                      <div className="flex items-center gap-3">
                        <span className="text-emerald-500 group-hover:text-black">{action.icon}</span>
                        <span className="text-sm font-bold">{action.label}</span>
                      </div>
                      <Plus size={18} className="opacity-50" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Timeline Section */}
            <div className="bg-[#0A120F] border border-white/5 rounded-3xl p-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-white">Assignment Timeline</h2>
                  <p className="text-xs text-gray-500 mt-1 uppercase tracking-wider">Rolling view</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setTimelineIndex(Math.max(0, timelineIndex - 1))} disabled={timelineIndex === 0} className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-xl transition-all"><ChevronLeft size={18} /></button>
                  <button onClick={() => setTimelineIndex(timelineIndex + 1)} disabled={timelineIndex + 6 >= assignmentHistory.length + (currentAssignment ? 1 : 0) + upcomingAssignments.length} className="p-2 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-xl transition-all"><ChevronRight size={18} /></button>
                </div>
              </div>
              
              {(() => {
                const allWeeks = [...assignmentHistory, ...(currentAssignment ? [currentAssignment] : []), ...upcomingAssignments];
                const visibleWeeks = allWeeks.slice(timelineIndex, timelineIndex + 6);
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                    {visibleWeeks.map((wk) => {
                      const isCurrent = currentAssignment && wk.id === currentAssignment.id;
                      const weekDate = new Date(wk.week_start);
                      const config = employee?.id ? rotationConfigs[employee.id] : undefined;
                      const isScheduledRotation = config ? isRotationWeek(weekDate, config) : false;
                      const isActuallyRotation = wk.display_value.toLowerCase() === 'rotation';
                      const rotationConflict = isScheduledRotation !== isActuallyRotation;

                      return (
                        <div key={wk.id} className={`p-4 rounded-2xl border transition-all relative overflow-hidden ${isCurrent ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/5 border-white/5'}`}>
                          {isScheduledRotation && <div className="absolute top-0 right-0 px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[8px] font-bold uppercase rounded-bl-lg">Rotation</div>}
                          <p className="text-[10px] text-gray-500 font-mono mb-1">{weekDate.toLocaleDateString()}</p>
                          <p className={`text-sm font-bold truncate ${rotationConflict ? 'text-amber-400' : 'text-white'}`}>{wk.display_value}</p>
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
          </motion.div>
        )}

        {activeTab === 'map' && (
          <motion.div key="map" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
            <MapPortal jobsites={jobsites} />
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
                        <motion.a 
                          key={link.id} 
                          href={link.url} 
                          target={link.open_in_new_tab ? "_blank" : "_self"} 
                          rel="noreferrer" 
                          whileHover={{ y: -4 }} 
                          className="bg-[#0A120F] border border-white/5 p-6 rounded-3xl hover:border-emerald-500/30 transition-all group"
                        >
                          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-6 group-hover:bg-emerald-500 group-hover:text-black transition-all">
                            <IconComponent name={link.icon} className="w-6 h-6" />
                          </div>
                          <h4 className="text-lg font-bold text-white mb-2 group-hover:text-emerald-500 transition-colors">{link.title}</h4>
                          <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{link.description}</p>
                        </motion.a>
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
              <h3 className="text-2xl font-bold text-white mb-2 capitalize">{selectedRequestType?.replace('_', ' ')} Request</h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                handleRequestSubmit(formData.get('details') as string, formData.get('startDate') as string, formData.get('endDate') as string);
              }} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-gray-500">Start Date</label>
                    <input type="date" name="startDate" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-gray-500">End Date</label>
                    <input type="date" name="endDate" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-gray-500">Details</label>
                  <textarea name="details" required rows={4} className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-emerald-500 resize-none" />
                </div>
                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsRequestModalOpen(false)} className="flex-1 py-4 bg-white/5 text-white font-bold rounded-2xl transition-all">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="flex-1 py-4 bg-emerald-500 text-black font-bold rounded-2xl transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
                    {isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : 'Submit Request'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </PortalLayout>
  );
}
