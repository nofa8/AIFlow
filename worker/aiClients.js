const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");
const { HfInference, InferenceClient } = require("@huggingface/inference");
const fs = require("fs");
const { PDFParse } = require("pdf-parse");
const cheerio = require("cheerio");

// Check API keys on startup explicitly as requested
if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️ Warning: GEMINI_API_KEY is missing. Gemini tasks will fallback.");
}
if (!process.env.HUGGINGFACE_API_KEY) {
  console.warn("⚠️ Warning: HUGGINGFACE_API_KEY is missing. HuggingFace tasks will fallback.");
}

const gemini = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "missing_key",
});

const ClientClass = InferenceClient || HfInference;
const hfClient = new ClientClass(process.env.HUGGINGFACE_API_KEY || "missing_key");

async function hfSentiment(input) {
  if (!process.env.HUGGINGFACE_API_KEY) {
    throw new Error("Missing HF API key");
  }

  const output = await hfClient.textClassification({
    model: "distilbert-base-uncased-finetuned-sst-2-english",
    inputs: input,
  });

  // Unified Schema
  const best = Array.isArray(output) ? output.sort((a,b) => b.score - a.score)[0] : output;
  return {
    provider: "huggingface",
    type: "sentiment",
    data: best,
  };
}

async function geminiChat(input) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing Gemini API key");
  }

  // Create a slightly more reliable config according to GenAI docs
  const res = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: input,
  });

  // Unified Schema
  return {
    provider: "gemini",
    type: "chat",
    data: { text: res.text },
  };
}

async function geminiImage(filePath, mimeType) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing Gemini API key");
  }

  const buffer = fs.readFileSync(filePath);

  const res = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: "Describe this image accurately and concisely." },
          {
            inlineData: {
              mimeType: mimeType || "image/png",
              data: buffer.toString("base64")
            }
          }
        ]
      }
    ]
  });

  return {
    provider: "gemini",
    type: "image-caption",
    data: { text: res.text }
  };
}

async function geminiPDF(filePath) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing Gemini API key");
  }

  const buffer = fs.readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  let data;
  try {
    data = await parser.getText();
  } finally {
    await parser.destroy();
  }

  const text = data.text.slice(0, 3000);

  const res = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Summarize this document:\n${text}`
  });

  return {
    provider: "gemini",
    type: "pdf-summary",
    data: { text: res.text }
  };
}

async function geminiURLSummary(url) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing Gemini API key");
  }

  const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
  const $ = cheerio.load(html);
  
  // Extract text broadly
  const pageText = $('body').text().replace(/\s+/g, ' ').slice(0, 3000);

  const res = await gemini.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Summarize this webpage content:\n${pageText}`
  });

  return {
    provider: "gemini",
    type: "url-summary",
    data: { text: res.text }
  };
}

module.exports = {
  hfSentiment,
  geminiChat,
  geminiImage,
  geminiPDF,
  geminiURLSummary
};
