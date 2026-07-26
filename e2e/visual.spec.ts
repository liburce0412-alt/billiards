import { expect, test } from "@playwright/test"

const viewports = [
  { name: "phone", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1200, height: 750 },
  { name: "desktop", width: 1920, height: 1080 },
]

for (const viewport of viewports) {
  test(`launcher fits ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto("/")
    await expect(page.locator("#launcherStart")).toBeVisible()
    await expect(page.locator("#gameLauncher")).toHaveScreenshot(
      `launcher-${viewport.name}.png`,
      {
        animations: "disabled",
        maxDiffPixelRatio: 0.015,
      }
    )
  })
}

for (const quality of ["low", "high"] as const) {
  test(`${quality} game table visual`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 750 })
    await page.addInitScript(() => {
      localStorage.setItem("break-builder.controls-seen.v2", "acknowledged")
    })
    await page.goto(
      `/?play=1&ruletype=eightball&practice=true&quality=${quality}&environment=nebula`
    )
    await page.waitForFunction(
      () =>
        (globalThis as any).container?.view?.assets?.table?.children.length > 0
    )
    await page.evaluate(() => {
      ;(globalThis as any).container.animate = () => {}
    })
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
    )
    await expect(page.locator("#viewP1")).toHaveScreenshot(
      `game-${quality}.png`,
      {
        animations: "disabled",
        maxDiffPixelRatio: 0.025,
      }
    )
  })
}
