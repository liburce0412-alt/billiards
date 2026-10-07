import { expect, test } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"

for (const mobile of [false, true]) {
  test(`near-rail cue remains in the shot frame (${mobile ? "touch" : "desktop"})`, async ({
    browser,
  }) => {
    test.setTimeout(60000)
    const context = await browser.newContext({
      viewport: mobile
        ? { width: 915, height: 412 }
        : { width: 1440, height: 810 },
      isMobile: mobile,
      hasTouch: mobile,
      recordVideo: {
        dir: ".tmp/immediate-shot-video",
        size: { width: 915, height: 412 },
      },
    })
    const page = await context.newPage()
    const folder = "docs/qa/2026-09-06-immediate-shot"
    await mkdir(folder, { recursive: true })
    await page.addInitScript(() => {
      localStorage.setItem("break-builder.controls-seen.v2", "acknowledged")
      localStorage.setItem("break-builder.social-drawer", "closed")
    })
    const errors: string[] = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.goto(
      "/?play=1&platformDemo=1&ruletype=eightball&practice=true&quality=high&camera=3d&cueStyle=royal&environment=aurora-hall"
    )
    await page.waitForFunction(
      () => (globalThis as any).container?.view.robotPlayers
    )
    await page.locator("#cueHit").click()
    if (await page.locator("#gameSocialClose").isVisible())
      await page.locator("#gameSocialClose").click()
    await page.evaluate(() => {
      const game = (globalThis as any).container
      game.table.cueball.pos.set(-1, -0.5, 0)
      game.table.cue.moveTo(game.table.cueball.pos)
      game.table.cue.aim.angle = Math.PI / 2
      game.view.camera.beginAimTurn(true)
    })
    await page.waitForFunction(() => {
      const game = (globalThis as any).container
      return (
        !game.view.robotPlayers.cameraFrame.walking &&
        game.view.robotPlayers.players[0].stance < 0.001 &&
        game.view.camera.camera.position.distanceTo(
          game.view.robotPlayers.cameraFrame.eye
        ) < 0.001
      )
    })
    const projection = await page.evaluate(() => {
      const game = (globalThis as any).container
      const camera = game.view.camera.camera
      camera.updateMatrixWorld()
      const cue = game.table.cue
      const shaft = cue.aim.pos.clone().set(0, cue.length * 0.4, 0)
      cue.cueBody.localToWorld(shaft)
      return {
        ball: cue.aim.pos.clone().project(camera).toArray(),
        shaft: shaft.project(camera).toArray(),
        visible: cue.cueBody.visible,
      }
    })
    expect(projection.visible).toBe(true)
    expect(Math.abs(projection.ball[0])).toBeLessThan(0.3)
    expect(projection.ball[1]).toBeGreaterThan(-0.75)
    expect(projection.shaft[1]).toBeGreaterThan(-0.9)
    const label = mobile ? "touch" : "desktop"
    await page.screenshot({ path: `${folder}/${label}-aim.png` })
    await page.evaluate(() => {
      const game = (globalThis as any).container
      const camera = game.view.camera
      const timing = ((globalThis as any).shotTiming = {})
      document.addEventListener(
        "pointerup",
        (event) => {
          if ((event.target as Element).closest("#powerSliderContainer")) {
            timing.releasedAt = performance.now()
            timing.readyAtRelease = game.view.robotPlayers.readyToStrike
          }
        },
        true
      )
      const hit = game.table.hit.bind(game.table)
      game.table.hit = () => {
        timing.contactAt = performance.now()
        hit()
      }
      const update = camera.update.bind(camera)
      ;(globalThis as any).cueShotSamples = []
      camera.update = (...args: any[]) => {
        update(...args)
        if (game.controller.isPreparingShot || camera.shotView?.elapsed < 1) {
          camera.camera.updateMatrixWorld()
          const cue = game.table.cue
          const shaft = cue.aim.pos.clone().set(0, cue.length * 0.4, 0)
          cue.cueBody.localToWorld(shaft)
          ;(globalThis as any).cueShotSamples.push({
            visible: cue.cueBody.visible && cue.mesh.visible,
            shaft: shaft.project(camera.camera).toArray(),
            position: cue.cueBody.position.toArray(),
            stroke: cue.preStrokeProgress,
            shotTime: camera.shotView?.elapsed,
            walking: game.view.robotPlayers.cameraFrame.walking,
          })
        }
      }
    })
    // Fine aiming immediately before release must not trigger another walk.
    await page.evaluate(() => {
      const game = (globalThis as any).container
      game.table.cue.aim.angle += 0.08
    })
    const rail = (await page.locator("#powerSliderContainer").boundingBox())!
    const vertical = rail.height > rail.width
    const start = {
      x: rail.x + (vertical ? rail.width / 2 : 8),
      y: rail.y + (vertical ? 8 : rail.height / 2),
    }
    const end = {
      x: rail.x + (vertical ? rail.width / 2 : rail.width * 0.65),
      y: rail.y + (vertical ? rail.height * 0.65 : rail.height / 2),
    }
    if (mobile) {
      const cdp = await context.newCDPSession(page)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ id: 1, ...start }],
      })
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ id: 1, ...end }],
      })
      await page.waitForFunction(
        () => (globalThis as any).container.view.robotPlayers.readyToStrike
      )
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      })
    } else {
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      await page.mouse.move(end.x, end.y, { steps: 5 })
      await page.waitForFunction(
        () => (globalThis as any).container.view.robotPlayers.readyToStrike
      )
      await page.mouse.up()
    }
    await page.waitForFunction(() =>
      (globalThis as any).cueShotSamples.some((s: any) => s.shotTime > 0.9)
    )
    await page.screenshot({ path: `${folder}/${label}-stroke.png` })
    const samples = await page.evaluate(
      () => (globalThis as any).cueShotSamples
    )
    expect(
      samples.every(
        (s: any) =>
          s.visible &&
          !s.walking &&
          Math.abs(s.shaft[0]) < 0.4 &&
          s.shaft[1] > -0.9 &&
          s.shaft[2] < 1
      )
    ).toBe(true)
    const stroke = samples.filter(
      (s: any) => s.stroke >= 0.72 || s.shotTime < 1
    )
    expect(stroke.length).toBeGreaterThan(8)
    for (let i = 1; i < stroke.length; i++) {
      expect(stroke[i].position[0]).toBeGreaterThanOrEqual(
        stroke[i - 1].position[0] - 1e-8
      )
      expect(stroke[i].position[1]).toBeCloseTo(stroke[i - 1].position[1], 8)
      expect(stroke[i].position[2]).toBeCloseTo(stroke[i - 1].position[2], 8)
    }
    const timing = await page.evaluate(() => (globalThis as any).shotTiming)
    expect(timing.readyAtRelease).toBe(true)
    expect(timing.contactAt - timing.releasedAt).toBeGreaterThanOrEqual(0)
    expect(timing.contactAt - timing.releasedAt).toBeLessThan(100)
    expect(samples.every((s: any) => s.stroke === undefined)).toBe(true)
    expect(errors).toEqual([])
    await writeFile(
      `${folder}/${label}.json`,
      JSON.stringify({ projection, samples, timing, errors }, null, 2)
    )
    const video = page.video()!
    await context.close()
    await video.saveAs(`${folder}/${label}-stroke.webm`)
  })
}
