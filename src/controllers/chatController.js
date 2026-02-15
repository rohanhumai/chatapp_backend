// Message model (MongoDB me stored permanent messages)
const Message = require("../models/Message");

// Conversation model (participants aur unread count track karta hai)
const Conversation = require("../models/Conversation");

// Redis client getter
const { getRedisClient } = require("../config/redis");

exports.getMessages = async (req, res) => {
  try {
    // route params se conversationId
    const { conversationId } = req.params;

    // query params se pagination (default values set)
    const { page = 1, limit = 50 } = req.query;

    // skip calculate kar rahe hain pagination ke liye
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // conversation fetch kar rahe hain
    const conversation = await Conversation.findById(conversationId);

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found.",
      });
    }

    // check kar rahe hain user participant hai ya nahi
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === req.userId,
    );

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: "Access denied.",
      });
    }

    // Redis client le rahe hain
    const redis = getRedisClient();

    // Redis se recent (pending) messages fetch
    const redisMessages = await redis.lrange(
      `messages:${conversationId}`,
      0,
      -1,
    );

    // JSON parse karke usable objects bana rahe hain
    const pendingMessages = redisMessages.map((msg) => JSON.parse(msg));

    // MongoDB se permanent messages fetch
    const dbMessages = await Message.find({ conversationId })
      .sort({ createdAt: -1 }) // latest first
      .skip(skip)
      .limit(parseInt(limit))
      .lean(); // plain JS object (faster)

    // deduplication ke liye Set
    const allMessageIds = new Set();

    const allMessages = [];

    // pehle pending (Redis) messages add
    for (const msg of pendingMessages) {
      if (!allMessageIds.has(msg.messageId)) {
        allMessageIds.add(msg.messageId);
        allMessages.push(msg);
      }
    }

    // phir DB messages add
    for (const msg of dbMessages) {
      if (!allMessageIds.has(msg.messageId)) {
        allMessageIds.add(msg.messageId);
        allMessages.push(msg);
      }
    }

    // final sorting chronological order me
    allMessages.sort((a, b) => {
      const timeA = new Date(a.timestamp || a.createdAt);

      const timeB = new Date(b.timestamp || b.createdAt);

      return timeA - timeB; // oldest → newest
    });

    // total permanent message count
    const totalCount = await Message.countDocuments({
      conversationId,
    });

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

    // validation
    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({
        success: false,
        message: "Message IDs are required.",
      });
    }

    // MongoDB me status update
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

    // unread count reset kar rahe hain
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
