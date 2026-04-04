const Minio = require("minio");

const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const bucket = process.env.MINIO_BUCKET;

async function ensureBucketExists() {
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket, "us-east-1");
    console.log(`[MinIO] Created bucket: ${bucket}`);
  }
}

async function uploadFile(file) {
  await ensureBucketExists();

  const objectName = `${Date.now()}-${file.originalname}`;

  await client.putObject(bucket, objectName, file.buffer, file.size, {
    "Content-Type": file.mimetype,
  });

  return {
    objectName,
    mimeType: file.mimetype,
  };
}

module.exports = { uploadFile };
