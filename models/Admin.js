import mongoose from 'mongoose';
import CryptoJS from 'crypto-js';

const adminSchema = mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    isAdmin: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

adminSchema.methods.matchPassword = async function (enteredPassword) {
  return await (enteredPassword === decryptPassword(this.password, "Ramdev-Dairy-2025"));
};

// Middleware to hash password before saving
adminSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    next();
  }
  this.password = CryptoJS.AES.encrypt(this.password, "Ramdev-Dairy-2025").toString();
});
function decryptPassword(cipherText, secretKey) {
  const bytes = CryptoJS.AES.decrypt(cipherText, secretKey);
  return bytes.toString(CryptoJS.enc.Utf8);
}
const Admin = mongoose.model('Admin', adminSchema);

export default Admin;