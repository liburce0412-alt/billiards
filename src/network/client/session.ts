import { ThreeCushionConfig } from "../../utils/threecushionconfig"

interface LocalPlayer {
  id: string
  name: string
  cueStyleId: string
}

export class Session {
  constructor(
    public playername: string,
    readonly clientId: string,
    readonly tableId: string,
    readonly spectator: boolean,
    readonly botMode: boolean = false,
    readonly examMode: boolean = false,
    readonly practiceMode: boolean = false,
    readonly lod: number = 1,
    readonly first: boolean = false,
    readonly speedrunMode: boolean = false
  ) {}

  opponentName?: string
  opponentClientId?: string
  spectatedP1Name?: string
  spectatedP2Name?: string
  vsNotificationShown: boolean = false
  playerIndex: number = 0
  private scoreByClientId: Record<string, number> = {}
  currentBreak: number = 0
  p1type: number = 0
  private localPlayers?: [LocalPlayer, LocalPlayer]

  private static instance: Session | undefined
  private static readonly fallbackOpponentClientId = "opponent"

  static getInstance(): Session {
    Session.instance ??= new Session("", "", "", false, false, false, false)
    return Session.instance
  }

  static playerIndex(): number {
    return Session.getInstance().playerIndex
  }

  static isSpectator(): boolean {
    return Session.getInstance().spectator
  }

  static isBotMode(): boolean {
    return Session.getInstance().botMode
  }

  static isExamMode(): boolean {
    return Session.getInstance().examMode
  }

  static isPracticeMode(): boolean {
    return Session.instance?.practiceMode ?? false
  }

  static isSpeedrunMode(): boolean {
    return Session.getInstance().speedrunMode
  }

  static isLocalVersusMode(): boolean {
    return !!Session.getInstance().localPlayers
  }

  static getLod(): number {
    return Session.getInstance().lod
  }

  static hasInitParam(): boolean {
    if (typeof globalThis.location === "undefined") {
      return false
    }
    const params = new URLSearchParams(globalThis.location?.search)
    return params.has("init")
  }

  static reset() {
    Session.instance = undefined
  }

  static init(
    clientId: string,
    playername: string,
    tableId: string,
    spectator: boolean,
    botMode: boolean = false,
    examMode: boolean = false,
    practiceMode: boolean = false,
    lod: number = 1,
    first: boolean = false,
    speedrunMode: boolean = false
  ) {
    Session.instance = new Session(
      playername,
      clientId,
      tableId,
      spectator,
      botMode,
      examMode,
      practiceMode,
      lod,
      first,
      speedrunMode
    )
    Session.instance.initializeScores()
    if (botMode && typeof globalThis.location !== "undefined") {
      const urlParams = new URLSearchParams(globalThis.location.search)
      const bot = urlParams.get("bot")
      Session.instance.opponentName = bot ?? "ClawBreak"
      Session.instance.setOpponentClientId("bot")
    }
  }

  initializeScores(): void {
    this.scoreByClientId = {
      [this.clientId]: 0,
    }
    if (this.opponentClientId) {
      this.scoreByClientId[this.opponentClientId] = 0
    }
  }

  enableLocalVersus(
    player1Name: string,
    player2Name: string,
    player1Cue: string,
    player2Cue: string
  ): void {
    const player2Id = `${this.clientId}-local-2`
    this.localPlayers = [
      {
        id: this.clientId,
        name: player1Name.trim() || "玩家一",
        cueStyleId: player1Cue,
      },
      {
        id: player2Id,
        name: player2Name.trim() || "玩家二",
        cueStyleId: player2Cue,
      },
    ]
    this.playerIndex = 0
    this.playername = this.localPlayers[0].name
    this.opponentName = this.localPlayers[1].name
    this.opponentClientId = player2Id
    this.scoreByClientId = {
      [this.localPlayers[0].id]: 0,
      [this.localPlayers[1].id]: 0,
    }
  }

  switchLocalPlayer(): void {
    if (!this.localPlayers) return
    this.playerIndex = this.playerIndex === 0 ? 1 : 0
    const active = this.localPlayers[this.playerIndex]
    const opponent = this.localPlayers[this.playerIndex === 0 ? 1 : 0]
    this.playername = active.name
    this.opponentName = opponent.name
    if (this.p1type === 1) {
      this.p1type = 2
    } else if (this.p1type === 2) {
      this.p1type = 1
    }
  }

  activeLocalPlayerName(): string {
    return this.localPlayers?.[this.playerIndex]?.name ?? this.playername
  }

  activeLocalCueStyle(): string | undefined {
    return this.localPlayers?.[this.playerIndex]?.cueStyleId
  }

  private activeScoreKey(): string {
    return this.localPlayers?.[this.playerIndex]?.id ?? this.clientId
  }

  private opponentKey(): string {
    if (this.localPlayers) {
      return this.localPlayers[this.playerIndex === 0 ? 1 : 0].id
    }
    return this.opponentClientId ?? Session.fallbackOpponentClientId
  }

  setOpponentClientId(clientId: string): void {
    const previousOpponentKey = this.opponentKey()
    const previousScore = this.getScoreByClientId(previousOpponentKey)
    this.opponentClientId = clientId
    if (!(clientId in this.scoreByClientId)) {
      this.scoreByClientId[clientId] = previousScore
    }
    if (
      previousOpponentKey !== clientId &&
      previousOpponentKey in this.scoreByClientId
    ) {
      delete this.scoreByClientId[previousOpponentKey]
    }
  }

  myScore(): number {
    return this.getScoreByClientId(this.activeScoreKey())
  }

  opponentScore(): number {
    return this.getScoreByClientId(this.opponentKey())
  }

  setMyScore(score: number): void {
    this.setScoreByClientId(this.activeScoreKey(), score)
  }

  setOpponentScore(score: number): void {
    this.setScoreByClientId(this.opponentKey(), score)
  }

  addMyScore(delta: number): void {
    this.setMyScore(this.myScore() + delta)
  }

  addOpponentScore(delta: number): void {
    this.setOpponentScore(this.opponentScore() + delta)
  }

  getScoreByClientId(clientId: string): number {
    return this.scoreByClientId[clientId] ?? 0
  }

  setScoreByClientId(clientId: string, score: number): void {
    this.scoreByClientId[clientId] = score
  }

  orderedScoresForHud(): { p1: number; p2: number } {
    if (this.localPlayers) {
      return {
        p1: this.getScoreByClientId(this.localPlayers[0].id),
        p2: this.getScoreByClientId(this.localPlayers[1].id),
      }
    }
    if (this.playerIndex === 0) {
      return { p1: this.myScore(), p2: this.opponentScore() }
    }
    return { p1: this.opponentScore(), p2: this.myScore() }
  }

  orderedNamesForHud(): { p1Name?: string; p2Name?: string } {
    if (this.localPlayers) {
      return {
        p1Name: this.localPlayers[0].name,
        p2Name: this.localPlayers[1].name,
      }
    }
    if (this.spectator) {
      console.log(
        `[Session] orderedNamesForHud spectator mode: spectatedP1Name=${this.spectatedP1Name}, spectatedP2Name=${this.spectatedP2Name}`
      )
      const names: { p1Name?: string; p2Name?: string } = {}
      if (this.spectatedP1Name) {
        names.p1Name = this.spectatedP1Name
      }
      if (this.spectatedP2Name) {
        names.p2Name = this.spectatedP2Name
      }
      return names
    }

    const myName = this.playername || undefined
    const theirName = this.opponentName || undefined
    if (this.playerIndex === 0) {
      const names: { p1Name?: string; p2Name?: string } = {}
      if (myName) {
        names.p1Name = myName
      }
      if (theirName) {
        names.p2Name = theirName
      }
      return names
    }
    const names: { p1Name?: string; p2Name?: string } = {}
    if (theirName) {
      names.p1Name = theirName
    }
    if (myName) {
      names.p2Name = myName
    }
    return names
  }

  orderedClientIdsForHud(): { p1: string; p2: string } {
    if (this.localPlayers) {
      return {
        p1: this.localPlayers[0].id,
        p2: this.localPlayers[1].id,
      }
    }
    const opponent = this.opponentClientId ?? Session.fallbackOpponentClientId
    return this.playerIndex === 0
      ? { p1: this.clientId, p2: opponent }
      : { p1: opponent, p2: this.clientId }
  }

  updateScoresFromNetwork(p1: number, p2: number, breakScore: number): void {
    if (this.localPlayers) {
      this.setScoreByClientId(this.localPlayers[0].id, p1)
      this.setScoreByClientId(this.localPlayers[1].id, p2)
      this.currentBreak = breakScore
      return
    }
    if (this.playerIndex === 1) {
      this.setMyScore(p2)
      this.setOpponentScore(p1)
    } else {
      this.setMyScore(p1)
      this.setOpponentScore(p2)
    }
    this.currentBreak = breakScore
  }

  /**
   * Retrieves a map of user ID to handicap value from the URL query parameters.
   */
  getHandicaps(): Record<string, number> {
    if (
      typeof globalThis.location === "undefined" ||
      !globalThis.location.search
    ) {
      return {}
    }
    const params = new URLSearchParams(globalThis.location.search)
    const handicaps: Record<string, number> = {}
    for (const [k, v] of params) {
      if (k.startsWith("handicap_")) {
        const userId = k.replace("handicap_", "")
        handicaps[userId] = Number.parseInt(v) || 5
      }
    }
    return handicaps
  }

  /**
   * Resolves the race target for a specific player by their client ID.
   * - If no player has a handicap specified, returns the default ThreeCushionConfig.raceTo (7).
   * - If at least one player has a handicap specified, any player (or bot) without an explicit handicap defaults to 5.
   */
  getRaceTargetForPlayer(clientId: string): number {
    const handicaps = this.getHandicaps()
    const hasAnyHandicap = Object.keys(handicaps).length > 0

    if (!hasAnyHandicap) {
      return ThreeCushionConfig.raceTo
    }

    // If a handicap exists in URL for this client, use it; otherwise, default to 5 (handles opponent or bot)
    return handicaps[clientId] ?? 5
  }
}
