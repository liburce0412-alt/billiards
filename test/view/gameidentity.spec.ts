import { demoSession } from "../../src/platform/api"
import {
  publishVerifiedGameIdentity,
  verifiedGameIdentity,
} from "../../src/platform/gameidentity"

describe("verified game identity", () => {
  afterEach(() => {
    globalThis.__BREAK_BUILDER_GAME_IDENTITY__ = undefined
  })

  it("carries the server profile needed by the match HUD", () => {
    const session = demoSession()
    session.user.avatarUrl = "/media/avatar/me"

    publishVerifiedGameIdentity(session)

    expect(verifiedGameIdentity()).toEqual({
      userId: session.user.id,
      username: session.user.username,
      displayName: session.user.displayName,
      avatarUrl: "/media/avatar/me",
      cueStyle: "heritage",
      role: "admin",
      visibility: "online",
      onlineEnabled: true,
      adminDemoAssist: true,
    })
  })
})
