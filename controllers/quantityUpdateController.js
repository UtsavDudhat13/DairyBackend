import QuantityUpdate from '../models/QuantityUpdate.js';
import Customer from '../models/Customer.js';

const updateCustomerQuantity = async (req, res) => {
  try {
    const { customerId, date, time, milkType, subcategory, newQuantity, reason } = req.body;

    // Validate input
    if (!customerId || !date || !time || !milkType || !subcategory || newQuantity === undefined || !reason) {
      return res.status(400).json({
        success: false,
        error: 'Please provide all required fields (customerId, date, time, milkType, subcategory, newQuantity, reason)'
      });
    }

    // Get customer
    const customer = await Customer.findById(customerId)
      .populate('deliverySchedule.milkItems.milkType', 'name')
      .populate('deliverySchedule.milkItems.subcategory', 'name');
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: 'Customer not found'
      });
    }

    // Find the delivery time (morning/evening)
    const delivery = customer.deliverySchedule.find(d => d.time === time);
    if (!delivery) {
      return res.status(404).json({
        success: false,
        error: `No delivery schedule found for time: ${time}`
      });
    }

    // Find the milk item
    delivery.milkItems.forEach(element => {
      console.log(element.milkType)
    });
    const milkItem = delivery.milkItems.find(item =>
      item.milkType && item.milkType._id.toString() === milkType &&
      item.subcategory && item.subcategory._id.toString() === subcategory
    );
    if (!milkItem) {
      return res.status(404).json({
        success: false,
        error: 'Milk item not found for the given type and subcategory'
      });
    }

    const originalQuantity = milkItem.quantity;
    const difference = newQuantity - originalQuantity;

    // Update the in-memory milkItem quantity and totalPrice
    milkItem.quantity = newQuantity;
    milkItem.totalPrice = milkItem.quantity * milkItem.pricePerUnit;

    // Update delivery totals
    delivery.totalQuantity = delivery.milkItems.reduce((sum, item) => sum + item.quantity, 0);
    delivery.totalPrice = delivery.milkItems.reduce((sum, item) => sum + item.totalPrice, 0);

    // Check if a quantity update already exists for this date, customer, time, milkType, and subcategory
    const existingUpdate = await QuantityUpdate.findOne({
      customer: customerId,
      date: new Date(date),
      time,
      milkType,
      subcategory
    });

    let update;

    if (existingUpdate) {
      // Update existing record
      update = await QuantityUpdate.findByIdAndUpdate(
        existingUpdate._id,
        {
          oldQuantity: originalQuantity,
          newQuantity,
          difference,
          reason,
          isAccept: req.body.isAccept,
        },
        { new: true, runValidators: true }
      );
    } else {
      // Create new quantity update record
      update = await QuantityUpdate.create({
        customer: customerId,
        date: new Date(date),
        time,
        milkType,
        subcategory,
        oldQuantity: originalQuantity,
        newQuantity,
        difference,
        reason,
        isAccept: req.body.isAccept,
      });
    }

    res.status(200).json({
      success: true,
      data: update,
      deliverySchedule: customer.deliverySchedule
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

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
      .populate({
        path: 'customer',
        select: 'name customerNo phoneNo deliverySchedule',
        populate: {
          path: 'deliverySchedule.milkItems.milkType deliverySchedule.milkItems.subcategory',
          select: 'name'
        }
      })
      .populate('milkType', 'name')
      .populate('subcategory', 'name')
      .sort({ date: -1, createdAt: -1 });

    // Get delivery schedule and apply updates to it (only in response)
    let deliverySchedule = [];

    if (updates.length > 0 && updates[0].customer?.deliverySchedule) {
      // Create a deep copy of the delivery schedule
      deliverySchedule = JSON.parse(JSON.stringify(updates[0].customer.deliverySchedule));

      // Apply quantity updates to the copied delivery schedule
      updates.forEach(update => {
        // Find the matching delivery time
        const delivery = deliverySchedule.find(d => d.time === update.time);
        if (delivery) {
          // Find the matching milk item using string comparison for ObjectIds
          const milkItem = delivery.milkItems.find(item =>
            item.milkType._id.toString() === update.milkType._id.toString() &&
            item.subcategory._id.toString() === update.subcategory._id.toString()
          );

          if (milkItem) {
            // Update quantities in the response copy only
            milkItem.quantity = update.newQuantity;
            milkItem.totalPrice = milkItem.quantity * milkItem.pricePerUnit;
          }
        }
      });

      // Recalculate delivery totals
      deliverySchedule.forEach(delivery => {
        delivery.totalQuantity = delivery.milkItems.reduce((sum, item) => sum + item.quantity, 0);
        delivery.totalPrice = delivery.milkItems.reduce((sum, item) => sum + item.totalPrice, 0);
      });
    }

    // Remove deliverySchedule from customer data in the updates
    const cleanUpdates = updates.map(update => {
      const updateObj = update.toObject();
      if (updateObj.customer && updateObj.customer.deliverySchedule) {
        const { deliverySchedule, ...customerWithoutSchedule } = updateObj.customer;
        updateObj.customer = customerWithoutSchedule;
      }
      return updateObj;
    });

    res.json({
      success: true,
      count: updates.length,
      data: cleanUpdates,
      deliverySchedule: deliverySchedule
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Delete a quantity update by ID
// @route   DELETE /api/updates/quantity/:id
// @access  Private/Admin
const deleteQuantityUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const update = await QuantityUpdate.findById(id);
    if (!update) {
      return res.status(404).json({ success: false, error: 'Quantity update not found' });
    }
    await update.deleteOne();
    res.json({ success: true, message: 'Quantity update deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Accept a quantity update by ID
// @route   PATCH /api/updates/quantity/:id/accept
// @access  Private/Admin
const acceptQuantityUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const update = await QuantityUpdate.findById(id);
    if (!update) {
      return res.status(404).json({ success: false, error: 'Quantity update not found' });
    }
    update.isAccept = true;
    await update.save();
    res.json({ success: true, message: 'Quantity update accepted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export {
  updateCustomerQuantity,
  getQuantityUpdates,
  deleteQuantityUpdate,
  acceptQuantityUpdate
}; 