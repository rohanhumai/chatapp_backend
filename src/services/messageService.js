const Message = require("../models/Message");
const Conversation = require("../models/Conversation");

class MessageService {
  static async getMessageHistory(conversationId, page = 1, limit = 50) {
    const skip = (page - 1) * limit;

    const messages = await Message.find({ conversationId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Message.countDocuments({ conversationId });

    return {
      messages: messages.reverse(),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  static async updateMessageStatus(messageIds, status) {
    await Message.updateMany(
      { messageId: { $in: messageIds } },
      { status, ...(status === "read" ? { readAt: new Date() } : {}) },
    );
  }
}

module.exports = MessageService;
