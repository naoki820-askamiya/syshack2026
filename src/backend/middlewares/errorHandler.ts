/**
 * このファイルは共通エラーハンドリング用の middleware です。
 *
 * 役割:
 * - 途中で起きたエラーを最後にまとめて受け取る
 * - API の返却形式をそろえる
 *
 * ここがあることで、どの場所でエラーが起きても
 * クライアント側は同じ形の JSON を受け取れます。
 */
import type {
    ErrorRequestHandler,
    NextFunction,
    Request,
    Response,
} from "express";
import { normalizeError, toErrorResponse } from "../utils/index.ts";

// どの層で起きたエラーでも、最後は同じ JSON 形式で返すための middleware です。
// 返却形式をここで統一しておくと、AI 層・service 層・middleware 層で投げ方が違っても、
// クライアント側は常に { error: { code, message, status } } を前提に扱えます。
export const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
): unknown => {
    // まず、どんな種類の error でも扱いやすい共通 shape にそろえます。
    const normalized = normalizeError(error);
    const body = toErrorResponse(normalized);

    return res.status(normalized.status).json(body);
};
