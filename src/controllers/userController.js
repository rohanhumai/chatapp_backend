// User model import
const User = require("../models/User");

exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;

    // basic validation (minimum 2 characters required)
    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters.",
      });
    }

    // MongoDB query:
    const users = await User.find({
      // current user ko exclude kar rahe hain
      _id: { $ne: req.userId },

      // username ya email me case-insensitive regex match
      $or: [
        { username: { $regex: q.trim(), $options: "i" } },
        { email: { $regex: q.trim(), $options: "i" } },
      ],
    })
      // sirf required fields select kar rahe hain (sensitive data avoid)
      .select("username email avatar isOnline lastSeen publicKey")

      // max 20 results (basic rate control)
      .limit(20)

      // plain JS object (performance optimized)
      .lean();

    res.json({
      success: true,
      data: { users },
    });
  } catch (error) {
    console.error("Search users error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to search users.",
    });
  }
};

exports.getUserProfile = async (req, res) => {
  try {
    // URL params se user id le rahe hain
    const { id } = req.params;

    // user fetch kar rahe hain selected fields ke saath
    const user = await User.findById(id)
      .select("username email avatar isOnline lastSeen publicKey")
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error("Get user profile error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get user profile.",
    });
  }
};

exports.getPublicKey = async (req, res) => {
  try {
    const { id } = req.params;

    // sirf publicKey aur username fetch kar rahe hain
    const user = await User.findById(id).select("publicKey username").lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    res.json({
      success: true,
      data: {
        userId: user._id,
        username: user.username,
        publicKey: user.publicKey,
      },
    });
  } catch (error) {
    console.error("Get public key error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get public key.",
    });
  }
};
