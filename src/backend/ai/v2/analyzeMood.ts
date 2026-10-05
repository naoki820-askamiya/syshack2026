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

export interface AiAttemptMetrics {
    attempt: number;
    model: string;
    outcome: "succeeded" | "failed";
    failureCode: AnalyzeFailureCode | null;
    duration: {
        prompt_build_ms: number | null;
        provider_request_ms: number | null;
        // Observed SDK parse fulfillment, including receive/parse; not provider server time.
        provider_complete_ms: number | null;
        validation_ms: number | null;
        total_attempt_ms: number;
    };
    usage: {
        input_tokens: number | null;
        output_tokens: number | null;
        total_tokens: number | null;
        cached_tokens: number | null;
        reasoning_tokens: number | null;
    };
}

type ResponsesClient = Pick<OpenAI["responses"], "parse">;

export async function analyzeMoodV2(
    rawInput: AiAnalysisInput,
    options: {
        client?: ResponsesClient;
        signal?: AbortSignal;
        timeoutMs?: number;
        onAttemptMetrics?: (metrics: AiAttemptMetrics) => void | Promise<void>;
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
        const attemptStartedAt = performance.now();
        const metrics: AiAttemptMetrics = {
            attempt, model, outcome: "failed", failureCode: null,
            duration: { prompt_build_ms: null, provider_request_ms: null,
                provider_complete_ms: null, validation_ms: null, total_attempt_ms: 0 },
            usage: readTokenUsage(null),
        };
        let providerStartedAt: number | null = null;
        try {
            const remainingMs = deadline - performance.now();
            const response = await withAttemptDeadline((signal) => {
                const promptStartedAt = performance.now();
                let body;
                try {
                    body = {
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
                    };
                } finally {
                    metrics.duration.prompt_build_ms = elapsedMs(promptStartedAt);
                }
                providerStartedAt = performance.now();
                return client.parse(body, {
                    signal,
                    // SDK 4.x requires integer milliseconds; the outer timer keeps the precise deadline.
                    timeout: Math.max(1, Math.floor(remainingMs)),
                    maxRetries: 0,
                });
            }, remainingMs, options.signal).finally(() => {
                if (providerStartedAt !== null) metrics.duration.provider_request_ms = elapsedMs(providerStartedAt);
            });
            metrics.duration.provider_complete_ms = metrics.duration.provider_request_ms;
            metrics.usage = readTokenUsage(response);

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

            const validationStartedAt = performance.now();
            let analysis: KigenAnalysisResultV2;
            try {
                analysis = validateAiOutput(response.output_parsed, input.referenceContext);
            } finally {
                metrics.duration.validation_ms = elapsedMs(validationStartedAt);
            }
            metrics.outcome = "succeeded";
            emitAttemptMetrics(options.onAttemptMetrics, metrics, attemptStartedAt);
            return { analysis, model, attempts: attempt };
        } catch (error) {
            lastError = error;
            const normalized = normalizeAttemptError(error, attempt);
            metrics.failureCode = normalized.code;
            emitAttemptMetrics(options.onAttemptMetrics, metrics, attemptStartedAt);

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

function elapsedMs(startedAt: number): number {
    return Math.round(Math.max(0, performance.now() - startedAt) * 100) / 100;
}

function emitAttemptMetrics(
    observer: ((metrics: AiAttemptMetrics) => void | Promise<void>) | undefined,
    metrics: AiAttemptMetrics,
    startedAt: number,
): void {
    metrics.duration.total_attempt_ms = elapsedMs(startedAt);
    // No prompt, response, headers, IDs, or error detail is forwarded to monitoring.
    try {
        const observation = observer?.(metrics);
        // Monitoring is not awaited and does not control a provider attempt or its result.
        if (observation) void observation.catch(() => {});
    } catch { /* Monitoring must not change analysis behavior. */ }
}

function readTokenUsage(response: { usage?: OpenAI.Responses.ResponseUsage | null } | null): AiAttemptMetrics["usage"] {
    const knownCount = (value: unknown): number | null =>
        typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
    try {
        const usage = response?.usage;
        return {
            input_tokens: knownCount(usage?.input_tokens),
            output_tokens: knownCount(usage?.output_tokens),
            total_tokens: knownCount(usage?.total_tokens),
            cached_tokens: knownCount(usage?.input_tokens_details?.cached_tokens),
            reasoning_tokens: knownCount(usage?.output_tokens_details?.reasoning_tokens),
        };
    } catch {
        // Instrumentation must also tolerate unreadable optional provider metadata.
        return { input_tokens: null, output_tokens: null, total_tokens: null, cached_tokens: null, reasoning_tokens: null };
    }
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
