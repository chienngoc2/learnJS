import "dotenv/config";
import { Pinecone } from "@pinecone-database/pinecone";

// 1. Khởi tạo kết nối với Pinecone
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const indexName = "nhat-ky-d4c-v2"; // Sếp nhớ kiểm tra xem tên Index trên Dashboard Pinecone có đúng là nhat-ky-d4c-v2 không nhé

// 2. Trỏ đúng vào tên kho và tạo không gian "diary" để lưu ký ức người dùng
const diaryIndex = pc.index(indexName).namespace("diary");

/**
 * Hàm 1: Tìm kiếm ký ức dựa trên nội dung người dùng vừa nói
 */
export async function searchMemory(userText) {
  if (!userText) return "";
  try {
    const results = await diaryIndex.searchRecords({
      query: {
        topK: 10,
        inputs: { text: userText },
      },
      fields: ["chunk_text"],
    });

    if (results.result?.hits?.length > 0) {
      return results.result.hits
        .map((hit) => hit.fields.chunk_text)
        .join(" | ");
    }
    return "";
  } catch (error) {
    console.error("❌ Lỗi tìm kiếm Pinecone:", error.message);
    return "";
  }
}

/**
 * Hàm 2: Lưu ký ức mới vào kho Pinecone
 */
export async function saveMemory(userText) {
  if (!userText) return;
  try {
    await diaryIndex.upsertRecords({
      records: [
        {
          _id: `note_${Date.now()}`,
          chunk_text: userText,
          created_at: new Date().toISOString(),
          type: "user_note",
        },
      ],
    });
    console.log("💾 Ký ức đã được 'ghim' vào não bộ AI!");
  } catch (error) {
    console.error("❌ Lỗi lưu Pinecone:", error.message);
  }
}

/**
 * Hàm 3: Giữ lại để tránh lỗi import ở các file khác
 */
export async function getVector(text) {
  return text;
}
