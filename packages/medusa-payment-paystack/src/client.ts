import type { FetchLike } from "./types.js"

interface PaystackEnvelope<T> {
  status?: boolean
  message?: string
  data?: T
  code?: string
}

export interface PaystackTransaction {
  id?: number | string
  reference: string
  status?: string
  amount?: number
  currency?: string
  authorization_url?: string
  access_code?: string
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export interface PaystackRefund extends Record<string, unknown> {
  id?: number | string
  transaction?: number | string | Record<string, unknown>
  amount?: number | string
  currency?: string
  status?: string
  merchant_note?: string
}

export class PaystackAPIError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = "PaystackAPIError"
  }
}

export class PaystackClient {
  private readonly baseUrl: string

  constructor(
    private readonly secretKey: string,
    private readonly fetcher: FetchLike = fetch,
    baseUrl = "https://api.paystack.co",
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "")
  }

  initialize(
    input: {
      email: string
      amount: string
      currency: string
      reference: string
      callback_url?: string
      metadata: Record<string, unknown>
    },
  ) {
    return this.request<PaystackTransaction>("/transaction/initialize", {
      method: "POST",
      body: input,
    })
  }

  verify(reference: string) {
    return this.request<PaystackTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`)
  }

  async refund(transaction: string, amount: string, idempotencyKey: string): Promise<PaystackRefund> {
    const note = `stackshift:${idempotencyKey}`
    const existing = await this.listRefunds(transaction)
    const matched = existing.find((refund) => {
      return refund.merchant_note === note && String(refund.amount) === amount
    })
    if (matched) return matched
    return this.request<PaystackRefund>("/refund", {
      method: "POST",
      body: { transaction, amount, merchant_note: note },
    })
  }

  listRefunds(transaction: string): Promise<PaystackRefund[]> {
    return this.request<PaystackRefund[]>(`/refund?transaction=${encodeURIComponent(transaction)}`)
  }

  async health(): Promise<void> {
    await this.request<unknown>("/balance")
  }

  private async request<T>(
    path: string,
    input: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    let response: Response
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: input.method ?? "GET",
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
      })
    } catch (error) {
      throw new PaystackAPIError(networkMessage(error), 0, "network_error", true)
    }
    const raw = await response.text()
    const payload = safeJson<PaystackEnvelope<T>>(raw)
    if (!response.ok || payload?.status === false || payload?.data === undefined) {
      const status = response.status
      throw new PaystackAPIError(
        payload?.message ?? `Paystack request failed with ${status}`,
        status,
        payload?.code ?? `http_${status}`,
        status === 408 || status === 425 || status === 429 || status >= 500,
      )
    }
    return payload.data
  }
}

function networkMessage(error: unknown): string {
  return error instanceof Error ? `Paystack network request failed: ${error.message}` : "Paystack network request failed"
}

function safeJson<T>(value: string): T | undefined {
  try {
    return value ? (JSON.parse(value) as T) : undefined
  } catch {
    return undefined
  }
}
