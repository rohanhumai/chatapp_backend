//[Database]
// mongoose library ko import kar rahe hain taaki MongoDB se connect kar saken
const mongoose = require("mongoose");

// async function bana rahe hain jo database se connection establish karega
const connectDB = async () => {
  try {
    // mongoose.connect() database ke saath actual connection banata hai
    // process.env.MONGODB_URI environment variable se MongoDB ka URI lega
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // maxPoolSize: ek time pe maximum kitne connections open ho sakte hain
      // yeh performance aur resource control ke liye use hota hai
      maxPoolSize: 10,

      // serverSelectionTimeoutMS: agar MongoDB server 5 seconds me respond nahi kare
      // to connection attempt fail ho jayega
      serverSelectionTimeoutMS: 5000,

      // socketTimeoutMS: agar 45 seconds tak koi activity nahi hui
      // to socket close ho jayega (long running queries ke liye useful setting)
      socketTimeoutMS: 45000,
    });

    // mongoose.connection global connection object ko represent karta hai

    // agar connection ke baad koi error aata hai to yeh event trigger hoga
    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err); // error ko console me log karega
    });

    // agar database disconnect ho jata hai to yeh event trigger hoga
    mongoose.connection.on("disconnected", () => {
      console.warn("MongoDB disconnected. Attempting reconnect...");
      // warning log karega (automatic reconnect mongoose khud handle karta hai internally)
    });

    // successful connection object return kar rahe hain
    return conn;
  } catch (error) {
    // agar initial connection me hi error aaya to yahan catch hoga
    console.error("MongoDB connection failed:", error.message);

    // error ko dobara throw kar rahe hain taaki calling function handle kar sake
    throw error;
  }
};

// is function ko export kar rahe hain taaki app ke dusre parts me use ho sake
module.exports = connectDB;
