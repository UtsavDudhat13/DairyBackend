// Node.js script to seed 400 customers using Mongoose
// Run with Node.js: node seedCustomers.js

import mongoose from "mongoose";
import dotenv from "dotenv";
import Category from "./models/Category.js";
import Subcategory from "./models/Subcategory.js";
import Customer from "./models/customerModel.js";

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI || "mongodb://localhost:27017/milk-system")
  .then(() => {
    console.log("MongoDB Connected");
    seedCustomers();
  })
  .catch((err) => {
    console.error("Error connecting to MongoDB:", err);
    process.exit(1);
  });

// Helper functions
function getRandomItem(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomQuantity() {
  return Math.random() < 0.2
    ? 0
    : parseFloat((Math.random() * 2 + 0.5).toFixed(1));
}

function generatePhoneNumber() {
  const firstDigit = Math.floor(Math.random() * 4) + 6;
  let number = firstDigit.toString();
  for (let i = 0; i < 9; i++) {
    number += Math.floor(Math.random() * 10);
  }
  return number;
}

// Names and location data
const firstNames = [
  "Aarav",
  "Vivaan",
  "Aditya",
  "Vihaan",
  "Arjun",
  "Reyansh",
  "Ayaan",
  "Atharva",
  "Krishna",
  "Ishaan",
  "Shaurya",
  "Advik",
  "Rudra",
  "Pranav",
  "Advaith",
  "Aaryan",
  "Dhruv",
  "Kabir",
  "Ananya",
  "Diya",
  "Myra",
  "Sara",
  "Pari",
  "Anika",
  "Aadhya",
  "Aarohi",
  "Anvi",
  "Kiara",
  "Saanvi",
  "Siya",
  "Isha",
  "Neha",
  "Priya",
  "Amit",
  "Rahul",
  "Vikas",
  "Sunil",
  "Rajesh",
  "Sanjay",
  "Vijay",
  "Ajay",
  "Ravi",
  "Deepak",
  "Manoj",
  "Arun",
  "Mahesh",
  "Sachin",
  "Ramesh",
  "Dinesh",
  "Pankaj",
  "Sanjay",
  "Suman",
];

const lastNames = [
  "Sharma",
  "Verma",
  "Patel",
  "Gupta",
  "Singh",
  "Kumar",
  "Jain",
  "Shah",
  "Rao",
  "Reddy",
  "Chauhan",
  "Yadav",
  "Mehta",
  "Nair",
  "Iyer",
  "Trivedi",
  "Desai",
  "Patil",
  "Agarwal",
  "Pillai",
  "Deshpande",
  "Chowdhury",
  "Chatterjee",
  "Banerjee",
  "Roy",
  "Kapoor",
  "Sinha",
  "Das",
  "Dubey",
  "Pandey",
  "Malhotra",
];

const cities = [
  "Surat",
  "Ahmedabad",
  "Vadodara",
  "Rajkot",
  "Bhavnagar",
  "Jamnagar",
  "Junagadh",
  "Gandhinagar",
];
const areas = [
  "Adajan",
  "Piplod",
  "Vesu",
  "City Light",
  "Athwa",
  "Katargam",
  "Varachha",
  "Nanpura",
  "Rander",
  "Bhatar",
];
const streets = [
  "Main Street",
  "Gandhi Road",
  "Nehru Street",
  "Ambedkar Road",
  "Sardar Patel Marg",
  "Subhash Road",
  "Station Road",
];

function generateAddress() {
  const houseNumber = Math.floor(Math.random() * 500) + 1;
  const street = getRandomItem(streets);
  const area = getRandomItem(areas);
  const city = getRandomItem(cities);
  const pincode = Math.floor(Math.random() * 10000) + 380000;

  return `${houseNumber}, ${street}, ${area}, ${city} - ${pincode}, Gujarat`;
}

async function seedCustomers() {
  try {
    // Get categories and subcategories from database
    const categories = await Category.find();
    const subcategories = await Subcategory.find();

    if (categories.length === 0 || subcategories.length === 0) {
      console.error(
        "No categories or subcategories found in the database. Please ensure you have added categories and subcategories first."
      );
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(
      `Found ${categories.length} categories and ${subcategories.length} subcategories`
    );

    // Get last customer number
    const lastCustomer = await Customer.findOne().sort({ customerNo: -1 });
    let lastCustomerNo = lastCustomer ? lastCustomer.customerNo : 0;

    console.log(`Starting to seed customers from #${lastCustomerNo + 1}`);

    // Create customers in batches
    const batchSize = 50;
    const totalCustomers = 400;

    for (
      let batchIndex = 0;
      batchIndex < totalCustomers / batchSize;
      batchIndex++
    ) {
      const customerBatch = [];

      for (let i = 0; i < batchSize; i++) {
        const category = getRandomItem(categories);

        // Make sure the category exists and has an _id
        if (!category || !category._id) {
          console.error("Invalid category found. Skipping this customer.");
          continue;
        }

        // Filter subcategories by category ID
        let validSubcategories = subcategories.filter(
          (sub) =>
            sub.category && sub.category.toString() === category._id.toString()
        );

        // If no valid subcategories were found, use any subcategory
        if (validSubcategories.length === 0) {
          console.warn(
            `No subcategories found for category ${category.name}. Using random subcategory instead.`
          );
          validSubcategories = subcategories;
        }

        const subcategory = getRandomItem(validSubcategories);

        // Make sure the subcategory exists and has an _id
        if (!subcategory || !subcategory._id) {
          console.error("Invalid subcategory found. Skipping this customer.");
          continue;
        }

        const firstName = getRandomItem(firstNames);
        const lastName = getRandomItem(lastNames);
        const name = `${firstName} ${lastName}`;

        const phoneNo = generatePhoneNumber();
        const morningQuantity = getRandomQuantity();
        const eveningQuantity = getRandomQuantity();
        const isActive = Math.random() < 0.95;

        customerBatch.push({
          name: name,
          phoneNo: phoneNo,
          address: generateAddress(),
          milkType: category._id,
          subcategory: subcategory._id,
          morningQuantity: morningQuantity,
          eveningQuantity: eveningQuantity,
          price: subcategory.price || 0, // Default to 0 if price is missing
          username: phoneNo,
          password: phoneNo, // This will be hashed by the pre-save hook
          isActive: isActive,
        });
      }

      if (customerBatch.length === 0) {
        console.warn("No customers to insert in this batch. Skipping.");
        continue;
      }

      // Save batch to database
      try {
        await Customer.insertMany(customerBatch);
        console.log(
          `Inserted batch ${batchIndex + 1} of ${Math.ceil(
            totalCustomers / batchSize
          )}`
        );
      } catch (insertError) {
        console.error("Error inserting customer batch:", insertError);
      }
    }

    console.log(`Seeding completed!`);
    const count = await Customer.countDocuments();
    console.log(`Current customer count: ${count}`);

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log("MongoDB disconnected");
  } catch (error) {
    console.error("Error seeding customers:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}
