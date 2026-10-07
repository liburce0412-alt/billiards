import { expect, test } from "@playwright/test"

for (const width of [320, 768, 1440]) {
  test(`platform pages stay readable and inside ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/?platformDemo=1")
    await expect(page.locator("#launcherStart")).toBeVisible()
    for (const destination of ["个性化", "社交", "管理", "规则", "开球"]) {
      await page
        .getByRole("navigation", { name: "主导航" })
        .getByRole("link", { name: destination, exact: true })
        .click()
      await expect(page.locator(".holo-page-heading h1")).toBeVisible()
      await expect(page).toHaveURL(/platformDemo=1/)
      await expect(page.locator(".holo-error")).toHaveCount(0)
      if (["个性化", "社交", "管理"].includes(destination)) {
        await expect(page.locator(".platform-panel").first()).toBeVisible()
      }
      const bounds = await page.evaluate(() => ({
        content: document.documentElement.scrollWidth,
        viewport: innerWidth,
        headingHeight: document
          .querySelector(".holo-page-heading")!
          .getBoundingClientRect().height,
        washedOut: Array.from(
          document.querySelectorAll(".holo-main h2,.holo-main strong")
        ).some(
          (element) => getComputedStyle(element).color === "rgb(250, 235, 215)"
        ),
      }))
      expect(bounds.content).toBeLessThanOrEqual(bounds.viewport + 1)
      expect(bounds.headingHeight).toBeLessThan(230)
      expect(bounds.washedOut).toBe(false)
    }
  })
}

test("scene thumbnails and account preview follow the selected environment", async ({
  page,
}) => {
  await page.goto("/?platformDemo=1")
  const scene = page.getByRole("button", {
    name: "选择月海观测台",
    exact: true,
  })
  await scene.click()
  await expect(scene).toHaveAttribute("aria-pressed", "true")
  await expect(page.locator(".holo-scene-preview img")).toHaveAttribute(
    "src",
    /lunar-observatory.webp$/
  )
  await expect(page.getByLabel("环境", { exact: true })).toHaveValue(
    "lunar-observatory"
  )
  await expect
    .poll(() =>
      page
        .locator(".holo-scene-preview img")
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
    )
    .toBeGreaterThan(0)
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "个性化", exact: true })
    .click()
  await page.locator('[name="environmentStyle"]').selectOption("aurora-hall")
  await expect(page.locator("#accountEnvironmentPreview")).toHaveAttribute(
    "src",
    /aurora-hall.webp$/
  )
  await expect
    .poll(() =>
      page
        .locator("#accountEnvironmentPreview")
        .evaluate((image: HTMLImageElement) => image.naturalWidth)
    )
    .toBeGreaterThan(0)
})
