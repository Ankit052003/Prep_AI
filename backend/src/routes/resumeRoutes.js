const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const {
  uploadResume,
  getMyResume,
  deleteMyResume,
} = require("../controllers/resumeController");
const { optionalAuth, requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();
const uploadsDir = path.resolve(__dirname, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

router.post("/upload", optionalAuth, upload.single("resume"), uploadResume);
router.get("/me", requireAuth, getMyResume);
router.delete("/me", requireAuth, deleteMyResume);

module.exports = router;
