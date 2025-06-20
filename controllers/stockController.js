import StockEntry from '../models/StockTransaction.js';

// @desc    Create new stock entry (in or out)
// @route   POST /api/stock
// @access  Public
export const addStockEntry = async (req, res) => {
  try {
    const { entryType, quantity, entryDate, notes } = req.body;

    if (!entryType || !quantity) {
      res.status(400);
      throw new Error('Please provide entry type and quantity');
    }

    const entry = await StockEntry.create({
      entryType,
      quantity,
      entryDate: entryDate || new Date(),
      notes
    });

    res.status(201).json(entry);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all stock entries with optional date filtering
// @route   GET /api/stock
// @access  Public
export const getStockEntries = async (req, res) => {
  try {
    const { startDate, endDate, entryType } = req.query;
    
    let query = {};
    
    // Add date range filter if provided
    if (startDate || endDate) {
      query.entryDate = {};
      if (startDate) {
        query.entryDate.$gte = new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of day
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        query.entryDate.$lte = endDateTime;
      }
    }
    
    // Add entry type filter if provided
    if (entryType && ['in', 'out'].includes(entryType)) {
      query.entryType = entryType;
    }

    const entries = await StockEntry.find(query).sort({ entryDate: -1 });
    res.json(entries);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get stock entry by ID
// @route   GET /api/stock/:id
// @access  Public
export const getStockEntryById = async (req, res) => {
  try {
    const entry = await StockEntry.findById(req.params.id);
    
    if (entry) {
      res.json(entry);
    } else {
      res.status(404).json({ message: 'Stock entry not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update stock entry
// @route   PUT /api/stock/:id
// @access  Public
export const updateStockEntry = async (req, res) => {
  try {
    const { entryType, quantity, entryDate, notes } = req.body;
    
    const entry = await StockEntry.findById(req.params.id);
    
    if (entry) {
      entry.entryType = entryType || entry.entryType;
      entry.quantity = quantity || entry.quantity;
      entry.entryDate = entryDate || entry.entryDate;
      entry.notes = notes || entry.notes;
      
      const updatedEntry = await entry.save();
      res.json(updatedEntry);
    } else {
      res.status(404).json({ message: 'Stock entry not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete stock entry
// @route   DELETE /api/stock/:id
// @access  Public
export const deleteStockEntry = async (req, res) => {
  try {
    const entry = await StockEntry.findById(req.params.id);
    
    if (entry) {
      await entry.deleteOne();
      res.json({ message: 'Stock entry removed' });
    } else {
      res.status(404).json({ message: 'Stock entry not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get stock summary data
// @route   GET /api/stock/summary
// @access  Public
export const getStockSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateQuery = {};
    
    // Add date range filter if provided
    if (startDate || endDate) {
      dateQuery = {};
      if (startDate) {
        dateQuery.$gte = new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of day
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        dateQuery.$lte = endDateTime;
      }
    }
    
    // Get total stock in
    const stockInData = await StockEntry.aggregate([
      { $match: { entryType: 'in', ...(Object.keys(dateQuery).length > 0 ? { entryDate: dateQuery } : {}) } },
      { $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$entryDate' }},
          },
          totalIn: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.day': 1 } }
    ]);
    
    // Get total stock out
    const stockOutData = await StockEntry.aggregate([
      { $match: { entryType: 'out', ...(Object.keys(dateQuery).length > 0 ? { entryDate: dateQuery } : {}) } },
      { $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$entryDate' }},
          },
          totalOut: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.day': 1 } }
    ]);
    
    // Get overall totals
    const totals = await StockEntry.aggregate([
      { $match: Object.keys(dateQuery).length > 0 ? { entryDate: dateQuery } : {} },
      { $group: {
          _id: '$entryType',
          total: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Calculate current stock level
    const inTotal = totals.find(t => t._id === 'in')?.total || 0;
    const outTotal = totals.find(t => t._id === 'out')?.total || 0;
    const currentStock = inTotal - outTotal;
    
    res.json({
      dailyData: {
        stockIn: stockInData,
        stockOut: stockOutData
      },
      totals: {
        stockIn: inTotal,
        stockOut: outTotal,
        currentStock: currentStock
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};