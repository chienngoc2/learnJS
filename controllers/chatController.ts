// File: controllers/chatController.ts

import type { Request, Response } from "express";
import { Pinecone } from "@pinecone-database/pinecone";
import Groq from "groq-sdk";
import VocabList from "../models/VocabList.ts"; 

// =========================================================================
// 📦 1. ĐỊNH NGHĨA CÁC INTERFACES MẪU (Gom gọn lên đầu trang quản lý chặt chẽ)
// =========================================================================
interface QuizRequestBody {
  topicId: string;
  userMessage: string;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
}

interface DirectQuizRequestBody {
  title: string;
  formula?: string;
  meaning: string;
  examples?: string[];
  type?:  "type_jp" | "translate_vi"; // 👈 THÊM DÒNG NÀY
}

// =========================================================================
// 🔌 2. KHỞI TẠO CÁC THIRD-PARTY CLIENTS (Bọc "as string" né lỗi Strict Null Check)
// =========================================================================
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY as string });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY as string });

// =========================================================================
// 💬 3. CÁC HÀM XỬ LÝ LOGIC (CONTROLLERS)
// =========================================================================

/**
 * 🔥 HÀM 1: Xử lý Chat thông thường với Sensei (Có tích hợp RAG tự động)
 */
export const handleChat = async (
  req: Request<{}, {}, ChatRequestBody>,
  res: Response
): Promise<void> => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "Format tin nhắn chat không hợp lệ." });
      return;
    }

    // Lấy câu tin nhắn mới nhất của User để mang đi tìm kiếm Vector Space
    const lastUserMessage = messages[messages.length - 1]?.content || "";
    
    console.log("\n=== 💬 [CHAT] REQUEST ĐẾN ===");
    console.log(`- Câu hỏi cuối: "${lastUserMessage}"`);

    // Truy vấn vào Pinecone để tìm ký ức liên quan (RAG)
    let ragContext = "";
    try {
      const index = pc.index(process.env.PINECONE_INDEX_NAME as string);
      
      const searchResults = await index.searchRecords({
        query: {
          inputs: { text: lastUserMessage },
          topK: 10,
        },
        fields: ["text"],
      });

      if (searchResults.result?.hits && searchResults.result.hits.length > 0) {
        ragContext = searchResults.result.hits
          .map((hit: any) => hit.fields.text)
          .join("\n");
      }
    } catch (pineconeError: any) {
      console.error("⚠️ Lỗi truy vấn Pinecone ở hàm Chat:", pineconeError.message);
    }

    console.log("=== 🌲 [CHAT] KẾT QUẢ PINECONE RAG ===");
    console.log(ragContext || "❌ RỖNG: Không tìm thấy ký ức liên quan, AI dùng kiến thức nền.");

    const systemPrompt = `Bạn là Sensei dạy tiếng Nhật và kỹ năng BrSE. Hãy trò chuyện bằng tiếng Việt thân thiện, tự nhiên.
    
    🔥 KIẾN THỨC BẠN ĐÃ LƯU (Dữ liệu RAG):
    Sử dụng thông tin dưới đây nếu nó liên quan đến câu hỏi của học viên để giải thích hoặc nhắc lại bài cho họ:
    [${ragContext || "Không tìm thấy dữ liệu liên quan trực tiếp trong kho lưu trữ."}]`;

    // Gửi kèm toàn bộ ngữ pháp bổ trợ sang cho LLaMA 3.3 xử lý luận bàn
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        ...messages
      ],
      model: "llama-3.3-70b-versatile",
      temperature: 0.4, 
    });

    const aiReply = response.choices[0]?.message?.content;

    res.status(200).json({
      success: true,
      reply: aiReply,
    });
  } catch (error) {
    console.error("❌ Lỗi trong hàm handleChat RAG:", error);
    res.status(500).json({ error: "Sensei gặp sự cố khi xử lý cuộc trò chuyện." });
  }
};

/**
 * 🚀 HÀM 2: Tạo Quiz theo Topic sử dụng Hybrid RAG (Đảo cực chặn đứng Mongo)
 */
export const generateQuizByTopic = async (
  req: Request<{}, {}, QuizRequestBody>,
  res: Response
): Promise<void> => {
  try {
    const { topicId, userMessage } = req.body;

    console.log("\n=== 📋 [QUIZ] REQUEST ĐẾN ===");
    console.log(`- topicId: ${topicId}`);
    console.log(`- userMessage: ${userMessage}`);

    // Truy vấn Pinecone kiểm tra xem "bài học này đã được học ngữ pháp chưa"
    const index = pc.index(process.env.PINECONE_INDEX_NAME as string);

    const searchResults = await index.searchRecords({
      query: {
        inputs: { text: userMessage },
        topK: 3,
        filter: { topicId: { $eq: topicId } }, 
      },
      fields: ["text"],
    });

    let grammarContext = "";
    let isTitleExistsInPinecone = false;

    if (searchResults.result?.hits && searchResults.result.hits.length > 0) {
      grammarContext = searchResults.result.hits
        .map((hit: any) => hit.fields.text)
        .join("\n");
      isTitleExistsInPinecone = true;
    }

    console.log("=== 🌲 [QUIZ] DATA FROM PINECONE RAG ===");
    console.log(grammarContext || "❌ RỖNG: Chưa có cấu trúc nào trên Pinecone.");

    // ĐẢO CỰC: Nếu đã nạp tài liệu bên Pinecone rồi thì chặn đứng, không cào từ vựng bên Mongo làm nặng đề
    let mongoVocabText = "";

    if (isTitleExistsInPinecone) {
      console.log("==> 🌲 Pinecone đã có bài rồi sếp ơi! Bỏ qua, quyết không bốc từ vựng từ Mongo nữa.");
      mongoVocabText = "Chủ đề này tập trung xoáy sâu vào cấu trúc ngữ pháp đã tìm thấy.";
    } else {
      console.log("==> 🍃 Pinecone trống. Tiến hành truy vấn Mongo Atlas lấy từ vựng bổ trợ...");
      
      const currentTopic = await VocabList.findById(topicId);
      if (!currentTopic) {
        res.status(404).json({ error: "Không tìm thấy bài học này trên Mongo." });
        return;
      }

      mongoVocabText = (currentTopic.words as any[])
        .map((w) => `${w.term}: ${w.def}`)
        .join(", ");
        
      console.log("=== 🍃 [QUIZ] DATA FROM MONGO ATLAS ===");
      console.log(mongoVocabText);
    }

    const messages = [
      {
        role: "system",
        content:
          "Bạn là Sensei dạy tiếng Nhật và kỹ năng BrSE. Hãy trả lời học viên bằng tiếng Việt thân thiện, rõ ràng, đóng vai như một người thầy thực thụ.",
      },
      {
        role: "user",
        content: `Hãy tạo 1 câu hỏi thực hành dựa trên thông tin sau:
          - Danh sách từ vựng bổ trợ (Chỉ có nếu chưa có ngữ pháp): [${mongoVocabText}]
          - Cấu trúc ngữ pháp cốt lõi (Lấy từ Pinecone RAG): [${grammarContext}]
          
          Yêu cầu của học viên: ${userMessage}`,
      },
    ];

    const firstResponse = await groq.chat.completions.create({
      messages: messages as any, 
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
    });

    const aiReply = firstResponse.choices[0]?.message?.content;

    res.status(200).json({
      success: true,
      reply: aiReply,
    });
  } catch (error) {
    console.error("❌ Lỗi luồng RAG với Groq & Pinecone:", error);
    res.status(500).json({ error: "Sensei đang bị đau đầu, không kết nối được hệ thống." });
  }
};

/**
 * 🎙️ HÀM 3: Xử lý chuyển đổi giọng nói (Audio Transcribe)
 */
export const transcribe = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("Hàm transcribe đang được gọi");
    res.status(200).json({ success: true, text: "Chức năng ghi âm đang bảo trì sang TS" });
  } catch (error) {
    console.error("Lỗi hàm transcribe:", error);
    res.status(500).json({ error: "Lỗi xử lý audio" });
  }
};

/**
 * 💾 HÀM 4: Lưu lịch sử trò chuyện (Save History)
 */
export const saveHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("Hàm saveHistory đang được gọi");
    res.status(200).json({ success: true, message: "Đã lưu lịch sử" });
  } catch (error) {
    console.error("Lỗi hàm saveHistory:", error);
    res.status(500).json({ error: "Lỗi lưu lịch sử" });
  }
};

/**
 * 🤖 HÀM 5: Gọi Groq AI ra đề trực diện từ cấu trúc ngữ pháp (Dùng mảng examples[] mới tinh)
 * @route POST /api/chat/generate-direct-grammar-quiz
 */
// 🚀 CẬP NHẬT: Đã gỡ bỏ "scramble" khỏi hệ thống
interface DirectQuizRequestBody {
  title: string;
  formula?: string;
  meaning: string;
  examples?: string[];
  type?: "type_jp" | "translate_vi"; 
}

export const generateDirectGrammarQuiz = async (
  req: Request<{}, {}, DirectQuizRequestBody>, 
  res: Response
): Promise<void> => {
  try {
    const { title, formula, meaning, examples, type } = req.body;

    // Chặn lỗi bọc đầu bằng TypeScript
    if (!title || !meaning) {
      res.status(400).json({ success: false, message: "Thiếu thông tin cấu trúc ngữ pháp để tiến hành ra đề sếp ơi!" });
      return;
    }

    console.log(`🎲 [Groq AI] Đang soạn đề dạng [${type || "Ngẫu nhiên"}] cho cấu trúc: ${title}`);

  // File: controllers/chatController.ts (Bên trong hàm generateDirectGrammarQuiz)

    // 🚀 BƠM MÃ ĐỘT BIẾN: Tạo một chuỗi ngẫu nhiên (VD: "5g8j2k1p") để đánh lừa hoàn toàn bộ nhớ đệm của LLM
    // File: controllers/chatController.ts (Bên trong hàm generateDirectGrammarQuiz)

    // 🚀 MÃ ĐỘT BIẾN: Vẫn giữ mã này để 6 câu không bao giờ bị trùng lặp nhau
    const randomSeed = Math.random().toString(36).substring(2, 10);

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Bạn là một Sensei tiếng Nhật JLPT & BrSE lão luyện.
          MÃ KHỞI TẠO BỐI CẢNH: [${randomSeed}] - Dùng mã này để sinh ra 1 bối cảnh hoàn toàn ngẫu nhiên.

          NHIỆM VỤ: Tạo 1 câu hỏi luyện tập NGẮN GỌN, SÚC TÍCH tập trung 100% vào cấu trúc ngữ pháp sau:
          - Ngữ pháp: ${title}
          - Công thức: ${formula || "Chưa có"}
          - Ý nghĩa: ${meaning}

           3 QUY TẮC THÉP TẠO ĐỀ (CÂN BẰNG NGỮ PHÁP & NGỮ CẢNH):
          1. BÁM SÁT NGỮ PHÁP LÀ SỐ 1: Câu hỏi phải lấy cấu trúc [${title}] làm trung tâm. Cấu trúc câu cần NGẮN GỌN, RÕ RÀNG, đi thẳng vào vấn đề. Tuyệt đối không được nhồi nhét quá nhiều mệnh đề phụ dài dòng làm lu mờ ngữ pháp chính.
          2. NGỮ CẢNH ĐA DẠNG, THỰC CHIẾN:  Cấm dùng các ví dụ sách giáo khoa trẻ con (như: đi học, ăn táo, xem phim, thời tiết). ✅ HÃY THAY BẰNG từ vựng của người trưởng thành/đi làm: chốt lịch họp, gửi email, đi công tác, báo cáo sếp, đi siêu thị, nhà hàng, kẹt xe, du lịch, v.v. (Nhưng vẫn phải giữ câu ngắn gọn).
          3. KANJI N5 BẮT BUỘC: CHỈ DÙNG Kanji siêu cơ bản N5 (私, 人, 行, 見, 食, 買, 今, 何...). Mọi từ vựng khó khác BẮT BUỘC viết bằng Hiragana (ví dụ: かいぎ, しゅっちょう, ざんぎょう) để học viên dễ đọc.

           THỂ LOẠI ĐỀ BẮT BUỘC: "${type || "type_jp"}"
          - Dạng "type_jp": 'question' = Câu tiếng Việt, 'correctAnswer' = Câu tiếng Nhật tương ứng (Chỉ Kanji N5 + Hiragana).
          - Dạng "translate_vi": 'question' = Câu tiếng Nhật, 'correctAnswer' = Dịch sát nghĩa sang tiếng Việt.

          CHỈ TRẢ VỀ JSON thuần túy:
          {
            "type": "${type || "type_jp"}",
            "question": "Câu hỏi bám sát ngữ pháp nhưng có từ vựng thực chiến",
            "correctAnswer": "Đáp án chuẩn mẫu (ngắn gọn, chuẩn ngữ pháp, không chứa khoảng trắng)",
            "hint": "Gợi ý 1 từ vựng khó hoặc trợ từ quan trọng trong câu bằng Tiếng Việt"
          }`
        }
      ],
      model: "llama-3.3-70b-versatile", 
      temperature: 0.4, 
      response_format: { type: "json_object" } 
    });

    const aiReply: string | null = chatCompletion.choices[0]?.message?.content;

    res.status(200).json({ 
      success: true, 
      reply: aiReply 
    });

  } catch (error: any) {
    console.error("❌ Lỗi hệ thống khi gọi Groq soạn đề:", error.message);
    res.status(500).json({ 
      success: false, 
      error: "AI bận soạn giáo án sếp ơi!" 
    });
  }
};