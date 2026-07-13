import { Readable, Writable } from "node:stream"
import type { ProviderFileResult, UploadFileInput, UploadStreamResult } from "./types.js"

export function assertFilename(filename?: string): asserts filename is string {
  if (!filename?.trim()) throw new Error("No filename provided")
}

export function assertFileKey(file?: { fileKey?: string }): asserts file is { fileKey: string } {
  if (!file?.fileKey) throw new Error("No fileKey provided")
}

export function createFileKey(filename: string, prefix: string, generate: () => string): string {
  const clean = filename.replace(/[^A-Za-z0-9._-]/g, "-")
  const normalizedPrefix = prefix ? `${prefix.replace(/^\/+|\/+$/g, "")}/` : ""
  return `${normalizedPrefix}${generate()}-${clean}`
}

export async function uploadBytes(content: UploadFileInput["content"]): Promise<Uint8Array> {
  const part = blobPart(content)
  if (part instanceof ArrayBuffer) return new Uint8Array(part)
  if (part instanceof Blob) return new Uint8Array(await part.arrayBuffer())
  return new TextEncoder().encode(part)
}

export function blobPart(content: UploadFileInput["content"]): ArrayBuffer | Blob | string {
  if (content instanceof Uint8Array) {
    return content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) as ArrayBuffer
  }
  if (content instanceof ArrayBuffer || content instanceof Blob) return content
  const decoded = decodeBase64(content)
  if (decoded) return decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength) as ArrayBuffer
  return content
}

export function publicFileUrl(base: string, fileKey: string): string {
  const encoded = fileKey.split("/").map(encodeURIComponent).join("/")
  return `${base.replace(/\/$/, "")}/${encoded}`
}

export function bufferedUploadStream(
  fileKey: string,
  url: string,
  upload: (content: Uint8Array) => Promise<ProviderFileResult>,
): UploadStreamResult {
  const chunks: Uint8Array[] = []
  let resolve!: (result: ProviderFileResult) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<ProviderFileResult>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  const writeStream = new Writable({
    write: (chunk, _encoding, callback) => {
      try {
        chunks.push(toBytes(chunk))
        callback()
      } catch (error) {
        callback(error as Error)
      }
    },
    final: (callback) => {
      upload(join(chunks))
        .then(resolve)
        .then(() => callback(), (error) => {
          reject(error)
          callback(error as Error)
        })
    },
  })
  return { writeStream, promise, url, fileKey }
}

export function bufferStream(bytes: Uint8Array): Readable {
  return Readable.from([bytes])
}

function decodeBase64(value: string): Uint8Array | undefined {
  try {
    const decoded = Uint8Array.from(atob(value), (character) => character.charCodeAt(0))
    const normalized = btoa(Array.from(decoded, (byte) => String.fromCharCode(byte)).join(""))
    if (normalized.replace(/=+$/, "") === value.replace(/=+$/, "")) return decoded
  } catch {
    // Malformed base64 is plain text, matching Medusa's local provider.
  }
  return undefined
}

function toBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (typeof value === "string") return new TextEncoder().encode(value)
  throw new Error("Upload stream received an unsupported chunk")
}

function join(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}
