export function calculateSurveyScores(survey: any, answersMap: Record<string, number>) {
  const categoryScores = [];
  const allValues = [];

  for (const category of survey.categories) {
    const values = category.questions
      .map((_: any, index: number) => answersMap[buildQuestionId(survey.surveyId, category.id, index + 1)])
      .filter((value: any) => typeof value === "number");

    const average = values.length
      ? values.reduce((sum: number, value: number) => sum + value, 0) / values.length
      : 0;

    values.forEach((value: number) => allValues.push(value));

    categoryScores.push({
      categoryKey: category.id,
      categoryTitle: category.title,
      averageScore: round2(average),
    });
  }

  const overallScore = allValues.length
    ? allValues.reduce((sum: number, value: number) => sum + value, 0) / allValues.length
    : 0;

  const sorted = [...categoryScores].sort((a: any, b: any) => b.averageScore - a.averageScore);

  return {
    overallScore: round2(overallScore),
    categoryScores,
    highestCategory: sorted[0]?.categoryTitle || null,
    lowestCategory: sorted[sorted.length - 1]?.categoryTitle || null,
    flaggedForReview: overallScore < 4.5 || categoryScores.some((item: any) => item.averageScore < 4.0),
  };
}

export function buildQuestionId(surveyId: string, categoryId: string, questionNumber: number) {
  return `${surveyId}__${categoryId}__q${questionNumber}`;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
