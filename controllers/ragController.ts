// File: controllers/ragController.ts (hoặc sếp gộp vào chatController.ts)

import type { Request, Response } from "express"; // 🚀 Dùng 'import type' để xóa sạch lỗi CommonJS lúc nãy
import { Pinecone } from "@pinecone-database/pinecone";
import { GoogleGenerativeAI } from "@google/generative-ai"; // 🚀 Đã sửa lại tên Class chuẩn của Google
import VocabList from "../models/VocabList.js";
// 1. Định nghĩa Interface cho Request Body để TypeScript quản lý chặt chẽ
interface QuizRequestBody {
  topicId: string;
  userMessage: string;
}

const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY as string });
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

export const generateQuizByTopic = async (
  req: Request<{}, {}, QuizRequestBody>,
  res: Response
): Promise<void> => {
  try {
    const { topicId, userMessage } = req.body;

    //
    const index = pc.index(process.env.PINECONE_INDEX_NAME as string);
    
    const searchResults = await index.searchRecords({
      query: {
        inputs: { text: userMessage }, 
        topK: 10,
        filter: { topicId: { $eq: topicId } }, // Lọc theo đúng bài học này
      },
      fields: ["text"], // Lấy trường text chứa nội dung ngữ pháp sếp đã lưu
    });

    // Rút trích văn bản ngữ pháp an toàn
    let grammarContext = "";
    let isTitleExistsInPinecone = false;

    if (searchResults.result?.hits && searchResults.result.hits.length > 0) {
      grammarContext = searchResults.result.hits
        .map((hit: any) => hit.fields.text)
        .join("\n");
      
      // Nếu Pinecone trả về kết quả, chứng tỏ chủ đề/cấu trúc này ĐÃ TỒN TẠI
      isTitleExistsInPinecone = true;
    }

    // 🚀 BƯỚC 2: XỬ LÝ LOGIC ĐIỀU KIỆN CỦA SẾP
    let mongoVocabText = "";

    if (isTitleExistsInPinecone) {
      // Thỏa mãn điều kiện: Đã có cấu trúc ngữ pháp rồi -> KIÊN QUYẾT KHÔNG LẤY TỪ VỰNG TỪ MONGO NỮA
      console.log("==> 🌲 Pinecone đã có data chủ đề này rồi sếp ơi! Bỏ qua, không lấy từ vựng từ Mongo nữa.");
      mongoVocabText = "Chủ đề này tập trung vào cấu trúc ngữ pháp đã tìm thấy.";
    } else {
      // Nếu Pinecone trống rỗng (chưa có ngữ pháp) -> Tiến hành sang Mongo Atlas bốc từ vựng về cứu cánh
      console.log("==> 🍃 Pinecone chưa có dữ liệu bài này. Tiến hành lấy từ vựng bổ trợ từ Mongo Atlas...");
      
      const currentTopic = await VocabList.findById(topicId);
      if (currentTopic && currentTopic.words) {
        mongoVocabText = (currentTopic.words as any[])
          .map((w) => `${w.term}: ${w.def}`)
          .join(", ");
      } else {
        mongoVocabText = "Không tìm thấy dữ liệu bổ trợ.";
      }
    }

    // 🚀 BƯỚC 3: Trộn dữ liệu linh hoạt vào Prompt gửi cho Gemini 1.5 Flash
    const finalPrompt = `
      Bạn là Sensei dạy tiếng Nhật. Hãy tạo 1 câu hỏi thực hành sinh động dựa trên thông tin được cung cấp:
      - Danh sách từ vựng bổ trợ (Chỉ có nếu chưa có ngữ pháp): [${mongoVocabText}]
      - Cấu trúc ngữ pháp cốt lõi (Ưu tiên hàng đầu từ Pinecone): [${grammarContext}]
      
      Yêu cầu cụ thể của học viên: ${userMessage}
    `;

    // Gọi Gemini sinh câu trả lời cuối cùng
    const chatModel = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const aiResult = await chatModel.generateContent(finalPrompt);

    res.status(200).json({
      success: true,
      reply: aiResult.response.text(),
    });
  } catch (error: any) {
    console.error("❌ Lỗi luồng Đảo Cực RAG Điền Kiện:", error.message);
    res.status(500).json({ error: "Hệ thống RAG gặp sự cố kết nối khi phân tách điều kiện." });
  }
};