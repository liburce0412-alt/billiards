import { Vector3 } from "three"
import { Ball, State } from "./ball"
import { OutcomeType } from "./outcome"
import { mathavanAdapter, cueStrike } from "./physics/physics"
import * as Constants from "./physics/constants"
import { applyPhysicsProfileForRule } from "./physics/profile"
import { strongeAdapter } from "./physics/stronge"
import { Table } from "./table"
import { TableConfig } from "../view/tableconfig"
import { TableGeometry } from "../view/tablegeometry"

export interface ShotSimulationBall {
  id: number
  pos: { x: number; y: number }
  onTable?: boolean
}

export interface ShotSimulationInput {
  id?: string
  ruleType: string
  balls: ShotSimulationBall[]
  cushionModel?: "mathavan" | "stronge"
  shot: {
    cueBallId: number
    angle: number
    power: number
    offset: { x: number; y: number }
    elevation?: number
  }
  stepSize?: number
  maxIterations?: number
  params?: Record<string, unknown>
  warpClearanceR?: number
  recordTrajectory?: boolean
}

export interface ShotSimulationOutcome {
  type: OutcomeType
  ballA?: number
  ballB?: number
  speed: number
  t: number
  cushion?: string
}

export interface ShotSimulationResult {
  type: "COMPLETE"
  id?: string
  computeTime: string
  simulatedTime: number
  actualIterations: number
  speedupFactor: string
  tableX: number
  tableY: number
  frames: { t: number; balls: { id: number; pos: number[] }[] }[]
  outcomes: ShotSimulationOutcome[]
  finalBalls: {
    id: number
    pos: { x: number; y: number }
    onTable: boolean
  }[]
  exhausted: boolean
}

export type SimulationCheckpoint = (
  label: string,
  detail?: Record<string, unknown>
) => void

function getFrame(table: Table) {
  return {
    t: table.time / 1000,
    balls: table.balls.map((ball) => ({
      id: ball.label ?? ball.id,
      pos: [ball.pos.x, ball.pos.y],
    })),
  }
}

function ballToCushionDist(ball: Ball): number {
  return Math.min(
    TableGeometry.tableX - Math.abs(ball.pos.x),
    TableGeometry.tableY - Math.abs(ball.pos.y)
  )
}

function anyCushionTooClose(
  rollingBalls: Ball[],
  clearance: number,
  radius: number
): boolean {
  return rollingBalls.some(
    (ball) => ballToCushionDist(ball) <= clearance - radius
  )
}

function anyBallTooClose(
  rollingBalls: Ball[],
  allBalls: Ball[],
  clearance: number
): boolean {
  return rollingBalls.some((ballA) =>
    allBalls.some(
      (ballB) => ballA !== ballB && ballA.pos.distanceTo(ballB.pos) <= clearance
    )
  )
}

function minTimeToBallCollision(
  ballA: Ball,
  speedA: number,
  ballB: Ball,
  radius: number
): number | undefined {
  const dx = ballA.pos.x - ballB.pos.x
  const dy = ballA.pos.y - ballB.pos.y
  const dvx = ballA.vel.x - ballB.vel.x
  const dvy = ballA.vel.y - ballB.vel.y
  const dot = dx * dvx + dy * dvy
  if (dot >= 0) return undefined
  const speedB = ballB.vel.length()
  const distance = Math.sqrt(dx * dx + dy * dy)
  return (distance - 2 * radius) / (speedA + speedB)
}

export function calcMinWarpTime(
  rollingBalls: Ball[],
  allBalls: Ball[],
  radius: number
): number {
  let minTime = Infinity
  for (const ballA of rollingBalls) {
    const speedA = ballA.vel.length()
    if (speedA === 0) continue

    minTime = Math.min(minTime, (ballToCushionDist(ballA) - radius) / speedA)
    for (const ballB of allBalls) {
      if (ballA === ballB) continue
      const collisionTime = minTimeToBallCollision(ballA, speedA, ballB, radius)
      if (collisionTime !== undefined) {
        minTime = Math.min(minTime, collisionTime)
      }
    }
  }
  return minTime === Infinity ? 0 : minTime
}

function getFastWarpTime(
  table: Table,
  radius: number,
  clearance: number
): number {
  const balls: Ball[] = []
  const rollingBalls: Ball[] = []
  for (const ball of table.balls) {
    if (!ball.onTable()) continue
    if (ball.state === State.Sliding) return 0
    if (ball.state === State.Rolling) {
      if (ball.vel.length() < radius / 32) return 0
      rollingBalls.push(ball)
    }
    balls.push(ball)
  }

  if (anyCushionTooClose(rollingBalls, clearance, radius)) return 0
  if (anyBallTooClose(rollingBalls, balls, clearance)) return 0
  return calcMinWarpTime(rollingBalls, balls, radius)
}

function configureSimulation(
  params: Record<string, unknown>,
  ruleType: string,
  table: Table,
  cushionModel: string
): number {
  applyPhysicsProfileForRule(ruleType)
  for (const [key, value] of Object.entries(params)) {
    const setterName = `set${key}`
    if (typeof (Constants as any)[setterName] === "function") {
      ;(Constants as any)[setterName](Number(value))
    }
  }

  const tableSize = Number(params.tableSize ?? 10)
  TableConfig.apply(ruleType, tableSize)
  table.cushionModel =
    cushionModel === "mathavan" ? mathavanAdapter : strongeAdapter
  return Constants.R
}

function createTable(input: ShotSimulationInput): Table {
  Ball.id = 0
  const balls = input.balls.map((source) => {
    const ball = new Ball(
      new Vector3(source.pos.x, source.pos.y, 0),
      0xffffff,
      source.id
    )
    if (source.onTable === false) ball.state = State.InPocket
    return ball
  })
  return new Table(balls)
}

export function simulateShotSync(
  input: ShotSimulationInput,
  checkpoint: SimulationCheckpoint = () => {}
): ShotSimulationResult {
  const startTime = performance.now()
  if (!input.balls || !input.shot) {
    throw new Error("Missing required config: balls or shot")
  }
  checkpoint("Inputs received", {
    configKeys: Object.keys(input),
    id: input.id,
  })

  const table = createTable(input)
  const radius = configureSimulation(
    input.params ?? {},
    input.ruleType,
    table,
    input.cushionModel ?? "stronge"
  )
  table.cueball =
    table.balls.find((ball) => ball.label === input.shot.cueBallId) ??
    table.balls[0]

  table.time = 0
  const offset = new Vector3(input.shot.offset.x, input.shot.offset.y, 0)
  const strike = cueStrike(
    input.shot.angle,
    input.shot.power,
    offset,
    input.shot.elevation ?? 0
  )
  table.cueball.state = State.Sliding
  table.cueball.vel.copy(strike.vel)
  table.cueball.rvel.copy(strike.rvel)

  const stepSize = input.stepSize ?? 1 / 512
  const maxIterations = input.maxIterations ?? 200000
  const recordTrajectory = input.recordTrajectory ?? true
  const frames = recordTrajectory ? [getFrame(table)] : []
  let iterations = 0

  while (!table.allStationary() && iterations < maxIterations) {
    const warpTime = getFastWarpTime(
      table,
      radius,
      (input.warpClearanceR ?? 2.5) * radius
    )
    const dt =
      warpTime > stepSize
        ? Math.min(Math.floor(warpTime / stepSize) * stepSize, 25 * stepSize)
        : stepSize
    table.advance(dt)
    if (recordTrajectory) frames.push(getFrame(table))
    iterations++
    if (iterations % 10000 === 0) {
      checkpoint("Iteration progress", { iterations, t: table.time })
    }
  }

  const baselineIterations = table.time / (stepSize * 1000)
  const speedupFactor = iterations > 0 ? baselineIterations / iterations : 1
  return {
    type: "COMPLETE",
    id: input.id,
    computeTime: `${Math.round(performance.now() - startTime)}ms`,
    simulatedTime: table.time,
    actualIterations: iterations,
    speedupFactor: `${speedupFactor.toFixed(2)}x`,
    tableX: TableGeometry.tableX,
    tableY: TableGeometry.tableY,
    frames,
    outcomes: table.outcome.map((outcome) => ({
      type: outcome.type,
      ballA: outcome.ballA?.label ?? outcome.ballA?.id,
      ballB: outcome.ballB?.label ?? outcome.ballB?.id,
      speed: outcome.incidentSpeed,
      t: outcome.timestamp,
      cushion: outcome.cushion,
    })),
    finalBalls: table.balls.map((ball) => ({
      id: ball.label ?? ball.id,
      pos: { x: ball.pos.x, y: ball.pos.y },
      onTable: ball.onTable(),
    })),
    exhausted: iterations >= maxIterations,
  }
}
