/**
 * このファイルは analysis-cases の service です。
 *
 * service とは:
 * - 実際の処理の流れをまとめる場所
 *
 * このファイルでは主に次を担当します。
 * - analysis-case の作成
 * - person 所有チェック
 * - AI 分析の開始
 * - status の更新（draft / analyzing / analyzed / error）
 * - 保存済み result の取得
 * - Person ごとの一覧取得
 *
 * controller との違いは、
 * 「HTTP の細かい入出力」ではなく
 * 「業務上の流れそのもの」を書く点です。
 */
import { analyzeMood } from "../ai/analyze.ts";
import * as analysisCasesRepository from "../repositories/analysisCases.repository.ts";
import * as analysisResultsRepository from "../repositories/analysisResults.repository.ts";
import { getOwnedPersonOrThrow } from "./persons.service.ts";
import type {
    CreateAnalysisCaseBody,
    PaginationOptions,
    StoredAnalysisCase,
} from "../types/index.ts";
import {
    ANALYZE_TIMEOUT_MS,
    AppError,
    normalizeError,
    withTimeout,
} from "../utils/index.ts";

/**
 * analysis-case を新しく作る service です。
 *
 * 受け取るもの:
 * - sessionId
 * - 画面から送られてきた analysis-case 作成用データ
 *
 * 返すもの:
 * - 作成された analysis-case
 *
 * 流れ:
 * 1. session があるか確認する
 * 2. 必須項目があるか確認する
 * 3. personId から実在の Person を取り出す
 * 4. Person が同じ session の持ち物か確認する
 * 5. repository に保存する
 *
 * analysis-case 側にも Person 情報を保存しているのは、
 * 後で analyze するときに AI へ渡せるようにするためです。
 */
export async function createAnalysisCase(
    sessionId: string,
    data: CreateAnalysisCaseBody,
) {
    if (!sessionId) {
        throw new AppError({
            code: "SESSION_INVALID",
            message: "x-session-id is required",
            status: 401,
        });
    }

    if (
        !data?.personId?.trim() ||
        !data?.eventFacts?.trim()
    ) {
        throw new AppError({
            code: "VALIDATION_ERROR",
            message: "personId, eventFacts は必須です。",
            status: 422,
        });
    }

    const person = await getOwnedPersonOrThrow(sessionId, data.personId.trim());

    const analysisCase = await analysisCasesRepository.create({
        sessionId,
        personId: data.personId.trim(),
        person: {
            displayName: person.displayName,
            relationshipType: person.relationshipType,
            ageRange: person.ageRange,
            genderHint: person.genderHint,
            notes: person.notes,
        },
        analysisCase: sanitizeAnalysisCaseInput(data),
        status: "draft",
    });

    return { analysisCase };
}

/**
 * AI 分析を実行する service です。
 *
 * 受け取るもの:
 * - sessionId
 * - 分析対象の caseId
 *
 * 返すもの:
 * - `status: "analyzed"` と AI 結果
 *
 * 重要な流れ:
 * 1. case の所有確認をする
 * 2. すでに analyzing / analyzed なら 409 を返す
 * 3. status を `analyzing` にする
 * 4. AI を呼ぶ
 * 5. 結果を保存する
 * 6. status を `analyzed` にする
 * 7. 失敗したら status を `error` に戻す
 *
 * `ALREADY_ANALYZED` を 409 にしている理由:
 * - 同じ case を何度も再分析させると、結果の整合が分かりにくくなるためです
 * - 「今の状態ではこの操作はできない」という意味で 409 を使っています
 *
 * timeout を入れている理由:
 * - OpenAI 呼び出しが長く止まったときに、サーバーが待ち続けないようにするためです
 */
export async function analyzeCase(sessionId: string, caseId: string) {
    const analysisCase = await getOwnedCaseOrThrow(sessionId, caseId);

    if (analysisCase.status === "analyzing") {
        throw new AppError({
            code: "ALREADY_ANALYZING",
            message: "このケースは現在分析中です。",
            status: 409,
        });
    }

    if (analysisCase.status === "analyzed") {
        throw new AppError({
            code: "ALREADY_ANALYZED",
            message: "このケースはすでに分析済みです。",
            status: 409,
        });
    }

    // 分析を始める前に status を更新しておくと、
    // 「今まさに処理中かどうか」を後から判定しやすくなります。
    await analysisCasesRepository.updateStatus(caseId, "analyzing");

    try {
        // AI 呼び出しは時間が読みにくいので、共通 timeout で包みます。
        // ここでは実際の AI 呼び出し本体は `analyzeMood()` に任せています。
        const aiResult = await withTimeout(
            async () =>
                analyzeMood({
                    person: analysisCase.person,
                    analysisCase: analysisCase.analysisCase,
                }),
            ANALYZE_TIMEOUT_MS,
        );

        // AI の生レスポンス全体ではなく、検証済みの結果だけを保存します。
        await analysisResultsRepository.upsert({
            analysisCaseId: caseId,
            result: aiResult,
        });

        // 正常終了したら status を analyzed にします。
        await analysisCasesRepository.updateStatus(caseId, "analyzed");

        return {
            status: "analyzed",
            result: aiResult,
        };
    } catch (error) {
        await analysisCasesRepository.updateStatus(caseId, "error");

        const normalized = normalizeError(error);
        throw new AppError({
            code: normalized.code,
            message: normalized.message,
            status: normalized.status,
            cause: normalized.cause,
        });
    }
}

/**
 * 保存済み result を取得する service です。
 *
 * まだ analyzed されていない場合は、
 * `result: null` で現在の status だけ返します。
 */
export async function getResult(sessionId: string, caseId: string) {
    const analysisCase = await getOwnedCaseOrThrow(sessionId, caseId);

    if (analysisCase.status !== "analyzed") {
        return {
            status: analysisCase.status,
            result: null,
        };
    }

    const savedResult = await analysisResultsRepository.findByCaseId(caseId);

    return {
        status: "analyzed",
        result: savedResult?.result ?? null,
    };
}

/**
 * Person ごとの analysis-case 一覧を返す service です。
 *
 * ここで Person の所有確認を先にしているのは、
 * 他の session の Person 一覧を見えてしまわないようにするためです。
 */
export async function getCasesByPerson(
    sessionId: string,
    personId: string,
    options: PaginationOptions,
) {
    await getOwnedPersonOrThrow(sessionId, personId);

    return analysisCasesRepository.findByPersonId(sessionId, personId, options);
}

/**
 * caseId から analysis-case を取り出し、
 * 「存在するか」「同じ session の持ち物か」を確認する共通関数です。
 *
 * 同じ確認を毎回コピペしないために、ここへまとめています。
 */
async function getOwnedCaseOrThrow(sessionId: string, caseId: string): Promise<StoredAnalysisCase> {
    if (!sessionId) {
        throw new AppError({
            code: "SESSION_INVALID",
            message: "x-session-id is required",
            status: 401,
        });
    }

    const analysisCase = await analysisCasesRepository.findById(caseId);

    if (!analysisCase) {
        throw new AppError({
            code: "NOT_FOUND",
            message: "analysis case が見つかりません。",
            status: 404,
        });
    }

    if (analysisCase.sessionId !== sessionId) {
        throw new AppError({
            code: "FORBIDDEN",
            message: "この analysis case にはアクセスできません。",
            status: 403,
        });
    }

    return analysisCase;
}

/**
 * 画面から受け取った analysis-case 入力を、保存しやすい形へ整える関数です。
 *
 * ここで `String(...).trim()` をしている理由:
 * - 未入力でも落ちにくくするため
 * - 前後の不要な空白を減らすため
 */
function sanitizeAnalysisCaseInput(data: CreateAnalysisCaseBody) {
    return {
        eventFacts: String(data.eventFacts ?? "").trim(),
        selfMessage: String(data.selfMessage ?? "").trim(),
        partnerMessage: String(data.partnerMessage ?? "").trim(),
        recentConversationText: String(data.recentConversationText ?? "").trim(),
        appType: String(data.appType ?? "").trim(),
        userEmotion: String(data.userEmotion ?? "").trim(),
        assumedPartnerEmotion: String(data.assumedPartnerEmotion ?? "").trim(),
        partnerSpeakingStyle: String(data.partnerSpeakingStyle ?? "").trim(),
        contextNote: String(data.contextNote ?? "").trim(),
        concernText: String(data.concernText ?? "").trim(),
        emojiUsed: String(data.emojiUsed ?? "").trim(),
        toneType: String(data.toneType ?? "").trim(),
        messageLengthType: String(data.messageLengthType ?? "").trim(),
    };
}
