// File: models/VocabList.ts

import mongoose, { Schema, Document, Model } from "mongoose";

// ==========================================
// 1. ĐỊNH NGHĨA INTERFACE (CHUẨN TYPESCRIPT)
// ==========================================
export interface IWord {
  term: string;
  def: string;
  correctCount?: number; 
}

export interface IGrammarPoint {
  topicName: string;
  title: string;
  formula?: string;
  meaning: string;
  examples: string[]; // 🚀 ĐÃ FIX: Mảng chuỗi trong TypeScript phải viết thế này
}

export interface IVocabList extends Document {
  title: string;
  words: IWord[];
  grammarPoints: IGrammarPoint[]; 
  createdAt: Date;
}

// ==========================================
// 2. KHỞI TẠO SCHEMA (CHUẨN MONGOOSE)
// ==========================================
const vocabListSchema = new Schema<IVocabList>({
  title: { type: String, required: true },
  
  words: [
    {
      term: { type: String, required: true },
      def: { type: String, required: true },
      correctCount: { type: Number, default: 0 } 
    },
  ],

  grammarPoints: [
    {
      topicName: { type: String, required: true },
      title: { type: String, required: true }, 
      formula: { type: String, default: "" },  
      meaning: { type: String, required: true },
      examples: { type: [String], default: [] }, // 🚀 ĐÃ FIX: Cách khai báo mảng chuỗi chuẩn của Mongoose
    }
  ],

  createdAt: { type: Date, default: Date.now },
});

// ==========================================
// 3. EXPORT MODEL
// ==========================================
const VocabList: Model<IVocabList> = 
  mongoose.models.VocabList || mongoose.model<IVocabList>("VocabList", vocabListSchema);

export default VocabList;