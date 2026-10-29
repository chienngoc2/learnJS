// File: models/AudioLesson.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAudioSegment {
  id: number;
  start: number;
  end: number;
  startFormatted?: string;
  endFormatted?: string;
  text: string;
  pinyin?: string;
  meaningVi?: string;
}

export interface IAudioLesson extends Document {
  userId?: mongoose.Types.ObjectId | string | null;
  gridFsFileId: mongoose.Types.ObjectId;
  title: string;
  originalFileName: string;
  fileSize: number;
  duration: number;
  fullText: string;
  fullTranslation?: string;
  segments: IAudioSegment[];
  totalSegments: number;
  language: string;
  savedAtFormatted?: string;
  createdAt: Date;
  updatedAt: Date;
}

const audioSegmentSchema = new Schema<IAudioSegment>(
  {
    id: { type: Number, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    startFormatted: { type: String, default: "" },
    endFormatted: { type: String, default: "" },
    text: { type: String, required: true },
    pinyin: { type: String, default: "" },
    meaningVi: { type: String, default: "" },
  },
  { _id: false }
);

const audioLessonSchema = new Schema<IAudioLesson>(
  {
    userId: {
      type: Schema.Types.Mixed,
      index: true,
      default: null,
    },
    gridFsFileId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    originalFileName: {
      type: String,
      default: "audio.mp3",
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    duration: {
      type: Number,
      default: 0,
    },
    fullText: {
      type: String,
      required: true,
    },
    fullTranslation: {
      type: String,
      default: "",
    },
    segments: {
      type: [audioSegmentSchema],
      default: [],
    },
    totalSegments: {
      type: Number,
      default: 0,
    },
    language: {
      type: String,
      default: "chinese",
    },
    savedAtFormatted: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

audioLessonSchema.index({ userId: 1, createdAt: -1 });

const AudioLesson: Model<IAudioLesson> =
  mongoose.models.AudioLesson ||
  mongoose.model<IAudioLesson>("AudioLesson", audioLessonSchema);

export default AudioLesson;
