import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { PerformancePulseData } from '../types/surveys';

interface PerformancePulseTileProps {
  targetId: string;
}

export const PerformancePulseTile: React.FC<PerformancePulseTileProps> = ({ targetId }) => {
  const [data, setData] = useState<PerformancePulseData | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      // 1. Fetch all submissions for this target
      const { data: submissions, error } = await supabase
        .from('survey_submissions')
        .select('scores')
        .eq('target_id', targetId);

      if (error || !submissions || submissions.length === 0) return;

      // 2. Fetch all questions to map IDs to categories
      const { data: questions } = await supabase.from('survey_questions').select('id, category');
      if (!questions) return;

      const questionMap = new Map(questions.map(q => [q.id, q.category]));

      // 3. Calculate averages
      const categoryScores: Record<string, number[]> = {};
      
      submissions.forEach(sub => {
        Object.entries(sub.scores as Record<string, number>).forEach(([qId, score]) => {
          const category = questionMap.get(qId);
          if (category) {
            if (!categoryScores[category]) categoryScores[category] = [];
            categoryScores[category].push(score);
          }
        });
      });

      const categoryAverages = Object.entries(categoryScores).map(([category, scores]) => ({
        category,
        average: scores.reduce((a, b) => a + b, 0) / scores.length
      }));

      const allScores = Object.values(categoryScores).flat();
      const overallAverage = allScores.reduce((a, b) => a + b, 0) / allScores.length;

      setData({ categoryAverages, overallAverage });
    };

    fetchData();
  }, [targetId]);

  if (!data) return <div className="p-4 bg-[#0A120F] border border-white/5 rounded-2xl text-gray-500 text-xs">No survey data yet.</div>;

  return (
    <div className="p-4 bg-[#0A120F] border border-white/5 rounded-2xl">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Performance Pulse</h3>
      <div className="space-y-2">
        {data.categoryAverages.map(cat => (
          <div key={cat.category} className="flex justify-between text-xs">
            <span className="text-gray-400">{cat.category}</span>
            <span className="font-bold text-emerald-500">{cat.average.toFixed(1)}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center">
        <span className="text-xs font-bold text-gray-300">Overall</span>
        <span className="text-lg font-bold text-emerald-500">{data.overallAverage.toFixed(1)}</span>
      </div>
    </div>
  );
};
