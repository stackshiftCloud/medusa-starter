export async function hmacSignature(
  raw: string | Uint8Array,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const bytes = typeof raw === "string" ? encoder.encode(raw) : raw
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new Uint8Array(bytes).buffer),
  )
  let binary = ""
  for (const byte of signature) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length)
  let difference = left.length ^ right.length
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0)
  }
  return difference === 0
}
