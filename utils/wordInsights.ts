import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export interface SynonymItem {
  word: string;
  pinyin: string;
  meaning: string;
  difference?: string;
}

export interface UsageItem {
  pattern: string;
  meaning: string;
  exampleCn: string;
  examplePinyin: string;
  exampleVn: string;
}

export interface WordInsightResult {
  word: string;
  pinyin: string;
  hanviet?: string;
  meaning: string;
  synonyms: SynonymItem[];
  usages: UsageItem[];
}

// 📖 KHO TRI THỨC TỪ ĐỒNG NGHĨA & CÁCH DÙNG NGỮ PHÁP PHỒN THỂ ĐƯỢC BIÊN SOẠN CHUẨN XÁC
const BUILTIN_INSIGHTS: Record<string, Omit<WordInsightResult, "word">> = {
  好: {
    pinyin: "hǎo",
    hanviet: "Hảo",
    meaning: "Tốt, đẹp, hay; chào; xong",
    synonyms: [
      { word: "棒", pinyin: "bàng", meaning: "tuyệt, cừ", difference: "Khẩu ngữ khen ngợi xuất sắc, tuyệt vời" },
      { word: "優", pinyin: "yōu", meaning: "ưu tú, tốt", difference: "Trang trọng, dùng trong văn cảnh đánh giá phẩm chất" },
      { word: "佳", pinyin: "jiā", meaning: "giai, tốt đẹp", difference: "Văn viết, dùng trong thành ngữ, lời chúc" },
    ],
    usages: [
      {
        pattern: "好 + Động từ (好吃, 好看, 好聽)",
        meaning: "Dễ làm / Có tính chất tốt, thưởng thức ngon, đẹp, hay",
        exampleCn: "這家餐廳的菜很好吃。",
        examplePinyin: "Zhè jiā cāntīng de cài hěn hǎochī.",
        exampleVn: "Món ăn quán này rất ngon.",
      },
      {
        pattern: "好 + Tính từ (好大, 好冷, 好漂亮)",
        meaning: "Rất, quá (bằng với 很 / 非常)",
        exampleCn: "今天天氣好冷！",
        examplePinyin: "Jīntiān tiānqì hǎo lěng!",
        exampleVn: "Hôm nay trời quá lạnh!",
      },
      {
        pattern: "Động từ + 好 (準備好, 做好了)",
        meaning: "Bổ ngữ chỉ kết quả: làm xong xuôi, hoàn tất thỏa đáng",
        exampleCn: "我已經準備好了。",
        examplePinyin: "Wǒ yǐjīng zhǔnbèi hǎo le.",
        exampleVn: "Tôi đã chuẩn bị xong xuôi rồi.",
      },
    ],
  },
  看: {
    pinyin: "kàn",
    hanviet: "Khán",
    meaning: "Xem, nhìn, đọc, thăm; thấy rằng",
    synonyms: [
      { word: "瞧", pinyin: "qiáo", meaning: "nhìn, liếc nhìn", difference: "Khẩu ngữ gần gũi, nhìn một cái nhanh chóng" },
      { word: "觀", pinyin: "guān", meaning: "quan sát, ngắm", difference: "Trang trọng, quan sát kỹ lưỡng (觀看, 觀察)" },
      { word: "望", pinyin: "wàng", meaning: "trông, ngóng", difference: "Nhìn hướng về phía xa hoặc hy vọng (遠望, 望著)" },
    ],
    usages: [
      {
        pattern: "看 + Danh từ (看書, 看電影)",
        meaning: "Xem, đọc, ngắm thưởng thức",
        exampleCn: "我喜歡週末在家看書。",
        examplePinyin: "Wǒ xǐhuān zhōumò zài jiā kàn shū.",
        exampleVn: "Tôi thích cuối tuần ở nhà đọc sách.",
      },
      {
        pattern: "看 + Người (看朋友, 看醫生)",
        meaning: "Thăm (bạn bè), khám (bác sĩ)",
        exampleCn: "他生病了，下午要去醫院看醫生。",
        examplePinyin: "Tā shēngbìng le, xiàwǔ yào qù yīyuàn kàn yīshēng.",
        exampleVn: "Anh ấy ốm rồi, chiều nay phải đi bệnh viện khám bác sĩ.",
      },
      {
        pattern: "依我看 / 我看...",
        meaning: "Theo tôi thấy, theo ý kiến của tôi",
        exampleCn: "我看這件事需要多花時間準備。",
        examplePinyin: "Wǒ kàn zhè jiàn shì xūyào duō huā shíjiān zhǔnbèi.",
        exampleVn: "Theo tôi thấy việc này cần dành thêm thời gian chuẩn bị.",
      },
    ],
  },
  走: {
    pinyin: "zǒu",
    hanviet: "Tẩu",
    meaning: "Đi, bước đi; rời đi",
    synonyms: [
      { word: "行", pinyin: "xíng", meaning: "bước đi, hành", difference: "Văn viết hoặc dùng trong từ ghép (步行, 行走)" },
      { word: "跑", pinyin: "pǎo", meaning: "chạy", difference: "Di chuyển với tốc độ nhanh hơn đi bộ" },
      { word: "離", pinyin: "lí", meaning: "rời đi, cách", difference: "Rời khỏi một địa điểm (離開)" },
    ],
    usages: [
      {
        pattern: "走路",
        meaning: "Đi bộ di chuyển bằng chân",
        exampleCn: "我家離學校很近，每天都走路去。",
        examplePinyin: "Wǒ jiā lí xuéxiào hěn jìn, měitiān dōu zǒulù qù.",
        exampleVn: "Nhà tôi cách trường rất gần, ngày nào cũng đi bộ đi học.",
      },
      {
        pattern: "走 + Khoảng thời gian / Khoảng cách",
        meaning: "Đi mất bao lâu / bao xa",
        exampleCn: "從這裡走到捷運站只要五分鐘。",
        examplePinyin: "Cóng zhèlǐ zǒu dào jiéyùnzhàn zhǐ yào wǔ fēnzhōng.",
        exampleVn: "Từ đây đi bộ ra ga tàu điện ngầm chỉ mất năm phút.",
      },
      {
        pattern: "我要走了",
        meaning: "Cáo từ, rời đi",
        exampleCn: "時間不早了，我該走了。",
        examplePinyin: "Shíjiān bù zǎo le, wǒ gāi zǒu le.",
        exampleVn: "Thời gian không còn sớm nữa, tôi phải đi rồi.",
      },
    ],
  },
  吃: {
    pinyin: "chī",
    hanviet: "Cật",
    meaning: "Ăn, dùng bữa",
    synonyms: [
      { word: "用餐", pinyin: "yòngcān", meaning: "dùng bữa", difference: "Trang trọng, lịch sự hơn khẩu ngữ 吃飯" },
      { word: "品嚐", pinyin: "pǐncháng", meaning: "thưởng thức", difference: "Nhấm nháp, nếm thử món ngon" },
    ],
    usages: [
      {
        pattern: "吃飯 / 吃 + Món ăn",
        meaning: "Ăn cơm, ăn món gì",
        exampleCn: "你今天中午想吃什麼？",
        examplePinyin: "Nǐ jīntiān zhōngwǔ xiǎng chī shénme?",
        exampleVn: "Trưa nay bạn muốn ăn món gì?",
      },
      {
        pattern: "吃藥",
        meaning: "Uống thuốc (tiếng Trung dùng động từ 'ăn' cho thuốc)",
        exampleCn: "感冒了記得按時吃藥。",
        examplePinyin: "Gǎnmào le jìdé ànshí chī yào.",
        exampleVn: "Bị cảm rồi nhớ uống thuốc đúng giờ.",
      },
    ],
  },
  喝: {
    pinyin: "hē",
    hanviet: "Hát",
    meaning: "Uống (nước, trà, cà phê)",
    synonyms: [
      { word: "飲", pinyin: "yǐn", meaning: "ẩm, uống", difference: "Văn viết, dùng trong từ ghép như 飲料 (đồ uống)" },
    ],
    usages: [
      {
        pattern: "喝茶 / 喝咖啡 / 喝水",
        meaning: "Uống đồ uống",
        exampleCn: "台灣的珍珠奶茶很好喝。",
        examplePinyin: "Táiwān de zhēnzhū nǎichá hěn hǎohē.",
        exampleVn: "Trà sữa trân châu Đài Loan uống rất ngon.",
      },
    ],
  },
  買: {
    pinyin: "mǎi",
    hanviet: "Mãi",
    meaning: "Mua (hàng hóa, sắm sửa)",
    synonyms: [
      { word: "購", pinyin: "gòu", meaning: "mua, cấu", difference: "Trang trọng, văn viết như 購買, 採購" },
    ],
    usages: [
      {
        pattern: "買東西",
        meaning: "Mua sắm đồ đạc",
        exampleCn: "我想去超市買一些水果。",
        examplePinyin: "Wǒ xiǎng qù chāoshì mǎi yīxiē shuǐguǒ.",
        exampleVn: "Tôi muốn đi siêu thị mua một ít hoa quả.",
      },
    ],
  },
  高興: {
    pinyin: "gāoxìng",
    hanviet: "Cao hứng",
    meaning: "Vui vẻ, phấn khởi, vui mừng",
    synonyms: [
      { word: "開心", pinyin: "kāixīn", meaning: "vui vẻ", difference: "Khẩu ngữ phổ biến, tâm trạng thoải mái hân hoan" },
      { word: "愉快", pinyin: "yúkuài", meaning: "vui sướng", difference: "Trang trọng, thanh nhã (祝你週末愉快)" },
      { word: "快樂", pinyin: "kuàilè", meaning: "hạnh phúc, vui tươi", difference: "Niềm vui bền vững, dùng trong lời chúc (生日快樂)" },
    ],
    usages: [
      {
        pattern: "很高興認識你",
        meaning: "Rất vui được làm quen với bạn (câu chào hỏi chuẩn mực)",
        exampleCn: "李先生，很高興認識你！",
        examplePinyin: "Lǐ xiānsheng, hěn gāoxìng rènshì nǐ!",
        exampleVn: "Ông Lý, rất vui được làm quen với ông!",
      },
    ],
  },
  漂亮: {
    pinyin: "piàoliang",
    hanviet: "Phiêu lượng",
    meaning: "Xinh đẹp, đẹp đẽ",
    synonyms: [
      { word: "美麗", pinyin: "měilì", meaning: "mỹ lệ, xinh đẹp", difference: "Trang trọng, diễn tả vẻ đẹp cao quý, cảnh sắc thiên nhiên" },
      { word: "好看", pinyin: "hǎokàn", meaning: "đẹp mắt, ưa nhìn", difference: "Khẩu ngữ giản dị, dùng cho cả người lẫn đồ vật" },
    ],
    usages: [
      {
        pattern: "長得很漂亮",
        meaning: "Ngoại hình rất xinh đẹp",
        exampleCn: "陳月美長得很漂亮。",
        examplePinyin: "Chén Yuèměi zhǎng de hěn piàoliang.",
        exampleVn: "Trần Nguyệt Mỹ trông rất xinh đẹp.",
      },
      {
        pattern: "做得很漂亮",
        meaning: "Làm rất khéo léo, xử lý việc xuất sắc",
        exampleCn: "這件事你辦得真漂亮！",
        examplePinyin: "Zhè jiàn shì nǐ bàn de zhēn piàoliang!",
        exampleVn: "Chuyện này bạn xử lý thật là đẹp mắt/xuất sắc!",
      },
    ],
  },
  超商: {
    pinyin: "chāo shāng",
    hanviet: "Siêu thương",
    meaning: "Cửa hàng tiện lợi, siêu thị mini (tiếng Đài Loan)",
    synonyms: [
      { word: "便利商店", pinyin: "biànlì shāngdiàn", meaning: "cửa hàng tiện lợi", difference: "Tên gọi đầy đủ, chính thức của 7-Eleven, FamilyMart" },
      { word: "超市", pinyin: "chāoshì", meaning: "siêu thị", difference: "Siêu thị lớn hơn (Carrefour, PX Mart...)" },
    ],
    usages: [
      {
        pattern: "去超商買東西 / 繳費",
        meaning: "Đến cửa hàng tiện lợi mua sắm hoặc đóng tiền",
        exampleCn: "台灣的超商非常方便，還可以繳水電費。",
        examplePinyin: "Táiwān de chāoshāng fēicháng fāngbiàn, hái kěyǐ jiǎo shuǐdiànfèi.",
        exampleVn: "Cửa hàng tiện lợi ở Đài Loan rất tiện lợi, còn có thể đóng tiền điện nước.",
      },
    ],
  },
  提款機: {
    pinyin: "tí kuǎn jī",
    hanviet: "Đề khoản cơ",
    meaning: "Máy rút tiền tự động, máy ATM",
    synonyms: [
      { word: "自動櫃員機", pinyin: "zìdòng guìyuán jī", meaning: "máy ATM", difference: "Tên gọi chính thức trong ngân hàng" },
      { word: "ATM", pinyin: "ATM", meaning: "cây ATM", difference: "Cách gọi tắt quốc tế phổ biến" },
    ],
    usages: [
      {
        pattern: "在提款機領錢 / 提錢",
        meaning: "Rút tiền ở cây ATM",
        exampleCn: "超商裡面就有提款機，隨時都可以領錢。",
        examplePinyin: "Chāoshāng lǐmiàn jiù yǒu tíkuǎnjī, suíshí dōu kěyǐ lǐng qián.",
        exampleVn: "Bên trong cửa hàng tiện lợi có sẵn cây ATM, lúc nào cũng có thể rút tiền.",
      },
    ],
  },
  迷路: {
    pinyin: "mílù",
    hanviet: "Mê lộ",
    meaning: "Lạc đường, mất phương hướng",
    synonyms: [
      { word: "走錯路", pinyin: "zǒu cuò lù", meaning: "đi nhầm đường", difference: "Đi lệch khỏi tuyến đường dự kiến" },
      { word: "找不到路", pinyin: "zhǎo bù dào lù", meaning: "không tìm thấy đường", difference: "Không xác định được hướng đi" },
    ],
    usages: [
      {
        pattern: "在...迷路",
        meaning: "Bị lạc ở một nơi nào đó",
        exampleCn: "我第一次來台北，差點在台北車站迷路了。",
        examplePinyin: "Wǒ dì yī cì lái Táiběi, chàdiǎn zài Táiběi chēzhàn mílù le.",
        exampleVn: "Lần đầu tiên tôi đến Đài Bắc, suýt nữa bị lạc ở ga Đài Bắc.",
      },
    ],
  },
  路人: {
    pinyin: "lùrén",
    hanviet: "Lộ nhân",
    meaning: "Người qua đường, người đi bộ",
    synonyms: [
      { word: "行人", pinyin: "xíngrén", meaning: "người đi bộ", difference: "Thuật ngữ giao thông chính thức" },
      { word: "路過的人", pinyin: "lùguò de rén", meaning: "người đi ngang qua", difference: "Diễn đạt miêu tả cụ thể" },
    ],
    usages: [
      {
        pattern: "問路人",
        meaning: "Hỏi thăm người đi đường",
        exampleCn: "如果你不知道怎麼走，可以問問路人。",
        examplePinyin: "Rúguǒ nǐ bù zhīdào zěnme zǒu, kěyǐ wènwen lùrén.",
        exampleVn: "Nếu bạn không biết đi thế nào, có thể hỏi thăm người qua đường.",
      },
    ],
  },
  幫忙: {
    pinyin: "bāngmáng",
    hanviet: "Bang mang",
    meaning: "Giúp đỡ, tương trợ",
    synonyms: [
      { word: "幫助", pinyin: "bāngzhù", meaning: "giúp đỡ", difference: "Từ mang tính trang trọng hơn, có thể nhận tân ngữ phía sau trực tiếp (幫助我)" },
      { word: "協助", pinyin: "xiézhù", meaning: "hỗ trợ, hiệp trợ", difference: "Dùng trong công việc, học thuật (協助完成)" },
    ],
    usages: [
      {
        pattern: "幫...的忙",
        meaning: "Giúp ai đó một tay (động từ ly hợp, không nói 幫忙我 mà nói 幫我的忙)",
        exampleCn: "請你幫我的忙，好嗎？",
        examplePinyin: "Qǐng nǐ bāng wǒ de máng, hǎo ma?",
        exampleVn: "Xin bạn giúp tôi một tay, được không?",
      },
    ],
  },
};

// Bộ nhớ đệm runtime
const runtimeInsightsCache = new Map<string, WordInsightResult>();

/**
 * Lấy thông tin mở rộng: Từ đồng nghĩa, gần nghĩa & Cách dùng khác
 */
export async function getWordInsights(wordText: string): Promise<WordInsightResult> {
  const w = (wordText || "").trim();
  if (!w) {
    throw new Error("Từ tra cứu không được để trống!");
  }

  // 1. Kiểm tra cache runtime
  if (runtimeInsightsCache.has(w)) {
    return runtimeInsightsCache.get(w)!;
  }

  // 2. Kiểm tra bộ từ điển biên soạn sẵn
  if (BUILTIN_INSIGHTS[w]) {
    const res: WordInsightResult = {
      word: w,
      ...BUILTIN_INSIGHTS[w],
    };
    runtimeInsightsCache.set(w, res);
    return res;
  }

  // 3. Tra cứu thông minh qua Gemini AI
  try {
    const prompt = `
Bạn là chuyên gia ngôn ngữ tiếng Trung Phồn Thể (Traditional Chinese - 繁體中文, Đài Loan/TOCFL) và dịch giả cao cấp.
Nhiệm vụ: Cung cấp từ đồng nghĩa (synonyms), từ gần nghĩa và các cách dùng khác nhau / cấu trúc ngữ pháp phổ biến cho từ: "${w}".

YÊU CẦU:
1. "pinyin": Phiên âm có dấu thanh điệu chuẩn.
2. "meaning": Ý nghĩa tiếng Việt chính xác và tự nhiên.
3. "synonyms": Danh sách 2-4 từ đồng nghĩa hoặc gần nghĩa tiếng Trung Phồn Thể, kèm Pinyin, nghĩa tiếng Việt và "difference" giải thích ngắn gọn sắc thái khác nhau.
4. "usages": Danh sách 2-3 cách dùng khác nhau hoặc cấu trúc ngữ pháp kèm ví dụ song ngữ (exampleCn bằng Phồn Thể, examplePinyin, exampleVn).

Trả về định dạng JSON thuần hợp lệ theo schema:
{
  "word": "${w}",
  "pinyin": "...",
  "hanviet": "...",
  "meaning": "...",
  "synonyms": [
    {
      "word": "...",
      "pinyin": "...",
      "meaning": "...",
      "difference": "..."
    }
  ],
  "usages": [
    {
      "pattern": "...",
      "meaning": "...",
      "exampleCn": "...",
      "examplePinyin": "...",
      "exampleVn": "..."
    }
  ]
}
Chỉ trả về JSON hợp lệ, không giải thích gì thêm.
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-3.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const aiRes = await model.generateContent(prompt);
    const text = aiRes.response.text();
    const parsed = JSON.parse(text);

    const result: WordInsightResult = {
      word: w,
      pinyin: parsed.pinyin || "",
      hanviet: parsed.hanviet || "",
      meaning: parsed.meaning || "Từ vựng tiếng Trung",
      synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms : [],
      usages: Array.isArray(parsed.usages) ? parsed.usages : [],
    };

    runtimeInsightsCache.set(w, result);
    return result;
  } catch (err: any) {
    console.warn(`⚠️ [WordInsights] Không thể phân tích qua AI cho từ "${w}":`, err.message);

    // Fallback cơ bản
    return {
      word: w,
      pinyin: "",
      meaning: "Từ vựng tiếng Trung Phồn Thể",
      synonyms: [],
      usages: [],
    };
  }
}
