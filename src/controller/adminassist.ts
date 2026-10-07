import { Aim } from "./aim"
import { PlaceBall } from "./placeball"
import type { Container } from "../container/container"
import { AimEvent } from "../events/aimevent"
import { HitEvent } from "../events/hitevent"
import { EventType } from "../events/eventtype"
import type { Ball } from "../model/ball"
import { Session } from "../network/client/session"
import { AimCalculator } from "../network/bot/aimcalculator"
import type { BotShotContext } from "../network/bot/botstrategy"
import { ClawBreak } from "../network/bot/strategies/clawbreak"
import { TheFarJaw } from "../network/bot/strategies/thefarjaw"
import type { Vector3 } from "three"
import { R } from "../model/physics/constants"
import type { Camera } from "../view/camera"
import {
  enumerateAdminClearanceCandidates,
  planAdminClearanceShot,
} from "./adminclearanceplanner"
import { ShotPlannerClient } from "../network/bot/shotplannerclient"
import type { BotPlanRequest, ShotCandidate } from "../network/bot/shotplanner"
import {
  adminAssistErrorScale,
  canUseAdminAssist,
  loadAdminAssistSettings,
} from "../platform/adminassistsettings"

export {
  adminAssistErrorScale,
  canUseAdminAssist,
  loadAdminAssistSettings,
  saveAdminAssistSettings,
} from "../platform/adminassistsettings"

export function isAdminAssistMatchAllowed(
  _isSinglePlayer: boolean,
  _botMode: boolean,
  _onlineDemoRoom: boolean
): boolean {
  return true
}

export function hasManualOpeningShot(manualShotCount: number): boolean {
  return Number.isFinite(manualShotCount) && manualShotCount > 0
}

export interface AdminAimMotionTimings {
  orientMs: number
  fineTuneMs: number
  thinkMs: number
  pullBackMs: number
  strikeDelayMs: number
}

export function shortestAngleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from))
}

export function adminAimMotionTimings(
  angleDelta: number,
  level: number,
  reducedMotion = false
): AdminAimMotionTimings {
  if (reducedMotion) {
    return {
      orientMs: 220,
      fineTuneMs: 120,
      thinkMs: 180,
      pullBackMs: 180,
      strikeDelayMs: 100,
    }
  }
  const strength = Math.max(1, Math.min(11, Math.round(level)))
  return {
    orientMs: Math.min(
      2_000,
      Math.round(900 + Math.min(Math.PI, Math.abs(angleDelta)) * 350)
    ),
    fineTuneMs: 620,
    thinkMs: 780 + (11 - strength) * 35,
    pullBackMs: 680,
    strikeDelayMs: 220,
  }
}

function smoothStep(value: number): number {
  const t = Math.max(0, Math.min(1, value))
  return t * t * (3 - 2 * t)
}

class AdminAimCalculator extends AimCalculator {
  override skillError(
    context: BotShotContext,
    target: Ball,
    destination?: Vector3
  ) {
    const result = super.skillError(context, target, destination)
    return {
      ...result,
      angle: result.angle * adminAssistErrorScale(context.level),
    }
  }
}

export class AdminDemoAssist {
  private readonly calculator = new AdminAimCalculator()
  private readonly planner = new ShotPlannerClient()
  private scheduled?: Aim | PlaceBall
  private timer?: ReturnType<typeof globalThis.setTimeout>
  private animationFrame?: number
  private sequence = 0
  private previousCameraMode?: Camera["mode"]
  private readonly enforcePov = () => {
    const camera = this.container.view.camera
    if (camera.mode !== camera.aimView) camera.forceMode(camera.aimView)
  }

  constructor(private readonly container: Container) {}

  dispose(): void {
    this.cancel()
    this.planner.dispose()
  }

  sync(): void {
    const settings = loadAdminAssistSettings()
    const session = Session.getInstance()
    const onlineMatch =
      !this.container.isSinglePlayer && !session.botMode && !session.spectator
    const allowedMatch = isAdminAssistMatchAllowed(
      this.container.isSinglePlayer,
      session.botMode,
      false
    )
    const enabled = onlineMatch
      ? settings.onlineEnabled
      : settings.offlineEnabled
    const controller = this.container.controller
    if (
      !enabled ||
      !allowedMatch ||
      !canUseAdminAssist() ||
      Session.isSpectator() ||
      this.container.view.robotPlayers?.chalking ||
      !hasManualOpeningShot(this.container.manualShotCount) ||
      !(controller instanceof Aim || controller instanceof PlaceBall) ||
      !this.container.table.allStationary()
    ) {
      this.cancel()
      return
    }
    if (this.scheduled === controller) return
    this.cancel(false)
    this.scheduled = controller
    this.timer = globalThis.setTimeout(
      () => void this.beginSequence(controller, settings.level),
      Math.max(420, 760 - settings.level * 22)
    )
  }

  private async beginSequence(
    controller: Aim | PlaceBall,
    level: number
  ): Promise<void> {
    this.timer = undefined
    if (!this.isCurrent(controller)) {
      this.cancel()
      return
    }
    if (controller instanceof PlaceBall) {
      this.animatePlacement(controller, level)
      return
    }
    const context = this.context(level)
    if (context.validTargetBalls.length === 0) {
      this.cancel()
      return
    }
    const planningToken = ++this.sequence
    const planned =
      level === 11
        ? ((await this.planPhysicalClearanceShot(context).catch(
            () => undefined
          )) ?? planAdminClearanceShot(context, this.calculator))
        : undefined
    if (planningToken !== this.sequence || !this.isCurrent(controller)) return
    const strategy = level >= 6 ? new TheFarJaw() : new ClawBreak()
    const events = planned ? [planned] : strategy.aim(context, this.calculator)
    const hit = events.find((event) => event instanceof HitEvent) as
      HitEvent | undefined
    if (!hit?.tablejson?.aim) {
      this.cancel()
      return
    }

    this.animateAim(controller, AimEvent.fromJson(hit.tablejson.aim), level)
  }

  private async planPhysicalClearanceShot(
    context: BotShotContext
  ): Promise<HitEvent | undefined> {
    const candidates = enumerateAdminClearanceCandidates(
      context,
      this.calculator
    ).slice(0, 96)
    if (!candidates.length || !this.planner.available()) return undefined
    const hits = new Map<string, HitEvent>()
    const nextTargetIds = context.validTargetBalls.map(
      (ball) => ball.label ?? ball.id
    )
    const shotCandidates: ShotCandidate[] = candidates.map(
      (candidate, index) => {
        const id = `admin-${index}`
        const hit = this.calculator.generateShot(
          context.table,
          0,
          candidate.power,
          candidate.aimPoint,
          candidate.spin
        )
        hits.set(id, hit)
        const aim = AimEvent.fromJson(hit.tablejson.aim)
        const targetId = candidate.target.label ?? candidate.target.id
        return {
          id,
          targetId,
          kind: "pot",
          aim: {
            angle: aim.angle,
            power: aim.power,
            offset: { x: aim.offset.x, y: aim.offset.y },
            elevation: aim.elevation,
          },
          nextTargetIds: nextTargetIds.filter((value) => value !== targetId),
          geometryScore: candidate.score,
        }
      }
    )
    const request: BotPlanRequest = {
      type: "BOT_PLAN",
      id: `admin-clearance-${Date.now()}-${this.sequence}`,
      ruleType: context.ruleName,
      cueBallId: context.cueBall.label ?? context.cueBall.id,
      balls: context.table.balls.map((ball) => ({
        id: ball.label ?? ball.id,
        pos: { x: ball.pos.x, y: ball.pos.y },
        onTable: ball.onTable(),
      })),
      candidates: shotCandidates,
      level: 11,
      planningDeadlineMs: 900,
    }
    const result = await this.planner.plan(request)
    return hits.get(result.candidateId)
  }

  private animateAim(controller: Aim, target: AimEvent, level: number): void {
    const cue = this.container.table.cue
    const start = cue.aim.copy()
    const angleDelta = shortestAngleDelta(start.angle, target.angle)
    const reducedMotion =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
      false
    const timings = adminAimMotionTimings(angleDelta, level, reducedMotion)
    const orientEnd = timings.orientMs
    const fineEnd = orientEnd + timings.fineTuneMs
    const thinkEnd = fineEnd + timings.thinkMs
    const total = thinkEnd + timings.pullBackMs
    const fineAmplitude = reducedMotion
      ? 0
      : 0.004 + ((11 - Math.max(1, Math.min(11, level))) / 10) * 0.008
    const token = ++this.sequence
    let startedAt: number | undefined

    this.activatePov()

    const frame = (now: number) => {
      if (token !== this.sequence || !this.isCurrent(controller)) {
        this.cancel()
        return
      }
      startedAt ??= now
      const elapsed = now - startedAt
      const current = cue.aim

      if (elapsed < orientEnd) {
        const progress = smoothStep(elapsed / timings.orientMs)
        current.angle = start.angle + angleDelta * progress
        current.offset.copy(start.offset).lerp(target.offset, progress)
        current.elevation =
          start.elevation + (target.elevation - start.elevation) * progress
        current.power =
          start.power + (target.power * 0.35 - start.power) * progress
      } else if (elapsed < fineEnd) {
        const progress = (elapsed - orientEnd) / timings.fineTuneMs
        const settle = 1 - smoothStep(progress)
        current.angle =
          target.angle +
          Math.sin(progress * Math.PI * 4) * fineAmplitude * settle
        current.offset.copy(target.offset)
        current.elevation = target.elevation
        current.power = target.power * (0.35 + smoothStep(progress) * 0.2)
      } else if (elapsed < thinkEnd) {
        current.angle = target.angle
        current.offset.copy(target.offset)
        current.elevation = target.elevation
        current.power = target.power * 0.55
      } else {
        const progress = smoothStep((elapsed - thinkEnd) / timings.pullBackMs)
        current.angle = target.angle
        current.offset.copy(target.offset)
        current.elevation = target.elevation
        current.power = target.power * (0.55 + progress * 0.45)
      }

      current.pos.copy(this.container.table.cueball.pos)
      current.i = this.container.table.balls.indexOf(
        this.container.table.cueball
      )
      cue.updateAimInput()
      this.container.throttle.send(current.copy())

      if (elapsed < total) {
        this.animationFrame = globalThis.requestAnimationFrame(frame)
        return
      }

      this.animationFrame = undefined
      this.applyTargetAim(target)
      this.container.sendEvent(target.copy())
      this.timer = globalThis.setTimeout(() => {
        this.timer = undefined
        if (token !== this.sequence || !this.isCurrent(controller)) return
        this.container.updateController(controller.playShot("assist"))
        this.scheduled = undefined
      }, timings.strikeDelayMs)
    }

    this.animationFrame = globalThis.requestAnimationFrame(frame)
  }

  private applyTargetAim(target: AimEvent): void {
    const aim = this.container.table.cue.aim
    aim.angle = target.angle
    aim.offset.copy(target.offset)
    aim.elevation = target.elevation
    aim.power = target.power
    aim.pos.copy(this.container.table.cueball.pos)
    aim.i = this.container.table.balls.indexOf(this.container.table.cueball)
    this.container.table.cue.updateAimInput()
  }

  private isCurrent(controller: Aim | PlaceBall): boolean {
    return (
      this.container.controller === controller &&
      this.container.table.allStationary()
    )
  }

  private animatePlacement(controller: PlaceBall, level: number): void {
    const cueball = this.container.table.cueball
    const cue = this.container.table.cue
    const start = cueball.pos.clone()
    const target = this.placementTarget()
    const duration = 780 + (11 - Math.max(1, Math.min(11, level))) * 24
    const token = ++this.sequence
    let startedAt: number | undefined
    const frame = (now: number) => {
      if (token !== this.sequence || !this.isCurrent(controller)) {
        this.cancel()
        return
      }
      startedAt ??= now
      const progress = smoothStep((now - startedAt) / duration)
      cueball.pos.copy(start).lerp(target, progress)
      cueball.fround()
      cueball.updateMesh(0)
      cue.moveTo(cueball.pos)
      cue.aim.pos.copy(cueball.pos)
      this.container.throttle.send(cue.aim.copy())
      if (progress < 1) {
        this.animationFrame = globalThis.requestAnimationFrame(frame)
        return
      }
      this.animationFrame = undefined
      this.container.updateController(controller.placed())
      this.scheduled = undefined
    }
    this.animationFrame = globalThis.requestAnimationFrame(frame)
  }

  private placementTarget(): Vector3 {
    const table = this.container.table
    const cueball = table.cueball
    const current = cueball.pos.clone()
    const targets = this.validTargets()
    for (const target of targets) {
      for (const pocket of this.calculator.pockets) {
        const away = target.pos.clone().sub(pocket).setZ(0).normalize()
        for (const distance of [5.5 * R, 7.5 * R, 10 * R]) {
          const candidate = this.container.rules.placeBall(
            target.pos.clone().addScaledVector(away, distance)
          )
          if (!table.overlapsAny(candidate, cueball)) return candidate
        }
      }
    }
    return this.container.rules.placeBall(current)
  }

  private activatePov(): void {
    const camera = this.container.view.camera
    if (!this.previousCameraMode) this.previousCameraMode = camera.mode
    this.container.cameraModeOverride = this.enforcePov
    this.enforcePov()
  }

  private releasePov(): void {
    if (this.container.cameraModeOverride === this.enforcePov) {
      this.container.cameraModeOverride = undefined
    }
    if (this.previousCameraMode) {
      this.container.view.camera.forceMode(this.previousCameraMode)
      this.previousCameraMode = undefined
    }
  }

  private cancel(releasePov = true): void {
    this.sequence++
    if (this.timer) globalThis.clearTimeout(this.timer)
    if (this.animationFrame !== undefined) {
      globalThis.cancelAnimationFrame(this.animationFrame)
    }
    this.timer = undefined
    this.animationFrame = undefined
    this.scheduled = undefined
    if (releasePov) this.releasePov()
  }

  private context(level: number): BotShotContext {
    const table = this.container.table
    return {
      table,
      cueBall: table.cueball,
      validTargetBalls: this.validTargets(),
      ballInHand: false,
      ruleName: this.container.rules.rulename,
      shotIndex: this.container.recorder.entries.filter(
        (entry) => entry.event.type === EventType.AIM
      ).length,
      level,
    }
  }

  private validTargets(): Ball[] {
    const table = this.container.table
    const cueball = table.cueball
    const balls = table.balls.filter(
      (ball) => ball !== cueball && ball.onTable()
    )
    if (this.container.rules.rulename === "eightball") {
      const group = Session.getInstance().p1type
      if (group === 0) return balls.filter((ball) => ball.label !== 8)
      const groupBalls = balls.filter((ball) =>
        group === 1
          ? (ball.label ?? 0) >= 1 && (ball.label ?? 0) <= 7
          : (ball.label ?? 0) >= 9 && (ball.label ?? 0) <= 15
      )
      return groupBalls.length
        ? groupBalls
        : balls.filter((ball) => ball.label === 8)
    }
    if (this.container.rules.rulename === "threecushion") return balls
    if (this.container.rules.rulename === "sagu") {
      const otherCue = this.container.rules.otherPlayersCueBall()
      return balls.filter((ball) => ball !== otherCue)
    }
    const next = this.container.rules.nextCandidateBall()
    return next ? [next] : balls.slice(0, 1)
  }
}
