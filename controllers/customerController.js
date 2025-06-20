import Customer from "../models/Customer.js";
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
    conditions.milkType = milkType;
  }

  if (subcategory) {
    conditions.subcategory = subcategory;
  }

  // Prepare sort object
  const sort = {};
  sort[sortField] = sortOrder === "asc" ? 1 : -1;

  // Base query without pagination
  let customersQuery = Customer.find(conditions)
    .populate("milkType", "name")
    .populate("subcategory", "name price")
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
    .populate("milkType", "name")
    .populate("subcategory", "name price");

  if (customer) {
    res.json(customer);
  } else {
    res.status(404).json({ message: "Customer not found" });
  }
});

// @desc    Create a customer
// @route   POST /api/customers
// @access  Private/Admin
const createCustomer = tryCatch(async (req, res) => {
  const {
    name,
    phoneNo,
    address,
    milkType,
    subcategory,
    morningQuantity,
    eveningQuantity,
    price,
  } = req.body;

  // Check if customer with phone number already exists
  const customerExists = await Customer.findOne({ phoneNo });

  if (customerExists) {
    return res
      .status(400)
      .json({ message: "Customer with this phone number already exists" });
  }

  // Get the next customer number
  const lastCustomer = await Customer.findOne(
    {},
    {},
    { sort: { customerNo: -1 } }
  );
  const nextCustomerNo = lastCustomer ? lastCustomer.customerNo + 1 : 1;

  // Create customer with manually assigned customerNo
  const customer = await Customer.create({
    customerNo: nextCustomerNo,
    name,
    phoneNo,
    address,
    milkType,
    subcategory,
    morningQuantity,
    eveningQuantity,
    price,
    username: phoneNo, // Auto set to phone number
    password: phoneNo, // Auto set to phone number (will be hashed by pre-save hook)
  });

  if (customer) {
    res.status(201).json({
      _id: customer._id,
      customerNo: customer.customerNo,
      name: customer.name,
      phoneNo: customer.phoneNo,
      address: customer.address,
      milkType: customer.milkType,
      subcategory: customer.subcategory,
      morningQuantity: customer.morningQuantity,
      eveningQuantity: customer.eveningQuantity,
      price: customer.price,
      username: customer.username,
      isActive: customer.isActive,
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
    customer.milkType = req.body.milkType || customer.milkType;
    customer.subcategory = req.body.subcategory || customer.subcategory;
    customer.morningQuantity =
      req.body.morningQuantity !== undefined
        ? req.body.morningQuantity
        : customer.morningQuantity;
    customer.eveningQuantity =
      req.body.eveningQuantity !== undefined
        ? req.body.eveningQuantity
        : customer.eveningQuantity;
    customer.price =
      req.body.price !== undefined ? req.body.price : customer.price;
    customer.isActive =
      req.body.isActive !== undefined ? req.body.isActive : customer.isActive;

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

    res.json({
      _id: updatedCustomer._id,
      customerNo: updatedCustomer.customerNo,
      name: updatedCustomer.name,
      phoneNo: updatedCustomer.phoneNo,
      address: updatedCustomer.address,
      milkType: updatedCustomer.milkType,
      subcategory: updatedCustomer.subcategory,
      morningQuantity: updatedCustomer.morningQuantity,
      eveningQuantity: updatedCustomer.eveningQuantity,
      price: updatedCustomer.price,
      username: updatedCustomer.username,
      isActive: updatedCustomer.isActive,
    });
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

  // Check if customer has any associated data (like orders, deliveries, etc.)
  // This is a placeholder - implement actual checks based on your data model
  const hasAssociatedData = false; // Replace with actual checks

  if (hasAssociatedData) {
    return res.status(400).json({
      message: "Cannot delete customer with associated data. Please remove associated data first."
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

  console.log("Customer found:", customer);
  console.log("Password match:", await customer.matchPassword(password));
  if (customer && (await customer.matchPassword(password))) {
    res.json({
      _id: customer._id,
      customerNo: customer.customerNo,
      name: customer.name,
      phoneNo: customer.phoneNo,
      address: customer.address,
      milkType: customer.milkType,
      subcategory: customer.subcategory,
      morningQuantity: customer.morningQuantity,
      eveningQuantity: customer.eveningQuantity,
      price: customer.price,
      token: generateToken(customer._id),
    });
  } else {
    res.status(401).json({ message: "Invalid username or password" });
  }
});

export {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  authCustomer,
};
