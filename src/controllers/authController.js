// JWT library token generate aur verify karne ke liye
const jwt = require("jsonwebtoken");

// validator email validation ke liye
const validator = require("validator");

// User model import
const User = require("../models/User");

// function jo access aur refresh tokens generate karega
const generateTokens = (userId) => {
  // short-lived access token (API access ke liye)
  const accessToken = jwt.sign(
    { userId }, // payload
    process.env.JWT_SECRET, // secret key
    { expiresIn: "7d" }, // expiration time
  );

  // long-lived refresh token (naya access token lene ke liye)
  const refreshToken = jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: "30d",
  });

  return { accessToken, refreshToken };
};

exports.register = async (req, res) => {
  try {
    // request body se fields le rahe hain
    const { username, email, password, publicKey, fingerprint } = req.body;

    // basic required field validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Username, email, and password are required.",
      });
    }

    // email format validation
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email.",
      });
    }

    // password length check
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters.",
      });
    }

    // username length validation
    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({
        success: false,
        message: "Username must be between 3 and 30 characters.",
      });
    }

    // existing user check (email ya username pe)
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username: username }],
    });

    if (existingUser) {
      const field =
        existingUser.email === email.toLowerCase() ? "email" : "username";

      return res.status(409).json({
        success: false,
        message: `A user with this ${field} already exists.`,
      });
    }

    // naya user create kar rahe hain
    const user = await User.create({
      username,
      email: email.toLowerCase(),
      password, // hashing model middleware me hoga
      publicKey: publicKey || null,
      fingerprint: fingerprint || null,
    });

    // tokens generate
    const { accessToken, refreshToken } = generateTokens(user._id);

    // httpOnly cookie set kar rahe hain (JS se accessible nahi)
    res.cookie("token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // sirf HTTPS pe
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 din
    });

    // success response
    res.status(201).json({
      success: true,
      message: "Registration successful.",
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          publicKey: user.publicKey,
          createdAt: user.createdAt,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);

    // duplicate key error (MongoDB code 11000)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Username or email already exists.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Registration failed. Please try again.",
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, fingerprint } = req.body;

    // required validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    // user fetch with password included
    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+password",
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // password compare (bcrypt)
    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    // fingerprint update agar diya gaya
    if (fingerprint) {
      user.fingerprint = fingerprint;
      await user.save();
    }

    // online status update
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    const { accessToken, refreshToken } = generateTokens(user._id);

    res.cookie("token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      message: "Login successful.",
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          publicKey: user.publicKey,
          createdAt: user.createdAt,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Login failed. Please try again.",
    });
  }
};

exports.logout = async (req, res) => {
  try {
    // agar authenticated user exist karta hai
    if (req.user) {
      req.user.isOnline = false;
      req.user.lastSeen = new Date();
      await req.user.save();
    }

    // cookie clear kar rahe hain
    res.clearCookie("token");

    res.json({
      success: true,
      message: "Logged out successfully.",
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({
      success: false,
      message: "Logout failed.",
    });
  }
};

exports.me = async (req, res) => {
  try {
    // current authenticated user return kar rahe hain
    res.json({
      success: true,
      data: { user: req.user },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get user info.",
    });
  }
};

exports.updatePublicKey = async (req, res) => {
  try {
    const { publicKey } = req.body;

    if (!publicKey) {
      return res.status(400).json({
        success: false,
        message: "Public key is required.",
      });
    }

    // user ka publicKey update kar rahe hain
    const user = await User.findByIdAndUpdate(
      req.userId,
      { publicKey },
      { new: true }, // updated document return karega
    );

    res.json({
      success: true,
      message: "Public key updated.",
      data: { user },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update public key.",
    });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required.",
      });
    }

    // refresh token verify
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found.",
      });
    }

    // naye tokens generate
    const tokens = generateTokens(user._id);

    res.cookie("token", tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Invalid refresh token.",
    });
  }
};
