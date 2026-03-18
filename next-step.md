# Manual Verification Guide

This document outlines the steps required to manually verify the full functionality of the AIFlow microservices system.

## 1. Infrastructure Bootstrapping

**Goal**: Ensure all 7 containers start and reach a healthy state.

1. **Command**:
   ```bash
   docker compose up -d
   ```

2. **Verification**:
   * Run `docker compose ps` and verify all services are `running` or `healthy`.
   * Check logs for errors: `docker compose logs -f`.

## 2. API Gateway & Connectivity

**Goal**: Verify the entry point handles requests and routes to internal services.

1. **Health Check**:
   ```bash
   curl http://localhost:3000/health
   ```
   * Expect: `{"status":"ok", "service":"api-gateway"}`

2. **Task Service Proxy**:
   ```bash
   curl http://localhost:3000/tasks
   ```
   * Expect: `[]` (if database is empty) or a list of tasks.

## 3. Asynchronous Task Processing (E2E)

**Goal**: Verify a task moves from Gateway → Task Service → RabbitMQ → Worker → Database.

1. **Submit Task**:
   ```bash
   curl -X POST http://localhost:3000/tasks \
     -F "type=sentiment" \
     -F "input=This is a amazing project!"
   ```

2. **Verify DB Update**:
   * Wait ~3 seconds.
   * Run `curl http://localhost:3000/tasks`.
   * Expect: The new task to have `status: "completed"` and a `result` object containing a sentiment label.

## 4. Real-time Notifications (WebSocket)

**Goal**: Verify updates are pushed to the frontend via WebSockets.

1. **Connection**:
   * Open the Browser at `http://localhost:5173`.
   * Verify the "Realtime Connected" badge is green.

2. **Live Update**:
   * Submit a task via the browser form.
   * Expect: A toast notification to appear immediately saying "Task ... queued".
   * Expect: The status in the task list to update from `queued` → `processing` → `completed` in real-time without refreshing the page.

## 5. Persistent Storage & File Uploads

**Goal**: Verify files are stored correctly in the Docker volume.

1. **Upload File**:
   ```bash
   echo "test content" > test_file.txt
   curl -X POST http://localhost:3000/tasks \
     -F "type=summarize" \
     -F "input=Summarize this file" \
     -F "file=@test_file.txt"
   ```

2. **Verification**:
   * Check `task-service` container: `docker compose exec task-service ls /app/uploads`.
   * Verify the new file (UUID filename) exists.

## 6. Horizontal Scaling (Optional)

**Goal**: Verify load distribution across multiple workers.

1. **Scale Workers**:
   ```bash
   docker compose up -d --scale worker=3
   ```

2. **Verification**:
   * Submit 10 tasks in rapid succession.
   * Check logs: `docker compose logs worker`.
   * Verify that different worker container IDs are processing different tasks.
