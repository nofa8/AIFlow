const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const app = express();
const PORT = process.env.API_PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────
app.use(cors());
app.use(morgan("combined"));
const { createProxyMiddleware } = require("http-proxy-middleware");

const taskServiceProxy = createProxyMiddleware({
  target: `http://aiflow_task_service:${process.env.TASK_SERVICE_PORT || 3001}`,
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error("[API Gateway] Proxy Error:", err.message);
    res.status(503).json({ error: "Task service is temporarily unavailable. Please try again later." });
  }
});

app.use('/tasks', taskServiceProxy);
app.use(express.json());

const axios = require("axios");
const net = require("net");

// ─── Health ──────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

// ─── Aggregated Health Dashboard ─────────────────────────────────
const HEALTH_TARGETS = [
  { name: "Task Service",    url: "http://aiflow_task_service:3001/health" },
  { name: "Worker",          url: "http://aiflow_worker:4002/" },
  { name: "Realtime",        url: "http://aiflow_realtime_service:4001/" },
  { name: "RabbitMQ",        url: "http://aiflow_rabbitmq:15672/api/healthchecks/node", allowAuthErrors: true },
  { name: "Redis",           url: "http://aiflow_redis:6379",  tcp: true },
  { name: "PostgreSQL",      url: "http://aiflow_postgres:5432", tcp: true },
];

app.get("/health/all", async (_req, res) => {
  const results = await Promise.all(
    HEALTH_TARGETS.map((target) => {
      const start = Date.now();
      
      // Handle TCP-only services (Postgres / Redis)
      if (target.tcp) {
        return new Promise((resolve) => {
          const urlObj = new URL(target.url);
          const socket = new net.Socket();
          
          socket.setTimeout(3000);
          
          socket.on('connect', () => {
            socket.destroy();
            resolve({ name: target.name, status: "up", responseMs: Date.now() - start });
          });
          
          socket.on('timeout', () => {
            socket.destroy();
            resolve({ name: target.name, status: "down", responseMs: Date.now() - start, error: "timeout" });
          });
          
          socket.on('error', (err) => {
            resolve({ name: target.name, status: "down", responseMs: Date.now() - start, error: err.message });
          });
          
          socket.connect(urlObj.port, urlObj.hostname);
        });
      }

      // Handle HTTP services
      const axiosConfig = { timeout: 3000 };
      
      // If the service allows auth errors (RabbitMQ), override the status validation
      if (target.allowAuthErrors) {
        axiosConfig.validateStatus = (status) => {
          return status < 500 && status !== 404;
        };
      }

      return axios.get(target.url, axiosConfig)
        .then(() => ({ name: target.name, status: "up", responseMs: Date.now() - start }))
        .catch((err) => ({ name: target.name, status: "down", responseMs: Date.now() - start, error: err.message }));
    })
  );

  const allUp = results.every((r) => r.status === "up");
  res.json({ overall: allUp ? "healthy" : "degraded", services: results });
});

// ─── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[API Gateway] listening on port ${PORT}`);
});