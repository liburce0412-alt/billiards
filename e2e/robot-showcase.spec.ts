import { expect, test } from "@playwright/test"
import { writeFile } from "node:fs/promises"

test("cyber players and cue materials render in all authored environments", async ({
  page,
}) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => {
    localStorage.setItem("break-builder.controls-seen.v2", "acknowledged")
    localStorage.setItem("break-builder.social-drawer", "closed")
  })
  await page.goto(
    "/?play=1&platformDemo=1&ruletype=eightball&practice=true&quality=high&camera=3d&cueStyle=holo-laser&environment=club"
  )
  await page.waitForFunction(
    () => (globalThis as any).container?.view.assets.table.children.length > 0
  )
  await page.locator("#cueHit").click()
  const closeSocial = page.locator("#gameSocialClose")
  if (await closeSocial.isVisible()) await closeSocial.click()
  await expect
    .poll(() =>
      page.evaluate(
        () => (globalThis as any).container.view.robotPlayers.players[0].stance
      )
    )
    .toBeLessThan(0.05)
  await page.screenshot({ path: "docs/qa/2026-09-05-cyber-players/aim.png" })
  const stats = await page.evaluate(() => {
    const game = (globalThis as any).container
    const camera = game.view.camera
    camera.orbitByPixels(0, 0)
    camera.orbitTarget.set(0, 0, 0.25)
    camera.orbitDistance = 5.8
    camera.orbitAzimuth = -1.0
    camera.orbitElevation = 0.35
    return game.view.robotPlayers.root.userData.robotState
  })
  expect(stats.drawCalls).toBeLessThanOrEqual(50)
  await page.screenshot({
    path: "docs/qa/2026-09-05-cyber-players/table-and-players.png",
  })
  for (const index of [0, 1]) {
    await page.evaluate((index) => {
      const game = (globalThis as any).container
      const player = game.view.robotPlayers.players[index]
      const camera = game.view.camera
      camera.orbitTarget.copy(player.position).add({ x: 0, y: 0, z: 0.94 })
      camera.orbitDistance = 2.25
      camera.orbitElevation = 0.13
      camera.orbitAzimuth = Math.PI / 2 - player.turn - 0.45
    }, index)
    await page.screenshot({
      path: `docs/qa/2026-09-05-cyber-players/robot-${index + 1}.png`,
    })
  }
  for (const style of ["heritage", "obsidian", "aurora-prism", "holo-laser"]) {
    await page.evaluate((style) => {
      const game = (globalThis as any).container
      game.table.cue.setStyle(style, false)
      const cue = game.table.cue
      cue.cueBody.updateWorldMatrix(true, false)
      const camera = game.view.camera
      camera.orbitTarget.copy(cue.cueBody.getWorldPosition(camera.orbitTarget))
      camera.orbitDistance = 0.94
      camera.orbitElevation = 0.45
      camera.orbitAzimuth = -cue.aim.angle
    }, style)
    await page.screenshot({
      path: `docs/qa/2026-09-05-cyber-players/cue-${style}.png`,
    })
    if (style === "heritage" || style === "obsidian") {
      await page.evaluate(() => {
        const game = (globalThis as any).container
        const camera = game.view.camera
        const cue = game.table.cue
        camera.orbitTarget.set(0, cue.length * 0.37, 0)
        cue.cueBody.localToWorld(camera.orbitTarget)
        camera.orbitDistance = 0.19
      })
      await page.screenshot({
        path: `docs/qa/2026-09-05-cyber-players/grain-${style}.png`,
      })
    }
  }
  const renderStats: unknown[] = []
  for (const style of [
    "spectra",
    "galaxy",
    "nebula",
    "club",
    "aurora-hall",
    "sky-temple",
    "abyss-palace",
    "lunar-observatory",
  ]) {
    await page.evaluate((style) => {
      const game = (globalThis as any).container
      game.view.setEnvironmentStyle(style)
      const camera = game.view.camera
      camera.orbitTarget.set(0, 1, 1)
      camera.orbitDistance = 7.5
      camera.orbitAzimuth = Math.PI
      camera.orbitElevation = 0.22
    }, style)
    await page.screenshot({
      path: `docs/qa/2026-09-05-cyber-players/environment-${style}.png`,
    })
    renderStats.push(
      await page.evaluate(() => {
        const game = (globalThis as any).container
        return {
          environment: game.view.environmentStyleId,
          render: game.view.renderer.info.render,
          robots: game.view.robotPlayers.root.userData.robotState,
        }
      })
    )
  }
  await writeFile(
    "docs/qa/2026-09-05-cyber-players/render-stats.json",
    JSON.stringify(renderStats, null, 2)
  )
  await page.evaluate(() => {
    const game = (globalThis as any).container
    game.view.setEnvironmentStyle("club", false)
    const camera = game.view.camera
    camera.orbitTarget.set(-0.2, 0, 0.25)
    camera.orbitDistance = 4.5
    camera.orbitAzimuth = -1
    camera.orbitElevation = 0.4
    const canvas =
      document.querySelector<HTMLCanvasElement>("#viewP1 > canvas")!
    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" })
    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    ;(globalThis as any).robotRecording = new Promise<string>((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result).split(",")[1])
        reader.readAsDataURL(new Blob(chunks, { type: "video/webm" }))
      }
    })
    recorder.start()
    setTimeout(() => recorder.stop(), 8000)
  })
  const rail = (await page.locator("#powerSliderContainer").boundingBox())!
  await page.mouse.move(rail.x + 8, rail.y + rail.height / 2)
  await page.mouse.down()
  await page.mouse.move(rail.x + rail.width * 0.35, rail.y + rail.height / 2, {
    steps: 12,
  })
  await page.mouse.up()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (globalThis as any).container.view.robotPlayers.root.userData
            .robotState.shotCount
      )
    )
    .toBe(1)
  const video = await page.evaluate(() => (globalThis as any).robotRecording)
  await writeFile(
    "docs/qa/2026-09-05-cyber-players/shot-sequence.webm",
    Buffer.from(video, "base64")
  )
  expect(errors).toEqual([])
})
