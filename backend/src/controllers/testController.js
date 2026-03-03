const fs = require("fs");
const axios = require("axios");

exports.testSTT = async (req, res) => {
  try {
    const audioPath = req.file.path;

    const audioBytes = fs.readFileSync(audioPath).toString("base64");

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GOOGLE_AI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: "Transcribe this audio and return only the spoken text."
              },
              {
                inlineData: {
                  mimeType: "audio/webm",
                  data: audioBytes
                }
              }
            ]
          }
        ]
      }
    );

    const transcript =
      response.data.candidates[0].content.parts[0].text;

    res.json({ transcript });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};