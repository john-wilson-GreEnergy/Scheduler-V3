import { supabase } from '../lib/supabase';
import { SurveyType } from '../types/surveys';

export const submitSurvey = async (
  raterId: string,
  targetId: string,
  surveyType: SurveyType,
  weekStartDate: string,
  scores: Record<string, number> | string,
  comments: { well: string; improve: string; notes: string }
) => {
  // 1. Check if a survey already exists for this pair this week
  const { data: existing, error: checkError } = await supabase
    .from('survey_submissions')
    .select('id')
    .eq('rater_id', raterId)
    .eq('target_id', targetId)
    .eq('week_start_date', weekStartDate)
    .single();

  if (existing) {
    throw new Error('A survey has already been submitted for this person this week.');
  }

  // 2. Insert the new submission
  const { data, error } = await supabase
    .from('survey_submissions')
    .insert({
      survey_type: surveyType,
      rater_id: raterId,
      target_id: targetId,
      week_start_date: weekStartDate,
      scores: typeof scores === 'string' ? scores : JSON.stringify(scores),
      comments
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const getSurveyQuestions = async (surveyType: SurveyType) => {
  const { data, error } = await supabase
    .from('survey_questions')
    .select('*')
    .eq('survey_type', surveyType)
    .order('display_order');

  if (error) throw error;
  return data;
};
