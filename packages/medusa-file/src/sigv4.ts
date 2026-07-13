const algorithm = "AWS4-HMAC-SHA256"
const service = "s3"
const unsignedPayload = "UNSIGNED-PAYLOAD"

export interface SigV4Credentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
}

export interface SignRequestInput {
  method: string
  url: string | URL
  region: string
  credentials: SigV4Credentials
  payloadHash: string
  headers?: Record<string, string>
  canonicalPath?: string
  now?: Date
}

export interface PresignRequestInput extends Omit<SignRequestInput, "payloadHash" | "headers"> {
  expiresIn: number
}

export async function signRequest(input: SignRequestInput): Promise<Record<string, string>> {
  const url = new URL(input.url)
  const timestamp = amzTimestamp(input.now ?? new Date())
  const date = timestamp.slice(0, 8)
  const headers: Record<string, string> = Object.fromEntries(
    Object.entries(input.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  )
  Object.assign(headers, {
    host: url.host,
    "x-amz-content-sha256": input.payloadHash,
    "x-amz-date": timestamp,
  })
  if (input.credentials.sessionToken) headers["x-amz-security-token"] = input.credentials.sessionToken
  const signedHeaders = Object.keys(headers).sort()
  const scope = credentialScope(date, input.region)
  const canonical = canonicalRequest(
    input.method,
    input.canonicalPath ?? url.pathname,
    canonicalQuery(url.searchParams),
    headers,
    signedHeaders,
    input.payloadHash,
  )
  const signature = await calculateSignature(
    input.credentials.secretAccessKey,
    date,
    input.region,
    timestamp,
    scope,
    canonical,
  )
  return {
    ...input.headers,
    "Authorization": `${algorithm} Credential=${input.credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders.join(";")}, Signature=${signature}`,
    "X-Amz-Content-Sha256": input.payloadHash,
    "X-Amz-Date": timestamp,
    ...(input.credentials.sessionToken ? { "X-Amz-Security-Token": input.credentials.sessionToken } : {}),
  }
}

export async function presignRequest(input: PresignRequestInput): Promise<string> {
  if (!Number.isInteger(input.expiresIn) || input.expiresIn < 1 || input.expiresIn > 604800) {
    throw new Error("S3 presigned URL expiry must be between 1 and 604800 seconds")
  }
  const url = new URL(input.url)
  const timestamp = amzTimestamp(input.now ?? new Date())
  const date = timestamp.slice(0, 8)
  const scope = credentialScope(date, input.region)
  url.searchParams.set("X-Amz-Algorithm", algorithm)
  url.searchParams.set("X-Amz-Credential", `${input.credentials.accessKeyId}/${scope}`)
  url.searchParams.set("X-Amz-Date", timestamp)
  url.searchParams.set("X-Amz-Expires", String(input.expiresIn))
  url.searchParams.set("X-Amz-SignedHeaders", "host")
  if (input.credentials.sessionToken) {
    url.searchParams.set("X-Amz-Security-Token", input.credentials.sessionToken)
  }
  const canonical = canonicalRequest(
    input.method,
    input.canonicalPath ?? url.pathname,
    canonicalQuery(url.searchParams),
    { host: url.host },
    ["host"],
    unsignedPayload,
  )
  const signature = await calculateSignature(
    input.credentials.secretAccessKey,
    date,
    input.region,
    timestamp,
    scope,
    canonical,
  )
  url.searchParams.set("X-Amz-Signature", signature)
  return url.toString()
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const data = typeof value === "string" ? new TextEncoder().encode(value) : value
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(data))
  return hex(new Uint8Array(digest))
}

export function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
}

function canonicalRequest(
  method: string,
  path: string,
  query: string,
  headers: Record<string, string>,
  signedHeaders: string[],
  payloadHash: string,
): string {
  const canonicalHeaders = signedHeaders
    .map((name) => `${name}:${collapse(headers[name] ?? "")}\n`)
    .join("")
  return [
    method.toUpperCase(),
    path.startsWith("/") ? path : `/${path}`,
    query,
    canonicalHeaders,
    signedHeaders.join(";"),
    payloadHash,
  ].join("\n")
}

function canonicalQuery(query: URLSearchParams): string {
  return [...query.entries()]
    .map(([key, value]) => [awsEncode(key), awsEncode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      compare(leftKey, rightKey) || compare(leftValue, rightValue))
    .map(([key, value]) => `${key}=${value}`)
    .join("&")
}

async function calculateSignature(
  secret: string,
  date: string,
  region: string,
  timestamp: string,
  scope: string,
  canonical: string,
): Promise<string> {
  const stringToSign = [algorithm, timestamp, scope, await sha256Hex(canonical)].join("\n")
  const dateKey = await hmac(new TextEncoder().encode(`AWS4${secret}`), date)
  const regionKey = await hmac(dateKey, region)
  const serviceKey = await hmac(regionKey, service)
  const signingKey = await hmac(serviceKey, "aws4_request")
  return hex(await hmac(signingKey, stringToSign))
}

async function hmac(key: Uint8Array, value: string): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  return new Uint8Array(await crypto.subtle.sign("HMAC", imported, new TextEncoder().encode(value)))
}

function credentialScope(date: string, region: string): string {
  return `${date}/${region}/${service}/aws4_request`
}

function amzTimestamp(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error("Invalid signing date")
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "")
}

function collapse(value: string): string {
  return value.trim().replace(/\s+/g, " ")
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}
