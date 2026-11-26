import mongoose, { Schema, Document } from "mongoose";

export interface IWordAnalysisRadical {
  radical: string;
  radicalId?: number;
  hanViet: string;
  pinyin: string;
  meaning: string;
  color: string;
}

export interface IWordAnalysisChar {
  char: string;
  pinyin: string;
  hanViet: string;
  meaning: string;
  radicals: IWordAnalysisRadical[];
  story: string;
}

export interface IWordAnalysis extends Document {
  word: string;
  pinyin: string;
  hanviet: string;
  meaning: string;
  synonyms: Array<{ word: string; pinyin: string; meaning: string; difference?: string }>;
  usages: Array<{ pattern: string; meaning: string; exampleCn: string; examplePinyin: string; exampleVn: string }>;
  characters: IWordAnalysisChar[];
  combinedStory: string;
  createdAt: Date;
  updatedAt: Date;
}

const WordAnalysisSchema = new Schema<IWordAnalysis>(
  {
    word: { type: String, required: true, unique: true, index: true, trim: true },
    pinyin: { type: String, default: "" },
    hanviet: { type: String, default: "" },
    meaning: { type: String, default: "" },
    synonyms: { type: [Schema.Types.Mixed] as any, default: [] },
    usages: { type: [Schema.Types.Mixed] as any, default: [] },
    characters: { type: [Schema.Types.Mixed] as any, default: [] },
    combinedStory: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model<IWordAnalysis>("WordAnalysis", WordAnalysisSchema);
