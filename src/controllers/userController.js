const User = require("../models/User");

exports.searchUsers = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters.",
      });
    }

    const users = await User.find({
      _id: { $ne: req.userId },
      $or: [
        { username: { $regex: q.trim(), $options: "i" } },
        { email: { $regex: q.trim(), $options: "i" } },
      ],
    })
      .select("username email avatar isOnline lastSeen publicKey")
      .limit(20)
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
    const { id } = req.params;

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
