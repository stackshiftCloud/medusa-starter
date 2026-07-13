import type { Readable } from "node:stream"
import { Buffer } from "node:buffer"
import { StackShiftFileClient } from "./client.js"
import {
  assertFileKey,
  assertFilename,
  blobPart,
  bufferedUploadStream,
  bufferStream,
  createFileKey,
  publicFileUrl,
} from "./file-utils.js"
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

export class StackShiftAPIFileTransport implements FileTransport {
  readonly client: StackShiftFileClient
  private readonly fileUrl: string

  constructor(
    private readonly options: StackShiftFileOptions,
    private readonly logger?: LoggerLike,
  ) {
    this.fileUrl = options.file_url as string
    this.client = new StackShiftFileClient(options.api_key as string, options.fetch ?? fetch, options.api_url)
  }

  async upload(file: UploadFileInput): Promise<ProviderFileResult> {
    assertFilename(file?.filename)
    const fileKey = this.key(file.filename)
    const asset = await this.client.upload(this.form(file, fileKey), file.idempotency_key)
    return { url: asset.url ?? publicFileUrl(this.fileUrl, asset.key || fileKey), key: asset.id }
  }

  async delete(files: FileKeyInput | FileKeyInput[]): Promise<void> {
    const items = Array.isArray(files) ? files : [files]
    await Promise.all(items.map(async ({ fileKey }) => {
      if (!fileKey) return
      try {
        await this.client.delete(fileKey)
      } catch (error) {
        this.logger?.error?.(`Failed to delete StackShift asset ${fileKey}`)
        throw error
      }
    }))
  }

  async getPresignedDownloadUrl(file: FileKeyInput): Promise<string> {
    assertFileKey(file)
    const result = await this.client.signedDownload(file.fileKey, this.options.download_url_ttl ?? "15m")
    return result.url
  }

  async getPresignedUploadUrl(file: PresignedUploadInput): Promise<ProviderFileResult> {
    assertFilename(file?.filename)
    const fileKey = this.key(file.filename)
    const session = await this.client.createUploadSession({
      mode: "single",
      bucket: this.options.bucket,
      key: fileKey,
      visibility: file.access ?? this.options.visibility ?? "public",
      fileName: file.filename,
      mimeType: file.mimeType,
      fileSize: file.size,
      maxBytes: file.size,
      expiresIn: file.expiresIn ? `${file.expiresIn}s` : undefined,
    })
    return { url: session.url, key: session.upload_session_id }
  }

  async getUploadStream(file: Omit<UploadFileInput, "content">): Promise<UploadStreamResult> {
    assertFilename(file?.filename)
    const fileKey = this.key(file.filename)
    return bufferedUploadStream(fileKey, publicFileUrl(this.fileUrl, fileKey), async (content) => {
      const asset = await this.client.upload(this.form({ ...file, content }, fileKey), file.idempotency_key)
      return { url: asset.url ?? publicFileUrl(this.fileUrl, fileKey), key: asset.id }
    })
  }

  async getAsBuffer(file: FileKeyInput): Promise<Buffer> {
    const url = await this.getPresignedDownloadUrl(file)
    const bytes = await this.client.download(url)
    return Buffer.from(bytes)
  }

  async getDownloadStream(file: FileKeyInput): Promise<Readable> {
    return bufferStream(await this.getAsBuffer(file))
  }

  private form(file: UploadFileInput, fileKey: string): FormData {
    const body = new FormData()
    body.append("file", new Blob([blobPart(file.content)], { type: file.mimeType }), file.filename)
    append(body, "bucket", this.options.bucket)
    append(body, "key", fileKey)
    append(body, "visibility", file.access ?? this.options.visibility ?? "public")
    append(body, "cacheControl", this.options.cache_control)
    body.append("metadata", JSON.stringify({ original_filename: file.filename, source: "medusa" }))
    return body
  }

  private key(filename: string): string {
    const generate = this.options.key_generator ?? (() => crypto.randomUUID())
    return createFileKey(filename, this.options.prefix ?? "medusa/", generate)
  }
}

function append(form: FormData, key: string, value: unknown): void {
  if (value !== undefined && value !== null && value !== "") form.append(key, String(value))
}
