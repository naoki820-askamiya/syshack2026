import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
    DEFAULT_AI_TIMEOUT_MS,
    MAX_INTERNAL_AI_ATTEMPTS,
} from "./constants.js";
import { buildAiInput } from "./context.js";
import { aiAnalysisInputSchema, type AiAnalysisInput } from "./input.schema.js";
import { buildAiInstructions } from "./instructions.js";
import {
    kigenAnalysisResultV2Schema,
    type KigenAnalysisResultV2,
} from "./output.schema.js";
import { AiOutputValidationError, validateAiOutput } from "./validation.js";

export type AnalyzeFailureCode =
    | "AI_CONFIG_MISSING"
    | "AI_TIMEOUT"
    | "AI_PROVIDER_ERROR"
    | "AI_OUTPUT_INVALID"
    | "AI_OUTPUT_UNSAFE"
    | "AI_REFUSED";

export class AnalyzeMoodV2Error extends Error {
    constructor(
        readonly code: AnalyzeFailureCode,
        message: string,
        readonly attempts: number,
        readonly cause?: unknown,
    ) {
        super(message);
        this.name = "AnalyzeMoodV2Error";
    }
}

export interface AnalyzeMoodV2Result {
    analysis: KigenAnalysisResultV2;
    model: string;
    attempts: number;
}

type ResponsesClient = Pick<OpenAI["responses"], "parse">;

export async function analyzeMoodV2(
    rawInput: AiAnalysisInput,
    options: {
        client?: ResponsesClient;
        signal?: AbortSignal;
        timeoutMs?: number;
    } = {},
): Promise<AnalyzeMoodV2Result> {
    const input = aiAnalysisInputSchema.parse(rawInput);
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    const model =
        process.env.OPENAI_ANALYSIS_MODEL?.trim() ??
        process.env.OPENAI_MODEL?.trim();

    if (!apiKey || !model) {
        throw new AnalyzeMoodV2Error(
            "AI_CONFIG_MISSING",
            "AI分析のサーバー設定が不足しています。",
            0,
        );
    }

    const client = options.client ?? new OpenAI({ apiKey }).responses;
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_INTERNAL_AI_ATTEMPTS; attempt += 1) {
        try {
            const response = await client.parse(
                {
                    model,
                    store: false,
                    instructions: buildAiInstructions(),
                    input: buildAiInput(input),
                    text: {
                        format: zodTextFormat(
                            kigenAnalysisResultV2Schema,
                            "kigen_analysis_result_v2",
                        ),
                    },
                },
                {
                    signal: options.signal,
                    timeout: options.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS,
                    maxRetries: 0,
                },
            );

            if (response.status === "incomplete") {
                throw new AnalyzeMoodV2Error(
                    "AI_OUTPUT_INVALID",
                    "AI応答が完了しませんでした。",
                    attempt,
                );
            }

            const refusal = response.output
                .filter((item) => item.type === "message")
                .flatMap((item) => item.content)
                .find((content) => content.type === "refusal");

            if (refusal) {
                throw new AnalyzeMoodV2Error(
                    "AI_REFUSED",
                    "AIが分析リクエストを処理できませんでした。",
                    attempt,
                );
            }

            if (!response.output_parsed) {
                throw new AnalyzeMoodV2Error(
                    "AI_OUTPUT_INVALID",
                    "AI応答に解析可能な出力がありません。",
                    attempt,
                );
            }

            return {
                analysis: validateAiOutput(response.output_parsed, input.referenceContext),
                model,
                attempts: attempt,
            };
        } catch (error) {
            lastError = error;
            const normalized = normalizeAttemptError(error, attempt);

            if (!shouldRetry(normalized) || attempt === MAX_INTERNAL_AI_ATTEMPTS) {
                throw normalized;
            }
        }
    }

    throw normalizeAttemptError(lastError, MAX_INTERNAL_AI_ATTEMPTS);
}

function shouldRetry(error: AnalyzeMoodV2Error): boolean {
    return !["AI_CONFIG_MISSING", "AI_REFUSED"].includes(error.code);
}

function normalizeAttemptError(error: unknown, attempts: number): AnalyzeMoodV2Error {
    if (error instanceof AnalyzeMoodV2Error) {
        return new AnalyzeMoodV2Error(error.code, error.message, attempts, error.cause);
    }

    if (error instanceof AiOutputValidationError) {
        return new AnalyzeMoodV2Error(
            error.failure === "unsafe" ? "AI_OUTPUT_UNSAFE" : "AI_OUTPUT_INVALID",
            "分析結果を安全に検証できませんでした。",
            attempts,
            error,
        );
    }

    if (error instanceof OpenAI.APIConnectionTimeoutError) {
        return new AnalyzeMoodV2Error(
            "AI_TIMEOUT",
            "AI分析がタイムアウトしました。",
            attempts,
            error,
        );
    }

    if (error instanceof OpenAI.APIError) {
        return new AnalyzeMoodV2Error(
            "AI_PROVIDER_ERROR",
            "AIサービスとの通信に失敗しました。",
            attempts,
            error,
        );
    }

    if ((error as { name?: string } | null)?.name === "AbortError") {
        return new AnalyzeMoodV2Error(
            "AI_TIMEOUT",
            "AI分析が中断されました。",
            attempts,
            error,
        );
    }

    return new AnalyzeMoodV2Error(
        "AI_PROVIDER_ERROR",
        "AI分析を完了できませんでした。",
        attempts,
        error,
    );
}
