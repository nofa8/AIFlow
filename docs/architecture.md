# AIFlow Architecture

## Overview

AIFlow is a cloud-native AI task processing platform built with a microservices architecture. It demonstrates distributed systems concepts including asynchronous messaging, real-time notifications, and container orchestration.

## Services

| Service          | Technology       | Port  | Purpose                      |
| ---------------- | ---------------- | ----- | ---------------------------- |
| NGINX            | Nginx (Latest)   | 80    | Central Proxy/Entrypoint     |
| Frontend         | React + Vite     | 5173* | User interface               |
| API Gateway      | Express.js       | 3000* | Routing, auth, proxy         |
| Task Service     | Express.js + pg  | 3001* | Business logic, DB, queuing  |
| Worker           | Node.js + amqplib| —     | AI job processing            |
| Realtime Service | ws + amqplib     | 4000* | WebSocket notifications      |
| PostgreSQL       | PostgreSQL 15    | 5432* | Persistent data storage      |
| RabbitMQ         | RabbitMQ 3       | 5672  | Message broker               |
| Redis            | Redis 7          | 6379* | High-performance Caching     |

\* *Internal ports only, managed behind NGINX proxy.*

## Communication Patterns

### Synchronous (REST)

```bash
User (Browser) → NGINX (Port 80) → API Gateway → Task Service → Redis (Cache) → PostgreSQL
```

### Asynchronous (Message Queue)

```bash
Task Service → RabbitMQ (ai_tasks) → Worker Service
Worker Service → RabbitMQ (task_events) → Realtime Service
```

### Real-Time (WebSocket)

```bash
Realtime Service → WebSocket → Frontend (using task_events payload)
```

## Task Lifecycle

```
queued → processing → completed | failed
```

## Scaling

Workers can be scaled horizontally:
```
docker compose up --scale worker=3
```

Each worker uses `prefetch(1)` to ensure fair distribution.
