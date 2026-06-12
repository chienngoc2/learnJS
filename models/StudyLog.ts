// File: models/StudyLog.ts

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStudyLog extends Document {
  userId: mongoose.Types.ObjectId;
  vocabListId: mongoose.Types.ObjectId;
  action: string;
  createdAt: Date;
}

const studyLogSchema = new Schema<IStudyLog>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  vocabListId: {
    type: Schema.Types.ObjectId,
    ref: "VocabList",
    required: true,
  },
  action: {
    type: String,
    default: "view",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const StudyLog: Model<IStudyLog> =
  mongoose.models.StudyLog || mongoose.model<IStudyLog>("StudyLog", studyLogSchema);

export default StudyLog;
