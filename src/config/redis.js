// ioredis library ko import kar rahe hain jo Redis server se connect karne ke liye use hoti hai
const Redis = require("ioredis");

// redisClient variable ko initially null set kar rahe hain
// yeh global reference hoga taaki poore app me ek hi Redis instance reuse ho
let redisClient = null;

// async function jo Redis server se connection establish karega
const connectRedis = async () => {
  // Promise manually bana rahe hain kyunki hume connection events ke through resolve/reject control karna hai
  return new Promise((resolve, reject) => {
    // naya Redis client create kar rahe hain using REDIS_URL environment variable
    redisClient = new Redis(process.env.REDIS_URL, {
      // ek request kitni baar retry hogi agar fail hoti hai
      maxRetriesPerRequest: 3,

      // failover ke baad retry karne se pehle kitna delay hoga (milliseconds me)
      retryDelayOnFailover: 100,

      // custom retry strategy define kar rahe hain
      // 'times' batata hai kitni baar retry ho chuka hai
      retryStrategy(times) {
        // delay gradually increase karega (50ms, 100ms, 150ms...)
        // lekin maximum 2000ms (2 sec) tak hi jayega
        const delay = Math.min(times * 50, 2000);
        return delay;
      },

      // agar specific error aaye to reconnect karna hai ya nahi
      reconnectOnError(err) {
        const targetError = "READONLY";

        // READONLY error usually cluster/failover scenario me aata hai
        // agar error message me READONLY hai to reconnect allow karenge
        if (err.message.includes(targetError)) {
          return true;
        }

        // warna reconnect nahi karenge
        return false;
      },
    });

    // jab Redis successfully connect ho jaye
    redisClient.on("connect", () => {
      // promise ko resolve kar rahe hain aur redisClient return kar rahe hain
      resolve(redisClient);
    });

    // agar koi error aata hai connection me
    redisClient.on("error", (err) => {
      console.error("Redis error:", err.message);

      // agar client ka status invalid hai ya connection end ho chuka hai
      if (!redisClient.status || redisClient.status === "end") {
        // promise reject kar rahe hain taaki calling code handle kar sake
        reject(err);
      }
    });

    // agar connection close ho jaye
    redisClient.on("close", () => {
      console.warn("Redis connection closed");
    });
  });
};

// yeh function current redisClient ko return karega
const getRedisClient = () => {
  // agar redisClient initialize hi nahi hua
  if (!redisClient) {
    // error throw karenge taaki developer ko pata chale connectRedis pehle call karna hai
    throw new Error("Redis client not initialized");
  }

  // initialized client return kar rahe hain
  return redisClient;
};

// dono functions export kar rahe hain taaki app ke dusre modules me use ho sake
module.exports = { connectRedis, getRedisClient };
