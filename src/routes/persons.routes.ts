/**
 * このファイルは persons 系 API の route をまとめる場所です。
 *
 * `/api/persons` の下に来る URL をここで受け取り、
 * どの controller に渡すかだけを決めます。
 *
 * まだ backend に慣れていない人は、
 * 「URL の分岐だけを書いている場所」
 * と考えると分かりやすいです。
 */
import { Router } from "express";
import { createPerson } from "../controllers/persons.controller.ts";
import { getCasesByPerson } from "../controllers/analysisCases.controller.ts";
import { requireSession } from "../middlewares/requireSession.ts";

const router = Router();

// Person を新しく作る URL です。
// Person は session にひも付くので、x-session-id を必須にしています。
router.post("/", requireSession, createPerson);

// 特定の Person にひも付く analysis-case 一覧を取る URL です。
// 一覧取得そのものは analysisCases controller に渡しています。
router.get("/:personId/analysis-cases", requireSession, getCasesByPerson);

export default router;
