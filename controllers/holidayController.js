// backend/controllers/holidayController.js
import Holiday from '../models/Holiday.js';

// @desc    Create new holiday
// @route   POST /api/holidays
// @access  Admin
export const createHoliday = async (req, res) => {
  try {
    const { date, name, reason, isRecurringYearly } = req.body;

    if (!date || !name || !reason) {
      res.status(400);
      throw new Error('Please provide date, name and reason');
    }

    const holiday = await Holiday.create({
      date,
      name,
      reason,
      isRecurringYearly: isRecurringYearly || false
    });

    res.status(201).json(holiday);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Get all holidays with optional filtering
// @route   GET /api/holidays
// @access  Public
export const getHolidays = async (req, res) => {
  try {
    const { year, isRecurringYearly } = req.query;
    
    let query = {};
    
    // Add year filter if provided
    if (year) {
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31`);
      endDate.setHours(23, 59, 59, 999);
      
      query.date = {
        $gte: startDate,
        $lte: endDate
      };
    }
    
    // Add recurring filter if provided
    if (isRecurringYearly !== undefined) {
      query.isRecurringYearly = isRecurringYearly === 'true';
    }

    const holidays = await Holiday.find(query).sort({ date: 1 });
    res.json(holidays);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get holiday by ID
// @route   GET /api/holidays/:id
// @access  Public
export const getHolidayById = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    
    if (holiday) {
      res.json(holiday);
    } else {
      res.status(404).json({ message: 'Holiday not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update holiday
// @route   PUT /api/holidays/:id
// @access  Admin
export const updateHoliday = async (req, res) => {
  try {
    const { date, name, reason, isRecurringYearly } = req.body;
    
    const holiday = await Holiday.findById(req.params.id);
    
    if (holiday) {
      holiday.date = date || holiday.date;
      holiday.name = name || holiday.name;
      holiday.reason = reason || holiday.reason;
      
      if (isRecurringYearly !== undefined) {
        holiday.isRecurringYearly = isRecurringYearly;
      }
      
      const updatedHoliday = await holiday.save();
      res.json(updatedHoliday);
    } else {
      res.status(404).json({ message: 'Holiday not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete holiday
// @route   DELETE /api/holidays/:id
// @access  Admin
export const deleteHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    
    if (holiday) {
      await holiday.deleteOne();
      res.json({ message: 'Holiday removed' });
    } else {
      res.status(404).json({ message: 'Holiday not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get upcoming holidays
// @route   GET /api/holidays/upcoming
// @access  Public
export const getUpcomingHolidays = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Find non-recurring holidays in the future
    const nonRecurringHolidays = await Holiday.find({
      date: { $gte: today },
      isRecurringYearly: false
    }).sort({ date: 1 });
    
    // Find recurring holidays
    const recurringHolidays = await Holiday.find({
      isRecurringYearly: true
    });
    
    const currentYear = today.getFullYear();
    const upcomingRecurringHolidays = recurringHolidays.map(holiday => {
      const holidayDate = new Date(holiday.date);
      // Set to current year
      const thisYearDate = new Date(
        currentYear,
        holidayDate.getMonth(),
        holidayDate.getDate()
      );
      
      // If already passed this year, set to next year
      if (thisYearDate < today) {
        thisYearDate.setFullYear(currentYear + 1);
      }
      
      return {
        _id: holiday._id,
        date: thisYearDate,
        name: holiday.name,
        reason: holiday.reason,
        isRecurringYearly: true
      };
    });
    
    // Combine and sort all upcoming holidays
    const upcomingHolidays = [...nonRecurringHolidays, ...upcomingRecurringHolidays]
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Limit to next 5 holidays
    const nextHolidays = upcomingHolidays.slice(0, 5);
    
    res.json(nextHolidays);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get holidays by year
// @route   GET /api/holidays/year/:year
// @access  Public
export const getHolidaysByYear = async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    
    if (isNaN(year)) {
      return res.status(400).json({ message: 'Invalid year format' });
    }
    
    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31`);
    endDate.setHours(23, 59, 59, 999);
    
    // Find non-recurring holidays for the year
    const nonRecurringHolidays = await Holiday.find({
      date: { $gte: startDate, $lte: endDate },
      isRecurringYearly: false
    });
    
    // Find recurring holidays
    const recurringHolidays = await Holiday.find({
      isRecurringYearly: true
    });
    
    // Set recurring holidays to the requested year
    const yearlyRecurringHolidays = recurringHolidays.map(holiday => {
      const holidayDate = new Date(holiday.date);
      const adjustedDate = new Date(
        year,
        holidayDate.getMonth(),
        holidayDate.getDate()
      );
      
      return {
        _id: holiday._id,
        date: adjustedDate,
        name: holiday.name,
        reason: holiday.reason,
        isRecurringYearly: true
      };
    });
    
    // Combine and sort all holidays for the year
    const allHolidays = [...nonRecurringHolidays, ...yearlyRecurringHolidays]
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    res.json(allHolidays);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};