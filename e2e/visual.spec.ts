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
    await page.goto("/?platformDemo=1")
    await expect(page.locator("#launcherStart")).toBeVisible()
    await page.addStyleTag({
      content: `
        .holo-ambient {
          display: none !important;
        }
        .holo-launcher, .holo-choice-grid label, .holo-config-panel {
          animation: none !important;
          opacity: 1 !important;
          transform: none !important;
        }
      `,
    })
    await expect(page.locator(".holo-main")).toHaveScreenshot(
      `launcher-${viewport.name}.png`,
      {
        animations: "disabled",
        maxDiffPixelRatio: 0.015,
      }
    )
  })
}

for (const route of ["account", "lobby", "admin"] as const) {
  test(`${route} platform page renders`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`/${route}?platformDemo=1`)
    await expect(page.locator(".holo-legacy-boundary")).toBeVisible()
    await expect(page.locator(".holo-page-heading h1")).toBeVisible()
    await page.addStyleTag({
      content: `.holo-ambient { display: none !important; } * { animation: none !important; }`,
    })
    await expect(page.locator(".holo-main")).toHaveScreenshot(
      `${route}-desktop.png`,
      {
        animations: "disabled",
        maxDiffPixelRatio: 0.015,
      }
    )
  })
}

test("admin demo assist panel renders", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/admin?platformDemo=1")
  await page.getByRole("button", { name: "演示辅助" }).click()
  await expect(page.locator("#adminDemoOfflineEnabled")).toBeVisible()
  await page.addStyleTag({
    content: `.holo-ambient { display: none !important; } * { animation: none !important; }`,
  })
  await expect(page.locator(".holo-legacy-boundary")).toHaveScreenshot(
    "admin-demo-desktop.png",
    {
      animations: "disabled",
      maxDiffPixelRatio: 0.015,
    }
  )
})

for (const quality of ["low", "high"] as const) {
  test(`${quality} game table visual`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 750 })
    await page.addInitScript(() => {
      localStorage.setItem("break-builder.controls-seen.v2", "acknowledged")
    })
    await page.goto(
      `/?play=1&platformDemo=1&ruletype=eightball&practice=true&quality=${quality}&environment=nebula`
    )
    await page.waitForFunction(
      () =>
        (globalThis as any).container?.view?.assets?.table?.children.length > 0
    )
    await expect(
      page.locator(".hud-name", { hasText: "未来玩家" })
    ).toBeVisible()
    await expect(
      page.locator(".hud-player-detail", {
        hasText: "@future_player · ID 00000000",
      })
    ).toBeVisible()
    const socialClose = page.locator("#gameSocialClose")
    if (await socialClose.isVisible()) await socialClose.click()
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

test("3D game settings keeps the table visible behind the glass drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem("break-builder.controls-seen.v2", "acknowledged")
    localStorage.setItem("break-builder.social-drawer", "closed")
  })
  await page.goto(
    "/?play=1&platformDemo=1&ruletype=eightball&practice=true&quality=high&camera=2d&tableStyle=american-ivory&environment=spectra"
  )
  await page.waitForFunction(
    () =>
      (globalThis as any).container?.view?.assets?.table?.children.length > 0
  )
  const socialClose = page.locator("#gameSocialClose")
  if (await socialClose.isVisible()) await socialClose.click()
  await page.locator("#cueHit").click()
  await page.locator("#menu").click()
  await page.locator("#settingsCamera").click()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
  )
  await page.addStyleTag({
    content: `* { animation: none !important; transition: none !important; }`,
  })
  await expect(page.locator("#viewP1")).toHaveScreenshot(
    "game-settings-3d.png",
    {
      animations: "disabled",
      maxDiffPixelRatio: 0.025,
    }
  )
})

const authoredEnvironments = [
  "spectra",
  "galaxy",
  "nebula",
  "club",
  "aurora-hall",
  "sky-temple",
  "abyss-palace",
  "lunar-observatory",
] as const

for (const environment of authoredEnvironments) {
  test(`${environment} has a distinct 3D environment silhouette`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 600 })
    await page.addInitScript(() => {
      localStorage.setItem("break-builder.controls-seen.v2", "acknowledged")
      localStorage.setItem("break-builder.social-drawer", "closed")
    })
    await page.goto(
      `/?play=1&platformDemo=1&ruletype=eightball&practice=true&quality=high&camera=free&tableStyle=american-ivory&environment=${environment}`
    )
    await page.waitForFunction(
      () =>
        (globalThis as any).container?.view?.assets?.table?.children.length > 0
    )
    const socialClose = page.locator("#gameSocialClose")
    if (await socialClose.isVisible()) {
      await socialClose.click()
    }
    await page.locator("#cueHit").click()
    await page.evaluate(() => {
      const container = (globalThis as any).container
      const camera = container.view.camera
      camera.orbitInitialised = true
      camera.orbitAzimuth = Math.PI * 1.08
      camera.orbitElevation = Math.PI / 6
      camera.orbitDistance = 4.8
      camera.forceMode(camera.freeView)
      container.lastEventTime = performance.now()
    })
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
    )
    await expect(page.locator("#viewP1 > canvas")).toHaveScreenshot(
      `environment-${environment}.png`,
      {
        animations: "disabled",
        maxDiffPixelRatio: 0.03,
      }
    )
  })
}
