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
});

app.use('/api/tasks', taskServiceProxy);
app.use(express.json());
// ─── Health ──────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "api-gateway" });
});

// ─── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[API Gateway] listening on port ${PORT}`);
});
