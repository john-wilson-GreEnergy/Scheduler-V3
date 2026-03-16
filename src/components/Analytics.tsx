import React, { useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { Jobsite, Employee } from '../types';
import { TrendingUp, Users, MapPin, AlertCircle, Clock, ArrowUpRight, ArrowDownRight, Activity, Zap } from 'lucide-react';
import { motion } from 'motion/react';

interface AnalyticsProps {
  employees: Employee[];
  jobsites: Jobsite[];
}

export default function Analytics({ employees, jobsites }: AnalyticsProps) {
  const staffingData = useMemo(() => [
    { name: 'Mon', staffed: 45, required: 50 },
    { name: 'Tue', staffed: 48, required: 50 },
    { name: 'Wed', staffed: 52, required: 50 },
    { name: 'Thu', staffed: 42, required: 55 },
    { name: 'Fri', staffed: 55, required: 55 },
    { name: 'Sat', staffed: 58, required: 55 },
    { name: 'Sun', staffed: 60, required: 55 },
  ], []);

  const siteDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};
    jobsites.forEach(site => {
      if (site.is_active && site.state) {
        distribution[site.state] = (distribution[site.state] || 0) + 1;
      }
    });
    return Object.entries(distribution).map(([name, value]) => ({ name, value }));
  }, [jobsites]);

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444'];

  return (
    <div className="space-y-8">
      {/* Top Stats - Bento Style */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Total Workforce" 
          value={employees.length.toString()} 
          change="+4.2%" 
          trend="up"
          icon={<Users className="text-emerald-500" />} 
          description="Active personnel in system"
        />
        <StatCard 
          title="Active Jobsites" 
          value={jobsites.length.toString()} 
          change="+2" 
          trend="up"
          icon={<MapPin className="text-blue-500" />} 
          description="Operational project sites"
        />
        <StatCard 
          title="Utilization" 
          value="94.8%" 
          change="-1.2%" 
          trend="down"
          icon={<Activity className="text-amber-500" />} 
          description="Resource allocation efficiency"
        />
        <StatCard 
          title="Safety Score" 
          value="98/100" 
          change="Stable" 
          trend="up"
          icon={<Zap className="text-purple-500" />} 
          description="Compliance and safety rating"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Chart - Large Bento */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 bg-[#0A120F] border border-emerald-900/20 rounded-[2.5rem] p-8 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <TrendingUp size={20} className="text-emerald-500" />
                Workforce Velocity
              </h3>
              <p className="text-xs text-gray-500 mt-1">Daily staffing levels vs. project requirements</p>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold rounded-lg border border-emerald-500/20">Daily</button>
              <button className="px-3 py-1 bg-white/5 text-gray-500 text-[10px] font-bold rounded-lg hover:text-white transition-colors">Weekly</button>
            </div>
          </div>
          
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={staffingData}>
                <defs>
                  <linearGradient id="colorStaffed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} opacity={0.3} />
                <XAxis dataKey="name" stroke="#4b5563" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#4b5563" fontSize={11} tickLine={false} axisLine={false} dx={-10} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#050A08', border: '1px solid #064e3b', borderRadius: '16px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}
                  itemStyle={{ color: '#10b981', fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="staffed" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorStaffed)" />
                <Area type="monotone" dataKey="required" stroke="#3b82f6" fill="transparent" strokeDasharray="8 8" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Side Bento - Distribution */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#0A120F] border border-emerald-900/20 rounded-[2.5rem] p-8 flex flex-col"
        >
          <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
            <MapPin size={20} className="text-blue-500" />
            Regional Reach
          </h3>
          <p className="text-xs text-gray-500 mb-8">Geographic distribution of active sites</p>
          
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={siteDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={90}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {siteDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#050A08', border: '1px solid #064e3b', borderRadius: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="grid grid-cols-2 gap-4 w-full mt-8">
              {siteDistribution.map((item, i) => (
                <div key={item.name} className="bg-white/5 border border-white/5 p-3 rounded-2xl">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                    <span className="text-[10px] text-gray-500 font-bold uppercase">{item.name}</span>
                  </div>
                  <div className="text-lg font-bold text-white">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Site Performance Table */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0A120F] border border-emerald-900/20 rounded-[2.5rem] overflow-hidden shadow-2xl"
      >
        <div className="p-8 border-b border-emerald-900/10 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">Jobsite Performance Matrix</h3>
            <p className="text-xs text-gray-500 mt-1">Real-time operational status across all locations</p>
          </div>
          <button className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white transition-all">
            Export Report
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/5 text-gray-500 text-[10px] uppercase font-bold tracking-[0.2em]">
                <th className="px-8 py-5">Jobsite / Location</th>
                <th className="px-8 py-5">Customer</th>
                <th className="px-8 py-5">Staffing Efficiency</th>
                <th className="px-8 py-5">Compliance</th>
                <th className="px-8 py-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-900/10">
              {jobsites.filter(s => s.is_active).map((site) => (
                <tr key={site.id} className="hover:bg-emerald-500/[0.02] transition-colors group">
                  <td className="px-8 py-6">
                    <div className="text-white font-bold group-hover:text-emerald-400 transition-colors">{site.jobsite_name}</div>
                    <div className="text-xs text-gray-500 font-medium">{site.city}, {site.state}</div>
                  </td>
                  <td className="px-8 py-6">
                    <span className="text-sm text-gray-400 font-medium">{site.customer}</span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="flex-1 max-w-[120px] h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: '85%' }}
                          className="h-full bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]" 
                        />
                      </div>
                      <span className="text-xs text-white font-mono font-bold">85%</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${(site.safety_score || 0) >= 90 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <span className={`text-[10px] font-black uppercase tracking-wider ${(site.safety_score || 0) >= 90 ? 'text-emerald-500' : 'text-amber-500'}`}>
                          {site.safety_score}% Score
                        </span>
                      </div>
                      <div className="text-[8px] text-gray-600 font-bold uppercase tracking-tighter">
                        {(site.safety_score || 0) >= 90 ? 'High Compliance' : 'Review Required'}
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2 text-emerald-500 text-sm font-bold">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}

function StatCard({ title, value, change, trend, icon, description }: { title: string, value: string, change: string, trend: 'up' | 'down', icon: React.ReactNode, description: string }) {
  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-[#0A120F] border border-emerald-900/20 p-8 rounded-[2rem] shadow-xl hover:border-emerald-500/30 transition-all group relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-emerald-500/10 transition-colors" />
      
      <div className="flex items-center justify-between mb-6">
        <div className="p-4 bg-white/5 rounded-2xl group-hover:bg-emerald-500/10 group-hover:text-emerald-500 transition-all">
          {icon}
        </div>
        <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
          trend === 'up' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
        }`}>
          {trend === 'up' ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
          {change}
        </div>
      </div>
      
      <div className="relative z-10">
        <div className="text-4xl font-black text-white mb-2 tracking-tight">{value}</div>
        <div className="text-xs font-bold text-gray-400 uppercase tracking-[0.15em] mb-1">{title}</div>
        <p className="text-[10px] text-gray-600 font-medium">{description}</p>
      </div>
    </motion.div>
  );
}
