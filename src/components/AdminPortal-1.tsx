import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Employee, RotationConfig, Jobsite } from '../types';
import PortalLayout from './PortalLayout';
import RotationManagement from './RotationManagement';
import MapPortal from './MapPortal';
import Scheduler from './Scheduler';
import Analytics from './Analytics';
import EmployeeManagement from './EmployeeManagement';
import RequestsManagement from './RequestsManagement';
import DataHealth from './DataHealth';
import SystemLogs from './SystemLogs';
import JobsiteManager from './JobsiteManager';
import ManpowerView from './ManpowerView';
import BulkAssignments from './BulkAssignments';
import LogisticsForecast from './LogisticsForecast';
import PortalContentManager from './PortalContentManager';
import { Users, RefreshCw, Map as MapIcon, Calendar, BarChart3, ClipboardList, History, MapPin, LayoutGrid, Layers, TrendingUp, Activity, Megaphone } from 'lucide-react';

export default function AdminPortal() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    const [empRes, siteRes, rotRes] = await Promise.all([
      supabase.from('employees').select('*').order('last_name'),
      supabase.from('jobsites').select('*').order('jobsite_name'),
      supabase.from('rotation_configs').select('*')
    ]);

    if (empRes.data) {
      const configs = rotRes.data || [];
      setEmployees(empRes.data.map(emp => ({
        ...emp,
        rotation_config: configs.find(c => c.employee_fk === emp.id) || null
      })));
    }
    if (siteRes.data) setJobsites(siteRes.data);
    if (!silent) setLoading(false);
  };

  const syncProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existing } = await supabase
      .from('employees')
      .select('id, auth_user_id')
      .eq('email', user.email)
      .maybeSingle();

    if (existing && !existing.auth_user_id) {
      await supabase
        .from('employees')
        .update({ auth_user_id: user.id })
        .eq('id', existing.id);
      fetchData(true);
    }
  };

  useEffect(() => {
    fetchData();
    syncProfile();
  }, []);

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: <Calendar size={16} />, category: 'Operations' },
    { id: 'manpower', label: 'Manpower', icon: <LayoutGrid size={16} />, category: 'Operations' },
    { id: 'map', label: 'Map View', icon: <MapIcon size={16} />, category: 'Operations' },
    { id: 'bulk-assignments', label: 'Bulk Assignments', icon: <Layers size={16} />, category: 'Operations' },
    { id: 'requests', label: 'Requests', icon: <ClipboardList size={16} />, category: 'Operations' },
    
    { id: 'employees', label: 'Employees', icon: <Users size={16} />, category: 'Management' },
    { id: 'rotations', label: 'Rotations', icon: <RefreshCw size={16} />, category: 'Management' },
    { id: 'jobsites', label: 'Jobsites', icon: <MapPin size={16} />, category: 'Management' },
    { id: 'portal-content', label: 'Portal Content', icon: <Megaphone size={16} />, category: 'Management' },
    
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={16} />, category: 'Insights' },
    { id: 'forecast', label: 'Logistics Forecast', icon: <TrendingUp size={16} />, category: 'Insights' },
    
    { id: 'data-health', label: 'Health', icon: <Activity size={16} />, category: 'System' },
    { id: 'logs', label: 'Logs', icon: <History size={16} />, category: 'System' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050A08] flex items-center justify-center">
        <RefreshCw className="text-emerald-500 animate-spin" size={32} />
      </div>
    );
  }

  return (
    <PortalLayout 
      title="Admin — Master Scheduler" 
      tabs={tabs} 
      activeTab={activeTab} 
      onTabChange={setActiveTab}
    >
      {activeTab === 'dashboard' && <Scheduler employees={employees} jobsites={jobsites} />}
      {activeTab === 'manpower' && <ManpowerView employees={employees} jobsites={jobsites} />}
      {activeTab === 'analytics' && <Analytics employees={employees} jobsites={jobsites} />}
      {activeTab === 'employees' && <EmployeeManagement employees={employees} onUpdate={fetchData} />}
      {activeTab === 'rotations' && <RotationManagement employees={employees} onUpdate={fetchData} />}
      {activeTab === 'jobsites' && <JobsiteManager jobsites={jobsites} onUpdate={fetchData} />}
      {activeTab === 'portal-content' && <PortalContentManager />}
      {activeTab === 'forecast' && <LogisticsForecast employees={employees} jobsites={jobsites} onNavigate={setActiveTab} />}
      {activeTab === 'bulk-assignments' && <BulkAssignments employees={employees} jobsites={jobsites} />}
      {activeTab === 'map' && <MapPortal jobsites={jobsites} employees={employees} />}
      {activeTab === 'requests' && <RequestsManagement />}
      {activeTab === 'data-health' && <DataHealth employees={employees} jobsites={jobsites} />}
      {activeTab === 'logs' && <SystemLogs />}
    </PortalLayout>
  );
}
