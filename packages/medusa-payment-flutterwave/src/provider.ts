import {
  FlutterwaveAPIError,
  FlutterwaveClient,
  type FlutterwaveTransaction,
} from "./client.js"
import {
  asRecord,
  assertCurrency,
  canonicalAmount,
  compact,
  decimalAmount,
  header,
  makeReference,
  normalizeCurrency,
  optionalString,
  rawPayload,
  requiredString,
  stringIdentifier,
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
  FlutterwaveOptions,
  InitiatePaymentInput,
  LoggerLike,
  PaymentContext,
  PaymentInput,
  PaymentOutput,
  PaymentSessionStatus,
  RefundPaymentInput,
  UpdatePaymentInput,
  WebhookPayload,
  WebhookResult,
} from "./types.js"

export class FlutterwavePaymentProvider {
  static readonly identifier = "flutterwave"
  readonly client: FlutterwaveClient
  private readonly options: FlutterwaveOptions
  private readonly logger?: LoggerLike

  constructor(options: FlutterwaveOptions, dependencies: { logger?: LoggerLike } = {}) {
    FlutterwavePaymentProvider.validateOptions(options)
    this.options = options
    this.logger = dependencies.logger
    this.client = new FlutterwaveClient(options.secret_key, options.fetch ?? fetch, options.base_url)
  }

  static validateOptions(options: FlutterwaveOptions): void {
    if (!options?.secret_key) throw new Error("Flutterwave option `secret_key` is required")
    if (!options.webhook_secret) throw new Error("Flutterwave option `webhook_secret` is required")
    if (!options.redirect_url) throw new Error("Flutterwave option `redirect_url` is required")
    validateAllowedCurrencies(options.allowed_currencies)
  }

  getIdentifier(): string {
    return FlutterwavePaymentProvider.identifier
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<PaymentOutput & { id: string }> {
    const currency = normalizeCurrency(input.currency_code)
    assertCurrency(currency, this.options.allowed_currencies)
    const amount = decimalAmount(input.amount)
    const expectedAmount = canonicalAmount(input.amount)
    const data = input.data ?? {}
    const sessionId = requiredString(data.session_id, "data.session_id")
    const customer = input.context?.customer
    const email = customer?.email ?? optionalString(data.email)
    if (!email) throw new Error("Flutterwave requires a customer email")
    const txRef = makeReference(
      input.context?.idempotency_key ?? sessionId,
      this.options.reference_prefix ?? "medusa",
      expectedAmount,
      currency,
    )
    const idempotencyKey = input.context?.idempotency_key ?? txRef
    let transaction: FlutterwaveTransaction
    try {
      transaction = await this.client.initialize({
        tx_ref: txRef,
        amount,
        currency,
        redirect_url: this.options.redirect_url,
        customer: {
          email,
          name: customerName(customer, data),
          phonenumber: customer?.phone ?? optionalString(data.customer_phone),
        },
        meta: { ...(asRecord(data.meta) ?? {}), session_id: sessionId },
        customizations: compact({
          title: this.options.title,
          description: this.options.description,
          logo: this.options.logo,
        }),
      }, idempotencyKey)
    } catch (error) {
      if (!(error instanceof FlutterwaveAPIError) || error.status !== 409) throw error
      transaction = await this.client.verifyReference(txRef)
    }
    return {
      id: txRef,
      status: "requires_more",
      data: normalizeTransaction(
        {
          ...data,
          expected_amount: expectedAmount,
          expected_currency: currency,
          tx_ref: txRef,
        },
        transaction,
        sessionId,
      ),
    }
  }

  authorizePayment(input: PaymentInput): Promise<PaymentOutput & { status: PaymentSessionStatus }> {
    return this.statusOutput(input)
  }

  async capturePayment(input: PaymentInput): Promise<PaymentOutput> {
    const output = await this.statusOutput(input)
    if (output.status !== "captured") {
      throw new FlutterwaveAPIError("Flutterwave transaction is not captured", 409, "not_captured", false)
    }
    return { data: output.data }
  }

  async cancelPayment(input: PaymentInput): Promise<PaymentOutput> {
    if (input.data?.canceled_locally === true) return { data: input.data }
    const output = await this.statusOutput(input)
    if (output.status === "captured") {
      throw new FlutterwaveAPIError("Captured Flutterwave transactions cannot be canceled", 409, "already_captured", false)
    }
    return { data: { ...(output.data ?? {}), status: "canceled", canceled_locally: true } }
  }

  deletePayment(input: PaymentInput): Promise<PaymentOutput> {
    return this.cancelPayment(input)
  }

  async refundPayment(input: RefundPaymentInput): Promise<PaymentOutput> {
    const data = input.data ?? {}
    const id = requiredString(data.id, "data.id")
    const currency = normalizeCurrency(requiredString(
      data.expected_currency ?? data.currency,
      "data.expected_currency",
    ))
    assertCurrency(currency, this.options.allowed_currencies)
    const idempotencyKey = requiredString(input.context?.idempotency_key, "context.idempotency_key")
    const refund = await this.client.refund(id, decimalAmount(input.amount), idempotencyKey)
    return { data: { ...data, refund } }
  }

  async retrievePayment(input: PaymentInput): Promise<PaymentOutput> {
    const data = input.data ?? {}
    const transaction = await this.retrieveTransaction(data)
    return { data: normalizeTransaction(data, transaction, optionalString(data.session_id)) }
  }

  async updatePayment(input: UpdatePaymentInput): Promise<PaymentOutput> {
    const data = input.data ?? {}
    const amount = decimalAmount(input.amount)
    const expectedAmount = canonicalAmount(input.amount)
    const currency = normalizeCurrency(input.currency_code)
    assertCurrency(currency, this.options.allowed_currencies)
    if (data.expected_amount === expectedAmount && data.expected_currency === currency) {
      return this.statusOutput(input)
    }
    const current = await this.statusOutput(input)
    if (current.status === "captured") {
      throw new FlutterwaveAPIError("Captured Flutterwave transactions cannot be updated", 409, "already_captured", false)
    }
    return this.initiatePayment({
      ...input,
      context: {
        ...input.context,
        idempotency_key: input.context?.idempotency_key
          ? `${input.context.idempotency_key}:update:${amount}:${currency}`
          : undefined,
      },
    })
  }

  getPaymentStatus(input: PaymentInput): Promise<PaymentOutput & { status: PaymentSessionStatus }> {
    return this.statusOutput(input)
  }

  async getWebhookActionAndData(payload: WebhookPayload): Promise<WebhookResult> {
    const raw = rawPayload(payload)
    await this.verifyWebhook(raw, payload.headers)
    const event = asRecord(JSON.parse(raw)) ?? asRecord(payload.data)
    const type = optionalString(event?.event) ?? optionalString(event?.type)
    const supplied = asRecord(event?.data)
    if (!type || !supplied || !type.startsWith("charge.")) {
      return { action: "not_supported" }
    }
    const id = stringIdentifier(supplied.id)
    const reference = optionalString(supplied.tx_ref) ?? optionalString(supplied.reference)
    const verified = id
      ? await this.client.verify(id)
      : await this.client.verifyReference(requiredString(reference, "webhook data.tx_ref"))
    assertWebhookTransaction(supplied, verified)
    const meta = asRecord(verified.meta) ?? asRecord(supplied.meta) ?? asRecord(supplied.metadata)
    const sessionId = requiredString(meta?.session_id, "webhook data.meta.session_id")
    const amount = decimalAmount(verified.amount)
    const result = { session_id: sessionId, amount }
    if (type === "charge.completed") {
      return { action: mapStatus(verified.status) === "captured" ? "captured" : "pending", data: result }
    }
    if (type === "charge.failed") return { action: "failed", data: result }
    this.logger?.debug?.(`Ignored Flutterwave webhook event ${type}`)
    return { action: "not_supported" }
  }

  private async statusOutput(input: PaymentInput): Promise<PaymentOutput & { status: PaymentSessionStatus }> {
    const data = input.data ?? {}
    const transaction = await this.retrieveTransaction(data)
    assertExpectedTransaction(transaction, data)
    return {
      status: mapStatus(transaction.status),
      data: normalizeTransaction(data, transaction, optionalString(data.session_id)),
    }
  }

  private retrieveTransaction(data: Record<string, unknown>): Promise<FlutterwaveTransaction> {
    const id = optionalString(data.id)
    return id
      ? this.client.verify(id)
      : this.client.verifyReference(requiredString(data.tx_ref, "data.tx_ref"))
  }

  private async verifyWebhook(raw: string, headers?: WebhookPayload["headers"]): Promise<void> {
    const direct = header(headers, "verif-hash")
    if (direct) {
      if (constantTimeEqual(direct, this.options.webhook_secret)) return
      throw new Error("Invalid Flutterwave webhook signature")
    }
    const supplied = header(headers, "flutterwave-signature") ?? header(headers, "x-flutterwave-signature")
    if (!supplied) throw new Error("Missing Flutterwave webhook signature")
    const expected = await hmacSignature(raw, this.options.webhook_secret)
    if (!constantTimeEqual(expected, supplied)) throw new Error("Invalid Flutterwave webhook signature")
  }
}

function customerName(
  customer: PaymentContext["customer"],
  data: Record<string, unknown>,
): string | undefined {
  const name = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ").trim()
  return name || optionalString(data.customer_name)
}
