import express from 'express';
import {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryWithSubcategories
} from '../controllers/categoryController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import Category from '../models/Category.js';
import Subcategory from '../models/Subcategory.js';

const router = express.Router();

router.route('/')
  .get(getCategories)
  .post(protect, admin, createCategory);

router.route('/:id')
  .get(getCategoryById)
  .put(protect, admin, updateCategory)
  .delete(protect, admin, deleteCategory);

router.route('/:id/subcategories')
  .get(getCategoryWithSubcategories);

// Get total products count for dashboard
router.get('/count', async (req, res) => {
  try {
    const [categoryCount, subcategoryCount] = await Promise.all([
      Category.countDocuments(),
      Subcategory.countDocuments()
    ]);

    res.json({ count: categoryCount + subcategoryCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;