/**
 * Priority Review Endpoints Test Suite
 */
import http from "http";
import mongoose from "mongoose";
import dotenv from "dotenv";
import app from "../server.js";
import VocabList from "../models/VocabList.ts";

dotenv.config();

const PORT = 5057;
let server;
let baseUrl = `http://localhost:${PORT}`;

async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

async function runTests() {
  console.log("\n=======================================================");
  console.log("⭐ KIỂM TRA HỆ THỐNG ƯU TIÊN ÔN TẬP (PRIORITY REVIEW)");
  console.log("=======================================================\n");

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      process.stdout.write(`⏳ Đang test: ${name}... `);
      await fn();
      console.log("✅ PASS");
      passed++;
    } catch (err) {
      console.log(`❌ FAIL: ${err.message}`);
      failed++;
    }
  }

  try {
    await new Promise((resolve) => {
      server = app.listen(PORT, () => {
        resolve(null);
      });
    });

    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/learn_chinese");
    }

    // Test 1: Add a word to priority review
    await test("Thêm từ vào ưu tiên ôn tập (/api/vocab/priority/add)", async () => {
      const res = await request("/api/vocab/priority/add", {
        method: "POST",
        body: JSON.stringify({
          term: "迷路",
          reading: "mílù",
          meaning: "lạc đường",
          topicTitle: "Bài 1",
        }),
      });
      if (res.status !== 200 || !res.data.success || !res.data.isPriority) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
    });

    // Test 2: Get priority words
    await test("Lấy danh sách từ ưu tiên (/api/vocab/priority/list)", async () => {
      const res = await request("/api/vocab/priority/list", {
        method: "GET",
      });
      if (res.status !== 200 || !res.data.success) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
      const found = res.data.words.find((w) => w.term === "迷路");
      if (!found || !found.isPriority) {
        throw new Error(`Từ '迷路' không tìm thấy trong list ưu tiên`);
      }
      if (!res.data.topics.includes("Bài 1")) {
        throw new Error(`Danh sách topics thiếu 'Bài 1'`);
      }
    });

    // Test 3: Toggle priority (should unmark)
    await test("Toggle từ ưu tiên - gỡ bỏ (/api/vocab/priority/toggle)", async () => {
      const res = await request("/api/vocab/priority/toggle", {
        method: "POST",
        body: JSON.stringify({
          term: "迷路",
        }),
      });
      if (res.status !== 200 || !res.data.success || res.data.isPriority !== false) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
    });

    // Test 4: Toggle priority again (should remark)
    await test("Toggle từ ưu tiên - đánh dấu lại (/api/vocab/priority/toggle)", async () => {
      const res = await request("/api/vocab/priority/toggle", {
        method: "POST",
        body: JSON.stringify({
          term: "迷路",
          reading: "mílù",
          meaning: "lạc đường",
        }),
      });
      if (res.status !== 200 || !res.data.success || res.data.isPriority !== true) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
    });

    // Test 5: Remove priority
    await test("Gỡ từ khỏi ưu tiên (/api/vocab/priority/remove)", async () => {
      const res = await request("/api/vocab/priority/remove", {
        method: "POST",
        body: JSON.stringify({
          term: "迷路",
        }),
      });
      if (res.status !== 200 || !res.data.success) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }
    });

    // Test 6: Auto-detect lesson when adding/toggling priority without topicTitle
    await test("Tự động dò bài học gốc khi lưu từ ưu tiên (/api/vocab/priority/add)", async () => {
      // Seed một danh sách bài học có chứa từ mẫu "探索"
      await VocabList.findOneAndUpdate(
        { title: "Bài 99 - Khám Phá" },
        {
          title: "Bài 99 - Khám Phá",
          words: [
            {
              term: "探索",
              reading: "tànsuǒ",
              meaning: "khám phá, tìm hiểu",
              def: "khám phá, tìm hiểu",
            },
          ],
        },
        { upsert: true, new: true }
      );

      // Thêm từ "探索" vào ưu tiên NHƯNG KHÔNG TRUYỀN topicTitle (hoặc truyền "Khác")
      const res = await request("/api/vocab/priority/add", {
        method: "POST",
        body: JSON.stringify({
          term: "探索",
        }),
      });

      if (res.status !== 200 || !res.data.success) {
        throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
      }

      if (res.data.topicTitle !== "Bài 99 - Khám Phá") {
        throw new Error(`Mong đợi topicTitle 'Bài 99 - Khám Phá', nhưng nhận được '${res.data.topicTitle}'`);
      }

      // Dọn dẹp
      await VocabList.deleteOne({ title: "Bài 99 - Khám Phá" });
      await request("/api/vocab/priority/remove", {
        method: "POST",
        body: JSON.stringify({ term: "探索" }),
      });
    });

    console.log("\n=======================================================");
    console.log(`🎉 KẾT QUẢ: ${passed} PASSED, ${failed} FAILED`);
    console.log("=======================================================\n");

    if (failed > 0) process.exit(1);
  } finally {
    if (server) server.close();
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
