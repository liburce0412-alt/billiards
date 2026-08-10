import { Vector3 } from "three"
import { Container } from "../../container/container"
import { Aim } from "../../controller/aim"
import { End } from "../../controller/end"
import { Controller } from "../../controller/controller"
import { PlaceBall } from "../../controller/placeball"
import { WatchAim } from "../../controller/watchaim"
import { PlaceBallEvent } from "../../events/placeballevent"
import { RerackEvent } from "../../events/rerackevent"
import { WatchEvent } from "../../events/watchevent"
import { Ball } from "../../model/ball"
import { Outcome, OutcomeType } from "../../model/outcome"
import { Table } from "../../model/table"
import { Rack } from "../../utils/rack"
import { Rules } from "./rules"
import { Respot } from "../../utils/respot"
import { TableGeometry } from "../../view/tablegeometry"
import { TableConfig } from "../../view/tableconfig"
import { StartAimEvent } from "../../events/startaimevent"
import { MatchResultHelper } from "../../network/client/matchresult"
import { Session } from "../../network/client/session"
import { isFirstShot } from "../../utils/utils"
import { roundVec } from "../../utils/three-utils"
import { RULE_PROFILES } from "./ruleprofile"
import { NotificationEvent } from "../../events/notificationevent"

export class NineBall implements Rules {
  readonly container: Container
  readonly profile = RULE_PROFILES.nineball

  cueball: Ball
  currentBreak = 0
  previousBreak = 0
  rulename = "nineball"
  private static readonly placementState = new WeakMap<
    Table,
    {
      openingPlacement: boolean
      pushOutAvailable: boolean
      pushOutDeclared: boolean
      pushOutChoicePending: boolean
      consecutiveFouls: Record<string, number>
    }
  >()

  constructor(container: Container) {
    this.container = container
  }

  startTurn(): void {
    this.previousBreak = this.currentBreak
    this.currentBreak = 0
  }

  nextCandidateBall(_p1type?: number): Ball | undefined {
    return this.container.table.balls
      .filter((b) => b !== this.cueball && b.onTable())
      .sort((a, b) => (a.label || 0) - (b.label || 0))[0]
  }

  placeBall(target?: Vector3): Vector3 {
    const baulkline = Rack.spot.x
    if (target) {
      const max = new Vector3(TableGeometry.tableX, TableGeometry.tableY)
      const min = new Vector3(-TableGeometry.tableX, -TableGeometry.tableY)
      if (this.isOpeningPlacement()) {
        max.setX(baulkline)
      }
      return target.clone().clamp(min, max)
    }
    return new Vector3(baulkline, 0, 0)
  }

  placementLineX(): number | undefined {
    return this.isOpeningPlacement() ? Rack.spot.x : undefined
  }

  private isOpeningPlacement(): boolean {
    return (
      NineBall.placementState.get(this.container.table)?.openingPlacement ??
      isFirstShot(this.container.recorder)
    )
  }

  serialiseState() {
    const state = NineBall.placementState.get(this.container.table)
    return {
      openingPlacement: this.isOpeningPlacement(),
      pushOutAvailable: state?.pushOutAvailable ?? false,
      pushOutDeclared: state?.pushOutDeclared ?? false,
      pushOutChoicePending: state?.pushOutChoicePending ?? false,
      consecutiveFouls: state?.consecutiveFouls ?? {},
    }
  }

  restoreState(state: {
    openingPlacement?: boolean
    pushOutAvailable?: boolean
    pushOutDeclared?: boolean
    pushOutChoicePending?: boolean
    consecutiveFouls?: Record<string, number>
  }) {
    NineBall.placementState.set(this.container.table, {
      openingPlacement: state?.openingPlacement ?? false,
      pushOutAvailable: state?.pushOutAvailable ?? false,
      pushOutDeclared: state?.pushOutDeclared ?? false,
      pushOutChoicePending: state?.pushOutChoicePending ?? false,
      consecutiveFouls: state?.consecutiveFouls ?? {},
    })
  }

  readonly asset = "models/p8.min.gltf"

  tableGeometry(): void {
    TableConfig.apply(this.rulename, TableConfig.tableSizeFromUrl())
  }

  table(): Table {
    const table = new Table(this.rack())
    this.cueball = table.cueball
    NineBall.placementState.set(table, {
      openingPlacement: true,
      pushOutAvailable: false,
      pushOutDeclared: false,
      pushOutChoicePending: false,
      consecutiveFouls: {},
    })
    return table
  }

  rack(): Ball[] {
    return Rack.fromInitParam(Rack.diamond())
  }

  update(outcome: Outcome[]): Controller {
    const wasOpening = this.isOpeningPlacement() && !Session.isPracticeMode()
    const state = NineBall.placementState.get(this.container.table)!
    const reason = this.currentFoulReason(outcome, wasOpening)
    if (state) state.openingPlacement = false

    if (reason) {
      return this.handleFoul(outcome, reason)
    }

    if (state.pushOutDeclared) {
      return this.handlePushOut(outcome)
    }

    this.resetShooterFouls()

    let next: Controller
    if (Outcome.potCount(outcome) > 0) {
      next = this.handlePot(outcome)
    } else {
      next = this.handleMiss()
    }
    if (
      wasOpening &&
      !(next instanceof End) &&
      this.tournamentOption("nineBallPushOut", true)
    ) {
      this.offerPushOut(next)
    }
    return next
  }

  private currentFoulReason(
    outcome: Outcome[],
    wasOpening: boolean
  ): string | null {
    if (!this.state().pushOutDeclared) {
      return NineBall.foulReason(
        this.container.table,
        outcome,
        wasOpening,
        this.tournamentOption("nineBallBreakBox", false)
      )
    }
    return Outcome.isCueBallPotted(this.container.table.cueball, outcome)
      ? "Cue ball potted during push-out"
      : null
  }

  private handleFoul(outcome: Outcome[], reason: string): Controller {
    const threeFoulEnabled = this.tournamentOption("nineBallThreeFoul", true)
    const foulCount = threeFoulEnabled ? this.recordShooterFoul() : 1
    if (threeFoulEnabled && foulCount >= 3) {
      return this.handleGameEnd(
        !this.shooterIsLocal(),
        "连续三次犯规，本局判负"
      )
    }
    this.container.notify({
      type: "Foul",
      title: "FOUL",
      subtext: reason,
      extra: foulCount === 2 ? "Ball in hand · 已连续两次犯规" : "Ball in hand",
    })
    this.startTurn()
    const pots = Outcome.pots(outcome)
    const nineBallPotted = pots.includes(this.container.table.balls[9])
    const cueball = this.container.table.cueball

    if (nineBallPotted) {
      this.respotAndBroadcastNineBall(outcome)
    }

    const startPos = cueball.onTable() ? cueball.pos.clone() : this.placeBall()
    roundVec(startPos)
    const placeBallEvent = new PlaceBallEvent(startPos, undefined, true)
    this.container.sendEvent(placeBallEvent)

    if (this.container.isSinglePlayer) {
      this.container.switchLocalPlayer()
      return new PlaceBall(this.container, startPos)
    }
    return new WatchAim(this.container)
  }

  private state() {
    return NineBall.placementState.get(this.container.table)!
  }

  private shooterIsLocal(): boolean {
    return this.container.controller?.name !== "WatchShot"
  }

  private shooterClientId(): string {
    const session = Session.getInstance()
    return this.shooterIsLocal()
      ? session.clientId
      : (session.opponentClientId ?? "opponent")
  }

  private recordShooterFoul(): number {
    const state = this.state()
    const shooter = this.shooterClientId()
    state.consecutiveFouls[shooter] = (state.consecutiveFouls[shooter] ?? 0) + 1
    return state.consecutiveFouls[shooter]
  }

  private resetShooterFouls(): void {
    this.state().consecutiveFouls[this.shooterClientId()] = 0
  }

  private pushOutButtons(): string {
    return (
      '<button class="notification-btn" data-notification-action="push-out">选择 Push-out</button>' +
      '<button class="notification-btn" data-notification-action="clear">正常击球</button>'
    )
  }

  private offerPushOut(next: Controller): void {
    this.state().pushOutAvailable = true
    const data = {
      type: "Info" as const,
      title: "可选择 Push-out",
      subtext: "本杆可以不碰最低号球或库边；出杆前确认",
      extra: this.pushOutButtons(),
      duration: 0,
    }
    if (next instanceof Aim) {
      if (this.isOnlineMatch()) this.container.notifyLocal(data, 0)
      else {
        this.container.notifyLocal(data, 0, {
          "push-out": () => this.declareLocalPushOut(),
          clear: () => this.container.notification.clear(),
        })
      }
    } else {
      this.container.sendEvent(new NotificationEvent(data, 0))
    }
  }

  private declareLocalPushOut(): void {
    this.state().pushOutDeclared = true
    this.state().pushOutAvailable = false
    this.container.notification.clear()
  }

  private handlePushOut(outcome: Outcome[]): Controller {
    const state = this.state()
    state.pushOutDeclared = false
    state.pushOutAvailable = false
    state.pushOutChoicePending = true
    const nineBall = this.container.table.balls[9]
    if (Outcome.pots(outcome).includes(nineBall)) {
      this.respotAndBroadcastNineBall(outcome)
    }
    const next = this.handleMiss()
    const data = {
      type: "Info" as const,
      title: "对手完成 Push-out",
      subtext: "可以接受当前球位，或让对手继续击球",
      extra:
        '<button class="notification-btn" data-notification-action="accept-table">接受球位</button>' +
        '<button class="notification-btn" data-notification-action="pass-back">让对手打</button>',
      duration: 0,
    }
    if (next instanceof Aim) {
      if (this.isOnlineMatch()) this.container.notifyLocal(data, 0)
      else {
        this.container.notifyLocal(data, 0, {
          "accept-table": () => this.acceptLocalPushOut(),
          "pass-back": () => this.passBackLocalPushOut(),
        })
      }
    } else {
      this.container.sendEvent(new NotificationEvent(data, 0))
    }
    return next
  }

  private acceptLocalPushOut(): void {
    this.state().pushOutChoicePending = false
    this.container.notification.clear()
  }

  private passBackLocalPushOut(): void {
    const next = this.handleDecision("pass-back", "", this.container.controller)
    this.container.updateController(next)
    this.container.notification.clear()
  }

  private isOnlineMatch(): boolean {
    return !this.container.isSinglePlayer && !Session.isLocalVersusMode()
  }

  private tournamentOption(name: string, defaultValue: boolean): boolean {
    if (typeof globalThis.location === "undefined") return defaultValue
    const value = new URLSearchParams(globalThis.location.search).get(name)
    return value === null ? defaultValue : value !== "false"
  }

  handleDecision(
    decision: string,
    _value: string,
    controller: Controller
  ): Controller {
    const state = this.state()
    if (decision === "push-out" && state.pushOutAvailable) {
      state.pushOutDeclared = true
      state.pushOutAvailable = false
      return controller
    }
    if (decision === "accept-table" && state.pushOutChoicePending) {
      state.pushOutChoicePending = false
      return controller
    }
    if (decision !== "pass-back" || !state.pushOutChoicePending) {
      return controller
    }
    state.pushOutChoicePending = false
    if (Session.isLocalVersusMode()) {
      this.container.switchLocalPlayer()
      return new Aim(this.container)
    }
    return controller instanceof Aim
      ? new WatchAim(this.container)
      : new Aim(this.container)
  }

  private handlePot(outcome: Outcome[]): Controller {
    const table = this.container.table
    const pots = Outcome.potCount(outcome)
    this.currentBreak += pots
    Session.getInstance().addMyScore(pots)

    this.container.sound.playSuccess(table.inPockets())
    if (this.isEndOfGame(outcome)) {
      return this.handleGameEnd(true)
    }

    this.container.sendEvent(new WatchEvent(table.serialise()))
    return new Aim(this.container)
  }

  handleGameEnd(isWinner: boolean, endSubtext?: string): Controller {
    return MatchResultHelper.presentGameEnd(
      this.container,
      this.rulename,
      isWinner,
      endSubtext
    )
  }

  private handleMiss(): Controller {
    const table = this.container.table
    // if no pot and no foul switch to other player
    this.container.sendEvent(new StartAimEvent())
    if (this.container.isSinglePlayer) {
      this.container.sendEvent(new WatchEvent(table.serialise()))
      this.startTurn()
      this.container.switchLocalPlayer()
      return new Aim(this.container)
    }
    return new WatchAim(this.container)
  }

  isPartOfBreak(outcome: Outcome[]): boolean {
    return Outcome.isBallPottedNoFoul(this.container.table.cueball, outcome)
  }

  isEndOfGame(outcome: Outcome[]): boolean {
    const nineBall = this.container.table.balls[9]
    const nineBallPotted = Outcome.pots(outcome).includes(nineBall)
    return nineBallPotted && !this.isFoul(outcome)
  }

  otherPlayersCueBall(): Ball {
    // only for three cushion
    return this.cueball
  }

  secondToPlay(): void {
    // only for three cushion
  }

  allowsPlaceBall(): boolean {
    return true
  }

  protected isFoul(outcome: Outcome[]): boolean {
    return (
      NineBall.foulReason(
        this.container.table,
        outcome,
        this.isOpeningPlacement() && !Session.isPracticeMode()
      ) !== null
    )
  }

  foulReason(outcome: Outcome[]): string | null {
    return NineBall.foulReason(
      this.container.table,
      outcome,
      this.isOpeningPlacement() && !Session.isPracticeMode()
    )
  }

  getAmountScored(outcome: Outcome[]): number {
    return Outcome.potCount(outcome)
  }

  respot(outcome: Outcome[]): Ball[] {
    const nineBall = this.container.table.balls[9]
    if (nineBall && Outcome.pots(outcome).includes(nineBall)) {
      Respot.nineBall(this.container.table)
      return [nineBall]
    }
    return []
  }

  public static foulReason(
    table: Table,
    outcome: Outcome[],
    openingBreak = false,
    threeBallRule = false
  ): string | null {
    const cueball = table.cueball

    // 1. Cue ball potted
    if (Outcome.isCueBallPotted(cueball, outcome)) {
      return "Cue ball potted"
    }

    // 2. Wrong ball hit first
    const lowestBall = NineBall.getLowestBallAtStartOfShot(table, outcome)
    const firstCollision = Outcome.firstCollision(
      Outcome.cueBallFirst(cueball, outcome)
    )

    if (!firstCollision) {
      return "No ball hit"
    }

    const wrongFirstBall = NineBall.wrongFirstBallReason(
      table,
      firstCollision.ballB,
      lowestBall
    )
    if (wrongFirstBall) return wrongFirstBall

    // 3. On a dry opening break, at least four distinct object balls must
    // reach a cushion. This is the WPA break requirement.
    const openingBreakReason = NineBall.openingBreakFoulReason(
      cueball,
      outcome,
      openingBreak
    )
    if (openingBreakReason) return openingBreakReason
    const threeBallReason = NineBall.threeBallRuleReason(
      table,
      outcome,
      threeBallRule && openingBreak
    )
    if (threeBallReason) return threeBallReason

    // 4. No cushion after contact
    if (Outcome.potCount(outcome) === 0) {
      // Find cushions after first collision
      const firstCollisionIndex = outcome.indexOf(firstCollision)
      const cushionsAfter = outcome
        .slice(firstCollisionIndex + 1)
        .some((o) => o.type === OutcomeType.Cushion)
      if (!cushionsAfter) {
        return "No cushion after contact"
      }
    }

    return null
  }

  private static wrongFirstBallReason(
    table: Table,
    firstBall: Ball | null,
    lowestBall?: Ball
  ): string | null {
    if (firstBall === lowestBall) return null
    if (!firstBall) return "Wrong ball hit first"
    if (!Session.isPracticeMode()) return "Wrong ball hit first"
    return firstBall === table.balls[9] && NineBall.hasOtherObjectBalls(table)
      ? "Wrong ball hit first"
      : null
  }

  private static threeBallRuleReason(
    table: Table,
    outcome: Outcome[],
    enabled: boolean
  ): string | null {
    if (!enabled) return null
    const cueball = table.cueball
    const potted = Outcome.pots(outcome).filter((ball) => ball !== cueball)
    const crossedHeadString = table.balls.filter(
      (ball) => ball !== cueball && ball.onTable() && ball.pos.x < Rack.baulk
    )
    return new Set([...potted, ...crossedHeadString]).size < 3
      ? "Illegal break: three-ball rule not met"
      : null
  }

  public static getLowestBallAtStartOfShot(
    table: Table,
    outcome: Outcome[]
  ): Ball | undefined {
    const potted = Outcome.pots(outcome)
    const onTable = table.balls.filter(
      (b) => b !== table.cueball && b.onTable()
    )
    const all = [...potted, ...onTable]
    all.sort((a, b) => (a.label || 0) - (b.label || 0))
    return all[0]
  }

  private static hasOtherObjectBalls(table: Table): boolean {
    return table.balls.some(
      (b) => b !== table.cueball && b !== table.balls[9] && b.onTable()
    )
  }

  private static openingBreakFoulReason(
    cueball: Ball,
    outcome: Outcome[],
    openingBreak: boolean
  ): string | null {
    if (!openingBreak || Outcome.potCount(outcome) > 0) return null
    const objectBallsAtCushion = new Set(
      outcome
        .filter(
          (o) =>
            o.type === OutcomeType.Cushion && o.ballA && o.ballA !== cueball
        )
        .map((o) => o.ballA)
    )
    return objectBallsAtCushion.size > 0 && objectBallsAtCushion.size < 4
      ? "Illegal break: fewer than four object balls reached a cushion"
      : null
  }

  private respotAndBroadcastNineBall(outcome: Outcome[]) {
    const respotted = this.respot(outcome)
    const nineBall = respotted[0]
    if (nineBall) {
      nineBall.fround()
      const respotEvent = RerackEvent.fromJson({
        balls: [nineBall.serialise()],
      })
      console.log("Respot nine ball sending rerack event", respotEvent)
      this.container.sendEvent(respotEvent)
    }
  }
}
