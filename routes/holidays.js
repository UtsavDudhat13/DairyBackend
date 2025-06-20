// backend/routes/holidayRoutes.js
import express from 'express';
import { 
  getHolidays, 
  getHolidayById, 
  createHoliday, 
  updateHoliday, 
  deleteHoliday,
  getUpcomingHolidays,
  getHolidaysByYear
} from '../controllers/holidayController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Special routes first to avoid conflicts
router.route('/upcoming')
  .get(getUpcomingHolidays);

router.route('/year/:year')
  .get(getHolidaysByYear);

// Standard CRUD routes
router.route('/')
  .get(getHolidays)
  .post(protect, admin, createHoliday);

router.route('/:id')
  .get(getHolidayById)
  .put(protect, admin, updateHoliday)
  .delete(protect, admin, deleteHoliday);

export default router;