import Category from "../models/Category.js";
import Subcategory from "../models/Subcategory.js";

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
const getCategories = async (req, res) => {
  try {
    const categories = await Category.find({}).sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get a category by ID
// @route   GET /api/categories/:id
// @access  Public
const getCategoryById = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (category) {
      res.json(category);
    } else {
      res.status(404).json({ message: "Category not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Create a new category
// @route   POST /api/categories
// @access  Private/Admin
const createCategory = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;

    // Check if category already exists
    const categoryExists = await Category.findOne({ name });

    if (categoryExists) {
      return res.status(400).json({ message: "Category already exists" });
    }

    const category = await Category.create({
      name,
      description,
      isActive,
    });

    if (category) {
      res.status(201).json(category);
    } else {
      res.status(400).json({ message: "Invalid category data" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = async (req, res) => {
  try {
    const { name, description, isActive } = req.body;

    const category = await Category.findById(req.params.id);

    if (category) {
      // Check if new name already exists (and it's not the current category)
      if (name && name !== category.name) {
        const nameExists = await Category.findOne({ name });
        if (nameExists) {
          return res
            .status(400)
            .json({ message: "Category name already exists" });
        }
      }

      category.name = name || category.name;
      category.description =
        description !== undefined ? description : category.description;
      category.isActive = isActive !== undefined ? isActive : category.isActive;

      const updatedCategory = await category.save();
      res.json(updatedCategory);
    } else {
      res.status(404).json({ message: "Category not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (category) {
      // Check if category has subcategories
      const subcategoriesCount = await Subcategory.countDocuments({
        category: req.params.id,
      });

      if (subcategoriesCount > 0) {
        return res.json({
          status: false,
          message:
            "Cannot delete category with subcategories. Delete subcategories first or update them to a different category.",
        });
      }

      await Category.deleteOne({ _id: req.params.id });
      res.json({ status: true, message: "Category removed" });
    } else {
      res.status(404).json({ message: "Category not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get all subcategories for a category
// @route   GET /api/categories/:id/subcategories
// @access  Public
const getCategoryWithSubcategories = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const subcategories = await Subcategory.find({ category: req.params.id });

    res.json({
      ...category.toObject(),
      subcategories,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

export {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryWithSubcategories,
};
