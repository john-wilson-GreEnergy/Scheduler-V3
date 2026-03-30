export function normalizeTo100(score1to7: number) {
  return round2((score1to7 / 7) * 100);
}

export function getReadinessStatus(score: number, thresholds: { readyNow: number; readySoon: number; developing: number; needsImprovement: number }) {
  if (score >= thresholds.readyNow) return "Ready Now";
  if (score >= thresholds.readySoon) return "Ready Soon";
  if (score >= thresholds.developing) return "Developing";
  if (score >= thresholds.needsImprovement) return "Needs Improvement";
  return "Not Ready";
}

export function calculateStdDev(values: number[]) {
  if (!values.length) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function calculateTrend(lastThree: number[], previousThree: number[]) {
  const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  return round2(avg(lastThree) - avg(previousThree));
}

export function trendAdjustment(trend: number) {
  if (trend >= 0.3) return 5;
  if (trend >= 0.1) return 2;
  if (trend <= -0.1) return -5;
  return 0;
}

export function calculatePromotionReadiness({
  model,
  categoryScores,
  sourceScores,
  recentOverallScores = [],
  previousOverallScores = [],
  safetyScore,
  minimumResponses = 3,
}: any) {
  const sourceWeighted = sourceScores.reduce((sum: number, item: any) => sum + item.score * item.weight, 0);
  const normalizedSourceScore = normalizeTo100(sourceWeighted);

  const categoryWeighted = model.categories.reduce((sum: number, category: any) => {
    const categoryScore = categoryScores[category.key] || 0;
    return sum + normalizeTo100(categoryScore) * category.weight;
  }, 0);

  const baseScore = round2((normalizedSourceScore * 0.5) + (categoryWeighted * 0.5));
  const trend = calculateTrend(recentOverallScores.slice(0, 3), previousOverallScores.slice(0, 3));
  const variance = calculateStdDev(recentOverallScores);
  const safetyPenalty = safetyScore < model.gates.minimumSafetyScore ? 10 : 0;
  const consistencyPenalty = variance > 1.2 ? 5 : 0;
  const eligibility = safetyScore >= model.gates.minimumSafetyScore && recentOverallScores.length >= minimumResponses;

  const finalScore = clamp(
    round2(baseScore + trendAdjustment(trend) - safetyPenalty - consistencyPenalty),
    0,
    100
  );

  const topStrength = highestKey(categoryScores);
  const focusArea = lowestKey(categoryScores);

  return {
    readinessScore: finalScore,
    readinessStatus: eligibility ? getReadinessStatus(finalScore, model.thresholds) : "Not Eligible",
    trendDelta: trend,
    consistencyStdDev: round2(variance),
    safetyScore: round2(safetyScore),
    topStrength,
    focusArea,
    recommendation: buildRecommendation(finalScore, eligibility, focusArea, topStrength),
    isEligible: eligibility,
    sourceResponseCount: recentOverallScores.length,
  };
}

function buildRecommendation(score: number, eligible: boolean, focusArea: string, topStrength: string) {
  if (!eligible) return "Address gating issues before considering promotion readiness.";
  if (score >= 85) return `High readiness. Consider stretch assignments, mentoring, and promotion planning. Strongest area: ${topStrength}.`;
  if (score >= 75) return `Near-ready candidate. Increase responsibility while coaching on ${focusArea}.`;
  if (score >= 65) return `Developing candidate. Build a targeted improvement plan around ${focusArea}.`;
  return `Not ready yet. Prioritize coaching, consistency, and improvement in ${focusArea}.`;
}

function highestKey(map: Record<string, number>) {
  return Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function lowestKey(map: Record<string, number>) {
  return Object.entries(map).sort((a, b) => a[1] - b[1])[0]?.[0] || null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
