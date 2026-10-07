import { expect } from "chai"
import { Session } from "../../src/network/client/session"
import {
  AdaptiveRenderQuality,
  getRenderQuality,
  pixelRatioForViewport,
  RENDER_QUALITY_STORAGE_KEY,
  renderQualityModeForPreference,
  saveRenderQualityMode,
  serverQualityForRenderMode,
} from "../../src/view/renderquality"

describe("RenderQuality", () => {
  afterEach(() => {
    Session.reset()
    localStorage.removeItem(RENDER_QUALITY_STORAGE_KEY)
  })

  it("lets the quality URL parameter override lod", () => {
    Session.init("id", "player", "table", false, false, false, false, 0)
    const quality = getRenderQuality(new URLSearchParams("quality=high"))
    expect(quality.name).to.equal("high")
    expect(quality.shadowMapSize).to.equal(2048)
  })

  it("starts visual-first adaptive mode at high quality", () => {
    Session.init("id", "player", "table", false, false, false, false, 3)
    expect(getRenderQuality(new URLSearchParams()).name).to.equal("high")
  })

  it("does not mistake the legacy high preference for an explicit lock", () => {
    expect(
      renderQualityModeForPreference("high", new URLSearchParams())
    ).to.equal("adaptive")
    expect(serverQualityForRenderMode("adaptive")).to.equal("high")
  })

  it("honours explicit URL or local locks ahead of the legacy preference", () => {
    saveRenderQualityMode("high")
    expect(
      renderQualityModeForPreference("high", new URLSearchParams())
    ).to.equal("high")
    expect(
      renderQualityModeForPreference(
        "high",
        new URLSearchParams("quality=adaptive")
      )
    ).to.equal("adaptive")
  })

  it("waits for a safe boundary before applying a sustained downgrade", () => {
    const controller = new AdaptiveRenderQuality("adaptive")
    let changes = 0
    controller.onChange(() => changes++)
    for (let i = 0; i < 220; i++) controller.observeFrame(40, false)
    expect(controller.profile.name).to.equal("high")
    expect(controller.observeFrame(40, true)).to.equal(true)
    expect(controller.profile.name).to.equal("balanced")
    expect(changes).to.equal(1)
  })

  it("never auto-downgrades a manually locked tier", () => {
    const controller = new AdaptiveRenderQuality("high")
    for (let i = 0; i < 300; i++) controller.observeFrame(50, true)
    expect(controller.profile.name).to.equal("high")
  })

  it("caps density by both display tier and canvas pixel budget", () => {
    const quality = getRenderQuality(new URLSearchParams("quality=high"))
    expect(pixelRatioForViewport(quality, 1000, 500, 3, true)).to.equal(2.5)
    expect(pixelRatioForViewport(quality, 2000, 1000, 3, true)).to.be.closeTo(
      Math.sqrt(1.75),
      0.0001
    )
  })
})
