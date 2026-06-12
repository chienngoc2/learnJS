// File: utils/ragSync.ts

import { Pinecone } from "@pinecone-database/pinecone";
import VocabList from "../models/VocabList.js";

const pc = new Pinecone({
  apiKey: (process.env.PINECONE_API_KEY || "") as string,
});
const indexName = (process.env.PINECONE_INDEX_NAME || "") as string;

// Hàm kiểm tra nhanh xem Pinecone có được cấu hình đầy đủ không
const isPineconeConfigured = (): boolean => {
  return !!process.env.PINECONE_API_KEY && !!process.env.PINECONE_INDEX_NAME;
};

/**
 * 🌲 Đồng bộ một bài học (từ vựng + ngữ pháp) từ MongoDB lên Pinecone
 * Được thiết kế chạy bất đồng bộ (Background job) để tránh block phản hồi HTTP API
 */
export const syncVocabListToPinecone = async (listId: string): Promise<void> => {
  if (!isPineconeConfigured()) {
    console.warn("⚠️ [ragSync] Pinecone chưa được cấu hình đầy đủ. Bỏ qua đồng bộ.");
    return;
  }

  try {
    console.log(`🌲 [ragSync] Bắt đầu đồng bộ bài học [ID: ${listId}] lên Pinecone...`);
    const list = await VocabList.findById(listId);
    if (!list) {
      console.error(`❌ [ragSync] Không tìm thấy bài học ID [${listId}] trong MongoDB.`);
      return;
    }

    const index = pc.index(indexName);

    // 1. Xóa các bản ghi cũ thuộc bài học này trên Pinecone để tránh trùng lặp
    try {
      await index.deleteMany({
        filter: { topicId: { $eq: listId } }
      });
      console.log(`🌲 [ragSync] Đã dọn dẹp các record cũ của bài [${list.title}] trên Pinecone.`);
    } catch (delError: any) {
      console.warn(`⚠️ [ragSync] Lỗi khi dọn dẹp record cũ (có thể chưa có record nào):`, delError.message);
    }

    const recordsToUpsert: any[] = [];
    const createdAtStr = new Date().toISOString();

    // 2. Đóng gói Từ vựng (Vocabulary)
    if (list.words && list.words.length > 0) {
      for (const word of list.words) {
        const wordId = (word as any)._id?.toString() || Math.random().toString(36).substring(2, 9);
        const textChunk = `Chủ đề: ${list.title}. Từ vựng: ${word.term}. Nghĩa: ${word.def}.`;
        
        recordsToUpsert.push({
          id: `vocab_${wordId}`,
          text: textChunk,
          topicId: listId,
          type: "vocabulary",
          created_at: createdAtStr,
        });
      }
    }

    // 3. Đóng gói Ngữ pháp (Grammar Points)
    if (list.grammarPoints && list.grammarPoints.length > 0) {
      for (const gp of list.grammarPoints) {
        const gpId = (gp as any)._id?.toString() || Math.random().toString(36).substring(2, 9);
        const examplesText = gp.examples && gp.examples.length > 0
          ? ` Ví dụ: ${gp.examples.join("; ")}`
          : "";
        const textChunk = `Chủ đề: ${list.title}. Ngữ pháp: ${gp.title}. Công thức: ${gp.formula || "Chưa có"}. Ý nghĩa: ${gp.meaning}.${examplesText}`;

        recordsToUpsert.push({
          id: `grammar_${gpId}`,
          text: textChunk,
          topicId: listId,
          type: "grammar",
          created_at: createdAtStr,
        });
      }
    }

    // 4. Upsert lên Pinecone
    if (recordsToUpsert.length > 0) {
      await index.upsertRecords({
        records: recordsToUpsert,
      });
      console.log(`🎉 [ragSync] Đồng bộ thành công ${recordsToUpsert.length} record (từ vựng + ngữ pháp) bài [${list.title}] lên Pinecone!`);
    } else {
      console.log(`⏭️ [ragSync] Bài [${list.title}] trống trơ, không có gì để đồng bộ.`);
    }
  } catch (error: any) {
    console.error(`❌ [ragSync] Lỗi đồng bộ bài học lên Pinecone:`, error.message);
  }
};

/**
 * 🌲 Xóa toàn bộ dữ liệu của một bài học trên Pinecone
 */
export const deleteVocabListFromPinecone = async (listId: string): Promise<void> => {
  if (!isPineconeConfigured()) {
    return;
  }

  try {
    console.log(`🌲 [ragSync] Đang xóa dữ liệu bài học [ID: ${listId}] trên Pinecone...`);
    const index = pc.index(indexName);

    await index.deleteMany({
      filter: { topicId: { $eq: listId } }
    });
    console.log(`🎉 [ragSync] Đã xóa toàn bộ record liên kết với bài học [ID: ${listId}] trên Pinecone.`);
  } catch (error: any) {
    console.error(`❌ [ragSync] Lỗi xóa dữ liệu bài học trên Pinecone:`, error.message);
  }
};
