import { ScoreReporter } from "../../../src/network/client/scorereporter"
import { MatchResult } from "../../../src/network/client/matchresult"

describe("ScoreReporter", () => {
  it("never uploads results to a legacy or caller-supplied scoreboard", async () => {
    const originalFetch = globalThis.fetch
    const fetchMock = jest.fn()
    globalThis.fetch = fetchMock
    const result: MatchResult = {
      winner: "player1",
      loser: "player2",
      winnerScore: 9,
      loserScore: 7,
      ruleType: "nineball",
    }

    try {
      await new ScoreReporter("https://untrusted.invalid").submitMatchResult(
        result
      )
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
