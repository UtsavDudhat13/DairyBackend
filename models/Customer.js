import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// Schema for individual milk item
const milkItemSchema = mongoose.Schema({
  milkType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
  },
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory',
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  pricePerUnit: {
    type: Number,
    required: true,
    min: 0
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  }
});

// Schema for delivery time (morning/evening) containing multiple milk items
const deliveryTimeSchema = mongoose.Schema({
  time: {
    type: String,
    enum: ['morning', 'evening'],
    required: true
  },
  milkItems: [milkItemSchema], // Array of different milk types
  totalQuantity: {
    type: Number,
    default: 0
  },
  totalPrice: {
    type: Number,
    default: 0
  }
});

const customerSchema = mongoose.Schema(
  {
    customerNo: {
      type: Number,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    phoneNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    joinedDate: {
      type: String,
      default: () => {
        const now = new Date();
        return `${now.getDate().toString().padStart(2, '0')}/${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
      },
      index: true,
    },

    // Array of delivery times - can have morning, evening, or both
    // Each delivery time can have multiple milk types
    deliverySchedule: [deliveryTimeSchema],

    // Overall totals
    totalDailyQuantity: {
      type: Number,
      default: 0,
    },
    totalDailyPrice: {
      type: Number,
      default: 0,
      index: true,
    },

    username: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    advance: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Create compound indexes for more efficient searching
customerSchema.index({ name: 'text', address: 'text', phoneNo: 'text' });
customerSchema.index({ 'deliverySchedule.milkItems.milkType': 1 });
customerSchema.index({ 'deliverySchedule.time': 1 });

// Pre-save middleware to calculate totals
deliveryTimeSchema.pre('save', function (next) {
  // Calculate totals for each delivery time
  this.totalQuantity = this.milkItems.reduce((sum, item) => sum + item.quantity, 0);
  this.totalPrice = this.milkItems.reduce((sum, item) => sum + item.totalPrice, 0);
  next();
});

// Pre-save middleware for milk items to calculate total price
milkItemSchema.pre('save', function (next) {
  this.totalPrice = this.quantity * this.pricePerUnit;
  next();
});

// Pre-save middleware for customer to calculate overall totals
customerSchema.pre('save', function (next) {
  // Validation to ensure only one delivery per time slot
  const times = this.deliverySchedule.map(d => d.time);
  const uniqueTimes = [...new Set(times)];

  if (times.length !== uniqueTimes.length) {
    return next(new Error('Cannot have multiple delivery schedules for the same time slot'));
  }

  // Recalculate totals for each delivery time
  this.deliverySchedule.forEach(delivery => {
    delivery.milkItems.forEach(item => {
      item.totalPrice = item.quantity * item.pricePerUnit;
    });
    delivery.totalQuantity = delivery.milkItems.reduce((sum, item) => sum + item.quantity, 0);
    delivery.totalPrice = delivery.milkItems.reduce((sum, item) => sum + item.totalPrice, 0);
  });

  // Calculate overall daily totals
  this.totalDailyQuantity = this.deliverySchedule.reduce((sum, delivery) => sum + delivery.totalQuantity, 0);
  this.totalDailyPrice = this.deliverySchedule.reduce((sum, delivery) => sum + delivery.totalPrice, 0);

  next();
});

// Helper methods
customerSchema.methods.getMorningDelivery = function () {
  return this.deliverySchedule.find(d => d.time === 'morning');
};

customerSchema.methods.getEveningDelivery = function () {
  return this.deliverySchedule.find(d => d.time === 'evening');
};

customerSchema.methods.addMilkItem = function (time, milkItemData) {
  let deliveryTime = this.deliverySchedule.find(d => d.time === time);

  if (!deliveryTime) {
    // Create new delivery time if it doesn't exist
    deliveryTime = {
      time: time,
      milkItems: [],
      totalQuantity: 0,
      totalPrice: 0
    };
    this.deliverySchedule.push(deliveryTime);
  }

  // Check if this milk type already exists for this time
  const existingItemIndex = deliveryTime.milkItems.findIndex(
    item => item.milkType.toString() === milkItemData.milkType.toString() &&
      item.subcategory.toString() === milkItemData.subcategory.toString()
  );

  if (existingItemIndex !== -1) {
    // Update existing item
    deliveryTime.milkItems[existingItemIndex].quantity += milkItemData.quantity;
    deliveryTime.milkItems[existingItemIndex].totalPrice =
      deliveryTime.milkItems[existingItemIndex].quantity * deliveryTime.milkItems[existingItemIndex].pricePerUnit;
  } else {
    // Add new milk item
    milkItemData.totalPrice = milkItemData.quantity * milkItemData.pricePerUnit;
    deliveryTime.milkItems.push(milkItemData);
  }
};

customerSchema.methods.removeMilkItem = function (time, milkTypeId, subcategoryId) {
  const deliveryTime = this.deliverySchedule.find(d => d.time === time);
  if (deliveryTime) {
    deliveryTime.milkItems = deliveryTime.milkItems.filter(
      item => !(item.milkType.toString() === milkTypeId.toString() &&
        item.subcategory.toString() === subcategoryId.toString())
    );

    // Remove delivery time if no milk items left
    if (deliveryTime.milkItems.length === 0) {
      this.deliverySchedule = this.deliverySchedule.filter(d => d.time !== time);
    }
  }
};

customerSchema.methods.updateMilkItemQuantity = function (time, milkTypeId, subcategoryId, newQuantity) {
  const deliveryTime = this.deliverySchedule.find(d => d.time === time);
  if (deliveryTime) {
    const milkItem = deliveryTime.milkItems.find(
      item => item.milkType.toString() === milkTypeId.toString() &&
        item.subcategory.toString() === subcategoryId.toString()
    );

    if (milkItem) {
      milkItem.quantity = newQuantity;
      milkItem.totalPrice = milkItem.quantity * milkItem.pricePerUnit;
    }
  }
};

customerSchema.methods.removeDeliveryTime = function (time) {
  this.deliverySchedule = this.deliverySchedule.filter(d => d.time !== time);
};

// Method to get all milk types a customer takes
customerSchema.methods.getAllMilkTypes = function () {
  const milkTypes = [];
  this.deliverySchedule.forEach(delivery => {
    delivery.milkItems.forEach(item => {
      if (!milkTypes.find(mt => mt.toString() === item.milkType.toString())) {
        milkTypes.push(item.milkType);
      }
    });
  });
  return milkTypes;
};

// Method to match password
customerSchema.methods.matchPassword = async function (enteredPassword) {
  console.log(`Entered Password: ${enteredPassword}`);
  console.log(`Stored Password: ${this.password}`);
  const salt = "$2b$10$kevinkevinkevinkevinke";
  const decryptedPassword = await bcrypt.hash(enteredPassword, salt);
  console.log(`Decrypted Password: ${decryptedPassword}`);

  if (decryptedPassword === this.password) {
    console.log('Password match');
    return true;
  } else {
    console.log('Password does not match');
    return false;
  }
};

// Auto-generate username and password before saving
customerSchema.pre('save', async function (next) {
  // Auto set username as phone number if not modified
  if (!this.isModified('username')) {
    this.username = this.phoneNo;
  }

  // Auto set password as phone number if not modified
  if (!this.isModified('password')) {
    this.password = this.phoneNo;
  }

  // Hash the password if modified
  if (this.isModified('password')) {
    const salt = "$2b$10$kevinkevinkevinkevinke";
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

// Pre validate hook to auto-increment customer number
customerSchema.pre('validate', async function (next) {
  if (this.isNew && !this.customerNo) {
    try {
      const lastCustomer = await this.constructor.findOne({}, {}, { sort: { 'customerNo': -1 } });
      this.customerNo = lastCustomer ? lastCustomer.customerNo + 1 : 1;
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

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

const Customer = mongoose.model('Customer', customerSchema);
export default Customer;