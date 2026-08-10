import { Vector3 } from "three"
import { Session } from "../../network/client/session"

import { WatchEvent } from "../../events/watchevent"
import { Outcome } from "../../model/outcome"
import { Rack } from "../../utils/rack"
import { Controller } from "../controller"
import { Rules } from "./rules"
import { Respot } from "../../utils/respot"
import { Aim } from "../aim"
import { WatchAim } from "../watchaim"
import { Container } from "../../container/container"
import { Ball } from "../../model/ball"
import { Table } from "../../model/table"
import { TableConfig } from "../../view/tableconfig"
import { PlaceBall } from "../placeball"
import { PlaceBallEvent } from "../../events/placeballevent"
import { isFirstShot } from "../../utils/utils"
import { zero } from "../../utils/three-utils"
import { SnookerUtils, ShotInfo } from "./snookerutils"
import { SnookerScoring } from "./snookerscoring"
import { StartAimEvent } from "../../events/startaimevent"
import { RerackEvent } from "../../events/rerackevent"
import { RULE_PROFILES } from "./ruleprofile"
import { R } from "../../model/physics/constants"
import { NotificationEvent } from "../../events/notificationevent"

export class Snooker implements Rules {
  readonly profile = RULE_PROFILES.snooker
  cueball: Ball
  previousPotRed = false
  targetIsRed = true
  currentBreak = 0
  previousBreak = 0
  foulPoints = 0
  nominatedColourId?: number
  freeBallAvailable = false
  freeBallNomineeId?: number
  private freeBallOnValue = 0
  touchingBallIds: number[] = []
  foulAndMissPending = false
  respottedBlack = false
  private pendingMissSnapshot?: number[]
  rulename = "snooker"

  static readonly tablemodel = "models/d-snooker.min.gltf"

  readonly container: Container

  constructor(container: Container) {
    this.container = container
  }

  snookerrule(outcome: Outcome[]): Controller {
    this.foulPoints = 0
    const info = SnookerUtils.shotInfo(
      this.container.table,
      outcome,
      this.targetIsRed,
      this.previousPotRed
    )
    if (
      this.freeBallNomineeId !== undefined &&
      info.firstCollision?.ballB.id === this.freeBallNomineeId
    ) {
      info.legalFirstCollision = true
      return this.handleFreeBallShot(outcome, info)
    }
    if (
      !this.targetIsRed &&
      this.nominatedColourId !== undefined &&
      info.firstCollision?.ballB.id !== this.nominatedColourId
    ) {
      return this.foul(outcome, info)
    }

    if (info.pots === 0) {
      this.targetIsRed =
        SnookerUtils.redsOnTable(this.container.table).length > 0
      if (!info.legalFirstCollision) {
        return this.foul(outcome, info)
      }
      return this.switchPlayer()
    }

    if (this.targetIsRed) {
      return this.targetRedRule(outcome, info)
    }

    return this.targetColourRule(outcome, info)
  }

  private targetRedRule(outcome: Outcome[], info: ShotInfo): Controller {
    if (info.legalFirstCollision && Outcome.onlyRedsPotted(outcome)) {
      this.currentBreak += info.pots
      Session.getInstance().addMyScore(info.pots)

      this.targetIsRed = false
      this.previousPotRed = true
      return this.continueBreak()
    }

    return this.foul(outcome, info)
  }

  private targetColourRule(outcome: Outcome[], info: ShotInfo): Controller {
    if (info.whitePotted) {
      return this.foul(outcome, info)
    }

    if (info.pots > 1) {
      this.respotColours(outcome)
      return this.foul(outcome, info)
    }

    if (Outcome.pots(outcome)[0].id > 6) {
      return this.foul(outcome, info)
    }

    const id = Outcome.pots(outcome)[0].id
    if (id !== info.firstCollision.ballB.id) {
      return this.foul(outcome, info)
    }

    const ballsRemaining = SnookerUtils.ballsOnTable(
      this.container.table
    ).length
    if (this.previousPotRed && ballsRemaining > 0) {
      this.respotColours(outcome)
      this.currentBreak += id + 1
      Session.getInstance().addMyScore(id + 1)

      this.previousPotRed = false
      this.targetIsRed =
        SnookerUtils.redsOnTable(this.container.table).length > 0
      return this.continueBreak()
    }

    const lesserBallOnTable = SnookerUtils.coloursOnTable(
      this.container.table
    ).some((b: Ball) => b.id < id)

    if (lesserBallOnTable) {
      return this.foul(outcome, info)
    }

    this.currentBreak += id + 1
    Session.getInstance().addMyScore(id + 1)

    this.previousPotRed = false
    this.targetIsRed = SnookerUtils.redsOnTable(this.container.table).length > 0
    return this.continueBreak()
  }

  private foul(outcome: Outcome[], info: ShotInfo): Controller {
    const foulResult = SnookerUtils.calculateFoul(outcome, info)
    this.foulPoints = foulResult.points
    Session.getInstance().addOpponentScore(this.foulPoints)

    const notification = info.whitePotted
      ? ({
          type: "Foul",
          title: "FOUL",
          subtext: foulResult.reason || `Foul (${this.foulPoints} points)`,
          extra: "Ball in hand",
        } as const)
      : ({
          type: "Foul",
          title: "FOUL",
          subtext: foulResult.reason || `Foul (${this.foulPoints} points)`,
        } as const)
    this.container.notify(notification)
    this.pendingMissSnapshot = this.container.table.shotStartConditions?.balls
    this.foulAndMissPending =
      !info.whitePotted &&
      !info.legalFirstCollision &&
      !!this.pendingMissSnapshot
    this.respotColours(outcome)
    const next = info.whitePotted ? this.whiteInHand() : this.switchPlayer()
    this.freeBallAvailable = this.isSnookeredOnAllLegalTargets()
    if (this.foulAndMissPending) this.offerMissDecision(next)
    return next
  }

  tableGeometry(): void {
    TableConfig.apply(this.rulename, TableConfig.tableSizeFromUrl())
  }

  table(): Table {
    const table = new Table(this.rack())
    this.cueball = table.cueball
    return table
  }

  otherPlayersCueBall(): Ball {
    return this.cueball
  }

  secondToPlay(): void {
    // only for three cushion
  }

  isPartOfBreak(_: Outcome[]): boolean {
    return this.currentBreak > 0
  }

  isEndOfGame(_: Outcome[]): boolean {
    return Outcome.isClearTable(this.container.table)
  }

  allowsPlaceBall(): boolean {
    return true
  }

  readonly asset = Snooker.tablemodel

  startTurn(): void {
    this.previousPotRed = false
    this.targetIsRed = SnookerUtils.redsOnTable(this.container.table).length > 0
    this.previousBreak = this.currentBreak
    this.currentBreak = 0
    this.nominatedColourId = undefined
    this.touchingBallIds = this.legalTargetBalls()
      .filter(
        (ball) =>
          ball.pos.distanceTo(this.container.table.cueball.pos) <= R * 2 + 1e-5
      )
      .map((ball) => ball.id)
  }

  serialiseState() {
    return {
      previousPotRed: this.previousPotRed,
      targetIsRed: this.targetIsRed,
      foulPoints: this.foulPoints,
      nominatedColourId: this.nominatedColourId,
      freeBallAvailable: this.freeBallAvailable,
      freeBallNomineeId: this.freeBallNomineeId,
      freeBallOnValue: this.freeBallOnValue,
      touchingBallIds: this.touchingBallIds,
      foulAndMissPending: this.foulAndMissPending,
      respottedBlack: this.respottedBlack,
      pendingMissSnapshot: this.pendingMissSnapshot,
    }
  }

  restoreState(state: {
    previousPotRed?: boolean
    targetIsRed?: boolean
    foulPoints?: number
    nominatedColourId?: number
    freeBallAvailable?: boolean
    freeBallNomineeId?: number
    freeBallOnValue?: number
    touchingBallIds?: number[]
    foulAndMissPending?: boolean
    respottedBlack?: boolean
    pendingMissSnapshot?: number[]
  }) {
    this.previousPotRed = state?.previousPotRed ?? false
    this.targetIsRed = state?.targetIsRed ?? true
    this.foulPoints = state?.foulPoints ?? 0
    this.nominatedColourId = state?.nominatedColourId
    this.freeBallAvailable = state?.freeBallAvailable ?? false
    this.freeBallNomineeId = state?.freeBallNomineeId
    this.freeBallOnValue = state?.freeBallOnValue ?? 0
    this.touchingBallIds = state?.touchingBallIds ?? []
    this.foulAndMissPending = state?.foulAndMissPending ?? false
    this.respottedBlack = state?.respottedBlack ?? false
    this.pendingMissSnapshot = state?.pendingMissSnapshot
  }

  rack(): Ball[] {
    return Rack.fromInitParam(Rack.snooker())
  }

  nextCandidateBall(_p1type?: number): Ball | undefined {
    if (isFirstShot(this.container.recorder)) {
      return undefined
    }
    const table = this.container.table
    const redsOnTable = SnookerUtils.redsOnTable(table)
    const coloursOnTable = SnookerUtils.coloursOnTable(table)
    if (this.previousPotRed) {
      return Respot.closest(table.cueball, coloursOnTable)
    }
    if (redsOnTable.length > 0) {
      return Respot.closest(table.cueball, redsOnTable)
    }

    if (coloursOnTable.length > 0) {
      return coloursOnTable[0]
    }
    return undefined
  }

  placeBall(target?: Vector3): Vector3 {
    if (target) {
      const centre = new Vector3(Rack.baulk, 0, 0)
      const radius = Rack.sixth
      const distance = target.distanceTo(centre)
      if (target.x >= Rack.baulk) {
        target.x = Rack.baulk
      }
      if (distance > radius) {
        const direction = target.clone().sub(centre).normalize()
        return centre.add(direction.multiplyScalar(radius))
      } else {
        return target
      }
    }
    return Respot.snookerD(this.container.table)
  }

  private switchPlayer(): Controller {
    const table = this.container.table
    this.container.sendEvent(new StartAimEvent())
    if (this.container.isSinglePlayer) {
      this.container.sendEvent(new WatchEvent(table.serialise()))
      this.startTurn()
      this.container.switchLocalPlayer()
      return new Aim(this.container)
    }
    this.startTurn()
    return new WatchAim(this.container)
  }

  private continueBreak(): Controller {
    const table = this.container.table
    this.container.sound.playSuccess(table.inPockets())
    if (Outcome.isClearTable(table) && this.shouldRespotBlack()) {
      return this.startRespottedBlack()
    }
    if (Outcome.isClearTable(table)) {
      return this.handleGameEnd(true)
    }
    this.container.sendEvent(new WatchEvent(table.serialise()))
    return new Aim(this.container)
  }

  handleGameEnd(isWinner: boolean, endSubtext?: string): Controller {
    return SnookerScoring.presentGameEnd(
      this.container,
      this.rulename,
      isWinner,
      endSubtext
    )
  }

  private whiteInHand(): Controller {
    this.startTurn()
    if (this.container.isSinglePlayer) {
      this.container.switchLocalPlayer()
      return new PlaceBall(this.container)
    }
    this.container.sendEvent(new PlaceBallEvent(zero))
    return new WatchAim(this.container)
  }

  advanceState(outcome: Outcome[]): void {
    const info = SnookerUtils.shotInfo(
      this.container.table,
      outcome,
      this.targetIsRed,
      this.previousPotRed
    )
    if (info.pots === 0) {
      this.targetIsRed =
        SnookerUtils.redsOnTable(this.container.table).length > 0
      this.previousPotRed = false
      return
    }
    if (this.targetIsRed) {
      if (info.legalFirstCollision && Outcome.onlyRedsPotted(outcome)) {
        this.targetIsRed = false
        this.previousPotRed = true
      } else {
        this.previousPotRed = false
        this.targetIsRed =
          SnookerUtils.redsOnTable(this.container.table).length > 0
      }
    } else {
      this.previousPotRed = false
      this.targetIsRed =
        SnookerUtils.redsOnTable(this.container.table).length > 0
    }
  }

  handleDecision(
    decision: string,
    value: string,
    controller: Controller
  ): Controller {
    switch (decision) {
      case "snooker-nominate-colour":
        return this.nominateColour(value, controller)
      case "snooker-play-on":
        return this.acceptFoulPosition(controller)
      case "snooker-free-ball":
        return this.nominateFreeBall(value, controller)
      case "snooker-replay":
        return this.restoreMissPosition(controller)
      default:
        return controller
    }
  }

  private nominateColour(value: string, controller: Controller): Controller {
    const id = Number.parseInt(value)
    if (id >= 1 && id <= 6) this.nominatedColourId = id
    return controller
  }

  private acceptFoulPosition(controller: Controller): Controller {
    this.foulAndMissPending = false
    this.pendingMissSnapshot = undefined
    this.container.notification.clear()
    if (this.freeBallAvailable && controller instanceof Aim) {
      this.showFreeBallNomination(controller)
    }
    return controller
  }

  private nominateFreeBall(value: string, controller: Controller): Controller {
    const id = Number.parseInt(value)
    const candidate = this.container.table.balls[id]
    const legalIds = new Set(this.legalTargetBalls().map((ball) => ball.id))
    if (candidate?.onTable() && id > 0 && !legalIds.has(id)) {
      this.freeBallNomineeId = id
      this.freeBallOnValue = this.ballOnValue()
      this.freeBallAvailable = false
      this.container.notification.clear()
    }
    return controller
  }

  private restoreMissPosition(controller: Controller): Controller {
    if (!this.foulAndMissPending || !this.pendingMissSnapshot) return controller
    this.container.table.updateFromShortSerialised(this.pendingMissSnapshot)
    this.foulAndMissPending = false
    this.freeBallAvailable = false
    this.pendingMissSnapshot = undefined
    this.container.notification.clear()
    return controller instanceof Aim
      ? new WatchAim(this.container)
      : new Aim(this.container)
  }

  update(outcome: Outcome[]): Controller {
    return this.snookerrule(outcome)
  }

  foulReason(outcome: Outcome[]): string | null {
    const info = SnookerUtils.shotInfo(
      this.container.table,
      outcome,
      this.targetIsRed,
      this.previousPotRed
    )
    return SnookerUtils.calculateFoul(outcome, info).reason
  }

  getAmountScored(outcome: Outcome[]): number {
    return Outcome.pots(outcome).reduce((sum, ball) => {
      if (ball.id >= 7) return sum + 1 // red: 1 point
      if (ball.id >= 1) return sum + ball.id + 1 // colour: id+1 points
      return sum
    }, 0)
  }

  respot(outcome: Outcome[]): Ball[] {
    return SnookerUtils.respotAllPottedColours(this.container.table, outcome)
  }

  private respotColours(outcome: Outcome[]): void {
    const respotted = this.respot(outcome)
    if (respotted.length > 0) {
      respotted.forEach((ball) => ball.fround())
      const respotEvent = RerackEvent.fromJson({
        balls: respotted.map((b) => b.serialise()),
      })
      this.container.sendEvent(respotEvent)
    }
  }

  private offerMissDecision(next: Controller): void {
    const freeBallText = this.freeBallAvailable ? "；当前同时获得自由球" : ""
    const data = {
      type: "Info" as const,
      title: "犯规与无意识救球",
      subtext: `可接受当前球位，或要求对手从原位置重打${freeBallText}`,
      extra:
        '<button class="notification-btn" data-notification-action="snooker-play-on">接受球位</button>' +
        '<button class="notification-btn" data-notification-action="snooker-replay">复位重打</button>',
      duration: 0,
    }
    if (next instanceof Aim) {
      this.container.notifyLocal(data, 0, {
        "snooker-play-on": () =>
          this.container.updateController(
            this.handleDecision("snooker-play-on", "", next)
          ),
        "snooker-replay": () =>
          this.container.updateController(
            this.handleDecision("snooker-replay", "", next)
          ),
      })
    } else {
      this.container.sendEvent(new NotificationEvent(data, 0))
    }
  }

  private showFreeBallNomination(controller: Controller): void {
    const legalIds = new Set(this.legalTargetBalls().map((ball) => ball.id))
    const candidates = this.container.table.balls.filter(
      (ball) => ball.id > 0 && ball.onTable() && !legalIds.has(ball.id)
    )
    if (candidates.length === 0) return
    const buttons = candidates
      .slice(0, 6)
      .map(
        (ball) =>
          `<button class="notification-btn" data-notification-action="snooker-free-ball-${ball.id}">${
            ball.id >= 7 ? "红球" : SnookerUtils.colourName(ball.id)
          }</button>`
      )
      .join("")
    const data = {
      type: "Info" as const,
      title: "指定自由球",
      subtext: "所选球视为当前目标球，进球按当前目标分值计算并复位",
      extra: buttons,
    }
    if (!this.container.isSinglePlayer) {
      this.container.notifyLocal(data, 0)
      return
    }
    const handlers = Object.fromEntries(
      candidates
        .slice(0, 6)
        .map((ball) => [
          `snooker-free-ball-${ball.id}`,
          () =>
            this.container.updateController(
              this.handleDecision(
                "snooker-free-ball",
                String(ball.id),
                controller
              )
            ),
        ])
    )
    this.container.notifyLocal(data, 0, handlers)
  }

  private ballOnValue(): number {
    if (this.targetIsRed) return 1
    if (this.previousPotRed) return this.nominatedColourId ?? 1
    return (this.legalTargetBalls()[0]?.id ?? 0) + 1
  }

  private handleFreeBallShot(outcome: Outcome[], info: ShotInfo): Controller {
    if (info.whitePotted) return this.foul(outcome, info)
    const nomineeId = this.freeBallNomineeId!
    const legalIds = new Set(this.legalTargetBalls().map((ball) => ball.id))
    const potted = Outcome.pots(outcome).filter(
      (ball) => ball !== this.container.table.cueball
    )
    if (
      potted.some((ball) => ball.id !== nomineeId && !legalIds.has(ball.id))
    ) {
      return this.foul(outcome, info)
    }
    let points = 0
    for (const ball of potted) {
      points +=
        ball.id === nomineeId ? this.freeBallOnValue : this.ballOnValue()
    }
    const nominee = this.container.table.balls[nomineeId]
    if (potted.includes(nominee) && nominee.id < 7) {
      Respot.respot(nominee, this.container.table)
      nominee.fround()
      this.container.sendEvent(
        RerackEvent.fromJson({ balls: [nominee.serialise()] })
      )
    }
    this.freeBallNomineeId = undefined
    this.freeBallOnValue = 0
    if (points === 0) return this.switchPlayer()
    Session.getInstance().addMyScore(points)
    this.currentBreak += points
    this.previousPotRed = this.targetIsRed
    this.targetIsRed = false
    return this.continueBreak()
  }

  private legalTargetBalls(): Ball[] {
    const table = this.container.table
    const reds = SnookerUtils.redsOnTable(table)
    const colours = SnookerUtils.coloursOnTable(table)
    if (this.targetIsRed && reds.length > 0) return reds
    if (this.previousPotRed) return colours
    return colours.length > 0 ? [colours[0]] : []
  }

  private isSnookeredOnAllLegalTargets(): boolean {
    const cue = this.container.table.cueball
    const targets = this.legalTargetBalls()
    if (targets.length === 0) return false
    return targets.every((target) => {
      const line = target.pos.clone().sub(cue.pos)
      const lineLengthSq = line.lengthSq()
      return this.container.table.balls.some((blocker) => {
        if (blocker === cue || blocker === target || !blocker.onTable())
          return false
        const t = blocker.pos.clone().sub(cue.pos).dot(line) / lineLengthSq
        if (t <= 0 || t >= 1) return false
        const closest = cue.pos.clone().addScaledVector(line, t)
        return closest.distanceTo(blocker.pos) < R * 2 - 1e-5
      })
    })
  }

  private shouldRespotBlack(): boolean {
    if (this.respottedBlack) return false
    const session = Session.getInstance()
    return session.myScore() === session.opponentScore()
  }

  private startRespottedBlack(): Controller {
    const black = this.container.table.balls[6]
    Respot.respot(black, this.container.table)
    black.fround()
    this.respottedBlack = true
    this.targetIsRed = false
    this.previousPotRed = false
    this.container.sendEvent(
      RerackEvent.fromJson({ balls: [black.serialise()] })
    )
    this.container.notifyLocal(
      {
        type: "Info",
        title: "争黑",
        subtext: "比分相同，黑球复位；下一次合法得分或犯规决定胜负",
      },
      2200
    )
    return this.switchPlayer()
  }
}
