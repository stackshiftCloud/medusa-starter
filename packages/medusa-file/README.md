# StackShift File provider for Medusa v2

Production Medusa File Module provider for StackShift's S3-compatible object
storage gateway. It supports uploads, idempotent deletion, presigned uploads and
downloads, buffered upload/download streams, and buffer reads without writing to
local disk.

```ts
{
  resolve: "@stackshift-cloud/medusa-file",
  id: "stackshift",
  options: {
    mode: "s3",
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    bucket: process.env.S3_BUCKET,
    access_key_id: process.env.S3_ACCESS_KEY_ID,
    secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
    file_url: process.env.S3_FILE_URL,
    prefix: "medusa/",
  },
}
```

The provider implements AWS Signature Version 4 with platform APIs only; it does
not add an AWS SDK dependency. `file_url` is optional and defaults to
`endpoint/bucket`. StackShift injects independent credentials and buckets per
environment.

The earlier StackShift Assets API transport remains available with `mode: "api"`,
`api_key`, and `file_url` for existing installations.
