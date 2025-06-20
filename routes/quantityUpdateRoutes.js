import express from 'express';
import { updateCustomerQuantity, getQuantityUpdates } from '../controllers/quantityUpdateController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(getQuantityUpdates)
  .post(updateCustomerQuantity); 

export default router;