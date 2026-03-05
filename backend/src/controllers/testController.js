const fs = require("fs");
const axios = require("axios");

const DEFAULT_GEMINI_API_BASES = [
  process.env.GEMINI_API_BASE,
  "https://generativelanguage.googleapis.com/v1",
  "https://generativelanguage.googleapis.com/v1beta",
].filter(Boolean);

const DEFAULT_GEMINI_AUDIO_MODELS = [
  process.env.GEMINI_AUDIO_MODEL,
  process.env.GEMINI_MODEL,
  "gemini-3-flash-preview",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash-latest",
  "gemini-1.5-flash",
].filter(Boolean);

function uniqueList(items) {
  return [...new Set(items)];
}

function sanitizeBase(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function extractGeminiText(responseData) {
  const parts = responseData?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join(" ")
    .trim();
}

function getApiErrorDetails(error) {
  const status = error?.response?.status;
  const message =
    error?.response?.data?.error?.message ||
    error?.response?.data?.error ||
    error?.message ||
    "Unknown error";

  return { status, message: String(message) };
}

async function requestTranscription({ apiKey, apiBase, model, audioBytes, mimeType }) {
  const url = `${sanitizeBase(apiBase)}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await axios.post(
    url,
    {
      contents: [
        {
          parts: [
            {
              text: "Generate an accurate transcript of this speech audio. Return transcript text only.",
            },
            {
              inlineData: {
                mimeType,
                data: audioBytes,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
      },
    },
    {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 60000,
    }
  );

  const transcript = extractGeminiText(response.data);
  if (!transcript) {
    throw new Error("Gemini response did not include transcript text.");
  }

  return transcript;
}

async function transcribeWithFallback({ apiKey, audioBytes, mimeType }) {
  const bases = uniqueList(DEFAULT_GEMINI_API_BASES.map(sanitizeBase));
  const models = uniqueList(DEFAULT_GEMINI_AUDIO_MODELS);
  const attempts = [];

  for (const apiBase of bases) {
    for (const model of models) {
      try {
        const transcript = await requestTranscription({
          apiKey,
          apiBase,
          model,
          audioBytes,
          mimeType,
        });
        return transcript;
      } catch (error) {
        const details = getApiErrorDetails(error);
        attempts.push({
          apiBase,
          model,
          status: details.status || "unknown",
          message: details.message,
        });
      }
    }
  }

  const preview = attempts
    .slice(0, 3)
    .map((attempt) => `${attempt.model}@${attempt.apiBase} -> ${attempt.status}`)
    .join("; ");

  const detailedMessage = attempts[0]?.message || "Unable to transcribe audio.";
  throw new Error(`STT failed after ${attempts.length} attempts. ${preview}. ${detailedMessage}`);
}

exports.testSTT = async (req, res) => {
  const audioPath = req.file?.path;

  try {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: "Missing GOOGLE_AI_API_KEY on server.",
      });
    }

    if (!audioPath) {
      return res.status(400).json({
        error: "Missing audio file. Send form-data with file field `audio`.",
      });
    }

    const audioBytes = fs.readFileSync(audioPath).toString("base64");
    const uploadedMimeType = req.file?.mimetype;
    const mimeType =
      uploadedMimeType && uploadedMimeType !== "application/octet-stream"
        ? uploadedMimeType
        : "audio/webm";

    const transcript = await transcribeWithFallback({
      apiKey,
      audioBytes,
      mimeType,
    });

    res.json({ transcript });
  } catch (error) {
    const details = getApiErrorDetails(error);
    const statusCode = details.status === 401 || details.status === 403 ? details.status : 500;

    res.status(statusCode).json({
      error: details.message,
    });
  } finally {
    if (audioPath) {
      fs.unlink(audioPath, () => {});
    }
  }
};
