import express from 'express';
import {
  addStockEntry,
  getStockEntries,
  getStockEntryById,
  updateStockEntry,
  deleteStockEntry,
  getStockSummary,
  getStockByCategory
} from '../controllers/stockController.js';

const router = express.Router();

// Stock entry routes
router.route('/')
  .post(addStockEntry)
  .get(getStockEntries);

// Stock summary route
router.route('/summary')
  .get(getStockSummary);

// Stock by category route
router.route('/categories')
  .get(getStockByCategory);

// Stock entry by ID routes
router.route('/:id')
  .get(getStockEntryById)
  .put(updateStockEntry)
  .delete(deleteStockEntry);

export default router;  