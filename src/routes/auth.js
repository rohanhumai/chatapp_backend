const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimiter");
const authController = require("../controllers/authController");

router.post("/register", authLimiter, authController.register);
router.post("/login", authLimiter, authController.login);
router.post("/logout", authenticate, authController.logout);
router.get("/me", authenticate, authController.me);
router.put("/public-key", authenticate, authController.updatePublicKey);
router.post("/refresh", authController.refreshToken);

module.exports = router;
