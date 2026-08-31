import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { asyncHandler, getUuidParam, requireUserId } from "./http.js";
import * as service from "./persons.service.js";
import { listCasesByPerson } from "./workflow.service.js";

const router = Router();
router.use(requireAuth);

router.post("/", asyncHandler(async (req, res) => {
    res.status(201).json(await service.createPerson(requireUserId(req), req.body));
}));

router.get("/", asyncHandler(async (req, res) => {
    res.json(await service.listPersons(requireUserId(req), req.query));
}));

router.get("/:personId", asyncHandler(async (req, res) => {
    res.json(await service.getPerson(requireUserId(req), getUuidParam(req.params.personId)));
}));

router.patch("/:personId", asyncHandler(async (req, res) => {
    res.json(await service.updatePerson(requireUserId(req), getUuidParam(req.params.personId), req.body));
}));

router.get("/:personId/profile", asyncHandler(async (req, res) => {
    res.json(await service.getPersonProfile(requireUserId(req), getUuidParam(req.params.personId)));
}));

router.post("/:personId/archive", asyncHandler(async (req, res) => {
    res.json(await service.archivePerson(requireUserId(req), getUuidParam(req.params.personId)));
}));

router.get("/:personId/analysis-cases", asyncHandler(async (req, res) => {
    res.json(await listCasesByPerson(requireUserId(req), getUuidParam(req.params.personId), req.query));
}));

export default router;
