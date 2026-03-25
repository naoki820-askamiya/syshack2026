// src/services/analysisCases.service.ts

import * as analysisCasesRepository from "../repositories/analysisCases.repository"
import * as analysisResultsRepository from "../repositories/analysisResults.repository"
import * as personsRepository from "../repositories/persons.repository"

import { analyze } from "../ai/analyze"


export const createAnalysisCase = async (
  sessionId: string,
  data: any
) => {
  const {
    personId,
    eventFacts,
    selfMessage,
    partnerMessage
  } = data

  // ① バリデーション（最低限）
  if (!personId || !eventFacts || !selfMessage || !partnerMessage) {
    throw {
      code: "VALIDATION_ERROR",
      message: "必須項目が不足しています",
      status: 422
    }
  }

  // ② person存在チェック（＆セッション一致）
  const person = await personsRepository.findById(personId)

  if (!person) {
    throw { code: "NOT_FOUND", message: "personが存在しません", status: 404 }
  }

  if (person.sessionId !== sessionId) {
    throw { code: "FORBIDDEN", message: "アクセス不可", status: 403 }
  }

  // ③ 保存
  const analysisCase = await analysisCasesRepository.create({
    ...data,
    sessionId,
    status: "draft"
  })

  return { analysisCase }
}


export const analyzeCase = async (
  sessionId: string,
  caseId: string
) => {
  // ① case取得
  const analysisCase = await analysisCasesRepository.findById(caseId)

  if (!analysisCase) {
    throw { code: "NOT_FOUND", message: "caseが存在しません", status: 404 }
  }

  // ② セッションチェック
  if (analysisCase.sessionId !== sessionId) {
    throw { code: "FORBIDDEN", message: "アクセス不可", status: 403 }
  }

  // ③ statusチェック
  if (analysisCase.status === "analyzing") {
    throw { code: "ALREADY_ANALYZING", message: "分析中です", status: 409 }
  }

  if (analysisCase.status === "analyzed") {
    throw { code: "ALREADY_ANALYZED", message: "分析済みです", status: 409 }
  }

  // ④ analyzingに更新
  await analysisCasesRepository.updateStatus(caseId, "analyzing")

  try {
    // ⑤ AI呼び出し（モックOK）
    const aiResult = await analyze(analysisCase)

    // ⑥ result保存
    const result = await analysisResultsRepository.create({
      analysisCaseId: caseId,
      ...aiResult
    })

    // ⑦ analyzedに更新
    await analysisCasesRepository.updateStatus(caseId, "analyzed")

    return {
      status: "analyzed",
      result
    }

  } catch (err) {
    // ⑧ エラー時
    await analysisCasesRepository.updateStatus(caseId, "error")

    throw {
      code: "AI_TIMEOUT",
      message: "AI分析に失敗しました",
      status: 503
    }
  }
}


export const getResult = async (
  sessionId: string,
  caseId: string
) => {
  const analysisCase = await analysisCasesRepository.findById(caseId)

  if (!analysisCase) {
    throw { code: "NOT_FOUND", message: "caseが存在しません", status: 404 }
  }

  if (analysisCase.sessionId !== sessionId) {
    throw { code: "FORBIDDEN", message: "アクセス不可", status: 403 }
  }

  // status別処理
  if (analysisCase.status !== "analyzed") {
    return {
      result: null,
      status: analysisCase.status
    }
  }

  const result = await analysisResultsRepository.findByCaseId(caseId)

  return {
    result,
    status: "analyzed"
  }
}

export const getCasesByPerson = async (
  sessionId: string,
  personId: string,
  options: { limit: number; offset: number }
) => {
  // personチェック
  const person = await personsRepository.findById(personId)

  if (!person) {
    throw { code: "NOT_FOUND", message: "personが存在しません", status: 404 }
  }

  if (person.sessionId !== sessionId) {
    throw { code: "FORBIDDEN", message: "アクセス不可", status: 403 }
  }

  const cases = await analysisCasesRepository.findByPersonId(
    personId,
    options
  )

  return cases
}