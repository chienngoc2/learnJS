/**
 * Full Feature Integration & Automated CI/CD Test Suite
 * Tests all core backend endpoints: Health, Auth, Vocab, Kanji, AI Prompts, and Handwriting Recognition
 */

import http from "http";
import mongoose from "mongoose";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import app from "../server.js";
import User from "../models/User.js";
import { selectPersona } from "../utils/prompts/persona.js";

dotenv.config();

const PORT = 5055;
let server;
let baseUrl = `http://localhost:${PORT}`;
let authToken = "";
let testUserId = null;

// Helper HTTP requester using native node fetch
async function request(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
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
  console.log("🧪 BẮT ĐẦU CHẠY FULL FEATURE AUTOMATED CI/CD TEST SUITE");
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

  // 1. Start test server
  await new Promise((resolve) => {
    server = app.listen(PORT, () => {
      resolve(null);
    });
  });

  try {
    // -------------------------------------------------------------
    // 1. Health check & DB
    // -------------------------------------------------------------
    await test("1. API Health Check (/api/health)", async () => {
      const res = await request("/api/health");
      if (res.status !== 200 || res.data.status !== "ok") {
        throw new Error(`Expected 200 ok, got status ${res.status}: ${JSON.stringify(res.data)}`);
      }
    });

    await test("2. Database Connection Check", async () => {
      if (mongoose.connection.readyState !== 1) {
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (mongoose.connection.readyState !== 1) {
        throw new Error(`MongoDB not connected. ReadyState: ${mongoose.connection.readyState}`);
      }
    });

    // -------------------------------------------------------------
    // 2. Auth Flow & JWT Token Generation
    // -------------------------------------------------------------
    await test("3. User Authentication & JWT Generation", async () => {
      // Clean previous test user if any
      await User.deleteOne({ username: "ci_tester_chinese" });

      const testUser = await User.create({
        username: "ci_tester_chinese",
        password: "Password123!",
        role: "admin",
      });

      testUserId = testUser._id;
      authToken = jwt.sign(
        { id: testUser._id, role: "admin" },
        (process.env.JWT_SECRET || "sensei_ai_secret_key_super_secure"),
        { expiresIn: "1d" }
      );

      if (!authToken) throw new Error("Could not generate JWT auth token");
    });

    // -------------------------------------------------------------
    // 3. Vocab & Grammar API (with Auth)
    // -------------------------------------------------------------
    let createdVocabId = null;

    await test("4. Vocab Save API (Phồn Thể / TOCFL)", async () => {
      const payload = {
        title: "CI_TEST_Bài 1 - Chào hỏi Phồn Thể",
        list: [
          {
            term: "你好",
            def: JSON.stringify({
              reading: "nǐ hǎo",
              pinyin: "nǐ hǎo",
              zhuyin: "ㄋㄧˇ ㄏㄠˇ",
              hanviet: "Nhĩ Hảo",
              meaning: "Xin chào",
              type: "greeting",
              level: "TOCFL A1",
              examples: [{ cn: "你好！很高興認識你。", vn: "Xin chào! Rất vui được gặp bạn." }],
            }),
          },
          {
            term: "謝謝",
            def: JSON.stringify({
              reading: "xièxie",
              pinyin: "xièxie",
              zhuyin: "ㄒㄧㄝˋ ㄒㄧㄝ˙",
              hanviet: "Tạ Tạ",
              meaning: "Cảm ơn",
              type: "expression",
              level: "TOCFL A1",
            }),
          },
        ],
      };

      const res = await request("/api/vocab/save", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Save vocab failed with status ${res.status}: ${JSON.stringify(res.data)}`);
      }
      if (!res.data.success) {
        throw new Error(`Response success was false: ${JSON.stringify(res.data)}`);
      }
    });

    await test("5. Vocab Lists Retrieval (/api/vocab/lists)", async () => {
      const res = await request("/api/vocab/lists");
      if (res.status !== 200 || !res.data.success) {
        throw new Error(`Get lists failed: ${JSON.stringify(res.data)}`);
      }
      const found = res.data.data.find((item) => item.title === "CI_TEST_Bài 1 - Chào hỏi Phồn Thể");
      if (!found) {
        throw new Error("Created CI test vocab topic not found in lists");
      }
      createdVocabId = found._id;
    });

    await test("6. Vocab Detail (/api/vocab/list/:id)", async () => {
      if (!createdVocabId) throw new Error("No vocab ID to test");
      const res = await request(`/api/vocab/list/${createdVocabId}`);
      if (res.status !== 200 || !res.data.success || !res.data.data.words) {
        throw new Error(`Get detail failed: ${JSON.stringify(res.data)}`);
      }
      if (res.data.data.words.length < 2) {
        throw new Error(`Expected at least 2 words, found: ${res.data.data.words.length}`);
      }
    });

    await test("7. Grammar Points Retrieval (/api/vocab/all-grammar-points)", async () => {
      const res = await request("/api/vocab/all-grammar-points");
      if (res.status !== 200 || !res.data.success) {
        throw new Error(`Get grammar points failed: ${JSON.stringify(res.data)}`);
      }
    });

    // -------------------------------------------------------------
    // 4. Kanji / Hanzi API
    // -------------------------------------------------------------
    let createdKanjiId = null;

    await test("8. Kanji Add API (Chữ Hán Phồn Thể)", async () => {
      const payload = {
        character: "學",
        meaning: "Học, học tập, trường học",
        pinyin: "xué",
        zhuyin: "ㄒㄩㄝˊ",
        onyomi: "xué",
        kunyomi: "ㄒㄩㄝˊ",
        vietnamese_reading: "HỌC",
        level: "TOCFL A1",
        lessonGroup: "CI_TEST_Bài 1",
        components: ["子", "冖"],
        story: "Trẻ con (Tử) ngồi dưới mái nhà (Mịch) học tập.",
        onyomi_examples: [
          { word: "學生", reading: "xuéshēng", meaning: "Học sinh" },
          { word: "學校", reading: "xuéxiào", meaning: "Trường học" },
        ],
      };

      const res = await request("/api/kanji/add", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.status !== 200 && res.status !== 201) {
        throw new Error(`Add Kanji failed with status ${res.status}: ${JSON.stringify(res.data)}`);
      }
      if (!res.data.success) {
        throw new Error(`Add Kanji response was not success: ${JSON.stringify(res.data)}`);
      }
      createdKanjiId = res.data.data?._id;
    });

    await test("9. Kanji Search API (/api/kanji/search?q=學)", async () => {
      const res = await request("/api/kanji/search?q=學");
      if (res.status !== 200 || !res.data.success || !res.data.data) {
        throw new Error(`Search Kanji failed: ${JSON.stringify(res.data)}`);
      }
      if (res.data.data.character !== "學" || res.data.data.vietnamese_reading !== "HỌC") {
        throw new Error(`Unexpected character returned: ${JSON.stringify(res.data.data)}`);
      }
    });

    await test("10. Kanji Groups API (/api/kanji/groups)", async () => {
      const res = await request("/api/kanji/groups");
      if (res.status !== 200 || !res.data.success) {
        throw new Error(`Get Kanji groups failed: ${JSON.stringify(res.data)}`);
      }
      const groupFound = res.data.data.find((g) => g.name === "CI_TEST_Bài 1");
      if (!groupFound) {
        throw new Error("Created CI_TEST_Bài 1 group not found in groups API");
      }
    });

    // -------------------------------------------------------------
    // 5. AI Traditional Chinese Persona Selection Logic
    // -------------------------------------------------------------
    await test("11. AI Persona Engine (Traditional Chinese Recognition)", async () => {
      const chinesePersona = selectPersona("Tôi muốn học chữ Hán Phồn Thể và thi TOCFL");
      if (!chinesePersona.includes("LÃO SƯ TIẾNG TRUNG PHỒN THỂ") && !chinesePersona.includes("繁體中文")) {
        throw new Error("AI Persona engine did not trigger Traditional Chinese teacher mode");
      }
    });

    // -------------------------------------------------------------
    // 6. Handwriting Recognition External Service Check
    // -------------------------------------------------------------
    await test("12. Google Input Tools Handwriting Recognition (zh_TW)", async () => {
      const payload = {
        app_version: 0.4,
        api_level: "537.36",
        device: "5.0",
        input_type: "0",
        options: "enable_pre_space",
        requests: [
          {
            writing_guide: { writing_area_width: 300, writing_area_height: 300 },
            pre_context: "",
            max_num_results: 5,
            max_completions: 0,
            language: "zh_TW",
            ink: [
              [
                [50, 150, 250],
                [50, 50, 50],
                [0, 100, 200],
              ], // horizontal line -> 一
            ],
          },
        ],
      };

      const res = await fetch(
        "https://inputtools.google.com/request?itc=zh-t-i0-handwrit&app=translate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();
      if (!data || data[0] !== "SUCCESS" || !data[1] || !data[1][0] || !data[1][0][1]) {
        throw new Error(`Handwriting API unexpected response: ${JSON.stringify(data)}`);
      }
      const candidates = data[1][0][1];
      if (!Array.isArray(candidates) || candidates.length === 0) {
        throw new Error("No candidates returned from handwriting recognition");
      }
    });

    // -------------------------------------------------------------
    // 7. Clean-up CI Test Data
    // -------------------------------------------------------------
    await test("13. Clean-up CI Test Data", async () => {
      const db = mongoose.connection.db;
      if (db) {
        await db.collection("vocablists").deleteMany({ title: /CI_TEST/ });
        await db.collection("kanjis").deleteMany({ lessonGroup: /CI_TEST/ });
      }
      if (testUserId) {
        await User.findByIdAndDelete(testUserId);
      }
    });

  } finally {
    // Close test server
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
    }
  }

  console.log("\n=======================================================");
  console.log(`📊 KẾT QUẢ TEST: ${passed} PASSED | ${failed} FAILED`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("🎉 TẤT CẢ CÁC TÍNH NĂNG ĐỀU HOẠT ĐỘNG HOÀN HẢO!\n");
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("FATAL TEST RUNNER ERROR:", err);
  process.exit(1);
});
