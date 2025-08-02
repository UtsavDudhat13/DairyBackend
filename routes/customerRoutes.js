import express from 'express';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  authCustomer,
  getCustomersWithAdvance,
} from '../controllers/customerController.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import Customer from '../models/Customer.js';

const router = express.Router();

router.route('/')
  .get(protect, admin, getCustomers)
  .post(protect, admin, createCustomer);

// Get customers with advance payments
router.route('/with-advance')
  .get(protect, admin, getCustomersWithAdvance);

router.route('/login')
  .post(authCustomer);

router.route('/:id')
  .get(protect, getCustomerById)
  .put(protect, admin, updateCustomer)
  .delete(protect, admin, deleteCustomer);

// Get total customer count for dashboard
router.get('/count', async (req, res) => {
  try {
    const count = await Customer.countDocuments();
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;