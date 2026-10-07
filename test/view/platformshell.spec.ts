import { demoSession } from "../../src/platform/api"
import { applyPersonalisation } from "../../src/platform/shell"

describe("platform personalisation", () => {
  beforeEach(() => {
    globalThis.localStorage.clear()
    document.documentElement.className = ""
    document.documentElement.removeAttribute("data-accent")
  })

  it("projects synchronized account choices into every game subsystem", () => {
    const session = demoSession()
    session.user.accent = "jade"
    session.user.cueStyle = "carbon"
    session.user.tableStyle = "chinese-ivory"
    session.user.environmentStyle = "spectra"
    session.preferences.quality = "balanced"
    session.preferences.camera_mode = "free"
    session.preferences.master_volume = 0.45
    session.preferences.desktop_shot_dock = "collapsed"
    session.preferences.social_drawer_open = 0

    applyPersonalisation(session)

    expect(document.documentElement.dataset.accent).toBe("jade")
    expect(document.documentElement.dataset.quality).toBe("balanced")
    expect(document.documentElement.dataset.qualityMode).toBe("balanced")
    expect(localStorage.getItem("break-builder.render-quality")).toBe(
      "balanced"
    )
    expect(localStorage.getItem("break-builder.cue-style")).toBe("carbon")
    expect(localStorage.getItem("break-builder.table-style")).toBe(
      "chinese-ivory"
    )
    expect(localStorage.getItem("break-builder.environment-style")).toBe(
      "spectra"
    )
    expect(localStorage.getItem("billiards-camera-mode")).toBe("free")
    expect(localStorage.getItem("break-builder.master-volume")).toBe("0.45")
    expect(localStorage.getItem("break-builder.shot-dock")).toBe("collapsed")
    expect(localStorage.getItem("break-builder.social-drawer")).toBe("closed")
  })

  it("projects a legacy high default as adaptive until explicitly locked", () => {
    const session = demoSession()

    applyPersonalisation(session)

    expect(document.documentElement.dataset.quality).toBe("high")
    expect(document.documentElement.dataset.qualityMode).toBe("adaptive")
    expect(localStorage.getItem("break-builder.render-quality")).toBe(
      "adaptive"
    )
    expect(
      JSON.parse(localStorage.getItem("billiards-launcher-selection") ?? "{}")
        .quality
    ).toBe("adaptive")

    localStorage.setItem("break-builder.render-quality", "high")
    applyPersonalisation(session)
    expect(document.documentElement.dataset.qualityMode).toBe("high")
  })
})
