const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    lastMessage: {
      encryptedContent: String,
      iv: String,
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      timestamp: Date,
    },
    unreadCount: {
      type: Map,
      of: Number,
      default: new Map(),
    },
  },
  {
    timestamps: true,
  },
);

// Ensure unique conversation between two users
conversationSchema.index({ participants: 1 }, { unique: true });

// Static method to find or create conversation
conversationSchema.statics.findOrCreate = async function (user1Id, user2Id) {
  const participants = [user1Id, user2Id].sort();

  let conversation = await this.findOne({
    participants: { $all: participants, $size: 2 },
  }).populate("participants", "username email avatar isOnline lastSeen");

  if (!conversation) {
    conversation = await this.create({
      participants,
      unreadCount: new Map([
        [user1Id.toString(), 0],
        [user2Id.toString(), 0],
      ]),
    });
    conversation = await conversation.populate(
      "participants",
      "username email avatar isOnline lastSeen",
    );
  }

  return conversation;
};

module.exports = mongoose.model("Conversation", conversationSchema);
