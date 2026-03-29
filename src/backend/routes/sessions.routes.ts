/**
 * このファイルは sessions 系 API の route をまとめる場所です。
 *
 * 今回の MVP では、
 * `POST /api/sessions`
 * だけを持つシンプルな route です。
 *
 * この API は session 発行用なので、
 * まだ session を持っていない状態でも呼べるように
 * `requireSession` は付けません。
 */
import { Router } from "express";
import { createSession } from "../controllers/sessions.controller.js";

const router = Router();

router.post("/", createSession);

export default router;
