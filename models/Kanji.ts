import mongoose, { Schema, Document, Model } from "mongoose";

// ── Sub-interface cho 1 từ vựng ví dụ ──
interface IExampleWord {
  word: string;
  reading: string;
  meaning: string;
}

// ── Interface chính cho Kanji Document ──
export interface IKanji extends Document {
  character: string;
  meaning: string;
  pinyin?: string;
  zhuyin?: string; // Chú âm Bopomofo (ㄋㄧˇ ㄏㄠˇ)
  onyomi?: string; // Tương thích ngược
  kunyomi?: string; // Tương thích ngược
  vietnamese_reading: string; // Âm Hán Việt
  level: string; // TOCFL A1-C2, Cơ bản, Trung cấp...
  stroke_order: string[];
  example_words: IExampleWord[];     // Từ ghép ví dụ
  onyomi_examples?: IExampleWord[];   
  kunyomi_examples?: IExampleWord[];  
  components?: string[]; // Bộ thủ / Thành phần chiết tự
  story?: string; // Mẹo nhớ / Giải nghĩa chữ Hán
  lessonGroup?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schema dùng lại cho mảng ví dụ ──
const ExampleWordSchema = {
  word: { type: String, required: true },
  reading: { type: String, required: true },
  meaning: { type: String, required: true },
};

// ── Mongoose Schema ──
const KanjiSchema: Schema<IKanji> = new Schema(
  {
    character: { type: String, required: true },
    meaning: { type: String, required: true },
    pinyin: { type: String, default: "" },
    zhuyin: { type: String, default: "" },
    onyomi: { type: String, default: "" },
    kunyomi: { type: String, default: "" },
    vietnamese_reading: { type: String, required: true },
    level: {
      type: String,
      default: "TOCFL A1",
    },
    stroke_order: [{ type: String }],

    example_words: [ExampleWordSchema],
    onyomi_examples: [ExampleWordSchema],
    kunyomi_examples: [ExampleWordSchema],

    components: [{ type: String }],
    story: { type: String, default: "" },
    lessonGroup: { type: String, default: "" },
  },
  { timestamps: true },
);

// Thêm indexes tối ưu hiệu suất truy vấn
KanjiSchema.index({ character: 1, lessonGroup: 1 }, { unique: true });
KanjiSchema.index({ lessonGroup: 1 });
KanjiSchema.index({ level: 1 });

// ── Chống lỗi OverwriteModelError khi hot-reload ──
const Kanji: Model<IKanji> =
  mongoose.models.Kanji || mongoose.model<IKanji>("Kanji", KanjiSchema);

export default Kanji;
