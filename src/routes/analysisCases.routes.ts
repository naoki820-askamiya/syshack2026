import { Router } from "express";
import {
    analyzeCase,
    createAnalysisCase,
    getResult,
} from "../controllers/analysisCases.controller.ts";
import { requireSession } from "../middlewares/requireSession.ts";

const router = Router();

router.post("/", requireSession, createAnalysisCase);
router.post("/:caseId/analyze", requireSession, analyzeCase);
router.get("/:caseId/results", requireSession, getResult);

export default router;
