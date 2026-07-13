import { StackShiftAPIFileTransport } from "./api-transport.js"
import { StackShiftFileClient } from "./client.js"
import { StackShiftS3Client } from "./s3-client.js"
import { StackShiftS3FileTransport } from "./s3-transport.js"
import type {
  FileKeyInput,
  FileTransport,
  LoggerLike,
  PresignedUploadInput,
  StackShiftFileOptions,
  UploadFileInput,
} from "./types.js"

export class StackShiftFileProvider {
  static readonly identifier = "stackshift-file"
  readonly client?: StackShiftFileClient
  readonly s3?: StackShiftS3Client
  private readonly transport: FileTransport

  constructor(options: StackShiftFileOptions, dependencies: { logger?: LoggerLike } = {}) {
    const mode = StackShiftFileProvider.validateOptions(options)
    if (mode === "s3") {
      const transport = new StackShiftS3FileTransport(options, dependencies.logger)
      this.transport = transport
      this.s3 = transport.client
      return
    }
    const transport = new StackShiftAPIFileTransport(options, dependencies.logger)
    this.transport = transport
    this.client = transport.client
  }

  static validateOptions(options: StackShiftFileOptions): "s3" | "api" {
    if (!options) throw new Error("StackShift File options are required")
    const hasS3Option = [
      options.endpoint,
      options.region,
      options.access_key_id,
      options.secret_access_key,
    ].some(Boolean)
    const mode = options.mode ?? (hasS3Option ? "s3" : "api")
    if (mode === "s3") {
      requireOption(options.endpoint, "endpoint", "S3")
      requireOption(options.region, "region", "S3")
      requireOption(options.bucket, "bucket", "S3")
      requireOption(options.access_key_id, "access_key_id", "S3")
      requireOption(options.secret_access_key, "secret_access_key", "S3")
    } else {
      requireOption(options.api_key, "api_key", "File")
      requireOption(options.file_url, "file_url", "File")
    }
    return mode
  }

  upload(input: UploadFileInput) { return this.transport.upload(input) }
  delete(input: FileKeyInput | FileKeyInput[]) { return this.transport.delete(input) }
  getPresignedDownloadUrl(input: FileKeyInput) { return this.transport.getPresignedDownloadUrl(input) }
  getPresignedUploadUrl(input: PresignedUploadInput) { return this.transport.getPresignedUploadUrl(input) }
  getUploadStream(input: Omit<UploadFileInput, "content">) { return this.transport.getUploadStream(input) }
  getDownloadStream(input: FileKeyInput) { return this.transport.getDownloadStream(input) }
  getAsBuffer(input: FileKeyInput) { return this.transport.getAsBuffer(input) }
}

function requireOption(value: string | undefined, name: string, transport: string): void {
  if (!value?.trim()) throw new Error(`StackShift ${transport} option \`${name}\` is required`)
}
