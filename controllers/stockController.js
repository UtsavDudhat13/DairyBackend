import mongoose from 'mongoose';
import StockEntry from '../models/StockTransaction.js';
import Category from '../models/Category.js';

// @desc    Create new stock entry (in or out)
// @route   POST /api/stock
// @access  Public
export const addStockEntry = async (req, res) => {
  try {
    const { category, entryType, quantity, entryDate, notes } = req.body;

    if (!category || !entryType || !quantity) {
      res.status(400);
      throw new Error('Please provide category, entry type and quantity');
    }

    // Verify that the category exists
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      res.status(400);
      throw new Error('Invalid category ID');
    }

    const entry = await StockEntry.create({
      category,
      entryType,
      quantity,
      entryDate: entryDate || new Date(),
      notes
    });

    // Populate category data for response
    await entry.populate('category', 'name');

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
    const { startDate, endDate, entryType, category } = req.query;

    let query = {};

    // Add category filter if provided
    if (category) {
      query.category = category;
    }

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

    const entries = await StockEntry.find(query)
      .populate('category', 'name')
      .sort({ entryDate: -1 });
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
    const entry = await StockEntry.findById(req.params.id)
      .populate('category', 'name');

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
    const { category, entryType, quantity, entryDate, notes } = req.body;

    const entry = await StockEntry.findById(req.params.id);

    if (entry) {
      // Verify category exists if it's being updated
      if (category && category !== entry.category.toString()) {
        const categoryExists = await Category.findById(category);
        if (!categoryExists) {
          res.status(400);
          throw new Error('Invalid category ID');
        }
      }

      entry.category = category || entry.category;
      entry.entryType = entryType || entry.entryType;
      entry.quantity = quantity || entry.quantity;
      entry.entryDate = entryDate || entry.entryDate;
      entry.notes = notes || entry.notes;

      const updatedEntry = await entry.save();
      await updatedEntry.populate('category', 'name');
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
    const { startDate, endDate, category } = req.query;

    let dateQuery = {};
    let matchQuery = {};

    // Add category filter if provided
    if (category) {
      matchQuery.category = new mongoose.Types.ObjectId(category);
    }

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
      matchQuery.entryDate = dateQuery;
    }

    // Get total stock in by category
    const stockInData = await StockEntry.aggregate([
      { $match: { entryType: 'in', ...matchQuery } },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $group: {
          _id: {
            category: '$category',
            categoryName: '$categoryInfo.name',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$entryDate' } },
          },
          totalIn: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.day': 1, '_id.categoryName': 1 } }
    ]);

    // Get total stock out by category
    const stockOutData = await StockEntry.aggregate([
      { $match: { entryType: 'out', ...matchQuery } },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $group: {
          _id: {
            category: '$category',
            categoryName: '$categoryInfo.name',
            day: { $dateToString: { format: '%Y-%m-%d', date: '$entryDate' } },
          },
          totalOut: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.day': 1, '_id.categoryName': 1 } }
    ]);

    // Get overall totals by category
    const totals = await StockEntry.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $group: {
          _id: {
            entryType: '$entryType',
            category: '$category',
            categoryName: '$categoryInfo.name'
          },
          total: { $sum: '$quantity' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Calculate current stock level by category
    const stockSummary = {};
    totals.forEach(item => {
      const categoryId = item._id.category.toString();
      const categoryName = item._id.categoryName;

      if (!stockSummary[categoryId]) {
        stockSummary[categoryId] = {
          categoryId,
          categoryName,
          stockIn: 0,
          stockOut: 0,
          currentStock: 0
        };
      }

      if (item._id.entryType === 'in') {
        stockSummary[categoryId].stockIn = item.total;
      } else {
        stockSummary[categoryId].stockOut = item.total;
      }

      stockSummary[categoryId].currentStock = stockSummary[categoryId].stockIn - stockSummary[categoryId].stockOut;
    });

    res.json({
      dailyData: {
        stockIn: stockInData,
        stockOut: stockOutData
      },
      categoryTotals: Object.values(stockSummary),
      totals: {
        stockIn: totals.filter(t => t._id.entryType === 'in').reduce((sum, t) => sum + t.total, 0),
        stockOut: totals.filter(t => t._id.entryType === 'out').reduce((sum, t) => sum + t.total, 0),
        currentStock: Object.values(stockSummary).reduce((sum, cat) => sum + cat.currentStock, 0)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get stock levels by category
// @route   GET /api/stock/categories
// @access  Public
export const getStockByCategory = async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;

    let matchQuery = {};

    // Add category filter if provided
    if (category) {
      matchQuery.category = new mongoose.Types.ObjectId(category);
    }

    // Add date range filter if provided
    if (startDate || endDate) {
      matchQuery.entryDate = {};
      if (startDate) {
        matchQuery.entryDate.$gte = new Date(startDate);
      }
      if (endDate) {
        // Set end date to end of day
        const endDateTime = new Date(endDate);
        endDateTime.setHours(23, 59, 59, 999);
        matchQuery.entryDate.$lte = endDateTime;
      }
    }

    const stockByCategory = await StockEntry.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: '$categoryInfo' },
      {
        $group: {
          _id: {
            category: '$category',
            categoryName: '$categoryInfo.name',
            entryType: '$entryType'
          },
          total: { $sum: '$quantity' }
        }
      },
      {
        $group: {
          _id: {
            category: '$_id.category',
            categoryName: '$_id.categoryName'
          },
          stockIn: {
            $sum: {
              $cond: [{ $eq: ['$_id.entryType', 'in'] }, '$total', 0]
            }
          },
          stockOut: {
            $sum: {
              $cond: [{ $eq: ['$_id.entryType', 'out'] }, '$total', 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          categoryId: '$_id.category',
          categoryName: '$_id.categoryName',
          stockIn: 1,
          stockOut: 1,
          currentStock: { $subtract: ['$stockIn', '$stockOut'] }
        }
      },
      { $sort: { categoryName: 1 } }
    ]);

    res.json(stockByCategory);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};