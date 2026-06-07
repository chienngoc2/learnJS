import mongoose, { Schema, Document, Model } from "mongoose";

// 1. Định nghĩa Interface cho object con bên trong mảng từ vựng ví dụ
interface IExampleWord {
  word: string;
  reading: string;
  meaning: string;
}

// 2. Định nghĩa Interface chính cho Kanji Document kế thừa từ Document của Mongoose
export interface IKanji extends Document {
  character: string;
  meaning: string;
  onyomi: string;
  kunyomi: string;
  vietnamese_reading: string;
  level: string;
  stroke_order: string[];
  example_words: IExampleWord[];
  components?: string[];
  story?: string;
  lessonGroup?: string; // Tên bài học / bộ kanji (VD: "Bài 1 - Số đếm", "N5 Cơ bản")
  createdAt: Date;
  updatedAt: Date;
}

// 3. Khởi tạo Mongoose Schema với Type Safety định danh rõ ràng <IKanji>
const KanjiSchema: Schema<IKanji> = new Schema(
  {
    character: { type: String, required: true, unique: true },
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
    example_words: [
      {
        word: { type: String, required: true },
        reading: { type: String, required: true },
        meaning: { type: String, required: true },
      },
    ],
    components: [{ type: String }],
    story: { type: String, default: "" },
    lessonGroup: { type: String, default: "" }, // Bài học / Nhóm kanji
  },
  {
    timestamps: true,
  },
);

// 4. Mẹo chống lỗi OverwriteModelError khi chạy trên môi trường Serverless (Vercel Dev)
const Kanji: Model<IKanji> =
  mongoose.models.Kanji || mongoose.model<IKanji>("Kanji", KanjiSchema);

export default Kanji;
