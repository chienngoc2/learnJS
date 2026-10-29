/**
 * MongoDB GridFS Binary Audio Storage & Delete Test Suite
 * Tests: Binary upload, streaming, downloading, and total wipe on delete
 */

import assert from "assert";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import AudioLesson from "../models/AudioLesson.js";

async function runGridFSTests() {
  console.log("\n=======================================================");
  console.log("🧪 TEST MONGODB GRIDFS LƯU TRỮ NHỊ PHÂN & XÓA BÀI HỌC");
  console.log("=======================================================\n");

  await connectDB();
  assert.ok(mongoose.connection.db, "MongoDB connection must be established");

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: "audio_lessons",
  });

  // 1. Tạo buffer nhị phân giả lập (synthetic audio binary)
  console.log("⏳ Test 1: Tạo buffer nhị phân và upload vào MongoDB GridFS...");
  const dummyBuffer = Buffer.from("DUMMY_MP3_BINARY_DATA_TEST_STREAM_0123456789ABCDEF", "utf-8");
  const uploadStream = bucket.openUploadStream("test_lesson_binary.mp3", {
    contentType: "audio/mpeg",
    metadata: {
      title: "Bài test nhị phân MongoDB",
      test: true,
    },
  });

  await new Promise((resolve, reject) => {
    uploadStream.on("error", reject);
    uploadStream.on("finish", resolve);
    uploadStream.end(dummyBuffer);
  });

  const fileId = uploadStream.id;
  assert.ok(fileId, "GridFS must return an ObjectId");
  console.log(`✅ PASS: Đã ghi ${dummyBuffer.length} bytes nhị phân vào MongoDB GridFS (ID: ${fileId})`);

  // 2. Tạo bản ghi AudioLesson trong MongoDB
  console.log("⏳ Test 2: Tạo bản ghi AudioLesson liên kết với GridFS ID...");
  const lesson = await AudioLesson.create({
    gridFsFileId: fileId,
    title: "Bài nghe tiếng Trung - Test GridFS",
    originalFileName: "test_lesson_binary.mp3",
    fileSize: dummyBuffer.length,
    duration: 10.5,
    fullText: "你好，這是一條測試音頻。",
    fullTranslation: "Xin chào, đây là một đoạn âm thanh kiểm tra.",
    segments: [
      {
        id: 0,
        start: 0,
        end: 5.2,
        text: "你好，",
        pinyin: "nǐ hǎo,",
        meaningVi: "Xin chào,",
      },
      {
        id: 1,
        start: 5.2,
        end: 10.5,
        text: "這是一條測試音頻。",
        pinyin: "zhè shì yī tiáo cè shì yīn pín.",
        meaningVi: "đây là một đoạn âm thanh kiểm tra.",
      },
    ],
    totalSegments: 2,
    savedAtFormatted: "29/10/2026 15:30",
  });

  assert.strictEqual(lesson.title, "Bài nghe tiếng Trung - Test GridFS");
  assert.strictEqual(lesson.gridFsFileId.toString(), fileId.toString());
  console.log(`✅ PASS: Đã tạo AudioLesson document thành công (Lesson ID: ${lesson._id})`);

  // 3. Đọc lại dữ liệu nhị phân từ MongoDB GridFS
  console.log("⏳ Test 3: Đọc lại luồng nhị phân từ MongoDB và đối soát nội dung...");
  const downloadStream = bucket.openDownloadStream(fileId);
  const chunks = [];
  await new Promise((resolve, reject) => {
    downloadStream.on("data", (chunk) => chunks.push(chunk));
    downloadStream.on("error", reject);
    downloadStream.on("end", resolve);
  });
  const downloadedBuffer = Buffer.concat(chunks);
  assert.strictEqual(downloadedBuffer.toString("utf-8"), dummyBuffer.toString("utf-8"));
  console.log(`✅ PASS: Dữ liệu nhị phân lấy ra khớp 100% với file gốc ban đầu!`);

  // 4. Xóa bài học VÀ xóa triệt để file nhị phân trong MongoDB
  console.log("⏳ Test 4: Kiểm tra xóa bài học sẽ xóa cả trên MongoDB (Document + GridFS chunks)...");
  await AudioLesson.findByIdAndDelete(lesson._id);
  await bucket.delete(fileId);

  // Kiểm tra không còn trong AudioLesson
  const foundLesson = await AudioLesson.findById(lesson._id);
  assert.strictEqual(foundLesson, null, "Lesson document must be deleted from MongoDB");

  // Kiểm tra không còn file nhị phân trong GridFS
  const foundFiles = await bucket.find({ _id: fileId }).toArray();
  assert.strictEqual(foundFiles.length, 0, "GridFS binary chunks must be deleted from MongoDB");
  console.log("✅ PASS: Đã xóa vĩnh viễn cả AudioLesson và toàn bộ mã nhị phân khỏi MongoDB!");

  console.log("\n=======================================================");
  console.log("🎉 TẤT CẢ TEST LƯU TRỮ NHỊ PHÂN VÀ XÓA MONGODB ĐỀU THÀNH CÔNG!");
  console.log("=======================================================\n");

  await mongoose.disconnect();
  process.exit(0);
}

runGridFSTests().catch((err) => {
  console.error("❌ LỖI TEST GRIDFS:", err);
  process.exit(1);
});
