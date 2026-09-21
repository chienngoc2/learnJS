import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const cleanDatabase = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ Không tìm thấy MONGODB_URI trong .env");
    process.exit(1);
  }

  try {
    console.log("🔌 Đang kết nối tới MongoDB...");
    await mongoose.connect(uri);
    console.log("✅ Kết nối thành công!");

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map((c) => c.name);

    console.log("📁 Danh sách collections hiện có:", collectionNames);

    const targetCollections = ["vocablists", "kanjis", "studylogs"];

    for (const target of targetCollections) {
      if (collectionNames.includes(target)) {
        await db.collection(target).deleteMany({});
        console.log(`🗑️ Đã xóa sạch dữ liệu trong collection: ${target}`);
      } else {
        console.log(`ℹ️ Collection ${target} chưa tồn tại (sẽ được tự động tạo khi thêm dữ liệu mới)`);
      }
    }

    console.log("🎉 Hoàn tất dọn dẹp database cho dự án Học Tiếng Trung Phồn Thể!");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Lỗi khi dọn dẹp database:", error);
    process.exit(1);
  }
};

cleanDatabase();
