import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

let isConnected = false;

const connectDB = async () => {
  if (isConnected || mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.warn("⚠️ Cảnh báo: Chưa cấu hình MONGODB_URI trong biến môi trường.");
    return null;
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    });
    isConnected = true;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Tự động xử lý index nếu cần
    try {
      if (mongoose.connection.db) {
        await mongoose.connection.db.collection("kanjis").dropIndex("character_1").catch(() => {});
      }
    } catch (e) {
      // Bỏ qua nếu index không tồn tại
    }
    return conn;
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    // Không gọi process.exit(1) để tránh làm sập serverless / container
    return null;
  }
};

export default connectDB;
