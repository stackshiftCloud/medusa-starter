import { defineConfig } from "@medusajs/framework/utils"

const production = process.env.NODE_ENV === "production"
const redisUrl = requiredInProduction("REDIS_URL")
const databaseUrl = requiredInProduction("DATABASE_URL")
const jwtSecret = requiredInProduction("JWT_SECRET") ?? "local-jwt-secret"
const cookieSecret = requiredInProduction("COOKIE_SECRET") ?? "local-cookie-secret"
const workerMode = medusaWorkerMode(process.env.MEDUSA_WORKER_MODE)

const modules: Array<Record<string, unknown>> = []

if (redisUrl) {
  modules.push(
    {
      resolve: "@medusajs/medusa/caching",
      options: {
        providers: [{
          resolve: "@medusajs/caching-redis",
          id: "caching-redis",
          is_default: true,
          options: { redisUrl, prefix: environmentPrefix("cache") },
        }],
      },
    },
    {
      resolve: "@medusajs/medusa/event-bus-redis",
      options: {
        redisUrl,
        queueName: environmentPrefix("events"),
        jobOptions: {
          removeOnComplete: { age: 3600, count: 1000 },
          removeOnFail: { age: 86400, count: 5000 },
        },
      },
    },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { redisUrl }, queueName: environmentPrefix("workflows") },
    },
    {
      resolve: "@medusajs/medusa/locking",
      options: {
        providers: [{
          resolve: "@medusajs/medusa/locking-redis",
          id: "locking-redis",
          is_default: true,
          options: { redisUrl, prefix: environmentPrefix("locks") },
        }],
      },
    },
  )
}

const s3 = {
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  bucket: process.env.S3_BUCKET,
  access_key_id: process.env.S3_ACCESS_KEY_ID,
  secret_access_key: process.env.S3_SECRET_ACCESS_KEY,
}
const s3Values = Object.values(s3)
if (s3Values.some(Boolean) && !s3Values.every(Boolean)) {
  throw new Error("S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY must be configured together")
}
if (s3Values.every(Boolean)) {
  modules.push({
    resolve: "@medusajs/medusa/file",
    options: {
      providers: [{
        resolve: "@stackshift-cloud/medusa-file",
        id: "stackshift",
        options: {
          mode: "s3",
          ...s3,
          file_url: process.env.S3_FILE_URL,
          prefix: "medusa/",
        },
      }],
    },
  })
}

if (process.env.STACKSHIFT_MAIL_API_KEY && process.env.STACKSHIFT_MAIL_FROM) {
  modules.push({
    resolve: "@medusajs/medusa/notification",
    options: {
      providers: [{
        resolve: "@stackshift-cloud/medusa-notification",
        id: "stackshift",
        options: {
          api_key: process.env.STACKSHIFT_MAIL_API_KEY,
          mail_url: process.env.STACKSHIFT_MAIL_URL,
          from: process.env.STACKSHIFT_MAIL_FROM,
          channels: ["email"],
          sandbox: process.env.STACKSHIFT_MAIL_SANDBOX === "true",
          sandbox_to: process.env.STACKSHIFT_MAIL_SANDBOX_TO,
        },
      }],
    },
  })
}

const paymentProviders: Array<Record<string, unknown>> = []
const paystackSecret = paymentSecret("PAYSTACK_SECRET_KEY", "sk_test_")
const flutterwaveSecret = paymentSecret("FLUTTERWAVE_SECRET_KEY", "FLWSECK_TEST-")
if (paystackSecret) {
  paymentProviders.push({
    resolve: "@stackshift-cloud/medusa-payment-paystack",
    id: "paystack",
    options: {
      secret_key: paystackSecret,
      webhook_secret: process.env.PAYSTACK_WEBHOOK_SECRET,
      callback_url: process.env.PAYSTACK_CALLBACK_URL,
    },
  })
}
if (flutterwaveSecret) {
  paymentProviders.push({
    resolve: "@stackshift-cloud/medusa-payment-flutterwave",
    id: "flutterwave",
    options: {
      secret_key: flutterwaveSecret,
      webhook_secret: process.env.FLUTTERWAVE_WEBHOOK_SECRET,
      redirect_url: process.env.FLUTTERWAVE_REDIRECT_URL,
    },
  })
}
if (paymentProviders.length) {
  modules.push({ resolve: "@medusajs/medusa/payment", options: { providers: paymentProviders } })
}

export default defineConfig({
  featureFlags: { caching: Boolean(redisUrl) },
  projectConfig: {
    databaseUrl,
    redisUrl,
    workerMode,
    http: {
      storeCors: cors("STORE_CORS", "http://localhost:8000"),
      adminCors: cors("ADMIN_CORS", "http://localhost:9000"),
      authCors: cors("AUTH_CORS", "http://localhost:8000,http://localhost:9000"),
      jwtSecret,
      cookieSecret,
    },
  },
  admin: {
    disable: process.env.DISABLE_MEDUSA_ADMIN === "true",
    backendUrl: process.env.MEDUSA_BACKEND_URL,
  },
  modules,
})

function requiredInProduction(name: string): string | undefined {
  const value = process.env[name]
  if (production && !value) throw new Error(`${name} is required in production`)
  return value
}

function cors(name: string, development: string): string {
  const value = process.env[name] ?? (production ? "" : development)
  if (!value) throw new Error(`${name} is required in production`)
  return value
}

function environmentPrefix(scope: string): string {
  return `${process.env.STACKSHIFT_ENVIRONMENT_ID ?? "local"}:${scope}:`
}

function paymentSecret(name: string, testPrefix: string): string | undefined {
  const value = process.env[name]
  if (value && process.env.STACKSHIFT_PAYMENT_MODE === "test" && !value.startsWith(testPrefix)) {
    throw new Error(`${name} must use test credentials outside production`)
  }
  return value
}

function medusaWorkerMode(value: string | undefined): "shared" | "worker" | "server" {
  const mode = value ?? "shared"
  if (mode !== "shared" && mode !== "worker" && mode !== "server") {
    throw new Error("MEDUSA_WORKER_MODE must be shared, worker, or server")
  }
  return mode
}
