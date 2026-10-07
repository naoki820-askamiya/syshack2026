import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth.js';
import { asyncHandler, requireUserId } from './http.js';
import { getConsent, recordConsent } from './consent.service.js';

const router = Router();
router.use(requireAuth);
router.get('/', asyncHandler(async (req, res) => { res.json(await getConsent(requireUserId(req))); }));
router.post('/', asyncHandler(async (req, res) => { res.json(await recordConsent(requireUserId(req), req.body)); }));
export default router;
