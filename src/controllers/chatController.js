const Message = require("../models/Message");
const Conversation = require("../models/Conversation");
const { getRedisClient } = require("../config/redis");

exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Verify user is part of the conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.userId,
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // First, check Redis for recent messages
    const redis = getRedisClient();
    const redisMessages = await redis.lrange(
      `messages:${conversationId}`,
      0,
      -1,
    );
    const pendingMessages = redisMessages.map((msg) => JSON.parse(msg));

    // Get messages from MongoDB
    const dbMessages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Merge and deduplicate
    const allMessageIds = new Set();
    const allMessages = [];

    // Add pending messages first (most recent)
    for (const msg of pendingMessages) {
      if (!allMessageIds.has(msg.messageId)) {
        allMessageIds.add(msg.messageId);
        allMessages.push(msg);
      }
    }

    // Add DB messages
    for (const msg of dbMessages) {
      if (!allMessageIds.has(msg.messageId)) {
        allMessageIds.add(msg.messageId);
        allMessages.push(msg);
      }
    }

    // Sort by timestamp
    allMessages.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.createdAt);
      const timeB = new Date(b.timestamp || b.createdAt);
      return timeA - timeB;
    });

    const totalCount = await Message.countDocuments({ conversationId });

    res.json({
      success: true,
      data: {
        messages: allMessages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount + pendingMessages.length,
          pages: Math.ceil(totalCount / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get messages.",
    });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { messageIds } = req.body;

    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({
        success: false,
        message: "Message IDs are required.",
      });
    }

    await Message.updateMany(
      {
        messageId: { $in: messageIds },
        recipientId: req.userId,
      },
      {
        status: "read",
        readAt: new Date(),
      },
    );

    // Reset unread count
    await Conversation.findByIdAndUpdate(conversationId, {
      [`unreadCount.${req.userId}`]: 0,
    });

    res.json({
      success: true,
      message: "Messages marked as read.",
    });
  } catch (error) {
    console.error("Mark as read error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark messages as read.",
    });
  }
};
