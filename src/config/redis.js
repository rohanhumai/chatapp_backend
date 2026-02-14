const Redis = require("ioredis");

let redisClient = null;

const connectRedis = async () => {
  return new Promise((resolve, reject) => {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      reconnectOnError(err) {
        const targetError = "READONLY";
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
    });

    redisClient.on("connect", () => {
      resolve(redisClient);
    });

    redisClient.on("error", (err) => {
      console.error("Redis error:", err.message);
      if (!redisClient.status || redisClient.status === "end") {
        reject(err);
      }
    });

    redisClient.on("close", () => {
      console.warn("Redis connection closed");
    });
  });
};

const getRedisClient = () => {
  if (!redisClient) {
    throw new Error("Redis client not initialized");
  }
  return redisClient;
};

module.exports = { connectRedis, getRedisClient };
