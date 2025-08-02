import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import subcategoryRoutes from './routes/subcategoryRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import stockRoutes from './routes/stockRoutes.js'
import holidayRoutes from './routes/holidays.js'
import recordRoutes from './routes/recordRoutes.js'
import quantityUpdateRoutes from './routes/quantityUpdateRoutes.js'
import scheduleDailyRecords from './utils/cronJobs.js'
import invoiceRoutes from './routes/invoiceRoutes.js';
import systemConfigRoutes from './routes/systemConfigRoutes.js';
// Add this line

dotenv.config();

connectDB();

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/subcategories', subcategoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/updates/quantity', quantityUpdateRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/config', systemConfigRoutes);

scheduleDailyRecords();

app.get('/', (req, res) => {
  res.send('API is running...');
});
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});