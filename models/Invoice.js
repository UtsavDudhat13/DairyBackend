// models/Invoice.js
import mongoose from 'mongoose';

const invoiceSchema = mongoose.Schema(
    {
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customer',
            required: true,
            index: true,
        },
        invoiceNumber: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        totalQuantity: {
            type: Number,
            required: true,
            default: 0,
        },
        totalAmount: {
            type: Number,
            required: true,
            default: 0,
        },
        amountPaid: {
            type: Number,
            default: 0,
        },
        dueAmount: {
            type: Number,
            required: true,
            default: 0,
        },
        status: {
            type: String,
            enum: ['pending', 'partially_paid', 'paid', 'overdue'],
            default: 'pending',
            index: true,
        },
        dueDate: {
            type: Date,
            required: true,
        },
        items: [
            {
                date: {
                    type: Date,
                    required: true,
                },
                morningQuantity: {
                    type: Number,
                    default: 0,
                },
                eveningQuantity: {
                    type: Number,
                    default: 0,
                },
                dailyQuantity: {
                    type: Number,
                    required: true,
                },
                price: {
                    type: Number,
                    required: true,
                },
                dailyAmount: {
                    type: Number,
                    required: true,
                },
            },
        ],
        // Track payment history
        payments: [
            {
                amount: {
                    type: Number,
                    required: true,
                },
                paymentDate: {
                    type: Date,
                    default: Date.now,
                },
                paymentMethod: {
                    type: String,
                    enum: ['cash', 'online'],
                    default: 'cash',
                },
                transactionId: {
                    type: String,
                },
                notes: {
                    type: String,
                },
            },
        ],
        notes: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

// Create compound indexes for faster queries
invoiceSchema.index({ customer: 1, startDate: 1, endDate: 1 });
invoiceSchema.index({ status: 1, dueDate: 1 });

// Pre-save hook to calculate due amount
invoiceSchema.pre('save', function (next) {
    // Calculate due amount as total amount minus amount paid
    this.dueAmount = this.totalAmount - this.amountPaid;

    // Update status based on payment
    if (this.dueAmount <= 0) {
        this.status = 'paid';
    } else if (this.amountPaid > 0) {
        this.status = 'partially_paid';
    } else if (this.dueDate < new Date()) {
        this.status = 'overdue';
    } else {
        this.status = 'pending';
    }

    next();
});

// Method to add a payment
invoiceSchema.methods.addPayment = async function (paymentDetails) {
    this.payments.push(paymentDetails);
    this.amountPaid += paymentDetails.amount;
    await this.save();
    return this;
};

const Invoice = mongoose.model('Invoice', invoiceSchema);

export default Invoice;