const { getRedisClient } = require("../config/redis");
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");

const flushMessagesToDB = async () => {
  const redis = getRedisClient();

  try {
    const pendingCount = await redis.get("pending_messages_count");
    if (!pendingCount || parseInt(pendingCount) === 0) {
      return;
    }

    // Get all conversation keys with pending messages
    const keys = await redis.keys("messages:*");

    if (keys.length === 0) {
      await redis.set("pending_messages_count", 0);
      return;
    }

    let totalFlushed = 0;

    for (const key of keys) {
      const conversationId = key.split(":")[1];
      const messages = await redis.lrange(key, 0, -1);

      if (messages.length === 0) continue;

      const parsedMessages = messages.map((msg) => JSON.parse(msg));

      // Batch insert to MongoDB
      const bulkOps = parsedMessages.map((msg) => ({
        updateOne: {
          filter: { messageId: msg.messageId },
          update: {
            $setOnInsert: {
              messageId: msg.messageId,
              conversationId: msg.conversationId,
              senderId: msg.senderId,
              recipientId: msg.recipientId,
              encryptedContent: msg.encryptedContent,
              iv: msg.iv,
              status: msg.status || "sent",
              createdAt: new Date(msg.timestamp),
            },
          },
          upsert: true,
        },
      }));

      if (bulkOps.length > 0) {
        await Message.bulkWrite(bulkOps, { ordered: false });
        totalFlushed += bulkOps.length;
      }

      // Update last message in conversation
      const lastMsg = parsedMessages[0];
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: {
          encryptedContent: lastMsg.encryptedContent,
          iv: lastMsg.iv,
          senderId: lastMsg.senderId,
          timestamp: new Date(lastMsg.timestamp),
        },
        updatedAt: new Date(),
      });

      // Clear flushed messages from Redis
      await redis.del(key);
    }

    // Reset pending count
    await redis.set("pending_messages_count", 0);

    if (totalFlushed > 0) {
      console.log(`📦 Flushed ${totalFlushed} messages from Redis to MongoDB`);
    }
  } catch (error) {
    console.error("Error flushing messages to DB:", error);
    throw error;
  }
};

module.exports = { flushMessagesToDB };
