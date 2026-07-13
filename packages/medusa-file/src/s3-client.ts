import { awsEncode, presignRequest, sha256Hex, signRequest } from "./sigv4.js"
import type { FetchLike } from "./types.js"

export interface StackShiftS3ClientOptions {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  fetch?: FetchLike
  clock?: () => Date
}

export class StackShiftS3Error extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = "StackShiftS3Error"
  }
}

export class StackShiftS3Client {
  private readonly endpoint: URL
  private readonly fetcher: FetchLike
  private readonly clock: () => Date

  constructor(private readonly options: StackShiftS3ClientOptions) {
    requireValue(options.region, "region")
    requireValue(options.bucket, "bucket")
    requireValue(options.accessKeyId, "accessKeyId")
    requireValue(options.secretAccessKey, "secretAccessKey")
    this.endpoint = validateEndpoint(options.endpoint)
    this.fetcher = options.fetch ?? fetch
    this.clock = options.clock ?? (() => new Date())
  }

  async put(
    key: string,
    content: Uint8Array,
    metadata: { contentType?: string; cacheControl?: string } = {},
  ): Promise<void> {
    const target = this.target(key)
    const headers = await signRequest({
      method: "PUT",
      url: target.url,
      canonicalPath: target.canonicalPath,
      region: this.options.region,
      credentials: this.credentials(),
      payloadHash: await sha256Hex(content),
      now: this.clock(),
    })
    if (metadata.contentType) headers["Content-Type"] = metadata.contentType
    if (metadata.cacheControl) headers["Cache-Control"] = metadata.cacheControl
    const response = await this.fetch(target.url, {
      method: "PUT",
      headers,
      body: toArrayBuffer(content),
    })
    await assertSuccess(response)
  }

  async get(key: string): Promise<Uint8Array> {
    const response = await this.request("GET", key)
    return new Uint8Array(await response.arrayBuffer())
  }

  async delete(key: string): Promise<void> {
    const response = await this.request("DELETE", key, true)
    if (response.status !== 404) await assertSuccess(response)
  }

  presign(method: "GET" | "PUT", key: string, expiresIn: number): Promise<string> {
    const target = this.target(key)
    return presignRequest({
      method,
      url: target.url,
      canonicalPath: target.canonicalPath,
      region: this.options.region,
      credentials: this.credentials(),
      expiresIn,
      now: this.clock(),
    })
  }

  objectUrl(key: string): string {
    return this.target(key).url
  }

  async health(): Promise<void> {
    const bucket = awsEncode(this.options.bucket)
    const canonicalPath = `/${bucket}`
    const endpointPath = this.endpoint.pathname.replace(/\/$/, "")
    const url = `${this.endpoint.origin}${endpointPath}${canonicalPath}`
    const headers = await signRequest({
      method: "HEAD",
      url,
      canonicalPath,
      region: this.options.region,
      credentials: this.credentials(),
      payloadHash: await sha256Hex(new Uint8Array()),
      now: this.clock(),
    })
    await assertSuccess(await this.fetch(url, { method: "HEAD", headers }))
  }

  private async request(method: "GET" | "DELETE", key: string, allowNotFound = false): Promise<Response> {
    const target = this.target(key)
    const headers = await signRequest({
      method,
      url: target.url,
      canonicalPath: target.canonicalPath,
      region: this.options.region,
      credentials: this.credentials(),
      payloadHash: await sha256Hex(new Uint8Array()),
      now: this.clock(),
    })
    const response = await this.fetch(target.url, { method, headers })
    if (!allowNotFound || response.status !== 404) await assertSuccess(response)
    return response
  }

  private target(key: string): { url: string; canonicalPath: string } {
    if (!key || key.startsWith("/") || key.includes("\0")) throw new Error("Invalid S3 object key")
    const bucket = awsEncode(this.options.bucket)
    const encodedKey = key.split("/").map(awsEncode).join("/")
    const canonicalPath = `/${bucket}/${encodedKey}`
    const endpointPath = this.endpoint.pathname.replace(/\/$/, "")
    return { url: `${this.endpoint.origin}${endpointPath}${canonicalPath}`, canonicalPath }
  }

  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(url, init)
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown network failure"
      throw new StackShiftS3Error(
        `StackShift S3 network request failed: ${message}`,
        0,
        "network_error",
        true,
      )
    }
  }

  private credentials() {
    return {
      accessKeyId: this.options.accessKeyId,
      secretAccessKey: this.options.secretAccessKey,
      sessionToken: this.options.sessionToken,
    }
  }
}

async function assertSuccess(response: Response): Promise<void> {
  if (response.ok) return
  const body = await response.text()
  const code = xmlValue(body, "Code") ?? `http_${response.status}`
  const message = xmlValue(body, "Message") ?? `StackShift S3 request failed with ${response.status}`
  throw new StackShiftS3Error(message, response.status, code, isRetryable(response.status))
}

function validateEndpoint(value: string): URL {
  let endpoint: URL
  try {
    endpoint = new URL(value)
  } catch {
    throw new Error("StackShift S3 option `endpoint` must be an absolute HTTP URL")
  }
  if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error("StackShift S3 option `endpoint` must be an absolute HTTP URL without credentials")
  }
  if (endpoint.search || endpoint.hash) throw new Error("StackShift S3 option `endpoint` cannot contain query or fragment")
  return endpoint
}

function xmlValue(xml: string, name: string): string | undefined {
  const match = xml.match(new RegExp(`<${name}>([^<]*)</${name}>`, "i"))
  return match?.[1]?.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&")
}

function isRetryable(status: number): boolean {
  return [408, 409, 425, 429].includes(status) || status >= 500
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function requireValue(value: string, name: string): void {
  if (!value?.trim()) throw new Error(`StackShift S3 client option \`${name}\` is required`)
}
