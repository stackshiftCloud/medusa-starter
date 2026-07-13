const paystackCurrencies = new Set(["NGN", "USD", "GHS", "ZAR", "KES", "XOF"])

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase()
}

export function assertCurrency(currency: string, allowed?: string[]): void {
  if (!paystackCurrencies.has(currency)) {
    throw new Error(`Paystack does not support currency ${currency}`)
  }
  if (allowed?.length && !allowed.map(normalizeCurrency).includes(currency)) {
    throw new Error(`Paystack currency ${currency} is not enabled`)
  }
}

export function validateAllowedCurrencies(allowed?: string[]): void {
  for (const currency of allowed ?? []) assertCurrency(normalizeCurrency(currency))
}

// Paystack expects every supported currency in x100 subunits, including XOF.
export function toMinorAmount(value: unknown, currency: string): string {
  const decimal = amountString(value)
  const [whole, fraction = ""] = decimal.split(".")
  if (currency === "XOF" && /[1-9]/.test(fraction)) {
    throw new Error("Paystack XOF amounts cannot contain a fractional part")
  }
  if (fraction.length > 2 && /[1-9]/.test(fraction.slice(2))) {
    throw new Error(`Paystack ${currency} amounts cannot exceed two decimal places`)
  }
  return BigInt(`${whole}${fraction.padEnd(2, "0").slice(0, 2)}`).toString()
}

export function fromMinorAmount(value: unknown): number {
  const amount = Number(value)
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Invalid Paystack subunit amount")
  return amount / 100
}

export function makeReference(
  value: string,
  prefix: string,
  minorAmount: string,
  currency: string,
): string {
  const safe = `${prefix}-${value}-${minorAmount}-${currency}`.replace(/[^A-Za-z0-9.=-]/g, "-")
  return safe.slice(0, 100)
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
