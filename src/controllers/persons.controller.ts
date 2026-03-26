import type { NextFunction, Request, Response } from "express";
import type { CreatePersonBody } from "../types/index.ts";
import * as personsService from "../services/persons.service.ts";

type SessionRequest<TBody = unknown> = Request & {
    sessionId?: string;
    body: TBody;
};

// Person 作成の controller です。
// HTTP の入出力だけを担当し、検証や保存は service に任せます。
export async function createPerson(
    req: SessionRequest<CreatePersonBody>,
    res: Response,
    next: NextFunction,
) {
    try {
        const result = await personsService.createPerson(
            req.sessionId ?? "",
            req.body,
        );

        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
}
