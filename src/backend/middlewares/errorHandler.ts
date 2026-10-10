import type {
    ErrorRequestHandler,
    NextFunction,
    Request,
    Response,
} from "express";
import { AppError, normalizeError, toErrorResponse } from "../utils/index.js";

export const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
): unknown => {
    const normalized = normalizeJsonParserError(error) ?? normalizeError(error);
    const body = toErrorResponse(normalized);

    // 内部例外を公開せず、サーバーログと利用者の問い合わせをrequestIdで対応付けます。
    return res.status(normalized.status).json({
        ...body,
        error: {
            ...body.error,
            requestId: String(res.locals.requestId ?? ""),
        },
    });
};

function normalizeJsonParserError(error: unknown): AppError | null {
    if (!error || typeof error !== "object") return null;
    const parserError = error as { type?: unknown; status?: unknown };
    if (parserError.type === "entity.parse.failed" && parserError.status === 400) {
        return new AppError({
            code: "INVALID_JSON", message: "JSON形式の入力内容を確認してください。", status: 400,
        });
    }
    if (parserError.type === "entity.too.large" && parserError.status === 413) {
        return new AppError({
            code: "PAYLOAD_TOO_LARGE", message: "送信内容が大きすぎます。", status: 413,
        });
    }
    return null;
}
