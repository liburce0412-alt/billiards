import { mountViewportCoordinator } from "../../src/platform/viewport"
import { MobileGameViewport } from "../../src/view/mobilegameviewport"

describe("mobile viewport coordination", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("class")
    document.documentElement.removeAttribute("style")
    document.body.className = ""
    document.body.innerHTML = ""
    sessionStorage.clear()
    Object.defineProperty(globalThis, "innerWidth", {
      configurable: true,
      value: 390,
    })
    Object.defineProperty(globalThis, "innerHeight", {
      configurable: true,
      value: 844,
    })
  })

  it("locks only the game viewport and publishes stable CSS measurements", () => {
    const dispose = mountViewportCoordinator({ game: true })

    expect(document.body.classList.contains("game-viewport")).toBe(true)
    expect(
      document.documentElement.classList.contains("game-viewport-root")
    ).toBe(true)
    expect(
      document.documentElement.style.getPropertyValue("--bb-visual-height")
    ).toBe("844px")
    expect(document.documentElement.dataset.viewportOrientation).toBe(
      "portrait"
    )
    dispose()

    mountViewportCoordinator()
    expect(document.body.classList.contains("game-viewport")).toBe(false)
    expect(
      document.documentElement.classList.contains("game-viewport-root")
    ).toBe(false)
  })

  it("blocks portrait controls until the device is rotated", () => {
    document.body.innerHTML = `
      <section id="landscapePrompt" hidden>
        <button id="landscapeEnter"></button>
        <button id="landscapeContinue"></button>
      </section>
    `
    Object.defineProperty(globalThis, "matchMedia", {
      configurable: true,
      value: () => ({ matches: true }),
    })

    new MobileGameViewport().mount()
    const prompt = document.getElementById("landscapePrompt")!
    expect(prompt.hidden).toBe(false)
    expect(
      (document.getElementById("landscapeContinue") as HTMLButtonElement).hidden
    ).toBe(true)
    expect(document.body.classList.contains("portrait-controls-blocked")).toBe(
      true
    )
  })
})
