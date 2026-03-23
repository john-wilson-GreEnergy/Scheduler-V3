import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, RotationConfig, Jobsite, JobsiteGroup } from '../types';
import PortalLayout from './PortalLayout';
import RotationManagement from './RotationManagement';
import RotationLookAhead from './RotationLookAhead';
import MapPortal from './MapPortal';
import Scheduler from './Scheduler';
import Analytics from './Analytics';
import EmployeeManagement from './EmployeeManagement';
import RequestsManagement from './RequestsManagement';
import DataHealth from './DataHealth';
import SystemLogs from './SystemLogs';
import JobsiteManager from './JobsiteManager';
import GroupManager from './GroupManager';
import GroupAssignmentTool from './GroupAssignmentTool';
import ManpowerView from './ManpowerView';
import BulkAssignments from './BulkAssignments';
import LogisticsForecast from './LogisticsForecast';
import PortalContentManager from './PortalContentManager';
import ChatSyncManager from './ChatSyncManager';
import AdminChatView from './AdminChatView';
import { SurveyReviewTab } from './SurveyReviewTab';
import DataImporter from './DataImporter';
import { CsvRotationImporter } from './CsvRotationImporter';
import { Users, RefreshCw, Map as MapIcon, Calendar, BarChart3, ClipboardList, History, MapPin, LayoutGrid, Layers, TrendingUp, Activity, Megaphone, MessageSquare, Upload, AlertTriangle, ChevronRight, ChevronLeft } from 'lucide-react';
import { DashboardSkeleton } from './DashboardSkeleton';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from './NotificationToast';
import { haptics } from '../services/hapticsService';
import { motion, AnimatePresence } from 'motion/react';

export default function AdminPortal() {
  const { user } = useAuth();
  const { showNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [jobsiteGroups, setJobsiteGroups] = useState<JobsiteGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      showNotification(
        'Admin Access Granted',
        'Master Scheduler and Workforce Management tools are active.',
        'success'
      );
    }
  }, [user?.id]);

  const fetchData = async (silent = false) => {
    console.log('AdminPortal: fetchData called');
    if (!silent) setLoading(true);
    const [empRes, siteRes, rotRes, groupRes] = await Promise.all([
      supabase.from('employees').select('*').order('last_name'),
      supabase.from('jobsites').select('*, min_staffing').order('jobsite_name'),
      supabase.from('rotation_configs').select('*'),
      supabase.from('jobsite_groups').select('*').order('name')
    ]);

    console.log('AdminPortal: Fetch results', { empRes, siteRes, rotRes, groupRes });

    if (empRes.error) console.error('Error fetching employees:', empRes.error);
    if (siteRes.error) console.error('Error fetching jobsites:', siteRes.error);
    if (rotRes.error) console.error('Error fetching rotation configs:', rotRes.error);
    if (groupRes.error) {
      console.error('Error fetching jobsite groups:', groupRes.error);
      console.error('Group Res details:', groupRes);
    }

    console.log('AdminPortal: employees:', empRes.data);
    console.log('AdminPortal: jobsites:', siteRes.data);
    console.log('AdminPortal: jobsiteGroups:', groupRes.data);

    if (empRes.data) {
      const configs = rotRes.data || [];
      const employeesWithConfig = empRes.data.map(emp => ({
        ...emp,
        rotation_config: configs.find(c => c.employee_fk === emp.id) || null
      }));
      
      const ids = employeesWithConfig.map(e => e.id);
      const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
      if (duplicates.length > 0) {
        console.error('Duplicate employees found:', duplicates);
      }
      
      setEmployees(employeesWithConfig);
    }
    if (siteRes.data) {
      setJobsites(siteRes.data);
    }
    if (groupRes.data) {
      console.log('Jobsite Groups:', groupRes.data);
      setJobsiteGroups(groupRes.data);
    }
    if (!silent) setLoading(false);
  };

  const syncProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from('employees')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!existing) {
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('email', user.email)
        .maybeSingle();

      if (emp) {
        await supabase
          .from('employees')
          .update({ auth_user_id: user.id })
          .eq('id', emp.id);
      }
    }
  };

  useEffect(() => {
    console.log('AdminPortal: useEffect called');
    const init = async () => {
      await syncProfile();
      await fetchData();
    };
    init();
  }, []);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutGrid size={16} />, category: 'Operations' },
    { id: 'scheduler', label: 'Scheduler', icon: <Calendar size={16} />, category: 'Operations' },
    { id: 'chat', label: 'Crew Chat', icon: <MessageSquare size={16} />, category: 'Operations' },
    { id: 'bulk', label: 'Bulk Assignments', icon: <Layers size={16} />, category: 'Operations' },
    { id: 'map', label: 'Map View', icon: <MapIcon size={16} />, category: 'Operations' },
    { id: 'manpower', label: 'Manpower', icon: <LayoutGrid size={16} />, category: 'Operations' },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={16} />, category: 'Operations' },
    { id: 'forecast', label: 'Logistics Forecast', icon: <TrendingUp size={16} />, category: 'Operations' },
    
    { id: 'employees', label: 'Employees', icon: <Users size={16} />, category: 'Management' },
    { id: 'rotations', label: 'Rotations', icon: <RefreshCw size={16} />, category: 'Management' },
    { id: 'lookahead', label: 'Rotation Look-Ahead', icon: <Calendar size={16} />, category: 'Management' },
    { id: 'jobsites', label: 'Jobsites', icon: <MapPin size={16} />, category: 'Management' },
    { id: 'groups', label: 'Jobsite Groups', icon: <Layers size={16} />, category: 'Management' },
    { id: 'group-assignment', label: 'Group Assignment', icon: <Users size={16} />, category: 'Management' },
    { id: 'requests', label: 'Requests', icon: <ClipboardList size={16} />, category: 'Management' },
    { id: 'content', label: 'Portal Content', icon: <Megaphone size={16} />, category: 'Management' },
    { id: 'surveys', label: 'Surveys', icon: <MessageSquare size={16} />, category: 'Management' },

    { id: 'chatsync', label: 'Chat Sync', icon: <MessageSquare size={16} />, category: 'System' },
    { id: 'importer', label: 'Data Import', icon: <Upload size={16} />, category: 'System' },
    { id: 'rotation-importer', label: 'Rotation Import', icon: <Upload size={16} />, category: 'System' },
    { id: 'logs', label: 'System Logs', icon: <History size={16} />, category: 'System' },
    { id: 'health', label: 'Data Health', icon: <Activity size={16} />, category: 'System' },
  ];

  const getTitle = () => {
    if (activeTab === 'dashboard') return 'Admin — Master Scheduler';
    const tab = tabs.find(t => t.id === activeTab);
    return tab ? `Admin — ${tab.label}` : 'Admin Portal';
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return (
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
              <h1 className="text-3xl font-extrabold text-white tracking-tight">Admin Console</h1>
              <p className="text-emerald-500 font-bold text-[10px] uppercase tracking-[0.2em] mt-1">⚡️ GreEnergy Resources Management</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-black text-lg">
              A
            </div>
          </div>

          {/* Bento Grid Layout */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            
            {/* Featured Tile: Active Workforce */}
            <motion.div 
              whileTap={{ scale: 0.97 }}
              className="col-span-2 row-span-2 bg-emerald-500 rounded-[32px] p-6 text-black flex flex-col justify-between shadow-xl shadow-emerald-500/20 relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                <Users size={120} />
              </div>
              
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-black rounded-full animate-pulse" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Workforce Status</span>
                </div>
                <h2 className="text-5xl font-black leading-tight">{employees.length}</h2>
                <p className="text-sm font-bold opacity-70 mt-1">Total Active Employees</p>
              </div>

              <div className="relative z-10 mt-8">
                <div className="flex items-center justify-between border-t border-black/10 pt-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-50">On Rotation</p>
                    <p className="text-sm font-bold">{employees.filter(e => e.role === 'bess_tech').length} Techs</p>
                  </div>
                  <button 
                    onClick={() => {
                      haptics.impact();
                      setActiveTab('employees');
                    }}
                    className="bg-black/10 px-4 py-2 rounded-2xl font-black text-[10px] uppercase tracking-widest active-scale"
                  >
                    Manage
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Active Jobsites Tile */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                haptics.impact();
                setActiveTab('jobsites');
              }}
              className="bg-[#0A120F] rounded-[32px] p-6 border border-white/5 flex flex-col items-center justify-center gap-3 group hover:border-emerald-500/30 transition-all active-scale"
            >
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                <MapPin size={24} />
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-white">{jobsites.length}</div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Jobsites</span>
              </div>
            </motion.button>

            {/* Pending Surveys Tile */}
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                haptics.impact();
                setActiveTab('surveys');
              }}
              className="bg-[#0A120F] rounded-[32px] p-6 border border-white/5 flex flex-col items-center justify-center gap-3 group hover:border-emerald-500/30 transition-all active-scale"
            >
              <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                <MessageSquare size={24} />
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-white">12</div>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Surveys</span>
              </div>
            </motion.button>

            {/* System Health Tile (Wide) */}
            <motion.div
              whileTap={{ scale: 0.98 }}
              className="col-span-2 bg-[#0A120F] rounded-[32px] p-6 border border-white/5 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">System Sync Status</span>
                <span className="text-[10px] font-bold text-emerald-500">100% Operational</span>
              </div>
              <div className="h-3 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                />
              </div>
              <div className="flex justify-between mt-3">
                <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">Database</span>
                <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest">Real-time</span>
              </div>
            </motion.div>

            {/* Quick Admin Actions */}
            <div className="col-span-2 bg-[#0A120F] rounded-[32px] p-6 border border-white/5">
              <h2 className="text-lg font-bold text-white mb-6">Quick Actions</h2>
              <div className="grid grid-cols-2 gap-3">
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    haptics.impact();
                    setActiveTab('announcements');
                  }}
                  className="flex flex-col items-center justify-center gap-2 p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-all active-scale"
                >
                  <Megaphone size={20} className="text-emerald-500" />
                  <span className="text-[10px] font-bold text-gray-400">Broadcast</span>
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    haptics.impact();
                    setActiveTab('importer');
                  }}
                  className="flex flex-col items-center justify-center gap-2 p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-emerald-500/30 transition-all active-scale"
                >
                  <Upload size={20} className="text-emerald-500" />
                  <span className="text-[10px] font-bold text-gray-400">Import</span>
                </motion.button>
              </div>
            </div>

            {/* Recent Alerts Tile */}
            <div className="col-span-2 bg-[#0A120F] rounded-[32px] p-6 border border-white/5">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-white">Recent Alerts</h2>
                <span className="px-3 py-1 bg-red-500/10 text-red-500 rounded-full text-[9px] font-black uppercase tracking-widest">
                  2 New
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
                  <div className="w-8 h-8 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
                    <AlertTriangle size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">Rotation Conflict Detected</p>
                    <p className="text-[10px] text-gray-500">Site: BESS-04</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/5">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <History size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">CSV Import Pending Review</p>
                    <p className="text-[10px] text-gray-500">Source: HR Portal</p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </motion.div>
      );
      case 'scheduler': return <Scheduler employees={employees} jobsites={jobsites} jobsiteGroups={jobsiteGroups} />;
      case 'chat': return <div className="h-[calc(100vh-12rem)]"><AdminChatView jobsites={jobsites} jobsiteGroups={jobsiteGroups} /></div>;
      case 'bulk': return <BulkAssignments employees={employees} jobsites={jobsites} jobsiteGroups={jobsiteGroups} />;
      case 'map': return <MapPortal jobsites={jobsites} jobsiteGroups={jobsiteGroups} />;
      case 'manpower': return <ManpowerView employees={employees} jobsites={jobsites} jobsiteGroups={jobsiteGroups} />;
      case 'employees': return <EmployeeManagement employees={employees} onUpdate={fetchData} />;
      case 'rotations': return <RotationManagement employees={employees} onUpdate={fetchData} />;
      case 'lookahead': return <RotationLookAhead employees={employees} />;
      case 'jobsites': return <JobsiteManager jobsites={jobsites} onUpdate={fetchData} />;
      case 'groups': return <GroupManager jobsites={jobsites} jobsiteGroups={jobsiteGroups} employees={employees} onUpdate={fetchData} />;
      case 'group-assignment': return <GroupAssignmentTool jobsites={jobsites} jobsiteGroups={jobsiteGroups} employees={employees} onUpdate={fetchData} />;
      case 'requests': return <RequestsManagement />;
      case 'content': return <PortalContentManager />;
      case 'surveys': return <SurveyReviewTab userRole="admin" userId="all" />;
      case 'analytics': return <Analytics employees={employees} jobsites={jobsites} />;
      case 'forecast': return <LogisticsForecast employees={employees} jobsites={jobsites} jobsiteGroups={jobsiteGroups} />;
      case 'health': return <DataHealth employees={employees} jobsites={jobsites} />;
      case 'chatsync': return <ChatSyncManager />;
      case 'importer': return <DataImporter employees={employees} />;
      case 'rotation-importer': return <CsvRotationImporter onImportSuccess={fetchData} />;
      case 'logs': return <SystemLogs />;
      default: return null;
    }
  };

  return (
    <PortalLayout
      title={getTitle()}
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onRefresh={() => fetchData(true)}
    >
      {loading ? (
        <DashboardSkeleton />
      ) : (
        renderContent()
      )}
    </PortalLayout>
  );
}
