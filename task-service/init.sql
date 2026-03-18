-- AIFlow database schema

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        VARCHAR(50)  NOT NULL DEFAULT 'sentiment',
  input       TEXT         NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'queued',
  result      JSONB,
  file_path   VARCHAR(255),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Valid statuses: queued, processing, completed, failed
