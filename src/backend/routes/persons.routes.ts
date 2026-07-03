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
import { createPerson } from "../controllers/persons.controller.js";
import { getCasesByPerson } from "../controllers/analysisCases.controller.js";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

// Person を新しく作る URL です。
// Person はログイン中ユーザーにひも付くので、Supabase Auth を必須にしています。
router.post("/", requireAuth, createPerson);

// 特定の Person にひも付く analysis-case 一覧を取る URL です。
// 一覧取得そのものは analysisCases controller に渡しています。
router.get("/:personId/analysis-cases", requireAuth, getCasesByPerson);

export default router;
