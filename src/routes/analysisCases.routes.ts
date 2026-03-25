// src/routes/analysisCases.routes.ts

import { Router } from "express"
import {
  createAnalysisCase,
  analyzeCase,
  getResult,
  getCasesByPerson
} from "../controllers/analysisCases.controller"

import { requireSession } from "../middlewares/requireSession"

const router = Router()

// ① ケース作成
router.post("/", requireSession, createAnalysisCase)

// ② AI分析
router.post("/:caseId/analyze", requireSession, analyzeCase)

// ③ 結果取得
router.get("/:caseId/results", requireSession, getResult)

// ④ 人物ごとの一覧取得
router.get("/person/:personId", requireSession, getCasesByPerson)

export default router