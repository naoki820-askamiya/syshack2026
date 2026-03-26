/**
 * このファイルは analysis-cases の controller です。
 *
 * controller とは:
 * - 受け取ったリクエストを整理して service に渡す場所
 *
 * ここでは、
 * - `req.params` から URL 上の ID を取り出す
 * - `req.body` から送信データを取り出す
 * - `req.query` から一覧取得用の値を取り出す
 * - service の結果を `res.json(...)` で返す
 *
 * という「入出力の整理」に集中しています。
 */
import type { NextFunction, Request, Response } from "express";
import type { CreateAnalysisCaseBody } from "../types/index.ts";
import * as analysisCasesService from "../services/analysisCases.service.ts";

// `requireSession` middleware を通ったあとに、
// `req.sessionId` を使えるようにするための型です。
type SessionRequest<TBody = unknown> = Request & {
    sessionId?: string;
    body: TBody;
};

/**
 * analysis-case 作成 API の controller です。
 *
 * 受け取るもの:
 * - header の `x-session-id`
 * - body の `CreateAnalysisCaseBody`
 *
 * 返すもの:
 * - 作成された analysis-case を 201 で返します
 */
export async function createAnalysisCase(
    req: SessionRequest<CreateAnalysisCaseBody>,
    res: Response,
    next: NextFunction,
) {
    try {
        const result = await analysisCasesService.createAnalysisCase(
            req.sessionId ?? "",
            req.body,
        );

        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
}

/**
 * AI 分析実行 API の controller です。
 *
 * URL から `caseId` を取り出して service に渡します。
 * controller 自体は AI を呼ばず、流れの管理は service に任せます。
 */
export async function analyzeCase(
    req: SessionRequest,
    res: Response,
    next: NextFunction,
) {
    try {
        const result = await analysisCasesService.analyzeCase(
            req.sessionId ?? "",
            getSingleParam(req.params.caseId),
        );

        res.json(result);
    } catch (error) {
        next(error);
    }
}

/**
 * 保存済み result 取得 API の controller です。
 *
 * service から返ってきた値をそのまま JSON として返します。
 */
export async function getResult(
    req: SessionRequest,
    res: Response,
    next: NextFunction,
) {
    try {
        const result = await analysisCasesService.getResult(
            req.sessionId ?? "",
            getSingleParam(req.params.caseId),
        );

        res.json(result);
    } catch (error) {
        next(error);
    }
}

/**
 * Person ごとの analysis-case 一覧を返す controller です。
 *
 * `limit` と `offset` は一覧の件数を調整するための query です。
 * どちらも文字列で来るので、ここで number に変換しています。
 */
export async function getCasesByPerson(
    req: SessionRequest,
    res: Response,
    next: NextFunction,
) {
    try {
        const limit = Number(req.query.limit ?? 20);
        const offset = Number(req.query.offset ?? 0);

        const result = await analysisCasesService.getCasesByPerson(
            req.sessionId ?? "",
            getSingleParam(req.params.personId),
            { limit, offset },
        );

        res.json(result);
    } catch (error) {
        next(error);
    }
}

function getSingleParam(value: string | string[] | undefined): string {
    if (Array.isArray(value)) {
        return value[0] ?? "";
    }

    return value ?? "";
}
