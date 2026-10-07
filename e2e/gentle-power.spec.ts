import { expect, test } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"

for (const mobile of [false, true]) {
  test(`ten percent permits a short gentle shot (${mobile ? "touch" : "mouse"})`, async ({
    browser,
  }) => {
    test.setTimeout(60000)
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 915, height: 412 }
        : { width: 1440, height: 810 },
      hasTouch: mobile,
      isMobile: mobile,
    })
    const page = await context.newPage()
    await page.addInitScript(() =>
      localStorage.setItem("break-builder.controls-seen.v2", "acknowledged")
    )
    await page.goto(
      "/?play=1&platformDemo=1&ruletype=eightball&practice=true&quality=low&camera=3d"
    )
    await page.waitForFunction(
      () => (globalThis as any).container?.view.robotPlayers
    )
    await page.locator("#cueHit").click()
    if (await page.locator("#gameSocialClose").isVisible())
      await page.locator("#gameSocialClose").click()
    await page.evaluate(() => {
      const game = (globalThis as any).container
      game.table.cueball.pos.set(-0.5, -0.4, 0)
      game.table.cue.moveTo(game.table.cueball.pos)
      game.table.cue.aim.angle = 0
      game.table.cue.aim.offset.set(0, 0, 0)
      game.table.cue.aim.elevation = 0
      const ball = game.table.cueball
      const origin = ball.pos.clone()
      const evidence = ((globalThis as any).gentleShot = {
        speed: 0,
        distance: 0,
      })
      const hit = game.table.hit.bind(game.table)
      game.table.hit = () => {
        hit()
        evidence.speed = ball.vel.length()
      }
      const advance = game.table.advance.bind(game.table)
      game.table.advance = (...args: any[]) => {
        advance(...args)
        evidence.distance = Math.max(
          evidence.distance,
          ball.pos.distanceTo(origin)
        )
      }
    })
    await page.waitForFunction(
      () => (globalThis as any).container.view.robotPlayers.readyToStrike
    )
    const points = await page.evaluate(() => {
      const input = (globalThis as any).container.table.cue.aimInputs
      const geometry = input.powerArcRenderer.getGeometry()
      const rect = input.powerSliderContainerElement.getBoundingClientRect()
      return [0, 0.1].map((value) => {
        const p = geometry.pointAt(value)
        return { x: rect.left + p.x, y: rect.top + p.y }
      })
    })
    if (mobile) {
      const cdp = await context.newCDPSession(page)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ id: 1, ...points[0] }],
      })
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ id: 1, ...points[1] }],
      })
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      })
    } else {
      await page.mouse.move(points[0].x, points[0].y)
      await page.mouse.down()
      await page.mouse.move(points[1].x, points[1].y, { steps: 5 })
      await page.mouse.up()
    }
    await page.waitForFunction(() => (globalThis as any).gentleShot.speed > 0)
    await page.waitForFunction(() =>
      (globalThis as any).container.table.allStationary()
    )
    const evidence = await page.evaluate(() => (globalThis as any).gentleShot)
    expect(evidence.speed).toBeGreaterThan(0.35)
    expect(evidence.speed).toBeLessThan(0.45)
    expect(evidence.distance).toBeGreaterThan(0.02)
    expect(evidence.distance).toBeLessThan(0.6)
    const folder = "docs/qa/2026-09-08-gentle-power"
    await mkdir(folder, { recursive: true })
    await writeFile(
      `${folder}/${mobile ? "touch" : "mouse"}.json`,
      JSON.stringify(evidence, null, 2)
    )
    await context.close()
  })
}
