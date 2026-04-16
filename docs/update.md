# AIFlow Project Updates & Hardening Log

## [2026-04-16] - Observability & Resilience Hardening

### 🚀 New Features
- **Full Observability Suite**: Integrated Prometheus and Grafana.
  - Added `redis-exporter` for deep Redis memory and throughput metrics.
  - Pre-provisioned Grafana dashboards for Core Platform Health.
- **Secure Media Playback**: Implemented S3 Presigned URLs for MinIO.
  - Image tasks now render directly in the UI.
  - PDF tasks now provide secure, temporary download links.
  - Integrated NGINX routing rewrite to keep S3 signatures valid across internal/external networks.

### 🛡️ Resilience & Stability
- **RabbitMQ "Crash-on-Disconnect"**: Services now explicitly call `process.exit(1)` when the AMQP connection drops. This triggers Docker's `restart: on-failure` for immediate, clean reconnection recovery.
- **Orphaned Row Protection**: Added "Channel Guards" to the Task Service. Tasks are no longer committed to PostgreSQL if the RabbitMQ channel is down, preventing "ghost" queued tasks.
- **Universal Health Checks**: Every container (including NGINX and Observability tools) now has a localized `healthcheck` ensuring deterministic startup sequences.
- **Graceful Shutdown**: Increased `stop_grace_period` to 30s for Workers to ensure in-flight AI tasks can finish and acknowledge before the container terminates.

### ⚡ Performance & Consistency
- **Persistent Cache State**: Added `is_cache_hit` column to the Database. "Cached" statuses now survive UI refreshes.
- **Virtual Task Pattern**: Cache hits are now recorded as completed tasks in the database, ensuring audit logging and a unified event stream.
- **Backend-Driven Sorting**: The Task Service now enforces strict chronological ordering, removing race conditions and "data ghosts" in the React state.

## [Earlier Updates]
- **Multimodal AI**: Added Gemini API support for PDF and Image analysis.
- **Object Storage**: Migrated from local volumes to MinIO S3 for shared compute state.
- **Security**: Hardened NGINX with strict security headers and version masking.
