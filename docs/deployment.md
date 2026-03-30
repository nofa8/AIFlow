# Deployment & Infrastructure Guide

AIFlow is designed to be fully containerized. This guide explains how to manage the infrastructure using Docker Compose.

## Environment Configuration

All services rely on the `.env` file at the root. Key variables include:

| Variable | Description | Default |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Database root password | `aiflow_secret` |
| `RABBITMQ_HOST` | Hostname for the broker | `rabbitmq` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `API_PORT` | Port for the gateway | `3000` |
| `FRONTEND_PORT` | Public port for the web UI | `5173` |

## Service Orchestration

### Dependency Management
The services use Docker `healthchecks` to ensure stable startup sequences:
1.  **PostgreSQL**, **RabbitMQ**, and **Redis** start first.
2.  **Task Service** and **Worker** wait for DB/Broker/Cache to be `healthy`.
3.  **API Gateway** starts once the Task Service is ready.
4.  **NGINX** starts as the final routing layer.

### Network Isolation
All services communicate over a private bridge network called `aiflow-net`.
- Only **NGINX** (Port 80) and **RabbitMQ Management** (Port 15672) expose ports to the host machine.
- Direct access to the database or message broker is restricted to the internal network.

## Persistence

AIFlow uses two managed Docker volumes:
1.  `postgres_data`: Ensures AI task results and logs survive container restarts.
2.  `uploads_data`: Stores files uploaded by users, mounted to `/app/uploads` in the `task-service` and `worker`.

## Scaling and Maintenance

### Horizontal Scaling
The system is ready for parallel processing. You can increase the number of workers to handle higher loads:

```bash
docker compose up -d --scale worker=5
```

### Resource Clean-up
To stop the cluster and remove all volumes (WARNING: deletes data):
```bash
docker compose down -v
```

### Logs
Monitor all services in real-time:
```bash
docker compose logs -f
```
