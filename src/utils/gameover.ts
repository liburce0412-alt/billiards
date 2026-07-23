import { LOBBY_URL } from "../network/client/constants"

export const gameOverButtons = {
  home: `<button type="button" class="notification-btn" data-notification-action="home">返回首页</button>`,
  newGame: `<button type="button" class="notification-btn" data-notification-action="reload">新一局</button>`,
  replay: `<button type="button" class="notification-btn" data-notification-action="replay">回放</button>`,

  rematch(
    opponentId: string | undefined,
    opponentName: string | undefined,
    ruletype: string,
    nextTurnId: string | undefined
  ): string {
    if (!opponentId || !nextTurnId) return ""

    const url = new URL(LOBBY_URL)
    url.searchParams.set("opponentId", opponentId)
    if (opponentName) {
      url.searchParams.set("opponentName", opponentName)
    }
    url.searchParams.set("ruletype", ruletype)
    url.searchParams.set("nextTurnId", nextTurnId)

    if (typeof globalThis !== "undefined" && globalThis.location) {
      const systemParams = new Set([
        "userId",
        "userName",
        "tableId",
        "websocketserver",
        "first",
        "spectator",
        "opponentId",
        "opponentName",
        "ruletype",
        "nextTurnId",
      ])
      const currentParams = new URLSearchParams(globalThis.location.search)
      for (const [key, val] of currentParams.entries()) {
        if (!systemParams.has(key)) {
          url.searchParams.set(key, val)
        }
      }
    }

    return `<button type="button" class="notification-btn" data-notification-action="rematch" data-notification-url="${url.toString()}">再来一局</button>`
  },

  forMode(
    isSinglePlayer: boolean,
    opponentId?: string,
    opponentName?: string,
    ruletype?: string,
    nextTurnId?: string
  ): string {
    if (isSinglePlayer) {
      return this.newGame + " " + this.home
    }
    if (!ruletype) return this.home
    const rematch = this.rematch(opponentId, opponentName, ruletype, nextTurnId)
    return rematch ? rematch + " " + this.home : this.home
  },
}
