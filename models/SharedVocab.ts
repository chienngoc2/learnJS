import mongoose, { Schema, Document } from "mongoose";

export interface ISharedVocab extends Document {
  word: string;
  pinyin: string;
  cleanPinyin: string;
  hanviet: string;
  meaning: string;
  cleanMeaning: string;
  pos: string;
  level: string;
  sources: string[];
  createdAt: Date;
  updatedAt: Date;
}

const SharedVocabSchema = new Schema<ISharedVocab>(
  {
    word: { type: String, required: true, unique: true, index: true, trim: true },
    pinyin: { type: String, default: "", trim: true },
    cleanPinyin: { type: String, default: "", index: true },
    hanviet: { type: String, default: "", trim: true },
    meaning: { type: String, default: "", trim: true },
    cleanMeaning: { type: String, default: "", index: true },
    pos: { type: String, default: "" },
    level: { type: String, default: "Bài học" },
    sources: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<ISharedVocab>("SharedVocab", SharedVocabSchema);
