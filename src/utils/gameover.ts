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
    return `<button type="button" class="notification-btn" data-notification-action="rematch" aria-label="邀请 ${opponentName ?? "对手"} 再来一局" data-rule="${ruletype}">再来一局</button>`
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
