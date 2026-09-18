import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

let cachedPromise = null;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.warn("⚠️ Cảnh báo: Chưa cấu hình MONGODB_URI trong biến môi trường.");
    return null;
  }

  if (!cachedPromise) {
    cachedPromise = mongoose
      .connect(mongoUri, {
        serverSelectionTimeoutMS: 8000,
      })
      .then((conn) => {
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
        // Tự động xử lý index nếu cần
        if (mongoose.connection.db) {
          mongoose.connection.db
            .collection("kanjis")
            .dropIndex("character_1")
            .catch(() => {});
        }
        return conn;
      })
      .catch((err) => {
        cachedPromise = null;
        console.error(`❌ MongoDB Connection Error: ${err.message}`);
        throw err;
      });
  }

  return cachedPromise;
};

export default connectDB;
