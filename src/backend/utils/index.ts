/**
 * このファイルは、複数の場所で共通して使う小さな道具をまとめる場所です。
 *
 * ここにあるものの例:
 * - 共通エラークラス
 * - timeout（長くかかりすぎる処理を途中で止める仕組み）
 * - 環境変数読み取り
 *
 * service や middleware から何度も使う処理をここへ寄せることで、
 * 同じコードを何度も書かなくて済むようにしています。
 */
import type {
    AIInputDTO,
    AnalysisCaseInput,
    AppErrorShape,
    ErrorResponseBody,
} from "../types/index.ts";

// Analyze API の共通 timeout 値です。
// 複数箇所に数字を散らさず、仕様変更時もここだけ直せるようにしています。
export const ANALYZE_TIMEOUT_MS = 15000;
export const SESSION_HEADER_NAME = "X-Session-Id";

// アプリ内で共通利用するエラークラスです。
// code / message / status を必ず持たせることで、最終的な API 返却形式をそろえやすくしています。
export class AppError extends Error implements AppErrorShape {
    code: string;
    status: number;
    override cause?: unknown;

    constructor({ code, message, status, cause }: AppErrorShape) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.status = status;
        this.cause = cause;
    }
}

// 受け取った値が「このアプリで期待するエラー shape か」を判定します。
// throw された値は Error とは限らないため、先に形を確認しておく必要があります。
export function isAppError(error: unknown): error is AppErrorShape {
    if (!error || typeof error !== "object") {
        return false;
    }

    const candidate = error as Partial<AppErrorShape>;
    return (
        typeof candidate.code === "string" &&
        typeof candidate.message === "string" &&
        typeof candidate.status === "number"
    );
}

// どんな error が来ても AppError にそろえる関数です。
// こうしておくと errorHandler 側は「必ず code / message / status がある」と信じて処理できます。
export function normalizeError(error: unknown): AppError {
    if (error instanceof AppError) {
        return error;
    }

    if (isAppError(error)) {
        return new AppError(error);
    }

    if (error instanceof Error) {
        return new AppError({
            code: "INTERNAL_SERVER_ERROR",
            message: "サーバー内部エラーが発生しました。",
            status: 500,
            cause: error,
        });
    }

    return new AppError({
        code: "INTERNAL_SERVER_ERROR",
        message: "サーバー内部エラーが発生しました。",
        status: 500,
        cause: error,
    });
}

// API の仕様どおりに { error: { code, message, status } } へ変換します。
// 返却形式を 1 か所に集めることで、各 controller や middleware で形がぶれにくくなります。
export function toErrorResponse(error: unknown): ErrorResponseBody {
    const normalized = normalizeError(error);

    return {
        error: {
            code: normalized.code,
            message: normalized.message,
            status: normalized.status,
        },
    };
}

// 実行環境の環境変数を読むための小さな関数です。
// 直接 process.env を散らさず、参照方法をまとめておくために置いています。
export function readEnv(name: string): string | undefined {
    const scope = globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
    };

    return scope.process?.env?.[name];
}

// 指定時間を超えた処理を打ち切るための共通関数です。
// Analyze API では 15000ms を超えたら待ち続けずに AI_TIMEOUT に変換し、
// B 側の処理が「いつまでも戻ってこない」状態を防ぎます。
export async function withTimeout<T>(
    task: (signal: AbortSignal) => Promise<T>,
    timeoutMs = ANALYZE_TIMEOUT_MS,
): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
            controller.abort();
            reject(buildAiTimeoutError());
        }, timeoutMs);
    });

    try {
        return await Promise.race([task(controller.signal), timeoutPromise]);
    } catch (error) {
        if (
            (error as { name?: string } | undefined)?.name === "AbortError" ||
            controller.signal.aborted
        ) {
            throw buildAiTimeoutError(error);
        }

        throw error;
    } finally {
        if (timer) {
            clearTimeout(timer);
        }
    }
}

export function buildSessionHeaderRequiredError(): AppError {
    return new AppError({
        code: "SESSION_INVALID",
        message: `${SESSION_HEADER_NAME} ヘッダーが必要です。`,
        status: 401,
    });
}

export function buildSessionInvalidError(): AppError {
    return new AppError({
        code: "SESSION_INVALID",
        message: `${SESSION_HEADER_NAME} が無効または期限切れです。`,
        status: 401,
    });
}

function buildAiTimeoutError(cause?: unknown): AppError {
    return new AppError({
        code: "AI_TIMEOUT",
        message: "AI 分析がタイムアウトしました。",
        status: 503,
        cause,
    });
}

// スコアを 0〜1 の範囲に丸めます。
// mock と外部 AI の両方で、値のぶれを画面側に持ち込まないために使います。
export function clampScore(value: number): number {
    return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

// B 側の analysisCase から、AI が必要とする情報だけを抜き出して DTO に変換します。
// AI 層と B 側の業務データをゆるくつなぐための、境界の役割を持っています。
export function buildAIInputDTO(analysisCase: AnalysisCaseInput): AIInputDTO {
    return {
        caseId: String(analysisCase.id ?? "unknown"),
        eventFacts: String(analysisCase.eventFacts ?? ""),
        selfMessage: String(analysisCase.selfMessage ?? ""),
        partnerMessage: String(analysisCase.partnerMessage ?? ""),
    };
}
