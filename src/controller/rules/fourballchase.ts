import { Vector3 } from "three"
import { Container } from "../../container/container"
import { Aim } from "../aim"
import { Controller } from "../controller"
import { PlaceBall } from "../placeball"
import { WatchAim } from "../watchaim"
import { PlaceBallEvent } from "../../events/placeballevent"
import { RerackEvent } from "../../events/rerackevent"
import { ScoreEvent } from "../../events/scoreevent"
import { StartAimEvent } from "../../events/startaimevent"
import { WatchEvent } from "../../events/watchevent"
import { Ball, State } from "../../model/ball"
import { Outcome, OutcomeType } from "../../model/outcome"
import { Table } from "../../model/table"
import { MatchResultHelper } from "../../network/client/matchresult"
import { Session } from "../../network/client/session"
import { R } from "../../model/physics/constants"
import { Rack } from "../../utils/rack"
import { Respot } from "../../utils/respot"
import { roundVec } from "../../utils/three-utils"
import { isFirstShot } from "../../utils/utils"
import { TableConfig } from "../../view/tableconfig"
import { TableGeometry } from "../../view/tablegeometry"
import { NineBall } from "./nineball"
import { Rules } from "./rules"

interface ChaseState {
  visitsWithoutClearance: number
  openingPlacement: boolean
  letStrokeAvailable: boolean
}

type FourBallContainer = Container & { isBotRules?: boolean }

/**
 * A deterministic two-player adaptation of the common Chinese four-ball
 * pursuit game. Public competitions use several score schedules, so this mode
 * deliberately documents and implements one project profile: foul -1, normal
 * win / golden 9 +4, one-miss clearance +7, break-and-run +10.
 */
export class FourBallChase implements Rules {
  readonly container: FourBallContainer
  readonly asset = "models/p8.min.gltf"
  readonly rulename = "fourball"
  cueball: Ball
  currentBreak = 0
  previousBreak = 0

  private static readonly stateByTable = new WeakMap<Table, ChaseState>()

  constructor(container: FourBallContainer) {
    this.container = container
  }

  private state(): ChaseState {
    let state = FourBallChase.stateByTable.get(this.container.table)
    if (!state) {
      state = {
        visitsWithoutClearance: 0,
        openingPlacement: true,
        letStrokeAvailable: false,
      }
      FourBallChase.stateByTable.set(this.container.table, state)
    }
    return state
  }

  private raceTo(): number {
    const value = Number.parseInt(
      new URLSearchParams(globalThis.location?.search).get("raceTo") ?? "21"
    )
    return Number.isFinite(value) && value > 0 ? value : 21
  }

  startTurn(allowLetStroke = true): void {
    this.previousBreak = this.currentBreak
    this.currentBreak = 0
    this.state().letStrokeAvailable = allowLetStroke
  }

  tableGeometry(): void {
    TableConfig.apply(this.rulename, TableConfig.tableSizeFromUrl())
  }

  table(): Table {
    const table = new Table(this.rack())
    this.cueball = table.cueball
    FourBallChase.stateByTable.set(table, {
      visitsWithoutClearance: 0,
      openingPlacement: true,
      letStrokeAvailable: false,
    })
    return table
  }

  rack(): Ball[] {
    return Rack.fromInitParam(Rack.fourBallChase())
  }

  nextCandidateBall(): Ball | undefined {
    return this.container.table.balls
      .filter((ball) => ball !== this.cueball && ball.onTable())
      .sort((a, b) => (a.label ?? 0) - (b.label ?? 0))[0]
  }

  placeBall(target?: Vector3): Vector3 {
    const min = new Vector3(-TableGeometry.tableX, -TableGeometry.tableY, 0)
    const max = new Vector3(TableGeometry.tableX, TableGeometry.tableY, 0)
    if (this.isOpeningRack()) {
      max.x = Rack.spot.x
    }
    if (target) {
      return target.clone().clamp(min, max)
    }
    return new Vector3(Rack.spot.x - 2 * R, 0, 0).clamp(min, max)
  }

  placementLineX(): number | undefined {
    return this.isOpeningRack() ? Rack.spot.x : undefined
  }

  canLetStroke(): boolean {
    if (this.isOpeningRack() || !this.state().letStrokeAvailable) return false
    const target = this.nextCandidateBall()
    if (!target) return false

    const cue = this.cueball.pos
    const line = target.pos.clone().sub(cue)
    const lengthSquared = line.lengthSq()
    if (lengthSquared === 0) return true

    return this.container.table.balls.some((ball) => {
      if (ball === this.cueball || ball === target || !ball.onTable()) {
        return false
      }
      const fromCue = ball.pos.clone().sub(cue)
      const projection = fromCue.dot(line) / lengthSquared
      if (projection <= 0 || projection >= 1) return false
      const closest = cue.clone().addScaledVector(line, projection)
      return closest.distanceTo(ball.pos) < 2 * R
    })
  }

  update(outcome: Outcome[]): Controller {
    this.state().openingPlacement = false
    const reason = this.foulReason(outcome)
    if (reason) {
      this.advanceState(outcome)
      return this.handleFoul(outcome, reason)
    }

    if (this.isWinningShot(outcome)) {
      return this.handleRackWin(outcome)
    }

    if (this.isPartOfBreak(outcome)) {
      this.state().letStrokeAvailable = false
      this.container.sound.playSuccess(this.container.table.inPockets())
      this.container.sendEvent(new WatchEvent(this.container.table.serialise()))
      return new Aim(this.container)
    }

    this.advanceState(outcome)
    this.startTurn()
    this.container.sendEvent(new StartAimEvent())
    if (this.container.isSinglePlayer) {
      this.container.sendEvent(new WatchEvent(this.container.table.serialise()))
      return new Aim(this.container)
    }
    return new WatchAim(this.container)
  }

  foulReason(outcome: Outcome[]): string | null {
    const table = this.container.table
    const cueball = table.cueball
    if (Outcome.isCueBallPotted(cueball, outcome)) {
      return "Cue ball potted"
    }

    const firstCollision = Outcome.firstCollision(
      Outcome.cueBallFirst(cueball, outcome)
    )
    if (!firstCollision) return "No ball hit"

    const lowest = NineBall.getLowestBallAtStartOfShot(table, outcome)
    if (firstCollision.ballB !== lowest) return "Wrong ball hit first"

    if (Outcome.potCount(outcome) === 0) {
      const collisionIndex = outcome.indexOf(firstCollision)
      const hitCushion = outcome
        .slice(collisionIndex + 1)
        .some((result) => result.type === OutcomeType.Cushion)
      if (!hitCushion) return "No cushion after contact"
    }
    return null
  }

  getAmountScored(outcome: Outcome[]): number {
    if (!this.isWinningShot(outcome)) return 0
    const nonNineRemaining = this.container.table.balls.some(
      (ball) => ball !== this.cueball && ball.label !== 9 && ball.onTable()
    )
    if (nonNineRemaining) return 4

    const visits = this.state().visitsWithoutClearance
    if (visits === 0) return 10
    if (visits === 1) return 7
    return 4
  }

  isPartOfBreak(outcome: Outcome[]): boolean {
    return (
      !this.foulReason(outcome) &&
      Outcome.pots(outcome).some((ball) => ball !== this.cueball)
    )
  }

  isEndOfGame(outcome: Outcome[]): boolean {
    const award = this.getAmountScored(outcome)
    if (award === 0) return false
    const session = Session.getInstance()
    const score = this.container.isBotRules
      ? session.opponentScore()
      : session.myScore()
    return score + award >= this.raceTo()
  }

  advanceState(outcome: Outcome[]): void {
    if (this.foulReason(outcome) || !this.isPartOfBreak(outcome)) {
      this.state().visitsWithoutClearance++
    }
  }

  respot(outcome: Outcome[]): Ball[] {
    const nine = this.container.table.balls.find((ball) => ball.label === 9)
    if (!nine || !Outcome.pots(outcome).includes(nine)) return []

    if (this.foulReason(outcome)) {
      Respot.respotBehind(
        new Vector3(TableGeometry.tableX / 2, 0, 0),
        nine,
        this.container.table
      )
      return [nine]
    }

    return this.resetRack()
  }

  private resetRack(): Ball[] {
    const balls = this.container.table.balls
    const positions = Rack.fourBallChasePositions()
    balls.forEach((ball, index) => {
      ball.pos.copy(positions[index])
      ball.vel.set(0, 0, 0)
      ball.rvel.set(0, 0, 0)
      ball.state = State.Stationary
      ball.fround()
    })
    this.state().visitsWithoutClearance = 0
    this.state().openingPlacement = true
    this.state().letStrokeAvailable = false
    return balls
  }

  private isWinningShot(outcome: Outcome[]): boolean {
    const nine = this.container.table.balls.find((ball) => ball.label === 9)
    return (
      !!nine &&
      Outcome.pots(outcome).includes(nine) &&
      this.foulReason(outcome) === null
    )
  }

  private handleRackWin(outcome: Outcome[]): Controller {
    const award = this.getAmountScored(outcome)
    const session = Session.getInstance()
    session.addMyScore(award)
    this.currentBreak += award
    this.container.sound.playSuccess(award)
    this.sendScore()

    if (session.myScore() >= this.raceTo()) {
      return this.handleGameEnd(true, `率先达到 ${this.raceTo()} 分`)
    }

    const reracked = this.respot(outcome)
    this.container.sendEvent(
      RerackEvent.fromJson({ balls: reracked.map((ball) => ball.serialise()) })
    )
    this.container.sendEvent(new WatchEvent(this.container.table.serialise()))
    let resultName = "追分"
    if (award === 10) resultName = "大金"
    if (award === 7) resultName = "小金"
    this.container.notify({
      type: "Info",
      title: `本局 +${award}`,
      subtext: resultName,
      extra: "继续开球",
    })
    return new PlaceBall(this.container)
  }

  private handleFoul(outcome: Outcome[], reason: string): Controller {
    const session = Session.getInstance()
    session.setMyScore(Math.max(0, session.myScore() - 1))
    this.sendScore()
    this.startTurn()
    this.container.notify({
      type: "Foul",
      title: "犯规 -1",
      subtext: reason,
      extra: "对手自由球",
    })

    const respotted = this.respot(outcome)
    const cueball = this.container.table.cueball
    const startPos = cueball.onTable() ? cueball.pos.clone() : this.placeBall()
    roundVec(startPos)
    const respot = respotted[0]
      ? { id: respotted[0].id, pos: respotted[0].pos.clone() }
      : undefined
    this.container.sendEvent(new PlaceBallEvent(startPos, respot, true))
    return this.container.isSinglePlayer
      ? new PlaceBall(this.container, startPos)
      : new WatchAim(this.container)
  }

  private sendScore() {
    const session = Session.getInstance()
    const { p1, p2 } = session.orderedScoresForHud()
    this.container.sendEvent(
      new ScoreEvent(
        p1,
        p2,
        this.currentBreak,
        (session.playerIndex + 1) as 1 | 2
      )
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

  secondToPlay(): void {}

  otherPlayersCueBall(): Ball {
    return this.cueball
  }

  allowsPlaceBall(): boolean {
    return true
  }

  private isOpeningRack(): boolean {
    return this.state().openingPlacement || isFirstShot(this.container.recorder)
  }
}
