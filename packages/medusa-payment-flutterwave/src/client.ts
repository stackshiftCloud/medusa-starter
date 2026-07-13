import type { FetchLike } from "./types.js"

interface FlutterwaveEnvelope<T> {
  status?: string
  message?: string
  data?: T
  code?: string
}

export interface FlutterwaveTransaction {
  id?: number | string
  tx_ref?: string
  status?: string
  amount?: number
  charged_amount?: number
  currency?: string
  link?: string
  meta?: Record<string, unknown>
  [key: string]: unknown
}

export class FlutterwaveAPIError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = "FlutterwaveAPIError"
  }
}

export class FlutterwaveClient {
  private readonly baseUrl: string

  constructor(
    private readonly secretKey: string,
    private readonly fetcher: FetchLike = fetch,
    baseUrl = "https://api.flutterwave.com/v3",
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "")
  }

  initialize(input: Record<string, unknown>, idempotencyKey?: string) {
    return this.request<FlutterwaveTransaction>("/payments", {
      method: "POST",
      body: input,
      idempotencyKey,
    })
  }

  verify(id: string) {
    return this.request<FlutterwaveTransaction>(`/transactions/${encodeURIComponent(id)}/verify`)
  }

  verifyReference(reference: string) {
    return this.request<FlutterwaveTransaction>(
      `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
    )
  }

  refund(id: string, amount: number, idempotencyKey?: string) {
    return this.request<Record<string, unknown>>(`/transactions/${encodeURIComponent(id)}/refund`, {
      method: "POST",
      body: { amount },
      idempotencyKey,
    })
  }

  async health(): Promise<void> {
    await this.request<unknown>("/balances")
  }

  private async request<T>(
    path: string,
    input: { method?: string; body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    const idempotencyKey = input.idempotencyKey
      ? await safeIdempotencyKey(input.idempotencyKey)
      : undefined
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: input.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      })
    } catch (error) {
      throw new FlutterwaveAPIError(networkMessage(error), 0, "network_error", true)
    }
    const raw = await response.text()
    const payload = safeJson<FlutterwaveEnvelope<T>>(raw)
    if (!response.ok || payload?.status?.toLowerCase() !== "success" || payload.data === undefined) {
      const status = response.status
      throw new FlutterwaveAPIError(
        payload?.message ?? `Flutterwave request failed with ${status}`,
        status,
        payload?.code ?? `http_${status}`,
        status === 408 || status === 425 || status === 429 || status >= 500,
      )
    }
    return payload.data
  }
}

async function safeIdempotencyKey(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  )
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function networkMessage(error: unknown): string {
  return error instanceof Error
    ? `Flutterwave network request failed: ${error.message}`
    : "Flutterwave network request failed"
}

function safeJson<T>(value: string): T | undefined {
  try {
    return value ? JSON.parse(value) as T : undefined
  } catch {
    return undefined
  }
}
