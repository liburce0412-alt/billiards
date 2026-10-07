import { expect, test } from "@playwright/test"
import { writeFile } from "node:fs/promises"

test("robots yield at occupied bays and stand in first person before walking", async ({
  browser,
}) => {
  test.setTimeout(60000)
  const context = await browser.newContext({
    viewport: { width: 915, height: 412 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await page.addInitScript(() =>
    localStorage.setItem("break-builder.controls-seen.v2", "acknowledged")
  )
  await page.goto(
    "/?play=1&platformDemo=1&ruletype=eightball&practice=true&quality=high&camera=3d&environment=aurora-hall"
  )
  await page.waitForFunction(
    () => (globalThis as any).container?.view.robotPlayers
  )
  await page.locator("#cueHit").click()
  if (await page.locator("#gameSocialClose").isVisible())
    await page.locator("#gameSocialClose").click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as any).container.view.robotPlayers.cameraFrame.walking
      )
    )
    .toBe(false)
  const separation = await page.evaluate(async () => {
    const game = (globalThis as any).container
    const robots = game.view.robotPlayers
    robots.players[1].rail = robots.players[0].rail
    game.view.camera.orbitByPixels(0, 0)
    game.view.camera.orbitTarget.set(0, 0, 0.3)
    game.view.camera.orbitDistance = 4.2
    game.view.camera.orbitElevation = 0.55
    game.view.camera.orbitAzimuth = 1.2
    let minimum = Infinity
    for (let i = 0; i < 60; i++) {
      await new Promise(requestAnimationFrame)
      minimum = Math.min(
        minimum,
        robots.players[0].position.distanceTo(robots.players[1].position)
      )
    }
    return minimum
  })
  expect(separation).toBeGreaterThanOrEqual(0.8499)
  await page.screenshot({
    path: "docs/qa/2026-09-05-player-perspective/avoidance.png",
  })
  await page.evaluate(() => {
    const game = (globalThis as any).container
    const cue = game.table.cue
    const camera = game.view.camera
    camera.orbitTarget.set(0, cue.length * 0.28, 0)
    cue.cueBody.localToWorld(camera.orbitTarget)
    camera.orbitDistance = 0.27
    camera.orbitElevation = 1.1
    camera.orbitAzimuth = 0.8 - cue.aim.angle
  })
  await page.screenshot({
    path: "docs/qa/2026-09-05-player-perspective/thumb.png",
  })
  await page.evaluate(() =>
    (globalThis as any).container.view.camera.beginAimTurn(true)
  )
  await expect
    .poll(() =>
      page.evaluate(() => {
        const game = (globalThis as any).container
        return game.view.camera.camera.position.distanceTo(
          game.view.robotPlayers.cameraFrame.eye
        )
      })
    )
    .toBeLessThan(0.01)
  await page.screenshot({
    path: "docs/qa/2026-09-05-player-perspective/eyes-aim.png",
  })
  const rail = (await page.locator("#powerSliderContainer").boundingBox())!
  const cdp = await context.newCDPSession(page)
  const touch = (y: number) => [
    { id: 1, x: rail.x + rail.width / 2, y, radiusX: 6, radiusY: 6 },
  ]
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: touch(rail.y + 8),
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: touch(rail.y + rail.height * 0.7),
  })
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  })
  await page.waitForFunction(
    () => (globalThis as any).container.view.camera.shotView?.elapsed > 2.1
  )
  const standing = await page.evaluate(() => {
    const game = (globalThis as any).container
    const robots = game.view.robotPlayers
    const active = robots.players[robots.active]
    return {
      eyeDistance: game.view.camera.camera.position.distanceTo(
        robots.cameraFrame.eye
      ),
      firstPerson: active.root.userData.firstPerson,
      helmetVisible: active.root.getObjectByName("shell-helmet").visible,
    }
  })
  expect(standing.eyeDistance).toBeLessThan(0.001)
  expect(standing.firstPerson).toBe(true)
  expect(standing.helmetVisible).toBe(false)
  await page.screenshot({
    path: "docs/qa/2026-09-05-player-perspective/eyes-standing.png",
  })
  await page.waitForFunction(
    () => (globalThis as any).container.table.allStationary(),
    undefined,
    { timeout: 20000 }
  )
  // Arrange the next stationary shot on the other side of the table.
  await page.evaluate(() => {
    const game = (globalThis as any).container
    game.table.cueball.pos.set(0.7, 0, game.table.cueball.pos.z)
    game.table.cue.aim.pos.copy(game.table.cueball.pos)
    game.table.cue.aim.angle = Math.PI
    game.view.camera.beginAimTurn(true)
  })
  await page.waitForFunction(() => {
    const game = (globalThis as any).container
    const robots = game.view.robotPlayers
    return (
      robots.cameraFrame.walking &&
      !robots.players[robots.active].root.userData.firstPerson &&
      game.view.camera.camera.position.distanceTo(robots.cameraFrame.eye) > 1 &&
      game.view.camera.camera.position.distanceTo(game.view.camera.target) < 0.6
    )
  })
  await page.screenshot({
    path: "docs/qa/2026-09-05-player-perspective/walking.png",
  })
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const game = (globalThis as any).container
          return game.view.camera.camera.position.distanceTo(
            game.view.robotPlayers.cameraFrame.eye
          )
        }),
      { timeout: 15000 }
    )
    .toBeLessThan(0.01)
  await writeFile(
    "docs/qa/2026-09-05-player-perspective/browser-evidence.json",
    JSON.stringify({ minimumSeparation: separation, standing, errors }, null, 2)
  )
  expect(errors).toEqual([])
  await context.close()
})
