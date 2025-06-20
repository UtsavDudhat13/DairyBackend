import mongoose from 'mongoose';

const recordSchema = mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    morningQuantity: {
      type: Number,
      required: true,
      default: 0,
    },
    eveningQuantity: {
      type: Number,
      required: true,
      default: 0,
    },
    totalQuantity: {
      type: Number,
      required: true,
      default: 0,
    },
    price: {
      type: Number,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    }
  },
  {
    timestamps: true,
  }
);

// Create compound index for date and customer
recordSchema.index({ date: 1, customer: 1 }, { unique: true });

const Record = mongoose.model('Record', recordSchema);

export default Record; 