const Minio = require("minio");
const fs = require("fs");
const path = require("path");

const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const bucket = process.env.MINIO_BUCKET;

async function downloadFile(objectName) {
  const filePath = path.join("/tmp", objectName);

  const stream = await client.getObject(bucket, objectName);
  const fileStream = fs.createWriteStream(filePath);

  return new Promise((resolve, reject) => {
    stream.pipe(fileStream);
    stream.on("end", () => resolve(filePath));
    stream.on("error", reject);
  });
}

module.exports = { downloadFile };
