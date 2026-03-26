import type { NextFunction, Request, Response } from "express";
import type { CreateAnalysisCaseBody } from "../types/index.ts";
import * as analysisCasesService from "../services/analysisCases.service.ts";

type SessionRequest<TBody = unknown> = Request & {
    sessionId?: string;
    body: TBody;
};

export async function createAnalysisCase(
    req: SessionRequest<CreateAnalysisCaseBody>,
    res: Response,
    next: NextFunction,
) {
    try {
        const result = await analysisCasesService.createAnalysisCase(
            req.sessionId ?? "",
            req.body,
        );

        res.status(201).json(result);
    } catch (error) {
        next(error);
    }
}

export async function analyzeCase(
    req: SessionRequest,
    res: Response,
    next: NextFunction,
) {
    try {
        const result = await analysisCasesService.analyzeCase(
            req.sessionId ?? "",
            req.params.caseId,
        );

        res.json(result);
    } catch (error) {
        next(error);
    }
}

export async function getResult(
    req: SessionRequest,
    res: Response,
    next: NextFunction,
) {
    try {
        const result = await analysisCasesService.getResult(
            req.sessionId ?? "",
            req.params.caseId,
        );

        res.json(result);
    } catch (error) {
        next(error);
    }
}

export async function getCasesByPerson(
    req: SessionRequest,
    res: Response,
    next: NextFunction,
) {
    try {
        const limit = Number(req.query.limit ?? 20);
        const offset = Number(req.query.offset ?? 0);

        const result = await analysisCasesService.getCasesByPerson(
            req.sessionId ?? "",
            req.params.personId,
            { limit, offset },
        );

        res.json(result);
    } catch (error) {
        next(error);
    }
}
