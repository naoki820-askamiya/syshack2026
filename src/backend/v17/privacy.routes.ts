import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth.js";
import { prisma } from "../prisma/client.js";
import { asyncHandler, parseOrThrow, requireUserId } from "./http.js";

const updateSchema = z
    .object({
        personalizationEnabled: z.boolean().optional(),
        usePersonProfile: z.boolean().optional(),
        useUserPatternSummary: z.boolean().optional(),
        useFeedbackForContext: z.boolean().optional(),
    })
    .strict();

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const settings = await prisma.userPrivacySetting.upsert({
        where: { userId },
        create: { userId },
        update: {},
    });
    res.json({ settings });
}));

router.patch("/", asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const data = parseOrThrow(updateSchema, req.body);
    const settings = await prisma.userPrivacySetting.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
    });
    res.json({ settings });
}));

export default router;
