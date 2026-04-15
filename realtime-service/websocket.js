const WebSocket = require("ws");
const amqp = require("amqplib");
const http = require("http");

const PORT = process.env.REALTIME_PORT || 4000;
const HEALTH_PORT = 4001;
const { REALTIME_QUEUE } = require("./shared/queues");

// ─── Health Endpoint (HTTP) ────────────────────────────────────
http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "realtime-service" }));
}).listen(HEALTH_PORT, () => {
  console.log(`[Realtime] Health endpoint on port ${HEALTH_PORT}`);
});

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
      conn.on("error", (err) => console.error("[Realtime] RabbitMQ Connection Error:", err.message));
      conn.on("close", () => {
        console.error("[Realtime] RabbitMQ connection lost. Exiting for restart…");
        process.exit(1);
      });
      
      const channel = await conn.createChannel();
      channel.on("error", (err) => console.error("[Realtime] RabbitMQ Channel Error:", err.message));
      channel.on("close", () => {
        console.error("[Realtime] RabbitMQ channel closed. Exiting for restart…");
        process.exit(1);
      });
      
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
