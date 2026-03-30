import express from "express";
import promotionModels from "../../src/config/promotion-models.json" assert { type: "json" };
import { calculatePromotionReadiness } from "../../src/lib/promotionReadiness.ts";

const router = express.Router();

router.get("/promotion-readiness/:employeeUserId", async (req, res) => {
  try {
    const { employeeUserId } = req.params;
    const { targetRole } = req.query;

    const model = promotionModels.promotionModels.find(
      (item: any) => item.toRole === targetRole
    );

    if (!model) {
      return res.status(400).json({ error: "No readiness model found for target role." });
    }

    // Replace these mocked values with your real query layer.
    const categoryScores = {
      workEthicReliability: 6.0,
      technicalExecution: 5.9,
      safety: 6.3,
      teamworkCommunication: 5.8,
      leadershipIndicators: 5.4,
      leadershipDirection: 5.9,
      communicationAlignment: 5.8,
      operationalExecution: 5.5,
      safetyLeadership: 6.2,
      accountabilityReliability: 5.8,
    };

    const sourceScores = [
      { score: 6.1, weight: 0.45 },
      { score: 5.8, weight: 0.35 },
      { score: 5.9, weight: 0.20 },
    ];

    const readiness = calculatePromotionReadiness({
      model,
      categoryScores,
      sourceScores,
      recentOverallScores: [6.0, 5.9, 6.2],
      previousOverallScores: [5.6, 5.7, 5.8],
      safetyScore: 6.3,
      minimumResponses: model.gates.minimumRecentResponses,
    });

    res.json({
      employeeUserId,
      currentRole: model.fromRole,
      targetRole: model.toRole,
      modelId: model.id,
      ...readiness,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Unhandled error." });
  }
});

export default router;
