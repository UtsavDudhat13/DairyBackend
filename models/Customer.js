import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const customerSchema = mongoose.Schema(
  {
    customerNo: {
      type: Number,
      unique: true,
      index: true, // Add index for faster queries
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true, // Add index for faster searching
    },
    phoneNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true, // Add index for faster searching
    },
    address: {
      type: String,
      required: true,
      trim: true,
      index: true, // Add index for faster searching
    },
    milkType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true, // Add index for faster filtering
    },
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subcategory',
      required: true,
      index: true, // Add index for faster filtering
    },
    morningQuantity: {
      type: Number,
      default: 0,
    },
    eveningQuantity: {
      type: Number,
      default: 0,
    },
    price: {
      type: Number,
      required: true,
      index: true, // Add index for faster sorting
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
      index: true, // Add index for faster filtering
    },
  },
  {
    timestamps: true,
  }
);

// Create compound indexes for more efficient searching
customerSchema.index({ name: 'text', address: 'text', phoneNo: 'text' });

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

const Customer = mongoose.model('Customer', customerSchema);

export default Customer;