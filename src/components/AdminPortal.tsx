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
import { Users, RefreshCw, Map as MapIcon, Calendar, BarChart3, ClipboardList, History, MapPin, LayoutGrid, Layers, TrendingUp, Activity, Megaphone, MessageSquare, Upload } from 'lucide-react';

export default function AdminPortal() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [jobsiteGroups, setJobsiteGroups] = useState<JobsiteGroup[]>([]);
  const [loading, setLoading] = useState(true);

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
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="text-emerald-500 animate-spin" size={32} />
        </div>
      ) : (
        renderContent()
      )}
    </PortalLayout>
  );
}
