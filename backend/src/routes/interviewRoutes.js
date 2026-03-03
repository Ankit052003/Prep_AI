const express = require("express");
const {
  startInterview,
  submitAnswer,
  evaluateSingleAnswer,
  finishInterview,
} = require("../controllers/interviewController");

const router = express.Router();

router.post("/start", startInterview);
router.post("/generate", startInterview);
router.post("/answer", submitAnswer);
router.post("/:interviewId/answer", submitAnswer);
router.post("/evaluate", evaluateSingleAnswer);
router.post("/finish", finishInterview);

module.exports = router;
