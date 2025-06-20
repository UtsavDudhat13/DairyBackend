// controllers/invoiceController.js
import mongoose from 'mongoose';
import Invoice from '../models/Invoice.js';
import Record from '../models/Record.js';
import Customer from '../models/Customer.js';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import { registerFonts } from '../config/fonts.js';

const generateInvoiceNumber = async () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');

    // Find the latest invoice to increment the counter
    const latestInvoice = await Invoice.findOne({}, {}, { sort: { 'createdAt': -1 } });
    let counter = 1;

    if (latestInvoice) {
        // Extract counter from the last invoice number (format: INV-YY-MM-XXXX)
        const lastCounter = parseInt(latestInvoice.invoiceNumber.split('-')[3]);
        counter = isNaN(lastCounter) ? 1 : lastCounter + 1;
    }

    return `INV-${year}-${month}-${counter.toString().padStart(4, '0')}`;
};

// @desc    Check if invoice exists for customer and period
// @route   GET /api/invoices/check-existing
// @access  Private/Admin
export const checkExistingInvoice = async (req, res) => {
    try {
        const { customerId, month, year } = req.query;

        if (!customerId || !month || !year) {
            return res.status(400).json({ message: 'Customer ID, month, and year are required' });
        }

        // Validate month and year
        const monthNum = parseInt(month);
        const yearNum = parseInt(year);

        if (monthNum < 1 || monthNum > 12) {
            return res.status(400).json({ message: 'Invalid month' });
        }

        // Calculate start and end dates for the month
        const startDate = new Date(yearNum, monthNum - 1, 1);
        const endDate = new Date(yearNum, monthNum, 0); // Last day of the month

        // Check if invoice already exists for this period
        const existingInvoice = await Invoice.findOne({
            customer: customerId,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
        }).populate('customer', 'name customerNo');

        if (existingInvoice) {
            return res.json({
                exists: true,
                invoiceNumber: existingInvoice.invoiceNumber,
                status: existingInvoice.status,
                totalAmount: existingInvoice.totalAmount,
                amountPaid: existingInvoice.amountPaid,
                dueAmount: existingInvoice.dueAmount,
                updatedAt: existingInvoice.updatedAt,
                _id: existingInvoice._id
            });
        }

        return res.status(404).json({ exists: false });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// @desc    Generate monthly invoice for a specific customer
// @route   POST /api/invoices/generate/customer/:id
// @access  Private/Admin
export const generateCustomerMonthlyInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const { month, year, updateExisting = false } = req.body;

        if (!month || !year) {
            return res.status(400).json({ message: 'Month and year are required' });
        }

        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        const isCurrentMonth = parseInt(month) === currentMonth && parseInt(year) === currentYear;

        // Get the last day of the month
        const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
        const currentDay = currentDate.getDate();

        // If it's current month and not the last 3 days, prevent generation
        if (isCurrentMonth && currentDay < lastDayOfMonth - 2) {
            return res.status(400).json({
                message: `Cannot generate invoices for the current month until the end of the month (${lastDayOfMonth - currentDay} days remaining). This ensures all milk deliveries are included in the invoice.`
            });
        }

        // Validate month and year
        const monthNum = parseInt(month);
        const yearNum = parseInt(year);

        if (monthNum < 1 || monthNum > 12) {
            return res.status(400).json({ message: 'Invalid month' });
        }

        // Calculate start and end dates for the month
        const startDate = new Date(yearNum, monthNum - 1, 1);
        const endDate = new Date(yearNum, monthNum, 0); // Last day of the month

        // Check if invoice already exists for this period
        const existingInvoice = await Invoice.findOne({
            customer: id,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
        });

        // REMOVED THE BLOCKING ERROR - Now it only blocks if updateExisting is explicitly false
        if (existingInvoice && updateExisting === false) {
            return res.status(400).json({
                message: 'Invoice already exists for this period',
                invoiceId: existingInvoice._id,
                invoiceNumber: existingInvoice.invoiceNumber
            });
        }

        // Find the customer
        const customer = await Customer.findById(id);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Get all records for this customer in the specified month
        const records = await Record.find({
            customer: id,
            date: {
                $gte: startDate,
                $lte: endDate,
            },
        }).sort({ date: 1 });

        if (records.length === 0) {
            return res.status(404).json({ message: 'No records found for this period' });
        }

        // Calculate totals
        let totalQuantity = 0;
        let totalAmount = 0;
        const items = [];

        records.forEach(record => {
            totalQuantity += record.totalQuantity;
            totalAmount += record.totalAmount;

            items.push({
                date: record.date,
                morningQuantity: record.morningQuantity,
                eveningQuantity: record.eveningQuantity,
                dailyQuantity: record.totalQuantity,
                price: record.price,
                dailyAmount: record.totalAmount,
            });
        });

        let invoice;

        if (existingInvoice) {
            // Update existing invoice
            existingInvoice.totalQuantity = totalQuantity;
            existingInvoice.totalAmount = totalAmount;
            existingInvoice.items = items;

            // Recalculate due amount (total - paid amount)
            existingInvoice.dueAmount = totalAmount - (existingInvoice.amountPaid || 0);

            // Update the end date to current calculation
            existingInvoice.endDate = endDate;

            invoice = await existingInvoice.save();
        } else {
            // Create new invoice
            const invoiceNumber = await generateInvoiceNumber();

            // Set due date (e.g., 15 days from end of month)
            const dueDate = new Date(endDate);
            dueDate.setDate(dueDate.getDate() + 15);

            invoice = await Invoice.create({
                customer: id,
                invoiceNumber,
                startDate,
                endDate,
                totalQuantity,
                totalAmount,
                dueAmount: totalAmount, // Initially, due amount equals total amount
                status: 'pending',
                dueDate,
                items,
            });
        }

        return res.status(existingInvoice ? 200 : 201).json(invoice);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// @desc    Generate monthly invoices for all active customers
// @route   POST /api/invoices/generate/batch
// @access  Private/Admin
export const generateBatchMonthlyInvoices = async (req, res) => {
    try {
        const { month, year, updateExisting = false } = req.body;

        if (!month || !year) {
            return res.status(400).json({ message: 'Month and year are required' });
        }

        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        const isCurrentMonth = parseInt(month) === currentMonth && parseInt(year) === currentYear;

        // Get the last day of the month
        const lastDayOfMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
        const currentDay = currentDate.getDate();

        // If it's current month and not the last 3 days, prevent generation
        if (isCurrentMonth && currentDay < lastDayOfMonth - 2) {
            return res.status(400).json({
                message: `Cannot generate invoices for the current month until the end of the month (${lastDayOfMonth - currentDay} days remaining). This ensures all milk deliveries are included in the invoice.`
            });
        }

        // Validate month and year
        const monthNum = parseInt(month);
        const yearNum = parseInt(year);

        if (monthNum < 1 || monthNum > 12) {
            return res.status(400).json({ message: 'Invalid month' });
        }

        // Calculate start and end dates for the month
        const startDate = new Date(yearNum, monthNum - 1, 1);
        const endDate = new Date(yearNum, monthNum, 0); // Last day of the month

        // Get all active customers
        const customers = await Customer.find({ isActive: true });

        const results = {
            created: [],
            updated: [],
            failed: [],
        };

        // Process each customer
        for (const customer of customers) {
            try {
                // Check if invoice already exists for this customer and period
                const existingInvoice = await Invoice.findOne({
                    customer: customer._id,
                    startDate: { $lte: endDate },
                    endDate: { $gte: startDate },
                });

                if (existingInvoice && !updateExisting) {
                    results.failed.push({
                        customer: customer._id,
                        name: customer.name,
                        reason: 'Invoice already exists for this period',
                        invoiceNumber: existingInvoice.invoiceNumber
                    });
                    continue;
                }

                // Get all records for this customer in the specified month
                const records = await Record.find({
                    customer: customer._id,
                    date: {
                        $gte: startDate,
                        $lte: endDate,
                    },
                }).sort({ date: 1 });

                if (records.length === 0) {
                    results.failed.push({
                        customer: customer._id,
                        name: customer.name,
                        reason: 'No records found for this period',
                    });
                    continue;
                }

                // Calculate totals
                let totalQuantity = 0;
                let totalAmount = 0;
                const items = [];

                records.forEach(record => {
                    totalQuantity += record.totalQuantity;
                    totalAmount += record.totalAmount;

                    items.push({
                        date: record.date,
                        morningQuantity: record.morningQuantity,
                        eveningQuantity: record.eveningQuantity,
                        dailyQuantity: record.totalQuantity,
                        price: record.price,
                        dailyAmount: record.totalAmount,
                    });
                });

                let invoice;

                if (existingInvoice && updateExisting) {
                    // Update existing invoice
                    existingInvoice.totalQuantity = totalQuantity;
                    existingInvoice.totalAmount = totalAmount;
                    existingInvoice.items = items;

                    // Recalculate due amount (total - paid amount)
                    existingInvoice.dueAmount = totalAmount - (existingInvoice.amountPaid || 0);

                    // Update the end date to current calculation
                    existingInvoice.endDate = endDate;

                    invoice = await existingInvoice.save();

                    results.updated.push({
                        customer: customer._id,
                        name: customer.name,
                        invoiceId: invoice._id,
                        invoiceNumber: invoice.invoiceNumber,
                        totalAmount: invoice.totalAmount,
                    });
                } else {
                    // Create new invoice
                    const invoiceNumber = await generateInvoiceNumber();

                    // Set due date (e.g., 15 days from end of month)
                    const dueDate = new Date(endDate);
                    dueDate.setDate(dueDate.getDate() + 15);

                    invoice = await Invoice.create({
                        customer: customer._id,
                        invoiceNumber,
                        startDate,
                        endDate,
                        totalQuantity,
                        totalAmount,
                        dueAmount: totalAmount,
                        status: 'pending',
                        dueDate,
                        items,
                    });

                    results.created.push({
                        customer: customer._id,
                        name: customer.name,
                        invoiceId: invoice._id,
                        invoiceNumber: invoice.invoiceNumber,
                        totalAmount: invoice.totalAmount,
                    });
                }
            } catch (error) {
                results.failed.push({
                    customer: customer._id,
                    name: customer.name,
                    reason: error.message,
                });
            }
        }

        return res.status(200).json({
            totalProcessed: customers.length,
            created: results.created.length,
            updated: results.updated.length,
            failed: results.failed.length,
            createdInvoices: results.created,
            updatedInvoices: results.updated,
            failedInvoices: results.failed,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// @desc    Get all invoices with filters
// @route   GET /api/invoices
// @access  Private/Admin
// Updated getInvoices function for better month/year filtering
export const getInvoices = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            customerId,
            status,
            month,
            year,
        } = req.query;

        const query = {};

        // Apply filters
        if (customerId) {
            query.customer = customerId;
        }

        if (status) {
            query.status = status;
        }

        // Fixed month/year filtering
        if (month || year) {
            const currentDate = new Date();
            const filterYear = year ? parseInt(year) : currentDate.getFullYear();
            const filterMonth = month ? parseInt(month) : null;

            if (filterMonth) {
                // Specific month and year
                const startDate = new Date(filterYear, filterMonth - 1, 1);
                const endDate = new Date(filterYear, filterMonth, 0);

                // Match invoices that overlap with the selected month
                query.$and = [
                    { startDate: { $lte: endDate } },
                    { endDate: { $gte: startDate } }
                ];
            } else {
                // Only year specified, get all invoices for that year
                const yearStart = new Date(filterYear, 0, 1);
                const yearEnd = new Date(filterYear, 11, 31);

                query.$and = [
                    { startDate: { $lte: yearEnd } },
                    { endDate: { $gte: yearStart } }
                ];
            }
        }

        // Count total documents for pagination
        const count = await Invoice.countDocuments(query);

        // Get paginated invoices
        const invoices = await Invoice.find(query)
            .populate('customer', 'name phoneNo customerNo')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        return res.json({
            invoices,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            total: count,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// @desc    Get invoice by ID
// @route   GET /api/invoices/:id
// @access  Private/Admin
export const getInvoiceById = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('customer', 'name phoneNo address customerNo');

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        return res.json(invoice);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// @desc    Update invoice status
// @route   PUT /api/invoices/:id/status
// @access  Private/Admin
export const updateInvoiceStatus = async (req, res) => {
    try {
        const { status } = req.body;

        if (!['pending', 'partially_paid', 'paid', 'overdue'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const invoice = await Invoice.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        invoice.status = status;
        await invoice.save();

        return res.json({ success: true, invoice });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// @desc    Add payment to invoice
// @route   POST /api/invoices/:id/payment
// @access  Private/Admin
export const addPaymentToInvoice = async (req, res) => {
    try {
        const { amount, paymentMethod, transactionId, notes } = req.body;

        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Valid payment amount is required' });
        }

        const invoice = await Invoice.findById(req.params.id).populate('customer');

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        // Check if payment amount exceeds due amount
        if (amount > invoice.dueAmount) {
            return res.status(400).json({
                message: `Payment amount exceeds due amount. Maximum payment allowed: ${invoice.dueAmount}`
            });
        }

        // Generate transaction ID if not provided
        let finalTransactionId = transactionId;

        if (!finalTransactionId && paymentMethod !== 'cash') {
            const year = new Date().getFullYear();
            const customerNo = invoice.customer.customerNo;

            // Find all invoices for this customer to get the last transaction sequence
            const allInvoices = await Invoice.find({ customer: invoice.customer._id });

            let maxSequence = 0;

            // Check all payments across all invoices for this customer
            for (const inv of allInvoices) {
                if (inv.payments && inv.payments.length > 0) {
                    for (const payment of inv.payments) {
                        if (payment.transactionId && payment.transactionId.startsWith(`${year}_${customerNo}_`)) {
                            const parts = payment.transactionId.split('_');
                            if (parts.length >= 3) {
                                const sequence = parseInt(parts[2]);
                                if (!isNaN(sequence) && sequence > maxSequence) {
                                    maxSequence = sequence;
                                }
                            }
                        }
                    }
                }
            }

            // Generate new transaction ID
            const newSequence = maxSequence + 1;
            finalTransactionId = `${year}_${customerNo}_${newSequence}`;
        }

        // Add payment
        const payment = {
            amount: parseFloat(amount),
            paymentDate: new Date(),
            paymentMethod: paymentMethod || 'cash',
            transactionId: finalTransactionId,
            notes,
        };

        const updatedInvoice = await invoice.addPayment(payment);

        return res.status(200).json(updatedInvoice);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// @desc    Delete an invoice
// @route   DELETE /api/invoices/:id
// @access  Private/Admin
export const deleteInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        // Only allow deletion of pending invoices with no payments
        if (invoice.payments.length > 0) {
            return res.status(400).json({
                message: 'Cannot delete invoice that has payments or is not in pending status'
            });
        }

        await invoice.deleteOne();

        return res.json({ message: 'Invoice removed' });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// @desc    Get customer's invoice summary
// @route   GET /api/invoices/customer/:id/summary
// @access  Private/Admin
export const getCustomerInvoiceSummary = async (req, res) => {
    try {
        const customerId = req.params.id;

        // Verify customer exists
        const customer = await Customer.findById(customerId);
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Aggregate invoice data
        const summary = await Invoice.aggregate([
            { $match: { customer: new mongoose.Types.ObjectId(customerId) } },
            {
                $group: {
                    _id: null,
                    totalInvoices: { $sum: 1 },
                    totalAmount: { $sum: '$totalAmount' },
                    totalPaid: { $sum: '$amountPaid' },
                    totalDue: { $sum: '$dueAmount' },
                    pendingInvoices: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    overdueInvoices: {
                        $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] }
                    },
                }
            }
        ]);

        // Get recent invoices
        const recentInvoices = await Invoice.find({ customer: customerId })
            .sort({ createdAt: -1 })
            .limit(5);

        return res.json({
            summary: summary.length > 0 ? summary[0] : {
                totalInvoices: 0,
                totalAmount: 0,
                totalPaid: 0,
                totalDue: 0,
                pendingInvoices: 0,
                overdueInvoices: 0,
            },
            recentInvoices,
            customer: {
                _id: customer._id,
                name: customer.name,
                phoneNo: customer.phoneNo,
                customerNo: customer.customerNo,
            }
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// @desc    Get dashboard summary of invoices
// @route   GET /api/invoices/dashboard
// @access  Private/Admin
export const getInvoiceDashboard = async (req, res) => {
    try {
        // Overall summary
        const summary = await Invoice.aggregate([
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$totalAmount' },
                    totalPaid: { $sum: '$amountPaid' },
                    totalDue: { $sum: '$dueAmount' },
                    totalInvoices: { $sum: 1 },
                    pendingCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    paidCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
                    },
                    partiallyPaidCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'partially_paid'] }, 1, 0] }
                    },
                    overdueCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] }
                    },
                }
            }
        ]);

        // Monthly breakdown for the past 6 months
        const now = new Date();
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        const monthlyData = await Invoice.aggregate([
            {
                $match: {
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    totalAmount: { $sum: '$totalAmount' },
                    paidAmount: { $sum: '$amountPaid' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        // Format monthly data for frontend
        const formattedMonthlyData = monthlyData.map(item => ({
            month: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`,
            totalAmount: item.totalAmount,
            paidAmount: item.paidAmount,
            count: item.count
        }));

        // Recent invoices
        const recentInvoices = await Invoice.find()
            .populate('customer', 'name phoneNo customerNo')
            .sort({ createdAt: -1 })
            .limit(10);

        // Top customers by invoice amount
        const topCustomers = await Invoice.aggregate([
            {
                $group: {
                    _id: '$customer',
                    totalAmount: { $sum: '$totalAmount' },
                    paidAmount: { $sum: '$amountPaid' },
                    invoiceCount: { $sum: 1 }
                }
            },
            { $sort: { totalAmount: -1 } },
            { $limit: 5 },
            {
                $lookup: {
                    from: 'customers',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'customerDetails'
                }
            },
            {
                $project: {
                    _id: 1,
                    totalAmount: 1,
                    paidAmount: 1,
                    invoiceCount: 1,
                    customer: { $arrayElemAt: ['$customerDetails', 0] }
                }
            }
        ]);

        return res.json({
            summary: summary.length > 0 ? summary[0] : {
                totalAmount: 0,
                totalPaid: 0,
                totalDue: 0,
                totalInvoices: 0,
                pendingCount: 0,
                paidCount: 0,
                partiallyPaidCount: 0,
                overdueCount: 0,
            },
            monthlyData: formattedMonthlyData,
            recentInvoices,
            topCustomers
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

// Helper function to convert numbers to Gujarati
const toGujaratiNumber = (num) => {
    const gujaratiNumerals = ['૦', '૧', '૨', '૩', '૪', '૫', '૬', '૭', '૮', '૯'];
    return num.toString().split('').map(digit =>
        isNaN(parseInt(digit)) ? digit : gujaratiNumerals[parseInt(digit)]
    ).join('');
};

const getGujaratiMonth = (month) => {
    const months = [
        'જાન્યુઆરી', 'ફેબ્રુઆરી', 'માર્ચ', 'એપ્રિલ', 'મે', 'જૂન',
        'જુલાઈ', 'ઓગસ્ટ', 'સપ્ટેમ્બર', 'ઓક્ટોબર', 'નવેમ્બર', 'ડિસેમ્બર'
    ];
    return months[month - 1];
};

// @desc    Utility function to generate dairy form PDF that can be used in different contexts
// @param   invoiceData - Invoice data object
// @param   outputStream - Stream to pipe the PDF to (can be response or file)
// @param   options - Additional options for customization
export const generateDairyFormPDF = async (invoiceData, outputStream, options = {}) => {
    try {
        // Default options
        const defaultOptions = {
            logoPath: './assets/images/logo.png', // Path to logo image if available
            upiId: 'ramdevdairy@upi', // Default UPI ID
            contactInfo: {
                person1: {
                    name: 'ઉમેશભાઈ',
                    phone: 'મો. ૭૦૪૧૬૮૧૦૦૦'
                },
                person2: {
                    name: 'નિકુંજભાઈ',
                    phone: 'મો. ૯૬૦૩૮૩૫૯૫૯'
                }
            },
            headerText: {
                left: '॥ જય રામાપીર ॥',
                right: '॥ શ્રી ગણેશાય નમઃ ॥'
            },
            logoText: {
                main: 'રામદેવ',
                sub: 'ડેરી ફાર્મ'
            },
            footerNotes: [
                '* બિલ ૧૦ તારીખ પહેલા ફરજિયાત જમા કરાવવું.',
                '* વધારે-ઓછું દૂધ જોઈએ તો પહેલા થી જાણાવવું.'
            ]
        };

        // Merge options
        const mergedOptions = { ...defaultOptions, ...options };

        // Create a new PDF document
        const doc = new PDFDocument({
            size: 'A4',
            margin: 0,
            layout: 'portrait'
        });

        // Register fonts for Gujarati support
        registerFonts(doc);

        // Pipe the PDF to the output stream
        doc.pipe(outputStream);

        // Draw page border
        doc.rect(10, 10, doc.page.width - 20, doc.page.height - 20).lineWidth(1).stroke();

        // Header
        doc.font('Gujarati').fontSize(14);
        doc.fillColor('blue').text(mergedOptions.headerText.left, 30, 25, { align: 'left' });
        doc.fillColor('brown').text(mergedOptions.headerText.right, 430, 20);

        // Logo area (either image or text)
        if (mergedOptions.logoPath) {
            // Use logo image if provided
            doc.image(mergedOptions.logoPath, 30, 45, { width: 150 });
        } else {
            // Use text logo
            doc.fillColor('black').rect(30, 45, 150, 80).fillAndStroke('black', 'black');
            doc.fillColor('white').fontSize(32).text(mergedOptions.logoText.main, 60, 55);
            doc.fontSize(24).text(mergedOptions.logoText.sub, 55, 95);
        }

        // Contact Info
        doc.fillColor('black').font('Gujarati').fontSize(12);
        doc.text(mergedOptions.contactInfo.person1.name, 430, 45);
        doc.text(mergedOptions.contactInfo.person1.phone, 430, 65);
        doc.text(mergedOptions.contactInfo.person2.name, 430, 85);
        doc.text(mergedOptions.contactInfo.person2.phone, 430, 105);

        // Extract data from invoice
        const startDate = new Date(invoiceData.startDate);
        const monthText = getGujaratiMonth(startDate.getMonth() + 1);
        const yearText = startDate.getFullYear();
        const price = invoiceData.items.length > 0 ? invoiceData.items[0].price : 0;

        // Extract customer address
        const customerAddress = invoiceData.customer?.address || '';

        // Month/Rate/Place
        doc.font('Gujarati').fontSize(14);
        doc.text('માસ:', 30, 145);
        doc.text(`${monthText} ${yearText}`, 95, 145);
        doc.text('ભાવ:', 220, 145);
        doc.text(`${toGujaratiNumber(price)} રૂ.`, 275, 145);
        // doc.text('ઠે.:', 400, 145);
        // doc.text(customerAddress, 445, 145);

        // Underlines for Month/Rate/Place
        doc.moveTo(70, 165).lineTo(200, 165).stroke();
        doc.moveTo(255, 165).lineTo(380, 165).stroke();
        // doc.moveTo(420, 165).lineTo(550, 165).stroke();

        // Table dimensions
        const marginLeft = 30;
        const marginRight = 30;
        const tableWidth = doc.page.width - marginLeft - marginRight;
        const startY = 175;

        // Divide table into 9 columns (3 sets of date, morning, evening)
        const columnCount = 9;
        const columnWidth = tableWidth / columnCount;

        // Define table headers
        const headers = ['તા.', 'સવાર', 'સાંજ', 'તા.', 'સવાર', 'સાંજ', 'તા.', 'સવાર', 'સાંજ'];

        // Draw table headers
        let y = startY;
        let x = marginLeft;
        const headerHeight = 25;
        const rowHeight = 30;

        // Draw header cells
        for (let i = 0; i < headers.length; i++) {
            doc.rect(x, y, columnWidth, headerHeight).stroke();
            // Fill header background
            doc.fillColor('#f0f0f0');
            doc.rect(x + 1, y + 1, columnWidth - 2, headerHeight - 2).fill();
            doc.fillColor('black').font('Gujarati').fontSize(11);
            doc.text(headers[i], x + 2, y + 7, { width: columnWidth - 4, align: 'center' });
            x += columnWidth;
        }

        y += headerHeight;

        // Prepare the data from invoice items
        const morningValues = Array(31).fill('');
        const eveningValues = Array(31).fill('');

        // Fill the arrays with actual data from invoice items
        invoiceData.items.forEach(item => {
            const day = new Date(item.date).getDate();
            if (day > 0 && day <= 31) {
                morningValues[day - 1] = toGujaratiNumber(item.morningQuantity || 0);
                eveningValues[day - 1] = toGujaratiNumber(item.eveningQuantity || 0);
            }
        });

        // Draw data rows (10 rows with numbers 1-10, 11-20, 21-30)
        for (let row = 0; row < 10; row++) {
            x = marginLeft;

            // Convert to Gujarati numerals
            const num1 = toGujaratiNumber(row + 1);
            const num2 = toGujaratiNumber(row + 11);
            const num3 = toGujaratiNumber(row + 21);

            // First column set (1-10)
            doc.rect(x, y, columnWidth, rowHeight).stroke();
            doc.text(num1, x + 2, y + 10, { width: columnWidth - 4, align: 'center' });
            x += columnWidth;

            // Morning and Evening columns for first set
            doc.rect(x, y, columnWidth, rowHeight).stroke();
            doc.text(morningValues[row], x + 2, y + 10, { width: columnWidth - 4, align: 'center' });
            x += columnWidth;
            doc.rect(x, y, columnWidth, rowHeight).stroke();
            doc.text(eveningValues[row], x + 2, y + 10, { width: columnWidth - 4, align: 'center' });
            x += columnWidth;

            // Second column set (11-20)
            doc.rect(x, y, columnWidth, rowHeight).stroke();
            doc.text(num2, x + 2, y + 10, { width: columnWidth - 4, align: 'center' });
            x += columnWidth;

            // Morning and Evening columns for second set
            doc.rect(x, y, columnWidth, rowHeight).stroke();
            doc.text(morningValues[row + 10], x + 2, y + 10, { width: columnWidth - 4, align: 'center' });
            x += columnWidth;
            doc.rect(x, y, columnWidth, rowHeight).stroke();
            doc.text(eveningValues[row + 10], x + 2, y + 10, { width: columnWidth - 4, align: 'center' });
            x += columnWidth;

            // Third column set (21-30)
            doc.rect(x, y, columnWidth, rowHeight).stroke();
            doc.text(num3, x + 2, y + 10, { width: columnWidth - 4, align: 'center' });
            x += columnWidth;

            // Morning and Evening columns for third set
            doc.rect(x, y, columnWidth, rowHeight).stroke();
            doc.text(morningValues[row + 20], x + 2, y + 10, { width: columnWidth - 4, align: 'center' });
            x += columnWidth;
            doc.rect(x, y, columnWidth, rowHeight).stroke();
            doc.text(eveningValues[row + 20], x + 2, y + 10, { width: columnWidth - 4, align: 'center' });

            y += rowHeight;
        }

        // Add row for day 31
        x = marginLeft;

        // First column set - blank for day 31 row
        doc.rect(x, y, columnWidth, rowHeight).stroke();
        x += columnWidth;
        doc.rect(x, y, columnWidth, rowHeight).stroke();
        x += columnWidth;
        doc.rect(x, y, columnWidth, rowHeight).stroke();
        x += columnWidth;

        // Second column set - blank for day 31 row
        doc.rect(x, y, columnWidth, rowHeight).stroke();
        x += columnWidth;
        doc.rect(x, y, columnWidth, rowHeight).stroke();
        x += columnWidth;
        doc.rect(x, y, columnWidth, rowHeight).stroke();
        x += columnWidth;

        // Third column set - with day 31
        doc.rect(x, y, columnWidth, rowHeight).stroke();
        doc.text(toGujaratiNumber(31), x + 2, y + 10, { width: columnWidth - 4, align: 'center' });
        x += columnWidth;
        doc.rect(x, y, columnWidth, rowHeight).stroke();
        doc.text(morningValues[30], x + 2, y + 10, { width: columnWidth - 4, align: 'center' });
        x += columnWidth;
        doc.rect(x, y, columnWidth, rowHeight).stroke();
        doc.text(eveningValues[30], x + 2, y + 10, { width: columnWidth - 4, align: 'center' });

        y += rowHeight;

        // Add the total row
        x = marginLeft;
        for (let i = 0; i < 9; i++) {
            doc.rect(x, y, columnWidth, rowHeight).stroke();
            if (i === 1 || i === 4 || i === 7) {
                doc.text('કુલ', x + 2, y + 10, { width: columnWidth - 4, align: 'center' });
            }
            x += columnWidth;
        }

        // Account summary section - 20px below the table
        const summaryY = y + 50;

        // Left side - Summary box
        doc.rect(marginLeft, summaryY, 340, 160).stroke();

        // Summary fields with lines and dynamic data
        doc.font('Gujarati').fontSize(12);

        // Account month
        doc.text('હિસાબ માસ :', 50, summaryY + 20);
        doc.text(`${monthText} ${yearText}`, 145, summaryY + 20);
        doc.moveTo(140, summaryY + 37).lineTo(350, summaryY + 37).stroke();

        // Total liters
        doc.text('કુલ લિટર :', 50, summaryY + 48);
        doc.text(toGujaratiNumber(invoiceData.totalQuantity || 0), 145, summaryY + 48);
        doc.moveTo(140, summaryY + 65).lineTo(350, summaryY + 65).stroke();

        // Total bill
        doc.text('કુલ બિલ :', 50, summaryY + 76);
        doc.text(toGujaratiNumber(invoiceData.totalAmount || 0), 145, summaryY + 76);
        doc.moveTo(140, summaryY + 93).lineTo(350, summaryY + 93).stroke();

        // Deposit/Due
        doc.text('જમા/બાકી :', 50, summaryY + 104);
        doc.text(toGujaratiNumber(invoiceData.amountPaid || 0), 145, summaryY + 104);
        doc.moveTo(140, summaryY + 121).lineTo(350, summaryY + 121).stroke();

        // Total due
        doc.text('કુલ બાકી :', 50, summaryY + 132);
        doc.text(toGujaratiNumber(invoiceData.dueAmount || 0), 145, summaryY + 132);
        doc.moveTo(140, summaryY + 149).lineTo(350, summaryY + 149).stroke();

        // Right side - QR code box
        doc.rect(marginLeft + 350, summaryY, 150, 180).stroke();

        // QR code data
        const qrData = JSON.stringify({
            invoice: invoiceData.invoiceNumber,
            customer: invoiceData.customer?.name || '',
            amount: invoiceData.totalAmount,
            upi: mergedOptions.upiId
        });

        // Generate QR code
        const qrCodeDataURL = await QRCode.toDataURL(qrData, { width: 120 });
        const qrCodeBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');

        // Place QR code
        doc.image(qrCodeBuffer, marginLeft + 365, summaryY + 20, { width: 120 });
        doc.font('Gujarati').fontSize(10);
        doc.text('QR For Payment', marginLeft + 380, summaryY + 150);

        // Notes at the bottom
        doc.fontSize(11).fillColor('orange');
        mergedOptions.footerNotes.forEach((note, index) => {
            doc.text(note, 50, summaryY + 180 + (index * 20));
        });

        // Finalize the PDF
        doc.end();

        return true;
    } catch (error) {
        console.error('PDF generation error:', error);
        throw error;
    }
};


// @desc    Generate modern PDF for invoice
// @route   GET /api/invoices/:id/modern-pdf
// @access  Private/Admin
export const generateModernInvoicePDF = async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch invoice with customer details
        const invoice = await Invoice.findById(id).populate('customer');

        if (!invoice) {
            return res.status(404).json({ message: 'Invoice not found' });
        }

        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNumber}-modern.pdf`);

        // Generate the PDF using the utility function
        await generateDairyFormPDF(invoice, res, {
            upiId: 'ramdevdairy@upi',
        });

    } catch (error) {
        console.error('Modern PDF generation error:', error);
        return res.status(500).json({ message: error.message });
    }
};

export const getCustomerInvoices = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const query = { customer: id };

        // Count total documents for pagination
        const count = await Invoice.countDocuments(query);

        // Get paginated invoices
        const invoices = await Invoice.find(query)
            .populate('customer', 'name phoneNo customerNo')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((parseInt(page) - 1) * parseInt(limit));

        return res.json({
            invoices,
            totalPages: Math.ceil(count / limit),
            currentPage: parseInt(page),
            total: count,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};