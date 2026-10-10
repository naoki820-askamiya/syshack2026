import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth.js";
import { prisma } from "../prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../utils/index.js";
import {
    asyncHandler,
    getUuidParam,
    parseOrThrow,
    requireUserId,
    resourceNotFound,
} from "./http.js";

const feedbackSchema = z
    .object({
        actualOutcome: z.string().trim().min(1).max(50).nullable().optional(),
        helpfulnessScore: z.number().int().min(1).max(5).nullable().optional(),
        overreadScore: z.number().int().min(1).max(5).nullable().optional(),
        usedRecommendedAction: z.boolean().nullable().optional(),
        outcomeNote: z.string().trim().min(1).max(1000).nullable().optional(),
        allowPersonalizationUse: z.boolean().optional(),
    })
    .strict();

const router = Router();
router.use(requireAuth);

router.post("/analysis-results/:resultId/feedback", asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const resultId = getUuidParam(req.params.resultId);
    const data = parseOrThrow(feedbackSchema, req.body);
    const result = await prisma.analysisResult.findFirst({
        where: { id: resultId, userId },
        select: { id: true, analysisCaseId: true, analysisCase: { select: { personId: true } } },
    });
    if (!result) throw resourceNotFound();

    try {
        const feedback = await prisma.$transaction(async (tx) => {
            const saved = await tx.analysisFeedback.create({
                data: {
                    userId,
                    analysisCaseId: result.analysisCaseId,
                    analysisResultId: result.id,
                    ...data,
                },
            });
            await markProfileStaleForFeedback(tx, userId, result.analysisCase.personId, saved.allowPersonalizationUse);
            return saved;
        });
        res.status(201).json({ feedback });
    } catch (error) {
        if (isUniqueViolation(error)) {
            throw new AppError({
                code: "FEEDBACK_ALREADY_EXISTS",
                message: "この分析結果にはすでにFeedbackがあります。",
                status: 409,
                cause: error,
            });
        }
        throw error;
    }
}));

router.get("/analysis-results/:resultId/feedback", asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const resultId = getUuidParam(req.params.resultId);
    const ownedResult = await prisma.analysisResult.findFirst({ where: { id: resultId, userId } });
    if (!ownedResult) throw resourceNotFound();
    const feedback = await prisma.analysisFeedback.findFirst({
        where: { userId, analysisResultId: resultId },
    });
    res.json({ feedback });
}));

router.patch("/analysis-feedbacks/:feedbackId", asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const feedbackId = getUuidParam(req.params.feedbackId);
    const data = parseOrThrow(feedbackSchema, req.body);
    const existing = await prisma.analysisFeedback.findFirst({
        where: { id: feedbackId, userId },
        select: { id: true, allowPersonalizationUse: true, analysisCase: { select: { personId: true } } },
    });
    if (!existing) throw resourceNotFound();
    const feedback = await prisma.$transaction(async (tx) => {
        const saved = await tx.analysisFeedback.update({
            where: { id: existing.id },
            data,
        });
        await markProfileStaleForFeedback(
            tx, userId, existing.analysisCase.personId,
            saved.allowPersonalizationUse, existing.allowPersonalizationUse,
        );
        return saved;
    });
    res.json({ feedback });
}));

async function markProfileStaleForFeedback(
    tx: Prisma.TransactionClient, userId: string, personId: string,
    feedbackAllows: boolean, previouslyAllowed = false,
) {
    // 既に許可されたFeedbackの訂正や撤回は、現在の設定がOFFでも既存Profileを無効化します。
    if (!feedbackAllows && !previouslyAllowed) return;
    if (!previouslyAllowed) {
        const privacy = await tx.userPrivacySetting.findUnique({ where: { userId } });
        if (!privacy?.personalizationEnabled || !privacy.useFeedbackForContext) return;
    }
    await tx.$executeRaw`
        UPDATE person_profiles
        SET needs_refresh = true, stale_since = COALESCE(stale_since, now())
        WHERE user_id = ${userId}::uuid AND person_id = ${personId}::uuid
    `;
}

function isUniqueViolation(error: unknown): boolean {
    return (error as { code?: string } | null)?.code === "P2002";
}

export default router;
