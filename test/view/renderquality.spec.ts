import { expect } from "chai"
import { Session } from "../../src/network/client/session"
import { getRenderQuality } from "../../src/view/renderquality"

describe("RenderQuality", () => {
  afterEach(() => Session.reset())

  it("lets the quality URL parameter override lod", () => {
    Session.init("id", "player", "table", false, false, false, false, 0)
    const quality = getRenderQuality(new URLSearchParams("quality=high"))
    expect(quality.name).to.equal("high")
    expect(quality.shadowMapSize).to.equal(2048)
  })

  it("maps legacy lod values when quality is absent", () => {
    Session.init("id", "player", "table", false, false, false, false, 3)
    expect(getRenderQuality(new URLSearchParams()).name).to.equal("balanced")
  })
})
