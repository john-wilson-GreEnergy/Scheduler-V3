export type SurveyType = 'tech_eval_manager' | 'manager_eval_tech';

export interface SurveyQuestion {
  id: string;
  survey_type: SurveyType;
  category: string;
  question_text: string;
  display_order: number;
}

export interface SurveySubmission {
  id: string;
  survey_type: SurveyType;
  rater_id: string;
  target_id: string;
  week_start_date: string;
  scores: Record<string, number>; // question_id -> score
  comments: {
    well: string;
    improve: string;
    notes: string;
  };
  created_at: string;
}

export interface CategoryAverage {
  category: string;
  average: number;
}

export interface PerformancePulseData {
  categoryAverages: CategoryAverage[];
  overallAverage: number;
}
