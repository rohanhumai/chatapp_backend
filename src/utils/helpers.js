const { v4: uuidv4 } = require("uuid");

const generateMessageId = () => {
  return `msg_${uuidv4()}`;
};

const sanitizeInput = (input) => {
  if (typeof input !== "string") return input;
  return input.replace(/[<>]/g, "").trim();
};

module.exports = { generateMessageId, sanitizeInput };
