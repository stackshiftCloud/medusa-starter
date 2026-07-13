import type { FetchLike, MailResponse } from "./types.js"

interface Envelope<T> {
  success?: boolean
  data?: T
  message?: string
  error?: string | { code?: string; message?: string }
}

export class StackShiftMailAPIError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = "StackShiftMailAPIError"
  }
}

export class StackShiftMailClient {
  private readonly baseUrl: string

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: FetchLike = fetch,
    baseUrl = "https://api.stackshift.cloud/v1",
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "")
  }

  send(input: Record<string, unknown>): Promise<MailResponse> {
    return this.request("/mail/send", input)
  }

  sendTemplate(input: Record<string, unknown>): Promise<MailResponse> {
    return this.request("/mail/send-template", input)
  }

  async health(): Promise<void> {
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}/mail/limits`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown network failure"
      throw new StackShiftMailAPIError(`StackShift Mail network request failed: ${message}`, 0, "network_error", true)
    }
    if (!response.ok) {
      throw new StackShiftMailAPIError(
        `StackShift Mail health probe failed with ${response.status}`,
        response.status,
        `http_${response.status}`,
        response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500,
      )
    }
    await response.arrayBuffer()
  }

  private async request(path: string, body: Record<string, unknown>): Promise<MailResponse> {
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown network failure"
      throw new StackShiftMailAPIError(
        `StackShift Mail network request failed: ${message}`,
        0,
        "network_error",
        true,
      )
    }
    const raw = await response.text()
    const payload = safeJson<Envelope<MailResponse>>(raw)
    if (!response.ok || payload?.success === false || !payload?.data?.id) {
      const error = typeof payload?.error === "object" ? payload.error : undefined
      const status = response.status
      throw new StackShiftMailAPIError(
        error?.message ?? payload?.message ?? String(payload?.error ?? `StackShift Mail failed with ${status}`),
        status,
        error?.code ?? `http_${status}`,
        status === 408 || status === 425 || status === 429 || status >= 500,
      )
    }
    return payload.data
  }
}

function safeJson<T>(value: string): T | undefined {
  try {
    return value ? JSON.parse(value) as T : undefined
  } catch {
    return undefined
  }
}
