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
import { Hud } from "../view/hud"
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
  private wasReplay: boolean = false

  lastShotInit?: string
  lastShotData?: string

  last = performance.now()
  readonly step = 0.001953125 * 1
  private readonly fixedStep = new FixedStepAccumulator(
    this.step,
    Number.POSITIVE_INFINITY
  )

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
    this.table = this.rules.table()
    this.view = new View(element, this.table, assets)
    this.view.onCameraInteraction = () => {
      this.lastEventTime = performance.now()
    }
    this.table.cue.aimInputs = new AimInputs(this)
    if (keyboard) {
      this.keyboard = keyboard
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
    this.sendEvent(new ChatEvent(this.id, msg))
  }

  throttle = new Throttle(250, (event) => {
    this.broadcast(event)
  })

  sendEvent(event) {
    this.recorder.record(event)
    this.throttle.send(event)
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
    this.updateController(
      new PlaceBall(this, this.table.cueball.pos.clone())
    )
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

    this.hud.updateScores(
      orderedScores.p1,
      orderedScores.p2,
      orderedNames.p1Name,
      orderedNames.p2Name,
      hideScore ? 0 : b,
      hideScore,
      p1Star,
      p2Star
    )
    this.setHudActivePlayer(active ?? this.inferActivePlayer())
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

  advance(elapsed) {
    this.frame?.(elapsed)

    const fixed = this.fixedStep.consume(elapsed, this.timeScale)
    const steps = fixed.steps
    const computedElapsed = fixed.elapsed
    const stateBefore = this.table.allStationary()
    for (let i = 0; i < steps; i++) {
      this.table.advance(this.step)
    }
    this.table.updateBallMesh(computedElapsed)
    this.view.update(computedElapsed, this.table.cue.aim)
    this.table.cue.update(computedElapsed)
    this.particles.update(computedElapsed)
    if (!stateBefore && this.table.allStationary()) {
      this.eventQueue.push(new StationaryEvent())
      this.table.cue.hittingAnimation = false
    }
    this.sound.processOutcomes(this.table.outcome)
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
    if (this.table.allStationary()) {
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

  animate(timestamp): void {
    // A suspended tab can resume with seconds of wall time. Never try to
    // simulate more than 100 ms of missed real time in one render frame.
    this.advance(Math.min((timestamp - this.last) / 1000, 0.1))
    this.last = timestamp
    this.processEvents()
    const needsRender =
      timestamp < this.lastEventTime + 60000 ||
      !this.table.allStationary() ||
      this.view.sizeChanged()
    if (needsRender) {
      this.view.render()
    }
    requestAnimationFrame((t) => {
      this.animate(t)
    })
  }

  updateLastShot() {
    const snapshot = ExportUtils.captureSnapshot(this.table)
    this.lastShotInit = snapshot.init
    this.lastShotData = snapshot.shot
  }

  updateController(controller: Controller) {
    this.wasReplay = this.wasReplay || controller instanceof Replay
    if (controller !== this.controller) {
      // a     const playerName = Session.getInstance().playername
      // b     this.log(`${playerName}: Transition to ${controller.name}`)
      this.controller = controller
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
