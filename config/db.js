import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    
    // Tự động gỡ bỏ index unique 'character_1' cũ để sếp thêm trùng kanji thoải mái
    try {
      await mongoose.connection.db.collection("kanjis").dropIndex("character_1");
      console.log("✅ Đã gỡ bỏ index unique 'character_1' cũ thành công.");
    } catch (e) {
      // Bỏ qua nếu index không tồn tại hoặc đã gỡ từ trước
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1); // Dừng server nếu không kết nối được
  }
};

export default connectDB;
