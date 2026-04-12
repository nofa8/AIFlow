const amqp = require("amqplib");
const { Pool } = require("pg");
const redis = require("redis");
const http = require("http");

// ─── Health Endpoint (HTTP) ────────────────────────────────────
const HEALTH_PORT = process.env.WORKER_HEALTH_PORT || 4002;
http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "worker" }));
}).listen(HEALTH_PORT, () => {
  console.log(`[Worker] Health endpoint on port ${HEALTH_PORT}`);
});

const { TASK_QUEUE, REALTIME_QUEUE } = require("./shared/queues");
const { createEventMessage } = require("./shared/taskSchema");
const { TASK_STARTED, TASK_COMPLETED, TASK_FAILED } = require("./shared/events");
// ─── PostgreSQL ─────────────────────────────────────────────────
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

pool.on("error", (err) => {
  console.error("[Worker] Unexpected PostgreSQL error on idle client:", err.message);
});

// ─── Redis (Cache Invalidation) ────────────────────────────────
const redisClient = redis.createClient({ url: process.env.REDIS_URL });

redisClient.on("error", (err) => {
  console.error("[Worker] Redis Error:", err.message);
});

async function connectRedis() {
  let retries = 10;
  while (retries) {
    try {
      await redisClient.connect();
      console.log("[Worker] Redis connected");
      return;
    } catch (err) {
      console.log(`[Worker] Redis retry… (${retries} left)`);
      retries -= 1;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("Could not connect to Redis");
}

const { hfSentiment, geminiChat, geminiImage, geminiPDF, geminiURLSummary } = require("./aiClients");
const { downloadFile } = require("./minioClient");
const fs = require("fs");

// ─── AI Processing (Mocks & Fallbacks) ─────────────────────────

function mockSentiment(input) {
  const score = Math.random();
  const label = score > 0.6 ? "positive" : score > 0.3 ? "neutral" : "negative";
  return {
    provider: "mock",
    type: "sentiment",
    data: { label, score: parseFloat(score.toFixed(3)), model: "aiflow-mock-sentiment-v1" }
  };
}

function mockSummary(input) {
  const words = input.split(/\s+/);
  const summary = words.length > 10 ? words.slice(0, Math.ceil(words.length * 0.3)).join(" ") + "…" : input;
  return {
    provider: "mock",
    type: "summarize",
    data: { summary, original_length: words.length, model: "aiflow-mock-summarizer-v1" }
  };
}

function mockKeywords(input) {
  const words = input.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const freq = {};
  words.forEach((w) => (freq[w] = (freq[w] || 0) + 1));
  const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([word, count]) => ({ word, count }));
  return {
    provider: "mock",
    type: "keywords",
    data: { keywords, model: "aiflow-mock-keywords-v1" }
  };
}

async function processTask(type, input, objectName, mimeType) {
  // Simulate standard processing delay for mocks (1 – 3 seconds)
  if (!type.startsWith("hf-") && !type.startsWith("gemini-")) {
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));
  }

  switch (type) {
    case "sentiment":
      return mockSentiment(input);

    case "summarize":
      return mockSummary(input);

    case "keywords":
      return mockKeywords(input);

    case "hf-sentiment":
      console.log(`[AI] Processing hf-sentiment with HuggingFace`);
      try {
        return await hfSentiment(input);
      } catch (err) {
        console.log(`[AI] Fallback triggered for hf-sentiment: ${err.message}`);
        const fallback = mockSentiment(input);
        fallback.provider = "mock-fallback";
        return fallback;
      }

    case "gemini-chat":
      console.log(`[AI] Processing gemini-chat with Gemini`);
      try {
        return await geminiChat(input);
      } catch (err) {
        console.log(`[AI] Fallback triggered for gemini-chat: ${err.message}`);
        const fallback = mockSummary(input);
        fallback.provider = "mock-fallback";
        // Convert to chat format
        fallback.type = "chat";
        fallback.data = { text: "Fallback AI Response: " + fallback.data.summary };
        return fallback;
      }

    case "gemini-image":
      console.log(`[AI] Processing gemini-image with Gemini`);
      let localImageFile;
      try {
        localImageFile = await downloadFile(objectName);
        return await geminiImage(localImageFile, mimeType);
      } catch (err) {
        console.warn(`[AI] Image processing failed: ${err.message}`);
        return {
          provider: "mock-fallback",
          type: "image-caption",
          data: { text: "Fallback: Could not process image." }
        };
      } finally {
        if (localImageFile && fs.existsSync(localImageFile)) {
          fs.unlinkSync(localImageFile);
        }
      }

    case "gemini-pdf":
      console.log(`[AI] Processing gemini-pdf with Gemini`);
      let localPdfFile;
      try {
        localPdfFile = await downloadFile(objectName);
        return await geminiPDF(localPdfFile);
      } catch (err) {
        console.warn(`[AI] PDF processing failed: ${err.message}`);
        return {
          provider: "mock-fallback",
          type: "pdf-summary",
          data: { text: "Fallback: Could not process PDF." }
        };
      } finally {
        if (localPdfFile && fs.existsSync(localPdfFile)) {
          fs.unlinkSync(localPdfFile);
        }
      }

    case "url-summary":
      console.log(`[AI] Processing url-summary with Gemini`);
      try {
        return await geminiURLSummary(input);
      } catch (err) {
        console.warn(`[AI] URL summary failed: ${err.message}`);
        return {
          provider: "mock-fallback",
          type: "url-summary",
          data: { text: "Fallback: Could not scrape and summarize URL." }
        };
      }

    default:
      return { provider: "mock", type: "echo", data: { echo: input, model: "aiflow-echo-v1" } };
  }
}

// ─── RabbitMQ Connection ────────────────────────────────────────
async function connectRabbitMQ() {
  let retries = 10;
  while (retries) {
    try {
      const conn = await amqp.connect(`amqp://${process.env.RABBITMQ_HOST}`);
      conn.on("error", (err) => console.error("[Worker] RabbitMQ Connection Error:", err.message));
      conn.on("close", () => console.error("[Worker] RabbitMQ Connection Closed"));
      
      const channel = await conn.createChannel();
      channel.on("error", (err) => console.error("[Worker] RabbitMQ Channel Error:", err.message));
      channel.on("close", () => console.error("[Worker] RabbitMQ Channel Closed"));
      
      await channel.assertQueue(TASK_QUEUE, { durable: true });
      await channel.assertQueue(REALTIME_QUEUE, { durable: true });
      console.log("[Worker] RabbitMQ connected");
      return channel;
    } catch (err) {
      console.log(`[Worker] RabbitMQ retry… (${retries} left)`);
      retries -= 1;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("Could not connect to RabbitMQ");
}

// ─── Main Consumer Loop ────────────────────────────────────────
async function start() {
  await connectRedis();
  const channel = await connectRabbitMQ();

  // Prefetch 1 → enables horizontal scaling of workers
  channel.prefetch(1);

  console.log("[Worker] Waiting for tasks…");

  channel.consume(TASK_QUEUE, async (msg) => {
    if (!msg) return;

    const taskMessage = JSON.parse(msg.content.toString());
    const { taskId, type, payload } = taskMessage;
    const { input, objectName, mimeType } = payload;

    console.log(`[Worker] Processing task ${taskId} (${type})`);

    try {
      // Mark as processing
      await pool.query(
        "UPDATE tasks SET status = 'processing', updated_at = NOW() WHERE id = $1",
        [taskId]
      );

      // Notify realtime service: TASK_STARTED
      try {
        const startEvent = createEventMessage(taskId, TASK_STARTED, { type });
        channel.sendToQueue(REALTIME_QUEUE, Buffer.from(JSON.stringify(startEvent)), { persistent: true });
      } catch (e) {
        console.warn(`[Worker] Could not send TASK_STARTED for ${taskId}:`, e.message);
      }

      // Run AI
      const result = await processTask(type, input, objectName, mimeType);

      // Mark as completed
      await pool.query(
        "UPDATE tasks SET status = 'completed', result = $1, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(result), taskId]
      );

      // Invalidate Redis cache so next read gets fresh data
      try {
        if (redisClient.isReady) {
          await redisClient.del(`task:${taskId}`);
        }
      } catch (redisErr) {
        console.warn(`[Worker] Redis DEL failed, caching is inoperational: ${redisErr.message}`);
      }

      console.log(`[Worker] Task ${taskId} completed (cache invalidated)`);

      // Notify realtime service: TASK_COMPLETED
      try {
        const completeEvent = createEventMessage(taskId, TASK_COMPLETED, result);
        channel.sendToQueue(REALTIME_QUEUE, Buffer.from(JSON.stringify(completeEvent)), { persistent: true });
      } catch (e) {
        console.warn(`[Worker] Could not send TASK_COMPLETED for ${taskId}:`, e.message);
      }

      channel.ack(msg);
    } catch (err) {
      console.error(`[Worker] Task ${taskId} failed:`, err.message);

      try {
        await pool.query(
          "UPDATE tasks SET status = 'failed', result = $1, updated_at = NOW() WHERE id = $2",
          [JSON.stringify({ error: err.message }), taskId]
        );

        // Invalidate Redis cache on failure too
        try {
          if (redisClient.isReady) {
            await redisClient.del(`task:${taskId}`);
          }
        } catch (redisErr) {
          console.warn(`[Worker] Redis DEL failed: ${redisErr.message}`);
        }

        // Notify realtime service: TASK_FAILED
        try {
          const failEvent = createEventMessage(taskId, TASK_FAILED, null, err.message);
          channel.sendToQueue(REALTIME_QUEUE, Buffer.from(JSON.stringify(failEvent)), { persistent: true });
        } catch (e) {
          console.warn(`[Worker] Could not send TASK_FAILED for ${taskId}:`, e.message);
        }
      } catch (fallbackErr) {
         console.error(`[Worker] Failed to record failure for task ${taskId}:`, fallbackErr.message);
      } finally {
         channel.ack(msg);
      }
    }
  });
}

start().catch((err) => {
  console.error("[Worker] Fatal:", err.message);
  process.exit(1);
});
