import { gameOverButtons } from "../../src/utils/gameover"

describe("gameOverButtons", () => {
  let originalSearch: string

  beforeAll(() => {
    originalSearch = globalThis.location?.search || ""
  })

  afterAll(() => {
    if (globalThis.history && globalThis.location) {
      globalThis.history.replaceState({}, "", originalSearch || "?")
    }
  })

  describe("rematch", () => {
    it("keeps rematches inside the current room", () => {
      if (globalThis.history) {
        globalThis.history.replaceState({}, "", "?")
      }

      const html = gameOverButtons.rematch(
        "opponent-123",
        "Alice",
        "sagu",
        "turn-123"
      )
      expect(html).toContain('data-notification-action="rematch"')
      expect(html).toContain("邀请 Alice 再来一局")
      expect(html).toContain('data-rule="sagu"')
      expect(html).not.toContain("http")
    })

    it("does not redirect through a lobby URL", () => {
      if (globalThis.history) {
        globalThis.history.replaceState(
          {},
          "",
          "?userId=me&userName=Me&tableId=t123&websocketserver=ws://localhost&tableSize=5&raceTo=5&first=true"
        )
      }

      const html = gameOverButtons.rematch(
        "opponent-123",
        "Alice",
        "sagu",
        "turn-123"
      )
      expect(html).toContain('data-notification-action="rematch"')
      expect(html).not.toContain("tableSize=5")
      expect(html).not.toContain("raceTo=5")
      expect(html).not.toContain("userId=me")
      expect(html).not.toContain("userName=Me")
      expect(html).not.toContain("tableId=t123")
      expect(html).not.toContain("first=true")
    })
  })
})
