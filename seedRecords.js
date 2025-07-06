import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Customer from './models/Customer.js';
import Record from './models/Record.js';
import Category from './models/Category.js';
import Subcategory from './models/Subcategory.js';

dotenv.config();

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ramdev')
    .then(() => console.log('MongoDB connected for record seeding...'))
    .catch(err => console.error('MongoDB connection error:', err));

/**
 * Get the last day of a month
 */
const getLastDayOfMonth = (year, month) => {
    return new Date(year, month, 0).getDate();
};

/**
 * Generate daily records for a customer for a month
 * @param {Object} customer - Customer object
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @param {Array} categories - Available milk categories
 * @param {Array} subcategories - Available subcategories
 * @returns {Array} Array of daily records
 */
const generateCustomerRecords = async (customer, year, month, categories, subcategories) => {
    const records = [];
    const lastDay = getLastDayOfMonth(year, month);

    console.log(`Generating records for ${customer.name} - ${month}/${year} - Days 1 to ${lastDay}`);

    // Get customer's delivery schedule to understand their milk preferences
    const customerDeliverySchedule = customer.deliverySchedule || [];

    // If customer has no delivery schedule, create a default one
    if (customerDeliverySchedule.length === 0) {
        console.log(`No delivery schedule found for ${customer.name}, creating default schedule`);
        customerDeliverySchedule.push(
            {
                time: 'morning',
                milkItems: [
                    {
                        milkType: categories[0]?._id || '507f1f77bcf86cd799439011',
                        subcategory: subcategories[0]?._id || '507f1f77bcf86cd799439012',
                        quantity: 2,
                        pricePerUnit: 60,
                        totalPrice: 120
                    }
                ],
                totalQuantity: 2,
                totalPrice: 120
            },
            {
                time: 'evening',
                milkItems: [
                    {
                        milkType: categories[0]?._id || '507f1f77bcf86cd799439011',
                        subcategory: subcategories[0]?._id || '507f1f77bcf86cd799439012',
                        quantity: 1.5,
                        pricePerUnit: 60,
                        totalPrice: 90
                    }
                ],
                totalQuantity: 1.5,
                totalPrice: 90
            }
        );
    }

    // Loop through each day of the month (1 to lastDay)
    for (let day = 1; day <= lastDay; day++) {
        // Create date in UTC to avoid timezone issues
        const date = new Date(Date.UTC(year, month - 1, day));

        // Create delivery schedule for this day based on customer's preferences
        const dailyDeliverySchedule = [];
        let totalDailyQuantity = 0;
        let totalDailyPrice = 0;

        customerDeliverySchedule.forEach(delivery => {
            const dailyMilkItems = [];
            let deliveryTotalQuantity = 0;
            let deliveryTotalPrice = 0;

            delivery.milkItems.forEach(milkItem => {
                // Add some variation to quantities (±20%)
                const variation = 0.8 + (Math.random() * 0.4); // 0.8 to 1.2
                const dailyQuantity = Math.round(milkItem.quantity * variation * 10) / 10;
                const dailyTotalPrice = Math.round(dailyQuantity * milkItem.pricePerUnit * 100) / 100;

                dailyMilkItems.push({
                    milkType: milkItem.milkType,
                    subcategory: milkItem.subcategory,
                    quantity: dailyQuantity,
                    pricePerUnit: milkItem.pricePerUnit,
                    totalPrice: dailyTotalPrice
                });

                deliveryTotalQuantity += dailyQuantity;
                deliveryTotalPrice += dailyTotalPrice;
            });

            dailyDeliverySchedule.push({
                time: delivery.time,
                milkItems: dailyMilkItems,
                totalQuantity: deliveryTotalQuantity,
                totalPrice: deliveryTotalPrice
            });

            totalDailyQuantity += deliveryTotalQuantity;
            totalDailyPrice += deliveryTotalPrice;
        });

        records.push({
            customer: customer._id,
            date: date,
            deliverySchedule: dailyDeliverySchedule,
            totalDailyQuantity: Math.round(totalDailyQuantity * 100) / 100,
            totalDailyPrice: Math.round(totalDailyPrice * 100) / 100
        });
    }

    console.log(`Generated ${records.length} daily records for ${customer.name}`);
    return records;
};

/**
 * Create records for a customer and month
 */
const createRecordsForMonth = async (customer, year, month, categories, subcategories) => {
    console.log(`\n--- Creating records for ${customer.name} ---`);

    // Create start and end dates in UTC to avoid timezone issues
    const startDate = new Date(Date.UTC(year, month - 1, 1)); // First day of month
    const lastDay = getLastDayOfMonth(year, month);
    const endDate = new Date(Date.UTC(year, month - 1, lastDay)); // Last day of month

    console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

    // Check for existing records
    const existingRecords = await Record.find({
        customer: customer._id,
        date: {
            $gte: startDate,
            $lte: endDate
        }
    });

    if (existingRecords.length > 0) {
        console.log(`⚠️  Found ${existingRecords.length} existing records for ${customer.name} in ${month}/${year}. Skipping.`);
        return existingRecords.length;
    }

    // Generate daily records
    const records = await generateCustomerRecords(customer, year, month, categories, subcategories);

    // Calculate totals
    let totalQuantity = 0;
    let totalAmount = 0;

    records.forEach(record => {
        totalQuantity += record.totalDailyQuantity;
        totalAmount += record.totalDailyPrice;
    });

    console.log(`Total: ${Math.round(totalQuantity * 100) / 100}L = ₹${Math.round(totalAmount * 100) / 100}`);

    // Save records to database
    console.log('Saving records to database...');

    try {
        const savedRecords = await Record.insertMany(records);
        console.log(`✅ ${savedRecords.length} records saved for ${customer.name}`);
        return savedRecords.length;
    } catch (error) {
        console.error('❌ Error saving records:', error);
        throw error;
    }
};

/**
 * Main seeding function
 */
const seedRecords = async () => {
    try {
        console.log('🚀 Starting record seeding process...');

        // Get all active customers
        const customers = await Customer.find({ isActive: true });
        console.log(`📊 Found ${customers.length} active customers`);

        if (customers.length === 0) {
            console.log('❌ No active customers found. Please add customers first.');
            process.exit(0);
        }

        // Get categories and subcategories for milk types
        const categories = await Category.find({});
        const subcategories = await Subcategory.find({});

        console.log(`📊 Found ${categories.length} categories and ${subcategories.length} subcategories`);

        if (categories.length === 0) {
            console.log('⚠️  No categories found. Using default IDs.');
        }

        if (subcategories.length === 0) {
            console.log('⚠️  No subcategories found. Using default IDs.');
        }

        // List all customers
        console.log('Active customers:');
        customers.forEach(c => console.log(`- ${c.name} (Customer No: ${c.customerNo})`));

        // Define the months to generate data for
        const months = [
            { year: 2025, month: 3, name: 'March 2025' },
            { year: 2025, month: 4, name: 'April 2025' }
        ];

        let totalRecordsCreated = 0;

        // Process each month
        for (const period of months) {
            console.log(`\n📅 Processing ${period.name}...`);

            const startDate = new Date(Date.UTC(period.year, period.month - 1, 1));
            const lastDay = getLastDayOfMonth(period.year, period.month);
            const endDate = new Date(Date.UTC(period.year, period.month - 1, lastDay));

            console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

            // Check for existing records for this month
            const existingRecords = await Record.find({
                date: {
                    $gte: startDate,
                    $lte: endDate
                }
            });

            if (existingRecords.length > 0) {
                console.log(`⚠️  Found ${existingRecords.length} existing records for ${period.name}. Skipping this month.`);
                continue;
            }

            console.log(`✨ Generating records for ${period.name}...`);

            // Generate records for each customer
            let monthlyRecordsCreated = 0;

            for (const customer of customers) {
                try {
                    const recordsCreated = await createRecordsForMonth(
                        customer,
                        period.year,
                        period.month,
                        categories,
                        subcategories
                    );
                    monthlyRecordsCreated += recordsCreated;
                } catch (error) {
                    console.error(`❌ Failed to create records for ${customer.name}:`, error.message);
                }
            }

            console.log(`✅ Generated ${monthlyRecordsCreated} records for ${period.name}`);
            totalRecordsCreated += monthlyRecordsCreated;
        }

        console.log(`\n🎉 Record seeding completed successfully!`);
        console.log(`📈 Total records created: ${totalRecordsCreated}`);

        // Final verification
        const totalRecords = await Record.countDocuments({});
        console.log(`📊 Total records in database: ${totalRecords}`);

        mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error('💥 Error seeding records:', error);
        mongoose.connection.close();
        process.exit(1);
    }
};

// Run the seeding function
seedRecords();