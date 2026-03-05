const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const {
  startInterview,
  submitAnswer,
  evaluateSingleAnswer,
  finishInterview,
} = require("../controllers/interviewController");
const { testSTT } = require("../controllers/testController");

const router = express.Router();
const uploadsDir = path.resolve(__dirname, "../../uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir });

router.post("/start", startInterview);
router.post("/generate", startInterview);
router.post("/answer", submitAnswer);
router.post("/:interviewId/answer", submitAnswer);
router.post("/evaluate", evaluateSingleAnswer);
router.post("/voice-answer", upload.single("audio"), testSTT);
router.post("/finish", finishInterview);

module.exports = router;
