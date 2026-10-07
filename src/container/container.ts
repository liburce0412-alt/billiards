import { Input } from "../events/input"
import { GameEvent } from "../events/gameevent"
import { Session } from "../network/client/session"
import { StationaryEvent } from "../events/stationaryevent"
import { Table } from "../model/table"
import { View } from "../view/view"
import { Init } from "../controller/init"
import { AimInputs } from "../view/dom/aiminputs"
import { Keyboard } from "../events/keyboard"
import { Sound } from "../view/sound"
import { Chat } from "../view/chat"
import { ChatEvent } from "../events/chatevent"
import { Throttle } from "../events/throttle"
import { Sliders } from "../view/sliders"
import { Recorder } from "../events/recorder"
import { LinkFormatter } from "../view/link-formatter"
import { Rules } from "../controller/rules/rules"
import { RuleFactory } from "../controller/rules/rulefactory"
import { ThreeCushionConfig } from "../utils/threecushionconfig"
import { Menu } from "../view/menu"
import { Comment } from "../view/comment"
import {
  Hud,
  HudConnectionState,
  HudPlayerKind,
  MatchHudPresentation,
} from "../view/hud"
import { NotificationEvent } from "../events/notificationevent"
import { LobbyIndicator } from "../view/lobbyindicator"
import { MessageRelay } from "../network/client/messagerelay"
import { ScoreReporter } from "../network/client/scorereporter"
import {
  Notification,
  NotificationData,
  NotificationActionHandlers,
} from "../view/notification"
import { ScoreEvent } from "../events/scoreevent"
import { ContainerConfig } from "./containerconfig"
import { Controller } from "../controller/controller"
import { ParticleSystem } from "../view/particle-system"
import { End } from "../controller/end"
import { Replay } from "../controller/replay"
import { Aim } from "../controller/aim"
import { PlaceBall } from "../controller/placeball"
import { PlayShot } from "../controller/playshot"
import { WatchAim } from "../controller/watchaim"
import { WatchShot } from "../controller/watchshot"
import { BallTray } from "../view/ball-tray"
import { ExportUtils } from "../utils/export-utils"
import { FixedStepAccumulator } from "../utils/fixedstep"
import { RejoinSnapshot } from "../events/rejoinevent"
import { MotionWatchdog, RuntimeDiagnostics } from "../utils/runtimediagnostics"
import { ShotPhysicsDiagnostics } from "../model/physics/shotdiagnostics"

type ActivePlayer = 0 | 1 | 2

function flipPlayerType(type: number): number {
  if (type === 1) return 2
  if (type === 2) return 1
  return 0
}

/**
 * Model, View, Controller container.
 */
export class Container {
  table: Table
  particles: ParticleSystem
  view: View
  controller: Controller
  inputQueue: Input[] = []
  eventQueue: GameEvent[] = []
  keyboard?: Keyboard
  sound: Sound
  chat: Chat
  sliders: Sliders
  recorder: Recorder
  linkFormatter: LinkFormatter
  ballTray: BallTray
  id: string
  isSinglePlayer: boolean = true
  rules: Rules
  menu: Menu
  comment: Comment
  hud: Hud
  notification: Notification
  lobbyIndicator: LobbyIndicator
  replayMode: boolean = false
  examMode: boolean = false
  relay: MessageRelay | null = null
  scoreReporter: ScoreReporter | null = null
  onStableState?: () => void
  cameraModeOverride?: () => void
  frame: (timestamp: number) => void
  /** Multiplier applied to real elapsed time before it's converted to physics
   * steps in `advance()`. 1 everywhere except the shot-analysis view, which
   * sets this higher so shot playback feels snappier without changing the
   * fixed physics step (`this.step`) and therefore without affecting
   * simulation accuracy. */
  timeScale = 1

  private hudScores = {
    p1: 0,
    p2: 0,
  }
  private hudActivePlayer: ActivePlayer = 0
  private hudContext: {
    ruleLabel: string
    targetLabel?: string
    playerAvatarUrl?: string | null
    opponentAvatarUrl?: string | null
    playerKind: HudPlayerKind
    opponentKind: HudPlayerKind
    playerDetail?: string
    opponentDetail?: string
    connection: HudConnectionState
  }
  private wasReplay: boolean = false
  private readonly motionWatchdog = new MotionWatchdog()
  readonly diagnostics = new RuntimeDiagnostics()
  readonly shotDiagnostics = new ShotPhysicsDiagnostics()
  manualShotCount = 0

  lastShotInit?: string
  lastShotData?: string

  last = performance.now()
  readonly step = 0.001953125 * 1
  private readonly fixedStep = new FixedStepAccumulator(
    this.step,
    Number.POSITIVE_INFINITY
  )
  private animationFrame?: number
  private disposed = false

  broadcast: (event: GameEvent) => void = () => {}
  log: (text: string) => void

  constructor(config: ContainerConfig) {
    const {
      element,
      log,
      assets,
      ruletype,
      keyboard,
      id,
      relay = null,
      scoreReporter = null,
      replayMode = false,
      isSinglePlayer = true,
    } = config
    this.log = log
    this.replayMode = replayMode
    this.examMode = config.examMode ?? false
    this.isSinglePlayer = isSinglePlayer
    this.rules = RuleFactory.create(ruletype, this)
    this.hudContext = {
      ruleLabel: this.ruleLabel(ruletype ?? "nineball"),
      playerKind: "human",
      opponentKind: "human",
      connection: isSinglePlayer ? "local" : "connected",
    }
    this.table = this.rules.table()
    this.view = new View(element, this.table, assets)
    this.view.onCameraInteraction = () => {
      this.lastEventTime = performance.now()
    }
    this.table.cue.aimInputs = new AimInputs(this)
    if (keyboard) {
      this.keyboard = keyboard
      this.view.onPrimaryTouchDrag = (dx, dy) => {
        const twoAxis =
          this.controller?.name === "PlaceBall" ||
          this.controller?.name === "PlaceAllBalls"
        keyboard.touchmove(dx, dy, twoAxis)
        if (!twoAxis && Math.abs(dy) > 0) {
          this.view.camera.adjustTouchPitch(dy)
          this.lastEventTime = performance.now()
        }
      }
    }
    this.sound = assets.sound
    this.chat = new Chat(this.sendChat)
    this.sliders = new Sliders()
    this.linkFormatter = new LinkFormatter(this)
    this.ballTray = new BallTray(this)
    this.recorder = new Recorder(this, this.linkFormatter)
    this.id = id ?? ""
    this.menu = new Menu(this)
    this.comment = new Comment(this)
    this.table.addToScene(this.view.scene)
    this.view.warmup()
    this.view.onLineDrawn = (line) => {
      this.sendEvent(new ChatEvent(this.id, "", line))
    }
    const tableSize = parseFloat(
      new URLSearchParams(globalThis.location?.search ?? "").get("tableSize") ||
        "10"
    )
    this.particles = new ParticleSystem({ tableSize })
    this.hud = new Hud()
    this.notification = new Notification()
    this.view.onContextLost = () => {
      this.diagnostics.recordContextLoss()
      this.notifyLocal(
        {
          type: "Info",
          title: "3D 画面正在恢复",
          subtext: "显卡上下文已暂停，比赛状态不会丢失",
        },
        0
      )
    }
    this.view.onContextRestored = () => {
      this.notifyLocal(
        {
          type: "Info",
          title: "3D 画面已恢复",
          subtext: "材质与阴影已重新预热",
        },
        2200
      )
    }
    this.relay = relay
    this.scoreReporter = scoreReporter
    this.lobbyIndicator = new LobbyIndicator(
      Session.getInstance().botMode,
      this.replayMode,
      this.rules,
      (msg) => this.chat.showMessage(msg),
      config.messagingUrl,
      (url) => this.menu.showOverlay(url)
    )
    this.updateController(new Init(this))
    //  this.updateController(new End(this))
  }

  init() {
    if (location.port !== "8081" && this.lobbyIndicator) {
      this.lobbyIndicator.init()
    }
  }

  sendChat = (msg) => {
    const text = String(msg ?? "")
      .trim()
      .slice(0, 240)
    if (!text) return
    const session = Session.getInstance()
    const clientMessageId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`
    const createdAt = Date.now()
    this.chat.showMessage({
      id: clientMessageId,
      senderId: session.clientId,
      senderName: session.playername || "我",
      body: text,
      createdAt,
      isMine: true,
    })
    this.sendEvent(
      new ChatEvent(this.id, text, undefined, {
        senderName: session.playername,
        clientMessageId,
        createdAt,
      })
    )
  }

  throttle = new Throttle(250, (event) => {
    this.broadcast(event)
  })

  sendEvent(event) {
    this.recorder.record(event)
    this.throttle.send(event)
  }

  sendAimPreview() {
    if (this.controller instanceof Aim) {
      this.sendEvent(this.table.cue.aim.copy())
    }
  }

  private myHudSlot(): 1 | 2 {
    return Session.getInstance().playerIndex === 1 ? 2 : 1
  }

  private opponentHudSlot(): 1 | 2 {
    return this.myHudSlot() === 1 ? 2 : 1
  }

  inferActivePlayer(controller: Controller = this.controller): ActivePlayer {
    if (
      controller instanceof Aim ||
      controller instanceof PlaceBall ||
      controller instanceof PlayShot
    ) {
      return this.myHudSlot()
    }
    if (controller instanceof WatchAim || controller instanceof WatchShot) {
      return this.opponentHudSlot()
    }
    return 0
  }

  setHudActivePlayer(active: ActivePlayer) {
    this.hudActivePlayer = active
    this.hud.setActivePlayer(active)
    this.view?.robotPlayers?.setActivePlayer(active)
  }

  private ruleLabel(ruleType: string): string {
    return (
      {
        eightball: "八球",
        nineball: "九球",
        fourball: "四球追分",
        snooker: "斯诺克",
        threecushion: "三库",
        sagu: "四球",
        "threecushion-drill": "三库训练",
      }[ruleType] ?? "比赛"
    )
  }

  setHudContext(context: Partial<Container["hudContext"]>) {
    this.hudContext = { ...this.hudContext, ...context }
    this.updateScoreHud(
      this.hudScores.p1,
      this.hudScores.p2,
      Session.getInstance().currentBreak,
      this.hudActivePlayer
    )
  }

  setHudConnectionState(connection: HudConnectionState) {
    if (this.hudContext.connection === connection) return
    this.setHudContext({ connection })
  }

  private hudPresentation(
    p1: number,
    p2: number,
    names: { p1Name?: string; p2Name?: string },
    b: number,
    p1Star: boolean,
    p2Star: boolean,
    active: ActivePlayer
  ): MatchHudPresentation {
    const session = Session.getInstance()
    const mySlot = session.playerIndex === 1 ? 2 : 1
    const firstIsMe = mySlot === 1
    const playerDetail = this.hudContext.playerDetail
    const opponentDetail = this.hudContext.opponentDetail
    const connection = this.hudContext.connection
    let playerOneConnection: HudConnectionState = connection
    if (!firstIsMe && this.hudContext.opponentKind === "ai") {
      playerOneConnection = "local"
    }
    const playerTwoKind = firstIsMe
      ? this.hudContext.opponentKind
      : this.hudContext.playerKind
    let playerTwoConnection: HudConnectionState = connection
    if (playerTwoKind === "ai") playerTwoConnection = "local"
    return {
      playerOne: {
        name: names.p1Name ?? "玩家一",
        score: p1,
        avatarUrl: firstIsMe
          ? this.hudContext.playerAvatarUrl
          : this.hudContext.opponentAvatarUrl,
        kind: firstIsMe
          ? this.hudContext.playerKind
          : this.hudContext.opponentKind,
        detail: firstIsMe ? playerDetail : opponentDetail,
        connection: playerOneConnection,
        scoreStar: p1Star ? "after" : undefined,
      },
      playerTwo: {
        name: names.p2Name ?? "玩家二",
        score: p2,
        avatarUrl: firstIsMe
          ? this.hudContext.opponentAvatarUrl
          : this.hudContext.playerAvatarUrl,
        kind: firstIsMe
          ? this.hudContext.opponentKind
          : this.hudContext.playerKind,
        detail: firstIsMe ? opponentDetail : playerDetail,
        connection: playerTwoConnection,
        scoreStar: p2Star ? "before" : undefined,
      },
      ruleLabel: this.hudContext.ruleLabel,
      targetLabel: this.hudContext.targetLabel,
      turnLabel: active ? "当前回合" : "等待开球",
      activePlayer: active,
      breakScore: b,
    }
  }

  initialiseLocalMatch() {
    if (!Session.isLocalVersusMode()) return
    const session = Session.getInstance()
    const cueStyle = session.activeLocalCueStyle()
    if (cueStyle) {
      this.table.cue.setStyle(cueStyle, false)
    }
    const scores = session.orderedScoresForHud()
    this.updateScoreHud(
      scores.p1,
      scores.p2,
      session.currentBreak,
      (session.playerIndex + 1) as 1 | 2
    )
    this.notifyLocal({
      type: "Info",
      title: `轮到 ${session.activeLocalPlayerName()}`,
      subtext: "同一设备双人对战",
      extra: "请确认球杆后击球",
    })
  }

  switchLocalPlayer() {
    if (!Session.isLocalVersusMode()) return
    const session = Session.getInstance()
    session.switchLocalPlayer()
    const cueStyle = session.activeLocalCueStyle()
    if (cueStyle) {
      this.table.cue.setStyle(cueStyle, false)
    }
    const scores = session.orderedScoresForHud()
    this.updateScoreHud(
      scores.p1,
      scores.p2,
      session.currentBreak,
      (session.playerIndex + 1) as 1 | 2
    )
    this.notifyLocal(
      {
        type: "Info",
        title: `轮到 ${session.activeLocalPlayerName()}`,
        subtext: "请将设备交给下一位玩家",
      },
      1800
    )
  }

  repositionCueBall() {
    this.inputQueue.length = 0
    this.updateController(new PlaceBall(this, this.table.cueball.pos.clone()))
  }

  private rejoinControllerState(
    session: Session
  ): { phase: RejoinSnapshot["phase"]; activeClientId?: string } | undefined {
    if (this.controller instanceof PlaceBall) {
      return { phase: "place-ball", activeClientId: session.clientId }
    }
    if (this.controller instanceof Aim) {
      return { phase: "aim", activeClientId: session.clientId }
    }
    if (this.controller instanceof WatchAim) {
      return { phase: "aim", activeClientId: session.opponentClientId }
    }
    if (this.controller instanceof End) {
      return { phase: "end" }
    }
    return undefined
  }

  createRejoinSnapshot(): RejoinSnapshot | undefined {
    const session = Session.getInstance()
    const controllerState = this.rejoinControllerState(session)
    if (!controllerState) return undefined

    const scores = session.orderedScoresForHud()
    const names = session.orderedNamesForHud()
    const p1ClientId =
      session.playerIndex === 0
        ? session.clientId
        : session.opponentClientId || "opponent"
    const p1type =
      session.playerIndex === 0
        ? session.p1type
        : flipPlayerType(session.p1type)

    return {
      table: this.table.serialise(),
      scores: {
        p1: scores.p1,
        p2: scores.p2,
        breakScore: session.currentBreak,
      },
      p1ClientId,
      p1Name: names.p1Name,
      p2Name: names.p2Name,
      activeClientId: controllerState.activeClientId,
      phase: controllerState.phase,
      p1type,
      currentBreak: this.rules.currentBreak,
      previousBreak: this.rules.previousBreak,
      ruleState: this.rules.serialiseState?.(),
    }
  }

  private restoreRejoinSession(
    session: Session,
    snapshot: RejoinSnapshot
  ): void {
    session.playerIndex = snapshot.p1ClientId === session.clientId ? 0 : 1
    if (session.playerIndex === 0) {
      session.playername = snapshot.p1Name || session.playername
      session.opponentName = snapshot.p2Name || session.opponentName
    } else {
      session.playername = snapshot.p2Name || session.playername
      session.opponentName = snapshot.p1Name || session.opponentName
    }
    session.p1type =
      session.playerIndex === 0
        ? snapshot.p1type
        : flipPlayerType(snapshot.p1type)
  }

  private restoreRejoinCueBall(session: Session): void {
    this.rules.cueball = this.table.balls[0]
    const separateCueBalls =
      this.rules.rulename === "threecushion" || this.rules.rulename === "sagu"
    if (separateCueBalls && session.playerIndex === 1) {
      this.rules.secondToPlay()
    }
    this.table.cueball = this.rules.cueball
  }

  private rejoinActivePlayer(snapshot: RejoinSnapshot): ActivePlayer {
    if (!snapshot.activeClientId) return 0
    return snapshot.activeClientId === snapshot.p1ClientId ? 1 : 2
  }

  private controllerForRejoin(
    session: Session,
    snapshot: RejoinSnapshot
  ): Controller {
    if (snapshot.phase === "end") return new End(this)
    if (snapshot.activeClientId !== session.clientId) {
      return new WatchAim(this)
    }
    return snapshot.phase === "place-ball"
      ? new PlaceBall(this, this.table.cueball.pos.clone())
      : new Aim(this)
  }

  applyRejoinSnapshot(snapshot: RejoinSnapshot): Controller {
    const session = Session.getInstance()
    this.restoreRejoinSession(session, snapshot)
    this.table.updateFromSerialised(snapshot.table)
    this.rules.currentBreak = snapshot.currentBreak
    this.rules.previousBreak = snapshot.previousBreak
    this.rules.restoreState?.(snapshot.ruleState)

    this.restoreRejoinCueBall(session)

    this.updateScoreHud(
      snapshot.scores.p1,
      snapshot.scores.p2,
      snapshot.scores.breakScore,
      this.rejoinActivePlayer(snapshot)
    )
    this.notifyLocal(
      {
        type: "Info",
        title: "连接已恢复",
        subtext: "球台、比分与当前轮次已同步",
      },
      1800
    )

    return this.controllerForRejoin(session, snapshot)
  }

  private addHandicapLabels(
    session: Session,
    names: { p1Name?: string; p2Name?: string }
  ): { p1Target: number; p2Target: number } {
    let p1Target = ThreeCushionConfig.raceTo
    let p2Target = ThreeCushionConfig.raceTo
    const isHandicapRule =
      this.rules.rulename === "sagu" || this.rules.rulename === "threecushion"
    if (!isHandicapRule || Object.keys(session.getHandicaps()).length === 0) {
      return { p1Target, p2Target }
    }

    const clientIds = session.orderedClientIdsForHud()
    p1Target = session.getRaceTargetForPlayer(clientIds.p1)
    p2Target = session.getRaceTargetForPlayer(clientIds.p2)
    if (names.p1Name) names.p1Name = `${names.p1Name}(${p1Target})`
    if (names.p2Name) names.p2Name = `${names.p2Name}(${p2Target})`
    return { p1Target, p2Target }
  }

  private addEightBallGroupLabel(
    session: Session,
    names: { p1Name?: string; p2Name?: string }
  ): void {
    if (this.rules.rulename !== "eightball" || session.p1type === 0) return
    const typeLabel = session.p1type === 1 ? "solids" : "stripes"
    const mySlot = session.playerIndex === 0 ? "p1Name" : "p2Name"
    if (names[mySlot]) {
      names[mySlot] = `${names[mySlot]}(${typeLabel})`
    }
  }

  updateScoreHud(p1: number, p2: number, b: number, active?: ActivePlayer) {
    const session = Session.getInstance()
    session.updateScoresFromNetwork(p1, p2, b)
    const orderedScores = session.orderedScoresForHud()
    this.hudScores = orderedScores
    const orderedNames = session.orderedNamesForHud()
    const { p1Target, p2Target } = this.addHandicapLabels(session, orderedNames)
    this.addEightBallGroupLabel(session, orderedNames)
    const hideScore = this.rules.hideScoreHud?.() ?? false
    const isSagu = this.rules.rulename === "sagu"
    const p1Star = isSagu && orderedScores.p1 === p1Target - 1
    const p2Star = isSagu && orderedScores.p2 === p2Target - 1

    const activePlayer = active ?? this.inferActivePlayer()
    if (hideScore) {
      this.hud.updateScores(
        orderedScores.p1,
        orderedScores.p2,
        orderedNames.p1Name,
        orderedNames.p2Name,
        0,
        true
      )
    } else {
      this.hud.updateScores(
        orderedScores.p1,
        orderedScores.p2,
        orderedNames.p1Name,
        orderedNames.p2Name,
        b,
        false,
        p1Star,
        p2Star
      )
      this.hud.updatePresentation(
        this.hudPresentation(
          orderedScores.p1,
          orderedScores.p2,
          orderedNames,
          b,
          p1Star,
          p2Star,
          activePlayer
        )
      )
    }
    this.setHudActivePlayer(activePlayer)
  }

  sendScoreUpdate(p1: number, p2: number, b: number, active?: ActivePlayer) {
    const activePlayer = active ?? this.inferActivePlayer()
    const changed =
      this.hudScores.p1 !== p1 ||
      this.hudScores.p2 !== p2 ||
      Session.getInstance().currentBreak !== b ||
      this.hudActivePlayer !== activePlayer
    this.updateScoreHud(p1, p2, b, activePlayer)
    if (changed) {
      this.sendEvent(new ScoreEvent(p1, p2, b, activePlayer))
    }
  }

  notify(data: NotificationData | string, duration?: number) {
    this.notification.show(data, duration)
    this.sendEvent(new NotificationEvent(data, duration))
  }

  notifyLocal(
    data: NotificationData | string,
    duration?: number,
    actionHandlers?: NotificationActionHandlers
  ) {
    this.notification.show(data, duration, actionHandlers)
  }

  private chalkOwner?: Controller
  private chalkCameraMode?: typeof this.view.camera.mode

  playChalk() {
    if (
      !(this.controller instanceof Aim) ||
      !this.table.allStationary() ||
      !this.view.robotPlayers?.beginChalk()
    )
      return
    this.chalkOwner = this.controller
    this.chalkCameraMode = this.view.camera.mode
    this.view.camera.forceMode(this.view.camera.aimView)
    this.table.cue.aimInputs.setDisabled(true)
  }

  private finishChalk() {
    if (!this.chalkOwner) return
    this.view.robotPlayers?.cancelChalk()
    if (this.chalkOwner === this.controller)
      this.table.cue.aimInputs.setDisabled(false)
    if (
      this.chalkCameraMode &&
      this.view.camera.mode === this.view.camera.aimView
    )
      this.view.camera.forceMode(this.chalkCameraMode)
    this.chalkOwner = undefined
    this.chalkCameraMode = undefined
  }

  private updateChalkControl() {
    if (this.chalkOwner && !this.view.robotPlayers?.chalking) this.finishChalk()
    const button = document.getElementById(
      "chalkCue"
    ) as HTMLButtonElement | null
    if (button) {
      button.disabled =
        !(this.controller instanceof Aim) ||
        !this.table.allStationary() ||
        !this.view.robotPlayers?.readyToStrike
      button.setAttribute(
        "aria-pressed",
        String(this.view.robotPlayers?.chalking ?? false)
      )
    }
  }

  advance(elapsed) {
    this.frame?.(elapsed)

    const fixed = this.fixedStep.consume(elapsed, this.timeScale)
    const steps = fixed.steps
    const computedElapsed = fixed.elapsed
    this.controller.updatePresentation(computedElapsed)
    const stateBefore = this.table.allStationary()
    for (let i = 0; i < steps; i++) {
      this.table.advance(this.step)
      const anomaly = this.shotDiagnostics.inspect(this.table)
      if (anomaly?.kind === "non-finite") {
        throw new Error(anomaly.detail)
      }
    }
    this.table.updateBallMesh(computedElapsed)
    this.cameraModeOverride?.()
    this.table.cue.update(computedElapsed)
    this.view.update(computedElapsed, this.table.cue.aim)
    this.updateChalkControl()
    this.particles.update(computedElapsed)
    if (!stateBefore && this.table.allStationary()) {
      this.shotDiagnostics.finish(this.table)
      this.eventQueue.push(new StationaryEvent())
      this.table.cue.hittingAnimation = false
    }
    this.sound.processOutcomes(this.table.outcome)
    if (
      this.motionWatchdog.update(!this.table.allStationary(), performance.now())
    ) {
      this.shotDiagnostics.mark(
        "watchdog",
        this.table,
        "Motion watchdog stopped a non-settling shot after 45 seconds"
      )
      this.recoverPhysicsStep(
        new Error(
          "Motion watchdog stopped a non-settling shot after 45 seconds"
        )
      )
    }
  }

  processEvents() {
    if (this.keyboard) {
      const inputs = this.keyboard.getEvents()
      inputs.forEach((i) => this.inputQueue.push(i))
    }

    while (this.inputQueue.length > 0) {
      this.lastEventTime = this.last
      const input = this.inputQueue.shift()
      input && this.updateController(this.controller.handleInput(input))
    }

    // only process events when stationary
    if (
      this.table.allStationary() &&
      !this.controller.isPreparingShot &&
      !this.view.robotPlayers?.finishingShot
    ) {
      const event = this.eventQueue.shift()
      if (event) {
        this.lastEventTime = performance.now()
        this.recorder.record(event)
        this.updateController(event.applyToController(this.controller))
      }
    }
    if (
      this.table.allStationary() &&
      (this.controller instanceof Aim ||
        this.controller instanceof PlaceBall ||
        this.controller instanceof WatchAim ||
        this.controller instanceof End)
    ) {
      this.onStableState?.()
    }
  }

  lastEventTime = performance.now()

  private recoverPhysicsStep(error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error)
    console.error("Physics step recovered without stopping rendering:", error)
    this.shotDiagnostics.mark("physics-recovery", this.table, detail)
    this.diagnostics.recordPhysicsRecovery()
    this.log?.(`Physics recovery: ${detail}`)

    const wasMoving = !this.table.allStationary()
    this.table.halt()
    this.shotDiagnostics.finish(this.table)
    this.motionWatchdog.reset()
    this.fixedStep.reset()
    this.table.cue.hittingAnimation = false
    if (
      wasMoving &&
      !this.eventQueue.some((event) => event instanceof StationaryEvent)
    ) {
      this.eventQueue.push(new StationaryEvent())
    }
    this.notifyLocal(
      {
        type: "Info",
        title: "物理状态已自动恢复",
        subtext: "检测到异常碰撞，比赛画面已继续运行",
      },
      3200
    )
  }

  animate(timestamp): void {
    if (this.disposed) return
    try {
      this.diagnostics.recordFrame(timestamp)
      // A suspended tab can resume with seconds of wall time. Never try to
      // simulate more than 100 ms of missed real time in one render frame.
      try {
        this.advance(Math.min((timestamp - this.last) / 1000, 0.1))
      } catch (error) {
        this.recoverPhysicsStep(error)
      }
      this.last = timestamp
      this.processEvents()
      const needsRender =
        timestamp < this.lastEventTime + 60000 ||
        !this.table.allStationary() ||
        this.view.sizeChanged()
      if (needsRender) {
        this.view.render()
      }
    } finally {
      // Keep the browser responsive even if a renderer/DOM integration throws.
      // Physics failures are handled above; other failures remain visible in
      // the console while the next frame still gets a chance to render.
      if (!this.disposed) {
        this.animationFrame = requestAnimationFrame((t) => {
          this.animate(t)
        })
      }
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.finishChalk()
    this.disposed = true
    if (this.animationFrame !== undefined) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = undefined
    }
    this.controller?.dispose()
    this.keyboard?.dispose()
    this.table.cue.aimInputs?.dispose()
    this.menu.dispose()
    this.chat.dispose()
    this.comment.dispose()
    this.ballTray.dispose()
    this.notification.dispose()
    this.sliders.dispose()
    this.sound.dispose()
    void this.lobbyIndicator.stop()
    this.diagnostics.dispose()
    this.throttle.dispose()
    this.view.dispose()
    this.particles.dispose()
    this.inputQueue.length = 0
    this.eventQueue.length = 0
    this.onStableState = undefined
    this.cameraModeOverride = undefined
    this.broadcast = () => {}
    this.relay = null
  }

  updateLastShot() {
    const snapshot = ExportUtils.captureSnapshot(this.table)
    this.lastShotInit = snapshot.init
    this.lastShotData = snapshot.shot
  }

  updateController(controller: Controller) {
    this.wasReplay = this.wasReplay || controller instanceof Replay
    if (controller !== this.controller) {
      this.finishChalk()
      // a     const playerName = Session.getInstance().playername
      // b     this.log(`${playerName}: Transition to ${controller.name}`)
      this.controller?.dispose()
      this.controller = controller
      this.view.camera.setOpponentView(
        controller instanceof WatchAim || controller instanceof WatchShot
      )
      this.view.setPrimaryCameraOrbit(
        !(controller instanceof Aim || controller instanceof PlaceBall)
      )
      const active = this.inferActivePlayer(controller)
      if (
        active !== 0 ||
        controller instanceof Init ||
        controller instanceof End
      ) {
        this.setHudActivePlayer(active)
      }
      this.menu?.setShareVisible(
        controller instanceof Replay ||
          (this.wasReplay && controller instanceof End)
      )
      this.menu?.setDiagramVisible(
        controller instanceof Replay ||
          (this.wasReplay && controller instanceof End)
      )
      this.menu?.setAnalysisVisible(
        (controller instanceof Replay ||
          (this.wasReplay && controller instanceof End)) &&
          this.rules.rulename === "threecushion"
      )
      const isTwoPlayer =
        !this.isSinglePlayer &&
        !this.replayMode &&
        !Session.isBotMode() &&
        !Session.isSpectator()
      this.menu?.setConcedeVisible(isTwoPlayer)
      this.comment?.setVisible(isTwoPlayer)

      this.controller.onFirst()
    }
  }
}
