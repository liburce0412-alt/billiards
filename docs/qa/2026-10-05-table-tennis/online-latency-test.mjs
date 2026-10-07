import { chromium } from "@playwright/test"
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
import { setTimeout as pause } from "node:timers/promises"
import path from "node:path"
import process from "node:process"
import console from "node:console"

// Real local server and cookie contexts; only WS transport delivery is delayed.
// Run online-worker.mjs and online-test.mjs once to create local fixtures first.
const origin = "http://127.0.0.1:8792"
const output = path.dirname(fileURLToPath(import.meta.url))
const fixtures = JSON.parse(
  await readFile(
    path.resolve(output, "../../../.wrangler/table-tennis-qa-fixtures.json"),
    "utf8"
  )
)
const browser = await chromium.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
})
const report = {
  startedAt: new Date().toISOString(),
  method:
    "Two authenticated Chromium contexts, real local Worker, each WS direction delayed by target RTT / 2; no protocol or state replacement",
  scenarios: [],
}
try {
  const previous = await readFile(
    path.join(output, "online-latency-report.json"),
    "utf8"
  )
  const stamp = JSON.parse(previous).startedAt.replace(/\D/g, "")
  await writeFile(
    path.join(output, `online-latency-report-${stamp}.json`),
    previous
  )
} catch {
  /* First run has no previous evidence. */
}

async function post(context, route, data) {
  const response = await context.request.post(route, {
    headers: { Origin: origin },
    data,
  })
  if (!response.ok())
    throw new Error(`${route}: ${response.status()} ${await response.text()}`)
  return response.json()
}

async function waitUntil(check, message, timeout = 10000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    if (await check()) return
    await pause(15)
  }
  throw new Error(message)
}

function observeFrame(trace, message) {
  const frame = JSON.parse(String(message))
  if (frame.type === "tt.error") trace.errors.push(frame.message)
  if (frame.type === "tt.room") trace.phases.push(frame.phase)
  if (frame.type !== "tt.snapshot") return
  trace.snapshots.set(frame.tick, {
    digest: createHash("sha256")
      .update(JSON.stringify(frame.state))
      .digest("hex"),
    acks: frame.acks,
    phase: frame.state.phase,
    scores: frame.state.scores,
  })
  trace.latest = frame
  trace.bestRally = Math.max(trace.bestRally, frame.state.bestRally)
}

async function intercept(context, trace, rtt, status) {
  await context.routeWebSocket(/\/ws\/game\//, (client) => {
    const server = client.connectToServer()
    client.onMessage(async (message) => {
      const frame = JSON.parse(String(message))
      if (frame.type === "tt.input") {
        trace.inputs.push({
          seq: frame.seq,
          kind: frame.input.kind,
          at: Date.now(),
        })
      }
      await pause(rtt / 2)
      if (status.active) server.send(message)
    })
    server.onMessage(async (message) => {
      await pause(rtt / 2)
      if (!status.active) return
      observeFrame(trace, message)
      client.send(message)
    })
  })
}

async function checkConvergence(pages, traces, scenario) {
  const winner = 1 - scenario.server
  await waitUntil(
    () => traces.every((trace) => trace.latest?.state.scores[winner] === 1),
    "Both clients did not receive the scored point"
  )
  const common = [...traces[0].snapshots.entries()].filter(([tick]) =>
    traces[1].snapshots.has(tick)
  )
  if (common.length < 10) throw new Error("Insufficient common snapshots")
  if (
    common.some(
      ([tick, snapshot]) =>
        snapshot.digest !== traces[1].snapshots.get(tick).digest
    )
  )
    throw new Error("Same-tick authority snapshots differed between clients")
  for (const [side, trace] of traces.entries()) {
    const last = trace.inputs.at(-1)
    if (!last || trace.latest.acks[side] < last.seq)
      throw new Error(`Player ${side} input was not acknowledged`)
  }
  await waitUntil(
    async () =>
      (await pages[winner].locator(".tt-points").innerText()) === "1:0" &&
      (await pages[1 - winner].locator(".tt-points").innerText()) === "0:1",
    "Visible client scores did not converge to the authority"
  )
  scenario.commonIdenticalSnapshots = common.length
  scenario.bestRally = Math.min(...traces.map((trace) => trace.bestRally))
  scenario.inputs = traces.map((trace) => trace.inputs)
  scenario.acks = traces.map((trace) => trace.latest.acks)
  scenario.roomPhases = traces.map((trace) => trace.phases)
  scenario.visibleScores = await Promise.all(
    pages.map((page) => page.locator(".tt-points").innerText())
  )
}

async function readyToServe(pages, traces) {
  // One click per seat. Repeated clicks race delayed readiness and can hit the
  // same action button after its meaning has changed from Ready to Serve.
  for (const page of pages)
    await page.getByRole("button", { name: "准备比赛", exact: true }).click()
  await waitUntil(
    () => traces.every((trace) => trace.latest && !trace.latest.paused),
    "Room did not enter active state",
    8000
  )
}

function measureDesktop() {
  return new Promise((resolve) => {
    const samples = []
    const start = globalThis.performance.now()
    let previous = start
    function sample(now) {
      samples.push(now - previous)
      previous = now
      if (now - start < 10000) {
        globalThis.requestAnimationFrame(sample)
        return
      }
      const sorted = samples.slice(1).sort((a, b) => a - b)
      resolve({
        elapsedMs: now - start,
        count: sorted.length,
        medianMs: sorted[Math.floor(sorted.length * 0.5)],
        p95Ms: sorted[Math.floor(sorted.length * 0.95)],
        maxMs: sorted.at(-1),
        width: globalThis.innerWidth,
        height: globalThis.innerHeight,
        devicePixelRatio: globalThis.devicePixelRatio,
        note: "Desktop headless Chromium, two rendered 1280x720 courts open, idle serve; RAF interval, not GPU cost or real mobile performance",
      })
    }
    globalThis.requestAnimationFrame(sample)
  })
}

async function scenarioAt(rtt) {
  const scenario = { rttMs: rtt, errors: [] }
  report.scenarios.push(scenario)
  const status = { active: true }
  const traces = [0, 1].map(() => ({
    snapshots: new Map(),
    inputs: [],
    bestRally: 0,
    phases: [],
    errors: scenario.errors,
  }))
  const contexts = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({
        baseURL: origin,
        viewport: { width: 1280, height: 720 },
        locale: "zh-CN",
      })
    )
  )
  let pages = []
  try {
    for (const [index, context] of contexts.entries()) {
      if (!/^ttqa_[01]_[a-z0-9]+$/.test(fixtures[index]?.username || ""))
        throw new Error("Missing owned local test fixture")
      await post(context, "/api/auth/sign-in/username", {
        username: fixtures[index].username,
        password: fixtures[index].password,
      })
      await intercept(context, traces[index], rtt, status)
    }
    const { room } = await post(contexts[0], "/api/rooms", {
      gameType: "table-tennis",
      environmentStyle: "sports-hall",
    })
    scenario.roomId = room.id
    await post(contexts[1], `/api/rooms/${room.id}/join`, {})
    pages = await Promise.all(contexts.map((context) => context.newPage()))
    await Promise.all(
      pages.map(async (page, side) => {
        page.on("pageerror", (error) =>
          scenario.errors.push(`${side}: ${error.message}`)
        )
        await page.goto(
          `/table-tennis?mode=online&room=${room.id}&environment=sports-hall`
        )
        await page
          .getByRole("button", { name: "准备比赛", exact: true })
          .waitFor({ timeout: 30000 })
      })
    )
    await readyToServe(pages, traces)
    const serving = traces[0].latest.state.server
    const receiving = 1 - serving
    scenario.server = serving
    await pages[serving]
      .getByRole("button", { name: "发球", exact: true })
      .waitFor()
    await pages[serving]
      .getByRole("button", { name: "发球", exact: true })
      .click()
    await pages[receiving]
      .getByText("现在滑动，回击来球", { exact: true })
      .waitFor({ timeout: 5000 })
    await pages[receiving].locator("canvas.tt-canvas").press("Space")
    await waitUntil(
      () => traces.every((trace) => trace.bestRally >= 2),
      "The real authority did not register the return"
    )
    await checkConvergence(pages, traces, scenario)
    await pages[0].screenshot({
      path: path.join(output, `online-latency-${rtt}.png`),
    })
    if (rtt === 150)
      report.desktopFrameReference = await pages[0].evaluate(measureDesktop)
    scenario.passed = scenario.errors.length === 0
  } catch (error) {
    scenario.failure = error.message
    scenario.passed = false
    for (const [side, page] of pages.entries()) {
      scenario[`page${side}`] = (await page.locator("body").innerText()).slice(
        0,
        8000
      )
      await page
        .screenshot({
          path: path.join(output, `online-latency-${rtt}-failure-${side}.png`),
        })
        .catch(() => {})
    }
  } finally {
    status.active = false
    await Promise.all(contexts.map((context) => context.close()))
  }
}

try {
  for (const rtt of [50, 100, 150]) await scenarioAt(rtt)
} finally {
  report.passed =
    report.scenarios.length === 3 &&
    report.scenarios.every((item) => item.passed)
  report.endedAt = new Date().toISOString()
  await writeFile(
    path.join(output, "online-latency-report.json"),
    JSON.stringify(report, null, 2)
  )
  await browser.close()
  console.log(JSON.stringify(report, null, 2))
  if (!report.passed) process.exitCode = 1
}
