# 🚀 Deployment & Infrastructure Guide

AIFlow is a fully containerized, cloud-native microservices platform. This guide explains how to configure, deploy, and operate the system using Docker Compose.

---

## ⚙️ Environment Configuration

All services are configured via a root `.env` file.

Start from:

```bash
cp .env.example .env
```

### 🔑 Core Infrastructure Variables

| Variable            | Description                              |
| ------------------- | ---------------------------------------- |
| `POSTGRES_USER`     | PostgreSQL user                          |
| `POSTGRES_PASSWORD` | PostgreSQL password                      |
| `POSTGRES_DB`       | Database name                            |
| `POSTGRES_HOST`     | Internal DB hostname (`aiflow_postgres`) |
| `POSTGRES_PORT`     | Default: `5432`                          |
| `RABBITMQ_HOST`     | RabbitMQ hostname (`aiflow_rabbitmq`)    |
| `REDIS_URL`         | Redis connection string                  |

---

### 🧠 External AI APIs (Required for Real AI Features)

AIFlow supports **real AI processing + fallback to mock**.

#### 1. Hugging Face (Text Sentiment)

* Used for: `hf-sentiment`
* Get API Key:

  1. Go to: [https://huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
  2. Create a **Read Token**

```env
HUGGINGFACE_API_KEY=hf_...
```

---

#### 2. Google Gemini (Multimodal AI)

* Used for:

  * Chat (`gemini-chat`)
  * Image analysis (`gemini-image`)
  * PDF analysis (`gemini-pdf`)

* Get API Key:

  1. Go to: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
  2. Generate API key

```env
GEMINI_API_KEY=AIza...
```

> ⚠️ If keys are missing or fail, the system **automatically falls back to mock AI**, ensuring resilience.

---

### 🪣 MinIO (S3 Object Storage)

MinIO replaces shared volumes with **true object storage**.

| Variable              | Description                    |
| --------------------- | ------------------------------ |
| `MINIO_ENDPOINT`      | Service hostname (`minio`)     |
| `MINIO_PORT`          | API port (`9000`)              |
| `MINIO_ROOT_USER`     | Access key                     |
| `MINIO_ROOT_PASSWORD` | Secret key                     |
| `MINIO_BUCKET`        | Default bucket (`uploads`)     |
| `MINIO_SERVER_URL`    | Public URL for presigned links |

Example:

```env
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin
MINIO_BUCKET=uploads
MINIO_SERVER_URL=http://localhost
```

### 📦 MinIO Behavior

* Files are uploaded via `multer.memoryStorage()`
* Stored as objects (`objectName`)
* Worker downloads temporarily to `/tmp`
* Files are **deleted after processing**
* UI uses **presigned URLs** for secure access (images, PDFs)

---

### 🌐 Cloudflare Tunnel (Optional Public Access)

Expose your system securely without opening ports:

```env
CLOUDFLARE_TUNNEL_TOKEN=your_token
```

* Provides HTTPS public endpoint
* Works seamlessly with NGINX

---

### 📊 Grafana Configuration

```env
GF_SECURITY_ADMIN_PASSWORD=admin
GF_SERVER_ROOT_URL=%(protocol)s://%(domain)s/grafana/
GF_SERVER_SERVE_FROM_SUB_PATH=true
```

* Access via: `http://localhost/grafana`

---

## 🐳 Service Orchestration

AIFlow runs **13 containers**, grouped as:

### Infrastructure Layer

* PostgreSQL
* Redis
* RabbitMQ (with Prometheus plugin)
* MinIO

### Core Services

* API Gateway
* Task Service
* Worker
* Realtime Service

### Edge Layer

* NGINX (single entrypoint)
* Cloudflare Tunnel (optional)

### Observability

* Prometheus
* Grafana
