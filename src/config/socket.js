// socket.io Server class import kar rahe hain
const { Server } = require("socket.io");

// JWT token verify karne ke liye jsonwebtoken import
const jwt = require("jsonwebtoken");

// Redis client getter function import
const { getRedisClient } = require("./redis");

// Redis me temporarily stored messages ko MongoDB me flush karne wala service
const { flushMessagesToDB } = require("../services/redisService");

// User model MongoDB se user fetch karne ke liye
const User = require("../models/User");

// io instance initially null (later initialize hoga)
let io = null;

// online users track karne ke liye Map (userId -> socketId)
const onlineUsers = new Map();

// function jo socket server initialize karega
const initializeSocket = (server) => {
  // new Socket.io server create kar rahe hain existing HTTP server ke upar
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL, // frontend URL allow kar rahe hain
      methods: ["GET", "POST"], // allowed HTTP methods
      credentials: true, // cookies/auth allow karega
    },
    pingTimeout: 60000, // agar 60 sec tak client response nahi kare to disconnect
    pingInterval: 25000, // har 25 sec me ping bhejega
    transports: ["websocket", "polling"], // fallback mechanism
  });

  // Authentication middleware (har connection pe chalega)
  io.use(async (socket, next) => {
    try {
      // client se auth token receive kar rahe hain
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error("Authentication error: No token provided"));
      }

      // JWT verify kar rahe hain
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // user database se fetch kar rahe hain (password exclude karte hue)
      const user = await User.findById(decoded.userId).select("-password");

      if (!user) {
        return next(new Error("Authentication error: User not found"));
      }

      // socket object me user info attach kar rahe hain
      socket.userId = decoded.userId;
      socket.user = user;

      next(); // authentication successful
    } catch (error) {
      next(new Error("Authentication error: Invalid token"));
    }
  });

  // jab koi client connect karta hai
  io.on("connection", async (socket) => {
    const userId = socket.userId;
    console.log(`User connected: ${userId}`);

    // online user map me add kar rahe hain
    onlineUsers.set(userId, socket.id);

    // Redis client le rahe hain
    const redis = getRedisClient();

    // Redis hash me online status store kar rahe hain
    await redis.hset("online_users", userId, socket.id);

    // sabko broadcast kar rahe hain ki user online hai
    io.emit("user_online", { userId, online: true });

    // naye connected user ko currently online users bhej rahe hain
    const allOnlineUsers = Array.from(onlineUsers.keys());
    socket.emit("online_users_list", allOnlineUsers);

    // user ka personal room create/join karwa rahe hain
    socket.join(`user_${userId}`);

    // conversation join handler
    socket.on("join_conversation", (conversationId) => {
      socket.join(`conversation_${conversationId}`);
      console.log(`User ${userId} joined conversation ${conversationId}`);
    });

    // conversation leave handler
    socket.on("leave_conversation", (conversationId) => {
      socket.leave(`conversation_${conversationId}`);
    });

    // message send handler
    socket.on("send_message", async (data) => {
      try {
        const { conversationId, encryptedContent, iv, recipientId, messageId } =
          data;

        // required fields validation
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

        // message object create kar rahe hain
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

        // Redis list me message temporarily store kar rahe hain
        await redis.lpush(
          `messages:${conversationId}`,
          JSON.stringify(messageData),
        );

        // TTL set kar rahe hain taaki Redis memory leak na kare
        await redis.expire(
          `messages:${conversationId}`,
          parseInt(process.env.REDIS_MESSAGE_TTL) || 300,
        );

        // pending messages counter increment
        await redis.incr("pending_messages_count");

        // conversation room me message broadcast
        io.to(`conversation_${conversationId}`).emit(
          "new_message",
          messageData,
        );

        // agar recipient online hai to notification bhejo
        const recipientSocketId = onlineUsers.get(recipientId);
        if (recipientSocketId) {
          io.to(`user_${recipientId}`).emit("message_notification", {
            conversationId,
            senderId: userId,
            senderName: socket.user.username,
            timestamp: messageData.timestamp,
          });
        }

        // sender ko confirmation bhej rahe hain
        socket.emit("message_sent", {
          messageId,
          timestamp: messageData.timestamp,
        });
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("message_error", { error: "Failed to send message" });
      }
    });

    // typing indicator start
    socket.on("typing_start", ({ conversationId }) => {
      socket.to(`conversation_${conversationId}`).emit("user_typing", {
        userId,
        username: socket.user.username,
        conversationId,
      });
    });

    // typing stop
    socket.on("typing_stop", ({ conversationId }) => {
      socket.to(`conversation_${conversationId}`).emit("user_stopped_typing", {
        userId,
        conversationId,
      });
    });

    // message read event
    socket.on("messages_read", ({ conversationId, messageIds }) => {
      socket.to(`conversation_${conversationId}`).emit("messages_marked_read", {
        conversationId,
        messageIds,
        readBy: userId,
      });
    });

    // key exchange event (E2E encryption ke liye public key exchange)
    socket.on("key_exchange", ({ recipientId, publicKey }) => {
      const recipientSocketId = onlineUsers.get(recipientId);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit("key_exchange", {
          senderId: userId,
          publicKey,
        });
      }
    });

    // disconnect handler
    socket.on("disconnect", async () => {
      console.log(`User disconnected: ${userId}`);

      onlineUsers.delete(userId); // map se remove
      await redis.hdel("online_users", userId); // Redis se remove

      io.emit("user_online", { userId, online: false }); // broadcast offline
    });
  });

  // periodic job jo Redis ke messages MongoDB me flush karega
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

  // server close hone par interval cleanup
  process.on("SIGTERM", () => clearInterval(flushInterval));
  process.on("SIGINT", () => clearInterval(flushInterval));

  return io;
};

// existing io instance getter
const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};

// online users map getter
const getOnlineUsers = () => onlineUsers;

// exports
module.exports = { initializeSocket, getIO, getOnlineUsers };
