import { Request, Response } from "express";
import Kanji from "../models/Kanji";

export const searchKanji = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const q = req.query.q as string;

    if (!q) {
      res
        .status(400)
        .json({ success: false, message: "Thiếu từ khóa tìm kiếm sếp ơi!" });
      return;
    }

    // Tạo Regex tìm kiếm không phân biệt hoa thường, chấp nhận khớp một phần
    const queryRegex = new RegExp(q.trim(), "i");

    // Tìm kiếm khớp 1 trong 3 trường: Chữ gốc, Âm Hán Việt, hoặc Ý nghĩa
    const result = await Kanji.findOne({
      $or: [
        { character: q.trim() },
        { vietnamese_reading: queryRegex },
        { meaning: queryRegex },
      ],
    });

    if (!result) {
      res.json({
        success: true,
        data: null,
        message: "Không tìm thấy chữ này rồi.",
      });
      return;
    }

    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
};
