import express from 'express';
import { loginAdmin, createAdmin, getAllAdmins, updateAdmin, deleteAdmin } from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/login', loginAdmin);
router.post('/seed', createAdmin); // This route is for initial setup, should be secured or removed in production

// Admin management routes (protected)
router.get('/admins', protect, getAllAdmins);
router.post('/admins', protect, createAdmin);
router.put('/admins/:id', protect, updateAdmin);
router.delete('/admins/:id', protect, deleteAdmin);

export default router;