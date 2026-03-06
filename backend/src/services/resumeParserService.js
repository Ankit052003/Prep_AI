const { chatCompletionWithFallback } = require("./xaiClient");

exports.parseResume = async (resumeText) => {
  const model = process.env.GROK_MODEL || "grok-3-mini";

  const prompt = `
  Extract the following from this resume:
  - Skills
  - Projects
  - Experience
  - Education

  Resume:
  ${resumeText}

  Return JSON format.
  `;

  return chatCompletionWithFallback({
    preferredModel: model,
    messages: [
      {
        role: "system",
        content:
          "You extract structured resume details. Return JSON when possible and do not add markdown fences.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.1,
    maxTokens: 1200,
    timeoutMs: 30000,
  });
};
