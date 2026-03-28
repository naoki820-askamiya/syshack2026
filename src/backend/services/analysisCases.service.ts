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
    AnalysisMessageLengthType,
    AnalysisResultResponse,
    AnalysisToneType,
    CreateAnalysisCaseBody,
    PaginationOptions,
    StoredAnalysisCase,
    StoredAnalysisResult,
} from "../types/index.ts";
import {
    ANALYZE_TIMEOUT_MS,
    AppError,
    buildSessionHeaderRequiredError,
    normalizeError,
    withTimeout,
} from "../utils/index.ts";

const MAX_REQUIRED_TEXT_LENGTH = 3000;
const MAX_RECENT_CONVERSATION_LENGTH = 5000;

const TONE_TYPE_ALIASES: Record<string, AnalysisToneType> = {
    formal: "formal",
    casual: "casual",
    mixed: "mixed",
    unknown: "unknown",
    "事務的": "formal",
    "丁寧": "formal",
    "カジュアル": "casual",
    "くだけた": "casual",
    "混在": "mixed",
    "まざっている": "mixed",
    "不明": "unknown",
};

const MESSAGE_LENGTH_TYPE_ALIASES: Record<string, AnalysisMessageLengthType> = {
    short: "short",
    normal: "normal",
    long: "long",
    unknown: "unknown",
    "短め": "short",
    "短い": "short",
    "普通": "normal",
    "通常": "normal",
    "長め": "long",
    "長い": "long",
    "不明": "unknown",
};

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
        throw buildSessionHeaderRequiredError();
    }

    const personId = String(data?.personId ?? "").trim();
    const eventFacts = requireTextField(
        data?.eventFacts,
        "eventFacts",
        MAX_REQUIRED_TEXT_LENGTH,
    );
    const selfMessage = requireTextField(
        data?.selfMessage,
        "selfMessage",
        MAX_REQUIRED_TEXT_LENGTH,
    );
    const partnerMessage = requireTextField(
        data?.partnerMessage,
        "partnerMessage",
        MAX_REQUIRED_TEXT_LENGTH,
    );

    if (!personId) {
        throw new AppError({
            code: "VALIDATION_ERROR",
            message: "personId は必須です。",
            status: 422,
        });
    }

    const person = await getOwnedPersonOrThrow(sessionId, personId);
    const normalizedCaseInput = sanitizeAnalysisCaseInput({
        ...data,
        personId,
        eventFacts,
        selfMessage,
        partnerMessage,
    });

    const analysisCase = await analysisCasesRepository.create({
        sessionId,
        personId,
        person: {
            displayName: person.displayName,
            relationshipType: person.relationshipType,
            ageRange: person.ageRange,
            genderHint: person.genderHint,
            notes: person.notes,
        },
        analysisCase: normalizedCaseInput,
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
            async (signal) =>
                analyzeMood({
                    person: analysisCase.person,
                    analysisCase: analysisCase.analysisCase,
                }, signal),
            ANALYZE_TIMEOUT_MS,
        );

        // AI の生レスポンス全体ではなく、検証済みの結果だけを保存します。
        const savedResult = await analysisResultsRepository.upsert({
            analysisCaseId: caseId,
            promptVersion: "v1",
            result: aiResult,
        });

        // 正常終了したら status を analyzed にします。
        await analysisCasesRepository.updateStatus(caseId, "analyzed");

        return {
            status: "analyzed",
            result: toResultResponse(savedResult),
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
        result: savedResult ? toResultResponse(savedResult) : null,
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
        throw buildSessionHeaderRequiredError();
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
        recentConversationText: optionalTextField(
            data.recentConversationText,
            "recentConversationText",
            MAX_RECENT_CONVERSATION_LENGTH,
        ),
        appType: String(data.appType ?? "").trim(),
        userEmotion: String(data.userEmotion ?? "").trim(),
        assumedPartnerEmotion: String(data.assumedPartnerEmotion ?? "").trim(),
        partnerSpeakingStyle: String(data.partnerSpeakingStyle ?? "").trim(),
        contextNote: String(data.contextNote ?? "").trim(),
        concernText: String(data.concernText ?? "").trim(),
        emojiUsed: normalizeEmojiUsed(data.emojiUsed),
        toneType: normalizeToneType(data.toneType),
        messageLengthType: normalizeMessageLengthType(data.messageLengthType),
    };
}

function requireTextField(
    value: string | undefined,
    fieldName: "eventFacts" | "selfMessage" | "partnerMessage",
    maxLength: number,
): string {
    const normalized = String(value ?? "").trim();

    if (!normalized) {
        throw new AppError({
            code: "VALIDATION_ERROR",
            message: `${fieldName} は必須です。`,
            status: 422,
        });
    }

    if (normalized.length > maxLength) {
        throw new AppError({
            code: "VALIDATION_ERROR",
            message: `${fieldName} は ${maxLength} 文字以内で指定してください。`,
            status: 422,
        });
    }

    return normalized;
}

function optionalTextField(
    value: string | undefined,
    fieldName: "recentConversationText",
    maxLength: number,
): string {
    const normalized = String(value ?? "").trim();

    if (!normalized) {
        return "";
    }

    if (normalized.length > maxLength) {
        throw new AppError({
            code: "VALIDATION_ERROR",
            message: `${fieldName} は ${maxLength} 文字以内で指定してください。`,
            status: 422,
        });
    }

    return normalized;
}

function normalizeEmojiUsed(value: boolean | string | null | undefined): boolean | null {
    if (typeof value === "boolean") {
        return value;
    }

    if (value == null) {
        return null;
    }

    const normalized = String(value).trim().toLowerCase();

    if (!normalized) {
        return null;
    }

    if (["true", "1", "yes", "y", "あり", "有"].includes(normalized)) {
        return true;
    }

    if (["false", "0", "no", "n", "なし", "無"].includes(normalized)) {
        return false;
    }

    throw new AppError({
        code: "VALIDATION_ERROR",
        message: "emojiUsed は boolean か、あり / なし に対応する値で指定してください。",
        status: 422,
    });
}

function normalizeToneType(value: string | undefined): AnalysisToneType {
    const normalized = String(value ?? "").trim().toLowerCase();

    if (!normalized) {
        return "unknown";
    }

    const matched = TONE_TYPE_ALIASES[normalized];
    if (matched) {
        return matched;
    }

    throw new AppError({
        code: "VALIDATION_ERROR",
        message: "toneType は formal / casual / mixed / unknown のいずれかで指定してください。",
        status: 422,
    });
}

function normalizeMessageLengthType(
    value: string | undefined,
): AnalysisMessageLengthType {
    const normalized = String(value ?? "").trim().toLowerCase();

    if (!normalized) {
        return "unknown";
    }

    const matched = MESSAGE_LENGTH_TYPE_ALIASES[normalized];
    if (matched) {
        return matched;
    }

    throw new AppError({
        code: "VALIDATION_ERROR",
        message: "messageLengthType は short / normal / long / unknown のいずれかで指定してください。",
        status: 422,
    });
}

function toResultResponse(
    savedResult: StoredAnalysisResult,
): AnalysisResultResponse {
    return {
        id: savedResult.id,
        analysisCaseId: savedResult.analysisCaseId,
        promptVersion: savedResult.promptVersion,
        generatedAt: savedResult.updatedAt,
        ...savedResult.result,
    };
}
