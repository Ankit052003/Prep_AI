const { chatCompletionWithFallback } = require("./xaiClient");

const DEFAULT_GROK_MODEL = process.env.GROK_MODEL || "grok-3-mini";
const DEFAULT_TIMEOUT_MS = 30000;
const SCORE_REGEX = /(?:^|\b)(10|[0-9](?:\.[0-9])?)(?:\s*\/\s*10)?(?:\b|$)/;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function callGrok(prompt, options = {}) {
  const promptText = String(prompt || "").trim();
  if (!promptText) {
    throw new Error("Prompt is required for Grok generation.");
  }

  return chatCompletionWithFallback({
    preferredModel: options.model || DEFAULT_GROK_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are a precise AI interview assistant. Follow the user instruction exactly and return concise output.",
      },
      { role: "user", content: promptText },
    ],
    temperature: options.temperature ?? 0.2,
    maxTokens: options.maxTokens,
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
  });
}

function resumeToPromptText(parsedResume) {
  if (typeof parsedResume === "string") {
    return parsedResume;
  }

  return JSON.stringify(parsedResume, null, 2);
}

function parseJsonObject(rawText) {
  if (typeof rawText !== "string") {
    return null;
  }

  const cleaned = rawText.replace(/```json|```/gi, "").trim();
  if (!cleaned) {
    return null;
  }

  try {
    return JSON.parse(cleaned);
  } catch (_error) {
    // Try extracting a JSON object region.
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  const candidate = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(candidate);
  } catch (_error) {
    return null;
  }
}

function toStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function getPointWeight(status) {
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "full") return 1;
  if (normalizedStatus === "partial") return 0.5;
  return 0;
}

function buildFallbackEvaluation(rawText) {
  const scoreMatch = String(rawText || "").match(SCORE_REGEX);
  const score = clamp(Number(scoreMatch?.[1] || 5), 0, 10);
  const roundedScore = Math.round(score * 10) / 10;

  return {
    score: roundedScore,
    coveragePercent: null,
    expectedKeyPoints: [],
    matchedPoints: [],
    missingPoints: [],
    suggestions: [],
    feedback: String(rawText || "Evaluation unavailable."),
  };
}

function normalizeEvaluation(parsed, fallbackRawText) {
  if (!parsed || typeof parsed !== "object") {
    return buildFallbackEvaluation(fallbackRawText);
  }

  const numericScore = Number(parsed.overallScore);
  const score = Number.isFinite(numericScore)
    ? clamp(Math.round(numericScore * 10) / 10, 0, 10)
    : buildFallbackEvaluation(fallbackRawText).score;

  const coverageValue = Number(parsed.coveragePercent);
  let coveragePercent = Number.isFinite(coverageValue)
    ? clamp(Math.round(coverageValue), 0, 100)
    : null;

  const expectedKeyPoints = toStringArray(parsed.expectedKeyPoints);
  const missingPoints = toStringArray(parsed.missingPoints);
  const suggestions = toStringArray(parsed.improvementSuggestions);

  const matchedPoints = Array.isArray(parsed.matchedPoints)
    ? parsed.matchedPoints
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const point = String(item.point || "").trim();
          const status = String(item.status || "").trim().toLowerCase();
          const evidence = String(item.evidence || "").trim();
          if (!point) return null;
          return {
            point,
            status: status || "unknown",
            evidence,
          };
        })
        .filter(Boolean)
    : [];

  if (matchedPoints.length) {
    const weightedCoverage =
      matchedPoints.reduce((sum, point) => sum + getPointWeight(point.status), 0) /
      matchedPoints.length;
    coveragePercent = clamp(Math.round(weightedCoverage * 100), 0, 100);
  }

  const rubricAccuracy = Number(parsed?.rubric?.correctness);
  const accuracyScore = Number.isFinite(rubricAccuracy)
    ? clamp(rubricAccuracy, 0, 10)
    : score;

  const scoreFromCoverage = coveragePercent === null ? score : (coveragePercent / 100) * 10;
  const blendedScore = Math.round((scoreFromCoverage * 0.7 + accuracyScore * 0.3) * 10) / 10;
  const finalScore = clamp(blendedScore, 0, 10);

  const strengths = toStringArray(parsed.strengths);
  const feedbackText = String(parsed.shortFeedback || "").trim();

  const feedbackLines = [
    `Score: ${finalScore}/10`,
    coveragePercent === null ? null : `Coverage: ${coveragePercent}%`,
    strengths.length ? `Strengths: ${strengths.join("; ")}` : null,
    missingPoints.length ? `Missing: ${missingPoints.slice(0, 3).join("; ")}` : null,
    suggestions.length ? `Improve: ${suggestions.slice(0, 3).join("; ")}` : null,
    feedbackText || null,
  ].filter(Boolean);

  return {
    score: finalScore,
    coveragePercent,
    expectedKeyPoints,
    matchedPoints,
    missingPoints,
    suggestions,
    feedback: feedbackLines.join(" | "),
  };
}

exports.generateQuestions = async (parsedResume, domain, questionCount = 1) => {
  const selectedDomain =
    typeof domain === "string" && domain.trim() ? domain.trim() : "General";
  const totalQuestions = Number.isFinite(Number(questionCount))
    ? Math.max(1, Math.floor(Number(questionCount)))
    : 1;

  const domainInstructions =
    selectedDomain === "HR Interview"
      ? "Generate HR-focused behavioral and communication questions. Avoid coding-only prompts."
      : selectedDomain === "Employee Introduction"
      ? "Generate only self-introduction and personal profile questions about the candidate (background, strengths, goals, achievements, motivations, communication style). Avoid deep technical/coding questions."
      : `Prioritize ${selectedDomain} interview style while keeping questions grounded in the resume.`;
  const focusInstruction =
    selectedDomain === "Employee Introduction"
      ? "Focus on who the candidate is: background, personality, achievements, goals, communication, and work values."
      : "Focus on skills, projects, and experience mentioned in the resume.";

  const prompt = `
  You are an interview coach.

  Based on the candidate resume below, create exactly ${totalQuestions} interview questions.
  Selected domain: ${selectedDomain}
  ${domainInstructions}
  ${focusInstruction}
  Return only questions, one per line, without extra explanation.
  Do not return fewer or more than ${totalQuestions} questions.

  Resume:
  ${resumeToPromptText(parsedResume)}
  `;

  return callGrok(prompt, {
    temperature: 0.2,
    maxTokens: Math.max(400, totalQuestions * 120),
  });
};

exports.evaluateAnswer = async (question, answer, context = {}) => {
  const selectedDomain =
    typeof context.domain === "string" && context.domain.trim()
      ? context.domain.trim()
      : "General";
  const resumeSnapshot = context.resumeData ? resumeToPromptText(context.resumeData) : "N/A";

  const prompt = `
You are an expert interviewer. Grade the answer based on HOW MUCH of the required answer is correct.

Question: ${question}
Candidate Answer: ${answer}
Domain: ${selectedDomain}
Resume Context (for consistency checks):
${resumeSnapshot}

Evaluation rules:
1) First infer 3-6 expected key points for a strong answer to this question.
2) For each expected point, mark status as exactly one of: "full", "partial", "missed".
3) coveragePercent should reflect coverage of expected points (full=1, partial=0.5, missed=0), rounded to whole number.
4) overallScore (0-10) must primarily follow correctness + coverage.
5) Be strict about relevance and factual alignment with question/resume.

Return STRICT JSON only:
{
  "expectedKeyPoints": ["..."],
  "matchedPoints": [
    { "point": "...", "status": "full|partial|missed", "evidence": "short quote or reason" }
  ],
  "missingPoints": ["..."],
  "strengths": ["..."],
  "improvementSuggestions": ["..."],
  "rubric": {
    "correctness": 0,
    "completeness": 0,
    "clarity": 0,
    "relevance": 0
  },
  "coveragePercent": 0,
  "overallScore": 0,
  "shortFeedback": "..."
}
  `;

  const rawEvaluation = await callGrok(prompt, {
    temperature: 0.1,
    maxTokens: 1200,
  });
  const parsedEvaluation = parseJsonObject(rawEvaluation);
  return normalizeEvaluation(parsedEvaluation, rawEvaluation);
};
