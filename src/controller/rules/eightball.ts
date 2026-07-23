import { Vector3 } from "three"
import { Container } from "../../container/container"
import { Ball } from "../../model/ball"
import { Outcome, OutcomeType } from "../../model/outcome"
import { Table } from "../../model/table"
import { Controller } from "../controller"
import { Rules } from "./rules"
import { TableGeometry } from "../../view/tablegeometry"
import { TableConfig } from "../../view/tableconfig"
import { Rack } from "../../utils/rack"
import { isFirstShot, isOpeningShot } from "../../utils/utils"
import { Session } from "../../network/client/session"
import { MatchResultHelper } from "../../network/client/matchresult"
import { Aim } from "../aim"
import { WatchAim } from "../watchaim"
import { PlaceBall } from "../placeball"
import { PlaceBallEvent } from "../../events/placeballevent"
import { WatchEvent } from "../../events/watchevent"
import { StartAimEvent } from "../../events/startaimevent"
import { ScoreEvent } from "../../events/scoreevent"
import { roundVec } from "../../utils/three-utils"
import { Respot } from "../../utils/respot"
import { RerackEvent } from "../../events/rerackevent"

const flipType = (t: number) => {
  if (t === 1) return 2
  if (t === 2) return 1
  return 0
}

export class EightBall implements Rules {
  readonly container: Container

  cueball: Ball
  currentBreak = 0
  previousBreak = 0
  rulename = "eightball"
  private static readonly placementState = new WeakMap<
    Table,
    { behindLine: boolean }
  >()

  constructor(container: Container) {
    this.container = container
  }

  startTurn(): void {
    this.previousBreak = this.currentBreak
    this.currentBreak = 0
  }

  readonly asset = "models/p8.min.gltf"

  tableGeometry(): void {
    TableConfig.apply(this.rulename, TableConfig.tableSizeFromUrl())
  }

  table(): Table {
    const table = new Table(this.rack())
    this.cueball = table.cueball
    EightBall.placementState.set(table, { behindLine: false })
    return table
  }

  rack(): Ball[] {
    return Rack.fromInitParam(Rack.eightBall())
  }

  secondToPlay(): void {
    // Intentionally empty
  }

  otherPlayersCueBall(): Ball {
    return this.cueball
  }

  isPartOfBreak(outcome: Outcome[]): boolean {
    return Outcome.isBallPottedNoFoul(this.container.table.cueball, outcome)
  }

  allowsPlaceBall(): boolean {
    return true
  }

  placeBall(target?: Vector3): Vector3 {
    const baulkline = Rack.spot.x
    if (target) {
      const max = new Vector3(TableGeometry.tableX, TableGeometry.tableY)
      const min = new Vector3(-TableGeometry.tableX, -TableGeometry.tableY)
      if (this.placementLineX() !== undefined) {
        max.setX(baulkline)
      }
      return target.clone().clamp(min, max)
    }
    return new Vector3(baulkline, 0, 0)
  }

  placementLineX(): number | undefined {
    const state = EightBall.placementState.get(this.container.table)
    return isFirstShot(this.container.recorder) || state?.behindLine
      ? Rack.spot.x
      : undefined
  }

  nextCandidateBall(p1type?: number): Ball | undefined {
    const type = p1type ?? Session.getInstance().p1type
    const table = this.container.table
    const balls = table.balls.filter((b) => b !== this.cueball && b.onTable())

    if (type === 0) {
      return balls.find((b) => b.label !== 8)
    }

    const myGroup = balls.filter((b) => this.isMyType(b, type))
    if (myGroup.length > 0) {
      return Respot.closest(table.cueball, myGroup)
    }

    return table.balls.find((b) => b.label === 8 && b.onTable())
  }

  private isMyType(ball: Ball, type = Session.getInstance().p1type): boolean {
    if (type === 1) {
      return (ball.label || 0) >= 1 && (ball.label || 0) <= 7
    }
    if (type === 2) {
      return (ball.label || 0) >= 9 && (ball.label || 0) <= 15
    }
    return false
  }

  isFoul(outcome: Outcome[]): boolean {
    return this.foulReason(outcome) !== null
  }

  getAmountScored(outcome: Outcome[]): number {
    return Outcome.potCount(outcome)
  }

  respot(_outcome: Outcome[]): Ball[] {
    return []
  }

  private wrongBallHitReason(
    hitBall: Ball,
    outcome: Outcome[],
    type?: number
  ): string | null {
    const session = Session.getInstance()
    const effectiveType = type ?? session.p1type
    if (effectiveType === 0) {
      return hitBall.label === 8 ? "Hitting the 8-ball first is a foul" : null
    }
    const cueball = this.container.table.cueball
    const pottedThisShot = new Set(Outcome.pots(outcome))
    const myGroupBefore = this.container.table.balls.filter(
      (b) =>
        b !== cueball &&
        (b.onTable() || pottedThisShot.has(b)) &&
        this.isMyType(b, effectiveType)
    )
    if (myGroupBefore.length > 0) {
      return this.isMyType(hitBall, effectiveType)
        ? null
        : "Wrong group hit first"
    }
    return hitBall.label === 8 ? null : "Must hit 8-ball first"
  }

  foulReason(outcome: Outcome[], type?: number): string | null {
    const table = this.container.table
    const cueball = table.cueball

    if (Outcome.isCueBallPotted(cueball, outcome)) {
      return this.markBallInHand("Cue ball potted")
    }

    const firstCollision = Outcome.firstCollision(
      Outcome.cueBallFirst(cueball, outcome)
    )

    if (!firstCollision) {
      return this.markBallInHand("No ball hit")
    }

    const wrongBall = this.wrongBallHitReason(
      firstCollision.ballB!,
      outcome,
      type
    )
    if (wrongBall) {
      return this.markBallInHand(wrongBall)
    }

    if (isOpeningShot(this.container.recorder)) {
      const objectBallPotted = Outcome.pots(outcome).some(
        (ball) => ball !== cueball
      )
      if (!objectBallPotted) {
        const cushionedObjects = new Set(
          outcome
            .filter(
              (result) =>
                result.type === OutcomeType.Cushion &&
                result.ballA !== cueball &&
                result.ballA
            )
            .map((result) => result.ballA)
        )
        if (cushionedObjects.size < 4) {
          return this.markBallInHand(
            "Illegal break: fewer than four object balls hit a cushion"
          )
        }
      }
      return null
    }

    // 3. No cushion after contact
    if (Outcome.potCount(outcome) === 0) {
      const firstCollisionIndex = outcome.indexOf(firstCollision)
      const cushionsAfter = outcome
        .slice(firstCollisionIndex + 1)
        .some((o) => o.type === OutcomeType.Cushion)
      if (!cushionsAfter) {
        return this.markBallInHand("No cushion after contact")
      }
    }

    return null
  }

  private markBallInHand(reason: string): string {
    const state = EightBall.placementState.get(this.container.table)
    if (state) {
      state.behindLine = isOpeningShot(this.container.recorder)
    }
    return reason
  }

  update(outcome: Outcome[]): Controller {
    const reason = this.foulReason(outcome)

    if (reason) {
      return this.handleFoul(outcome, reason)
    }

    const pots = Outcome.pots(outcome)
    if (pots.length > 0) {
      return this.handlePot(outcome)
    }

    return this.handleMiss()
  }

  private handleFoul(outcome: Outcome[], reason: string): Controller {
    this.container.notify({
      type: "Foul",
      title: "FOUL",
      subtext: reason,
      extra: "Ball in hand",
    })
    this.startTurn()
    const pots = Outcome.pots(outcome)
    const eightBallPotted = pots.some((b) => b.label === 8)
    const cueball = this.container.table.cueball

    if (eightBallPotted) {
      const session = Session.getInstance()
      if (this.canRespotEightBall(session)) {
        return this.respotEightBallFoul()
      }
      return this.handleGameEnd(false, "8-ball pocketed on foul")
    }

    const startPos = cueball.onTable() ? cueball.pos.clone() : this.placeBall()
    roundVec(startPos)
    const placeBallEvent = new PlaceBallEvent(startPos, undefined, true)
    this.container.sendEvent(placeBallEvent)

    if (this.container.isSinglePlayer) {
      return new PlaceBall(this.container, startPos)
    }
    return new WatchAim(this.container)
  }

  private handlePot(outcome: Outcome[]): Controller {
    const session = Session.getInstance()
    const table = this.container.table
    const pots = Outcome.pots(outcome)

    if (this.isLegalEightOnBreak(session, pots)) {
      return this.handleEightOnBreak(pots)
    }

    if (this.isEndOfGame(outcome)) {
      return this.handleGameEnd(true)
    }

    if (pots.some((b) => b.label === 8)) {
      return this.handleEarlyEightBall(session)
    }

    const myGroupBefore = session.p1type
    this.assignGroupAfterOpenTable(session, outcome, pots)

    this.currentBreak += pots.length
    session.addMyScore(pots.length)

    this.container.sound.playSuccess(table.inPockets())

    const p1typeForEvent =
      session.playerIndex === 0 ? session.p1type : flipType(session.p1type)
    const scoreEvent = new ScoreEvent(
      session.playerIndex === 0 ? session.myScore() : session.opponentScore(),
      session.playerIndex === 1 ? session.myScore() : session.opponentScore(),
      this.currentBreak,
      (session.playerIndex + 1) as any,
      p1typeForEvent
    )
    this.container.sendEvent(scoreEvent)

    this.container.sendEvent(new WatchEvent(table.serialise()))

    if (myGroupBefore !== 0) {
      const myGroupPotted = pots.some((b) => this.isMyType(b, myGroupBefore))
      if (!myGroupPotted) {
        return this.handleMiss()
      }
    }

    return new Aim(this.container)
  }

  private isLegalEightOnBreak(session: Session, pots: Ball[]): boolean {
    return (
      session.p1type === 0 &&
      isOpeningShot(this.container.recorder) &&
      pots.some((ball) => ball.label === 8)
    )
  }

  private assignGroupAfterOpenTable(
    session: Session,
    outcome: Outcome[],
    pots: Ball[]
  ) {
    if (session.p1type !== 0 || isOpeningShot(this.container.recorder)) {
      return
    }
    const firstContact = Outcome.firstCollision(
      Outcome.cueBallFirst(this.container.table.cueball, outcome)
    )?.ballB
    const solids = pots.filter((ball) => ball.label! >= 1 && ball.label! <= 7)
    const stripes = pots.filter((ball) => ball.label! >= 9 && ball.label! <= 15)
    if (
      solids.length > 0 &&
      stripes.length === 0 &&
      firstContact &&
      this.isMyType(firstContact, 1)
    ) {
      session.p1type = 1
    } else if (
      stripes.length > 0 &&
      solids.length === 0 &&
      firstContact &&
      this.isMyType(firstContact, 2)
    ) {
      session.p1type = 2
    }
  }

  private handleEightOnBreak(pots: Ball[]): Controller {
    const table = this.container.table
    const session = Session.getInstance()
    const eightBall = pots.find((ball) => ball.label === 8)!
    const footSpot = new Vector3(TableGeometry.tableX / 2, 0, 0)
    Respot.respotBehind(footSpot, eightBall, table)
    eightBall.fround()

    const otherPots = pots.filter(
      (ball) => ball !== eightBall && ball !== table.cueball
    )
    this.currentBreak += otherPots.length
    session.addMyScore(otherPots.length)
    this.container.sendEvent(
      RerackEvent.fromJson({ balls: [eightBall.serialise()] })
    )
    const p1typeForEvent =
      session.playerIndex === 0 ? session.p1type : flipType(session.p1type)
    this.container.sendEvent(
      new ScoreEvent(
        session.playerIndex === 0 ? session.myScore() : session.opponentScore(),
        session.playerIndex === 1 ? session.myScore() : session.opponentScore(),
        this.currentBreak,
        (session.playerIndex + 1) as 1 | 2,
        p1typeForEvent
      )
    )
    this.container.sendEvent(new WatchEvent(table.serialise()))
    this.container.notify({
      type: "Info",
      title: "开球进黑八",
      subtext: "黑八复位，球组保持开放，由开球方继续击打。",
      extra: "继续击打",
    })
    return new Aim(this.container)
  }

  private handleEarlyEightBall(session: Session): Controller {
    if (this.canRespotEightBall(session)) {
      return this.respotEightBallFoul()
    }
    return this.handleGameEnd(false, "8-ball pocketed early")
  }

  private respotEightBallFoul(): Controller {
    const table = this.container.table
    const eightBall = table.balls.find((b) => b.label === 8)!
    const footSpot = new Vector3(TableGeometry.tableX / 2, 0, 0)
    Respot.respotBehind(footSpot, eightBall, table)
    eightBall.fround()
    this.container.sendEvent(
      RerackEvent.fromJson({ balls: [eightBall.serialise()] })
    )
    return this.handleFoul([], "8-ball pocketed early")
  }

  private canRespotEightBall(session: Session): boolean {
    return (
      session.p1type === 0 &&
      this.container.table.balls.some(
        (ball) =>
          ball !== this.container.table.cueball &&
          ball.label !== 8 &&
          ball.onTable()
      )
    )
  }

  private handleMiss(): Controller {
    const table = this.container.table
    this.container.sendEvent(new StartAimEvent())
    if (this.container.isSinglePlayer) {
      this.container.sendEvent(new WatchEvent(table.serialise()))
      this.startTurn()
      return new Aim(this.container)
    }
    return new WatchAim(this.container)
  }

  isEndOfGame(outcome: Outcome[], type?: number): boolean {
    const eightBall = this.container.table.balls.find((b) => b.label === 8)!
    const eightBallPotted = Outcome.pots(outcome).includes(eightBall)
    if (!eightBallPotted) return false
    if (this.foulReason(outcome, type)) return false

    const session = Session.getInstance()
    if (session.p1type === 0) {
      return false
    }

    return !this.hasRemainingGroupBalls(outcome, eightBall, type)
  }

  private hasRemainingGroupBalls(
    outcome: Outcome[],
    eightBall: Ball,
    type?: number
  ): boolean {
    const table = this.container.table
    const pottedThisShot = new Set(Outcome.pots(outcome))
    return table.balls.some(
      (ball) =>
        ball !== table.cueball &&
        ball !== eightBall &&
        ball.onTable() &&
        this.isMyType(ball, type) &&
        !pottedThisShot.has(ball)
    )
  }

  handleGameEnd(isWinner: boolean, endSubtext?: string): Controller {
    return MatchResultHelper.presentGameEnd(
      this.container,
      this.rulename,
      isWinner,
      endSubtext
    )
  }
}
