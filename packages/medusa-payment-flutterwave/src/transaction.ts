import { FlutterwaveAPIError, type FlutterwaveTransaction } from "./client.js"
import { asRecord, canonicalAmount, normalizeCurrency, optionalString } from "./payment-utils.js"
import type { PaymentSessionStatus } from "./types.js"

export function normalizeTransaction(
  current: Record<string, unknown>,
  transaction: FlutterwaveTransaction,
  sessionId?: string,
): Record<string, unknown> {
  return {
    ...current,
    ...transaction,
    id: transaction.id === undefined ? current.id : String(transaction.id),
    tx_ref: transaction.tx_ref || current.tx_ref,
    session_id: sessionId ?? asRecord(transaction.meta)?.session_id,
    gateway: "flutterwave",
  }
}

export function mapStatus(status?: string): PaymentSessionStatus {
  switch (status?.toLowerCase()) {
    case "successful": case "succeeded": return "captured"
    case "cancelled": case "canceled": return "canceled"
    case "failed": return "error"
    case "pending": case "processing": return "pending_authorization"
    default: return "requires_more"
  }
}

export function assertExpectedTransaction(
  transaction: FlutterwaveTransaction,
  expected: Record<string, unknown>,
): void {
  const reference = optionalString(expected.tx_ref)
  const currency = optionalString(expected.expected_currency)
  const amount = optionalString(expected.expected_amount)
  if (reference && transaction.tx_ref !== reference) mismatch("reference")
  if (currency && normalizeCurrency(transaction.currency ?? "") !== currency) mismatch("currency")
  if (amount && canonicalAmount(transaction.amount) !== amount) mismatch("amount")
}

export function assertWebhookTransaction(
  supplied: Record<string, unknown>,
  verified: FlutterwaveTransaction,
): void {
  const reference = optionalString(supplied.tx_ref) ?? optionalString(supplied.reference)
  if (!reference || verified.tx_ref !== reference) mismatch("webhook reference")
  if (supplied.amount !== undefined && canonicalAmount(verified.amount) !== canonicalAmount(supplied.amount)) {
    mismatch("webhook amount")
  }
  const currency = optionalString(supplied.currency)
  if (currency && normalizeCurrency(verified.currency ?? "") !== normalizeCurrency(currency)) {
    mismatch("webhook currency")
  }
}

function mismatch(field: string): never {
  throw new FlutterwaveAPIError(
    `Flutterwave transaction ${field} mismatch`,
    409,
    "verification_mismatch",
    false,
  )
}
