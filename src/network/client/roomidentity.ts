export const ROOM_PROTOCOL_VERSION = 2
export const ROOM_CODE_MAX_LENGTH = 24

function isForbiddenRoomCodeCharacter(character: string): boolean {
  const code = character.codePointAt(0) ?? 0
  return (
    code <= 0x1f ||
    code === 0x00ad ||
    code === 0x061c ||
    code === 0x180e ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x200b ||
    code === 0x200c ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    code === 0x2060 ||
    (code >= 0x2066 && code <= 0x2069) ||
    code === 0xfeff
  )
}

function visibleCharacterCount(value: string): number {
  const Segmenter = (Intl as any).Segmenter
  if (!Segmenter) return Array.from(value).length
  return Array.from(
    new Segmenter(undefined, { granularity: "grapheme" }).segment(value)
  ).length
}

export interface RoomIdentity {
  displayCode: string
  normalizedCode: string
  channelId: string
  protocolVersion: 2
}

export function normaliseDisplayRoomCode(value: string): string {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ")
  if (Array.from(normalized).some(isForbiddenRoomCodeCharacter)) {
    throw new Error("房间码不能包含控制字符或不可见方向字符")
  }
  const characterCount = visibleCharacterCount(normalized)
  if (characterCount === 0) {
    throw new Error("请输入房间码")
  }
  if (characterCount > ROOM_CODE_MAX_LENGTH) {
    throw new Error(`房间码最多 ${ROOM_CODE_MAX_LENGTH} 个字符`)
  }
  return normalized
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}

export async function deriveRoomIdentity(value: string): Promise<RoomIdentity> {
  const normalizedCode = normaliseDisplayRoomCode(value)
  if (!globalThis.crypto?.subtle) {
    throw new Error("当前浏览器不支持安全房间码，请升级浏览器后重试")
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`break-builder-room-v2:${normalizedCode}`)
  )
  const channelId = `bb3d-v2-${bytesToHex(new Uint8Array(digest).slice(0, 16))}`
  return {
    displayCode: normalizedCode,
    normalizedCode,
    channelId,
    protocolVersion: ROOM_PROTOCOL_VERSION,
  }
}
