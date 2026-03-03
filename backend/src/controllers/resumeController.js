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

exports.uploadResume = async (req, res) => {
  try {
    if (!req.file?.path) {
      return res.status(400).json({
        error: "Missing resume file. Send form-data with file field `resume`.",
      });
    }

    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    const extractedText = await extractPdfText(dataBuffer);

    const parsedData = await parseResume(extractedText);

    res.json({
      message: "Resume processed successfully",
      parsedData,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
