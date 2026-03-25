// src/controllers/analysisCases.controller.ts

import { Request, Response, NextFunction } from "express"
import * as analysisCasesService from "../services/analysisCases.service"

// ① ケース作成
export const createAnalysisCase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sessionId = req.headers["x-session-id"] as string

    const result = await analysisCasesService.createAnalysisCase(
      sessionId,
      req.body
    )

    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
}

// ② AI分析
export const analyzeCase = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sessionId = req.headers["x-session-id"] as string
    const caseId = req.params.caseId

    const result = await analysisCasesService.analyzeCase(
      sessionId,
      caseId
    )

    res.json(result)
  } catch (err) {
    next(err)
  }
}

// ③ 結果取得
export const getResult = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sessionId = req.headers["x-session-id"] as string
    const caseId = req.params.caseId

    const result = await analysisCasesService.getResult(
      sessionId,
      caseId
    )

    res.json(result)
  } catch (err) {
    next(err)
  }
}

// ④ 一覧取得
export const getCasesByPerson = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const sessionId = req.headers["x-session-id"] as string
    const personId = req.params.personId

    const limit = Number(req.query.limit) || 20
    const offset = Number(req.query.offset) || 0

    const result = await analysisCasesService.getCasesByPerson(
      sessionId,
      personId,
      { limit, offset }
    )

    res.json(result)
  } catch (err) {
    next(err)
  }
}