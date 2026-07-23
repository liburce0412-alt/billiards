export type LauncherRule =
  "nineball" | "eightball" | "fourball" | "snooker" | "threecushion"

export type LauncherOpponent = "practice" | "ai" | "ClawBreak" | "TheFarJaw"
export type LauncherQuality = "low" | "balanced" | "high"

export interface LauncherSelection {
  rule: LauncherRule
  opponent: LauncherOpponent
  botLevel: number
  quality: LauncherQuality
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

export function buildGameUrl(selection: LauncherSelection, baseHref: string) {
  const url = new URL(baseHref)
  url.search = ""
  url.hash = ""
  url.searchParams.set("play", "1")
  url.searchParams.set("ruletype", selection.rule)
  url.searchParams.set("quality", selection.quality)

  if (selection.opponent === "practice") {
    url.searchParams.set("practice", "true")
  } else {
    const level = Math.max(1, Math.min(11, Math.round(selection.botLevel)))
    url.searchParams.set("bot", level >= 6 ? "TheFarJaw" : "ClawBreak")
    url.searchParams.set("botLevel", level.toString())
    url.searchParams.set("practice", "false")
  }
  return url.toString()
}
