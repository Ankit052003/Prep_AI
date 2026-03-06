const fs = require("fs");
const { getApiKey, resolveProvider } = require("../services/xaiClient");
const { transcribeAudioFile } = require("../services/speechService");

function cleanupUploadedFile(filePath) {
  if (!filePath) {
    return;
  }

  fs.unlink(filePath, () => {});
}

function getGrokApiKey() {
  return getApiKey();
}

function ensureGrokApiKey(res) {
  const apiKey = getGrokApiKey();
  if (!apiKey) {
    res.status(500).json({
      error: "Missing GROK_API_KEY on server.",
    });
    return "";
  }

  return apiKey;
}

exports.testSTT = async (req, res) => {
  const audioPath = req.file?.path;

  try {
    const apiKey = ensureGrokApiKey(res);
    if (!apiKey) {
      return;
    }

    if (!audioPath) {
      return res.status(400).json({
        error: "Missing audio file. Send form-data with file field `audio`.",
      });
    }

    const transcript = await transcribeAudioFile({
      audioPath,
      mimeType: req.file?.mimetype,
      fileName: req.file?.originalname,
      language: req.body?.language,
      prompt: req.body?.prompt,
    });

    return res.json({ transcript });
  } catch (error) {
    if (error?.code === "STT_PROVIDER_UNSUPPORTED") {
      return res.status(501).json({
        error:
          "Speech-to-text is available only when using a Groq-compatible API key in this setup.",
        provider: error?.provider || resolveProvider(getGrokApiKey()),
        capability: "stt",
      });
    }

    if (error?.status && Number(error.status) >= 400 && Number(error.status) < 500) {
      return res.status(Number(error.status)).json({
        error: error?.message || "Speech-to-text request failed.",
      });
    }

    return res.status(500).json({
      error: error?.message || "Failed to process speech-to-text request.",
    });
  } finally {
    cleanupUploadedFile(audioPath);
  }
};

exports.testTTS = async (req, res) => {
  try {
    const apiKey = ensureGrokApiKey(res);
    if (!apiKey) {
      return;
    }

    const rawText = req.body?.text ?? req.body?.question;
    const text = typeof rawText === "string" ? rawText.trim() : "";
    if (!text) {
      return res.status(400).json({
        error: "Missing required field `text` for speech synthesis.",
      });
    }

    return res.status(501).json({
      error:
        "Text-to-speech is not available in this Grok REST integration yet. The frontend will fall back to browser speech synthesis.",
      provider: resolveProvider(apiKey),
      capability: "tts",
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || "Failed to process text-to-speech request.",
    });
  }
};

// xAI REST currently does not expose a drop-in TTS endpoint for this app flow.
exports.primeTtsCache = () => {};
