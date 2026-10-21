import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { prisma } from "../prisma/client.js";
import { asyncHandler, requireUserId } from "./http.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const summary = await prisma.userPatternSummary.findUnique({ where: { userId } });
    res.json({ summary });
}));

router.delete("/", asyncHandler(async (req, res) => {
    const userId = requireUserId(req);
    const deleted = await prisma.userPatternSummary.deleteMany({ where: { userId } });
    res.json({ deleted: deleted.count > 0 });
}));

export default router;
