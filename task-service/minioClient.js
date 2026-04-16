const Minio = require("minio");

const client = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT),
  useSSL: false,
  accessKey: process.env.MINIO_ROOT_USER,
  secretKey: process.env.MINIO_ROOT_PASSWORD,
  pathStyle: true // 🔥 Essential for reverse proxies and avoiding certificate mismatch
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
/**
 * Generates a temporary, secure URL for the browser to display the image.
 * Default expiry is 24 hours (86400 seconds).
 */
async function getFileUrl(objectName) {
  try {
    let url = await client.presignedGetObject(bucket, objectName, 24 * 60 * 60);
    
    // We need to return a path that the browser can use via NGINX.
    // Presigned URLs contain the 'Host' in the signature. 
    // Our NGINX is configured to pass the correct Host header to MinIO.
    const parsedUrl = new URL(url);
    const publicPath = `/minio${parsedUrl.pathname}${parsedUrl.search}`;
    return publicPath;
  } catch (err) {
    console.error(`[MinIO] Error generating URL: ${err.message}`);
    return null;
  }
}

/**
 * Retrieves the raw buffer of the file. 
 * Use this if your Worker needs to process the image (e.g., for AI analysis).
 */
async function getFileBuffer(objectName) {
  return new Promise((resolve, reject) => {
    let data = [];
    client.getObject(bucket, objectName, (err, dataStream) => {
      if (err) return reject(err);
      dataStream.on('data', (chunk) => data.push(chunk));
      dataStream.on('end', () => resolve(Buffer.concat(data)));
      dataStream.on('error', (err) => reject(err));
    });
  });
}

module.exports = { uploadFile, getFileUrl, getFileBuffer };
