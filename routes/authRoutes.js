import express from 'express';
import { loginAdmin, createAdmin } from '../controllers/authController.js';

const router = express.Router();

router.post('/login', loginAdmin);
router.post('/seed', createAdmin); // This route is for initial setup, should be secured or removed in production

export default router;