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
  onyomi: string;
  kunyomi: string;
  vietnamese_reading: string;
  level: string;
  stroke_order: string[];
  example_words: IExampleWord[];     // Từ vựng chung (legacy, tuỳ chọn)
  onyomi_examples: IExampleWord[];   // 3-4 ví dụ cho âm ON
  kunyomi_examples: IExampleWord[];  // 3-4 ví dụ cho âm KUN
  components?: string[];
  story?: string;
  lessonGroup?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sub-schema dùng lại cho 2 mảng ví dụ ──
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
    onyomi: { type: String, default: "" },
    kunyomi: { type: String, default: "" },
    vietnamese_reading: { type: String, required: true },
    level: {
      type: String,
      required: true,
      enum: ["N5", "N4", "N3", "N2", "N1"],
    },
    stroke_order: [{ type: String }],

    // Từ vựng chung (legacy, vẫn giữ để tương thích ngược)
    example_words: [ExampleWordSchema],

    // ✨ MỚI: ví dụ riêng cho từng loại âm
    onyomi_examples: [ExampleWordSchema],   // 3-4 từ dùng âm ON
    kunyomi_examples: [ExampleWordSchema],  // 3-4 từ dùng âm KUN

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
