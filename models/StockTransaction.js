import mongoose from 'mongoose';

const stockEntrySchema = new mongoose.Schema({
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

const StockEntry = mongoose.model('StockEntry', stockEntrySchema);

export default StockEntry;