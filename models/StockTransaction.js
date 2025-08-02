import mongoose from 'mongoose';

const stockEntrySchema = new mongoose.Schema({
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
  },
  entryType: {
    type: String,
    required: true,
    enum: ['in', 'out'],
  },
  quantity: {
    type: Number,
    required: true,
  },
  entryDate: {
    type: Date,
    required: true,
    default: Date.now,
  },
  notes: {
    type: String,
  },
}, {
  timestamps: true,
});

// Create indexes for faster queries
stockEntrySchema.index({ entryDate: 1 });
stockEntrySchema.index({ entryType: 1 });
stockEntrySchema.index({ category: 1 });
stockEntrySchema.index({ category: 1, entryDate: 1 });

const StockEntry = mongoose.model('StockEntry', stockEntrySchema);

export default StockEntry;