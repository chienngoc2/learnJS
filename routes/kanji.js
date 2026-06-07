import express from "express";
import {
  searchKanji,
  getAllKanji,
  getKanjiGroups,
  addKanji,
  bulkAddKanji,
  updateKanji,
  deleteKanji,
  getKanjiById,
} from "../controllers/kanjiController.js";

const router = express.Router();

// GET  /api/kanji/search?q=一                   → Tra cứu theo từ khóa
router.get("/search", searchKanji);

// GET  /api/kanji/groups                        → Danh sách bộ/nhóm bài học
router.get("/groups", getKanjiGroups);

// GET  /api/kanji/all?page=1&level=N5&group=xxx → Lấy toàn bộ (phân trang + filter)
router.get("/all", getAllKanji);

// GET  /api/kanji/:id                           → Lấy chi tiết 1 kanji
router.get("/:id", getKanjiById);

// POST /api/kanji/add                           → Thêm 1 kanji mới
router.post("/add", addKanji);

// POST /api/kanji/bulk-add                      → Thêm hàng loạt từ JSON array
router.post("/bulk-add", bulkAddKanji);

// PUT  /api/kanji/update/:id                    → Cập nhật kanji theo ID
router.put("/update/:id", updateKanji);

// DELETE /api/kanji/delete/:id                  → Xóa kanji theo ID
router.delete("/delete/:id", deleteKanji);

export default router;
