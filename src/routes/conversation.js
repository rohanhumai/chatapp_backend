//[CONVERSATION]
const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const conversationController = require("../controllers/conversationController");

router.get("/", authenticate, conversationController.getConversations);
router.post("/", authenticate, conversationController.createConversation);
router.get("/:id", authenticate, conversationController.getConversation);

module.exports = router;
