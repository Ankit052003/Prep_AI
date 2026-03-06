const fs = require("fs");
const { getApiBase, getApiKey, resolveProvider } = require("./xaiClient");

const DEFAULT_STT_TIMEOUT_MS = 60000;
const STT_MODEL_FALLBACK_STATUSES = new Set([400, 404, 405, 415, 422]);
const STT_TRANSIENT_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function createSpeechError(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  return error;
}

function parseJsonSafe(rawText) {
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch (_error) {
    return null;
  }
}

function getSttModelCandidates() {
  const envCandidates = String(
    process.env.GROQ_STT_MODELS || process.env.GROQ_STT_MODEL_CANDIDATES || ""
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return uniqueStrings([
    process.env.GROQ_STT_MODEL,
    process.env.STT_MODEL,
    "whisper-large-v3-turbo",
    "whisper-large-v3",
    ...envCandidates,
  ]);
}

function getSttTimeoutMs() {
  const envTimeout = Number.parseInt(
    String(process.env.GROQ_STT_TIMEOUT_MS || process.env.STT_TIMEOUT_MS || ""),
    10
  );

  if (!Number.isFinite(envTimeout)) {
    return DEFAULT_STT_TIMEOUT_MS;
  }

  return Math.max(5000, envTimeout);
}

function normalizeMimeType(rawMimeType) {
  const mimeType = String(rawMimeType || "").trim();
  if (!mimeType || mimeType === "application/octet-stream") {
    return "audio/webm";
  }
  return mimeType;
}

async function requestGroqTranscription({
  apiKey,
  audioPath,
  mimeType,
  fileName,
  model,
  timeoutMs,
  language,
  prompt,
}) {
  const apiBase = getApiBase("groq");
  const audioBuffer = await fs.promises.readFile(audioPath);
  const safeMimeType = normalizeMimeType(mimeType);
  const safeFileName = String(fileName || "answer.webm");

  const formData = new FormData();
  formData.append("model", model);
  formData.append("file", new Blob([audioBuffer], { type: safeMimeType }), safeFileName);

  if (language) {
    formData.append("language", String(language).trim());
  }

  if (prompt) {
    formData.append("prompt", String(prompt).trim());
  }

  formData.append("response_format", "json");

  const response = await fetch(`${apiBase}/audio/transcriptions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const rawBody = await response.text();
  const parsedBody = parseJsonSafe(rawBody);
  const transcript = String(parsedBody?.text || "").trim();

  if (response.ok && transcript) {
    return transcript;
  }

  const errorMessage =
    parsedBody?.error?.message ||
    parsedBody?.error ||
    rawBody ||
    `Groq STT request failed with status ${response.status}.`;
  throw createSpeechError(String(errorMessage), {
    status: response.status,
    provider: "groq",
    code: response.status ? `HTTP_${response.status}` : "",
  });
}

function shouldTryNextSttModel(error) {
  const statusCode = Number(error?.status);
  if (STT_MODEL_FALLBACK_STATUSES.has(statusCode)) {
    return true;
  }

  if (STT_TRANSIENT_STATUSES.has(statusCode)) {
    return true;
  }

  const code = String(error?.code || "").toUpperCase();
  return code === "ABORT_ERR" || code === "ETIMEDOUT" || code === "ECONNRESET";
}

exports.transcribeAudioFile = async ({
  audioPath,
  mimeType,
  fileName,
  language,
  prompt,
}) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw createSpeechError("Missing GROK_API_KEY on server.", {
      status: 500,
      code: "MISSING_API_KEY",
    });
  }

  const provider = resolveProvider(apiKey);
  if (provider !== "groq") {
    throw createSpeechError(
      "Speech-to-text is currently available only with Groq-compatible audio transcription in this setup.",
      {
        status: 501,
        code: "STT_PROVIDER_UNSUPPORTED",
        provider,
      }
    );
  }

  const timeoutMs = getSttTimeoutMs();
  const models = getSttModelCandidates();
  const attempts = [];

  for (const model of models) {
    try {
      const transcript = await requestGroqTranscription({
        apiKey,
        audioPath,
        mimeType,
        fileName,
        model,
        timeoutMs,
        language,
        prompt,
      });
      return transcript;
    } catch (error) {
      attempts.push({
        model,
        status: error?.status || "unknown",
        message: error?.message || "Unknown error",
      });

      if (shouldTryNextSttModel(error)) {
        continue;
      }

      break;
    }
  }

  const attemptSummary = attempts
    .slice(0, 4)
    .map((attempt) => `${attempt.model} -> ${attempt.status}`)
    .join("; ");
  const firstError = attempts[0]?.message || "Unable to transcribe audio.";

  throw createSpeechError(
    `Groq STT failed after ${attempts.length} attempts. ${attemptSummary}. ${firstError}`,
    {
      status: Number(attempts[0]?.status) || 500,
      code: "STT_REQUEST_FAILED",
      provider: "groq",
    }
  );
};
