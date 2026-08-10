import { Container } from "./container"
import { ContainerConfig } from "./containerconfig"
import { Keyboard } from "../events/keyboard"
import { EventUtil } from "../events/eventutil"
import { BreakEvent } from "../events/breakevent"
import { GameEvent } from "../events/gameevent"
import {
  bounceHan,
  bounceHanBlend,
  mathavanAdapter,
} from "../model/physics/physics"
import { strongeAdapter } from "../model/physics/stronge"
import JSONCrush from "jsoncrush"
import { Assets } from "../view/assets"
import { SnookerConfig } from "../utils/snookerconfig"
import { ThreeCushionConfig } from "../utils/threecushionconfig"
import { Session } from "../network/client/session"
import { MessageRelay } from "../network/client/messagerelay"
import { MessagingMessageRelay } from "../network/client/messagingmessagerelay"
import { BotRelay } from "../network/bot/botrelay"
import { ScoreReporter } from "../network/client/scorereporter"
import { BeginEvent } from "../events/beginevent"
import { Logger } from "../network/bot/logger"
import { getUID } from "../utils/uid"
import { DrillPanel } from "../view/drillpanel"
import { AnalysisPanel } from "../view/analysispanel"
import { applyPhysicsParams } from "../utils/physicsparams"
import { TableConfig } from "../view/tableconfig"
import { applyPhysicsProfileForRule } from "../model/physics/profile"
import { Camera } from "../view/camera"
import { RejoinEvent, RejoinSnapshot } from "../events/rejoinevent"
import { EventType } from "../events/eventtype"
import { EventSequenceWindow } from "../network/client/eventsequence"
import { RoomControlEvent, RoomSettings } from "../events/roomcontrolevent"
import { RuleDecisionEvent } from "../events/ruledecisionevent"
import {
  appendRoomJournal,
  clearRoomState,
  loadRoomState,
  saveRoomState,
} from "../network/client/roomstate"

/**
 * Integrate game container into HTML page
 */
export class BrowserContainer {
  container: Container
  canvas3d
  tableId
  clientId
  wss
  lobbyUrl
  ruletype
  playername: string
  replay: string | null
  messageRelay: MessageRelay | null = null
  breakState: {
    init: any
    shots: any[]
    now: number
    score: number
    players?: { player1: string; player2: string }
    tableSize?: number
  } = {
    init: null,
    shots: [],
    now: 0,
    score: 0,
  }
  cushionModel
  spectator
  first
  assets: Assets
  now
  botMode: boolean = false
  botName: string = ""
  practiceMode: boolean = false
  drillMode: boolean = false
  analysisMode: boolean = false
  examMode: boolean = false
  speedrun: boolean = false
  localMesh: boolean = false
  localVersus: boolean = false
  readonly botDelay: number = 500
  private readonly connectionStream = `E_${getUID()}`
  private outgoingSequence = 0
  private readonly receivedSequences = new EventSequenceWindow()
  private pendingStateSyncResponse = false
  private readonly roomProtocolV2: boolean
  private readonly roomCode: string
  private roomInstanceId: string
  private matchId: string
  private rackNumber: number
  private roomRevision = 0
  private restoredRoomState = false
  private readonly readyClients = new Set<string>()
  private readonly rematchClients = new Set<string>()
  private roomLifecycle: import("../events/roomcontrolevent").RoomLifecycleState =
    "claiming"
  private rematchTimeout?: ReturnType<typeof globalThis.setTimeout>
  private connectionState: "connected" | "offline" | "reconnecting" =
    "connected"
  constructor(canvas3d, params) {
    this.now = Date.now()
    this.playername =
      params.get("userName") ??
      params.get("name") ??
      params.get("playername") ??
      "Anon"
    this.tableId = params.get("tableId") ?? "default"
    this.clientId =
      params.get("userId") ?? params.get("clientId") ?? `G_${getUID()}`
    this.replay = params.get("state")
    this.ruletype = params.get("ruletype") ?? "nineball"
    applyPhysicsProfileForRule(this.ruletype)
    Camera.configureForRule(this.ruletype)
    const lobbyUrl = params.get("lobbyUrl")
    const wss = params.get("websocketserver")
    this.lobbyUrl = lobbyUrl
    this.wss = wss
    this.canvas3d = canvas3d
    this.cushionModel = this.cushion(params.get("cushionModel"))
    this.spectator = params.has("spectator")
    this.first = params.has("first")
    this.roomProtocolV2 = params.get("roomVersion") === "2"
    this.roomCode = params.get("roomCode") ?? this.tableId
    this.roomInstanceId = params.get("roomInstance") ?? ""
    this.matchId = params.get("matchId") ?? ""
    this.rackNumber = Number.parseInt(params.get("rack") ?? "1") || 1
    this.botMode = params.has("bot")
    this.botName = params.get("bot") ?? ""
    this.practiceMode = params.has("practice")
      ? params.get("practice") !== "false"
      : this.ruletype !== "nineball"
    this.drillMode = params.has("drill")
    this.analysisMode = params.has("analysis")
    this.examMode = params.has("exam")
    this.speedrun = params.has("speedrun")
    this.localMesh = params.has("localmesh")
    this.localVersus = params.get("local") === "true" || params.has("hotseat")
    SnookerConfig.reds = Number.parseInt(params.get("reds") ?? "15") || 15
    ThreeCushionConfig.raceTo =
      Number.parseInt(params.get("raceTo") ?? "7") || 7
    console.log(
      `clientId: ${this.clientId} playername: ${this.playername} tableId: ${this.tableId} spectator: ${this.spectator} botMode: ${this.botMode} practiceMode: ${this.practiceMode} drillMode: ${this.drillMode}`
    )
    Session.init(
      this.clientId,
      this.playername,
      this.tableId,
      this.spectator,
      this.botMode,
      this.examMode,
      this.practiceMode,
      Number.parseInt(params.get("lod") ?? "2"),
      this.first,
      this.speedrun
    )
    if (this.localVersus) {
      Session.getInstance().enableLocalVersus(
        params.get("p1Name") ?? this.playername,
        params.get("p2Name") ?? "玩家二",
        params.get("p1Cue") ?? "heritage",
        params.get("p2Cue") ?? "jade"
      )
    }
    console.log(Session.getInstance())
    applyPhysicsParams(params)
  }

  cushion(model) {
    switch (model) {
      case "bounceHan":
        return bounceHan
      case "bounceHanBlend":
        return bounceHanBlend
      case "stronge": {
        return strongeAdapter
      }
      default:
        return mathavanAdapter
    }
  }

  private createContainer(scoreReporter: ScoreReporter) {
    // Analysis mode reuses the drill rules (no rings/popups); only its panel and
    // layout differ.
    const effectiveRuletype =
      (this.drillMode || this.analysisMode) && this.ruletype === "threecushion"
        ? "threecushion-drill"
        : this.ruletype
    const config: ContainerConfig = {
      element: this.canvas3d,
      log: console.log,
      assets: this.assets,
      ruletype: effectiveRuletype,
      keyboard: new Keyboard(this.canvas3d, { disabled: this.analysisMode }),
      id: this.playername,
      relay: this.messageRelay,
      messagingUrl: this.lobbyUrl ?? this.wss ?? undefined,
      scoreReporter: scoreReporter,
      replayMode: !!this.replay,
      botMode: this.botMode,
      isSinglePlayer: !this.wss && !this.botMode && !this.replay,
      examMode: this.examMode,
    }
    return new Container(config)
  }

  start() {
    // If replay state embeds a non-default tableSize and the URL doesn't have
    // one yet, add it and redirect so that TableGeometry, scaleTableModel, and
    // Camera all see the correct value from the start.
    if (this.replay) {
      try {
        const state = this.parse(this.replay)
        const stateTableSize = state.tableSize
        if (
          stateTableSize !== undefined &&
          stateTableSize !== 10 &&
          !new URLSearchParams(globalThis.location.search).has("tableSize")
        ) {
          const url = new URL(globalThis.location.href)
          url.searchParams.set("tableSize", String(stateTableSize))
          globalThis.location.href = url.toString()
          return
        }
      } catch {
        // If parsing fails, proceed normally
      }
    }

    this.assets = new Assets(this.ruletype)
    if (this.localMesh) {
      this.assets.createLocal()
      this.onAssetsReady()
    } else {
      this.assets.loadFromWeb(() => {
        this.onAssetsReady()
      })
    }
  }

  private initBotMode(scoreReporter: ScoreReporter) {
    this.container = this.createContainer(scoreReporter)
    this.container.init()
    const logs = new Logger()
    this.messageRelay = new BotRelay(logs, this.container)
    this.messageRelay.subscribe(this.tableId, (e) => {
      this.netEvent(e)
    })
    this.container.notify({
      type: "Info",
      title: this.ruletype,
      subtext: `Playing vs 🦞 ${this.botName}`,
      extra: "You first",
    } as const)
  }

  private initMultiplayer(scoreReporter: ScoreReporter) {
    this.messageRelay = new MessagingMessageRelay(this.wss ?? undefined)
    this.container = this.createContainer(scoreReporter)
    this.container.init()
  }

  onAssetsReady() {
    console.log(`${this.playername} assets ready`)
    const scoreReporter = new ScoreReporter()

    if (this.botMode) {
      this.initBotMode(scoreReporter)
    } else {
      this.initMultiplayer(scoreReporter)
    }

    this.container.broadcast = (e) => {
      this.broadcast(e)
    }
    this.container.table.cushionModel = this.cushionModel
    this.container.initialiseLocalMatch()
    if (this.roomProtocolV2) {
      this.restorePersistedRoomState()
      this.installRematchHandling()
      this.installRuleDecisionHandling()
    }
    this.container.onStableState = () => {
      this.flushStateSyncResponse()
      this.persistStableRoomState()
    }
    this.installConnectionMonitoring()
    if (this.analysisMode) {
      new AnalysisPanel(this.container)
    } else if (this.drillMode) {
      new DrillPanel(this.container)
    }
    this.setReplayLink()

    if (this.spectator) {
      this.container.eventQueue.push(new BeginEvent())
    } else {
      this.initGameLoop()
    }

    // trigger animation loops
    this.container.animate(performance.now())

    // Expose container for debugging/playwright verification
    globalThis.container = this.container
    ;(globalThis as any).breakBuilderDiagnostics = () =>
      this.container.diagnostics.snapshot()
  }

  private initGameLoop() {
    if (this.wss) {
      this.subscribeNetwork()
      this.broadcast(new RejoinEvent(this.connectionStream))
      if (this.roomProtocolV2) {
        this.sendRoomHello()
        if (this.restoredRoomState) {
          this.container.notifyLocal(
            {
              type: "Info",
              title: "正在恢复房间",
              subtext: "已载入本机局面，正在与对手核对最新状态",
            },
            0
          )
        } else if (
          new URLSearchParams(globalThis.location.search).has("rematch")
        ) {
          this.markRoomReady()
        } else {
          this.showRoomReadyPrompt()
        }
        return
      }
      if (!this.first) {
        this.broadcast(new BeginEvent())
      }
    }

    if (this.replay) {
      this.startReplay(this.replay)
    } else if (this.container.isSinglePlayer) {
      this.container.eventQueue.push(new BreakEvent())
    }
  }

  private subscribeNetwork() {
    this.messageRelay?.subscribe(this.tableId, (event) => this.netEvent(event))
  }

  private roomSettings(): RoomSettings {
    const params = new URLSearchParams(globalThis.location.search)
    return {
      ruleType: this.ruletype,
      tableSize: params.get("tableSize") ?? undefined,
      raceTo: params.get("raceTo") ?? undefined,
      physicalTable:
        params.get("tableStyle") ?? params.get("table") ?? undefined,
      targetScore:
        params.get("targetScore") ?? params.get("raceTo") ?? undefined,
      tournamentOptions: {
        nineBallPushOut: params.get("nineBallPushOut") !== "false",
        nineBallThreeFoul: params.get("nineBallThreeFoul") !== "false",
        nineBallBreakBox: params.get("nineBallBreakBox") === "true",
      },
    }
  }

  private sendRoomHello(): void {
    this.broadcast(
      new RoomControlEvent(this.first ? "CLAIM" : "JOIN", this.roomInstanceId, {
        hostClientId: this.first ? this.clientId : undefined,
        matchId: this.matchId,
        rackNumber: this.rackNumber,
        lifecycle: this.roomLifecycle,
        settings: this.first ? this.roomSettings() : undefined,
      })
    )
  }

  private showRoomReadyPrompt(): void {
    const role = this.first ? "房主" : "访客"
    this.container.notifyLocal(
      {
        type: "Info",
        title: `${role} · 房间 ${this.roomCode}`,
        subtext:
          "网络已连接 · 房主 1/1 · 访客等待加入 · 双方准备后开始，规则和物理球台由房主锁定",
        extra:
          '<button class="notification-btn" data-notification-action="room-ready">准备</button>' +
          '<button class="notification-btn" data-notification-action="copy-room">复制房间码</button>' +
          '<button class="notification-btn" data-notification-action="copy-room-link">复制邀请链接</button>',
      },
      0,
      {
        "room-ready": () => this.markRoomReady(),
        "copy-room": () => this.copyRoomText(this.roomCode, "房间码已复制"),
        "copy-room-link": () =>
          this.copyRoomText(this.currentRoomInviteUrl(), "邀请链接已复制"),
      }
    )
  }

  private copyRoomText(value: string, title: string): void {
    navigator.clipboard
      ?.writeText(value)
      .then(() => this.container.notifyLocal({ type: "Info", title }, 1200))
      .catch(() => {
        this.container.notifyLocal(
          { type: "Info", title: "复制失败", subtext: value },
          2600
        )
      })
  }

  private currentRoomInviteUrl(): string {
    const source = new URL(globalThis.location.href)
    const invite = new URL(source.pathname || "/", source.origin)
    invite.searchParams.set("join", this.roomCode)
    invite.searchParams.set("roomVersion", "2")
    invite.searchParams.set("rule", this.ruletype)
    invite.searchParams.set(
      "quality",
      source.searchParams.get("quality") ?? "balanced"
    )
    invite.searchParams.set("roomInstance", this.roomInstanceId)
    return invite.toString()
  }

  private markRoomReady(): void {
    this.roomLifecycle = "ready"
    this.readyClients.add(this.clientId)
    this.container.notifyLocal(
      {
        type: "Info",
        title: "已准备",
        subtext: "正在等待另一位玩家准备",
      },
      0
    )
    this.broadcast(
      new RoomControlEvent("READY", this.roomInstanceId, {
        matchId: this.matchId,
        rackNumber: this.rackNumber,
      })
    )
    this.startRoomWhenReady()
  }

  private startRoomWhenReady(): void {
    if (!this.first || this.readyClients.size < 2) return
    this.broadcast(
      new RoomControlEvent("START", this.roomInstanceId, {
        matchId: this.matchId,
        rackNumber: this.rackNumber,
        breakerClientId: this.clientId,
      })
    )
    this.startRoomMatch()
  }

  private startRoomMatch(): void {
    this.roomLifecycle = "playing"
    this.container.notification.clear()
    this.showVersusNotification(Session.getInstance())
    if (this.first && this.container.controller?.name === "Init") {
      this.container.eventQueue.push(new BeginEvent())
    }
  }

  private redirectToHostSettings(settings?: RoomSettings): boolean {
    if (!settings || this.first) return false
    const url = new URL(globalThis.location.href)
    let changed = settings.ruleType !== this.ruletype
    url.searchParams.set("ruletype", settings.ruleType)
    if (settings.tableSize) {
      changed ||= url.searchParams.get("tableSize") !== settings.tableSize
      url.searchParams.set("tableSize", settings.tableSize)
    } else url.searchParams.delete("tableSize")
    if (settings.raceTo) {
      changed ||= url.searchParams.get("raceTo") !== settings.raceTo
      url.searchParams.set("raceTo", settings.raceTo)
    } else url.searchParams.delete("raceTo")
    if (settings.physicalTable) {
      changed ||= url.searchParams.get("tableStyle") !== settings.physicalTable
      url.searchParams.set("tableStyle", settings.physicalTable)
    }
    if (settings.targetScore) {
      changed ||= url.searchParams.get("targetScore") !== settings.targetScore
      url.searchParams.set("targetScore", settings.targetScore)
    }
    for (const [name, enabled] of Object.entries(
      settings.tournamentOptions ?? {}
    )) {
      changed ||= url.searchParams.get(name) !== String(enabled)
      url.searchParams.set(name, String(enabled))
    }
    if (changed) globalThis.location.replace(url.toString())
    return changed
  }

  private handleRoomControl(event: RoomControlEvent): void {
    if (
      event.action === "HELLO" ||
      event.action === "CLAIM" ||
      event.action === "JOIN"
    ) {
      this.handleRoomHello(event)
      return
    }
    if (event.action === "REJECT") {
      if (event.payload.targetClientId !== this.clientId) return
      this.container.notifyLocal(
        {
          type: "Foul",
          title: "无法加入房间",
          subtext: event.payload.reason ?? "房间已满或比赛已经开始",
          extra: '<a class="notification-btn" href="/">返回首页</a>',
        },
        0
      )
      return
    }
    if (
      event.roomInstanceId &&
      this.roomInstanceId &&
      event.roomInstanceId !== this.roomInstanceId
    ) {
      console.warn("Ignored control message from another room instance")
      return
    }
    switch (event.action) {
      case "READY":
        this.handleRoomReady(event)
        break
      case "START":
        this.startRoomMatch()
        break
      case "REMATCH_OFFER":
      case "REMATCH_ACCEPT":
      case "REMATCH_DECLINE":
      case "MATCH_RESET":
        this.handleRematchControl(event)
        break
    }
  }

  private handleRoomHello(event: RoomControlEvent): void {
    if (event.action === "JOIN" && this.first) {
      this.sendRoomHello()
      return
    }
    if (!event.payload.hostClientId || this.first) return
    if (this.redirectToHostSettings(event.payload.settings)) return
    this.roomInstanceId = event.roomInstanceId || this.roomInstanceId
    this.matchId = event.payload.matchId || this.matchId
    this.rackNumber = event.payload.rackNumber || this.rackNumber
    this.roomLifecycle = event.payload.lifecycle ?? "waiting"
  }

  private handleRoomReady(event: RoomControlEvent): void {
    if (!event.clientId) return
    this.readyClients.add(event.clientId)
    this.startRoomWhenReady()
  }

  private handleRematchControl(event: RoomControlEvent): void {
    if (event.action === "REMATCH_DECLINE") {
      this.cancelRematch("对手暂不再来一局")
      return
    }
    if (event.action === "MATCH_RESET") {
      this.applyMatchReset(event)
      return
    }
    if (!event.clientId) return
    this.rematchClients.add(event.clientId)
    if (
      event.action === "REMATCH_ACCEPT" ||
      this.rematchClients.has(this.clientId)
    ) {
      this.startRematchWhenAccepted()
    } else {
      this.showRematchOffer()
    }
  }

  private restorePersistedRoomState(): void {
    const state = loadRoomState(this.tableId, this.clientId)
    if (!state) return
    if (this.roomInstanceId && state.roomInstanceId !== this.roomInstanceId)
      return
    this.roomInstanceId = state.roomInstanceId
    this.matchId = state.matchId
    this.rackNumber = state.rackNumber
    this.roomRevision = state.revision
    const next = this.container.applyRejoinSnapshot(state.snapshot)
    this.container.updateController(next)
    for (const serialised of state.journal) {
      try {
        this.container.eventQueue.push(EventUtil.fromSerialised(serialised))
      } catch {
        console.warn("Ignored invalid persisted room event")
      }
    }
    this.restoredRoomState = true
  }

  private snapshotHash(snapshot: RejoinSnapshot): string {
    const value = JSON.stringify([
      snapshot.table,
      snapshot.scores,
      snapshot.ruleState,
    ])
    let hash = 5381
    for (let index = 0; index < value.length; index++) {
      hash = (hash * 33) ^ value.charCodeAt(index)
    }
    return (hash >>> 0).toString(16).padStart(8, "0")
  }

  private decorateRoomSnapshot(snapshot: RejoinSnapshot): RejoinSnapshot {
    const decorated: RejoinSnapshot = {
      ...snapshot,
      version: 2,
      roomInstanceId: this.roomInstanceId,
      matchId: this.matchId,
      rackNumber: this.rackNumber,
      revision: this.roomRevision,
      winnerClientId: Session.getInstance().lastWinnerClientId,
      breakerClientId: this.first
        ? this.clientId
        : Session.getInstance().opponentClientId,
    }
    decorated.stateHash = this.snapshotHash(decorated)
    return decorated
  }

  private persistStableRoomState(): void {
    if (!this.roomProtocolV2 || !this.roomInstanceId) return
    const snapshot = this.container.createRejoinSnapshot()
    if (!snapshot) return
    saveRoomState({
      version: 2,
      tableId: this.tableId,
      clientId: this.clientId,
      roomInstanceId: this.roomInstanceId,
      matchId: this.matchId,
      rackNumber: this.rackNumber,
      revision: this.roomRevision,
      savedAt: Date.now(),
      snapshot: this.decorateRoomSnapshot(snapshot),
      journal: [],
    })
  }

  private installRematchHandling(): void {
    globalThis.addEventListener("break-builder-rematch", () => {
      this.requestRematch()
    })
  }

  private installRuleDecisionHandling(): void {
    globalThis.addEventListener("break-builder-rule-decision", (rawEvent) => {
      const event = rawEvent as CustomEvent<{
        decision?: string
        value?: string
      }>
      if (!event.detail?.decision) return
      const decision = new RuleDecisionEvent(
        event.detail.decision,
        event.detail.value ?? ""
      )
      this.container.eventQueue.push(decision)
      this.broadcast(decision)
      this.container.notification.clear()
    })
  }

  private requestRematch(): void {
    if (!this.roomProtocolV2 || !Session.getInstance().opponentClientId) return
    this.rematchClients.add(this.clientId)
    this.broadcast(
      new RoomControlEvent("REMATCH_OFFER", this.roomInstanceId, {
        matchId: this.matchId,
        rackNumber: this.rackNumber,
        winnerClientId: Session.getInstance().lastWinnerClientId,
      })
    )
    this.container.notifyLocal(
      {
        type: "Info",
        title: "已邀请再来一局",
        subtext: "等待对手在 30 秒内确认",
        extra:
          '<button class="notification-btn" data-notification-action="rematch-cancel">取消</button>',
      },
      0,
      { "rematch-cancel": () => this.declineRematch() }
    )
    if (this.rematchTimeout) globalThis.clearTimeout(this.rematchTimeout)
    this.rematchTimeout = globalThis.setTimeout(
      () => this.cancelRematch("再来一局邀请已超时"),
      30_000
    )
  }

  private showRematchOffer(): void {
    this.container.notifyLocal(
      {
        type: "Info",
        title: "对手邀请再来一局",
        subtext: "双方同意后由上一局胜者开球",
        extra:
          '<button class="notification-btn" data-notification-action="rematch-accept">同意</button>' +
          '<button class="notification-btn" data-notification-action="rematch-decline">拒绝</button>',
      },
      0,
      {
        "rematch-accept": () => this.acceptRematch(),
        "rematch-decline": () => this.declineRematch(),
      }
    )
  }

  private acceptRematch(): void {
    this.rematchClients.add(this.clientId)
    this.broadcast(
      new RoomControlEvent("REMATCH_ACCEPT", this.roomInstanceId, {
        matchId: this.matchId,
        rackNumber: this.rackNumber,
        winnerClientId: Session.getInstance().lastWinnerClientId,
      })
    )
    this.container.notifyLocal(
      { type: "Info", title: "已同意", subtext: "正在开始下一局" },
      0
    )
    this.startRematchWhenAccepted()
  }

  private declineRematch(): void {
    this.broadcast(
      new RoomControlEvent("REMATCH_DECLINE", this.roomInstanceId, {
        matchId: this.matchId,
        rackNumber: this.rackNumber,
      })
    )
    this.cancelRematch("已取消再来一局")
  }

  private cancelRematch(message: string): void {
    if (this.rematchTimeout) globalThis.clearTimeout(this.rematchTimeout)
    this.rematchTimeout = undefined
    this.rematchClients.clear()
    this.container.notifyLocal({ type: "Info", title: message }, 1800)
  }

  private startRematchWhenAccepted(): void {
    if (!this.first || this.rematchClients.size < 2) return
    const winnerClientId =
      Session.getInstance().lastWinnerClientId ?? this.clientId
    const reset = new RoomControlEvent("MATCH_RESET", this.roomInstanceId, {
      matchId: globalThis.crypto?.randomUUID?.() ?? `match-${getUID()}`,
      rackNumber: this.rackNumber + 1,
      winnerClientId,
      breakerClientId: winnerClientId,
    })
    this.broadcast(reset)
    this.applyMatchReset(reset)
  }

  private applyMatchReset(event: RoomControlEvent): void {
    const breakerClientId = event.payload.breakerClientId
    const url = new URL(globalThis.location.href)
    url.searchParams.set(
      "matchId",
      event.payload.matchId ?? `match-${getUID()}`
    )
    url.searchParams.set(
      "rack",
      String(event.payload.rackNumber ?? this.rackNumber + 1)
    )
    url.searchParams.set("rematch", "1")
    if (breakerClientId === this.clientId) url.searchParams.set("first", "true")
    else url.searchParams.delete("first")
    clearRoomState(this.tableId, this.clientId)
    globalThis.location.replace(url.toString())
  }

  private installConnectionMonitoring() {
    if (!this.wss || typeof globalThis.addEventListener !== "function") return
    globalThis.addEventListener("offline", () => {
      this.connectionState = "offline"
      this.container.notifyLocal(
        {
          type: "Info",
          title: "网络已断开",
          subtext: "比赛已保留，恢复网络后会自动同步球台",
        },
        0
      )
    })
    globalThis.addEventListener("online", () => {
      this.connectionState = "reconnecting"
      this.container.notifyLocal(
        {
          type: "Info",
          title: "正在重新连接",
          subtext: "等待对手返回最新球位、比分与轮次",
        },
        0
      )
      this.subscribeNetwork()
      this.broadcast(new RejoinEvent(this.connectionStream))
    })
  }

  private parseNetworkEvent(message: string): GameEvent | undefined {
    try {
      return EventUtil.fromSerialised(message)
    } catch (error) {
      console.warn("Ignored malformed room message", error)
      return undefined
    }
  }

  private shouldIgnoreNetworkEvent(event: GameEvent, session: Session) {
    if (event.clientId === session.clientId) return true
    if (
      !this.spectator &&
      event.clientId &&
      session.opponentClientId &&
      session.opponentClientId !== event.clientId
    ) {
      if (
        this.first &&
        event instanceof RoomControlEvent &&
        event.action === "JOIN"
      ) {
        this.broadcast(
          new RoomControlEvent("REJECT", this.roomInstanceId, {
            targetClientId: event.clientId,
            reason:
              this.roomLifecycle === "playing"
                ? "比赛已经开始"
                : "房间已有两名玩家",
            lifecycle: this.roomLifecycle,
          })
        )
      }
      console.warn("Ignored message from an extra room participant")
      return true
    }
    if (!this.receivedSequences.accept(event.sequence)) {
      return true
    }
    if (this.isRemoteTurnViolation(event)) {
      console.warn(`Ignored out-of-turn ${event.type} event`)
      return true
    }
    return false
  }

  private bindOpponent(event: GameEvent, session: Session) {
    if (event.clientId) {
      session.setOpponentClientId(event.clientId)
    }
    if (event.playername) {
      session.opponentName = event.playername
    }
  }

  private showVersusNotification(session: Session) {
    if (
      session.vsNotificationShown ||
      this.botMode ||
      this.spectator ||
      !session.playername ||
      !session.opponentName
    ) {
      return
    }
    const names = session.orderedNamesForHud()
    if (!names.p1Name || !names.p2Name) return
    this.container.notifyLocal({
      type: "Info",
      title: `${this.ruletype}, ${names.p1Name} vs ${names.p2Name}`,
      extra:
        this.ruletype === "threecushion"
          ? `Race to: ${ThreeCushionConfig.raceTo}`
          : undefined,
    })
    session.vsNotificationShown = true
  }

  netEvent(message: string) {
    const event = this.parseNetworkEvent(message)
    if (!event) return
    const session = Session.getInstance()
    if (this.shouldIgnoreNetworkEvent(event, session)) return
    this.markNetworkConnected()

    const showMatchIdentity =
      !this.roomProtocolV2 || this.roomLifecycle === "playing"
    if (showMatchIdentity && !session.vsNotificationShown) {
      this.container.notification.clear()
    }
    this.bindOpponent(event, session)
    if (showMatchIdentity) this.showVersusNotification(session)

    if (event instanceof RoomControlEvent) {
      this.handleRoomControl(event)
      return
    }

    if (event instanceof RejoinEvent && !event.snapshot) {
      this.pendingStateSyncResponse = true
      this.flushStateSyncResponse()
      return
    }
    if (event instanceof RejoinEvent && event.snapshot) {
      if (!this.acceptRejoinSnapshot(event.snapshot)) return
    } else if (this.isRoomGameplayEvent(event)) {
      this.roomRevision++
      appendRoomJournal(this.tableId, this.clientId, message)
    }
    this.container.eventQueue.push(event)
  }

  private markNetworkConnected(): void {
    if (this.connectionState !== "reconnecting") return
    this.connectionState = "connected"
    this.container.notifyLocal(
      {
        type: "Info",
        title: "连接已恢复",
        subtext: "正在核对双方局面",
      },
      1800
    )
  }

  private acceptRejoinSnapshot(snapshot: RejoinSnapshot): boolean {
    if (!this.roomProtocolV2) return true
    if (
      snapshot.roomInstanceId &&
      this.roomInstanceId &&
      snapshot.roomInstanceId !== this.roomInstanceId
    ) {
      return false
    }
    const snapshotRack = snapshot.rackNumber ?? 0
    const olderRack = snapshotRack < this.rackNumber
    const olderRevision =
      snapshotRack === this.rackNumber &&
      (snapshot.revision ?? 0) < this.roomRevision
    if (olderRack || olderRevision) return false
    this.roomInstanceId = snapshot.roomInstanceId ?? this.roomInstanceId
    this.matchId = snapshot.matchId ?? this.matchId
    this.rackNumber = snapshot.rackNumber ?? this.rackNumber
    this.roomRevision = snapshot.revision ?? this.roomRevision
    return true
  }

  private isRoomGameplayEvent(event: GameEvent): boolean {
    return (
      this.roomProtocolV2 &&
      event.type !== EventType.ROOM_CONTROL &&
      event.type !== EventType.REJOIN
    )
  }

  private isRemoteTurnViolation(event: GameEvent): boolean {
    if (event.type !== EventType.AIM && event.type !== EventType.HIT) {
      return false
    }
    return ["Aim", "PlaceBall", "PlayShot"].includes(
      this.container.controller?.name
    )
  }

  private flushStateSyncResponse() {
    if (!this.pendingStateSyncResponse || !this.messageRelay) return
    const snapshot = this.container.createRejoinSnapshot()
    if (!snapshot) return
    this.pendingStateSyncResponse = false
    this.broadcast(
      new RejoinEvent(
        this.connectionStream,
        "",
        this.roomProtocolV2 ? this.decorateRoomSnapshot(snapshot) : snapshot
      )
    )
  }

  broadcast(event: GameEvent) {
    if (this.messageRelay) {
      event.clientId = Session.getInstance().clientId
      event.playername = Session.getInstance().playername
      event.sequence = `${this.connectionStream}:${++this.outgoingSequence}`
      if (this.isRoomGameplayEvent(event)) {
        this.roomRevision++
        appendRoomJournal(
          this.tableId,
          this.clientId,
          EventUtil.serialise(event)
        )
      }
      //      logNetEvent(this.playername, event, "broadcast")
      this.messageRelay.publish(this.tableId, EventUtil.serialise(event))
    }
  }

  setReplayLink() {
    const url = globalThis.location.href.split("?")[0]
    const prefix = `${url}?ruletype=${this.ruletype}&state=`
    this.container.linkFormatter.replayUrl = prefix
  }

  startReplay(replay) {
    this.breakState = this.parse(replay)
    const session = Session.getInstance()
    if (this.breakState.players) {
      session.playername = this.breakState.players.player1
      session.opponentName = this.breakState.players.player2
    }
    if (
      this.breakState.tableSize !== undefined &&
      this.breakState.tableSize !== 10
    ) {
      TableConfig.apply(this.ruletype, this.breakState.tableSize)
    }
    const orderedScores = session.orderedScoresForHud()
    this.container.updateScoreHud(orderedScores.p1, orderedScores.p2, 0, 0)
    const breakEvent = new BreakEvent(
      this.breakState.init,
      this.breakState.shots
    )
    this.container.eventQueue.push(breakEvent)
  }

  parse(s) {
    try {
      return JSON.parse(s)
    } catch {
      return JSON.parse(JSONCrush.uncrush(s))
    }
  }

  offerUpload() {
    this.container.chat.showMessage(
      `<a class="pill" target="_blank" href="https://scoreboard-tailuge.vercel.app/hiscore.html${location.search}"> upload high score 🏆</a`
    )
  }
}
