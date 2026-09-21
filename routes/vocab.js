// File: routes/vocab.js

import express from "express";
import {
  getAllLists,
  getListById,
  logView,
  createList,
  saveReviewList,
  updateList,
  deleteList,
  addOrUpdateGrammar,
  deleteSingleGrammar,
  updateSingleGrammar,
  getAllGrammarPointsOnly,
} from "../controllers/vocabController.js";
import { protect, authorize, optionalAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// 👥 Routes công khai / đọc danh sách (hỗ trợ cả khách lẫn học viên đã đăng nhập)
router.get("/lists", optionalAuth, getAllLists);
router.get("/list/:id", optionalAuth, getListById);
router.post("/log-view", optionalAuth, logView);
router.get("/all-grammar-points", optionalAuth, getAllGrammarPointsOnly);

// 🛡️ Routes yêu cầu đăng nhập (Học viên & Admin)
router.post("/save-review", protect, saveReviewList);

// 👑 Routes chỉ dành riêng cho Admin (quản lý bài học)
router.use(protect);
router.use(authorize("admin"));

router.post("/save", createList);
router.put("/update/:id", updateList);
router.delete("/delete/:id", deleteList);
router.post("/add-grammar-upsert", addOrUpdateGrammar);
router.put("/update-grammar/:topicId/:grammarId", updateSingleGrammar);
router.delete("/delete-grammar/:topicId/:grammarId", deleteSingleGrammar);

export default router;
