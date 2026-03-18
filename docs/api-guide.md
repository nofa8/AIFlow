# AIFlow API Guide

The API Gateway provides a unified REST interface to interact with the AIFlow processing engine.

## Base URL
`http://localhost:3000`

---

## Endpoints

### 1. Health Check
`GET /health`

Verifies that the API Gateway is operational.

**Response**:
```json
{
  "status": "ok",
  "service": "api-gateway"
}
```

### 2. Create Task
`POST /tasks`

Submits a new AI processing task. Supports both JSON and Multipart Form-Data (for file uploads).

**Headers**:
*   `Content-Type`: `application/json` or `multipart/form-data`

**Body (JSON)**:
```json
{
  "type": "sentiment | summarize | keywords",
  "input": "Text to process..."
}
```

**Body (Form-Data)**:
*   `type`: Task type string.
*   `input`: Input text.
*   `file`: (Optional) File attachment for processing.

**Response (201 Created)**:
```json
{
  "id": "uuid-v4",
  "type": "sentiment",
  "input": "...",
  "status": "queued",
  "file_path": "unique-filename.ext",
  "created_at": "timestamp"
}
```

### 3. List Tasks
`GET /tasks`

Retrieves the latest 50 tasks.

**Response**:
```json
[
  {
    "id": "...",
    "type": "sentiment",
    "status": "completed",
    "result": { ... },
    "created_at": "..."
  }
]
```

### 4. Get Task Details
`GET /tasks/:id`

Retrieves the full details of a specific task, including results if processing is finished.

**Response**:
```json
{
  "id": "uuid-v4",
  "status": "completed",
  "result": {
    "label": "positive",
    "score": 0.98,
    "model": "aiflow-sentiment-v1"
  }
}
```

---

## Error Handling

The API uses standard HTTP status codes:
*   `400 Bad Request`: Missing `input` or invalid format.
*   `404 Not Found`: Task ID does not exist.
*   `500 Internal Server Error`: Downstream service communication failure.
