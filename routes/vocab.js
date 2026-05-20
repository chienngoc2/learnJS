import express from "express";
import {
  getAllLists,
  getListById,
  createList,
  saveReviewList,
  updateList,
  deleteList,
 
  addOrUpdateGrammar,
  deleteSingleGrammar,
  updateSingleGrammar,
  getAllGrammarPointsOnly,
} from "../controllers/vocabController";

const router = express.Router();

// Gom nhóm các route theo chức năng
router.get("/lists", getAllLists);
router.get("/list/:id", getListById);
router.post("/save", createList);
router.post("/save-review", saveReviewList);
router.put("/update/:id", updateList);
router.delete("/delete/:id", deleteList);
router.post("/add-grammar-upsert", addOrUpdateGrammar);
router.put("/update-grammar/:topicId/:grammarId", updateSingleGrammar);
// 🚀 Route XÓA 1 ngữ pháp cụ thể
router.delete('/delete-grammar/:topicId/:grammarId', deleteSingleGrammar);

// 🚀 Route UPDATE 1 ngữ pháp cụ thể

router.get("/all-grammar-points", getAllGrammarPointsOnly);
export default router;
