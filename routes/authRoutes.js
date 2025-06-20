import express from 'express';
import { loginAdmin, getAdminProfile, createAdmin } from '../controllers/authController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', loginAdmin);
router.get('/profile', protect, admin, getAdminProfile);
router.post('/seed', createAdmin); // This route is for initial setup, should be secured or removed in production

export default router;