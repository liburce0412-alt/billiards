import type { Ball } from "../ball"
import type { Table } from "../table"
import { surfaceVelocityFull } from "./physics"
import { I, m } from "./constants"
import { ShotStartUtils, type ShotStartConditions } from "../../utils/shotstart"

export interface BallPhysicsSnapshot {
  id: number
  label: number | null
  state: string
  position: [number, number, number]
  velocity: [number, number, number]
  angularVelocity: [number, number, number]
  slipSpeed: number
  kineticEnergy: number
}

export interface PhysicsStateSnapshot {
  simulatedMs: number
  totalKineticEnergy: number
  balls: BallPhysicsSnapshot[]
}

export type ShotPhysicsAnomalyKind =
  "non-finite" | "energy-increase" | "physics-recovery" | "watchdog"

export interface ShotPhysicsAnomaly {
  kind: ShotPhysicsAnomalyKind
  simulatedMs: number
  detail: string
}

export interface ShotPhysicsReport {
  version: 1
  startedAt: number
  active: boolean
  start: Omit<ShotStartConditions, "baseUrl"> | null
  recreateUrl: string
  frames: PhysicsStateSnapshot[]
  anomalies: ShotPhysicsAnomaly[]
}

const SAMPLE_INTERVAL_MS = 100
const MAX_FRAMES = 480
const ENERGY_RELATIVE_TOLERANCE = 0.1
const ENERGY_ABSOLUTE_TOLERANCE = 0.002

function tuple(vector: {
  x: number
  y: number
  z: number
}): [number, number, number] {
  return [vector.x, vector.y, vector.z]
}

function ballSnapshot(ball: Ball): BallPhysicsSnapshot {
  const translational = 0.5 * m * ball.vel.lengthSq()
  const rotational = 0.5 * I * ball.rvel.lengthSq()
  return {
    id: ball.id,
    label: ball.label ?? null,
    state: ball.state,
    position: tuple(ball.pos),
    velocity: tuple(ball.vel),
    angularVelocity: tuple(ball.rvel),
    slipSpeed: surfaceVelocityFull(ball.vel, ball.rvel).length(),
    kineticEnergy: translational + rotational,
  }
}

export function capturePhysicsState(table: Table): PhysicsStateSnapshot {
  const balls = table.balls.map(ballSnapshot)
  return {
    simulatedMs: table.time,
    totalKineticEnergy: balls.reduce(
      (total, ball) => total + ball.kineticEnergy,
      0
    ),
    balls,
  }
}

function sanitiseStart(
  start?: ShotStartConditions
): Omit<ShotStartConditions, "baseUrl"> | null {
  if (!start) return null
  const safe = { ...start }
  delete safe.baseUrl
  return safe
}

/**
 * Bounded, read-only evidence for diagnosing a shot that drifts or fails to
 * settle. It never changes ball state; the container remains responsible for
 * recovery policy.
 */
export class ShotPhysicsDiagnostics {
  private report?: ShotPhysicsReport
  private lastSampleMs = Number.NEGATIVE_INFINITY
  private previousEnergy?: number
  private energyWarningRecorded = false

  start(table: Table, startedAt = Date.now()): void {
    const initial = capturePhysicsState(table)
    const safeStart = sanitiseStart(table.shotStartConditions)
    this.report = {
      version: 1,
      startedAt,
      active: true,
      start: safeStart,
      recreateUrl: ShotStartUtils.buildRecreateUrl(safeStart ?? undefined),
      frames: [initial],
      anomalies: [],
    }
    this.lastSampleMs = table.time
    this.previousEnergy = initial.totalKineticEnergy
    this.energyWarningRecorded = false
    this.inspect(table)
  }

  inspect(table: Table, forceSample = false): ShotPhysicsAnomaly | undefined {
    if (!this.report) return undefined
    if (!this.report.active && !forceSample) return undefined
    // Keep per-step safety checks allocation-free; materialise full snapshots
    // only at sample points, rather than 512 times per second.
    let energy = 0
    let finite = Number.isFinite(table.time)
    let allOnTable = true
    for (const ball of table.balls) {
      finite =
        finite &&
        Number.isFinite(ball.pos.x) &&
        Number.isFinite(ball.pos.y) &&
        Number.isFinite(ball.pos.z)
      energy += 0.5 * m * ball.vel.lengthSq() + 0.5 * I * ball.rvel.lengthSq()
      allOnTable = allOnTable && ball.onTable()
    }
    if (!finite || !Number.isFinite(energy)) {
      const anomaly = this.recordAnomaly(
        "non-finite",
        table.time,
        "Ball position, velocity, rotation or derived energy is not finite"
      )
      this.pushFrame(capturePhysicsState(table))
      return anomaly
    }

    const previous = this.previousEnergy
    const energyIncreased =
      previous !== undefined &&
      allOnTable &&
      energy >
        previous * (1 + ENERGY_RELATIVE_TOLERANCE) + ENERGY_ABSOLUTE_TOLERANCE
    let anomaly: ShotPhysicsAnomaly | undefined
    if (energyIncreased && !this.energyWarningRecorded) {
      this.energyWarningRecorded = true
      anomaly = this.recordAnomaly(
        "energy-increase",
        table.time,
        `Kinetic energy increased from ${previous.toFixed(6)} to ${energy.toFixed(6)} J`
      )
    }
    this.previousEnergy = energy

    if (forceSample || table.time - this.lastSampleMs >= SAMPLE_INTERVAL_MS) {
      this.pushFrame(capturePhysicsState(table))
    }
    return anomaly
  }

  mark(
    kind: Exclude<ShotPhysicsAnomalyKind, "non-finite" | "energy-increase">,
    table: Table,
    detail: string
  ): void {
    if (!this.report) return
    this.inspect(table, true)
    this.recordAnomaly(kind, table.time, detail)
  }

  finish(table: Table): void {
    if (!this.report) return
    this.inspect(table, true)
    this.report.active = false
  }

  state(table: Table): PhysicsStateSnapshot {
    return capturePhysicsState(table)
  }

  lastShot(): ShotPhysicsReport | undefined {
    if (!this.report) return undefined
    return JSON.parse(JSON.stringify(this.report)) as ShotPhysicsReport
  }

  private pushFrame(snapshot: PhysicsStateSnapshot): void {
    if (!this.report) return
    const frames = this.report.frames
    const previous = frames[frames.length - 1]
    if (previous?.simulatedMs === snapshot.simulatedMs) {
      frames[frames.length - 1] = snapshot
    } else {
      frames.push(snapshot)
      if (frames.length > MAX_FRAMES)
        frames.splice(1, frames.length - MAX_FRAMES)
    }
    this.lastSampleMs = snapshot.simulatedMs
  }

  private recordAnomaly(
    kind: ShotPhysicsAnomalyKind,
    simulatedMs: number,
    detail: string
  ): ShotPhysicsAnomaly {
    const anomaly = { kind, simulatedMs, detail }
    if (!this.report) return anomaly
    const duplicate = this.report.anomalies.some(
      (entry) => entry.kind === kind && entry.detail === detail
    )
    if (!duplicate) this.report.anomalies.push(anomaly)
    return anomaly
  }
}
