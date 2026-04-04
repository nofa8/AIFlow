# AIFlow Architecture

## System Diagram

```mermaid
graph TB
    subgraph Client
        Browser["🌐 Browser"]
    end

    subgraph entrypoint["Entrypoint - Port 80"]
        NGINX["🔀 NGINX Reverse Proxy"]
    end

    subgraph frontend_svc["Frontend"]
        FE["⚛️ React + Vite"]
    end

    subgraph backend["Backend Services"]
        GW["🚪 API Gateway :3000"]
        TS["📋 Task Service :3001"]
        WK["⚙️ Worker"]
        RT["📡 Realtime Service :4000"]
    end

    subgraph infra["Infrastructure"]
        PG[("🐘 PostgreSQL 15")]
        RMQ["🐇 RabbitMQ 3"]
        RD["⚡ Redis 7"]
        MN["🪣 MinIO (S3)"]
    end

    Browser -->|"HTTP / WS"| NGINX

    NGINX -->|"/"| FE
    NGINX -->|"/api/*"| GW
    NGINX -->|"/ws"| RT

    GW -->|"proxy /tasks"| TS
    TS -->|"read/write"| PG
    TS -->|"cache read"| RD
    TS -->|"store payload"| MN

    TS -->|"publish task"| RMQ
    RMQ -->|"consume task"| WK

    WK -->|"fetch payload"| MN

    WK -->|"update status"| PG
    WK -->|"invalidate cache"| RD
    WK -->|"publish event"| RMQ

    RMQ -->|"consume event"| RT
    RT -->|"WebSocket push"| Browser
```

## Services

| Service | Technology | Port | Purpose |
| --- | --- | --- | --- |
| NGINX | Nginx (Latest) | 80 | Central Proxy / Entrypoint |
| Frontend | React + Vite | 5173* | User interface |
| API Gateway | Express.js | 3000* | Routing, auth, proxy |
| Task Service | Express.js + pg | 3001* | Business logic, DB, queuing |
| Worker | Node.js + amqplib | — | AI job processing |
| Realtime Service | ws + amqplib | 4000* | WebSocket notifications |
| PostgreSQL | PostgreSQL 15 | 5432* | Persistent data storage |
| RabbitMQ | RabbitMQ 3 | 5672 | Message broker |
| Redis | Redis 7 | 6379* | Caching + invalidation |
| MinIO | Linux/MinIO | 9000*, 9001* | S3-Compatible Storage |

\* *Internal ports only, not exposed — managed behind NGINX proxy.*

## Communication Patterns

### 1. Synchronous (REST)

```text
Browser → NGINX :80 → API Gateway :3000 → Task Service :3001 → PostgreSQL / Redis
```

### 2. Asynchronous (Message Queue)

```text
Task Service  ──publish──→  RabbitMQ (ai_tasks)   ──consume──→  Worker
Worker        ──publish──→  RabbitMQ (task_events) ──consume──→  Realtime Service
```

### 3. S3-Compatible Object Storage Flow

- **Safe Gateway Filtering**: Ingress blocks objects > 5MB via `multer.memoryStorage()` defending cluster memory limits.
- **Storage Queue**: Gateway dynamically mints objects onto MinIO (`objectName`/`mimeType`), passing purely text metadata to RabbitMQ.
- **Node Execution**: The Worker securely streams binaries back into `/tmp/` and handles cleanup securely inside a `finally` block preventing container saturation.

### 4. Real-Time (WebSocket)

```text
Realtime Service ──WebSocket push──→ Browser (live status updates)
```

## Task Lifecycle & Fallover

```text
queued → processing → completed | failed
```

If the primary API (Hugging Face / Gemini) experiences a timeout event during the `processing` state, a robust `try/catch` sequence intercepts the exception and seamlessly reroutes the prediction to a resilient internal `mock-fallback`. This prevents cascade crashes and retains Real-Time Client visualization!

## Caching Strategy

- **Read-through cache**: `GET /tasks/:id` checks Redis first (60s TTL), falls back to PostgreSQL
- **Cache invalidation**: Worker deletes `task:{id}` from Redis on completion/failure
- **Consistency**: Ensures fresh data after status changes

## Scaling

Workers can be scaled horizontally:

```bash
docker compose up -d --scale worker=3
```

Each worker uses `prefetch(1)` to ensure fair distribution across instances.

## Security

- NGINX security headers: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`
- Server version hidden (`server_tokens off`)
- No direct service port exposure — all traffic routes through NGINX
