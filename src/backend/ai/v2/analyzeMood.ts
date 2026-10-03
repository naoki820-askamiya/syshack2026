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
    // timeoutMs bounds the entire operation, including backoff and all API attempts.
    const deadline = performance.now() + (options.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS);
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_INTERNAL_AI_ATTEMPTS; attempt += 1) {
        if (options.signal?.aborted || performance.now() >= deadline) {
            throw new AnalyzeMoodV2Error("AI_TIMEOUT", "AI分析が中断またはタイムアウトしました。", attempt - 1);
        }
        try {
            const remainingMs = deadline - performance.now();
            const response = await withAttemptDeadline((signal) => client.parse(
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
                    signal,
                    timeout: remainingMs,
                    maxRetries: 0,
                },
            ), remainingMs, options.signal);

            if (options.signal?.aborted || performance.now() >= deadline) {
                throw new AnalyzeMoodV2Error("AI_TIMEOUT", "AI分析が中断またはタイムアウトしました。", attempt);
            }

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

            if (!shouldRetry(normalized, error) || options.signal?.aborted || attempt === MAX_INTERNAL_AI_ATTEMPTS) {
                throw normalized;
            }
            const delayMs = retryDelayMs(error, attempt);
            if (performance.now() + delayMs >= deadline) {
                throw new AnalyzeMoodV2Error("AI_TIMEOUT", "AI分析の再試行期限を超えました。", attempt, error);
            }
            try {
                await waitForRetry(delayMs, options.signal);
            } catch (abortError) {
                throw normalizeAttemptError(abortError, attempt);
            }
        }
    }

    throw normalizeAttemptError(lastError, MAX_INTERNAL_AI_ATTEMPTS);
}

function shouldRetry(error: AnalyzeMoodV2Error, original: unknown): boolean {
    if (original instanceof OpenAI.APIUserAbortError ||
        (original as { name?: string } | null)?.name === "AbortError") return false;
    if (["AI_OUTPUT_INVALID", "AI_OUTPUT_UNSAFE"].includes(error.code)) return true;
    if (original instanceof OpenAI.APIConnectionError) return true;
    if (original instanceof OpenAI.APIError) {
        return [408, 429, 500, 502, 503, 504].includes(original.status ?? 0);
    }
    return false;
}

function retryDelayMs(error: unknown, attempt: number): number {
    const backoffMs = 250 * 2 ** (attempt - 1);
    if (!(error instanceof OpenAI.APIError)) return backoffMs;
    const headers = error.headers;
    const milliseconds = headers?.["retry-after-ms"];
    if (milliseconds && Number.isFinite(Number(milliseconds)) && Number(milliseconds) >= 0) {
        return Math.max(backoffMs, Number(milliseconds));
    }
    const retryAfter = headers?.["retry-after"];
    if (!retryAfter) return backoffMs;
    const seconds = Number(retryAfter);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
    return Number.isFinite(delay) && delay >= 0 ? Math.max(backoffMs, delay) : backoffMs;
}

async function withAttemptDeadline<T>(
    send: (signal: AbortSignal) => PromiseLike<T>, timeoutMs: number, externalSignal?: AbortSignal,
): Promise<T> {
    if (externalSignal?.aborted) throw new OpenAI.APIUserAbortError();
    if (timeoutMs <= 0) throw new OpenAI.APIConnectionTimeoutError();
    const controller = new AbortController();
    let abortExternal: () => void = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancellation = new Promise<never>((_resolve, reject) => {
        abortExternal = () => {
            controller.abort();
            reject(new OpenAI.APIUserAbortError());
        };
        externalSignal?.addEventListener("abort", abortExternal, { once: true });
        timer = setTimeout(() => {
            controller.abort();
            reject(new OpenAI.APIConnectionTimeoutError());
        }, Math.max(0, timeoutMs));
    });
    try {
        if (externalSignal?.aborted) throw new OpenAI.APIUserAbortError();
        return await Promise.race([Promise.resolve(send(controller.signal)), cancellation]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
        externalSignal?.removeEventListener("abort", abortExternal);
    }
}

function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(new OpenAI.APIUserAbortError()); return; }
        const abort = () => {
            clearTimeout(timer);
            reject(new OpenAI.APIUserAbortError());
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", abort);
            resolve();
        }, delayMs);
        signal?.addEventListener("abort", abort, { once: true });
    });
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

    if (error instanceof OpenAI.APIUserAbortError) {
        return new AnalyzeMoodV2Error("AI_TIMEOUT", "AI分析が中断されました。", attempts, error);
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
