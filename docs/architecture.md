# AIFlow Architecture

## Overview

AIFlow is a cloud-native AI task processing platform built with a microservices architecture. It demonstrates distributed systems concepts including asynchronous messaging, real-time notifications, and container orchestration.

## Services

| Service          | Technology       | Port  | Purpose                      |
| ---------------- | ---------------- | ----- | ---------------------------- |
| Frontend         | React + Vite     | 5173  | User interface               |
| API Gateway      | Express.js       | 3000  | Routing, auth, proxy         |
| Task Service     | Express.js + pg  | 3001  | Business logic, DB, queuing  |
| Worker           | Node.js + amqplib| —     | AI job processing            |
| Realtime Service | ws + amqplib     | 4000  | WebSocket notifications      |
| PostgreSQL       | PostgreSQL 15    | 5432  | Persistent data storage      |
| RabbitMQ         | RabbitMQ 3       | 5672  | Message broker               |

## Communication Patterns

### Synchronous (REST)
```
Frontend → API Gateway → Task Service → PostgreSQL
```

### Asynchronous (Message Queue)
```
Task Service → RabbitMQ (ai_tasks) → Worker Service
Worker Service → RabbitMQ (task_events) → Realtime Service
```

### Real-Time (WebSocket)
```
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
