import { Router } from "express";
import { createPerson } from "../controllers/persons.controller.ts";
import { getCasesByPerson } from "../controllers/analysisCases.controller.ts";
import { requireSession } from "../middlewares/requireSession.ts";

const router = Router();

router.post("/", requireSession, createPerson);
router.get("/:personId/analysis-cases", requireSession, getCasesByPerson);

export default router;
