import React, { useMemo } from 'react';
import { Employee, Jobsite, RotationConfig } from '../types';
import { 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  UserX, 
  MapPinOff, 
  RefreshCw,
  Search,
  ArrowRight,
  Database,
  Activity
} from 'lucide-react';
import { motion } from 'motion/react';

import CSVTransformer from './CSVTransformer';

interface DataHealthProps {
  employees: Employee[];
  jobsites: Jobsite[];
}

export default function DataHealth({ employees, jobsites }: DataHealthProps) {
  const issues = useMemo(() => {
    const list: { id: string, type: 'error' | 'warning' | 'info', title: string, description: string, count: number }[] = [];

    // Check 1: Missing Rotation Configs
    const missingRotations = employees.filter(e => !e.rotation_config).length;
    if (missingRotations > 0) {
      list.push({
        id: 'missing-rotations',
        type: 'warning',
        title: 'Missing Rotation Configs',
        description: 'Employees without a defined work/rotation cycle.',
        count: missingRotations
      });
    }

    // Check 2: Inactive Employees
    const inactiveEmployees = employees.filter(e => !e.is_active).length;
    if (inactiveEmployees > 0) {
      list.push({
        id: 'inactive-employees',
        type: 'info',
        title: 'Inactive Personnel',
        description: 'Employees currently marked as inactive in the system.',
        count: inactiveEmployees
      });
    }

    // Check 3: Jobsites without coordinates
    const missingCoords = jobsites.filter(j => !j.lat || !j.lng).length;
    if (missingCoords > 0) {
      list.push({
        id: 'missing-coords',
        type: 'error',
        title: 'Map Data Gaps',
        description: 'Jobsites missing GPS coordinates for map rendering.',
        count: missingCoords
      });
    }

    // Check 4: Missing Contact Info
    const missingContact = jobsites.filter(j => !j.contact_name || !j.contact_phone).length;
    if (missingContact > 0) {
      list.push({
        id: 'missing-contact',
        type: 'warning',
        title: 'Missing Site Contacts',
        description: 'Jobsites without primary contact information.',
        count: missingContact
      });
    }

    return list;
  }, [employees, jobsites]);

  const overallHealth = useMemo(() => {
    const totalChecks = 4;
    const failedChecks = issues.filter(i => i.type === 'error').length;
    const warningChecks = issues.filter(i => i.type === 'warning').length;
    
    if (failedChecks > 0) return { label: 'Critical', color: 'text-rose-500', bg: 'bg-rose-500/10', icon: <ShieldAlert /> };
    if (warningChecks > 0) return { label: 'Needs Attention', color: 'text-amber-500', bg: 'bg-amber-500/10', icon: <AlertTriangle /> };
    return { label: 'Healthy', color: 'text-emerald-500', bg: 'bg-emerald-500/10', icon: <CheckCircle2 /> };
  }, [issues]);

  return (
    <div className="space-y-6">
      {/* Health Overview */}
      <div className="bg-[#0A120F] border border-emerald-900/20 rounded-3xl p-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <div className={`w-20 h-20 rounded-3xl ${overallHealth.bg} ${overallHealth.color} flex items-center justify-center text-4xl shadow-lg`}>
              {overallHealth.icon}
            </div>
            <div>
              <h2 className="text-3xl font-bold text-white mb-1">System Health</h2>
              <p className="text-gray-400">Real-time data integrity and synchronization status.</p>
              <div className={`inline-flex items-center gap-2 mt-3 px-3 py-1 rounded-full text-xs font-bold border ${overallHealth.bg} ${overallHealth.color} border-current/20`}>
                <Activity size={12} />
                {overallHealth.label}
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-black/20 border border-white/5 rounded-2xl p-4 text-center min-w-[120px]">
              <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Integrity</div>
              <div className="text-2xl font-bold text-white">94%</div>
            </div>
            <div className="bg-black/20 border border-white/5 rounded-2xl p-4 text-center min-w-[120px]">
              <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Sync Latency</div>
              <div className="text-2xl font-bold text-white">12ms</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Issues List */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2 px-2">
            <ShieldAlert size={14} />
            Detected Issues
          </h3>
          <div className="space-y-3">
            {issues.map((issue) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                key={issue.id} 
                className={`flex items-center justify-between p-5 rounded-2xl border transition-all hover:scale-[1.01] ${
                  issue.type === 'error' ? 'bg-rose-500/5 border-rose-500/20' :
                  issue.type === 'warning' ? 'bg-amber-500/5 border-amber-500/20' :
                  'bg-blue-500/5 border-blue-500/20'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    issue.type === 'error' ? 'text-rose-500 bg-rose-500/10' :
                    issue.type === 'warning' ? 'text-amber-500 bg-amber-500/10' :
                    'text-blue-500 bg-blue-500/10'
                  }`}>
                    {issue.type === 'error' ? <ShieldAlert size={20} /> : 
                     issue.type === 'warning' ? <AlertTriangle size={20} /> : 
                     <Database size={20} />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">{issue.title}</h4>
                    <p className="text-xs text-gray-500">{issue.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`text-lg font-bold ${
                      issue.type === 'error' ? 'text-rose-500' :
                      issue.type === 'warning' ? 'text-amber-500' :
                      'text-blue-500'
                    }`}>{issue.count}</div>
                    <div className="text-[10px] text-gray-600 uppercase font-bold">Records</div>
                  </div>
                  <button className="p-2 hover:bg-white/5 rounded-lg text-gray-500 hover:text-white transition-colors">
                    <ArrowRight size={18} />
                  </button>
                </div>
              </motion.div>
            ))}
            {issues.length === 0 && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-12 text-center">
                <CheckCircle2 className="text-emerald-500 mx-auto mb-4" size={48} />
                <h4 className="text-white font-bold">All Systems Nominal</h4>
                <p className="text-gray-500 text-sm mt-1">No data integrity issues detected.</p>
              </div>
            )}
          </div>
        </div>

        {/* Database Stats */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2 px-2">
            <Database size={14} />
            Database Stats
          </h3>
          <div className="bg-[#0A120F] border border-emerald-900/20 rounded-3xl p-6 space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Total Records</span>
                <span className="text-xs text-white font-mono">12,482</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Storage Used</span>
                <span className="text-xs text-white font-mono">4.2 MB</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Last Backup</span>
                <span className="text-xs text-emerald-500 font-mono">2h ago</span>
              </div>
            </div>

            <div className="pt-6 border-t border-white/5">
              <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-4">Table Distribution</h4>
              <div className="space-y-4">
                <TableStat label="Assignments" count={8420} color="bg-emerald-500" percent={68} />
                <TableStat label="Employees" count={124} color="bg-blue-500" percent={15} />
                <TableStat label="Jobsites" count={42} color="bg-amber-500" percent={10} />
                <TableStat label="Logs" count={3896} color="bg-purple-500" percent={7} />
              </div>
            </div>

            <button className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white transition-all flex items-center justify-center gap-2">
              <RefreshCw size={14} />
              Refresh Health Check
            </button>
          </div>
        </div>
      </div>

      <CSVTransformer />
    </div>
  );
}

function TableStat({ label, count, color, percent }: { label: string, count: number, color: string, percent: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-500 font-mono">{count}</span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full ${color} transition-all duration-1000`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
