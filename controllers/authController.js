import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    // Not setting expiry as per user's request
  });
};

// @desc    Auth admin & get token
// @route   POST /api/auth/login
// @access  Public
const loginAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;

    const admin = await Admin.findOne({ username });

    if (admin && (await admin.matchPassword(password))) {
      res.json({
        _id: admin._id,
        username: admin.username,
        isAdmin: admin.isAdmin,
        token: generateToken(admin._id),
      });
    } else {
      res.status(401).json({ message: 'Invalid username or password' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Create admin (for seeding purposes)
// @route   POST /api/auth/seed
// @access  Public (but should be secured in production)
const createAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if admin already exists
    const adminExists = await Admin.findOne({ username });

    if (adminExists) {
      return res.status(400).json({ message: 'Admin already exists' });
    }

    // Create admin
    const admin = await Admin.create({
      username,
      password,
    });

    if (admin) {
      res.status(201).json({
        _id: admin._id,
        username: admin.username,
        isAdmin: admin.isAdmin,
        token: generateToken(admin._id),
      });
    } else {
      res.status(400).json({ message: 'Invalid admin data' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all admins
// @route   GET /api/auth/admins
// @access  Private
const getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find({});
    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update admin
// @route   PUT /api/auth/admins/:id
// @access  Private
const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, isAdmin } = req.body;

    const admin = await Admin.findById(id);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // Check if username is being changed and if it conflicts
    if (username && username !== admin.username) {
      const existingAdmin = await Admin.findOne({ username });
      if (existingAdmin) {
        return res.status(400).json({ message: 'Username already exists' });
      }
    }

    admin.username = username || admin.username;
    if (password) {
      admin.password = password;
    }
    admin.isAdmin = isAdmin !== undefined ? isAdmin : admin.isAdmin;

    const updatedAdmin = await admin.save();

    res.json({
      _id: updatedAdmin._id,
      username: updatedAdmin.username,
      isAdmin: updatedAdmin.isAdmin,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete admin
// @route   DELETE /api/auth/admins/:id
// @access  Private
const deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent deleting the current user
    if (id === req.admin._id.toString()) {
      return res.status(400).json({ message: 'Cannot delete your own account' });
    }

    const admin = await Admin.findById(id);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    await Admin.findByIdAndDelete(id);

    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export { loginAdmin, createAdmin, getAllAdmins, updateAdmin, deleteAdmin };