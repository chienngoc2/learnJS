import express from "express";
import { optionalAuth } from "../middleware/authMiddleware.js";
import {
  getReadingListHandler,
  getReadingByIdHandler,
  analyzeReadingHandler,
  deleteReadingHandler,
} from "../controllers/readingController.js";

const router = express.Router();

router.get("/list", optionalAuth, getReadingListHandler);
router.post("/analyze", optionalAuth, analyzeReadingHandler);
router.get("/:id", optionalAuth, getReadingByIdHandler);
router.delete("/:id", optionalAuth, deleteReadingHandler);

export default router;
