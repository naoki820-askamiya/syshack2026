import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { asyncHandler, getUuidParam, requireUserId } from "./http.js";
import * as service from "./workflow.service.js";

const router = Router();
router.use(requireAuth);

router.post("/", asyncHandler(async (req, res) => {
    res.status(201).json(await service.createAnalysisCase(requireUserId(req), req.body));
}));

router.get("/:caseId", asyncHandler(async (req, res) => {
    res.json(await service.getAnalysisCase(requireUserId(req), getUuidParam(req.params.caseId)));
}));

router.post("/:caseId/analyze", asyncHandler(async (req, res) => {
    res.json(await service.analyzeCase(requireUserId(req), getUuidParam(req.params.caseId)));
}));

router.get("/:caseId/results/latest", asyncHandler(async (req, res) => {
    res.json(await service.getLatestResult(requireUserId(req), getUuidParam(req.params.caseId)));
}));

router.get("/:caseId/results", asyncHandler(async (req, res) => {
    res.json(await service.listResults(requireUserId(req), getUuidParam(req.params.caseId), req.query));
}));

export default router;
