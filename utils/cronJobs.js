import cron from 'node-cron';
import axios from 'axios';

// Function to create daily records
const createDailyRecords = async () => {
  try {
    // Get the admin token from environment variable or config
    const adminToken = process.env.ADMIN_TOKEN;

    // Make API call to create daily records
    const response = await axios.post(
      `${process.env.BASE_URL}/api/records/daily`,
      {},
      {
        headers: {
          Authorization: `Bearer ${adminToken}`
        }
      }
    );

    console.log('Daily records created successfully:');
  } catch (error) {
    console.error('Error creating daily records:', error.message);
  }
};

// Schedule the cron job to run at 11:59 PM every day
const scheduleDailyRecords = () => {
  // // For testing: Run every minute
  //cron.schedule('* * * * *', () => {
  //  createDailyRecords();
 //});

  // Production schedule (commented out for testing)
   cron.schedule('59 23 * * *', () => {
     console.log('Running daily records creation...');
     createDailyRecords();
   });
};

export default scheduleDailyRecords; 
