import { expect, test } from "@playwright/test"

test("administrator demo assist persists and executes a local shot", async ({
  page,
}) => {
  await page.goto("/admin?platformDemo=1")
  await page.getByRole("button", { name: "演示辅助" }).click()
  const enabled = page.locator("#adminDemoOfflineEnabled")
  await expect(enabled).toBeVisible()
  await page.getByText("线下演示", { exact: true }).click()
  await expect(enabled).toBeChecked()
  await page.locator("#adminDemoLevel").fill("11")
  await page.reload()
  await page.getByRole("button", { name: "演示辅助" }).click()
  await expect(enabled).toBeChecked()

  await page.goto(
    "/?play=1&platformDemo=1&ruletype=eightball&practice=true&quality=low"
  )
  await page.waitForFunction(() => (globalThis as any).container?.controller)
  await expect
    .poll(() =>
      page.evaluate(
        () => (globalThis as any).container.manualShotCount
      )
    )
    .toBe(0)
  const tutorialClose = page.locator("#controlTutorialClose")
  if (await tutorialClose.isVisible()) await tutorialClose.click()
  await page.locator("#cueHit").click()
  await expect
    .poll(() =>
      page.evaluate(() => (globalThis as any).container.controller.name)
    )
    .toBe("Aim")
  await expect
    .poll(() =>
      page.evaluate(() => (globalThis as any).container.manualShotCount)
    )
    .toBe(0)
  await page.locator("#powerSliderContainer").evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const pointerId = 1
    const emit = (type: string, x: number) =>
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId,
          pointerType: "mouse",
          clientX: x,
          clientY: rect.top + rect.height / 2,
          isPrimary: true,
        })
      )
    emit("pointerdown", rect.left + rect.width * 0.2)
    emit("pointermove", rect.left + rect.width * 0.7)
    emit("pointerup", rect.left + rect.width * 0.7)
  })
  await expect
    .poll(() =>
      page.evaluate(() => (globalThis as any).container.manualShotCount)
    )
    .toBe(1)
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (globalThis as any).container.recorder.entries.length > 0
        ),
      { timeout: 12_000 }
  )
    .toBe(true)
})

test("administrator demo assist visibly aims and thinks before striking", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" })
  await page.goto("/admin?platformDemo=1")
  await page.getByRole("button", { name: "演示辅助" }).click()
  await page.getByText("线下演示", { exact: true }).click()
  await page.locator("#adminDemoLevel").fill("11")

  await page.goto(
    "/?play=1&platformDemo=1&ruletype=eightball&practice=true&quality=low"
  )
  await page.waitForFunction(() => (globalThis as any).container?.controller)
  const tutorialClose = page.locator("#controlTutorialClose")
  if (await tutorialClose.isVisible()) await tutorialClose.click()
  await page.locator("#cueHit").click()
  await expect
    .poll(() =>
      page.evaluate(() => (globalThis as any).container.controller.name)
    )
    .toBe("Aim")

  const initialAngle = await page.evaluate(() => {
    const container = (globalThis as any).container
    container.manualShotCount = 1
    container.table.cue.aim.angle += Math.PI
    container.table.cue.updateAimInput()
    return container.table.cue.aim.angle
  })

  await expect
    .poll(
      () =>
        page.evaluate(
          (startAngle) => {
            const currentAngle = (globalThis as any).container.table.cue.aim
              .angle
            return Math.abs(
              Math.atan2(
                Math.sin(currentAngle - startAngle),
                Math.cos(currentAngle - startAngle)
              )
            )
          },
          initialAngle
        ),
      { timeout: 2000 }
    )
    .toBeGreaterThan(0.05)
  const midway = await page.evaluate(() => {
    const container = (globalThis as any).container
    return {
      angle: container.table.cue.aim.angle,
      controller: container.controller.name,
      recordedShots: container.recorder.entries.length,
    }
  })
  const angleTravel = Math.abs(
    Math.atan2(
      Math.sin(midway.angle - initialAngle),
      Math.cos(midway.angle - initialAngle)
    )
  )
  expect(midway.controller).toBe("Aim")
  expect(midway.recordedShots).toBe(0)
  expect(angleTravel).toBeGreaterThan(0.05)

  await expect
    .poll(
      () =>
        page.evaluate(() => (globalThis as any).container.controller.name),
      { timeout: 10_000 }
    )
    .toBe("PlayShot")
})
