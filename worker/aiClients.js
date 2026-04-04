const axios = require("axios");
const { GoogleGenAI } = require("@google/genai");

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

async function hfSentiment(input) {
  if (!process.env.HUGGINGFACE_API_KEY) {
    throw new Error("Missing HF API key");
  }

  let lastError;
  // 2 attempts retry block
  for (let i = 0; i < 2; i++) {
    try {
      const res = await axios.post(
        "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english",
        { inputs: input },
        {
          headers: {
            Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          },
          timeout: 5000,
        }
      );

      // Unified Schema
      return {
        provider: "huggingface",
        type: "sentiment",
        data: res.data[0],
      };
    } catch (err) {
      lastError = err;
      // Wait 1 second before retrying
      if (i === 0) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

async function geminiChat(input) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Missing Gemini API key");
  }

  let lastError;
  // 2 attempts retry block
  for (let i = 0; i < 2; i++) {
    try {
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
    } catch (err) {
      lastError = err;
      // Wait 1 second before retrying
      if (i === 0) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

module.exports = {
  hfSentiment,
  geminiChat,
};
