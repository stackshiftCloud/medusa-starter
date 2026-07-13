export async function hmacSignature(
  raw: string | Uint8Array,
  secret: string,
  algorithm: "SHA-256" | "SHA-512",
  encoding: "base64" | "hex",
): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  )
  const bytes = typeof raw === "string" ? encoder.encode(raw) : raw
  const data = new Uint8Array(bytes).buffer
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, data))
  if (encoding === "hex") {
    return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("")
  }
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
