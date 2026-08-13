import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../utils/index.js";

export type AuthRequest<TBody = unknown> = Request & {
    userId?: string;
    userEmail?: string | null;
    body: TBody;
};

export function requireUserId(req: AuthRequest): string {
    if (!req.userId) {
        throw new AppError({
            code: "UNAUTHENTICATED",
            message: "ログインが必要です。",
            status: 401,
        });
    }
    return req.userId;
}

export function getParam(value: string | string[] | undefined): string {
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function getUuidParam(value: string | string[] | undefined): string {
    return parseOrThrow(z.string().uuid(), getParam(value));
}

export function asyncHandler<TBody = unknown>(
    handler: (req: AuthRequest<TBody>, res: Response) => Promise<unknown>,
) {
    return (req: AuthRequest<TBody>, res: Response, next: NextFunction) => {
        handler(req, res).catch(next);
    };
}

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success) {
        throw new AppError({
            code: "VALIDATION_ERROR",
            message: "入力内容を確認してください。",
            status: 400,
            cause: result.error,
        });
    }
    return result.data;
}

export function requestIdFrom(req: Request): string {
    const supplied = req.header("x-request-id")?.trim();
    return supplied && supplied.length <= 100 ? supplied : `req_${randomUUID()}`;
}
