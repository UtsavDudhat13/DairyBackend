import mongoose from 'mongoose';

// Schema for individual milk item in a record
const milkItemSchema = mongoose.Schema({
  milkType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  pricePerUnit: {
    type: Number,
    required: true,
    min: 0
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  }
});

// Schema for delivery time (morning/evening) in a record
const deliveryTimeSchema = mongoose.Schema({
  time: {
    type: String,
    enum: ['morning', 'evening'],
    required: true
  },
  milkItems: [milkItemSchema],
  totalQuantity: {
    type: Number,
    default: 0
  },
  totalPrice: {
    type: Number,
    default: 0
  }
});

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
    deliverySchedule: [deliveryTimeSchema],
    totalDailyQuantity: {
      type: Number,
      default: 0,
    },
    totalDailyPrice: {
      type: Number,
      default: 0,
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