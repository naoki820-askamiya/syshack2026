import { Router } from "express";
import { createSession } from "../controllers/sessions.controller";

const router = Router();

/**
 * POST /api/sessions
 * セッションを新規作成するエンドポイント
 * - フロントはここを最初に叩く
 * - controllerに処理を委譲するだけ
 */
router.post("/sessions", createSession);

export default router;