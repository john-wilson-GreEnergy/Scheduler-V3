import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, Send } from 'lucide-react';
import { SurveyType, SurveyQuestion } from '../types/surveys';
import { getSurveyQuestions, submitSurvey } from '../services/surveyService';

interface SurveyModalProps {
  isOpen: boolean;
  onClose: () => void;
  surveyType: SurveyType;
  raterId: string;
  targetId: string;
  weekStartDate: string;
}

export const SurveyModal: React.FC<SurveyModalProps> = ({ isOpen, onClose, surveyType, raterId, targetId, weekStartDate }) => {
  console.log('Debug: SurveyModal received surveyType:', surveyType);
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comments, setComments] = useState({ well: '', improve: '', notes: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getSurveyQuestions(surveyType).then(setQuestions);
    }
  }, [isOpen, surveyType]);

  if (!isOpen) return null;

  const categories = Array.from(new Set(questions.map(q => q.category)));
  const currentCategory = categories[currentStep];
  const categoryQuestions = questions.filter(q => q.category === currentCategory);

  const handleScoreChange = (questionId: string, score: number) => {
    setScores(prev => ({ ...prev, [questionId]: score }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await submitSurvey(raterId, targetId, surveyType, weekStartDate, scores, comments);
      onClose();
      alert('Survey submitted successfully!');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to submit survey');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-950 rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-white">
            {currentStep < categories.length ? `Step ${currentStep + 1}: ${currentCategory}` : 'Review & Comments'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X /></button>
        </div>

        {currentStep < categories.length ? (
          <div className="space-y-6">
            {categoryQuestions.map(q => (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-medium text-gray-300">{q.question_text}</p>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map(score => (
                    <button
                      key={score}
                      onClick={() => handleScoreChange(q.id, score)}
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${scores[q.id] === score ? 'bg-emerald-600 text-white' : 'bg-zinc-800 text-gray-400 hover:bg-zinc-700'}`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex justify-between pt-4">
              <button disabled={currentStep === 0} onClick={() => setCurrentStep(prev => prev - 1)} className="px-4 py-2 bg-zinc-800 text-gray-300 rounded-lg disabled:opacity-50">Back</button>
              <button onClick={() => setCurrentStep(prev => prev + 1)} className="px-4 py-2 bg-emerald-600 text-white rounded-lg flex items-center gap-2">Next <ChevronRight size={16} /></button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <textarea placeholder="What does this person do particularly well?" className="w-full p-3 border border-zinc-700 bg-zinc-900 text-white rounded-lg" onChange={e => setComments(prev => ({ ...prev, well: e.target.value }))} />
            <textarea placeholder="What areas could this person improve in?" className="w-full p-3 border border-zinc-700 bg-zinc-900 text-white rounded-lg" onChange={e => setComments(prev => ({ ...prev, improve: e.target.value }))} />
            <textarea placeholder="Additional notes" className="w-full p-3 border border-zinc-700 bg-zinc-900 text-white rounded-lg" onChange={e => setComments(prev => ({ ...prev, notes: e.target.value }))} />
            <div className="flex justify-between pt-4">
              <button onClick={() => setCurrentStep(prev => prev - 1)} className="px-4 py-2 bg-zinc-800 text-gray-300 rounded-lg">Back</button>
              <button disabled={loading} onClick={handleSubmit} className="px-4 py-2 bg-emerald-600 text-white rounded-lg flex items-center gap-2">{loading ? 'Submitting...' : 'Submit Survey'} <Send size={16} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
