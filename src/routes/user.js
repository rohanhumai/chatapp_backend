const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { apiLimiter } = require("../middleware/rateLimiter");
const userController = require("../controllers/userController");

router.get("/search", authenticate, apiLimiter, userController.searchUsers);
router.get("/:id", authenticate, userController.getUserProfile);
router.get("/:id/public-key", authenticate, userController.getPublicKey);

module.exports = router;
