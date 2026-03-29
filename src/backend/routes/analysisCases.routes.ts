/**
 * このファイルは analysis-cases 系 API の route をまとめる場所です。
 *
 * route とは:
 * - URL ごとに「どの controller に渡すか」を決める場所
 *
 * このファイルでは、
 * `/api/analysis-cases` の下に来る URL を受け取り、
 * 実際の処理は controller に渡します。
 */
import { Router } from "express";
import {
    analyzeCase,
    createAnalysisCase,
    getResult,
} from "../controllers/analysisCases.controller.ts";
import { requireSession } from "../middlewares/requireSession.ts";

const router = Router();

// analysis-case を新しく作る URL です。
// session が必要なので、先に requireSession を通します。
router.post("/", requireSession, createAnalysisCase);

// 指定した caseId に対して AI 分析を実行する URL です。
// ここでは URL だけ決めて、何をするかは controller / service に任せます。
router.post("/:caseId/analyze", requireSession, analyzeCase);

// すでに保存済みの分析結果を取り出す URL です。
router.get("/:caseId/results", requireSession, getResult);

export default router;
