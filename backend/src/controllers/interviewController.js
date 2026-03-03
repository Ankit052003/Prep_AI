const Interview = require("../models/Interview");
const { generateQuestions, evaluateAnswer } = require("../services/aiService");
const mongoose = require("mongoose");

function getRequestBody(req) {
  const rawBody = req.body;

  if (rawBody && typeof rawBody === "object" && !Array.isArray(rawBody)) {
    return rawBody;
  }

  if (typeof rawBody === "string") {
    const trimmedBody = rawBody.trim();
    if (!trimmedBody) {
      return {};
    }

    try {
      const parsed = JSON.parse(trimmedBody);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch (_err) {
      // Non-JSON text body. Caller-level validation will report missing fields.
    }
  }

  return {};
}

function parseQuestionList(questionsText) {
  if (typeof questionsText !== "string") {
    return [];
  }

  const cleaned = questionsText.replace(/```json|```/gi, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map((q) => String(q).trim()).filter(Boolean);
    }
  } catch (_err) {
    // Fall back to line parsing when response is not valid JSON.
  }

  return cleaned
    .split(/\r?\n+/)
    .map((q) => q.replace(/^\s*[-*]\s*/, "").replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

exports.startInterview = async (req, res) => {
  try {
    const body = getRequestBody(req);
    const parsedResume =
      body.parsedResume ??
      body.parsedData ??
      body.resumeData ??
      body.resumeText;

    if (!parsedResume) {
      return res.status(400).json({
        error:
          "Missing resume data. Send JSON body with `parsedResume` (or `parsedData` / `resumeText`).",
      });
    }

    const questionsText = await generateQuestions(parsedResume);
    const questions = parseQuestionList(questionsText);
    if (!questions.length) {
      return res.status(502).json({
        error: "Failed to generate interview questions from resume data.",
      });
    }

    const interview = await Interview.create({
      resumeData: parsedResume,
      questions,
    });

    res.json({
      interviewId: interview._id,
      question: questions[0],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.submitAnswer = async (req, res) => {
  try {
    const body = getRequestBody(req);
    const interviewId =
      body.interviewId ||
      body.interviewID ||
      body.interview_id ||
      req.params?.interviewId ||
      req.query?.interviewId;

    const rawAnswer = body.answer ?? body.response ?? body.userAnswer;
    const answer = typeof rawAnswer === "string" ? rawAnswer.trim() : "";

    const missingFields = [];
    if (!interviewId) missingFields.push("interviewId");
    if (!answer) missingFields.push("answer");

    if (missingFields.length) {
      return res.status(400).json({
        error: "Missing required fields: `interviewId` and non-empty `answer`.",
        missingFields,
        expectedBody: {
          interviewId: "string",
          answer: "non-empty string",
        },
      });
    }

    if (!mongoose.Types.ObjectId.isValid(interviewId)) {
      return res.status(400).json({
        error: "Invalid `interviewId` format.",
      });
    }

    const interview = await Interview.findById(interviewId);
    if (!interview) {
      return res.status(404).json({ error: "Interview not found." });
    }

    const currentIndex = interview.currentQuestionIndex;
    if (currentIndex >= interview.questions.length) {
      return res.status(400).json({
        error: "Interview already completed. Call /api/interview/finish.",
      });
    }

    const currentQuestion = interview.questions[currentIndex];

    const evaluation = await evaluateAnswer(currentQuestion, answer);

    const scoreMatch = evaluation.match(/(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[0]) : 5;

    interview.responses.push({
      question: currentQuestion,
      answer,
      evaluation,
      score,
    });

    interview.currentQuestionIndex += 1;

    await interview.save();

    if (interview.currentQuestionIndex < interview.questions.length) {
      res.json({
        question: currentQuestion,
        answer,
        score,
        evaluation,
        nextQuestion: interview.questions[interview.currentQuestionIndex],
      });
    } else {
      res.json({
        question: currentQuestion,
        answer,
        score,
        evaluation,
        message: "Interview completed. Please finish interview.",
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.evaluateSingleAnswer = async (req, res) => {
  return exports.submitAnswer(req, res);
};

exports.finishInterview = async (req, res) => {
  try {
    const { interviewId } = getRequestBody(req);
    if (!interviewId) {
      return res.status(400).json({ error: "Missing required field: `interviewId`." });
    }

    const interview = await Interview.findById(interviewId);
    if (!interview) {
      return res.status(404).json({ error: "Interview not found." });
    }
    if (!interview.responses.length) {
      return res.status(400).json({
        error: "No answers submitted yet. Submit answers before finishing interview.",
      });
    }

    const totalScore = interview.responses.reduce(
      (sum, r) => sum + r.score,
      0
    );

    const averageScore = totalScore / interview.responses.length;

    interview.finalScore = averageScore;
    interview.finalFeedback = averageScore > 7
      ? "Strong performance"
      : "Needs improvement";

    await interview.save();

    res.json({
      finalScore: averageScore,
      feedback: interview.finalFeedback,
      detailedResponses: interview.responses,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
