import express from 'express';
import { createDailyRecords, getRecords, getRecordsSummary, getRecordById, updateRecord, deleteRecord, getRecordsByCustomer } from '../controllers/recordController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(getRecords);

router.route('/daily')
  .post(createDailyRecords);

router.route('/customer/:id')
  .get(getRecordsByCustomer);

router.route('/:id')
  .get(protect, getRecordById)
  .put(protect, admin, updateRecord)
  .delete(protect, admin, deleteRecord);

router.route('/summary')
  .get(protect, getRecordsSummary);

export default router;