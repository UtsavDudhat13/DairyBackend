import Record from '../models/Record.js';
import Customer from '../models/Customer.js';
import QuantityUpdate from '../models/QuantityUpdate.js';
import moment from 'moment';
import Holiday from '../models/Holiday.js';

// @desc    Get all records with filters, pagination and search
// @route   GET /api/records
// @access  Private/Admin
const getRecords = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      customerId,
      searchTerm,
      page = 1,
      limit = 10
    } = req.query;

    // Build query
    const query = {};

    // Date filters with proper time handling
    if (startDate && endDate) {
      // Parse as local (IST), then convert to UTC
      const start = new Date(new Date(startDate).setHours(0, 0, 0, 0) - 5.5 * 60 * 60 * 1000);
      const end = new Date(new Date(endDate).setHours(23, 59, 59, 999) - 5.5 * 60 * 60 * 1000);
      query.date = {
        $gte: start,
        $lte: end
      };
    } else if (startDate) {
      // Only start date provided - from start date onwards
      const start = new Date(startDate + 'T00:00:00.000Z');
      query.date = { $gte: start };
    } else if (endDate) {
      // Only end date provided - up to end date
      const end = new Date(endDate + 'T23:59:59.999Z');
      query.date = { $lte: end };
    }

    // Customer ID filter
    if (customerId) {
      query.customer = customerId;
    }

    // If search term is provided, we need to find customer IDs that match
    if (searchTerm) {
      const customers = await Customer.find({
        name: { $regex: searchTerm, $options: 'i' }
      }).select('_id');

      const customerIds = customers.map(customer => customer._id);

      if (customerIds.length > 0) {
        // If both customerId and searchTerm are provided, find intersection
        if (customerId) {
          // Check if the specific customerId matches the search results
          const matchingCustomer = customerIds.find(id => id.toString() === customerId);
          if (matchingCustomer) {
            query.customer = customerId; // Keep the original customerId filter
          } else {
            // Customer doesn't match search term, return empty results
            return res.json({
              success: true,
              count: 0,
              data: [],
              pagination: {
                totalPages: 0,
                currentPage: parseInt(page),
                totalRecords: 0
              }
            });
          }
        } else {
          query.customer = { $in: customerIds };
        }
      } else {
        // No customers match the search term, return empty results
        return res.json({
          success: true,
          count: 0,
          data: [],
          pagination: {
            totalPages: 0,
            currentPage: parseInt(page),
            totalRecords: 0
          }
        });
      }
    }

    // Count total records for pagination
    const totalRecords = await Record.countDocuments(query);

    // Calculate pagination values
    const totalPages = Math.ceil(totalRecords / limit);
    const skip = (page - 1) * limit;

    // Get records with pagination
    const records = await Record.find(query)
      .populate('customer', 'name customerNo phoneNo')
      .populate({
        path: 'deliverySchedule.milkItems.milkType',
        select: 'name'
      })
      .populate({
        path: 'deliverySchedule.milkItems.subcategory',
        select: 'name'
      })
      .sort({ date: -1, 'customer.name': 1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: records.length,
      data: records,
      pagination: {
        totalPages,
        currentPage: parseInt(page),
        totalRecords
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

const checkIfHoliday = async (date) => {
  try {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);

    const currentYear = checkDate.getFullYear();
    const currentMonth = checkDate.getMonth();
    const currentDay = checkDate.getDate();

    // Check for non-recurring holidays (exact date match)
    const nonRecurringHoliday = await Holiday.findOne({
      date: {
        $gte: checkDate,
        $lt: new Date(checkDate.getTime() + 24 * 60 * 60 * 1000) // Next day
      },
      isRecurringYearly: false
    });

    if (nonRecurringHoliday) {
      return {
        isHoliday: true,
        holidayName: nonRecurringHoliday.name,
        holidayDetails: nonRecurringHoliday
      };
    }

    // Check for recurring holidays (same month and day, any year)
    const recurringHolidays = await Holiday.find({
      isRecurringYearly: true
    });

    for (const holiday of recurringHolidays) {
      const holidayDate = new Date(holiday.date);
      if (holidayDate.getMonth() === currentMonth &&
        holidayDate.getDate() === currentDay) {
        return {
          isHoliday: true,
          holidayName: holiday.name,
          holidayDetails: {
            ...holiday.toObject(),
            date: checkDate // Show current year's date
          }
        };
      }
    }

    return {
      isHoliday: false,
      holidayName: null,
      holidayDetails: null
    };
  } catch (error) {
    console.error('Error checking holiday:', error);
    // In case of error, assume it's not a holiday to avoid blocking record creation
    return {
      isHoliday: false,
      holidayName: null,
      holidayDetails: null
    };
  }
};
// @desc    Create daily records for all customers
// @route   POST /api/records/daily
// @access  Private/Admin
const createDailyRecords = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if today is a holiday
    const isHoliday = await checkIfHoliday(today);

    if (isHoliday.isHoliday) {
      return res.status(200).json({
        success: false,
        message: `Records not created because today is a holiday: ${isHoliday.holidayName}`,
        holiday: isHoliday.holidayDetails
      });
    }
    // Get all active customers
    const customers = await Customer.find({ isActive: true });
    const records = [];
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    for (const customer of customers) {
      // Check if record already exists for today
      const existingRecord = await Record.findOne({
        customer: customer._id,
        date: today
      });

      if (!existingRecord) {
        // Get any quantity updates for today
        const updates = await QuantityUpdate.find({
          customer: customer._id,
          date: { $gte: startOfDay, $lte: endOfDay }
        });

        // Prepare new deliverySchedule for the record
        const recordDeliverySchedule = [];
        let totalDailyQuantity = 0;
        let totalDailyPrice = 0;

        for (const delivery of customer.deliverySchedule) {
          const recordMilkItems = [];
          let deliveryTotalQuantity = 0;
          let deliveryTotalPrice = 0;

          for (const milkItem of delivery.milkItems) {
            // Check for quantity update for this milk item and time
            const update = updates.find(u =>
              u.time === delivery.time &&
              u.milkType.toString() === milkItem.milkType.toString() &&
              u.subcategory.toString() === milkItem.subcategory.toString()
            );
            const quantity = update ? update.newQuantity : milkItem.quantity;
            const pricePerUnit = milkItem.pricePerUnit;
            const totalPrice = quantity * pricePerUnit;

            recordMilkItems.push({
              milkType: milkItem.milkType,
              subcategory: milkItem.subcategory,
              quantity,
              pricePerUnit,
              totalPrice
            });
            deliveryTotalQuantity += quantity;
            deliveryTotalPrice += totalPrice;
          }

          recordDeliverySchedule.push({
            time: delivery.time,
            milkItems: recordMilkItems,
            totalQuantity: deliveryTotalQuantity,
            totalPrice: deliveryTotalPrice
          });
          totalDailyQuantity += deliveryTotalQuantity;
          totalDailyPrice += deliveryTotalPrice;
        }

        // Create the record
        const record = await Record.create({
          customer: customer._id,
          date: today,
          deliverySchedule: recordDeliverySchedule,
          totalDailyQuantity,
          totalDailyPrice
        });

        records.push(record);
      }
    }

    res.status(201).json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get records summary for a customer or all customers
// @route   GET /api/records/summary
// @access  Private/Admin
const getRecordsSummary = async (req, res) => {
  try {
    const { startDate, endDate, customerId } = req.query;

    // Validate dates
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    const query = {
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    if (customerId) {
      query.customer = customerId;
    }

    // Aggregate daily totals
    const dailyTotals = await Record.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }
          },
          totalQuantity: { $sum: '$totalQuantity' },
          totalAmount: { $sum: '$totalAmount' },
          morningQuantity: { $sum: '$morningQuantity' },
          eveningQuantity: { $sum: '$eveningQuantity' }
        }
      },
      {
        $project: {
          _id: 0,
          date: '$_id.date',
          totalQuantity: 1,
          totalAmount: 1,
          morningQuantity: 1,
          eveningQuantity: 1
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Aggregate customer totals if no specific customer was requested
    let customerTotals = [];
    if (!customerId) {
      customerTotals = await Record.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$customer',
            totalQuantity: { $sum: '$totalQuantity' },
            totalAmount: { $sum: '$totalAmount' },
            recordCount: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'customers',
            localField: '_id',
            foreignField: '_id',
            as: 'customerInfo'
          }
        },
        {
          $unwind: '$customerInfo'
        },
        {
          $project: {
            _id: 0,
            customerId: '$_id',
            customerName: '$customerInfo.name',
            customerNo: '$customerInfo.customerNo',
            totalQuantity: 1,
            totalAmount: 1,
            recordCount: 1
          }
        },
        { $sort: { totalQuantity: -1 } }
      ]);
    }

    // Calculate overall totals
    const overallTotals = {
      totalRecords: await Record.countDocuments(query),
      totalQuantity: dailyTotals.reduce((acc, day) => acc + day.totalQuantity, 0),
      totalAmount: dailyTotals.reduce((acc, day) => acc + day.totalAmount, 0),
      morningQuantity: dailyTotals.reduce((acc, day) => acc + day.morningQuantity, 0),
      eveningQuantity: dailyTotals.reduce((acc, day) => acc + day.eveningQuantity, 0)
    };

    res.json({
      success: true,
      dailyTotals,
      customerTotals,
      overallTotals
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get a record by ID
// @route   GET /api/records/:id
// @access  Private/Admin
const getRecordById = async (req, res) => {
  try {
    const record = await Record.findById(req.params.id)
      .populate('customer', 'name customerNo phoneNo')
      .populate({
        path: 'deliverySchedule.milkItems.milkType',
        select: 'name'
      })
      .populate({
        path: 'deliverySchedule.milkItems.subcategory',
        select: 'name'
      });

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Record not found'
      });
    }

    res.json({
      success: true,
      data: record
    });
  } catch (error) {
    // Check if error is due to invalid ObjectId
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        error: 'Record not found'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Update a record
// @route   PUT /api/records/:id
// @access  Private/Admin
const updateRecord = async (req, res) => {
  try {
    const record = await Record.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    // Update deliverySchedule and totals if provided
    if (req.body.deliverySchedule) {
      record.deliverySchedule = req.body.deliverySchedule;
    }
    if (req.body.totalDailyQuantity !== undefined) {
      record.totalDailyQuantity = req.body.totalDailyQuantity;
    }
    if (req.body.totalDailyPrice !== undefined) {
      record.totalDailyPrice = req.body.totalDailyPrice;
    }

    await record.save();

    // Repopulate for response
    const updatedRecord = await Record.findById(record._id)
      .populate('customer', 'name customerNo phoneNo')
      .populate({ path: 'deliverySchedule.milkItems.milkType', select: 'name' })
      .populate({ path: 'deliverySchedule.milkItems.subcategory', select: 'name' });

    res.json({ success: true, data: updatedRecord });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Delete a record
// @route   DELETE /api/records/:id
// @access  Private/Admin
const deleteRecord = async (req, res) => {
  try {
    const record = await Record.findById(req.params.id);

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Record not found'
      });
    }

    await record.deleteOne();

    res.json({
      success: true,
      data: { id: req.params.id },
      message: 'Record deleted successfully'
    });
  } catch (error) {
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        error: 'Record not found'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get records by customer ID
// @route   GET /api/records/customer/:id
// @access  Private
const getRecordsByCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, page = 1, limit = 10 } = req.query;

    // Validate required date parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    // Validate date format and range
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Please use YYYY-MM-DD format'
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        error: 'Start date cannot be after end date'
      });
    }

    // Build query
    const query = {
      customer: id,
      date: {
        $gte: start,
        $lte: end
      }
    };

    // Count total records for pagination
    const totalRecords = await Record.countDocuments(query);

    // Calculate pagination values
    const totalPages = Math.ceil(totalRecords / limit);
    const skip = (page - 1) * limit;

    // Get records with pagination
    const records = await Record.find(query)
      .populate('customer', 'name customerNo phoneNo')
      .populate({
        path: 'deliverySchedule.milkItems.milkType',
        select: 'name'
      })
      .populate({
        path: 'deliverySchedule.milkItems.subcategory',
        select: 'name'
      })
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      count: records.length,
      data: records,
      pagination: {
        totalPages,
        currentPage: parseInt(page),
        totalRecords
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export {
  getRecords,
  createDailyRecords,
  getRecordsSummary,
  getRecordById,
  updateRecord,
  deleteRecord,
  getRecordsByCustomer
};