const encoder = new TextEncoder()

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value))
  return bytesToBase64(new Uint8Array(digest))
}

export async function constantTimeEqual(
  left: string,
  right: string
): Promise<boolean> {
  const leftDigest = await crypto.subtle.digest("SHA-256", encoder.encode(left))
  const rightDigest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(right)
  )
  const a = new Uint8Array(leftDigest)
  const b = new Uint8Array(rightDigest)
  let difference = 0
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index]
  }
  return difference === 0
}

export function randomToken(bytes = 24): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}
