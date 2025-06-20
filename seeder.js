import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Admin from './models/Admin.js';
import connectDB from './config/db.js';

dotenv.config();

connectDB();

const importData = async () => {
  try {
    // Clear previous data
    await Admin.deleteMany();

    // Create admin user
    await Admin.create({
      username: 'admin',
      password: 'password123',
      isAdmin: true,
    });

    console.log('Admin user created');
    process.exit();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

importData();