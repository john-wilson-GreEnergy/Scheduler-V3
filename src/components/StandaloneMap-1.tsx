import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import MapPortal from './MapPortal';
import { Jobsite } from '../types';
import { RefreshCw, Construction } from 'lucide-react';

export default function StandaloneMap() {
  const [jobsites, setJobsites] = useState<Jobsite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchJobsites = async () => {
      const { data } = await supabase
        .from('jobsites')
        .select('*')
        .eq('is_active', true);
      
      if (data) {
        setJobsites(data);
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
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Construction className="text-black w-6 h-6" />
          </div>
          <div>
            <h1 className="text-white font-bold tracking-tight text-lg">GreEnergy Map Portal</h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Standalone View</p>
          </div>
        </div>
        
        <div className="h-[calc(100vh-140px)]">
          <MapPortal jobsites={jobsites} />
        </div>
      </div>
    </div>
  );
}
