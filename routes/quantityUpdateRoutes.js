import express from 'express';
import { updateCustomerQuantity, getQuantityUpdates, deleteQuantityUpdate, acceptQuantityUpdate, rejectQuantityUpdate } from '../controllers/quantityUpdateController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(getQuantityUpdates)
  .post(updateCustomerQuantity);

// Add DELETE route for deleting a quantity update by ID
router.route('/:id').delete(deleteQuantityUpdate);

// Add PATCH route for accepting a quantity update by ID
router.route('/accept').patch(acceptQuantityUpdate);


router.route('/:id/reject').patch(rejectQuantityUpdate);

export default router;