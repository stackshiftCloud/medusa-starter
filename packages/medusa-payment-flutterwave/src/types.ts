export type FetchLike = typeof fetch

export interface LoggerLike {
  debug?(message: string): void
  info?(message: string): void
  warn?(message: string): void
  error?(message: string): void
}

export interface PaymentContext {
  customer?: {
    id?: string
    email?: string | null
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
  }
  idempotency_key?: string
}

export interface PaymentInput {
  data?: Record<string, unknown>
  context?: PaymentContext
}

export interface InitiatePaymentInput extends PaymentInput {
  amount: unknown
  currency_code: string
}

export interface UpdatePaymentInput extends InitiatePaymentInput {}

export interface RefundPaymentInput extends PaymentInput {
  amount: unknown
}

export type PaymentSessionStatus =
  | "authorized"
  | "captured"
  | "canceled"
  | "error"
  | "pending"
  | "pending_authorization"
  | "requires_more"

export interface PaymentOutput {
  id?: string
  status?: PaymentSessionStatus
  data?: Record<string, unknown>
}

export interface WebhookPayload {
  data?: unknown
  rawData?: string | Uint8Array
  headers?: Record<string, unknown>
}

export interface WebhookResult {
  action:
    | "authorized"
    | "captured"
    | "failed"
    | "pending"
    | "requires_more"
    | "canceled"
    | "not_supported"
    | "pending_authorization"
  data?: { session_id: string; amount: number }
}

export interface FlutterwaveOptions {
  secret_key: string
  webhook_secret: string
  base_url?: string
  redirect_url: string
  reference_prefix?: string
  allowed_currencies?: string[]
  title?: string
  description?: string
  logo?: string
  fetch?: FetchLike
}
