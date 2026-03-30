const express = require("express");
const { Pool } = require("pg");
const amqp = require("amqplib");
const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const redis = require("redis");


const app = express();
app.use(express.json());

const PORT = process.env.TASK_SERVICE_PORT || 3001;

// ─── File Upload (Docker Volume) ────────────────────────────────
const storage = multer.diskStorage({
  destination: "/app/uploads",
  filename: (_req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ─── PostgreSQL ─────────────────────────────────────────────────
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});

async function connectDB() {
  let retries = 10;
  while (retries) {
    try {
      await pool.query("SELECT 1");
      console.log("[Task Service] Database connected");
      return;
    } catch (err) {
      console.log(`[Task Service] DB retry… (${retries} left)`);
      retries -= 1;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("Could not connect to database");
}

// ─── RabbitMQ ───────────────────────────────────────────────────
let channel = null;

const { TASK_QUEUE, REALTIME_QUEUE } = require("./shared/queues");

async function connectRabbitMQ() {
  let retries = 10;
  while (retries) {
    try {
      const conn = await amqp.connect(`amqp://${process.env.RABBITMQ_HOST}`);
      channel = await conn.createChannel();
      await channel.assertQueue(TASK_QUEUE, { durable: true });
      await channel.assertQueue(REALTIME_QUEUE, { durable: true });
      console.log("[Task Service] RabbitMQ connected");
      return;
    } catch (err) {
      console.log(`[Task Service] RabbitMQ retry… (${retries} left)`);
      retries -= 1;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("Could not connect to RabbitMQ");
}

// ─── Redis (Caching) ───────────────────────────────────────────
const redisClient = redis.createClient({ url: process.env.REDIS_URL });

async function connectRedis() {
  let retries = 10;
  while (retries) {
    try {
      await redisClient.connect();
      console.log("[Task Service] Redis connected");
      return;
    } catch (err) {
      console.log(`[Task Service] Redis retry… (${retries} left)`);
      retries -= 1;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("Could not connect to Redis");
}


// ─── Routes ─────────────────────────────────────────────────────

// Health
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "task-service" });
});

// Create task (sync REST → async queue)
app.post("/", upload.single("file"), async (req, res) => {
  try {
    const { type = "sentiment", input } = req.body;

    // ─── Input Validation ─────────────────────────────────────
    const ALLOWED_TYPES = ["sentiment", "summarize", "keywords"];
    if (!ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid task type. Allowed: ${ALLOWED_TYPES.join(", ")}` });
    }

    if (!input || typeof input !== "string" || !input.trim()) {
      return res.status(400).json({ error: "input is required" });
    }

    if (input.length > 5000) {
      return res.status(400).json({ error: "input exceeds maximum length of 5000 characters" });
    }

    const filePath = req.file ? req.file.filename : null;

    const result = await pool.query(
      `INSERT INTO tasks (type, input, status, file_path)
       VALUES ($1, $2, 'queued', $3)
       RETURNING *`,
      [type, input, filePath]
    );

    const task = result.rows[0];

    const { createTaskMessage, createEventMessage } = require("./shared/taskSchema");
    const { TASK_QUEUE, REALTIME_QUEUE } = require("./shared/queues");
    const { TASK_QUEUED } = require("./shared/events");

    // Publish to queue for async processing
    const taskMessage = createTaskMessage(task.id, task.type, task.input);
    channel.sendToQueue(TASK_QUEUE, Buffer.from(JSON.stringify(taskMessage)), { persistent: true });

    // Publish realtime event
    const eventMessage = createEventMessage(task.id, TASK_QUEUED, { type: task.type, input: task.input });
    channel.sendToQueue(REALTIME_QUEUE, Buffer.from(JSON.stringify(eventMessage)), { persistent: true });

    console.log(`[Task Service] Task ${task.id} queued and event published`);
    res.status(201).json(task);
  } catch (err) {
    console.error("[Task Service] Error creating task:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List tasks
app.get("/", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM tasks ORDER BY created_at DESC LIMIT 50"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("[Task Service] Error listing tasks:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get single task (with Caching)
app.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Check Cache
    const cachedTask = await redisClient.get(`task:${id}`);
    if (cachedTask) {
      console.log(`[Task Service] Cache hit for task ${id}`);
      return res.json({ source: "redis", data: JSON.parse(cachedTask) });
    }

    // 2. Cache Miss -> Query DB
    const result = await pool.query("SELECT * FROM tasks WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    const task = result.rows[0];

    // 3. Save to Cache for 60 seconds
    await redisClient.setEx(`task:${id}`, 60, JSON.stringify(task));

    res.json({ source: "postgres", data: task });
  } catch (err) {
    console.error("[Task Service] Error fetching task:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Start ──────────────────────────────────────────────────────
async function start() {
  await connectDB();
  await connectRedis();
  await connectRabbitMQ();

  app.listen(PORT, () => {
    console.log(`[Task Service] listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error("[Task Service] Fatal:", err.message);
  process.exit(1);
});
