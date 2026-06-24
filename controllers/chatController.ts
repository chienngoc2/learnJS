// File: controllers/chatController.ts

import type { Request, Response } from "express";
import { Pinecone } from "@pinecone-database/pinecone";
import Groq from "groq-sdk";
import fs from "fs";
import VocabList from "../models/VocabList.js"; 
import StudyLog from "../models/StudyLog.js";
import Kanji from "../models/Kanji.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { ValidationError, NotFoundError } from "../utils/errors.js";
import { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { generateSmartAudio } from "../utils/audio.js";

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
  type?: "type_jp" | "translate_vi";
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
export const handleChat = asyncHandler(async (
  req: Request<{}, {}, ChatRequestBody>,
  res: Response
): Promise<void> => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    throw new ValidationError("Format tin nhắn chat không hợp lệ.");
  }

  // Giữ tối đa 4 tin nhắn gần nhất
  const trimmedMessages = messages.slice(-4);
  const lastUserMessage = trimmedMessages[trimmedMessages.length - 1]?.content || "";

  // Nén lịch sử: chỉ giữ 120 ký tự đầu của các tin nhắn assistant cũ (giảm bồng to context)
  const compressedMessages = trimmedMessages.map((m, i) => {
    const isLastUser = i === trimmedMessages.length - 1;
    if (!isLastUser && m.role === "assistant" && m.content.length > 120) {
      return { ...m, content: m.content.substring(0, 120) + "..." };
    }
    return m;
  });

  console.log("[CHAT] Q:", lastUserMessage.substring(0, 80));

  // RAG Pinecone — topK=3 lấy đủ ngữ cảnh, ít token hơn
  let ragContext = "";
  try {
    const index = pc.index(process.env.PINECONE_INDEX_NAME as string);
    const searchResults = await index.searchRecords({
      query: { inputs: { text: lastUserMessage }, topK: 3 },
      fields: ["text"],
    });
    if (searchResults.result?.hits?.length > 0) {
      ragContext = searchResults.result.hits
        .map((h: any) => (h.fields.text as string).substring(0, 300)) // cap 300 chars/hit
        .join("\n");
    }
  } catch (e: any) {
    console.error("[Pinecone]", e.message);
  }

  // === CONDITIONAL CONTEXT INJECTION (cost-latency-optimizer) ===
  // Chỉ truy vấn DB khi câu hỏi thực sự liên quan → tiết kiệm token + latency

  // 1. Kanji — chỉ khi có từ khóa kanji/hán rõ ràng (không phải chỉ vì "bài")
  let kanjiContext = "";
  const hasKanjiKeywords = /kanji|chữ hán|hán tự|hán việt/i.test(lastUserMessage);
  if (hasKanjiKeywords) {
    try {
      const numMatch = lastUserMessage.match(/(?:bài|lesson|nhóm)\s*(\d+)/i);
      const jpChars = lastUserMessage.match(/[\u4e00-\u9faf]/g);
      const queryConds: any[] = [];
      if (numMatch) queryConds.push({ lessonGroup: new RegExp(`\\b0*${numMatch[1]}\\b|bài\\s*0*${numMatch[1]}\\b`, "i") });
      if (jpChars?.length) queryConds.push({ character: { $in: jpChars } });
      if (queryConds.length > 0) {
        const kanjis = await Kanji.find({ $or: queryConds }).limit(15);
        if (kanjis.length > 0)
          kanjiContext = kanjis.map((k) =>
            `${k.character}(${k.vietnamese_reading}):${k.meaning}|${k.level}|ON:${k.onyomi || "-"}|KUN:${k.kunyomi || "-"}`
          ).join("\n");
      }
    } catch (e: any) { console.error("[Kanji]", e.message); }
  }

  // 2. Vocab — chỉ khi hỏi từ vựng bài cụ thể (có số bài)
  let vocabContext = "";
  const vocabNumMatch = lastUserMessage.match(/(?:từ vựng|vocab|từ mới|bài|lesson).*?(\d+)/i);
  if (vocabNumMatch) {
    try {
      const matched = await VocabList.findOne({
        title: new RegExp(`\\b0*${vocabNumMatch[1]}\\b|bài\\s*0*${vocabNumMatch[1]}\\b`, "i")
      }).select("title words").lean() as any;
      if (matched)
        vocabContext = `Bài "${matched.title}": ` +
          (matched.words || []).slice(0, 20).map((w: any) => `${w.term}:${w.def}`).join(" | ");
    } catch (e: any) { console.error("[Vocab]", e.message); }
  }

  // 3. Danh sách bài học — chỉ load khi user có intent luyện tập/chuyển trang
  const hasPracticeIntent = /luyện tập|game|quiz|flashcard|chuyển|mở|vào|chơi|xem|tập|thêm|tạo|học/i.test(lastUserMessage);
  let vocabListsPromptText = "";
  let grammarListsPromptText = "";
  if (hasPracticeIntent) {
    try {
      const lists = await VocabList.find({}).select("title grammarPoints").lean() as any[];
      const allLists = lists.map((l: any) => ({
        id: l._id.toString(),
        title: l.title,
        hasGrammar: !!(l.grammarPoints?.length)
      }));
      vocabListsPromptText = allLists.map(l => `${l.title}(${l.id})${l.hasGrammar ? "[GP]" : ""}`).join(", ");
      grammarListsPromptText = allLists.filter(l => l.hasGrammar).map(l => `${l.title}(${l.id})`).join(", ");
    } catch (e: any) { console.error("[VocabList]", e.message); }
  }

  // Ghép combined context
  const contextParts: string[] = [];
  if (ragContext) contextParts.push(ragContext);
  if (kanjiContext) contextParts.push("KANJI:\n" + kanjiContext);
  if (vocabContext) contextParts.push("TỪ VỰNG:\n" + vocabContext);
  const combinedContext = contextParts.join("\n\n");

  // Chỉ inject NAV_RULES khi user có intent điều hướng/luyện tập
  const navSection = hasPracticeIntent ? `
NAV FORMAT (cuối reply): |||{"navigation":{"tab":"X",...}}|||
TABS: add-grammar,grammar-viewer,add-vocab,vocab,grammar,flashcards,study,quiz,match,write,overview,settings,statistics
GAMES(tab=match): grammar_match,vocab_match,missing,slash,memory,tower,hunter
MODES(tab=quiz): vocab,grammar
PHẢI tự navigate. Ví dụ: "thêm ngữ pháp"->|||{"navigation":{"tab":"add-grammar"}}||| | "nối ngữ pháp"->|||{"navigation":{"tab":"match","game":"grammar_match"}}|||` : "";

  const practiceSection = hasPracticeIntent && vocabListsPromptText
    ? `\nBÀI HỌC: ${vocabListsPromptText}${grammarListsPromptText ? "\nNGỦ PHÁP: " + grammarListsPromptText : ""}`
    : "";

  const systemPrompt = `Bạn là Shiba, trợ lý AI dạy tiếng Nhật. Tiếng Việt, xưng hô là "Shiba" và gọi người dùng là "bạn" hoặc "học viên" (KHÔNG dùng từ "sếp"). Không dùng emoji. Trả lời cực kỳ ngắn gọn, súc tích. Đặc biệt, nếu người dùng muốn chuyển trang, hãy nói cực kỳ ngắn gọn (không quá 15 từ, ví dụ: "Để Shiba đưa bạn qua đó nhé!") rồi trả về thẻ điều hướng.${navSection}${practiceSection}${combinedContext ? "\nKIẾN THỨC:[" + combinedContext + "]" : ""}`;


  const response = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      ...compressedMessages
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.1, // giảm xuống 0.1 để output ngắn gọn, ít token hơn
    max_tokens: 512,  // giới hạn output tối đa: đủ trả lời + nav tag
  });

  const aiReply = response.choices[0]?.message?.content || "";
  const usage = response.usage; // Lấy thông tin token tiêu thụ thực tế

  console.log("\n=== 🤖 [AI] RAW REPLY FROM LLM ===");
  console.log(aiReply);

  // Định nghĩa Regex để bóc tách thông tin điều hướng từ phản hồi của LLM
  let reply = aiReply;
  let navigation = null;
  const navRegex = /\|\|\|([\s\S]*?)\|\|\|/;
  const navMatch = aiReply.match(navRegex);
  if (navMatch) {
    try {
      const navData = JSON.parse(navMatch[1].trim());
      reply = aiReply.replace(navRegex, '').trim();
      navigation = navData.navigation;
    } catch (e) {
      console.error("Lỗi parse JSON navigation từ LLM:", e);
    }
  }

  console.log("=== 🧩 [AI] PARSED NAVIGATION RESULT ===");
  console.log(navigation);
  console.log("=== 💬 [AI] CLEAN REPLY TO CLIENT ===");
  console.log(reply);

  // Tạo audio cho câu trả lời của AI
  let audioSegments: string[] = [];
  try {
    if (reply) {
      audioSegments = await generateSmartAudio(reply, "google", null);
    }
  } catch (audioErr: any) {
    console.error("⚠️ Lỗi tạo audio TTS cho câu trả lời:", audioErr.message);
  }

  res.status(200).json({
    success: true,
    reply: reply,
    navigation: navigation,
    usage: usage || null,
    audioSegments: audioSegments.length > 0 ? audioSegments : undefined,
  });
});

/**
 * 🚀 HÀM 2: Tạo Quiz theo Topic sử dụng Hybrid RAG (Đảo cực chặn đứng Mongo)
 */
export const generateQuizByTopic = asyncHandler(async (
  req: Request<{}, {}, QuizRequestBody>,
  res: Response
): Promise<void> => {
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

  console.log("===  [QUIZ] DATA FROM PINECONE RAG ===");
  console.log(grammarContext || " RỖNG: Chưa có cấu trúc nào trên Pinecone.");

  // ĐẢO CỰC: Nếu đã nạp tài liệu bên Pinecone rồi thì chặn đứng, không cào từ vựng bên Mongo làm nặng đề
  let mongoVocabText = "";

  if (isTitleExistsInPinecone) {
    console.log("==>  Pinecone đã có bài rồi sếp ơi! Bỏ qua, quyết không bốc từ vựng từ Mongo nữa.");
    mongoVocabText = "Chủ đề này tập trung xoáy sâu vào cấu trúc ngữ pháp đã tìm thấy.";
  } else {
    console.log("==>  Pinecone trống. Tiến hành truy vấn Mongo Atlas lấy từ vựng bổ trợ...");
    
    const currentTopic = await VocabList.findById(topicId);
    if (!currentTopic) {
      throw new NotFoundError("Không tìm thấy bài học này trên Mongo.");
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
        "Bạn là Sensei dạy tiếng Nhật . Hãy trả lời học viên bằng tiếng Việt thân thiện, rõ ràng, đóng vai như một người thầy thực thụ.",
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
});

/**
 * 🎙️ HÀM 3: Xử lý chuyển đổi giọng nói (Audio Transcribe)
 */
export const transcribe = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  console.log("\n=== 🎙️ [TRANSCRIBE] AUDIO UPLOADED ===");
  if (!req.file) {
    throw new ValidationError("Không tìm thấy file âm thanh được tải lên.");
  }

  console.log(`- File path: ${req.file.path}`);
  console.log(`- File size: ${req.file.size} bytes`);

  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(req.file.path),
      model: "whisper-large-v3",
    });

    const transcribedText = transcription.text || "";
    console.log(`- Transcribed text: "${transcribedText}"`);

    // Clean up temporary audio file from disk
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      console.log("- Đã dọn dẹp file ghi âm tạm thời.");
    }

    res.status(200).json({
      success: true,
      text: transcribedText,
    });
  } catch (error: any) {
    console.error("❌ Lỗi chuyển đổi giọng nói:", error.message);
    // Cleanup on error too
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    throw new ValidationError(`Lỗi Whisper AI: ${error.message}`);
  }
});

/**
 * 💾 HÀM 4: Lưu lịch sử trò chuyện (Save History)
 */
export const saveHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  console.log("Hàm saveHistory đang được gọi");
  res.status(200).json({ success: true, message: "Đã lưu lịch sử" });
});

/**
 * 🤖 HÀM 5: Gọi Groq AI ra đề trực diện từ cấu trúc ngữ pháp (Dùng mảng examples[] mới tinh)
 * @route POST /api/chat/generate-direct-grammar-quiz
 */
export const generateDirectGrammarQuiz = asyncHandler(async (
  req: Request<{}, {}, DirectQuizRequestBody>, 
  res: Response
): Promise<void> => {
  const { title, formula, meaning, examples, type } = req.body;

  // Chặn lỗi bọc đầu bằng TypeScript
  if (!title || !meaning) {
    throw new ValidationError("Thiếu thông tin cấu trúc ngữ pháp để tiến hành ra đề sếp ơi!");
  }

  console.log(`🎲 [Groq AI] Đang soạn đề dạng [${type || "Ngẫu nhiên"}] cho cấu trúc: ${title}`);

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

  let aiReply: string | null = chatCompletion.choices[0]?.message?.content;
  if (aiReply) {
    aiReply = aiReply.replace(/```json\n|\n```|```/g, "").trim();
  }

  res.status(200).json({ 
    success: true, 
    reply: aiReply 
  });
});

/**
 * 💡 HÀM 6: AI Chatbot gợi ý học tập hàng ngày dựa trên lịch sử hôm qua của User
 * @route GET /api/chat/daily-suggestion
 */
export const getDailySuggestion = asyncHandler(async (
  req: Request,
  res: Response
): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    throw new UnauthorizedError("Sếp chưa đăng nhập!");
  }

  const userId = authReq.user._id;

  // 1. Tính toán mốc thời gian "ngày hôm qua" (Yesterday)
  const today = new Date();
  const startOfYesterday = new Date(today);
  startOfYesterday.setDate(today.getDate() - 1);
  startOfYesterday.setHours(0, 0, 0, 0);

  const endOfYesterday = new Date(today);
  endOfYesterday.setDate(today.getDate() - 1);
  endOfYesterday.setHours(23, 59, 59, 999);

  console.log(`🔍 [Suggestion] Tìm log từ ${startOfYesterday.toISOString()} đến ${endOfYesterday.toISOString()} cho user ${authReq.user.username}`);

  // 2. Tìm bài học được xem nhiều nhất ngày hôm qua của User
  const topLog = await StudyLog.aggregate([
    {
      $match: {
        userId: userId,
        createdAt: { $gte: startOfYesterday, $lte: endOfYesterday },
      },
    },
    {
      $group: {
        _id: "$vocabListId",
        count: { $sum: 1 },
      },
    },
    {
      $sort: { count: -1 },
    },
    {
      $limit: 1,
    },
  ]);

  let suggestedTopic: any = null;
  let newTopic: any = null;
  let oldTopicContext = "Chưa có lịch sử học tập hôm qua.";
  let selectedQuizItem: any = null;

  // Lấy danh sách tất cả các bài học để làm kho gợi ý
  const allTopics = await VocabList.find({}).select("title words grammarPoints");

  if (topLog && topLog.length > 0) {
    const topTopicId = topLog[0]._id;
    suggestedTopic = allTopics.find((t) => t._id.toString() === topTopicId.toString());
  }

  // Nếu tìm thấy bài học cũ đã học hôm qua
  if (suggestedTopic) {
    console.log(`🔥 [Suggestion] Phát hiện bài học cũ xem nhiều nhất: ${suggestedTopic.title}`);
    
    // Tạo context từ vựng/ngữ pháp của bài cũ để AI ra đề
    const wordsText = (suggestedTopic.words || [])
      .map((w: any) => `${w.term}: ${w.def}`)
      .join(", ");
    
    const grammarText = (suggestedTopic.grammarPoints || [])
      .map((g: any) => `Cấu trúc: ${g.title} - Nghĩa: ${g.meaning}`)
      .join("; ");

    oldTopicContext = `Chủ đề: ${suggestedTopic.title}. Từ vựng: [${wordsText}]. Ngữ pháp: [${grammarText}].`;

    // Chọn ngẫu nhiên 1 từ vựng hoặc 1 cấu trúc ngữ pháp để làm Quiz
    const hasWords = suggestedTopic.words && suggestedTopic.words.length > 0;
    const hasGrammar = suggestedTopic.grammarPoints && suggestedTopic.grammarPoints.length > 0;

    if (hasWords && (!hasGrammar || Math.random() > 0.5)) {
      // Chọn từ vựng
      const randomWord = suggestedTopic.words[Math.floor(Math.random() * suggestedTopic.words.length)];
      selectedQuizItem = {
        type: "vocabulary",
        term: randomWord.term,
        def: randomWord.def,
      };
    } else if (hasGrammar) {
      // Chọn ngữ pháp
      const randomGrammar = suggestedTopic.grammarPoints[Math.floor(Math.random() * suggestedTopic.grammarPoints.length)];
      selectedQuizItem = {
        type: "grammar",
        title: randomGrammar.title,
        meaning: randomGrammar.meaning,
        formula: randomGrammar.formula || "",
      };
    }

    // Tìm bài học mới gợi ý: Chọn bài học tiếp theo (hoặc bài chưa xem)
    newTopic = allTopics.find(
      (t) => t._id.toString() !== suggestedTopic._id.toString()
    );
  } else {
    // Nếu hôm qua không học gì, chọn đại 1 bài học cũ ngẫu nhiên trong DB (nếu có) để nhắc nhở ôn tập
    console.log("💤 [Suggestion] Hôm qua sếp không học gì. Chọn ngẫu nhiên bài ôn tập...");
    if (allTopics.length > 0) {
      suggestedTopic = allTopics[Math.floor(Math.random() * allTopics.length)];
      
      const wordsText = (suggestedTopic.words || [])
        .map((w: any) => `${w.term}: ${w.def}`)
        .join(", ");
      oldTopicContext = `Chủ đề: ${suggestedTopic.title}. Từ vựng ôn tập: [${wordsText}].`;

      if (suggestedTopic.words && suggestedTopic.words.length > 0) {
        const randomWord = suggestedTopic.words[Math.floor(Math.random() * suggestedTopic.words.length)];
        selectedQuizItem = {
          type: "vocabulary",
          term: randomWord.term,
          def: randomWord.def,
        };
      }
      
      // Gợi ý bài học mới là một bài khác
      newTopic = allTopics.find(
        (t) => t._id.toString() !== suggestedTopic._id.toString()
      );
    }
  }

  // Tên bài học mới gợi ý
  const newTopicTitle = newTopic ? newTopic.title : "Chưa có bài học mới nào khác";

  // 3. Soạn prompt gửi cho Groq LLaMA sinh lời chào và câu hỏi ôn tập
  const quizPrompt = selectedQuizItem
    ? `Hãy tạo 1 câu hỏi ôn tập ngắn gọn từ nội dung cũ: ${
        selectedQuizItem.type === "vocabulary"
          ? `Từ vựng: "${selectedQuizItem.term}" (nghĩa: "${selectedQuizItem.def}")`
          : `Ngữ pháp: "${selectedQuizItem.title}" (ý nghĩa: "${selectedQuizItem.meaning}", công thức: "${selectedQuizItem.formula}")`
      }`
    : "Yêu cầu học viên học một bài mới.";

  const systemPrompt = `Bạn là nữ nhân vật Emma, trợ lý dạy tiếng Nhật .
  NHIỆM VỤ: Hãy chào học viên bằng Tiếng Việt cực kỳ thân thiện, thông báo bài học hôm qua họ đã xem nhiều nhất (hoặc nhắc nhở nếu hôm qua họ chưa học) và đề xuất:
  1. Đưa ra một câu hỏi ôn tập (quiz) nhanh dựa trên bài học cũ để kiểm tra HỌC VIÊN.
  2. Gợi ý họ nghiên cứu bài học mới ngày hôm nay.

  THÔNG TIN HỌC TẬP:
  - Bài học hôm qua xem nhiều nhất: ${suggestedTopic ? suggestedTopic.title : "Không học gì"}
  - Chi tiết ôn tập: [${oldTopicContext}]
  - Bài học mới gợi ý học hôm nay: ${newTopicTitle}
  - Câu hỏi ôn tập mục tiêu: [${quizPrompt}]

  YÊU CẦU TRẢ LỜI:
  - Giữ phong cách Shiba vui vẻ, khích lệ học viên, xưng hô là "Shiba" và gọi người dùng là "bạn" hoặc "học viên" thân mật (KHÔNG dùng từ "sếp").
  - Đưa câu hỏi trắc nghiệm hoặc dịch thuật ngắn gọn, rõ ràng ở cuối tin nhắn.
  - KHÔNG trả về định dạng code markdown dư thừa, chỉ trả về chuỗi text bình thường.`;

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.7,
  });

  const aiReply = chatCompletion.choices[0]?.message?.content;

  res.status(200).json({
    success: true,
    reply: aiReply,
    suggestedTopic: suggestedTopic
      ? { id: suggestedTopic._id, title: suggestedTopic.title }
      : null,
    newTopic: newTopic ? { id: newTopic._id, title: newTopic.title } : null,
    quiz: selectedQuizItem,
  });
});