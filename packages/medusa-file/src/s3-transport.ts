import type { Readable } from "node:stream"
import { Buffer } from "node:buffer"
import {
  assertFileKey,
  assertFilename,
  bufferedUploadStream,
  bufferStream,
  createFileKey,
  publicFileUrl,
  uploadBytes,
} from "./file-utils.js"
import { StackShiftS3Client } from "./s3-client.js"
import type {
  FileKeyInput,
  FileTransport,
  LoggerLike,
  PresignedUploadInput,
  ProviderFileResult,
  StackShiftFileOptions,
  UploadFileInput,
  UploadStreamResult,
} from "./types.js"

export class StackShiftS3FileTransport implements FileTransport {
  readonly client: StackShiftS3Client
  private readonly fileUrl: string

  constructor(
    private readonly options: StackShiftFileOptions,
    private readonly logger?: LoggerLike,
  ) {
    this.client = new StackShiftS3Client({
      endpoint: options.endpoint as string,
      region: options.region as string,
      bucket: options.bucket as string,
      accessKeyId: options.access_key_id as string,
      secretAccessKey: options.secret_access_key as string,
      sessionToken: options.session_token,
      fetch: options.fetch,
      clock: options.clock,
    })
    this.fileUrl = options.file_url ?? `${options.endpoint?.replace(/\/$/, "")}/${options.bucket}`
  }

  async upload(file: UploadFileInput): Promise<ProviderFileResult> {
    assertFilename(file?.filename)
    const fileKey = this.key(file.filename)
    await this.client.put(fileKey, await uploadBytes(file.content), {
      contentType: file.mimeType,
      cacheControl: this.options.cache_control,
    })
    return { url: publicFileUrl(this.fileUrl, fileKey), key: fileKey }
  }

  async delete(files: FileKeyInput | FileKeyInput[]): Promise<void> {
    const items = Array.isArray(files) ? files : [files]
    await Promise.all(items.map(async ({ fileKey }) => {
      if (!fileKey) return
      try {
        await this.client.delete(fileKey)
      } catch (error) {
        this.logger?.error?.(`Failed to delete StackShift object ${fileKey}`)
        throw error
      }
    }))
  }

  async getPresignedDownloadUrl(file: FileKeyInput): Promise<string> {
    assertFileKey(file)
    return this.client.presign("GET", file.fileKey, parseTTL(this.options.download_url_ttl, 900))
  }

  async getPresignedUploadUrl(file: PresignedUploadInput): Promise<ProviderFileResult> {
    assertFilename(file?.filename)
    const fileKey = this.key(file.filename)
    return {
      url: await this.client.presign("PUT", fileKey, file.expiresIn ?? 900),
      key: fileKey,
    }
  }

  async getUploadStream(file: Omit<UploadFileInput, "content">): Promise<UploadStreamResult> {
    assertFilename(file?.filename)
    const fileKey = this.key(file.filename)
    const url = publicFileUrl(this.fileUrl, fileKey)
    return bufferedUploadStream(fileKey, url, async (content) => {
      await this.client.put(fileKey, content, {
        contentType: file.mimeType,
        cacheControl: this.options.cache_control,
      })
      return { url, key: fileKey }
    })
  }

  async getAsBuffer(file: FileKeyInput): Promise<Buffer> {
    assertFileKey(file)
    return Buffer.from(await this.client.get(file.fileKey))
  }

  async getDownloadStream(file: FileKeyInput): Promise<Readable> {
    return bufferStream(await this.getAsBuffer(file))
  }

  private key(filename: string): string {
    const generate = this.options.key_generator ?? (() => crypto.randomUUID())
    return createFileKey(filename, this.options.prefix ?? "medusa/", generate)
  }
}

export function parseTTL(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const match = value.trim().match(/^(\d+)(s|m|h|d)?$/)
  if (!match) throw new Error("download_url_ttl must be seconds or use s, m, h, or d")
  const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] ?? "s"] as number
  const seconds = Number(match[1]) * multiplier
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 604800) {
    throw new Error("download_url_ttl must be between 1 second and 7 days")
  }
  return seconds
}
