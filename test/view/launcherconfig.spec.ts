import { expect } from "chai"
import { buildGameUrl, shouldShowLauncher } from "../../src/launcherconfig"

describe("Launcher configuration", () => {
  it("shows the launcher at the bare site root", () => {
    expect(shouldShowLauncher(new URLSearchParams())).to.be.true
    expect(shouldShowLauncher(new URLSearchParams("quality=high"))).to.be.true
  })

  it("keeps existing direct game links compatible", () => {
    expect(shouldShowLauncher(new URLSearchParams("ruletype=eightball"))).to.be
      .false
    expect(shouldShowLauncher(new URLSearchParams("bot=TheFarJaw"))).to.be.false
    expect(shouldShowLauncher(new URLSearchParams("state=replay"))).to.be.false
  })

  it("builds a local AI game URL", () => {
    const url = new URL(
      buildGameUrl(
        { rule: "eightball", opponent: "TheFarJaw", quality: "high" },
        "https://example.test/index.html?old=value#fragment"
      )
    )
    expect(url.searchParams.get("play")).to.equal("1")
    expect(url.searchParams.get("ruletype")).to.equal("eightball")
    expect(url.searchParams.get("bot")).to.equal("TheFarJaw")
    expect(url.searchParams.get("practice")).to.equal("false")
    expect(url.searchParams.get("quality")).to.equal("high")
    expect(url.searchParams.has("old")).to.be.false
    expect(url.hash).to.equal("")
  })

  it("builds a practice URL without a bot", () => {
    const url = new URL(
      buildGameUrl(
        { rule: "snooker", opponent: "practice", quality: "balanced" },
        "https://example.test/"
      )
    )
    expect(url.searchParams.get("practice")).to.equal("true")
    expect(url.searchParams.has("bot")).to.be.false
  })
})
