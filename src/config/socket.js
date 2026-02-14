const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { getRedisClient } = require("./redis");
const { flushMessagesToDB } = require("../services/redisService");
const User = require("../models/User");

let io = null;
const onlineUsers = new Map();

const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select("-password");
      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      socket.userId = decoded.userId;
      socket.user = user;
      next();
    } catch (error) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    console.log(`User connected: ${userId}`);

    // Track online users
    onlineUsers.set(userId, socket.id);

    // Update user online status in Redis
    const redis = getRedisClient();
    await redis.hset("online_users", userId, socket.id);

    // Broadcast online status
    io.emit("user_online", { userId, online: true });

    // Send current online users to the connected user
    const allOnlineUsers = Array.from(onlineUsers.keys());
    socket.emit("online_users_list", allOnlineUsers);

    // Join user's personal room
    socket.join(`user_${userId}`);

    // Handle joining a conversation
    socket.on("join_conversation", (conversationId) => {
      socket.join(`conversation_${conversationId}`);
      console.log(`User ${userId} joined conversation ${conversationId}`);
    });

    // Handle leaving a conversation
    socket.on("leave_conversation", (conversationId) => {
      socket.leave(`conversation_${conversationId}`);
    });

    // Handle sending messages
    socket.on("send_message", async (data) => {
      try {
        const { conversationId, encryptedContent, iv, recipientId, messageId } =
          data;

        if (
          !conversationId ||
          !encryptedContent ||
          !iv ||
          !recipientId ||
          !messageId
        ) {
          socket.emit("message_error", { error: "Missing required fields" });
          return;
        }

        const messageData = {
          messageId,
          conversationId,
          senderId: userId,
          recipientId,
          encryptedContent,
          iv,
          timestamp: new Date().toISOString(),
          status: "sent",
        };

        // Store in Redis temporarily
        await redis.lpush(
          `messages:${conversationId}`,
          JSON.stringify(messageData),
        );
        await redis.expire(
          `messages:${conversationId}`,
          parseInt(process.env.REDIS_MESSAGE_TTL) || 300,
        );

        // Increment pending message count
        await redis.incr("pending_messages_count");

        // Emit to conversation room
        io.to(`conversation_${conversationId}`).emit(
          "new_message",
          messageData,
        );

        // Send notification to recipient if they're not in the conversation
        const recipientSocketId = onlineUsers.get(recipientId);
        if (recipientSocketId) {
          io.to(`user_${recipientId}`).emit("message_notification", {
            conversationId,
            senderId: userId,
            senderName: socket.user.username,
            timestamp: messageData.timestamp,
          });
        }

        // Confirm message sent
        socket.emit("message_sent", {
          messageId,
          timestamp: messageData.timestamp,
        });
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("message_error", { error: "Failed to send message" });
      }
    });

    // Handle typing indicator
    socket.on("typing_start", ({ conversationId }) => {
      socket.to(`conversation_${conversationId}`).emit("user_typing", {
        userId,
        username: socket.user.username,
        conversationId,
      });
    });

    socket.on("typing_stop", ({ conversationId }) => {
      socket.to(`conversation_${conversationId}`).emit("user_stopped_typing", {
        userId,
        conversationId,
      });
    });

    // Handle message read status
    socket.on("messages_read", ({ conversationId, messageIds }) => {
      socket.to(`conversation_${conversationId}`).emit("messages_marked_read", {
        conversationId,
        messageIds,
        readBy: userId,
      });
    });

    // Handle key exchange for E2E encryption
    socket.on("key_exchange", ({ recipientId, publicKey }) => {
      const recipientSocketId = onlineUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("key_exchange", {
          senderId: userId,
          publicKey,
        });
      }
    });

    // Handle disconnect
    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${userId}`);
      onlineUsers.delete(userId);
      await redis.hdel("online_users", userId);
      io.emit("user_online", { userId, online: false });
    });
  });

  // Periodic flush from Redis to MongoDB
  const flushInterval = setInterval(
    async () => {
      try {
        await flushMessagesToDB();
      } catch (error) {
        console.error("Error flushing messages to DB:", error);
      }
    },
    parseInt(process.env.REDIS_FLUSH_INTERVAL) || 30000,
  );

  // Cleanup on server close
  process.on("SIGTERM", () => clearInterval(flushInterval));
  process.on("SIGINT", () => clearInterval(flushInterval));

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};

const getOnlineUsers = () => onlineUsers;

module.exports = { initializeSocket, getIO, getOnlineUsers };
