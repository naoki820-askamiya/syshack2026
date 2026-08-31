import type {
    ErrorRequestHandler,
    NextFunction,
    Request,
    Response,
} from "express";
import { normalizeError, toErrorResponse } from "../utils/index.js";

export const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
): unknown => {
    const normalized = normalizeError(error);
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
