const Conversation = require("../models/Conversation");
const User = require("../models/User");

exports.getConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      participants: req.userId,
    })
      .populate(
        "participants",
        "username email avatar isOnline lastSeen publicKey",
      )
      .sort({ updatedAt: -1 })
      .lean();

    res.json({
      success: true,
      data: { conversations },
    });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get conversations.",
    });
  }
};

exports.createConversation = async (req, res) => {
  try {
    const { recipientId } = req.body;

    if (!recipientId) {
      return res.status(400).json({
        success: false,
        message: "Recipient ID is required.",
      });
    }

    if (recipientId === req.userId) {
      return res.status(400).json({
        success: false,
        message: "Cannot create conversation with yourself.",
      });
    }

    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: "Recipient not found.",
      });
    }

    const conversation = await Conversation.findOrCreate(
      req.userId,
      recipientId,
    );

    res.status(201).json({
      success: true,
      data: { conversation },
    });
  } catch (error) {
    console.error("Create conversation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create conversation.",
    });
  }
};

exports.getConversation = async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await Conversation.findById(id).populate(
      "participants",
      "username email avatar isOnline lastSeen publicKey",
    );

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    const isParticipant = conversation.participants.some(
      (p) => p._id.toString() === req.userId,
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    res.json({
      success: true,
      data: { conversation },
    });
  } catch (error) {
    console.error("Get conversation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get conversation.",
    });
  }
};
