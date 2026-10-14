import type { AppErrorShape, ErrorResponseBody } from "../types/index.js";

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

export function normalizeError(error: unknown): AppError {
    if (error instanceof AppError) {
        return error;
    }

    if (isAppError(error)) {
        return new AppError(error);
    }

    return new AppError({
        code: "INTERNAL_SERVER_ERROR",
        message: "サーバー内部エラーが発生しました。",
        status: 500,
        cause: error,
    });
}

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

export function readEnv(name: string): string | undefined {
    const scope = globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
    };

    return scope.process?.env?.[name];
}
