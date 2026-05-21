/**
 * このファイルは persons の controller です。
 *
 * controller の役割は、
 * - request から必要な値を取り出す
 * - service に渡す
 * - service の返り値を response に入れて返す
 * ことです。
 *
 * つまり、ここは「入口と出口の整理役」です。
 */
import type { NextFunction, Request, Response } from "express";
import type { CreatePersonBody } from "../types/index.js";
import * as personsService from "../services/persons.service.js";

// middleware で付与された sessionId を安全に扱うための型です。
// type SessionRequest<TBody = unknown> = Request & {
//     sessionId?: string;
//     body: TBody;
// };
type AuthenticatedRequest<TBody = unknown> = Request & {
    userId?: string;
    body: TBody;
};

/**
 * Person 作成 API の controller です。
 *
 * 受け取るもの:
 * - header の `X-Session-Id`
 * - body の `CreatePersonBody`
 *
 * 返すもの:
 * - 作成された person を 201 で返します
 */
export async function createPerson(
    req: AuthenticatedRequest<CreatePersonBody>,
    res: Response,
    next: NextFunction,
) {
    try {
        const result = await personsService.createPerson(
            req.userId ?? "",
            req.body,
        );

        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
}
