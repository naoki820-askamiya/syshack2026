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
    req.userId = "11111111-1111-1111-1111-111111111111";

    next();
}