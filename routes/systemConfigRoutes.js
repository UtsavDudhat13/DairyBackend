import express from 'express';
import {
    getSystemConfig,
    updateSystemConfig,
    addMilkman,
    updateMilkman,
    deleteMilkman,
    getActiveMilkmen
} from '../controllers/systemConfigController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// System configuration routes
router.route('/')
    .get(protect, getSystemConfig)
    .put(protect, admin, updateSystemConfig);

// Milkman management routes
router.route('/milkman')
    .post(protect, admin, addMilkman);

router.route('/milkman/:id')
    .put(protect, admin, updateMilkman)
    .delete(protect, admin, deleteMilkman);

// Get active milkmen
router.route('/milkmen')
    .get(protect, admin, getActiveMilkmen);

export default router;
