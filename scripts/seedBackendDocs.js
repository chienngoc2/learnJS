// File: scripts/seedBackendDocs.js

import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Load biến môi trường
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = process.env.PINECONE_INDEX_NAME;
const senseiIndex = pc.index(indexName);

// Danh sách các file backend cốt lõi cần nạp RAG
const FILES_TO_INDEX = [
  "server.js",
  "models/User.ts",
  "models/VocabList.ts",
  "models/Kanji.ts",
  "models/StudyLog.ts",
  "controllers/authController.ts",
  "controllers/chatController.ts",
  "controllers/vocabController.ts",
  "controllers/ragController.ts",
  "controllers/kanjiController.ts",
  "middleware/authMiddleware.ts",
  "routes/authRoutes.js",
  "routes/vocab.js",
  "routes/chatbot.js",
];

// Hàm chia nhỏ file thành các chunk dựa trên độ dài (ký tự)
const chunkText = (text, size = 1500) => {
  const chunks = [];
  let index = 0;
  while (index < text.length) {
    chunks.push(text.slice(index, index + size));
    index += size;
  }
  return chunks;
};

const seedBackendDocs = async () => {
  try {
    if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX_NAME) {
      throw new Error("Vui lòng cấu hình đầy đủ biến môi trường Pinecone trong file .env sếp ơi!");
    }

    console.log("🚀 [RAG BE] Bắt đầu đọc mã nguồn Backend và đóng gói...");
    const recordsToUpsert = [];
    const baseDir = path.resolve(__dirname, "..");
    const createdAtStr = new Date().toISOString();

    for (const relativePath of FILES_TO_INDEX) {
      const fullPath = path.join(baseDir, relativePath);

      if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️ [RAG BE] Không tìm thấy file: ${relativePath}. Bỏ qua.`);
        continue;
      }

      console.log(`📦 [RAG BE] Đang xử lý file: ${relativePath}`);
      const content = fs.readFileSync(fullPath, "utf-8");
      const cleanContent = content.replace(/\r\n/g, "\n");

      // Chia nhỏ file thành các chunk
      const textChunks = chunkText(cleanContent, 1500);

      textChunks.forEach((chunk, index) => {
        const chunkId = `be_doc_${relativePath.replace(/[\/\\.]/g, "_")}_chunk_${index}`;
        const textChunk = `[Tài liệu Backend] File: ${relativePath} (Đoạn ${index + 1}/${textChunks.length}).\n\nNội dung mã nguồn:\n\`\`\`\n${chunk}\n\`\`\``;

        recordsToUpsert.push({
          id: chunkId,
          text: textChunk,
          topicId: "be_documentation", // Định danh chung cho tài liệu code
          type: "be_documentation",
          created_at: createdAtStr,
        });
      });
    }

    if (recordsToUpsert.length === 0) {
      console.log("⚠️ Không có tài liệu code nào được đóng gói. Dừng.");
      return;
    }

    // 2. Dọn dẹp các tài liệu backend cũ trên Pinecone
    console.log("🧹 Đang dọn dẹp các tài liệu backend cũ trên Pinecone...");
    try {
      await senseiIndex.deleteMany({
        filter: { type: { $eq: "be_documentation" } }
      });
      console.log("🧹 Dọn dẹp tài liệu cũ thành công!");
    } catch (delError) {
      console.warn("⚠️ Lỗi dọn dẹp tài liệu cũ:", delError.message);
    }

    // 3. Đẩy dữ liệu mới lên Pinecone theo lô (batch)
    console.log(`☁️ Đang đẩy ${recordsToUpsert.length} chunk tài liệu backend lên Pinecone...`);
    const batchSize = 20; // Chia lô nhỏ hơn vì text chunk khá dài
    for (let i = 0; i < recordsToUpsert.length; i += batchSize) {
      const batch = recordsToUpsert.slice(i, i + batchSize);
      await senseiIndex.upsertRecords({
        records: batch,
      });
      console.log(`☁️ Đã đẩy xong lô tài liệu thứ ${Math.floor(i / batchSize) + 1}/${Math.ceil(recordsToUpsert.length / batchSize)}`);
    }

    console.log("🎉 XONG! Đã nạp thành công tài liệu code Backend lên Pinecone sếp ơi!");
  } catch (error) {
    console.error("❌ Lỗi nạp tài liệu backend lên Pinecone:", error.message);
  } finally {
    process.exit(0);
  }
};

seedBackendDocs();
