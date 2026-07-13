import { PaystackAPIError, type PaystackTransaction } from "./client.js"
import { asRecord, normalizeCurrency, optionalString } from "./payment-utils.js"
import type { PaymentSessionStatus } from "./types.js"

export function normalizeTransaction(
  current: Record<string, unknown>,
  transaction: PaystackTransaction,
  sessionId?: string,
): Record<string, unknown> {
  return {
    ...current,
    ...transaction,
    id: transaction.id === undefined ? current.id : String(transaction.id),
    reference: transaction.reference,
    session_id: sessionId ?? asRecord(transaction.metadata)?.session_id,
    gateway: "paystack",
  }
}

export function mapStatus(status?: string): PaymentSessionStatus {
  switch (status?.toLowerCase()) {
    case "success": return "captured"
    case "abandoned": case "cancelled": case "reversed": return "canceled"
    case "failed": return "error"
    case "ongoing": case "processing": case "pending": case "queued": return "pending_authorization"
    default: return "requires_more"
  }
}

export function assertExpectedTransaction(
  transaction: PaystackTransaction,
  expected: Record<string, unknown>,
): void {
  const expectedReference = optionalString(expected.reference)
  const expectedCurrency = optionalString(expected.expected_currency)
  const expectedAmount = optionalString(expected.expected_amount_minor)
  if (expectedReference && transaction.reference !== expectedReference) mismatch("reference")
  if (expectedCurrency && normalizeCurrency(transaction.currency ?? "") !== expectedCurrency) mismatch("currency")
  if (expectedAmount && String(transaction.amount) !== expectedAmount) mismatch("amount")
}

export function assertWebhookTransaction(
  supplied: Record<string, unknown>,
  verified: PaystackTransaction,
): void {
  const reference = optionalString(supplied.reference)
  if (!reference || verified.reference !== reference) mismatch("webhook reference")
  if (supplied.amount !== undefined && String(verified.amount) !== String(supplied.amount)) mismatch("webhook amount")
  const currency = optionalString(supplied.currency)
  if (currency && normalizeCurrency(verified.currency ?? "") !== normalizeCurrency(currency)) {
    mismatch("webhook currency")
  }
}

function mismatch(field: string): never {
  throw new PaystackAPIError(`Paystack transaction ${field} mismatch`, 409, "verification_mismatch", false)
}
