const crypto = require("crypto");

// Server-side hashing for message integrity verification (not for E2E encryption)
class EncryptionService {
  static hashMessage(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  static verifyHash(content, hash) {
    const computedHash = this.hashMessage(content);
    return computedHash === hash;
  }

  static generateNonce() {
    return crypto.randomBytes(16).toString("hex");
  }
}

module.exports = EncryptionService;
