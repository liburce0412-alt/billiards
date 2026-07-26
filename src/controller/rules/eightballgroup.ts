import { Ball } from "../../model/ball"
import { Outcome } from "../../model/outcome"

export type EightBallGroup = 0 | 1 | 2

function groupForBall(ball: Ball | null | undefined): EightBallGroup {
  const label = ball?.label ?? 0
  if (label >= 1 && label <= 7) return 1
  if (label >= 9 && label <= 15) return 2
  return 0
}

export function eightBallGroupAfterShot(
  cueball: Ball,
  outcome: Outcome[],
  opening: boolean
): EightBallGroup {
  if (opening) return 0

  const pottedGroups = new Set(
    Outcome.pots(outcome)
      .map(groupForBall)
      .filter((group): group is 1 | 2 => group !== 0)
  )
  if (pottedGroups.size !== 1) return 0

  const firstContact = Outcome.firstCollision(
    Outcome.cueBallFirst(cueball, outcome)
  )?.ballB
  const contactedGroup = groupForBall(firstContact)
  const [pottedGroup] = Array.from(pottedGroups)
  return contactedGroup === pottedGroup ? pottedGroup : 0
}
