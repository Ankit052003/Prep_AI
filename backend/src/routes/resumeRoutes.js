const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { uploadResume } = require("../controllers/resumeController");

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

router.post("/upload", upload.single("resume"), uploadResume);

module.exports = router;
