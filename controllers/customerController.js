import Customer from "../models/Customer.js";
import Record from "../models/Record.js";
import Holiday from "../models/Holiday.js";
import generateToken from "../utils/generateToken.js";

// Create a wrapper to handle errors in async functions
const tryCatch = (controller) => async (req, res, next) => {
  try {
    await controller(req, res);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || "Server Error",
    });
  }
};

// @desc    Get all customers
// @route   GET /api/customers
// @access  Private/Admin
const getCustomers = tryCatch(async (req, res) => {
  // Check if we need to apply pagination
  const isPaginationRequired =
    req.query.page !== undefined || req.query.limit !== undefined;

  // Query parameters with defaults
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const search = req.query.search || "";
  const sortField = req.query.sortField || "customerNo";
  const sortOrder = req.query.sortOrder || "asc";

  // Filter parameters - these are optional
  const isActive =
    req.query.isActive !== undefined
      ? req.query.isActive === "true"
      : undefined;
  const milkType = req.query.milkType || undefined;
  const subcategory = req.query.subcategory || undefined;

  // Prepare conditions object - starts empty to get all data by default
  const conditions = {};

  // Only add search conditions if search term exists
  if (search) {
    conditions.$or = [
      { name: { $regex: search, $options: "i" } },
      { phoneNo: { $regex: search, $options: "i" } },
      { address: { $regex: search, $options: "i" } },
    ];

    // Only add customerNo search if it could be a number
    if (!isNaN(parseInt(search))) {
      conditions.$or.push({ customerNo: parseInt(search) });
    }
  }

  // Only add filter conditions if they actually exist
  if (isActive !== undefined) {
    conditions.isActive = isActive;
  }

  if (milkType) {
    conditions['deliverySchedule.milkItems.milkType'] = milkType;
  }

  if (subcategory) {
    conditions['deliverySchedule.milkItems.subcategory'] = subcategory;
  }

  // Prepare sort object
  const sort = {};
  sort[sortField] = sortOrder === "asc" ? 1 : -1;

  // Base query without pagination
  let customersQuery = Customer.find(conditions)
    .populate({
      path: 'deliverySchedule',
      populate: {
        path: 'milkItems',
        populate: [
          { path: 'milkType', select: 'name' },
          { path: 'subcategory', select: 'name price' }
        ]
      }
    })
    .sort(sort)
    .lean();

  // Apply pagination only if required
  if (isPaginationRequired) {
    const skip = (page - 1) * limit;
    customersQuery = customersQuery.skip(skip).limit(limit);
  }

  // Execute queries
  const [total, customers] = await Promise.all([
    Customer.countDocuments(conditions),
    customersQuery,
  ]);
  // Calculate pagination data (only if pagination is applied)
  const totalPages = isPaginationRequired ? Math.ceil(total / limit) : 1;
  const hasMore = isPaginationRequired ? page < totalPages : false;

  // Return response
  res.json({
    customers,
    page: isPaginationRequired ? page : 1,
    limit: isPaginationRequired ? limit : total,
    totalPages,
    totalCustomers: total,
    hasMore,
  });
});

// @desc    Get customer by ID
// @route   GET /api/customers/:id
// @access  Private/Admin
const getCustomerById = tryCatch(async (req, res) => {
  const customer = await Customer.findById(req.params.id)
    .populate({
      path: 'deliverySchedule',
      populate: {
        path: 'milkItems',
        populate: [
          { path: 'milkType', select: 'name' },
          { path: 'subcategory', select: 'name price' }
        ]
      }
    });

  if (customer) {
    res.json(customer);
  } else {
    res.status(404).json({ message: "Customer not found" });
  }
});

// Helper to calculate totalPrice for each milk item
function calculateMilkItemTotals(deliverySchedule) {
  if (!Array.isArray(deliverySchedule)) return;
  deliverySchedule.forEach(delivery => {
    if (Array.isArray(delivery.milkItems)) {
      delivery.milkItems.forEach(item => {
        item.totalPrice = item.quantity * item.pricePerUnit;
      });
    }
  });
}

// Helper function to check if a date is a holiday
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
      return true;
    }

    // Check for recurring holidays (same month and day, any year)
    const recurringHolidays = await Holiday.find({
      isRecurringYearly: true
    });

    for (const holiday of recurringHolidays) {
      const holidayDate = new Date(holiday.date);
      if (holidayDate.getMonth() === currentMonth &&
        holidayDate.getDate() === currentDay) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking holiday:', error);
    // In case of error, assume it's not a holiday to avoid blocking record creation
    return false;
  }
};

// Helper function to create historical records for a customer
const createHistoricalRecords = async (customer, joinedDate) => {
  try {
    // Parse the joined date from Indian format (DD/MM/YYYY) to JavaScript Date
    const parts = joinedDate.split('/');
    if (parts.length !== 3) {
      console.error('Invalid date format for joinedDate:', joinedDate);
      return { success: false, error: 'Invalid date format' };
    }

    const startDate = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    startDate.setHours(0, 0, 0, 0);

    // Get yesterday's date (one day before current date)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    // If joined date is in the future, no need to create historical records
    // This is a more explicit check that returns a clear message
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate > today) {
      return {
        success: true,
        count: 0,
        message: `No historical records created because the joined date (${joinedDate}) is in the future`
      };
    }

    // Create records for each day from joined date to yesterday
    const createdRecords = [];
    let currentDate = new Date(startDate);

    while (currentDate <= yesterday) {
      // Check if a record already exists for this date
      const existingRecord = await Record.findOne({
        customer: customer._id,
        date: new Date(currentDate)
      });

      // Check if this date is a holiday
      const isHoliday = await checkIfHoliday(currentDate);

      // If no record exists and it's not a holiday, create a new record
      if (!existingRecord && !isHoliday) {
        // Prepare new deliverySchedule for the record
        const recordDeliverySchedule = [];
        let totalDailyQuantity = 0;
        let totalDailyPrice = 0;

        for (const delivery of customer.deliverySchedule) {
          const recordMilkItems = [];
          let deliveryTotalQuantity = 0;
          let deliveryTotalPrice = 0;

          for (const milkItem of delivery.milkItems) {
            const quantity = milkItem.quantity;
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
          date: new Date(currentDate),
          deliverySchedule: recordDeliverySchedule,
          totalDailyQuantity,
          totalDailyPrice
        });

        createdRecords.push(record);
      }

      // Move to the next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      success: true,
      count: createdRecords.length,
      message: `Created ${createdRecords.length} historical records`
    };
  } catch (error) {
    console.error('Error creating historical records:', error);
    return { success: false, error: error.message };
  }
};
const createCustomer = tryCatch(async (req, res) => {
  let {
    name,
    phoneNo,
    address,
    deliverySchedule,
    password,
    username,
    joinedDate
  } = req.body;

  // Check if customer with phone number already exists
  const customerExists = await Customer.findOne({ phoneNo });

  if (customerExists) {
    return res
      .status(400)
      .json({ message: "Customer with this phone number already exists" });
  }

  // Calculate totals for milk items
  calculateMilkItemTotals(deliverySchedule);

  // If username or password are not provided, set them to phoneNo
  if (!username) username = phoneNo;
  if (!password) password = phoneNo;

  // Create customer. customerNo is auto-generated by pre-validate hook
  const customer = new Customer({
    name,
    phoneNo,
    address,
    deliverySchedule,
    username,
    password,
    joinedDate, // Add the joinedDate field
  });

  const createdCustomer = await customer.save();

  if (createdCustomer) {
    // Create historical records if the customer has a past join date
    let historicalRecordsResult = { success: true, count: 0 };

    if (joinedDate) {
      historicalRecordsResult = await createHistoricalRecords(createdCustomer, joinedDate);
      console.log('Historical records creation result:', historicalRecordsResult);
    }

    res.status(201).json({
      ...createdCustomer.toObject(),
      historicalRecords: historicalRecordsResult
    });
  } else {
    res.status(400).json({ message: "Invalid customer data" });
  }
});

// @desc    Update customer
// @route   PUT /api/customers/:id
// @access  Private/Admin
const updateCustomer = tryCatch(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (customer) {
    customer.name = req.body.name || customer.name;
    customer.phoneNo = req.body.phoneNo || customer.phoneNo;
    customer.address = req.body.address || customer.address;
    customer.isActive =
      req.body.isActive !== undefined ? req.body.isActive : customer.isActive;

    // Update joinedDate if provided
    if (req.body.joinedDate) {
      customer.joinedDate = req.body.joinedDate;
    }

    // Update delivery schedule if provided
    if (req.body.deliverySchedule) {
      calculateMilkItemTotals(req.body.deliverySchedule);
      customer.deliverySchedule = req.body.deliverySchedule;
    }

    // If phone number is updated, update username too (unless explicitly provided)
    if (req.body.phoneNo && !req.body.username) {
      customer.username = req.body.phoneNo;
    }

    // If username is explicitly provided
    if (req.body.username) {
      customer.username = req.body.username;
    }

    // If password is provided
    if (req.body.password) {
      customer.password = req.body.password;
    }

    const updatedCustomer = await customer.save();

    res.json(updatedCustomer);
  } else {
    res.status(404).json({ message: "Customer not found" });
  }
});

// @desc    Delete customer
// @route   DELETE /api/customers/:id
// @access  Private/Admin
const deleteCustomer = tryCatch(async (req, res) => {
  const customer = await Customer.findById(req.params.id);

  if (!customer) {
    return res.status(404).json({ message: "Customer not found" });
  }

  // Check if customer has any associated records
  const customerRecords = await Record.countDocuments({ customer: customer._id });

  if (customerRecords > 0) {
    return res.status(400).json({
      message: `Cannot delete customer as they have ${customerRecords} associated records. Please remove the records first or deactivate the customer instead.`
    });
  }

  // Perform permanent delete
  await Customer.findByIdAndDelete(req.params.id);

  res.json({
    message: "Customer successfully deleted",
    customerId: customer._id
  });
});

// @desc    Auth customer & get token
// @route   POST /api/customers/login
// @access  Public
const authCustomer = tryCatch(async (req, res) => {
  const { username, password } = req.body;

  console.log("Username:", username);
  console.log("Password:", password);
  const customer = await Customer.findOne({ username, isActive: true });

  if (customer && (await customer.matchPassword(password))) {
    res.json({
      _id: customer._id,
      customerNo: customer.customerNo,
      name: customer.name,
      phoneNo: customer.phoneNo,
      address: customer.address,
      deliverySchedule: customer.deliverySchedule,
      totalDailyQuantity: customer.totalDailyQuantity,
      totalDailyPrice: customer.totalDailyPrice,
      username: customer.username,
      isActive: customer.isActive,
      joinedDate: customer.joinedDate,
      token: generateToken(customer._id),
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt
    });
  } else {
    res.status(401).json({ message: "Invalid username or password" });
  }
});

// @desc    Get customers with advance payments
// @route   GET /api/customers/with-advance
// @access  Private/Admin
const getCustomersWithAdvance = tryCatch(async (req, res) => {
  // Get all customers with advance > 0
  const customers = await Customer.find({
    advance: { $gt: 0 }
  }).select('-password').sort({ advance: -1 });

  res.json(customers);
});

export {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  authCustomer,
  getCustomersWithAdvance,
};
