import { expect, test, type Page } from "@playwright/test"
import { mkdir, writeFile } from "node:fs/promises"

const folder = "docs/qa/2026-09-06-immediate-shot"

async function instrument(page: Page) {
  await page.evaluate(() => {
    const game = (globalThis as any).container
    ;(globalThis as any).sequenceShots = []
    const hit = game.table.hit.bind(game.table)
    game.table.hit = () => {
      const robots = game.view.robotPlayers
      const rig = robots.players[robots.active]
      ;(globalThis as any).sequenceShots.push({
        active: robots.active + 1,
        stance: rig.stance,
        walking: robots.cameraFrame.walking,
        cueVisible: game.table.cue.cueBody.visible,
        ready: robots.readyToStrike,
        controller: game.controller.name,
      })
      hit()
    }
    ;(globalThis as any).sequenceFrames = []
    const update = game.view.robotPlayers.update.bind(game.view.robotPlayers)
    game.view.robotPlayers.update = (...args: any[]) => {
      update(...args)
      if ((globalThis as any).sequenceFrames.length > 15000) return
      const robots = game.view.robotPlayers
      ;(globalThis as any).sequenceFrames.push({
        active: robots.active + 1,
        stance: robots.players[robots.active].stance,
        walking: robots.cameraFrame.walking,
        stationary: game.table.allStationary(),
        preparing: game.controller.isPreparingShot,
        stroke: game.table.cue.preStrokeProgress,
        shotTime: robots.shotTime,
        shots: robots.shotCount,
        cuePosition: game.table.cue.cueBody.position.toArray(),
        cueVisible:
          game.table.cue.cueBody.visible && game.table.cue.mesh.visible,
      })
    }
  })
}

for (const source of ["bot", "admin"]) {
  test(`${source} walks and aims before physical contact`, async ({
    browser,
  }) => {
    test.setTimeout(120000)
    await mkdir(folder, { recursive: true })
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
    if (source === "admin") {
      await page.goto("/admin?platformDemo=1")
      await page.getByRole("button", { name: "演示辅助" }).click()
      await page.getByText("线下演示", { exact: true }).click()
      await page.locator("#adminDemoLevel").fill("11")
    }
    await page.goto(
      `/?play=1&platformDemo=1&ruletype=eightball&practice=${source === "admin"}&quality=low&camera=3d&bot=ClawBreak&botLevel=5`
    )
    await page.waitForFunction(() => (globalThis as any).container?.controller)
    await page.locator("#cueHit").click()
    if (await page.locator("#gameSocialClose").isVisible())
      await page.locator("#gameSocialClose").click()
    await instrument(page)
    await page.evaluate((source) => {
      const game = (globalThis as any).container
      if (source === "admin") {
        game.manualShotCount = 1
        game.table.cue.aim.angle += Math.PI
      } else {
        game.table.cue.aim.angle = Math.PI / 2
        game.table.cue.setPower(0.12)
        game.updateController(game.controller.playShot())
      }
    }, source)
    await page.waitForFunction(
      (source) =>
        (globalThis as any).sequenceShots.some(
          (s: any) => source === "admin" || s.active === 2
        ),
      source,
      { timeout: 90000 }
    )
    await page.waitForFunction(
      () => (globalThis as any).container.view.robotPlayers.shotTime > 1.5
    )
    const evidence = await page.evaluate(() => ({
      shots: (globalThis as any).sequenceShots,
      frames: (globalThis as any).sequenceFrames,
    }))
    if (source === "bot") {
      const view = await page.evaluate(() => {
        const game = (globalThis as any).container
        return {
          opponent: game.view.camera.opponentView,
          height: game.view.camera.camera.position.z,
          eye: game.view.robotPlayers.cameraFrame.eye.z,
          firstPerson:
            game.view.robotPlayers.players[1].root.userData.firstPerson,
        }
      })
      expect(view.opponent).toBe(true)
      expect(view.height).toBeGreaterThan(view.eye + 1)
      expect(view.firstPerson).toBe(false)
    }
    expect(
      evidence.shots.every(
        (s: any) => s.ready && !s.walking && s.stance < 0.025 && s.cueVisible
      )
    ).toBe(true)
    expect(evidence.frames.some((s: any) => s.walking && s.stationary)).toBe(
      true
    )
    expect(
      evidence.frames
        .filter((s: any) => s.preparing)
        .every((s: any) => s.stationary)
    ).toBe(true)
    expect(
      evidence.frames.some(
        (s: any) => s.preparing && s.stroke > 0.5 && s.stationary
      )
    ).toBe(true)
    const held = evidence.frames.filter(
      (s: any) => s.shotTime > 0 && s.shotTime < 1
    )
    expect(held.length).toBeGreaterThan(5)
    expect(held.every((s: any) => s.stance < 0.025 && !s.walking)).toBe(true)
    for (const active of source === "bot" ? [1, 2] : [1]) {
      const forward = evidence.frames.filter(
        (s: any) =>
          s.active === active &&
          ((s.preparing && s.stroke >= 0.72) || s.shotTime < 1)
      )
      expect(forward.length).toBeGreaterThan(5)
      expect(forward.every((s: any) => s.cueVisible && !s.walking)).toBe(true)
      for (let i = 1; i < forward.length; i++) {
        expect(forward[i].cuePosition[0]).toBeGreaterThanOrEqual(
          forward[i - 1].cuePosition[0] - 1e-8
        )
        expect(forward[i].cuePosition[1]).toBeCloseTo(
          forward[i - 1].cuePosition[1],
          8
        )
        expect(forward[i].cuePosition[2]).toBeCloseTo(
          forward[i - 1].cuePosition[2],
          8
        )
      }
    }
    await page.screenshot({ path: `${folder}/${source}-standing.png` })
    await writeFile(
      `${folder}/${source}.json`,
      JSON.stringify({ ...evidence, errors }, null, 2)
    )
    expect(errors).toEqual([])
    await context.close()
  })
}

test("first-person chalk action shows the selected cue and returns control", async ({
  browser,
}) => {
  await mkdir(folder, { recursive: true })
  const context = await browser.newContext({
    viewport: { width: 915, height: 412 },
    hasTouch: true,
    isMobile: true,
  })
  const page = await context.newPage()
  await page.addInitScript(() =>
    localStorage.setItem("break-builder.controls-seen.v2", "acknowledged")
  )
  await page.goto(
    "/?play=1&platformDemo=1&ruletype=eightball&practice=true&quality=high&camera=3d&cueStyle=holo-laser&environment=club"
  )
  await page.waitForFunction(
    () => (globalThis as any).container?.view.robotPlayers
  )
  await page.locator("#cueHit").click()
  await expect(page.locator("#chalkCue")).toBeEnabled({ timeout: 15000 })
  await page.evaluate(() =>
    (globalThis as any).container.table.cue.setStyle("holo-laser", false)
  )
  const before = await page.evaluate(() =>
    (globalThis as any).container.table.cue.aim.copy()
  )
  await page.locator("#chalkCue").tap()
  await expect(page.locator("#chalkCue")).toHaveAttribute(
    "aria-pressed",
    "true"
  )
  await page.waitForFunction(
    () => (globalThis as any).container.view.robotPlayers.chalkTime > 0.8
  )
  await page.screenshot({ path: `${folder}/chalk.png` })
  const chalk = await page.evaluate(() => {
    const game = (globalThis as any).container
    const rig = game.view.robotPlayers.players[0]
    return {
      style: rig.carriedCue.userData.cueStyleId,
      visible: rig.carriedCue.visible,
      stationary: game.table.allStationary(),
      disabled: game.table.cue.aimInputs.isDisabled(),
    }
  })
  expect(chalk).toEqual({
    style: "holo-laser",
    visible: true,
    stationary: true,
    disabled: true,
  })
  await expect(page.locator("#chalkCue")).toBeEnabled()
  const after = await page.evaluate(() =>
    (globalThis as any).container.table.cue.aim.copy()
  )
  expect(after).toEqual(before)
  expect(
    await page.evaluate(() =>
      (globalThis as any).container.table.cue.aimInputs.isDisabled()
    )
  ).toBe(false)
  await context.close()
})
