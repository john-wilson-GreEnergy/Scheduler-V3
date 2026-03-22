import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import MapPortal from './MapPortal';
import { Jobsite, JobsiteGroup } from '../types';
import { RefreshCw } from 'lucide-react';

export default function StandaloneMap() {
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [jobsiteGroups, setJobsiteGroups] = useState<JobsiteGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobsites = async () => {
      const [siteRes, groupRes] = await Promise.all([
        supabase.from('jobsites').select('*').eq('is_active', true),
        supabase.from('jobsite_groups').select('*')
      ]);
      
      if (siteRes.data) {
        setJobsites(siteRes.data);
      }
      if (groupRes.data) {
        setJobsiteGroups(groupRes.data);
      }
      setLoading(false);
    };

    fetchJobsites();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050A08] flex items-center justify-center">
        <RefreshCw className="text-emerald-500 animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050A08] p-6">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <img src="/logo.png" alt="Greenergy Logo" className="h-10 object-contain" referrerPolicy="no-referrer" />
          <div className="flex flex-col items-start justify-center">
            <span className="text-white font-bold text-xl leading-none tracking-tight">GreEnergy</span>
            <span className="text-emerald-500 font-bold text-[0.55rem] uppercase tracking-[0.2em] leading-tight mt-0.5">RESOURCES</span>
          </div>
          <div className="border-l border-white/10 pl-4 ml-2">
            <h1 className="text-white font-bold tracking-tight text-lg">Map Portal</h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Standalone View</p>
          </div>
        </div>
        
        <div className="h-[calc(100vh-140px)]">
          <MapPortal jobsites={jobsites} jobsiteGroups={jobsiteGroups} />
        </div>
      </div>
    </div>
  );
}
