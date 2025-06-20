import QuantityUpdate from '../models/QuantityUpdate.js';
import Customer from '../models/Customer.js';

// @desc    Create quantity update for a specific day
// @route   POST /api/updates/quantity
// @access  Private/Admin
const updateCustomerQuantity = async (req, res) => {
  try {
    const { customerId, date, updateType, newQuantity, reason } = req.body;

    // Validate input
    if (!customerId || !date || !updateType || newQuantity === undefined || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Please provide all required fields'
      });
    }

    // Get customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Get the original quantity based on update type
    const originalQuantity = updateType === 'morning' ? customer.morningQuantity : customer.eveningQuantity;
    const difference = newQuantity - originalQuantity;

    // Create quantity update record
    const update = await QuantityUpdate.create({
      customer: customerId,
      date: new Date(date),
      updateType,
      oldQuantity: originalQuantity,
      newQuantity,
      difference,
      reason,
      updatedBy: customerId,
    });

    console.log(update);

    res.status(200).json({
      success: true,
      data: update
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get all quantity updates with filters
// @route   GET /api/updates/quantity
// @access  Private/Admin
const getQuantityUpdates = async (req, res) => {
  try {
    const { startDate, endDate, customerId } = req.query;

    const query = {};

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    if (customerId) {
      query.customer = customerId;
    }

    const updates = await QuantityUpdate.find(query)
      .populate('customer', 'name customerNo phoneNo')
      .populate('updatedBy', 'name')
      .sort({ date: -1, createdAt: -1 });

    res.json({
      success: true,
      count: updates.length,
      data: updates
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

export {
  updateCustomerQuantity,
  getQuantityUpdates
}; 