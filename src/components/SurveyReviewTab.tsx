import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Search, Calendar } from 'lucide-react';

interface SurveyReviewTabProps {
  userRole: 'admin' | 'manager' | 'employee';
  userId: string;
}

export const SurveyReviewTab: React.FC<SurveyReviewTabProps> = ({ userRole, userId }) => {
  const [surveys, setSurveys] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedSurvey, setSelectedSurvey] = useState<any | null>(null);

  useEffect(() => {
    const fetchSurveysAndQuestions = async () => {
      const [surveysRes, questionsRes] = await Promise.all([
        supabase
          .from('survey_submissions')
          .select(`
            *,
            rater:employees!rater_id(first_name, last_name),
            target:employees!target_id(first_name, last_name)
          `),
        supabase.from('survey_questions').select('id, question_text')
      ]);

      if (surveysRes.data) setSurveys(surveysRes.data);
      if (questionsRes.data) setQuestions(questionsRes.data);
    };

    fetchSurveysAndQuestions();
  }, [userRole, userId]);

  const questionMap = new Map(questions.map(q => [q.id, q.question_text]));

  const filteredSurveys = surveys.filter(s => {
    const raterName = `${s.rater.first_name} ${s.rater.last_name}`.toLowerCase();
    const targetName = `${s.target.first_name} ${s.target.last_name}`.toLowerCase();
    const matchesSearch = raterName.includes(searchTerm.toLowerCase()) || targetName.includes(searchTerm.toLowerCase());
    const matchesDate = dateFilter ? s.week_start_date === dateFilter : true;
    return matchesSearch && matchesDate;
  });

  return (
    <div className="p-6 bg-[#0A120F] border border-white/5 rounded-3xl">
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-4 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by employee name..." 
              className="pl-10 pr-4 py-2 w-full bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <input 
            type="date" 
            className="px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-emerald-500"
            onChange={(e) => setDateFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left text-gray-300">
          <thead className="text-xs text-gray-500 uppercase bg-white/5">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Rater</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredSurveys.map(s => (
              <tr key={s.id} className="hover:bg-white/5 cursor-pointer" onClick={() => setSelectedSurvey(s)}>
                <td className="px-4 py-3">{s.week_start_date}</td>
                <td className="px-4 py-3">{s.rater.first_name} {s.rater.last_name}</td>
                <td className="px-4 py-3">{s.target.first_name} {s.target.last_name}</td>
                <td className="px-4 py-3">{s.survey_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedSurvey && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0A120F] border border-white/10 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-white">Survey Details</h2>
              <button onClick={() => setSelectedSurvey(null)} className="text-gray-400 hover:text-white">Close</button>
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">Scores</h3>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(selectedSurvey.scores).map(([key, value]) => (
                    <div key={key} className="bg-white/5 p-3 rounded-xl">
                      <p className="text-xs text-gray-400">{questionMap.get(key) || key.replace(/_/g, ' ')}</p>
                      <p className="text-lg font-bold text-emerald-500">{value as number}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">Comments</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-400">What went well?</p>
                    <p className="text-sm text-white bg-white/5 p-3 rounded-xl mt-1">{selectedSurvey.comments.well}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">What to improve?</p>
                    <p className="text-sm text-white bg-white/5 p-3 rounded-xl mt-1">{selectedSurvey.comments.improve}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Notes</p>
                    <p className="text-sm text-white bg-white/5 p-3 rounded-xl mt-1">{selectedSurvey.comments.notes}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
