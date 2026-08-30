export interface AppErrorShape {
    code: string;
    message: string;
    status: number;
    cause?: unknown;
}

export interface ErrorResponseBody {
    error: {
        code: string;
        message: string;
        status: number;
    };
}

export interface RequestLike {
    headers?: Record<string, string | string[] | undefined>;
    userId?: string;
    userEmail?: string | null;
}

export interface ResponseLike {
    status?: (statusCode: number) => ResponseLike;
    json?: (body: unknown) => unknown;
    statusCode?: number;
    body?: unknown;
}

export type NextLike = (error?: unknown) => void;
