import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, ShieldCheck, Award, AlertCircle } from 'lucide-react';

interface ReadinessData {
  readinessScore: number;
  readinessStatus: string;
  trendDelta: number;
  consistencyStdDev: number;
  safetyScore: number;
  topStrength: string;
  focusArea: string;
  recommendation: string;
  isEligible: boolean;
}

export const PromotionReadinessView: React.FC<{ employeeUserId: string; targetRole: string }> = ({ employeeUserId, targetRole }) => {
  const [data, setData] = useState<ReadinessData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/promotion-readiness/${employeeUserId}?targetRole=${targetRole}`)
      .then(res => res.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [employeeUserId, targetRole]);

  if (loading) return <div>Loading...</div>;
  if (!data) return <div>No data available.</div>;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-[#0A120F] border border-white/5 rounded-3xl p-8 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-white">Promotion Readiness: {targetRole.replace('_', ' ').toUpperCase()}</h2>
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${data.isEligible ? 'bg-emerald-500/20 text-emerald-500' : 'bg-red-500/20 text-red-500'}`}>
          {data.readinessStatus}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
          <p className="text-xs text-gray-400">Readiness Score</p>
          <p className="text-3xl font-bold text-white">{data.readinessScore}%</p>
        </div>
        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
          <p className="text-xs text-gray-400">Trend</p>
          <p className={`text-3xl font-bold ${data.trendDelta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
            {data.trendDelta > 0 ? '+' : ''}{data.trendDelta}
          </p>
        </div>
        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
          <p className="text-xs text-gray-400">Safety Score</p>
          <p className="text-3xl font-bold text-white">{data.safetyScore}</p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-bold text-white">Recommendation</p>
        <p className="text-sm text-gray-400">{data.recommendation}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2 text-emerald-500 text-sm">
          <Award size={16} />
          <span>Strength: {data.topStrength}</span>
        </div>
        <div className="flex items-center gap-2 text-amber-500 text-sm">
          <AlertCircle size={16} />
          <span>Focus: {data.focusArea}</span>
        </div>
      </div>
    </motion.div>
  );
};
