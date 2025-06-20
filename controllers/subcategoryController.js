import Subcategory from '../models/Subcategory.js';
import Category from '../models/Category.js';

// @desc    Get all subcategories
// @route   GET /api/subcategories
// @access  Public
const getSubcategories = async (req, res) => {
  try {
    const categoryId = req.query.category;
    
    const filter = categoryId ? { category: categoryId } : {};
    
    const subcategories = await Subcategory.find(filter)
      .populate('category', 'name')
      .sort({ name: 1 });
      
    res.json(subcategories);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get a subcategory by ID
// @route   GET /api/subcategories/:id
// @access  Public
const getSubcategoryById = async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id)
      .populate('category', 'name');
    
    if (subcategory) {
      res.json(subcategory);
    } else {
      res.status(404).json({ message: 'Subcategory not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Create a new subcategory
// @route   POST /api/subcategories
// @access  Private/Admin
const createSubcategory = async (req, res) => {
  try {
    const { name, category, price, description, isActive } = req.body;
    
    // Check if category exists
    const categoryExists = await Category.findById(category);
    
    if (!categoryExists) {
      return res.status(400).json({ message: 'Invalid category - category does not exist' });
    }
    
    // Check if subcategory name already exists in this category
    const subcategoryExists = await Subcategory.findOne({ name, category });
    
    if (subcategoryExists) {
      return res.status(400).json({ message: 'Subcategory already exists in this category' });
    }
    
    const subcategory = await Subcategory.create({
      name,
      category,
      price,
      description,
      isActive,
    });
    
    if (subcategory) {
      res.status(201).json(await subcategory.populate('category', 'name'));
    } else {
      res.status(400).json({ message: 'Invalid subcategory data' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update a subcategory
// @route   PUT /api/subcategories/:id
// @access  Private/Admin
const updateSubcategory = async (req, res) => {
  try {
    const { name, category, price, description, isActive } = req.body;
    
    const subcategory = await Subcategory.findById(req.params.id);
    
    if (subcategory) {
      // If category is changing, check if it exists
      if (category && category !== subcategory.category.toString()) {
        const categoryExists = await Category.findById(category);
        
        if (!categoryExists) {
          return res.status(400).json({ message: 'Invalid category - category does not exist' });
        }
      }
      
      // If name or category is changing, check if the combination already exists
      if ((name && name !== subcategory.name) || (category && category !== subcategory.category.toString())) {
        const nameExists = await Subcategory.findOne({ 
          name: name || subcategory.name, 
          category: category || subcategory.category 
        });
        
        if (nameExists && nameExists._id.toString() !== req.params.id) {
          return res.status(400).json({ message: 'Subcategory name already exists in this category' });
        }
      }
      
      subcategory.name = name || subcategory.name;
      subcategory.category = category || subcategory.category;
      subcategory.price = price !== undefined ? price : subcategory.price;
      subcategory.description = description !== undefined ? description : subcategory.description;
      subcategory.isActive = isActive !== undefined ? isActive : subcategory.isActive;
      
      const updatedSubcategory = await subcategory.save();
      res.json(await updatedSubcategory.populate('category', 'name'));
    } else {
      res.status(404).json({ message: 'Subcategory not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete a subcategory
// @route   DELETE /api/subcategories/:id
// @access  Private/Admin
const deleteSubcategory = async (req, res) => {
  try {
    const subcategory = await Subcategory.findById(req.params.id);
    
    if (subcategory) {
      await Subcategory.deleteOne({ _id: req.params.id });
      res.json({ message: 'Subcategory removed' });
    } else {
      res.status(404).json({ message: 'Subcategory not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

export { 
  getSubcategories, 
  getSubcategoryById, 
  createSubcategory, 
  updateSubcategory, 
  deleteSubcategory 
};