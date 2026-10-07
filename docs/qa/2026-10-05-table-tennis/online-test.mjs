import { chromium } from "@playwright/test"
import { spawnSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import process from "node:process"
import console from "node:console"
import { randomBytes } from "node:crypto"
import { setTimeout as pause } from "node:timers/promises"

// A fresh, headless E2E browser; it never opens the user's Chrome profile.
// Requires the isolated local Worker from online-worker.mjs on :8792.
const origin = "http://127.0.0.1:8792"
const output = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(output, "../../..")
const fixturePath = path.join(root, ".wrangler/table-tennis-qa-fixtures.json")
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
})
const contexts = await Promise.all(
  [0, 1].map(() =>
    browser.newContext({
      baseURL: origin,
      viewport: { width: 1280, height: 720 },
      locale: "zh-CN",
    })
  )
)
const report = { startedAt: new Date().toISOString(), steps: [], errors: [] }
try {
  const previous = await readFile(
    path.join(output, "online-report.json"),
    "utf8"
  )
  const date = JSON.parse(previous).startedAt.replace(/\D/g, "")
  await writeFile(path.join(output, `online-report-${date}.json`), previous)
} catch {
  /* First run has no previous evidence to archive. */
}
let pages = []
async function jsonRequest(context, route, data) {
  const response = await context.request.post(route, {
    headers: { Origin: origin },
    data,
  })
  if (!response.ok())
    throw new Error(
      `${route}: HTTP ${response.status()} ${await response.text()}`
    )
  return response.json()
}
function observe(page, side) {
  page.on("pageerror", (error) =>
    report.errors.push(`${side}: ${error.message}`)
  )
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      try {
        const message = JSON.parse(String(payload))
        if (side !== 0) return
        report.protocol ||= []
        if (report.protocol.length >= 80) return
        if (message.type === "tt.snapshot")
          report.protocol.push({
            type: message.type,
            tick: message.tick,
            serverTime: message.serverTime,
            paused: message.paused,
            phase: message.state.phase,
            receivedAt: Date.now(),
          })
        if (message.type === "tt.room")
          report.protocol.push({
            type: message.type,
            phase: message.phase,
            ready: message.ready,
            receivedAt: Date.now(),
          })
      } catch {
        /* Other app sockets may carry non-JSON frames. */
      }
    })
  )
}
try {
  const stamp = Date.now().toString(36)
  const accounts = []
  let existing = []
  try {
    existing = JSON.parse(await readFile(fixturePath, "utf8"))
  } catch {
    existing = []
  }
  for (const [index, context] of contexts.entries()) {
    if (
      /^ttqa_[01]_[a-z0-9]+$/.test(existing[index]?.username || "") &&
      /^[a-f0-9-]{36}$/i.test(existing[index]?.id || "")
    ) {
      await jsonRequest(context, "/api/auth/sign-in/username", {
        username: existing[index].username,
        password: existing[index].password,
      })
      accounts.push(existing[index])
      continue
    }
    const username = `ttqa_${index}_${stamp}`
    const password = randomBytes(24).toString("base64url")
    const registered = await jsonRequest(context, "/api/register", {
      username,
      displayName: `联机验证${index === 0 ? "甲" : "乙"}`,
      email: `${username}@example.test`,
      password,
    })
    if (!/^[a-f0-9-]{36}$/i.test(registered.user.id))
      throw new Error("Unexpected local fixture ID")
    accounts.push({ id: registered.user.id, username, password })
  }
  await writeFile(fixturePath, JSON.stringify(accounts), { mode: 0o600 })
  const approve = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "break-builder-prod",
      "--local",
      "--config",
      ".wrangler/table-tennis-qa.json",
      "--persist-to",
      ".wrangler/table-tennis-qa-state",
      "--command",
      `UPDATE profiles SET approval_status='approved' WHERE user_id IN ('${accounts[0].id}','${accounts[1].id}')`,
    ],
    { cwd: root, encoding: "utf8", windowsHide: true }
  )
  if (approve.status !== 0)
    throw new Error(`Local fixture approval failed: ${approve.stderr}`)
  report.accounts = accounts.map(({ id, username }) => ({ id, username }))
  const { room } = await jsonRequest(contexts[0], "/api/rooms", {
    gameType: "table-tennis",
    environmentStyle: "sports-hall",
  })
  if (!/^[a-f0-9-]{36}$/i.test(room.id))
    throw new Error("Unexpected local room ID")
  await jsonRequest(contexts[1], `/api/rooms/${room.id}/join`, {})
  const route = `/table-tennis?mode=online&room=${room.id}&environment=sports-hall`
  report.roomId = room.id
  pages = await Promise.all(contexts.map((context) => context.newPage()))
  await Promise.all(
    pages.map(async (page, index) => {
      observe(page, index)
      await page.goto(route)
      await page
        .getByRole("button", { name: "准备比赛", exact: true })
        .waitFor({ timeout: 30000 })
    })
  )
  for (const page of pages)
    await page.getByRole("button", { name: "准备比赛", exact: true }).click()
  await pages[0].getByRole("button", { name: "发球", exact: true }).waitFor()
  await pages[0].getByRole("button", { name: "发球", exact: true }).click()
  await pages[0]
    .locator(".tt-score0")
    .filter({ hasText: /^1$/ })
    .waitFor({ timeout: 10000 })
  await pages[0].getByRole("button", { name: "发球", exact: true }).waitFor()
  report.pointsBeforeDisconnect = await pages[0]
    .locator(".tt-points")
    .innerText()
  await pages[0].getByRole("button", { name: "发球", exact: true }).click()
  await pause(500)
  report.steps.push(
    "Both authenticated browser contexts joined and began a rally"
  )
  await pages[1].close()
  await pages[0]
    .getByText(/对手断线|等待对手重新连接|比赛已暂停，就绪后继续/)
    .waitFor({ timeout: 5000 })
  report.steps.push(
    "Mid-rally disconnect pauses authority and retains the seat"
  )
  await pause(1200)
  pages[1] = await contexts[1].newPage()
  observe(pages[1], 1)
  await pages[1].goto(route)
  for (const page of pages) {
    await page.locator(".tt-action").waitFor({ timeout: 15000 })
    const ready = page.getByRole("button", { name: "准备比赛", exact: true })
    if (await ready.isVisible()) await ready.click()
  }
  report.steps.push(
    "Same guest rejoined within 30 seconds; both ready and replay serve"
  )
  report.pointsAfterReconnect = await pages[0].locator(".tt-points").innerText()
  if (report.pointsAfterReconnect !== report.pointsBeforeDisconnect)
    throw new Error("Committed score changed across reconnect")
  await mkdir(output, { recursive: true })
  await pages[0].screenshot({
    path: path.join(output, "online-host-rejoined.png"),
  })
  await pages[1].screenshot({
    path: path.join(output, "online-guest-rejoined.png"),
  })
  const deadline = Date.now() + 180000
  let localHits = 0
  while (
    Date.now() < deadline &&
    !(await pages[0].getByText("赢下这场比赛", { exact: true }).isVisible())
  ) {
    for (const page of pages) {
      const ready = page.getByRole("button", { name: "准备比赛", exact: true })
      if (await ready.isVisible()) await ready.click()
      const serve = page.getByRole("button", { name: "发球", exact: true })
      if (await serve.isVisible()) await serve.click()
    }
    if (
      await pages[0]
        .getByText("现在滑动，回击来球", { exact: true })
        .isVisible()
    ) {
      await pause(80)
      await pages[0].locator("canvas.tt-canvas").press("Space")
      localHits++
      await pause(250)
    } else await pause(15)
  }
  await pages[0]
    .getByText("赢下这场比赛", { exact: true })
    .waitFor({ timeout: 1000 })
  await pages[1]
    .getByText("下场继续挑战", { exact: true })
    .waitFor({ timeout: 5000 })
  report.finalGames = await pages[0].locator(".tt-result-score").innerText()
  report.localHits = localHits
  report.steps.push(
    "Completed a normally scored best-of-three match on both browser clients"
  )
  await pages[0].screenshot({
    path: path.join(output, "online-host-finished.png"),
  })
  await pages[1].screenshot({
    path: path.join(output, "online-guest-finished.png"),
  })
  const persisted = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "break-builder-prod",
      "--local",
      "--config",
      ".wrangler/table-tennis-qa.json",
      "--persist-to",
      ".wrangler/table-tennis-qa-state",
      "--json",
      "--command",
      `SELECT room_id, reason, score_json FROM table_tennis_results WHERE room_id='${room.id}'`,
    ],
    { cwd: root, encoding: "utf8", windowsHide: true }
  )
  if (persisted.status !== 0)
    throw new Error("Local D1 result verification failed")
  report.persistedResults = JSON.parse(persisted.stdout)[0].results
  if (report.persistedResults.length !== 1)
    throw new Error("Expected one persisted match result")
  report.steps.push("Local D1 contains exactly one authoritative match result")
  report.passed = report.errors.length === 0
} catch (error) {
  report.failure = error.message
  report.passed = false
  for (const [index, page] of pages.entries()) {
    if (page.isClosed()) continue
    report[`page${index}`] = (await page.locator("body").innerText()).slice(
      0,
      12000
    )
    await page
      .screenshot({ path: path.join(output, `online-failure-${index}.png`) })
      .catch(() => {})
  }
  process.exitCode = 1
} finally {
  report.endedAt = new Date().toISOString()
  await writeFile(
    path.join(output, "online-report.json"),
    JSON.stringify(report, null, 2)
  )
  await Promise.all(contexts.map((context) => context.close()))
  await browser.close()
  console.log(JSON.stringify(report, null, 2))
}
