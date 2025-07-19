// routes/invoiceRoutes.js
import express from 'express';
import { protect, admin } from '../middleware/authMiddleware.js';
import {
  generateCustomerMonthlyInvoice,
  generateBatchMonthlyInvoices,
  getInvoices,
  getInvoiceById,
  updateInvoiceStatus,
  addPaymentToInvoice,
  deleteInvoice,
  getCustomerInvoiceSummary,
  getInvoiceDashboard,
  generateModernInvoicePDF,
  checkExistingInvoice,
  getCustomerInvoices
} from '../controllers/invoiceController.js';
import Invoice from '../models/Invoice.js';

const router = express.Router();

// Invoice CRUD routes  
router.route('/')
  .get(getInvoices);

router.route('/dashboard')
  .get(protect, admin, getInvoiceDashboard);

router.route('/generate/customer/:id')
  .post(protect, admin, generateCustomerMonthlyInvoice);

router.route('/generate/batch')
  .post(protect, admin, generateBatchMonthlyInvoices);

router.route('/customer/:id/summary')
  .get(getCustomerInvoiceSummary);

router.route('/customer/:id')
  .get(protect, getCustomerInvoices);

router.route('/:id')
  .get(protect, getInvoiceById)
  .delete(protect, admin, deleteInvoice);

router.route('/:id/status')
  .put(protect, admin, updateInvoiceStatus);

router.route('/:id/payment')
  .post(protect, addPaymentToInvoice);

router.route('/:id/pdf')
  .get(generateModernInvoicePDF);

// Get invoice statistics for dashboard
router.get('/stats', async (req, res) => {
  try {
    const total = await Invoice.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: '$totalAmount' }
        }
      }
    ]);

    res.json({ total: total[0]?.total || 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get recent invoices for dashboard
router.get('/recent', async (req, res) => {
  try {
    const invoices = await Invoice.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('customerId', 'name');

    const formattedInvoices = invoices.map(invoice => ({
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerId.name,
      totalAmount: invoice.totalAmount,
      status: invoice.status,
      createdAt: invoice.createdAt
    }));

    res.json({ invoices: formattedInvoices });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});
router.route('/check-existing')
  .get(protect, admin, checkExistingInvoice);
export default router;