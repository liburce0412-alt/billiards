import { expect, test } from "@playwright/test"
import { createHash, randomUUID } from "node:crypto"

// The public relay is intentionally opt-in so routine local/CI runs do not
// create real rooms or fail when the external service is unavailable.
test.skip(
  process.env.RUN_ONLINE_E2E !== "1",
  "Set RUN_ONLINE_E2E=1 when the public relay is available."
)

test("two browser contexts can enter the same room", async ({ browser }) => {
  const host = await browser.newContext()
  const guest = await browser.newContext()
  const room = `联机 E2E 🎱 ${Date.now().toString(36).toUpperCase()}`
  const tableId = `bb3d-v2-${createHash("sha256")
    .update(`break-builder-room-v2:${room}`)
    .digest("hex")
    .slice(0, 32)}`
  const roomInstance = randomUUID()
  const matchId = randomUUID()
  const common =
    `play=1&ruletype=eightball&quality=low&practice=false` +
    `&websocketserver=wss://billiards-network.onrender.com` +
    `&tableId=${tableId}&roomVersion=2&roomCode=${encodeURIComponent(room)}` +
    `&roomInstance=${roomInstance}&matchId=${matchId}`
  const hostPage = await host.newPage()
  const guestPage = await guest.newPage()
  await Promise.all([
    hostPage.addInitScript(() => {
      localStorage.setItem(
        "break-builder.controls-seen.v2",
        "acknowledged"
      )
    }),
    guestPage.addInitScript(() => {
      localStorage.setItem(
        "break-builder.controls-seen.v2",
        "acknowledged"
      )
    }),
  ])
  await Promise.all([
    hostPage.goto(`/?${common}&first=true&userId=e2e-host&userName=房主`),
    guestPage.goto(`/?${common}&userId=e2e-guest&userName=访客`),
  ])
  await Promise.all([
    hostPage.locator('[data-notification-action="room-ready"]').click(),
    guestPage.locator('[data-notification-action="room-ready"]').click(),
  ])
  await Promise.all([
    hostPage.waitForFunction(() => Boolean((globalThis as any).container)),
    guestPage.waitForFunction(() => Boolean((globalThis as any).container)),
  ])
  await Promise.all([
    hostPage.waitForFunction(
      () => (globalThis as any).container?.controller?.name !== "Init",
      undefined,
      { timeout: 15_000 }
    ),
    guestPage.waitForFunction(
      () => (globalThis as any).container?.controller?.name !== "Init",
      undefined,
      { timeout: 15_000 }
    ),
  ])
  await expect(hostPage.locator("#viewP1")).toBeVisible()
  await expect(guestPage.locator("#viewP1")).toBeVisible()
  const states = await Promise.all([
    hostPage.evaluate(() => (globalThis as any).container.controller.name),
    guestPage.evaluate(() => (globalThis as any).container.controller.name),
  ])
  expect(states).not.toContain("Init")
  await host.close()
  await guest.close()
})
