import mongoose from 'mongoose';

const milkmanSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const systemConfigSchema = new mongoose.Schema({
    morningTime: {
        type: String,
        required: true,
        default: "06:00"
    },
    eveningTime: {
        type: String,
        required: true,
        default: "18:00"
    },
    milkmen: [milkmanSchema],
    companyName: {
        type: String,
        default: "Ramdev Dairy Farm"
    },
    contactEmail: {
        type: String,
        default: "info@ramdevdairy.com"
    },
    address: {
        type: String,
        default: ""
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Ensure only one config document exists
systemConfigSchema.index({}, { unique: true });

const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

export default SystemConfig;
