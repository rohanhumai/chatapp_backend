// mongoose import kar rahe hain (MongoDB ke saath schema define karne ke liye)
const mongoose = require("mongoose");

// bcrypt password hashing ke liye (plain text password kabhi store nahi karte)
const bcrypt = require("bcryptjs");

// naya mongoose schema define kar rahe hain
const userSchema = new mongoose.Schema(
  {
    username: {
      type: String, // string type
      required: [true, "Username is required"], // required field with custom error
      unique: true, // database level unique constraint
      trim: true, // extra spaces remove karega
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
      match: [
        /^[a-zA-Z0-9_]+$/, // sirf letters, numbers aur underscore allow
        "Username can only contain letters, numbers, and underscores",
      ],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      trim: true,
      lowercase: true, // email ko lowercase me store karega
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"], // basic email regex validation
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // by default query me password field return nahi hoga
    },

    publicKey: {
      type: String,
      default: null, // E2E encryption ke liye public key store kar sakte hain
    },

    fingerprint: {
      type: String,
      default: null, // device/browser fingerprint store karne ke liye
    },

    avatar: {
      type: String,
      default: null, // profile image URL ya path
    },

    lastSeen: {
      type: Date,
      default: Date.now, // user ka last active time
    },

    isOnline: {
      type: Boolean,
      default: false, // online status flag
    },
  },
  {
    timestamps: true, // automatically createdAt aur updatedAt fields add karega

    // jab document JSON me convert hoga (API response ke liye)
    toJSON: {
      transform(doc, ret) {
        delete ret.password; // safety ke liye password remove
        delete ret.__v; // mongoose version key remove
        return ret;
      },
    },
  },
);

// save hone se pehle middleware chalega
userSchema.pre("save", async function (next) {
  // agar password modify nahi hua to hashing skip kar do
  if (!this.isModified("password")) return next();

  try {
    // salt generate kar rahe hain (12 rounds = strong hashing cost factor)
    const salt = await bcrypt.genSalt(12);

    // password ko hash kar rahe hain
    this.password = await bcrypt.hash(this.password, salt);

    next(); // continue saving
  } catch (error) {
    next(error); // error handling
  }
});

// custom method jo password compare karega
userSchema.methods.comparePassword = async function (candidatePassword) {
  // bcrypt.compare plain password ko hashed password se compare karta hai
  return bcrypt.compare(candidatePassword, this.password);
};

// text index create kar rahe hain taaki username/email pe search fast ho
userSchema.index({ username: "text", email: "text" });

// model export kar rahe hain
module.exports = mongoose.model("User", userSchema);
