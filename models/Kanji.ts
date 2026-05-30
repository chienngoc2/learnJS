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
      required: true, // Ép buộc file JSON phải khai báo cấp độ, không cho phép bỏ trống
      enum: ["N5", "N4", "N3", "N2", "N1"], // Chỉ chấp nhận 1 trong 5 giá trị này
    },
    stroke_order: [{ type: String }],
    example_words: [
      {
        word: { type: String, required: true },
        reading: { type: String, required: true },
        meaning: { type: String, required: true },
      },
    ],
  },
  {
    timestamps: true, // Tự động sinh ra trường createdAt và updatedAt kiểu Date
  },
);

// 4. Mẹo chống lỗi OverwriteModelError khi chạy trên môi trường Serverless (Vercel Dev)
// Hệ thống sẽ check xem model Kanji đã được biên dịch trong bộ nhớ chưa, nếu có thì dùng lại, chưa thì mới tạo mới.
const Kanji: Model<IKanji> =
  mongoose.models.Kanji || mongoose.model<IKanji>("Kanji", KanjiSchema);

export default Kanji;
