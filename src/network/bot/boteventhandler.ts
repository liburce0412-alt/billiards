import { GameEvent } from "../../events/gameevent"
import { Outcome } from "../../model/outcome"
import { Logger } from "./logger"
import { Container } from "../../container/container"
import { EventType } from "../../events/eventtype"
import { AimCalculator } from "./aimcalculator"
import { StartAimEvent } from "../../events/startaimevent"
import { PlaceBallEvent, RespotBody } from "../../events/placeballevent"
import { WatchEvent } from "../../events/watchevent"
import { EventUtil } from "../../events/eventutil"
import { Respot } from "../../utils/respot"
import { Session } from "../client/session"
import { Ball } from "../../model/ball"
import { Vector3 } from "three"
import { Rules } from "../../controller/rules/rules"
import { RuleFactory } from "../../controller/rules/rulefactory"
import { TableGeometry } from "../../view/tablegeometry"
import { Snooker } from "../../controller/rules/snooker"
import { SnookerUtils } from "../../controller/rules/snookerutils"
import { isFirstShot, isOpeningShot } from "../../utils/utils"
import { BotShotContext, BotStrategy } from "./botstrategy"
import { ClawBreak } from "./strategies/clawbreak"
import { TheFarJaw } from "./strategies/thefarjaw"
import { R } from "../../model/physics/constants"
import { eightBallGroupAfterShot } from "../../controller/rules/eightballgroup"
import { AimEvent } from "../../events/aimevent"
import { HitEvent } from "../../events/hitevent"
import {
  botDifficultyProfile,
  BotPlanRequest,
  ShotCandidate,
} from "./shotplanner"
import { ShotPlannerClient } from "./shotplannerclient"

class BotContainer {
  table
  recorder
  readonly isBotRules = true
  notify() {}
  sendEvent() {}
  sound = { playSuccess() {} }
  isSinglePlayer = false

  constructor(container: Container) {
    this.table = container.table
    this.recorder = container.recorder
  }
}

export class BotEventHandler {
  private readonly logs: Logger
  private readonly container: Container
  private readonly publishSequenceToPlayer: (
    events: GameEvent[],
    delay?: number
  ) => void
  protected enqueueMessage: (message: string) => void
  private readonly calculator: AimCalculator
  private readonly strategy: BotStrategy
  private readonly level: number
  private readonly shotPlanner = new ShotPlannerClient()
  protected readonly botRules: Rules
  private shouldStartTurnOnNextControl = false
  private queuedOwnStartAim = false
  private allowLetStrokeOnNextTurn = true
  private ballInHandForNextShot = false
  private planning = false

  constructor(
    logs: Logger,
    container: Container,
    publishSequenceToPlayer: (events: GameEvent[], delay?: number) => void,
    enqueueMessage: (message: string) => void
  ) {
    this.logs = logs
    this.container = container
    this.publishSequenceToPlayer = publishSequenceToPlayer
    this.enqueueMessage = enqueueMessage
    this.calculator = new AimCalculator()
    const params = new URLSearchParams(globalThis.location.search)
    const botName = params.get("bot") ?? "ClawBreak"
    const requestedLevel = Number.parseInt(params.get("botLevel") ?? "")
    const legacyLevel = botName === "TheFarJaw" ? 8 : 3
    this.level = Number.isFinite(requestedLevel)
      ? Math.max(1, Math.min(11, requestedLevel))
      : legacyLevel
    this.strategy = this.level >= 6 ? new TheFarJaw() : new ClawBreak()
    this.botRules = RuleFactory.create(
      container.rules.rulename,
      new BotContainer(container)
    )
    if (
      container.rules.rulename === "threecushion" ||
      container.rules.rulename === "sagu"
    ) {
      this.botRules.cueball = this.container.table.balls[1]
    }
  }

  /**
   * Main entry point for the bot to handle game events.
   */
  public handle(event: GameEvent): void {
    this.logs.info(`Bot handling event: ${event.type}`)
    switch (event.type) {
      case EventType.STARTAIM:
        if (!this.queuedOwnStartAim) {
          this.shouldStartTurnOnNextControl = true
          this.allowLetStrokeOnNextTurn = (
            event as StartAimEvent
          ).allowLetStroke
        }
        this.queuedOwnStartAim = false
        this.handleStartAim()
        break
      case EventType.PLACEBALL:
        this.shouldStartTurnOnNextControl = true
        this.allowLetStrokeOnNextTurn = false
        this.handlePlaceBall(event as PlaceBallEvent)
        break
      case EventType.BEGIN:
        this.handleStationary()
        break
    }
  }

  /**
   * The balls have finished rolling after a shot. Bot applies rules to decide the next action.
   */
  private handleStationary(): void {
    const outcome = this.container.table.outcome
    const botType = this.botType()
    const isFourBall = this.container.rules.rulename === "fourball"
    if (!isFourBall && this.container.rules.isEndOfGame(outcome, botType)) {
      this.handleGameEnd()
      return
    }
    if (this.handleFoulOutcome(outcome, botType)) return
    const pots = this.botRules.getAmountScored(outcome)
    const keepsBreak = this.botRules.isPartOfBreak(outcome)
    const endsFourBallGame =
      isFourBall && this.botRules.isEndOfGame(outcome, botType)
    this.logs.info(
      `Bot handleStationary: cueball=${this.botRules.cueball?.id}, pots=${pots}, outcomeLen=${outcome.length}`
    )
    if (
      this.container.rules.rulename !== "threecushion" &&
      this.container.rules.rulename !== "sagu"
    ) {
      this.botRules.advanceState?.(outcome)
    }
    if (this.shouldContinueAfterShot(pots, isFourBall, keepsBreak)) {
      if (this.handleEightBallEarlyPot(outcome)) {
        return
      }
      // In snooker, don't respot colours once all reds have been potted
      const isSnooker = this.container.rules.rulename === "snooker"
      const redsOnTable = isSnooker
        ? SnookerUtils.redsOnTable(this.container.table)
        : []
      const shouldRespot = !isSnooker || redsOnTable.length > 0
      const respotted =
        shouldRespot && !endsFourBallGame ? this.botRules.respot(outcome) : []
      respotted.forEach((ball) => ball.fround())
      this.handlePot(
        pots,
        outcome,
        this.keepsTurnAfterPot(outcome),
        endsFourBallGame
      )
      return
    }
    this.logs.hide()
    this.publishSequenceToPlayer([new StartAimEvent()])
  }

  private handleFoulOutcome(outcome: Outcome[], botType: number): boolean {
    const foulReason = this.botRules.foulReason(outcome, botType)
    if (!foulReason) return false

    this.logs.info(`Bot foul: ${foulReason}`)
    if (!this.handleEightBallFoul(outcome)) {
      this.handleFoul(foulReason, outcome)
    }
    this.botRules.advanceState?.(outcome)
    return true
  }

  private shouldContinueAfterShot(
    pots: number,
    isFourBall: boolean,
    keepsBreak: boolean
  ): boolean {
    return pots > 0 || (isFourBall && keepsBreak)
  }

  private botType(): number {
    const p1type = Session.getInstance().p1type
    if (p1type === 1) return 2
    if (p1type === 2) return 1
    return 0
  }

  validTargetBalls(): Ball[] {
    switch (this.container.rules.rulename) {
      case "eightball":
        return this.validEightBallTargets(this.botType())
      case "nineball":
      case "fourball":
        return this.validNineBallTargets()
      case "snooker":
        return this.validSnookerTargets()
      case "threecushion":
        return this.validThreeCushionTargets()
      case "sagu":
        return this.validSaguTargets()
      default:
        return []
    }
  }

  private validEightBallTargets(botType: number): Ball[] {
    const cueball = this.container.table.cueball
    const balls = this.container.table.balls.filter(
      (ball) => ball !== cueball && ball.onTable()
    )

    if (botType === 0) {
      return balls.filter((ball) => ball.label !== 8)
    }

    const groupBalls = balls.filter((ball) =>
      this.isEightBallType(ball, botType)
    )
    if (groupBalls.length > 0) {
      return groupBalls
    }

    return balls.filter((ball) => ball.label === 8)
  }

  private isEightBallType(ball: Ball, type: number): boolean {
    if (type === 1) {
      return (ball.label ?? 0) >= 1 && (ball.label ?? 0) <= 7
    }
    if (type === 2) {
      return (ball.label ?? 0) >= 9 && (ball.label ?? 0) <= 15
    }
    return false
  }

  private keepsTurnAfterPot(outcome: Outcome[]): boolean {
    if (this.container.rules.rulename !== "eightball") {
      return true
    }

    const botType = this.botType()
    if (botType === 0) {
      return true
    }

    return Outcome.pots(outcome).some((ball) =>
      this.isEightBallType(ball, botType)
    )
  }

  private validNineBallTargets(): Ball[] {
    const cueball = this.container.table.cueball
    const lowestBall = this.container.table.balls
      .filter((ball) => ball !== cueball && ball.onTable())
      .sort((a, b) => (a.label ?? 0) - (b.label ?? 0))[0]

    return lowestBall ? [lowestBall] : []
  }

  private validSnookerTargets(): Ball[] {
    if (isFirstShot(this.container.recorder)) {
      return []
    }

    const snookerRules = this.botRules as Snooker
    const table = this.container.table
    const redsOnTable = SnookerUtils.redsOnTable(table)
    const coloursOnTable = SnookerUtils.coloursOnTable(table)

    if (snookerRules.previousPotRed) {
      return coloursOnTable
    }
    if (redsOnTable.length > 0) {
      return redsOnTable
    }

    return coloursOnTable.length > 0 ? [coloursOnTable[0]] : []
  }

  private validThreeCushionTargets(): Ball[] {
    if (isFirstShot(this.container.recorder)) {
      return []
    }

    const cueball = this.container.table.balls[1]
    return this.container.table.balls.filter(
      (ball) => ball !== cueball && ball.onTable()
    )
  }

  private validSaguTargets(): Ball[] {
    if (isFirstShot(this.container.recorder)) {
      return []
    }

    const cueball = this.container.table.balls[1]
    const opponentCue = this.container.table.balls[0]
    return this.container.table.balls.filter(
      (ball) => ball !== cueball && ball !== opponentCue && ball.onTable()
    )
  }

  private handleGameEnd(): void {
    const session = Session.getInstance()
    const { p1, p2 } = session.orderedScoresForHud()
    const amIWinner = session.playerIndex === 0 ? p1 >= p2 : p2 >= p1

    console.log("Bot handleGameEnd, p1=" + p1 + ", p2=" + p2)
    console.log("Bot handleGameEnd, amIWinner=" + amIWinner)
    console.log("Bot handleGameEnd, session", session)
    this.container.updateController(
      // here using player rules why?
      this.container.rules.handleGameEnd(amIWinner)
    )
  }

  private handleEightBallFoul(outcome: Outcome[]): boolean {
    if (this.container.rules.rulename !== "eightball") {
      return false
    }

    const table = this.container.table
    const eightBall = table.balls.find((b) => b.label === 8)
    if (!eightBall || !Outcome.pots(outcome).includes(eightBall)) {
      return false
    }

    const session = Session.getInstance()
    if (this.canRespotEightBall(session)) {
      const footSpot = new Vector3(TableGeometry.tableX / 2, 0, 0)
      Respot.respotBehind(footSpot, eightBall, table)
      eightBall.fround()
      this.handleFoul("8-ball pocketed early", [], [eightBall])
      return true
    }

    this.handleGameEnd()
    return true
  }

  private handleEightBallEarlyPot(outcome: Outcome[]): boolean {
    if (
      this.container.rules.rulename === "eightball" &&
      Session.getInstance().p1type === 0 &&
      isOpeningShot(this.container.recorder)
    ) {
      const eightBall = this.container.table.balls.find(
        (ball) => ball.label === 8
      )
      if (eightBall && Outcome.pots(outcome).includes(eightBall)) {
        Respot.respotBehind(
          new Vector3(TableGeometry.tableX / 2, 0, 0),
          eightBall,
          this.container.table
        )
        eightBall.fround()
        this.handlePot(
          Math.max(0, Outcome.potCount(outcome) - 1),
          outcome,
          true
        )
        return true
      }
    }
    return this.handleEightBallFoul(outcome)
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

  private handleFoul(
    foulReason: string,
    outcome: Outcome[],
    respottedOverride?: Ball[]
  ): void {
    const session = Session.getInstance()
    const cueball = this.container.table.cueball
    const isSnooker = this.container.rules.rulename === "snooker"
    const whitePotted = Outcome.isCueBallPotted(cueball, outcome)
    const ballInHand = !isSnooker || whitePotted

    if (isSnooker) {
      session.addMyScore(this.snookerFoulPoints(outcome))
    }

    if (this.container.rules.rulename === "sagu") {
      session.setOpponentScore(Math.max(0, session.opponentScore() - 1))
    }
    if (this.container.rules.rulename === "fourball") {
      session.setOpponentScore(Math.max(0, session.opponentScore() - 1))
    }

    const { p1: s1, p2: s2 } = session.orderedScoresForHud()
    this.container.sendScoreUpdate(s1, s2, 0, this.myActivePlayer())

    this.container.notify({
      type: "Foul",
      title: "FOUL",
      subtext: foulReason,
      ...(ballInHand ? { extra: "Ball in hand" } : {}),
    })
    if (!ballInHand) {
      ;(respottedOverride ?? this.container.rules.respot(outcome)).forEach(
        (ball) => ball.fround()
      )
      this.publishSequenceToPlayer([new StartAimEvent()])
      return
    }
    if (!cueball.onTable()) {
      Respot.respotBehind(
        this.container.rules.placeBall(),
        cueball,
        this.container.table
      )
    }
    const startPos = cueball.pos.clone()
    cueball.setStationary()
    const respotted = respottedOverride ?? this.container.rules.respot(outcome)
    let respot: RespotBody | undefined
    if (respotted.length > 0) {
      respot = { id: respotted[0].id, pos: respotted[0].pos.clone() }
    }
    this.publishSequenceToPlayer([new PlaceBallEvent(startPos, respot, true)])
  }

  private snookerFoulPoints(outcome: Outcome[]): number {
    const snookerRules = this.botRules as Snooker
    const info = SnookerUtils.shotInfo(
      this.container.table,
      outcome,
      snookerRules.targetIsRed,
      snookerRules.previousPotRed
    )
    return SnookerUtils.calculateFoul(outcome, info).points
  }

  private myActivePlayer(): 1 | 2 {
    return (Session.getInstance().playerIndex + 1) as 1 | 2
  }

  private handlePot(
    pots: number,
    outcome: Outcome[],
    keepsTurn: boolean,
    endsGame = false
  ): void {
    this.logs.info(
      `Bot handlePot: scored ${pots} points. Next cueball=${this.botRules.cueball?.id}`
    )
    const session = Session.getInstance()
    session.addOpponentScore(pots)
    this.botRules.currentBreak += pots
    this.assignEightBallType(session, outcome)

    if (endsGame) {
      this.handleGameEnd()
      return
    }

    if (
      this.container.rules.rulename === "snooker" &&
      this.botRules.isEndOfGame(outcome, this.botType())
    ) {
      this.handleGameEnd()
      return
    }

    const { p1: s1, p2: s2 } = session.orderedScoresForHud()
    this.container.sendScoreUpdate(
      s1,
      s2,
      0,
      this.container.inferActivePlayer()
    )
    const watchEvent = new WatchEvent(this.container.table.serialise())
    if (!keepsTurn) {
      this.logs.hide()
      this.publishSequenceToPlayer([watchEvent, new StartAimEvent()])
      return
    }

    this.publishSequenceToPlayer([watchEvent])
    this.queuedOwnStartAim = true
    this.enqueueMessage(EventUtil.serialise(new StartAimEvent()))
  }

  private assignEightBallType(session: Session, outcome: Outcome[]): void {
    if (
      session.p1type !== 0 ||
      this.container.rules.rulename !== "eightball" ||
      isOpeningShot(this.container.recorder)
    ) {
      return
    }
    const botGroup = eightBallGroupAfterShot(
      this.container.table.cueball,
      outcome,
      false
    )
    if (botGroup !== 0) session.p1type = botGroup === 1 ? 2 : 1
  }

  private handleStartAim(): void {
    this.startTurnIfNeeded()
    this.logs.show()
    this.container.table.cue.aim.elevation = 0
    this.planAndPublishShot()
  }

  private handlePlaceBall(event: PlaceBallEvent): void {
    this.startTurnIfNeeded()
    const table = this.container.table

    if (event.respot) {
      const ball = table.balls.find((b) => b.id === event.respot?.id)
      if (ball) {
        ball.pos.copy(event.respot.pos)
        ball.setStationary()
        ball.fround()
      }
    }

    const cueball = table.cueball
    cueball.pos.copy(
      this.container.rules.allowsPlaceBall()
        ? this.chooseBallInHandPosition(event.pos)
        : this.container.rules.placeBall()
    )
    cueball.setStationary()
    cueball.fround()
    this.ballInHandForNextShot = true
    this.container.table.cue.aim.elevation = 0
    this.publishSequenceToPlayer([
      new PlaceBallEvent(cueball.pos.clone(), event.respot, true),
    ])
    this.planAndPublishShot()
  }

  private shotPacingMs(): number {
    return 900 + this.level * 45
  }

  private startTurnIfNeeded(): void {
    if (!this.shouldStartTurnOnNextControl) {
      return
    }
    this.botRules.startTurn(this.allowLetStrokeOnNextTurn)
    this.shouldStartTurnOnNextControl = false
    this.allowLetStrokeOnNextTurn = true
  }

  private aim(): GameEvent[] {
    const events = this.strategy.aim(this.buildShotContext(), this.calculator)
    this.ballInHandForNextShot = false
    return events
  }

  private planAndPublishShot(): void {
    if (this.planning) return
    const fallbackEvents = this.aim()
    if (!this.shotPlanner.available()) {
      this.publishSequenceToPlayer(fallbackEvents, this.shotPacingMs())
      return
    }

    const candidates = this.buildShotCandidates(fallbackEvents)
    if (candidates.length === 0) {
      this.publishSequenceToPlayer(fallbackEvents, this.shotPacingMs())
      return
    }

    this.planning = true
    this.logs.info(
      `AI 正在思考 · ${Math.min(
        candidates.length,
        botDifficultyProfile(this.level).candidateBudget
      )} 条物理线路`
    )
    this.container.notifyLocal(
      {
        type: "Info",
        title: "AI 正在思考",
        subtext: "正在试打并评估进球、解球与下一杆",
      },
      1400
    )

    const request = this.buildPlanRequest(candidates)
    void this.shotPlanner
      .plan(request)
      .then((result) => {
        const selected = candidates[result.candidateIndex]
        this.logs.info(
          `AI 物理试打完成 · ${result.simulations} 条 · ${Math.round(
            result.elapsedMs
          )}ms`
        )
        this.publishSequenceToPlayer(
          selected?.events ?? fallbackEvents,
          this.shotPacingMs()
        )
      })
      .catch((error) => {
        this.logs.info(`AI 物理试打回退: ${error.message}`)
        this.publishSequenceToPlayer(fallbackEvents, this.shotPacingMs())
      })
      .finally(() => {
        this.planning = false
      })
  }

  private buildPlanRequest(
    candidates: { candidate: ShotCandidate; events: GameEvent[] }[]
  ): BotPlanRequest {
    const context = this.buildShotContext()
    return {
      type: "BOT_PLAN",
      id: `bot-plan-${context.shotIndex}-${this.level}`,
      ruleType: context.ruleName,
      cueBallId: context.cueBall.id,
      balls: context.table.balls.map((ball) => ({
        id: ball.id,
        pos: { x: ball.pos.x, y: ball.pos.y },
        onTable: ball.onTable(),
      })),
      candidates: candidates.map((entry) => entry.candidate),
      level: this.level,
      cushionModel: this.container.table.cushionModel.name.includes("mathavan")
        ? "mathavan"
        : "stronge",
    }
  }

  private buildShotCandidates(
    fallbackEvents: GameEvent[]
  ): { candidate: ShotCandidate; events: GameEvent[] }[] {
    const context = this.buildShotContext()
    const budget = botDifficultyProfile(this.level).candidateBudget
    const entries: { candidate: ShotCandidate; events: GameEvent[] }[] = []
    const fallbackHit = fallbackEvents.find(
      (event) => event instanceof HitEvent
    ) as HitEvent | undefined
    const firstTarget = context.validTargetBalls[0]
    if (fallbackHit && firstTarget) {
      entries.push(
        this.candidateEntry(
          "fallback",
          firstTarget,
          fallbackHit,
          this.isPathBlocked(context.cueBall.pos, firstTarget.pos, firstTarget)
            ? "escape"
            : "pot",
          0
        )
      )
    }

    const pockets =
      this.calculator.pockets.length > 0 ? this.calculator.pockets : [undefined]
    const powerScales = [0.86, 1, 1.14]
    const spinValues = this.candidateSpinValues()
    let variant = 0
    while (entries.length < budget && context.validTargetBalls.length > 0) {
      const target =
        context.validTargetBalls[variant % context.validTargetBalls.length]
      const pocket =
        pockets[
          Math.floor(variant / context.validTargetBalls.length) % pockets.length
        ]
      const powerScale =
        powerScales[
          Math.floor(
            variant /
              Math.max(1, context.validTargetBalls.length * pockets.length)
          ) % powerScales.length
        ]
      const spinY =
        spinValues[
          Math.floor(
            variant /
              Math.max(
                1,
                context.validTargetBalls.length *
                  pockets.length *
                  powerScales.length
              )
          ) % spinValues.length
        ]
      const destination = pocket ?? target.pos
      const aimPoint = pocket
        ? this.calculator.getAimPoint(context.cueBall.pos, target.pos, [pocket])
        : target.pos
      const distance =
        context.cueBall.pos.distanceTo(target.pos) +
        target.pos.distanceTo(destination)
      const basePower = Math.min(
        AimCalculator.MAX_SHOT_POWER,
        Math.max(48 * R, (54 * R + distance * 0.42) * powerScale)
      )
      const skill = this.calculator.skillError(context, target, destination)
      const hit = this.calculator.generateShot(
        context.table,
        skill.angle,
        basePower,
        aimPoint,
        new Vector3(0, spinY, 0)
      )
      entries.push(
        this.candidateEntry(
          `candidate-${variant}`,
          target,
          hit,
          pocket ? "pot" : "carom",
          skill.difficulty + Math.abs(powerScale - 1) * 0.08
        )
      )
      variant++
    }
    return entries.slice(0, budget)
  }

  private candidateSpinValues(): number[] {
    if (this.level < 6) return [0]
    if (this.level < 9) return [0, -0.12, 0.12]
    return [0, -0.2, 0.2]
  }

  private candidateEntry(
    id: string,
    target: Ball,
    hit: HitEvent,
    kind: ShotCandidate["kind"],
    geometryScore: number
  ): { candidate: ShotCandidate; events: GameEvent[] } {
    const aim = hit.tablejson.aim
    const nextTargetIds = this.validTargetBalls()
      .filter((ball) => ball !== target)
      .map((ball) => ball.id)
    const candidate: ShotCandidate = {
      id,
      targetId: target.id,
      kind,
      aim: {
        angle: aim.angle,
        power: aim.power,
        offset: { x: aim.offset.x, y: aim.offset.y },
        elevation: aim.elevation ?? 0,
      },
      nextTargetIds,
      geometryScore,
    }
    return {
      candidate,
      events: [AimEvent.fromJson(aim), hit],
    }
  }

  private chooseBallInHandPosition(fallback: Vector3): Vector3 {
    const table = this.container.table
    const targets = this.validTargetBalls()
    const candidates: { pos: Vector3; score: number }[] = []
    const addCandidate = (candidate: Vector3, score: number) => {
      const pos = this.container.rules.placeBall(candidate)
      if (![pos.x, pos.y, pos.z].every(Number.isFinite)) return
      if (table.overlapsAny(pos)) return
      if (
        candidates.some(
          (existing) => existing.pos.distanceToSquared(pos) < 0.000001
        )
      ) {
        return
      }
      candidates.push({ pos, score })
    }

    targets.forEach((target, targetIndex) => {
      this.calculator.pockets.forEach((pocket, pocketIndex) => {
        const fromPocket = target.pos.clone().sub(pocket).normalize()
        const pos = target.pos.clone().addScaledVector(fromPocket, 4 * R)
        const ghost = this.calculator.getAimPoint(pos, target.pos, [pocket])
        const blocked =
          this.isPathBlocked(pos, ghost, target) ||
          this.isPathBlocked(target.pos, pocket, target)
        const distance =
          pos.distanceTo(ghost) + target.pos.distanceTo(pocket) * 0.35
        addCandidate(
          pos,
          (blocked ? 100 : 0) +
            distance +
            targetIndex * 0.001 +
            pocketIndex * 0.00001
        )
      })
    })

    const xSteps = [-0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75]
    const ySteps = [-0.7, -0.35, 0, 0.35, 0.7]
    xSteps.forEach((x, xIndex) => {
      ySteps.forEach((y, yIndex) => {
        const pos = new Vector3(
          x * TableGeometry.tableX,
          y * TableGeometry.tableY,
          0
        )
        const target = targets[0]
        const blocked = target
          ? this.isPathBlocked(pos, target.pos, target)
          : false
        addCandidate(
          pos,
          200 +
            (blocked ? 100 : 0) +
            (target ? pos.distanceTo(target.pos) : 0) +
            xIndex * 0.001 +
            yIndex * 0.00001
        )
      })
    })

    addCandidate(fallback, 1000)
    addCandidate(this.container.rules.placeBall(), 2000)
    candidates.sort((a, b) => a.score - b.score)
    return (
      candidates[0]?.pos.clone() ?? this.container.rules.placeBall(fallback)
    )
  }

  private isPathBlocked(from: Vector3, to: Vector3, target: Ball): boolean {
    const line = to.clone().sub(from)
    const lengthSquared = line.lengthSq()
    if (lengthSquared === 0) return true

    return this.container.table.balls.some((ball) => {
      if (
        ball === this.container.table.cueball ||
        ball === target ||
        !ball.onTable()
      ) {
        return false
      }
      const projection = ball.pos.clone().sub(from).dot(line) / lengthSquared
      if (projection <= 0 || projection >= 1) return false
      const closest = from.clone().addScaledVector(line, projection)
      return closest.distanceTo(ball.pos) < 2.1 * R
    })
  }

  private buildShotContext(): BotShotContext {
    const cueBall =
      this.container.rules.rulename === "threecushion" ||
      this.container.rules.rulename === "sagu"
        ? this.container.table.balls[1]
        : this.container.table.cueball

    return {
      table: this.container.table,
      cueBall,
      validTargetBalls: this.validTargetBalls(),
      ballInHand: this.ballInHandForNextShot,
      ruleName: this.container.rules.rulename,
      shotIndex: this.container.recorder.entries.filter(
        (entry) => entry.event.type === EventType.AIM
      ).length,
      level: this.level,
    }
  }
}
