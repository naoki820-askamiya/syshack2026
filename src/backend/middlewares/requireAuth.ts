import type { NextFunction, Request, Response } from "express";

export type AuthenticatedRequest = Request & {
    userId?: string;
};

export async function requireAuth(
    req: AuthenticatedRequest,
    _res: Response,
    next: NextFunction,
): Promise<void> {

    // 開発用の仮ユーザー
    req.userId = "f0afb32d-5fd5-4673-98fa-398a26bc22ab";

    next();
}