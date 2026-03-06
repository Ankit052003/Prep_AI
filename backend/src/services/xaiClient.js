const axios = require("axios");
const https = require("https");

const DEFAULT_XAI_API_BASE = "https://api.x.ai/v1";
const DEFAULT_GROQ_API_BASE = "https://api.groq.com/openai/v1";
const DEFAULT_GROK_MODEL = "grok-3-mini";
const DEFAULT_GROQ_MODEL = "llama-3.1-8b-instant";
const DEFAULT_TIMEOUT_MS = 30000;
const TRANSIENT_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const MODEL_FALLBACK_STATUS_CODES = new Set([400, 404, 405, 422]);

const xaiHttpClient = axios.create({
  httpsAgent: new https.Agent({
    keepAlive: true,
    maxSockets: 50,
  }),
});

function sanitizeBase(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function normalizeApiKey(rawApiKey) {
  const trimmedValue = String(rawApiKey || "").trim();
  if (!trimmedValue) {
    return "";
  }

  const unquotedValue = trimmedValue.replace(/^['"]|['"]$/g, "");
  return unquotedValue.split(/\s+/)[0];
}

function getApiKey() {
  return normalizeApiKey(
    process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.GROQ_API_KEY
  );
}

function resolveProvider(apiKey) {
  const forcedProvider = String(process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (forcedProvider === "xai" || forcedProvider === "groq") {
    return forcedProvider;
  }

  if (/^gsk_/i.test(apiKey)) {
    return "groq";
  }

  return "xai";
}

function getActiveProvider() {
  return resolveProvider(getApiKey());
}

function getApiBase(provider) {
  if (provider === "groq") {
    return sanitizeBase(process.env.GROQ_API_BASE || DEFAULT_GROQ_API_BASE);
  }

  return sanitizeBase(process.env.GROK_API_BASE || process.env.XAI_API_BASE || DEFAULT_XAI_API_BASE);
}

function getModelCandidates(provider, preferredModel, fallbackModels = []) {
  const envModel = provider === "groq" ? process.env.GROQ_MODEL : process.env.GROK_MODEL;
  const envCandidates = String(
    provider === "groq" ? process.env.GROQ_MODEL_CANDIDATES || "" : process.env.GROK_MODEL_CANDIDATES || ""
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const defaultModel = provider === "groq" ? DEFAULT_GROQ_MODEL : DEFAULT_GROK_MODEL;

  return uniqueStrings([
    preferredModel,
    envModel,
    ...fallbackModels,
    ...envCandidates,
    defaultModel,
  ]);
}

function extractResponseText(responseData) {
  const content = responseData?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (typeof part?.text === "string") {
          return part.text;
        }
        return "";
      })
      .join(" ")
      .trim();
  }

  return "";
}

function getApiErrorDetails(error) {
  const status = error?.response?.status;
  const message =
    error?.response?.data?.error?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "Unknown error";
  const code = String(error?.code || "").toUpperCase();

  return {
    status: Number.isFinite(Number(status)) ? Number(status) : null,
    message: String(message),
    code,
  };
}

function shouldTryNextModel(errorDetails) {
  return MODEL_FALLBACK_STATUS_CODES.has(Number(errorDetails.status));
}

function shouldRetryTransient(errorDetails) {
  if (TRANSIENT_STATUS_CODES.has(Number(errorDetails.status))) {
    return true;
  }

  return ["ECONNABORTED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET"].includes(
    errorDetails.code
  );
}

async function requestChatCompletion({
  apiKey,
  apiBase,
  model,
  messages,
  temperature = 0.2,
  maxTokens,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const payload = {
    model,
    messages,
    temperature,
  };

  if (Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0) {
    payload.max_tokens = Math.floor(Number(maxTokens));
  }

  const response = await xaiHttpClient.post(`${apiBase}/chat/completions`, payload, {
    timeout: timeoutMs,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  const text = extractResponseText(response.data);
  if (!text) {
    throw new Error("xAI response did not contain text output.");
  }

  return text;
}

async function chatCompletionWithFallback({
  messages,
  preferredModel,
  fallbackModels = [],
  temperature = 0.2,
  maxTokens,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GROK_API_KEY is not set. You can also set XAI_API_KEY.");
  }

  const provider = resolveProvider(apiKey);
  const apiBase = getApiBase(provider);
  const modelCandidates = getModelCandidates(provider, preferredModel, fallbackModels);
  const attempts = [];

  for (const model of modelCandidates) {
    try {
      return await requestChatCompletion({
        apiKey,
        apiBase,
        model,
        messages,
        temperature,
        maxTokens,
        timeoutMs,
      });
    } catch (error) {
      const errorDetails = getApiErrorDetails(error);
      attempts.push({
        model,
        status: errorDetails.status || "unknown",
        message: errorDetails.message,
      });

      if (shouldTryNextModel(errorDetails)) {
        continue;
      }

      if (shouldRetryTransient(errorDetails)) {
        continue;
      }

      break;
    }
  }

  const attemptPreview = attempts
    .slice(0, 4)
    .map((attempt) => `${attempt.model} -> ${attempt.status}`)
    .join("; ");
  const providerLabel = provider === "groq" ? "Groq" : "xAI";
  const firstErrorMessage = attempts[0]?.message || `Unable to get completion from ${providerLabel}.`;

  throw new Error(
    `${providerLabel} API failed after ${attempts.length} attempts. ${attemptPreview}. ${firstErrorMessage}`
  );
}

module.exports = {
  chatCompletionWithFallback,
  getActiveProvider,
  getApiBase,
  getApiKey,
  getApiErrorDetails,
  resolveProvider,
};
