// Conversation model (participants, unread count etc.)
const Conversation = require("../models/Conversation");

// User model (recipient verify karne ke liye)
const User = require("../models/User");

exports.getConversations = async (req, res) => {
  try {
    // saare conversations fetch kar rahe hain jahan current user participant hai
    const conversations = await Conversation.find({
      participants: req.userId, // MongoDB array match
    })
      // participants ko populate kar rahe hain taaki user details mil sake
      .populate(
        "participants",
        "username email avatar isOnline lastSeen publicKey",
      )
      // latest updated conversation sabse upar
      .sort({ updatedAt: -1 })
      // plain JS object return karega (performance boost)
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

    // validation
    if (!recipientId) {
      return res.status(400).json({
        success: false,
        message: "Recipient ID is required.",
      });
    }

    // khud se conversation create nahi kar sakte
    if (recipientId === req.userId) {
      return res.status(400).json({
        success: false,
        message: "Cannot create conversation with yourself.",
      });
    }

    // recipient existence check
    const recipient = await User.findById(recipientId);

    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: "Recipient not found.",
      });
    }

    // findOrCreate custom static method hoga model me
    // agar pehle se conversation exist karta hai to wahi return karega
    // warna naya create karega
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

    // conversation fetch kar rahe hain aur participants populate kar rahe hain
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

    // check kar rahe hain ki current user participant hai ya nahi
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
