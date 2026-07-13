const standardCurrencies = new Set([
  "NGN", "USD", "EUR", "GBP", "GHS", "XAF", "XOF", "ZAR", "MWK", "KES",
  "UGX", "RWF", "TZS", "EGP", "ZMW",
])

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase()
}

export function assertCurrency(currency: string, allowed?: string[]): void {
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`Invalid currency code ${currency}`)
  const enabled = allowed?.length ? allowed.map(normalizeCurrency) : [...standardCurrencies]
  if (!enabled.includes(currency)) throw new Error(`Flutterwave currency ${currency} is not enabled`)
}

export function validateAllowedCurrencies(allowed?: string[]): void {
  for (const currency of allowed ?? []) {
    if (!/^[A-Z]{3}$/.test(normalizeCurrency(currency))) {
      throw new Error(`Invalid Flutterwave currency code ${currency}`)
    }
  }
}

export function decimalAmount(value: unknown): number {
  const amount = Number(amountString(value))
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Payment amount must be a non-negative decimal number")
  }
  return amount
}

export function canonicalAmount(value: unknown): string {
  const text = amountString(value)
  const [whole, fraction = ""] = text.split(".")
  const trimmed = fraction.replace(/0+$/, "")
  return trimmed ? `${BigInt(whole)}.${trimmed}` : BigInt(whole).toString()
}

export function makeReference(value: string, prefix: string, amount: string, currency: string): string {
  return `${prefix}-${value}-${amount}-${currency}`.replace(/[^A-Za-z0-9.=-]/g, "-").slice(0, 100)
}

export function requiredString(value: unknown, name: string): string {
  const result = optionalString(value)
  if (!result) throw new Error(`Missing ${name}`)
  return result
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined
}

export function stringIdentifier(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value)
  return optionalString(value)
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined))
}

export function header(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  const value = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1]
  if (Array.isArray(value)) return optionalString(value[0])
  return optionalString(value)
}

export function rawPayload(payload: { data?: unknown; rawData?: string | Uint8Array }): string {
  if (typeof payload.rawData === "string") return payload.rawData
  if (payload.rawData instanceof Uint8Array) return new TextDecoder().decode(payload.rawData)
  return JSON.stringify(payload.data ?? {})
}

function amountString(value: unknown): string {
  const record = asRecord(value)
  if (record && "value" in record) return amountString(record.value)
  if (record && "numeric" in record) return amountString(record.numeric)
  if (record && typeof record.toJSON === "function") return amountString(record.toJSON())
  const text = typeof value === "string" ? value.trim() : String(value)
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) {
    throw new Error("Payment amount must be a non-negative decimal number")
  }
  return text
}
