const WebSocket = require("ws");
const amqp = require("amqplib");

const PORT = process.env.REALTIME_PORT || 4000;
const { REALTIME_QUEUE } = require("./shared/queues");

// ─── WebSocket Server ──────────────────────────────────────────
const wss = new WebSocket.Server({ port: PORT });
const clients = new Set();

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[Realtime] Client connected (${clients.size} total)`);

  ws.send(JSON.stringify({ type: "connected", message: "Welcome to AIFlow Realtime" }));

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[Realtime] Client disconnected (${clients.size} total)`);
  });
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// ─── RabbitMQ Consumer ─────────────────────────────────────────
async function connectRabbitMQ() {
  let retries = 10;
  while (retries) {
    try {
      const conn = await amqp.connect(`amqp://${process.env.RABBITMQ_HOST}`);
      const channel = await conn.createChannel();
      await channel.assertQueue(REALTIME_QUEUE, { durable: true });
      console.log("[Realtime] RabbitMQ connected");
      return channel;
    } catch (err) {
      console.log(`[Realtime] RabbitMQ retry… (${retries} left)`);
      retries -= 1;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw new Error("Could not connect to RabbitMQ");
}

async function start() {
  console.log(`[Realtime] WebSocket server on port ${PORT}`);

  const channel = await connectRabbitMQ();

  channel.consume(REALTIME_QUEUE, (msg) => {
    if (!msg) return;

    const eventMessage = JSON.parse(msg.content.toString());
    console.log(`[Realtime] Broadcasting: task ${eventMessage.taskId} → ${eventMessage.status}`);

    broadcast({
      type: "task_update",
      ...eventMessage,
    });

    channel.ack(msg);
  });
}

start().catch((err) => {
  console.error("[Realtime] Fatal:", err.message);
  process.exit(1);
});
