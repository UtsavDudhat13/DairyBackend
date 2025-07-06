import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Customer from './models/Customer.js';
import Invoice from './models/Invoice.js';

dotenv.config();

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ramdev')
    .then(() => console.log('MongoDB connected for seeding...'))
    .catch(err => console.error('MongoDB connection error:', err));

/**
 * Get the last day of a month
 */
const getLastDayOfMonth = (year, month) => {
    return new Date(year, month, 0).getDate();
};

/**
 * Generate daily records for a month
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {number} basePrice - Price per liter
 * @returns {Array} Array of daily records
 */
const generateMonthlyRecords = (year, month, basePrice) => {
    const records = [];
    const lastDay = getLastDayOfMonth(year, month);

    console.log(`Generating records for ${month}/${year} - Days 1 to ${lastDay}`);

    // Loop through each day of the month (1 to lastDay)
    for (let day = 1; day <= lastDay; day++) {
        // Create date in UTC to avoid timezone issues
        const date = new Date(Date.UTC(year, month - 1, day));

        // Generate random quantities (realistic values between 1-5 liters)
        const morningQuantity = Math.round((1 + Math.random() * 4) * 10) / 10;
        const eveningQuantity = Math.round((1 + Math.random() * 4) * 10) / 10;
        const dailyQuantity = Math.round((morningQuantity + eveningQuantity) * 100) / 100;
        const dailyAmount = Math.round(dailyQuantity * basePrice * 100) / 100;

        // Create delivery schedule with milk items (simplified for seeding)
        const deliverySchedule = [];

        // Morning delivery
        if (morningQuantity > 0) {
            deliverySchedule.push({
                time: 'morning',
                milkItems: [
                    {
                        milkType: '507f1f77bcf86cd799439011', // Default milk type ID
                        subcategory: '507f1f77bcf86cd799439012', // Default subcategory ID
                        quantity: morningQuantity,
                        pricePerUnit: basePrice,
                        totalPrice: Math.round(morningQuantity * basePrice * 100) / 100
                    }
                ],
                totalQuantity: morningQuantity,
                totalPrice: Math.round(morningQuantity * basePrice * 100) / 100
            });
        }

        // Evening delivery
        if (eveningQuantity > 0) {
            deliverySchedule.push({
                time: 'evening',
                milkItems: [
                    {
                        milkType: '507f1f77bcf86cd799439011', // Default milk type ID
                        subcategory: '507f1f77bcf86cd799439012', // Default subcategory ID
                        quantity: eveningQuantity,
                        pricePerUnit: basePrice,
                        totalPrice: Math.round(eveningQuantity * basePrice * 100) / 100
                    }
                ],
                totalQuantity: eveningQuantity,
                totalPrice: Math.round(eveningQuantity * basePrice * 100) / 100
            });
        }

        records.push({
            date: date,
            deliverySchedule,
            totalDailyQuantity: dailyQuantity,
            totalDailyPrice: dailyAmount
        });
    }

    console.log(`Generated ${records.length} daily records`);
    return records;
};

/**
 * Generate invoice number
 * @param {Date} date - Invoice date
 * @param {number} counter - Sequential counter
 * @returns {string} Invoice number
 */
const generateInvoiceNumber = (date, counter) => {
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `INV-${year}-${month}-${counter.toString().padStart(4, '0')}`;
};

/**
 * Create an invoice for a customer and month
 */
const createInvoiceForMonth = async (customer, year, month, counter) => {
    console.log(`\n--- Creating invoice for ${customer.name} ---`);

    // Create start and end dates in UTC to avoid timezone issues
    const startDate = new Date(Date.UTC(year, month - 1, 1)); // First day of month
    const lastDay = getLastDayOfMonth(year, month);
    const endDate = new Date(Date.UTC(year, month - 1, lastDay)); // Last day of month

    console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

    // Set due date to 15 days after end of month
    const dueDate = new Date(endDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + 15);

    // Random price between 55 and 65
    const basePrice = Math.floor(55 + Math.random() * 10);
    console.log(`Base price: ₹${basePrice}/liter`);

    // Generate daily records
    const items = generateMonthlyRecords(year, month, basePrice);

    // Calculate totals
    let totalQuantity = 0;
    let totalAmount = 0;

    items.forEach(item => {
        totalQuantity += item.totalDailyQuantity;
        totalAmount += item.totalDailyPrice;
    });

    // Round to 2 decimal places
    totalQuantity = Math.round(totalQuantity * 100) / 100;
    totalAmount = Math.round(totalAmount * 100) / 100;

    console.log(`Total: ${totalQuantity}L = ₹${totalAmount}`);

    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber(startDate, counter);
    console.log(`Invoice Number: ${invoiceNumber}`);

    // Determine if we should add payments (70% chance for March, 30% chance for April)
    const shouldAddPayment = month === 3 ? Math.random() < 0.7 : Math.random() < 0.3;

    // Create payment data if needed
    const payments = [];
    let amountPaid = 0;

    if (shouldAddPayment) {
        // Decide payment amount (full or partial)
        const isFullPayment = Math.random() < 0.6;
        const paymentAmount = isFullPayment ? totalAmount : Math.round(totalAmount * (0.3 + Math.random() * 0.4) * 100) / 100;

        // Create payment record within the month
        const paymentDate = new Date(Date.UTC(year, month - 1, Math.floor(5 + Math.random() * 20)));

        payments.push({
            amount: paymentAmount,
            paymentDate,
            paymentMethod: Math.random() < 0.7 ? 'cash' : 'online',
            transactionId: Math.random() < 0.5 ? `TXN${year}_${customer.customerNo}_${Math.floor(1000 + Math.random() * 9000)}` : undefined,
            notes: Math.random() < 0.3 ? 'Regular monthly payment' : undefined
        });

        amountPaid = paymentAmount;
        console.log(`Payment added: ₹${paymentAmount}`);
    }

    // Calculate due amount
    const dueAmount = Math.round((totalAmount - amountPaid) * 100) / 100;

    // Determine status
    let status;
    if (dueAmount <= 0) {
        status = 'paid';
    } else if (amountPaid > 0) {
        status = 'partially_paid';
    } else if (dueDate < new Date()) {
        status = 'overdue';
    } else {
        status = 'pending';
    }

    console.log(`Status: ${status}, Due: ₹${dueAmount}`);

    // Create the invoice object
    const invoiceData = {
        customer: customer._id,
        invoiceNumber,
        startDate,
        endDate,
        totalQuantity,
        totalAmount,
        amountPaid,
        dueAmount,
        status,
        dueDate,
        items,
        payments
    };

    console.log('Creating invoice in database...');

    try {
        const invoice = new Invoice(invoiceData);
        const savedInvoice = await invoice.save();
        console.log(`✅ Invoice saved with ID: ${savedInvoice._id}`);
        return savedInvoice;
    } catch (error) {
        console.error('❌ Error saving invoice:', error);
        throw error;
    }
};

/**
 * Main seeding function
 */
const seedInvoices = async () => {
    try {
        console.log('🚀 Starting invoice seeding process...');

        // Get all active customers
        const customers = await Customer.find({ isActive: true });
        console.log(`📊 Found ${customers.length} active customers`);

        if (customers.length === 0) {
            console.log('❌ No active customers found. Please add customers first.');

            // Let's check if there are any customers at all
            const allCustomers = await Customer.find({});
            console.log(`Total customers in database: ${allCustomers.length}`);

            if (allCustomers.length > 0) {
                console.log('Available customers:');
                allCustomers.forEach(c => console.log(`- ${c.name} (Active: ${c.isActive})`));
            }

            process.exit(0);
        }

        // List all customers
        console.log('Active customers:');
        customers.forEach(c => console.log(`- ${c.name} (Customer No: ${c.customerNo})`));

        // Define the months to generate data for
        const months = [
            { year: 2025, month: 3, name: 'March 2025' },
            { year: 2025, month: 4, name: 'April 2025' }
        ];

        let totalInvoicesCreated = 0;

        // Process each month
        for (const period of months) {
            console.log(`\n📅 Processing ${period.name}...`);

            const startDate = new Date(Date.UTC(period.year, period.month - 1, 1));
            const lastDay = getLastDayOfMonth(period.year, period.month);
            const endDate = new Date(Date.UTC(period.year, period.month - 1, lastDay));

            console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

            // Check for existing invoices - more flexible query
            const existingInvoices = await Invoice.find({
                $or: [
                    {
                        startDate: { $gte: startDate, $lte: endDate }
                    },
                    {
                        endDate: { $gte: startDate, $lte: endDate }
                    },
                    {
                        $and: [
                            { startDate: { $lte: startDate } },
                            { endDate: { $gte: endDate } }
                        ]
                    }
                ]
            });

            if (existingInvoices.length > 0) {
                console.log(`⚠️  Found ${existingInvoices.length} existing invoices for ${period.name}. Skipping this month.`);
                continue;
            }

            console.log(`✨ Generating invoices for ${period.name}...`);

            // Generate invoices for each customer
            let counter = 1;
            let monthlyInvoicesCreated = 0;

            for (const customer of customers) {
                try {
                    await createInvoiceForMonth(customer, period.year, period.month, counter);
                    counter++;
                    monthlyInvoicesCreated++;
                } catch (error) {
                    console.error(`❌ Failed to create invoice for ${customer.name}:`, error.message);
                }
            }

            console.log(`✅ Generated ${monthlyInvoicesCreated} invoices for ${period.name}`);
            totalInvoicesCreated += monthlyInvoicesCreated;
        }

        console.log(`\n🎉 Invoice seeding completed successfully!`);
        console.log(`📈 Total invoices created: ${totalInvoicesCreated}`);

        // Final verification
        const totalInvoices = await Invoice.countDocuments({});
        console.log(`📊 Total invoices in database: ${totalInvoices}`);

        mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('💥 Error seeding invoices:', error);
        mongoose.connection.close();
        process.exit(1);
    }
};

// Run the seeding function
seedInvoices();