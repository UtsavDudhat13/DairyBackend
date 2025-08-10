import mongoose from 'mongoose';

const quantityUpdateSchema = mongoose.Schema(
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
    time: {
      type: String,
      enum: ['morning', 'evening'],
      required: true,
    },
    oldQuantity: {
      type: Number,
      required: true,
    },
    newQuantity: {
      type: Number,
      required: true,
    },
    difference: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
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
    isAccept: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },
    lastQuantity: {
      type: Number,
      default: 0, // Default value for lastQuantity
    },
  },
  {
    timestamps: true,
  }
);

// Create compound index for date and customer
quantityUpdateSchema.index({ date: 1, customer: 1 });

const QuantityUpdate = mongoose.model('QuantityUpdate', quantityUpdateSchema);

export default QuantityUpdate;