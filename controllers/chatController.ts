// File: controllers/chatController.ts

import type { Request, Response } from "express";
import { Pinecone } from "@pinecone-database/pinecone";
import Groq, { toFile } from "groq-sdk";
import VocabList from "../models/VocabList.js"; 
import StudyLog from "../models/StudyLog.js";
import Kanji from "../models/Kanji.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { ValidationError, NotFoundError, UnauthorizedError } from "../utils/errors.js";
import { AuthenticatedRequest } from "../middleware/authMiddleware.js";
import { generateSmartAudio } from "../utils/audio.js";

// =========================================================================
// 📦 1. ĐỊNH NGHĨA CÁC INTERFACES MẪU
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
  type?: "type_cn" | "translate_vi";
}

// =========================================================================
// 🔌 2. KHỞI TẠO CÁC THIRD-PARTY CLIENTS (An toàn khi thiếu ENV & tương thích Vercel)
// =========================================================================
const getPineconeClient = () => {
  if (!process.env.PINECONE_API_KEY) return null;
  try {
    return new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  } catch (err: any) {
    console.warn("⚠️ Không thể khởi tạo Pinecone:", err.message);
    return null;
  }
};

const getGroqClient = (): any => {
  if (!process.env.GROQ_API_KEY) {
    console.warn("⚠️ Chưa cấu hình GROQ_API_KEY trong .env");
  }
  const GroqConstructor: any = (Groq as any).Groq || Groq;
  return new GroqConstructor({ apiKey: process.env.GROQ_API_KEY || "dummy-key" });
};

const groq = getGroqClient();

// =========================================================================
// 💬 3. CÁC HÀM XỬ LÝ LOGIC (CONTROLLERS)
// =========================================================================

/**
 * 🔥 HÀM 1: Xử lý Chat với Sensei Emma (Tối ưu Tiếng Trung Phồn Thể 繁體中文)
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

  // Nén lịch sử: chỉ giữ 120 ký tự đầu của các tin nhắn assistant cũ
  const compressedMessages = trimmedMessages.map((m, i) => {
    const isLastUser = i === trimmedMessages.length - 1;
    if (!isLastUser && m.role === "assistant" && m.content.length > 120) {
      return { ...m, content: m.content.substring(0, 120) + "..." };
    }
    return m;
  });

  console.log("[CHAT] Q:", lastUserMessage.substring(0, 80));

  // RAG Pinecone
  let ragContext = "";
  const pc = getPineconeClient();
  if (pc && process.env.PINECONE_INDEX_NAME) {
    try {
      const index = pc.index(process.env.PINECONE_INDEX_NAME);
      const searchResults = await index.searchRecords({
        query: { inputs: { text: lastUserMessage }, topK: 3 },
        fields: ["text"],
      });
      if (searchResults.result?.hits?.length > 0) {
        ragContext = searchResults.result.hits
          .map((h: any) => (h.fields.text as string).substring(0, 300))
          .join("\n");
      }
    } catch (e: any) {
      console.error("[Pinecone]", e.message);
    }
  }

  // 1. Chữ Hán Phồn Thể — chỉ khi có từ khóa Hán / Phồn Thể
  let kanjiContext = "";
  const hasKanjiKeywords = /hán|phồn thể|zhuyin|chú âm|bopomofo|pinyin|bộ thủ|chữ|bài/i.test(lastUserMessage);
  if (hasKanjiKeywords) {
    try {
      const numMatch = lastUserMessage.match(/(?:bài|lesson|nhóm)\s*(\d+)/i);
      const cnChars = lastUserMessage.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g);
      const queryConds: any[] = [];
      if (numMatch) queryConds.push({ lessonGroup: new RegExp(`\\b0*${numMatch[1]}\\b|bài\\s*0*${numMatch[1]}\\b`, "i") });
      if (cnChars?.length) queryConds.push({ character: { $in: cnChars } });
      if (queryConds.length > 0) {
        const kanjis = await Kanji.find({ $or: queryConds }).limit(15);
        if (kanjis.length > 0) {
          kanjiContext = kanjis.map((k) =>
            `${k.character}(Pinyin:${k.pinyin || "-"}|Chú âm:${k.zhuyin || "-"}|Hán Việt:${k.vietnamese_reading}): ${k.meaning} | ${k.level}`
          ).join("\n");
        }
      }
    } catch (e: any) { console.error("[Hanzi]", e.message); }
  }

  // 2. Vocab — từ vựng tiếng Trung bài cụ thể
  let vocabContext = "";
  const vocabNumMatch = lastUserMessage.match(/(?:từ vựng|vocab|từ mới|bài|lesson).*?(\d+)/i);
  if (vocabNumMatch) {
    try {
      const matched = await VocabList.findOne({
        title: new RegExp(`\\b0*${vocabNumMatch[1]}\\b|bài\\s*0*${vocabNumMatch[1]}\\b`, "i")
      }).select("title words").lean() as any;
      if (matched) {
        vocabContext = `Bài "${matched.title}": ` +
          (matched.words || []).slice(0, 20).map((w: any) => `${w.term} (${w.pinyin || ""}): ${w.def}`).join(" | ");
      }
    } catch (e: any) { console.error("[Vocab]", e.message); }
  }

  // 3. Danh sách bài học & điều hướng
  const hasPracticeIntent = /luyện tập|game|quiz|flashcard|chuyển|mở|vào|chơi|xem|tập|thêm|tạo|học|phát âm/i.test(lastUserMessage);
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

  // Ghép context
  const contextParts: string[] = [];
  if (ragContext) contextParts.push(ragContext);
  if (kanjiContext) contextParts.push("CHỮ HÁN PHỒN THỂ:\n" + kanjiContext);
  if (vocabContext) contextParts.push("TỪ VỰNG PHỒN THỂ:\n" + vocabContext);
  const combinedContext = contextParts.join("\n\n");

  const navSection = hasPracticeIntent ? `
NAV FORMAT (cuối reply nếu user muốn chuyển trang/luyện tập): |||{"navigation":{"tab":"X",...}}|||
TABS: pronunciation,add-grammar,grammar-viewer,add-vocab,vocab,grammar,flashcards,study,quiz,match,write,overview,settings,statistics
GAMES(tab=match): grammar_match,vocab_match,missing,slash,memory,tower,hunter
Ví dụ: "luyện phát âm"->|||{"navigation":{"tab":"pronunciation"}}||| | "thêm từ vựng"->|||{"navigation":{"tab":"add-vocab"}}|||` : "";

  const practiceSection = hasPracticeIntent && vocabListsPromptText
    ? `\nBÀI HỌC: ${vocabListsPromptText}${grammarListsPromptText ? "\nNGỮ PHÁP: " + grammarListsPromptText : ""}`
    : "";

  const systemPrompt = `Bạn là Emma, trợ lý AI thông minh chuyên dạy Tiếng Trung Phồn Thể (繁體中文 - Traditional Chinese / Đài Loan, Hồng Kông) và Chú âm Zhuyin (ㄅㄆㄇㄈ), Pinyin, Âm Hán Việt, TOCFL.
Quy tắc:
- Giao tiếp bằng Tiếng Việt tự nhiên, xưng là "Emma" và gọi người dùng là "bạn" hoặc "học viên".
- Luôn ưu tiên hiển thị Chữ Hán Phồn Thể (Traditional Chinese), kèm theo Pinyin có dấu thanh điệu và/hoặc Chú âm Zhuyin, Âm Hán Việt và dịch nghĩa tiếng Việt chính xác.
- Trả lời ngắn gọn, chuẩn xác ngữ pháp tiếng Trung và phát âm.
- Không dùng emoji quá đà.
- Nếu người dùng muốn chuyển trang hay luyện tập, nói ngắn gọn (không quá 15 từ) rồi trả về thẻ điều hướng ở cuối.${navSection}${practiceSection}${combinedContext ? "\nKIẾN THỨC:\n[" + combinedContext + "]" : ""}`;

  const response = await groq.chat.completions.create({
    messages: [
      { role: "system", content: systemPrompt },
      ...compressedMessages
    ],
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    max_tokens: 512,
  });

  const aiReply = response.choices[0]?.message?.content || "";
  const usage = response.usage;

  // Bóc tách JSON navigation
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

  // Tạo audio TTS tiếng Trung Phồn Thể & tiếng Việt
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
 * 🎙️ HÀM 2: Nhận diện giọng nói (Audio Transcribe - Whisper AI hỗ trợ Tiếng Trung Phồn Thể)
 */
export const transcribe = asyncHandler(async (req: any, res: Response): Promise<void> => {
  console.log("\n=== 🎙️ [TRANSCRIBE] AUDIO UPLOADED ===");
  if (!req.file) {
    throw new ValidationError("Không tìm thấy file âm thanh được tải lên.");
  }

  try {
    const fileObject = await toFile(req.file.buffer, req.file.originalname || "voice.m4a");

    const transcription = await groq.audio.transcriptions.create({
      file: fileObject,
      model: "whisper-large-v3",
      prompt: "繁體中文, 國語, 台灣華語, Tiếng Trung Phồn Thể, Pinyin, Zhuyin, Tiếng Việt",
      language: "zh",
    });

    const transcribedText = transcription.text || "";
    console.log(`- Transcribed text: "${transcribedText}"`);

    res.status(200).json({
      success: true,
      text: transcribedText,
    });
  } catch (error: any) {
    console.error("❌ Lỗi chuyển đổi giọng nói:", error.message);
    throw new ValidationError(`Lỗi Whisper AI: ${error.message}`);
  }
});

/**
 * 🎯 HÀM 3: ĐỌC PHÁT ÂM VÀ MÁY NHẬN DIỆN CHẤM ĐIỂM AI (Pronunciation Assessment)
 * @route POST /api/chat/evaluate-pronunciation
 */
export const evaluatePronunciation = asyncHandler(async (req: any, res: Response): Promise<void> => {
  console.log("\n=== 🎯 [PRONUNCIATION ASSESSMENT] ===");
  if (!req.file) {
    throw new ValidationError("Chưa nhận được file ghi âm giọng nói.");
  }

  const targetText = req.body.targetText || req.body.text || "";
  const targetPinyin = req.body.pinyin || "";
  const targetMeaning = req.body.meaning || "";

  if (!targetText) {
    throw new ValidationError("Thiếu câu/từ mẫu tiếng Trung cần kiểm tra phát âm.");
  }

  console.log(`- Target text: "${targetText}" (${targetPinyin})`);

  try {
    // 1. Nhận diện giọng nói qua Whisper
    const fileObject = await toFile(req.file.buffer, req.file.originalname || "voice.m4a");
    const transcription = await groq.audio.transcriptions.create({
      file: fileObject,
      model: "whisper-large-v3",
      prompt: `繁體中文: ${targetText}`,
      language: "zh",
    });

    const spokenText = (transcription.text || "").trim();
    console.log(`- User spoken: "${spokenText}"`);

    // 2. Chấm điểm & phân tích chi tiết bằng AI LLM
    const evaluationPrompt = `Bạn là chuyên gia thẩm định và chỉnh âm Tiếng Trung Phồn Thể (Traditional Chinese / Taiwanese Mandarin) chuẩn bản xứ.
Nhiệm vụ: Chấm điểm và phân tích phát âm của học viên khi đọc câu mục tiêu.

MỤC TIÊU:
- Câu/từ mẫu chuẩn (Phồn Thể): "${targetText}"
- Pinyin chuẩn: "${targetPinyin || "Tự phân tích"}"
- Nghĩa: "${targetMeaning || "Tự phân tích"}"
- Đoạn âm thanh học viên vừa đọc (Whisper STT ghi lại): "${spokenText || "(Không nghe rõ hoặc im lặng)"}"

HÃY ĐÁNH GIÁ VÀ TRẢ VỀ JSON DUY NHẤT VỚI CẤU TRÚC:
{
  "score": <điểm số từ 0 đến 100, dựa trên độ chính xác phụ âm, nguyên âm, 4 thanh điệu tiếng Trung và độ lưu loát>,
  "spokenText": "${spokenText.replace(/"/g, '\\"')}",
  "targetText": "${targetText.replace(/"/g, '\\"')}",
  "isCorrect": <true nếu score >= 75, ngược lại false>,
  "phoneticFeedback": "Nhận xét chi tiết bằng tiếng Việt ngắn gọn về thanh điệu (thanh 1,2,3,4), âm bật hơi (p, t, k, q, ch, c), âm uốn lưỡi (zh, ch, sh, r), và cách cải thiện khẩu hình",
  "charAnalysis": [
    {
      "char": "Ký tự",
      "pinyin": "pīnyīn",
      "zhuyin": "ㄓㄨˋ ㄧㄣ",
      "status": "correct" | "tone_error" | "phoneme_error" | "missed",
      "note": "Ghi chú ngắn nếu có"
    }
  ]
}`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "system", content: evaluationPrompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" },
    });

    let evalJson: any = {};
    const rawContent = completion.choices[0]?.message?.content || "{}";
    try {
      evalJson = JSON.parse(rawContent);
    } catch (parseErr) {
      evalJson = {
        score: spokenText.includes(targetText) ? 90 : 60,
        spokenText,
        targetText,
        isCorrect: spokenText.includes(targetText),
        phoneticFeedback: "Phát âm khá tốt, cần lưu ý thêm cao độ thanh điệu.",
      };
    }

    // 3. Tạo mẫu audio phát âm chuẩn zh-TW để học viên nghe lại
    let audioReference: string[] = [];
    try {
      audioReference = await generateSmartAudio(targetText, "google", null);
    } catch (e) {}

    res.status(200).json({
      success: true,
      data: {
        score: typeof evalJson.score === "number" ? evalJson.score : 70,
        spokenText: evalJson.spokenText || spokenText,
        targetText: evalJson.targetText || targetText,
        isCorrect: evalJson.isCorrect ?? (evalJson.score >= 75),
        phoneticFeedback: evalJson.phoneticFeedback || "Hãy nghe lại mẫu và thử đọc lại rõ ràng hơn nhé!",
        charAnalysis: evalJson.charAnalysis || [],
        audioReference: audioReference[0] || null,
      },
    });
  } catch (error: any) {
    console.error("❌ Lỗi đánh giá phát âm:", error.message);
    throw new ValidationError(`Lỗi đánh giá phát âm: ${error.message}`);
  }
});

/**
 * 💾 HÀM 4: Lưu lịch sử trò chuyện (Save History)
 */
export const saveHistory = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({ success: true, message: "Đã lưu lịch sử" });
});

/**
 * 🤖 HÀM 5: Gọi Groq AI ra đề ngữ pháp Tiếng Trung Phồn Thể
 * @route POST /api/chat/generate-direct-grammar-quiz
 */
export const generateDirectGrammarQuiz = asyncHandler(async (
  req: Request<{}, {}, DirectQuizRequestBody>, 
  res: Response
): Promise<void> => {
  const { title, formula, meaning, examples, type } = req.body;

  if (!title || !meaning) {
    throw new ValidationError("Thiếu thông tin cấu trúc ngữ pháp để tạo đề.");
  }

  const randomSeed = Math.random().toString(36).substring(2, 10);

  const chatCompletion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: `Bạn là Sensei chuyên luyện thi TOCFL & Tiếng Trung Phồn Thể (Traditional Chinese).
MÃ KHỞI TẠO BỐI CẢNH: [${randomSeed}]

NHIỆM VỤ: Tạo 1 câu hỏi luyện tập NGẮN GỌN, SÚC TÍCH về cấu trúc ngữ pháp sau:
- Ngữ pháp: ${title}
- Công thức: ${formula || "Chưa có"}
- Ý nghĩa: ${meaning}

QUY TẮC:
1. Sử dụng 100% Chữ Hán Phồn Thể (Traditional Chinese / 繁體中文).
2. Ngữ cảnh đời sống giao tiếp Đài Loan, công sở hoặc du lịch thực chiến.
3. Thể loại: "${type || "type_cn"}"
- Nếu "type_cn": 'question' = Câu tiếng Việt, 'correctAnswer' = Câu tiếng Trung Phồn Thể chuẩn kèm Pinyin trong ngoặc.
- Nếu "translate_vi": 'question' = Câu tiếng Trung Phồn Thể, 'correctAnswer' = Dịch chuẩn nghĩa sang tiếng Việt.

TRẢ VỀ JSON:
{
  "type": "${type || "type_cn"}",
  "question": "Câu hỏi",
  "correctAnswer": "Đáp án chuẩn",
  "pinyin": "Pinyin có dấu",
  "zhuyin": "Chú âm (nếu có)",
  "hint": "Gợi ý từ vựng hoặc điểm mấu chốt bằng tiếng Việt"
}`
      }
    ],
    model: "llama-3.3-70b-versatile", 
    temperature: 0.3, 
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
 * 💡 HÀM 6: AI Chatbot gợi ý học tập hàng ngày
 * @route GET /api/chat/daily-suggestion
 */
export const getDailySuggestion = asyncHandler(async (
  req: Request,
  res: Response
): Promise<void> => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    throw new UnauthorizedError("Vui lòng đăng nhập!");
  }

  const allTopics = await VocabList.find({}).select("title words grammarPoints");
  let suggestedTopic = allTopics[0] || null;

  const systemPrompt = `Bạn là Emma, trợ lý AI dạy Tiếng Trung Phồn Thể. Hãy chào người học thân thiện bằng tiếng Việt, gợi ý 1 từ vựng hoặc mẫu câu Phồn Thể hay hôm nay để họ luyện phát âm và ghi nhớ.`;

  const chatCompletion = await groq.chat.completions.create({
    messages: [{ role: "system", content: systemPrompt }],
    model: "llama-3.3-70b-versatile",
    temperature: 0.6,
  });

  const aiReply = chatCompletion.choices[0]?.message?.content;

  res.status(200).json({
    success: true,
    reply: aiReply,
    suggestedTopic: suggestedTopic ? { id: suggestedTopic._id, title: suggestedTopic.title } : null,
  });
});