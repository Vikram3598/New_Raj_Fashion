import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT;
const accessKeyId = process.env.S3_ACCESS_KEY;
const secretAccessKey = process.env.S3_SECRET_KEY;
const publicBucket = process.env.S3_BUCKET || "new-raj-fashion";
const privateBucket = process.env.S3_PRIVATE_BUCKET || "new-raj-fashion-private";

if (!endpoint) throw new Error("S3_ENDPOINT must point to the local RustFS service.");
const host = new URL(endpoint).hostname.replace(/^\[|\]$/g, "");
if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
  throw new Error("Local storage setup is restricted to a localhost S3 endpoint.");
}
if (!accessKeyId || !secretAccessKey) {
  throw new Error("Set S3_ACCESS_KEY and S3_SECRET_KEY to the local RustFS credentials.");
}

const client = new S3Client({
  region: process.env.S3_REGION || "ap-south-1",
  endpoint,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId, secretAccessKey },
});

async function ensureBucket(name) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: name }));
    return;
  } catch (error) {
    if (!["NotFound", "NoSuchBucket"].includes(error?.name) && error?.$metadata?.httpStatusCode !== 404) {
      throw error;
    }
  }
  try {
    await client.send(new CreateBucketCommand({ Bucket: name }));
  } catch (error) {
    if (error?.name !== "BucketAlreadyOwnedByYou") throw error;
  }
}

await ensureBucket(publicBucket);
await ensureBucket(privateBucket);
await client.send(new PutBucketPolicyCommand({
  Bucket: publicBucket,
  Policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [{
      Sid: "PublicReadProductImagesOnly",
      Effect: "Allow",
      Principal: "*",
      Action: ["s3:GetObject"],
      Resource: [`arn:aws:s3:::${publicBucket}/*`],
    }],
  }),
}));

console.info(`Local S3 buckets are ready: ${publicBucket} (public image reads), ${privateBucket} (private reference images).`);
