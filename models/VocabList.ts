// File: models/VocabList.ts

import mongoose, { Schema, Document, Model } from "mongoose";

// 1. Định nghĩa Interface cho cấu trúc Object từ vựng con
export interface IWord {
  term: string;
  def: string;
  correctCount?: number; // 🚀 Bổ sung biến này để chạy logic Game gõ đúng 10 lần
}

// 2. 🚀 THÊM MỚI: Định nghĩa Interface cho Ngữ pháp
export interface IGrammarPoint {
  topicName: string;
  title: string;
  formula?: string;
  meaning: string;
  examples: [{ type: String }]
}

// 3. Định nghĩa Interface cho toàn bộ Document Bài học
export interface IVocabList extends Document {
  title: string;
  words: IWord[];
  grammarPoints: IGrammarPoint[]; // 🚀 Khai báo mảng ngữ pháp vào Interface tổng
  createdAt: Date;
}

// 4. Khởi tạo Schema với Generic Type <IVocabList> để đồng bộ kiểu dữ liệu
const vocabListSchema = new Schema<IVocabList>({
  title: { type: String, required: true },
  
  words: [
    {
      term: { type: String, required: true },
      def: { type: String, required: true },
      correctCount: { type: Number, default: 0 } // 🚀 Lưu vết số lần gõ đúng
    },
  ],

  // 🔥 ĐÃ FIX: Nhét grammarPoints vào BÊN TRONG ruột của Schema
  grammarPoints: [
    {
      topicName: { type: String,required:true},
      title: { type: String, required: true }, // Tên cấu trúc
      formula: { type: String, default: "" },  // Công thức
      meaning: { type: String, required: true },// Ý nghĩa
      examples: [{ type: String,required: true }],
    }
  ],

  createdAt: { type: Date, default: Date.now },
});

// 5. Ép kiểu và Export Model
// Sử dụng toán tử || để đề phòng lỗi "OverwriteModelError" khi nodemon tự động restart server
const VocabList: Model<IVocabList> = 
  mongoose.models.VocabList || mongoose.model<IVocabList>("VocabList", vocabListSchema);

export default VocabList;