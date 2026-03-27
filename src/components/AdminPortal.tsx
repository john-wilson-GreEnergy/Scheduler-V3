import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
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
import { Users, RefreshCw, Map as MapIcon, Calendar, BarChart3, ClipboardList, History, MapPin, LayoutGrid, Layers, TrendingUp, Activity, Megaphone, MessageSquare, Upload } from 'lucide-react';

export default function AdminPortal() {
  const IS_SIMULATED = false; // Match AuthContext
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [jobsiteGroups, setJobsiteGroups] = useState<JobsiteGroup[]>([]);
  const [loading, setLoading] = useState(!IS_SIMULATED);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async (silent = false) => {
    try {
      console.log('AdminPortal: fetchData called');
      if (!silent) setLoading(true);
      setError(null);

      if (!isSupabaseConfigured) {
        console.warn('AdminPortal: Supabase is not configured. Skipping fetch.');
        setError('Supabase is not configured. Please check your environment variables.');
        return;
      }

      const [empRes, siteRes, rotRes, groupRes] = await Promise.all([
        supabase.from('employees').select('*').order('last_name'),
        supabase.from('jobsites').select('*, min_staffing').order('jobsite_name'),
        supabase.from('rotation_configs').select('*'),
        supabase.from('jobsite_groups').select('*').order('name')
      ]);

      console.log('AdminPortal: Fetch results', { 
        employees: empRes.data?.length || 0, 
        jobsites: siteRes.data?.length || 0, 
        rotations: rotRes.data?.length || 0, 
        groups: groupRes.data?.length || 0 
      });

      if (empRes.error) {
        console.error('Error fetching employees:', empRes.error);
        setError(`Error fetching employees: ${empRes.error.message}`);
      }
      if (siteRes.error) {
        console.error('Error fetching jobsites:', siteRes.error);
        setError(`Error fetching jobsites: ${siteRes.error.message}`);
      }
      if (rotRes.error) {
        console.error('Error fetching rotation configs:', rotRes.error);
        setError(`Error fetching rotations: ${rotRes.error.message}`);
      }
      if (groupRes.error) {
        console.error('Error fetching jobsite groups:', groupRes.error);
        setError(`Error fetching groups: ${groupRes.error.message}`);
      }

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
    } catch (err) {
      console.error('AdminPortal: Error in fetchData:', err);
    } finally {
      if (!silent) setLoading(false);
    }
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
    { id: 'dashboard', label: 'Dashboard', icon: <Calendar size={16} />, category: 'Operations' },
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
      case 'dashboard': return <Scheduler employees={employees} jobsites={jobsites} jobsiteGroups={jobsiteGroups} />;
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
      case 'importer': return <DataImporter employees={employees} jobsites={jobsites} />;
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
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isSupabaseConfigured ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`} />
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
            {isSupabaseConfigured ? 'Supabase Connected' : 'Supabase Disconnected'}
          </span>
        </div>
        {IS_SIMULATED && (
          <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Simulation Mode Active</span>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-500">
          <Activity size={18} />
          <p className="text-sm font-bold">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="text-emerald-500 animate-spin" size={32} />
        </div>
      ) : employees.length === 0 && activeTab === 'dashboard' ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Users className="text-gray-700 mb-4" size={48} />
          <h3 className="text-lg font-bold text-white mb-2">No Employee Data Found</h3>
          <p className="text-sm text-gray-500 max-w-md">
            The database appears to be empty or connection is restricted. 
            Try importing data via the "System &gt; Data Import" tab.
          </p>
          <button 
            onClick={() => setActiveTab('importer')}
            className="mt-6 px-6 py-2 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-all"
          >
            Go to Importer
          </button>
        </div>
      ) : (
        renderContent()
      )}
    </PortalLayout>
  );
}
