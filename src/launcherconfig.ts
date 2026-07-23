export type LauncherRule =
  "nineball" | "eightball" | "fourball" | "snooker" | "threecushion"

export type LauncherOpponent = "practice" | "ClawBreak" | "TheFarJaw"
export type LauncherQuality = "low" | "balanced" | "high"

export interface LauncherSelection {
  rule: LauncherRule
  opponent: LauncherOpponent
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
    url.searchParams.set("bot", selection.opponent)
    url.searchParams.set("practice", "false")
  }
  return url.toString()
}
