import {
  deriveRoomIdentity,
  normaliseDisplayRoomCode,
  ROOM_PROTOCOL_VERSION,
} from "./network/client/roomidentity"

export type LauncherRule =
  "nineball" | "eightball" | "fourball" | "snooker" | "threecushion"

export type LauncherOpponent =
  "practice" | "ai" | "local" | "online" | "ClawBreak" | "TheFarJaw"
export type LauncherQuality = "low" | "balanced" | "high"
export type LauncherOnlineAction = "create" | "join"

export interface LauncherSelection {
  rule: LauncherRule
  opponent: LauncherOpponent
  botLevel: number
  quality: LauncherQuality
  player1Name?: string
  player2Name?: string
  player1Cue?: string
  player2Cue?: string
  cueStyle?: string
  tableStyle?: string
  environmentStyle?: string
  onlineAction?: LauncherOnlineAction
  roomCode?: string
  onlinePlayerName?: string
  onlineUserId?: string
  roomInstanceId?: string
}

export const DEFAULT_WEBSOCKET_SERVER = "wss://billiards-network.onrender.com"

export function normaliseRoomCode(value: string): string {
  try {
    return normaliseDisplayRoomCode(value)
  } catch {
    return value.normalize("NFKC").trim().replace(/\s+/gu, " ")
  }
}

export function generateRoomCode(random: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 6 }, () => {
    const index = Math.floor(random() * alphabet.length)
    return alphabet[Math.max(0, Math.min(alphabet.length - 1, index))]
  }).join("")
}

export function buildInviteUrl(
  roomCode: string,
  selection: Pick<LauncherSelection, "rule" | "quality" | "environmentStyle">,
  baseHref: string
): string {
  const url = new URL(baseHref)
  url.search = ""
  url.hash = ""
  url.searchParams.set("join", normaliseRoomCode(roomCode))
  url.searchParams.set("roomVersion", String(ROOM_PROTOCOL_VERSION))
  url.searchParams.set("rule", selection.rule)
  url.searchParams.set("quality", selection.quality)
  if (selection.environmentStyle) {
    url.searchParams.set("environment", selection.environmentStyle)
  }
  return url.toString()
}

const directStartKeys = [
  "play",
  "ruletype",
  "bot",
  "practice",
  "state",
  "websocketserver",
  "lobbyUrl",
  "spectator",
  "first",
]

export function shouldShowLauncher(params: URLSearchParams) {
  return !directStartKeys.some((key) => params.has(key))
}

export async function buildGameUrl(
  selection: LauncherSelection,
  baseHref: string
): Promise<string> {
  const url = new URL(baseHref)
  url.search = ""
  url.hash = ""
  url.searchParams.set("play", "1")
  url.searchParams.set("ruletype", selection.rule)
  url.searchParams.set("quality", selection.quality)
  if (selection.environmentStyle) {
    url.searchParams.set("environment", selection.environmentStyle)
  }

  if (selection.opponent === "practice") {
    url.searchParams.set("practice", "true")
  } else if (selection.opponent === "local") {
    url.searchParams.set("local", "true")
    url.searchParams.set("practice", "false")
    url.searchParams.set("p1Name", selection.player1Name?.trim() || "玩家一")
    url.searchParams.set("p2Name", selection.player2Name?.trim() || "玩家二")
    url.searchParams.set("p1Cue", selection.player1Cue || "heritage")
    url.searchParams.set("p2Cue", selection.player2Cue || "jade")
  } else if (selection.opponent === "online") {
    const room = await deriveRoomIdentity(selection.roomCode ?? "")
    url.searchParams.set("practice", "false")
    url.searchParams.set("websocketserver", DEFAULT_WEBSOCKET_SERVER)
    url.searchParams.set("tableId", room.channelId)
    url.searchParams.set("roomCode", room.displayCode)
    url.searchParams.set("roomVersion", String(room.protocolVersion))
    if (selection.roomInstanceId) {
      url.searchParams.set("roomInstance", selection.roomInstanceId)
    }
    url.searchParams.set(
      "userName",
      selection.onlinePlayerName?.trim() || "玩家"
    )
    if (selection.onlineUserId) {
      url.searchParams.set("userId", selection.onlineUserId)
    }
    if (selection.onlineAction !== "join") {
      url.searchParams.set("first", "true")
      url.searchParams.set(
        "roomInstance",
        selection.roomInstanceId ||
          globalThis.crypto?.randomUUID?.() ||
          `room-${Date.now().toString(36)}-${generateRoomCode()}`
      )
      url.searchParams.set(
        "matchId",
        globalThis.crypto?.randomUUID?.() || `match-${generateRoomCode()}`
      )
      url.searchParams.set("rack", "1")
    }
  } else {
    const level = Math.max(1, Math.min(11, Math.round(selection.botLevel)))
    url.searchParams.set("bot", level >= 6 ? "TheFarJaw" : "ClawBreak")
    url.searchParams.set("botLevel", level.toString())
    url.searchParams.set("practice", "false")
  }
  return url.toString()
}
