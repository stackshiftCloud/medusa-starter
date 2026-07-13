import { PaystackAPIError, PaystackClient, type PaystackTransaction } from "./client.js"
import {
  asRecord,
  assertCurrency,
  fromMinorAmount,
  header,
  makeReference,
  normalizeCurrency,
  optionalString,
  rawPayload,
  requiredString,
  toMinorAmount,
  validateAllowedCurrencies,
} from "./payment-utils.js"
import { constantTimeEqual, hmacSignature } from "./signature.js"
import {
  assertExpectedTransaction,
  assertWebhookTransaction,
  mapStatus,
  normalizeTransaction,
} from "./transaction.js"
import type {
  InitiatePaymentInput,
  LoggerLike,
  PaymentInput,
  PaymentOutput,
  PaymentSessionStatus,
  PaystackOptions,
  RefundPaymentInput,
  UpdatePaymentInput,
  WebhookPayload,
  WebhookResult,
} from "./types.js"

export class PaystackPaymentProvider {
  static readonly identifier = "paystack"
  readonly client: PaystackClient
  private readonly logger?: LoggerLike

  constructor(options: PaystackOptions, dependencies: { logger?: LoggerLike } = {}) {
    PaystackPaymentProvider.validateOptions(options)
    this.client = new PaystackClient(options.secret_key, options.fetch ?? fetch, options.base_url)
    this.options = options
    this.logger = dependencies.logger
  }

  private readonly options: PaystackOptions

  static validateOptions(options: PaystackOptions): void {
    if (!options?.secret_key) throw new Error("Paystack option `secret_key` is required")
    validateAllowedCurrencies(options.allowed_currencies)
  }

  getIdentifier(): string {
    return PaystackPaymentProvider.identifier
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<PaymentOutput & { id: string }> {
    const currency = normalizeCurrency(input.currency_code)
    assertCurrency(currency, this.options.allowed_currencies)
    const data = input.data ?? {}
    const sessionId = requiredString(data.session_id, "data.session_id")
    const email = input.context?.customer?.email ?? optionalString(data.email)
    if (!email) throw new Error("Paystack requires a customer email")
    const amount = toMinorAmount(input.amount, currency)
    const reference = makeReference(
      input.context?.idempotency_key ?? sessionId,
      this.options.reference_prefix ?? "medusa",
      amount,
      currency,
    )
    let transaction: PaystackTransaction
    try {
      transaction = await this.client.initialize({
        email,
        amount,
        currency,
        reference,
        callback_url: this.options.callback_url,
        metadata: { ...(asRecord(data.metadata) ?? {}), session_id: sessionId },
      })
    } catch (error) {
      if (!isDuplicateReference(error)) throw error
      transaction = await this.client.verify(reference)
    }
    return {
      id: transaction.reference,
      status: "requires_more",
      data: normalizeTransaction({
        ...data,
        expected_amount_minor: amount,
        expected_currency: currency,
        reference,
      }, transaction, sessionId),
    }
  }

  async authorizePayment(input: PaymentInput): Promise<PaymentOutput & { status: PaymentSessionStatus }> {
    return this.statusOutput(input)
  }

  async capturePayment(input: PaymentInput): Promise<PaymentOutput> {
    const output = await this.statusOutput(input)
    if (output.status !== "captured") {
      throw new PaystackAPIError("Paystack transaction is not captured", 409, "not_captured", false)
    }
    return { data: output.data }
  }

  async cancelPayment(input: PaymentInput): Promise<PaymentOutput> {
    if (input.data?.canceled_locally === true) return { data: input.data }
    const output = await this.statusOutput(input)
    if (output.status === "captured") {
      throw new PaystackAPIError("Captured Paystack transactions cannot be canceled", 409, "already_captured", false)
    }
    return { data: { ...(output.data ?? {}), status: "canceled", canceled_locally: true } }
  }

  deletePayment(input: PaymentInput): Promise<PaymentOutput> {
    return this.cancelPayment(input)
  }

  async refundPayment(input: RefundPaymentInput): Promise<PaymentOutput> {
    const data = input.data ?? {}
    const transaction = optionalString(data.id) ?? requiredString(data.reference, "data.reference")
    const currency = normalizeCurrency(requiredString(
      data.expected_currency ?? data.currency,
      "data.expected_currency",
    ))
    assertCurrency(currency, this.options.allowed_currencies)
    const idempotencyKey = requiredString(input.context?.idempotency_key, "context.idempotency_key")
    const refund = await this.client.refund(
      transaction,
      toMinorAmount(input.amount, currency),
      idempotencyKey,
    )
    return { data: { ...data, refund } }
  }

  async retrievePayment(input: PaymentInput): Promise<PaymentOutput> {
    const data = input.data ?? {}
    const transaction = await this.client.verify(requiredString(data.reference, "data.reference"))
    return { data: normalizeTransaction(data, transaction, optionalString(data.session_id)) }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<PaymentOutput> {
    const data = input.data ?? {}
    const currency = normalizeCurrency(input.currency_code)
    assertCurrency(currency, this.options.allowed_currencies)
    const nextAmount = toMinorAmount(input.amount, currency)
    if (data.expected_amount_minor === nextAmount && data.expected_currency === currency) {
      return this.statusOutput(input)
    }
    const current = await this.statusOutput(input)
    if (current.status === "captured") {
      throw new PaystackAPIError("Captured Paystack transactions cannot be updated", 409, "already_captured", false)
    }
    return this.initiatePayment({
      ...input,
      context: {
        ...input.context,
        idempotency_key: input.context?.idempotency_key
          ? `${input.context.idempotency_key}:update:${nextAmount}:${currency}`
          : undefined,
      },
    })
  }

  async getPaymentStatus(input: PaymentInput): Promise<PaymentOutput & { status: PaymentSessionStatus }> {
    return this.statusOutput(input)
  }

  async getWebhookActionAndData(payload: WebhookPayload): Promise<WebhookResult> {
    const raw = rawPayload(payload)
    const signature = header(payload.headers, "x-paystack-signature")
    if (!signature) throw new Error("Missing x-paystack-signature header")
    const expected = await hmacSignature(
      raw,
      this.options.webhook_secret ?? this.options.secret_key,
      "SHA-512",
      "hex",
    )
    if (!constantTimeEqual(expected.toLowerCase(), signature.toLowerCase())) {
      throw new Error("Invalid Paystack webhook signature")
    }
    const event = asRecord(JSON.parse(raw)) ?? asRecord(payload.data)
    const type = optionalString(event?.event)
    const supplied = asRecord(event?.data)
    if (!type || !supplied || !type.startsWith("charge.")) {
      return { action: "not_supported" }
    }
    const reference = requiredString(supplied.reference, "webhook data.reference")
    const verified = await this.client.verify(reference)
    assertWebhookTransaction(supplied, verified)
    const metadata = asRecord(verified.metadata) ?? asRecord(supplied.metadata)
    const sessionId = requiredString(metadata?.session_id, "webhook data.metadata.session_id")
    const amount = fromMinorAmount(verified.amount)
    if (type === "charge.success" && mapStatus(verified.status) === "captured") {
      return { action: "captured", data: { session_id: sessionId, amount } }
    }
    if (type === "charge.failed" || mapStatus(verified.status) === "error") {
      return { action: "failed", data: { session_id: sessionId, amount } }
    }
    this.logger?.debug?.(`Ignored Paystack webhook event ${type}`)
    return { action: "not_supported" }
  }

  private async statusOutput(input: PaymentInput): Promise<PaymentOutput & { status: PaymentSessionStatus }> {
    const data = input.data ?? {}
    const transaction = await this.client.verify(requiredString(data.reference, "data.reference"))
    assertExpectedTransaction(transaction, data)
    return {
      status: mapStatus(transaction.status),
      data: normalizeTransaction(data, transaction, optionalString(data.session_id)),
    }
  }
}

function isDuplicateReference(error: unknown): boolean {
  return error instanceof PaystackAPIError && (
    error.status === 409 || /duplicate|already exists|already used/i.test(`${error.code} ${error.message}`)
  )
}
