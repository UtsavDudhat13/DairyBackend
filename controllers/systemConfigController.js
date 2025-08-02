import SystemConfig from '../models/SystemConfig.js';

// Create a wrapper to handle errors in async functions
const tryCatch = (controller) => async (req, res, next) => {
    try {
        await controller(req, res);
    } catch (error) {
        res.status(error.statusCode || 500).json({
            message: error.message || "Server Error",
        });
    }
};

// @desc    Get system configuration
// @route   GET /api/config
// @access  Private/Admin
const getSystemConfig = tryCatch(async (req, res) => {
    let config = await SystemConfig.findOne();

    // If no config exists, create default one
    if (!config) {
        config = await SystemConfig.create({
            morningTime: "06:00",
            eveningTime: "18:00",
            milkmen: [],
            companyName: "Ramdev Dairy Farm"
        });
    }

    res.json(config);
});

// @desc    Update system configuration
// @route   PUT /api/config
// @access  Private/Admin
const updateSystemConfig = tryCatch(async (req, res) => {
    const { morningTime, eveningTime, companyName, contactEmail, address } = req.body;

    let config = await SystemConfig.findOne();

    if (!config) {
        // Create new config if doesn't exist
        config = await SystemConfig.create({
            morningTime: morningTime || "06:00",
            eveningTime: eveningTime || "18:00",
            companyName: companyName || "Ramdev Dairy Farm",
            contactEmail: contactEmail || "info@ramdevdairy.com",
            address: address || "",
            milkmen: []
        });
    } else {
        // Update existing config
        config.morningTime = morningTime || config.morningTime;
        config.eveningTime = eveningTime || config.eveningTime;
        config.companyName = companyName || config.companyName;
        config.contactEmail = contactEmail || config.contactEmail;
        config.address = address || config.address;

        await config.save();
    }

    res.json({
        success: true,
        message: 'System configuration updated successfully',
        config
    });
});

// @desc    Add milkman to configuration
// @route   POST /api/config/milkman
// @access  Private/Admin
const addMilkman = tryCatch(async (req, res) => {
    const { name, phoneNumber } = req.body;

    if (!name || !phoneNumber) {
        return res.status(400).json({
            message: 'Name and phone number are required'
        });
    }

    let config = await SystemConfig.findOne();

    if (!config) {
        config = await SystemConfig.create({
            morningTime: "06:00",
            eveningTime: "18:00",
            milkmen: [{ name, phoneNumber }],
            companyName: "Ramdev Dairy Farm"
        });
    } else {
        // Check if milkman with same phone number already exists
        const existingMilkman = config.milkmen.find(
            milkman => milkman.phoneNumber === phoneNumber
        );

        if (existingMilkman) {
            return res.status(400).json({
                message: 'Milkman with this phone number already exists'
            });
        }

        config.milkmen.push({ name, phoneNumber });
        await config.save();
    }

    res.json({
        success: true,
        message: 'Milkman added successfully',
        config
    });
});

// @desc    Update milkman
// @route   PUT /api/config/milkman/:id
// @access  Private/Admin
const updateMilkman = tryCatch(async (req, res) => {
    const { id } = req.params;
    const { name, phoneNumber, isActive } = req.body;

    const config = await SystemConfig.findOne();

    if (!config) {
        return res.status(404).json({
            message: 'System configuration not found'
        });
    }

    const milkman = config.milkmen.id(id);

    if (!milkman) {
        return res.status(404).json({
            message: 'Milkman not found'
        });
    }

    // Check if phone number is being changed and if it conflicts
    if (phoneNumber && phoneNumber !== milkman.phoneNumber) {
        const existingMilkman = config.milkmen.find(
            m => m.phoneNumber === phoneNumber && m._id.toString() !== id
        );

        if (existingMilkman) {
            return res.status(400).json({
                message: 'Phone number already exists for another milkman'
            });
        }
    }

    milkman.name = name || milkman.name;
    milkman.phoneNumber = phoneNumber || milkman.phoneNumber;
    milkman.isActive = isActive !== undefined ? isActive : milkman.isActive;

    await config.save();

    res.json({
        success: true,
        message: 'Milkman updated successfully',
        config
    });
});

// @desc    Delete milkman
// @route   DELETE /api/config/milkman/:id
// @access  Private/Admin
const deleteMilkman = tryCatch(async (req, res) => {
    const { id } = req.params;

    const config = await SystemConfig.findOne();

    if (!config) {
        return res.status(404).json({
            message: 'System configuration not found'
        });
    }

    const milkman = config.milkmen.id(id);

    if (!milkman) {
        return res.status(404).json({
            message: 'Milkman not found'
        });
    }

    milkman.deleteOne();
    await config.save();

    res.json({
        success: true,
        message: 'Milkman deleted successfully',
        config
    });
});

// @desc    Get active milkmen
// @route   GET /api/config/milkmen
// @access  Private/Admin
const getActiveMilkmen = tryCatch(async (req, res) => {
    const config = await SystemConfig.findOne();

    if (!config) {
        return res.json({ milkmen: [] });
    }

    const activeMilkmen = config.milkmen.filter(milkman => milkman.isActive);

    res.json({
        milkmen: activeMilkmen,
        total: activeMilkmen.length
    });
});

export {
    getSystemConfig,
    updateSystemConfig,
    addMilkman,
    updateMilkman,
    deleteMilkman,
    getActiveMilkmen
};
