import mongoose, { Schema, Document } from "mongoose";

export interface IReadingVocabItem {
  term: string;
  pinyin: string;
  meaning: string;
  pos?: string;
  isRepeated: boolean;
  repeatCount: number;
  appearedIn: string[];
}

export interface IReadingGrammarItem {
  pattern: string;
  meaning: string;
  explanation?: string;
  exampleInText?: string;
  exampleMeaning?: string;
}

export interface IReadingPassage extends Document {
  userId?: mongoose.Types.ObjectId | null;
  title: string;
  content: string;
  pinyin: string;
  translation: string;
  vocabulary: IReadingVocabItem[];
  grammarPoints: IReadingGrammarItem[];
  createdAt: Date;
  updatedAt: Date;
}

const ReadingPassageSchema = new Schema<IReadingPassage>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true, default: null },
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    pinyin: { type: String, default: "" },
    translation: { type: String, default: "" },
    vocabulary: { type: [Schema.Types.Mixed] as any, default: [] },
    grammarPoints: { type: [Schema.Types.Mixed] as any, default: [] },
  },
  { timestamps: true }
);

export default mongoose.model<IReadingPassage>("ReadingPassage", ReadingPassageSchema);
