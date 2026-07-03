import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import type { Request, Response } from 'express';

type AuthRequest = Request & {
    userId?: string;
    userEmail?: string | null;
};

const router = Router();

router.get('/', (req: Request, res: Response, next) => {
    const authorization = req.headers.authorization;

    if (!authorization) {
        res.json({ user: null });
        return;
    }

    requireAuth(req as AuthRequest, res, (error?: unknown) => {
        if (error) {
            res.status(401).json({
                error: {
                    code: 'AUTH_INVALID',
                    message: '認証情報が無効です。',
                    status: 401,
                },
            });
            return;
        }

        const authReq = req as AuthRequest;
        res.json({
            user: {
                id: authReq.userId,
                email: authReq.userEmail ?? null,
            },
        });
    }).catch(next);
});

export default router;
