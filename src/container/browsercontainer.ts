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
import { RejoinEvent } from "../events/rejoinevent"
import { EventType } from "../events/eventtype"

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
  private readonly seenSequences = new Set<string>()
  private readonly sequenceOrder: string[] = []
  private pendingStateSyncResponse = false
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
    this.container.onStableState = () => this.flushStateSyncResponse()
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
  }

  private initGameLoop() {
    if (this.wss) {
      this.messageRelay?.subscribe(this.tableId, (e) => {
        this.netEvent(e)
      })
      this.broadcast(new RejoinEvent(this.connectionStream))
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
      console.warn("Ignored message from an extra room participant")
      return true
    }
    if (event.sequence && !this.rememberSequence(event.sequence)) {
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

    if (!session.vsNotificationShown) {
      this.container.notification.clear()
    }
    this.bindOpponent(event, session)
    this.showVersusNotification(session)

    if (event instanceof RejoinEvent && !event.snapshot) {
      this.pendingStateSyncResponse = true
      this.flushStateSyncResponse()
      return
    }
    this.container.eventQueue.push(event)
  }

  private rememberSequence(sequence: string): boolean {
    if (this.seenSequences.has(sequence)) return false
    this.seenSequences.add(sequence)
    this.sequenceOrder.push(sequence)
    if (this.sequenceOrder.length > 512) {
      const oldest = this.sequenceOrder.shift()
      if (oldest) this.seenSequences.delete(oldest)
    }
    return true
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
    this.broadcast(new RejoinEvent(this.connectionStream, "", snapshot))
  }

  broadcast(event: GameEvent) {
    if (this.messageRelay) {
      event.clientId = Session.getInstance().clientId
      event.playername = Session.getInstance().playername
      event.sequence = `${this.connectionStream}:${++this.outgoingSequence}`
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
