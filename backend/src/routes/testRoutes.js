const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { testSTT, testTTS } = require("../controllers/testController");

const router = express.Router();
const uploadsDir = path.resolve(__dirname, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({ dest: uploadsDir });

router.post("/stt", upload.single("audio"), testSTT);
router.post("/tts", testTTS);

module.exports = router;
