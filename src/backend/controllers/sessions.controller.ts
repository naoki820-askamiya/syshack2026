/**
 * このファイルは sessions の controller です。
 *
 * controller は、
 * - request を受け取る
 * - service を呼ぶ
 * - response を返す
 *
 * 今回の `POST /api/sessions` は body も header も不要なので、
 * controller では service を呼んでそのまま 201 で返します。
 */
import type { NextFunction, Request, Response } from "express";
import * as sessionsService from "../services/sessions.service.js";

/**
 * 新しい session を発行する controller です。
 *
 * 返すもの:
 * - 新しく作られた session
 */
export async function createSession(
    _req: Request,
    res: Response,
    next: NextFunction,
) {
    try {
        const result = await sessionsService.createSession();
        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
}
