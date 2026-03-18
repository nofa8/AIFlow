const amqp = require("amqplib");
const { Pool } = require("pg");

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

// ─── AI Processing (simulated) ─────────────────────────────────
async function processTask(type, input) {
  // Simulate AI processing delay (1 – 3 seconds)
  await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000));

  switch (type) {
    case "sentiment": {
      const score = Math.random();
      const label = score > 0.6 ? "positive" : score > 0.3 ? "neutral" : "negative";
      return { label, score: parseFloat(score.toFixed(3)), model: "aiflow-sentiment-v1" };
    }

    case "summarize": {
      const words = input.split(/\s+/);
      const summary =
        words.length > 10
          ? words.slice(0, Math.ceil(words.length * 0.3)).join(" ") + "…"
          : input;
      return { summary, original_length: words.length, model: "aiflow-summarizer-v1" };
    }

    case "keywords": {
      const words = input.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
      const freq = {};
      words.forEach((w) => (freq[w] = (freq[w] || 0) + 1));
      const keywords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word, count]) => ({ word, count }));
      return { keywords, model: "aiflow-keywords-v1" };
    }

    default:
      return { echo: input, model: "aiflow-echo-v1" };
  }
}

// ─── RabbitMQ Connection ────────────────────────────────────────
async function connectRabbitMQ() {
  let retries = 10;
  while (retries) {
    try {
      const conn = await amqp.connect(`amqp://${process.env.RABBITMQ_HOST}`);
      const channel = await conn.createChannel();
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
  const channel = await connectRabbitMQ();

  // Prefetch 1 → enables horizontal scaling of workers
  channel.prefetch(1);

  console.log("[Worker] Waiting for tasks…");

  channel.consume(TASK_QUEUE, async (msg) => {
    if (!msg) return;

    const taskMessage = JSON.parse(msg.content.toString());
    const { taskId, type, payload } = taskMessage;
    const input = payload.input;

    console.log(`[Worker] Processing task ${taskId} (${type})`);

    try {
      // Mark as processing
      await pool.query(
        "UPDATE tasks SET status = 'processing', updated_at = NOW() WHERE id = $1",
        [taskId]
      );

      // Notify realtime service: TASK_STARTED
      const startEvent = createEventMessage(taskId, TASK_STARTED, { type });
      channel.sendToQueue(REALTIME_QUEUE, Buffer.from(JSON.stringify(startEvent)), { persistent: true });

      // Run AI
      const result = await processTask(type, input);

      // Mark as completed
      await pool.query(
        "UPDATE tasks SET status = 'completed', result = $1, updated_at = NOW() WHERE id = $2",
        [JSON.stringify(result), taskId]
      );

      console.log(`[Worker] Task ${taskId} completed`);

      // Notify realtime service: TASK_COMPLETED
      const completeEvent = createEventMessage(taskId, TASK_COMPLETED, result);
      channel.sendToQueue(REALTIME_QUEUE, Buffer.from(JSON.stringify(completeEvent)), { persistent: true });

      channel.ack(msg);
    } catch (err) {
      console.error(`[Worker] Task ${taskId} failed:`, err.message);

      await pool.query(
        "UPDATE tasks SET status = 'failed', result = $1, updated_at = NOW() WHERE id = $2",
        [JSON.stringify({ error: err.message }), taskId]
      );

      // Notify realtime service: TASK_FAILED
      const failEvent = createEventMessage(taskId, TASK_FAILED, null, err.message);
      channel.sendToQueue(REALTIME_QUEUE, Buffer.from(JSON.stringify(failEvent)), { persistent: true });

      channel.ack(msg);
    }
  });
}

start().catch((err) => {
  console.error("[Worker] Fatal:", err.message);
  process.exit(1);
});
