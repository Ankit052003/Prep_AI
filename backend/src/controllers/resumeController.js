const fs = require("fs");
const pdfParseModule = require("pdf-parse");
const { parseResume } = require("../services/resumeParserService");

async function extractPdfText(dataBuffer) {
  if (typeof pdfParseModule === "function") {
    const pdfData = await pdfParseModule(dataBuffer);
    return pdfData.text;
  }

  if (typeof pdfParseModule.default === "function") {
    const pdfData = await pdfParseModule.default(dataBuffer);
    return pdfData.text;
  }

  if (typeof pdfParseModule.PDFParse === "function") {
    const parser = new pdfParseModule.PDFParse({ data: dataBuffer });
    try {
      const pdfData = await parser.getText();
      return pdfData.text;
    } finally {
      await parser.destroy();
    }
  }

  throw new Error("Unsupported pdf-parse export format");
}

function isTransientAiError(errorMessage = "") {
  if (!errorMessage) return false;

  return /Gemini API\s*(429|500|502|503|504)/i.test(errorMessage) ||
    /(ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|timeout)/i.test(errorMessage);
}

exports.uploadResume = async (req, res) => {
  const filePath = req.file?.path;

  try {
    if (!filePath) {
      return res.status(400).json({
        error: "Missing resume file. Send form-data with file field `resume`.",
      });
    }

    const dataBuffer = fs.readFileSync(filePath);
    const extractedText = await extractPdfText(dataBuffer);

    let parsedData;
    let warning = null;

    try {
      parsedData = await parseResume(extractedText);
    } catch (parseError) {
      const parseMessage = parseError?.message || "";
      if (!isTransientAiError(parseMessage)) {
        throw parseError;
      }

      parsedData = {
        rawText: extractedText,
      };
      warning = "AI resume parsing is temporarily unavailable. Showing extracted resume text instead.";
    }

    res.json({
      message: "Resume processed successfully",
      parsedData,
      warning,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    if (filePath) {
      fs.unlink(filePath, () => {});
    }
  }
};
