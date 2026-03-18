# Development Guide

This guide describes how to extend AIFlow or modify existing logic.

## Project Structure

```text
aiflow/
├── api-gateway/       # Express proxy
├── task-service/      # Main logic & DB
├── worker/            # AI Processing simulation
├── realtime-service/  # WebSocket broadcaster
├── frontend/          # React App
├── shared/            # Shared contracts (Queues/Events)
└── docs/              # Technical docs
```

## Adding a New AI Task Type

To add a new processing type (e.g., "translation"):

1.  **Update Shared Schema**:
    Add the event type in `shared/events.js`.

2.  **Update Worker Logic**:
    In `worker/worker.js`, add a case to the `processTask` function:
    ```javascript
    case "translate":
      return { translated: "...", lang: "en" };
    ```

3.  **Update Frontend**:
    Add the new option to the select dropdown in `frontend/src/App.jsx`.

## Inter-Service Communication

### Shared Contracts
Always use the `shared/` directory to manage queue names and event types. This prevents "magic strings" and ensures services stay in sync.

Example using the event builder:
```javascript
const { createEventMessage } = require("./shared/taskSchema");
const { TASK_COMPLETED } = require("./shared/events");

const message = createEventMessage(taskId, TASK_COMPLETED, result);
```

### Service Discovery
Inside the Docker network, services are reached by their container names as defined in `docker-compose.yml`:
- `http://api-gateway:3000`
- `http://task-service:3001`
- `amqp://rabbitmq`
- `http://aiflow_postgres:5432`

## Local Development (No Docker)

If you wish to run a service locally for debugging:
1.  Ensure you have Node.js 20.
2.  Run `npm install` in the service directory.
3.  Set the required environment variables manually or use a local `.env`.
4.  Run `node server.js` or `node worker.js`.
