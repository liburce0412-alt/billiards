// src/network/client/scorereporter.ts
import { MatchResult } from "./matchresult"

export class ScoreReporter {
  constructor(_baseURL?: string) {}

  async submitMatchResult(_result: MatchResult): Promise<void> {
    // The legacy third-party scoreboard is intentionally disconnected.
    // Match persistence will use the authenticated first-party room API.
  }
}
