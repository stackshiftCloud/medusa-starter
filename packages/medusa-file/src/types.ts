export type FetchLike = typeof fetch

export interface LoggerLike {
  debug?(message: string): void
  info?(message: string): void
  warn?(message: string): void
  error?(message: string): void
}

export interface StackShiftFileOptions {
  mode?: "s3" | "api"
  endpoint?: string
  region?: string
  access_key_id?: string
  secret_access_key?: string
  session_token?: string
  api_key?: string
  file_url?: string
  api_url?: string
  bucket?: string
  prefix?: string
  visibility?: "public" | "private"
  cache_control?: string
  download_url_ttl?: string
  fetch?: FetchLike
  clock?: () => Date
  key_generator?: () => string
}

export interface UploadFileInput {
  filename: string
  mimeType?: string
  content: string | Uint8Array | ArrayBuffer | Blob
  access?: "public" | "private"
  idempotency_key?: string
}

export interface FileKeyInput {
  fileKey: string
}

export interface PresignedUploadInput {
  filename: string
  mimeType?: string
  access?: "public" | "private"
  expiresIn?: number
  size?: number
}

export interface ProviderFileResult {
  url: string
  key: string
}

export interface FileTransport {
  upload(file: UploadFileInput): Promise<ProviderFileResult>
  delete(files: FileKeyInput | FileKeyInput[]): Promise<void>
  getPresignedDownloadUrl(file: FileKeyInput): Promise<string>
  getPresignedUploadUrl(file: PresignedUploadInput): Promise<ProviderFileResult>
  getUploadStream(file: Omit<UploadFileInput, "content">): Promise<UploadStreamResult>
  getDownloadStream(file: FileKeyInput): Promise<import("node:stream").Readable>
  getAsBuffer(file: FileKeyInput): Promise<import("node:buffer").Buffer>
}

export interface UploadStreamResult {
  writeStream: import("node:stream").Writable
  promise: Promise<ProviderFileResult>
  url: string
  fileKey: string
}

export interface StackShiftAsset {
  id: string
  key: string
  bucket: string
  url?: string
  status?: string
  [key: string]: unknown
}

export interface UploadSession {
  upload_session_id: string
  session_id?: string
  url: string
  method: "PUT"
  expires_at: string
}
