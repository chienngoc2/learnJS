// File: scripts/seedPinecone.js

import mongoose from "mongoose";
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import VocabList from "../models/VocabList.ts";

// Load biến môi trường
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX_NAME;
const senseiIndex = pc.index(indexName);

const MONGO_CONNECTION_STRING =
  process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL;

const seedDataFromMongo = async () => {
  try {
    if (!MONGO_CONNECTION_STRING) {
      throw new Error(
        "Không tìm thấy link kết nối MongoDB trong file .env sếp ơi!",
      );
    }

    console.log("🔌 Đang kết nối với MongoDB Atlas...");
    await mongoose.connect(MONGO_CONNECTION_STRING);
    console.log("✅ Kết nối MongoDB thành công!");

    // 1. Lấy toàn bộ danh sách bài học từ Mongo về trước
    const allVocabLists = await VocabList.find({});
    if (allVocabLists.length === 0) {
      console.log("⚠️ MongoDB đang trống. Không có dữ liệu nào để nạp.");
      process.exit(0);
    }

    const recordsToUpsert = [];
    console.log("🚀 Bắt đầu quét kiểm tra và đóng gói dữ liệu...");

    // 2. Duyệt qua từng bài học để check xem Pinecone đã sở hữu bài này chưa
    for (const list of allVocabLists) {
      const currentTopicId = list._id.toString();

      // 🔥 BƯỚC THẦN THÁNH: Hỏi nhanh Pinecone xem đã có bản ghi nào chứa topicId này chưa
      const checkExist = await senseiIndex.searchRecords({
        query: {
          inputs: { text: "kiểm tra tồn tại" }, // Dummy text vì hàm này của sếp bắt buộc truyền text
          topK: 1,
          filter: { topicId: { $eq: currentTopicId } }, // Lọc theo đúng ID bài này
        },
        fields: ["topicId"],
      });

      // Nếu tìm thấy dù chỉ 1 hit trùng topicId -> Chứng tỏ bài này ĐÃ ĐƯỢC NẠP RỒI
      if (checkExist.result?.hits && checkExist.result.hits.length > 0) {
        console.log(
          `⏭️  [BỎ QUA] Bài: "${list.title}" đã tồn tại trên Pinecone. Không lấy lại nữa!`,
        );
        continue; // Rẽ nhánh thoát sớm, nhảy sang bài tiếp theo luôn, không lặp đống từ vựng nữa
      }

      // Nếu Pinecone chưa có bài này -> Tiến hành đóng gói từ vựng
      console.log(
        `📦 [CHẤP NHẬN] Bài mới: "${list.title}". Đang đóng gói dữ liệu...`,
      );
      for (const word of list.words) {
        const textChunk = `Chủ đề: ${list.title}. Từ vựng: ${word.term}. Nghĩa: ${word.def}.`;

        recordsToUpsert.push({
          id: `vocab_${word._id.toString()}`,
          text: textChunk,
          topicId: currentTopicId,
          type: "vocabulary",
          created_at: new Date().toISOString(),
        });
      }
    }

    // 3. Nếu không có bài nào mới thì dừng cuộc chơi tại đây
    if (recordsToUpsert.length === 0) {
      console.log(
        "🎉 Ký ức Pinecone đã được đồng bộ hoàn toàn với MongoDB. Không có bài mới nào cần đẩy lên!",
      );
      return;
    }

    console.log(
      `☁️ Phát hiện bài mới! Đang đẩy ${recordsToUpsert.length} từ vựng lên Pinecone...`,
    );

    // 4. Bơm các lô dữ liệu MỚI lên mạng
    const batchSize = 100;
    for (let i = 0; i < recordsToUpsert.length; i += batchSize) {
      const batch = recordsToUpsert.slice(i, i + batchSize);

      await senseiIndex.upsertRecords({
        records: batch,
      });

      console.log(
        `☁️ Đã đẩy xong lô dữ liệu thứ ${Math.floor(i / batchSize) + 1}`,
      );
    }

    console.log("🎉 XONG! Đã bổ sung các bài học mới vào Pinecone thành công!");
  } catch (error) {
    console.error("❌ Lỗi đồng bộ Pinecone:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Đã ngắt kết nối MongoDB.");
    process.exit(0);
  }
};

seedDataFromMongo();
