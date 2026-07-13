import type { FetchLike, StackShiftAsset, UploadSession } from "./types.js"

interface Envelope<T> {
  success?: boolean
  data?: T
  message?: string
  error?: string | { code?: string; message?: string }
}

export class StackShiftFileAPIError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = "StackShiftFileAPIError"
  }
}

export class StackShiftFileClient {
  private readonly baseUrl: string

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: FetchLike = fetch,
    baseUrl = "https://api.stackshift.cloud/api/v1",
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "")
  }

  upload(form: FormData, idempotencyKey?: string): Promise<StackShiftAsset> {
    return this.request("/assets/upload", {
      method: "POST",
      body: form,
      idempotencyKey,
    })
  }

  async delete(fileKey: string): Promise<void> {
    try {
      await this.request(`/assets/${encodeURIComponent(fileKey)}`, { method: "DELETE" })
    } catch (error) {
      if (!(error instanceof StackShiftFileAPIError) || error.status !== 404) throw error
    }
  }

  signedDownload(fileKey: string, expiresIn: string): Promise<{ url: string; expires_at: string }> {
    return this.request(`/assets/${encodeURIComponent(fileKey)}/signed-url`, {
      method: "POST",
      body: { expiresIn },
    })
  }

  createUploadSession(input: Record<string, unknown>): Promise<UploadSession> {
    return this.request("/assets/upload-sessions", { method: "POST", body: input })
  }

  async download(url: string): Promise<Uint8Array> {
    const response = await this.fetch(url)
    if (!response.ok) {
      throw new StackShiftFileAPIError(
        `StackShift download failed with ${response.status}`,
        response.status,
        `http_${response.status}`,
        response.status === 408 || response.status === 429 || response.status >= 500,
      )
    }
    return new Uint8Array(await response.arrayBuffer())
  }

  private async request<T>(
    path: string,
    input: { method?: string; body?: BodyInit | Record<string, unknown>; idempotencyKey?: string } = {},
  ): Promise<T> {
    const isForm = input.body instanceof FormData
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      method: input.method ?? "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        ...(isForm ? {} : { "Content-Type": "application/json" }),
        ...(input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {}),
      },
      body: input.body === undefined
        ? undefined
        : isForm || typeof input.body === "string"
          ? input.body as BodyInit
          : JSON.stringify(input.body),
    })
    const raw = await response.text()
    const payload = safeJson<Envelope<T>>(raw)
    if (!response.ok || payload?.success === false || payload?.data === undefined) {
      const error = typeof payload?.error === "object" ? payload.error : undefined
      const status = response.status
      throw new StackShiftFileAPIError(
        error?.message ?? payload?.message ?? String(payload?.error ?? `StackShift request failed with ${status}`),
        status,
        error?.code ?? `http_${status}`,
        status === 408 || status === 409 || status === 429 || status >= 500,
      )
    }
    return payload.data
  }

  private async fetch(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(url, init)
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown network failure"
      throw new StackShiftFileAPIError(
        `StackShift file network request failed: ${message}`,
        0,
        "network_error",
        true,
      )
    }
  }
}

function safeJson<T>(value: string): T | undefined {
  try {
    return value ? JSON.parse(value) as T : undefined
  } catch {
    return undefined
  }
}
