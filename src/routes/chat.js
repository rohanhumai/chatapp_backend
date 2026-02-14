const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { messageLimiter } = require("../middleware/rateLimiter");
const chatController = require("../controllers/chatController");

router.get(
  "/messages/:conversationId",
  authenticate,
  chatController.getMessages,
);
router.put(
  "/messages/:conversationId/read",
  authenticate,
  chatController.markAsRead,
);

module.exports = router;
