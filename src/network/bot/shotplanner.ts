import { OutcomeType } from "../../model/outcome"
import {
  ShotSimulationBall,
  ShotSimulationInput,
  ShotSimulationResult,
  simulateShotSync,
} from "../../model/shotsimulator"

export interface ShotCandidate {
  id: string
  targetId: number
  kind: "pot" | "escape" | "safety" | "carom"
  aim: {
    angle: number
    power: number
    offset: { x: number; y: number }
    elevation: number
  }
  nextTargetIds: number[]
  geometryScore: number
}

export interface BotDifficultyProfile {
  level: number
  candidateBudget: number
  positionWeight: number
  safetyWeight: number
  lookaheadDepth: 1 | 2
}

const candidateBudgets = [3, 4, 6, 8, 10, 14, 18, 24, 30, 40, 48]

export const BOT_DIFFICULTY_PROFILES: readonly BotDifficultyProfile[] =
  candidateBudgets.map((candidateBudget, index) => {
    const level = index + 1
    return {
      level,
      candidateBudget,
      positionWeight: level < 4 ? 0 : Math.min(0.72, (level - 3) * 0.09),
      safetyWeight: level < 6 ? 0.04 : Math.min(0.4, (level - 5) * 0.065),
      lookaheadDepth: level >= 9 ? 2 : 1,
    }
  })

export function botDifficultyProfile(level: number): BotDifficultyProfile {
  return BOT_DIFFICULTY_PROFILES[
    Math.max(0, Math.min(10, Math.round(level) - 1))
  ]
}

export interface BotPlanRequest {
  type: "BOT_PLAN"
  id: string
  ruleType: string
  cueBallId: number
  balls: ShotSimulationBall[]
  candidates: ShotCandidate[]
  level: number
  cushionModel?: "mathavan" | "stronge"
}

export interface BotPlanResult {
  type: "BOT_PLAN_COMPLETE"
  id: string
  candidateId: string
  candidateIndex: number
  score: number
  simulations: number
  elapsedMs: number
}

function finalCuePosition(
  result: ShotSimulationResult,
  cueBallId: number
): { x: number; y: number } | undefined {
  return result.finalBalls.find((ball) => ball.id === cueBallId)?.pos
}

function scoreCandidate(
  request: BotPlanRequest,
  candidate: ShotCandidate,
  result: ShotSimulationResult,
  profile: BotDifficultyProfile
): number {
  if (result.exhausted) return 100000

  const firstCollision = result.outcomes.find(
    (outcome) =>
      outcome.type === OutcomeType.Collision &&
      outcome.ballA === request.cueBallId
  )
  const cueBallPotted = result.outcomes.some(
    (outcome) =>
      outcome.type === OutcomeType.Pot && outcome.ballA === request.cueBallId
  )
  const targetPotted = result.outcomes.some(
    (outcome) =>
      outcome.type === OutcomeType.Pot && outcome.ballA === candidate.targetId
  )
  const objectPots = result.outcomes.filter(
    (outcome) =>
      outcome.type === OutcomeType.Pot && outcome.ballA !== request.cueBallId
  ).length

  let score = candidate.geometryScore * 12
  if (!firstCollision || firstCollision.ballB !== candidate.targetId) {
    score += 1800
  }
  if (cueBallPotted) score += 2400
  if (targetPotted) score -= 1300
  score -= objectPots * 220

  const cuePos = finalCuePosition(result, request.cueBallId)
  if (cuePos && candidate.nextTargetIds.length > 0) {
    const nextBalls = result.finalBalls.filter(
      (ball) => ball.onTable && candidate.nextTargetIds.includes(ball.id)
    )
    if (nextBalls.length > 0) {
      const nextDistance = Math.min(
        ...nextBalls.map((ball) =>
          Math.hypot(ball.pos.x - cuePos.x, ball.pos.y - cuePos.y)
        )
      )
      score += nextDistance * 180 * profile.positionWeight
    } else if (profile.lookaheadDepth === 2) {
      score -= 120
    }
    const railClearance = Math.min(
      result.tableX - Math.abs(cuePos.x),
      result.tableY - Math.abs(cuePos.y)
    )
    if (railClearance < 0.14) {
      score += (0.14 - railClearance) * 600 * profile.positionWeight
    }
  }

  if (!targetPotted && candidate.kind === "safety") {
    score -= 120 * profile.safetyWeight
  }
  return score
}

function simulationInput(
  request: BotPlanRequest,
  candidate: ShotCandidate
): ShotSimulationInput {
  return {
    id: `${request.id}:${candidate.id}`,
    ruleType: request.ruleType,
    balls: request.balls,
    cushionModel: request.cushionModel,
    shot: {
      cueBallId: request.cueBallId,
      angle: candidate.aim.angle,
      power: candidate.aim.power,
      offset: candidate.aim.offset,
      elevation: candidate.aim.elevation,
    },
    stepSize: 1 / 512,
    maxIterations: 45000,
    recordTrajectory: false,
  }
}

export function planBotShotSync(request: BotPlanRequest): BotPlanResult {
  const started = performance.now()
  const profile = botDifficultyProfile(request.level)
  const candidates = request.candidates.slice(0, profile.candidateBudget)
  if (candidates.length === 0) {
    throw new Error("Bot planner received no candidates")
  }

  const scored = candidates.map((candidate, candidateIndex) => {
    const result = simulateShotSync(simulationInput(request, candidate))
    return {
      candidate,
      candidateIndex,
      score: scoreCandidate(request, candidate, result, profile),
    }
  })
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.candidate.geometryScore - b.candidate.geometryScore ||
      a.candidateIndex - b.candidateIndex
  )
  const best = scored[0]
  return {
    type: "BOT_PLAN_COMPLETE",
    id: request.id,
    candidateId: best.candidate.id,
    candidateIndex: best.candidateIndex,
    score: best.score,
    simulations: candidates.length,
    elapsedMs: performance.now() - started,
  }
}
