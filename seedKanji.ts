import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import Kanji from "./models/Kanji";
import dotenv from "dotenv";

dotenv.config();

const seedData = async (): Promise<void> => {
  try {
    // 1. Kiểm tra và kết nối Database
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error("❌ Lỗi: Không tìm thấy biến MONGODB_URI trong file .env");
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("🔌 Đã kết nối MongoDB thành công...");

    // 2. Làm sạch dữ liệu cũ trong bảng Kanji
    await Kanji.deleteMany({});
    console.log("🗑️ Đã dọn dẹp sạch sẽ bảng Kanji cũ.");

    const kanjiFiles = ["kanjiN5.json", "kanjiN4.json", "kanjiN3.json"];

    // 🚀 BÙA PHÉP LỌC TRÙNG: Dùng Map để lưu trữ theo cặp Key (Chữ Kanji) -> Value (Object data)
    // Nếu trùng Key, thằng đọc sau sẽ tự động ghi đè lên thằng trước, đảm bảo không bao giờ có chữ lặp lại!
    const uniqueKanjiMap = new Map<string, any>();
    let totalRawCount = 0;

    // 3. Vòng lặp duyệt qua các file để gom data vào Map
    for (const fileName of kanjiFiles) {
      const filePath = path.join("./kanji", fileName);

      if (fs.existsSync(filePath)) {
        console.log(`📖 Đang đọc dữ liệu từ file: ${fileName}...`);
        const rawData = fs.readFileSync(filePath, "utf-8");
        const kanjiList = JSON.parse(rawData);

        totalRawCount += kanjiList.length;

        // Đút từng chữ vào Map để thanh lọc trùng lặp
        for (const item of kanjiList) {
          if (item.character) {
            uniqueKanjiMap.set(item.character.trim(), item);
          }
        }
      } else {
        console.log(
          `⚠️ Cảnh báo: Không tìm thấy file ${fileName} trong thư mục ./kanji`,
        );
      }
    }

    // 4. Chuyển Map ngược lại thành mảng Array sạch sẽ để insert một lần duy nhất
    const finalCleanList = Array.from(uniqueKanjiMap.values());
    const duplicateCount = totalRawCount - finalCleanList.length;

    if (finalCleanList.length > 0) {
      console.log(
        `🧹 Bộ lọc đã phát hiện và tự động loại bỏ: ${duplicateCount} chữ bị trùng lặp.`,
      );
      console.log(
        `🚀 Đang tiến hành bơm ${finalCleanList.length} chữ Kanji siêu sạch lên mây...`,
      );

      // Đẩy mảng data đã lọc trùng lên DB
      await Kanji.insertMany(finalCleanList);
      console.log(
        `\n🎉 HOÀN THÀNH: Đã tổng lực nạp ${finalCleanList.length} chữ Kanji thành công rực rỡ!`,
      );
    } else {
      console.log("⚠️ Không có dữ liệu hợp lệ để nạp.");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Gặp lỗi nghiêm trọng khi nạp dữ liệu:", error);
    process.exit(1);
  }
};

seedData();
