/* global require, __dirname, process, console, Buffer, fetch, AbortSignal, URL */
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { setTimeout: delay } = require("node:timers/promises")

const root = path.resolve(__dirname, "..")
const output = path.join(root, "docs/qa/2026-10-05-release")
const originIndex = process.argv.indexOf("--origin")
const origin = new URL(
  originIndex >= 0
    ? process.argv[originIndex + 1]
    : "https://play.campus3ai.xyz"
).origin
const run = process.argv.includes("--run")
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex")

function localAsset(relativePath, category, url, cache = "record") {
  const bytes = fs.readFileSync(path.join(root, "dist", relativePath))
  return {
    category,
    url: url || `/${relativePath}`,
    localFile: `dist/${relativePath}`,
    sha256: digest(bytes),
    bytes: bytes.length,
    status: 200,
    cache,
  }
}

function prepare() {
  const legacy = JSON.parse(
    fs.readFileSync(
      path.join(root, "dist/models/legacy-refined/manifest.json"),
      "utf8"
    )
  )
  const tennis = JSON.parse(
    fs.readFileSync(
      path.join(root, "dist/models/table-tennis/manifest.json"),
      "utf8"
    )
  )
  if (
    legacy.assets.length !== 96 ||
    legacy.assets.some((asset) => !asset.visualReviewed)
  ) {
    throw new Error("Expected all 96 visually reviewed legacy models")
  }
  const expected = [
    ...["/", "/play", "/table-tennis", "/account"].map((url) => ({
      ...localAsset(
        url === "/account" ? "account.html" : "index.html",
        "page",
        url,
        url === "/account" ? "revalidate" : "no-cache"
      ),
      contentType: "text/html",
    })),
    {
      category: "anonymous-auth",
      url: "/api/me",
      status: 401,
      contentType: "application/json",
      cache: "record",
    },
    localAsset(
      "models/legacy-refined/manifest.json",
      "manifest",
      undefined,
      "no-cache"
    ),
    localAsset(
      "models/table-tennis/manifest.json",
      "manifest",
      undefined,
      "no-cache"
    ),
  ]
  for (const asset of legacy.assets) {
    const relativePath = `models/legacy-refined/${asset.file}`
    const entry = localAsset(
      relativePath,
      "legacy-model",
      `/${relativePath}?v=${asset.sha256.slice(0, 12)}`
    )
    if (entry.sha256 !== asset.sha256 || entry.bytes !== asset.bytes) {
      throw new Error(`Local manifest does not match ${asset.id}`)
    }
    expected.push({ ...entry, id: asset.id })
  }
  for (const [id, filename] of Object.entries(tennis.models)) {
    expected.push({
      ...localAsset(
        `models/table-tennis/${tennis.version}/${filename}`,
        "table-tennis-model"
      ),
      id,
    })
  }
  if (Object.keys(tennis.models).length !== 4) {
    throw new Error("Expected four active table tennis models")
  }
  for (const filename of fs.readdirSync(path.join(root, "dist"))) {
    if (filename.endsWith(".js")) {
      expected.push(localAsset(filename, "javascript", undefined, "no-cache"))
    }
  }
  for (const filename of fs.readdirSync(path.join(root, "dist/css"))) {
    if (filename.endsWith(".css")) {
      expected.push(
        localAsset(`css/${filename}`, "stylesheet", undefined, "no-cache")
      )
    }
  }
  return {
    preparedAt: new Date().toISOString(),
    origin,
    tableTennisVersion: tennis.version,
    expected,
  }
}

async function request(entry) {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(new URL(entry.url, origin), {
        headers: { "User-Agent": "BreakBuilder-ReadOnlyReleaseVerification/1" },
        signal: AbortSignal.timeout(45000),
        redirect: "follow",
      })
      const bytes = Buffer.from(await response.arrayBuffer())
      if ([502, 503, 504].includes(response.status) && attempt < 3) {
        await delay(1000 * attempt)
        continue
      }
      return {
        attempt,
        status: response.status,
        finalUrl: response.url,
        bytes: bytes.length,
        sha256: digest(bytes),
        contentType: response.headers.get("content-type"),
        cacheControl: response.headers.get("cache-control"),
        cfCacheStatus: response.headers.get("cf-cache-status"),
        etag: response.headers.get("etag"),
      }
    } catch (error) {
      lastError = error
      if (attempt < 3) await delay(1000 * attempt)
    }
  }
  return { error: String(lastError) }
}

function mismatches(entry, actual) {
  if (actual.error) return [actual.error]
  const failures = []
  if (actual.status !== entry.status) failures.push("status")
  if (entry.sha256 && actual.sha256 !== entry.sha256) failures.push("sha256")
  if (entry.bytes && actual.bytes !== entry.bytes) failures.push("bytes")
  if (entry.contentType && !actual.contentType?.includes(entry.contentType)) {
    failures.push("content-type")
  }
  if (!validCache(entry.cache, actual.cacheControl))
    failures.push("cache-control")
  return failures
}

function validCache(policy, header) {
  if (policy === "record") return true
  const directives = (header || "").split(",").map((value) => value.trim())
  if (directives.includes("no-cache")) return true
  return (
    policy === "revalidate" &&
    directives.includes("max-age=0") &&
    directives.includes("must-revalidate")
  )
}

async function recheckAccount(prepared) {
  const reportPath = path.join(output, "production-verification.json")
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"))
  if (report.origin !== origin)
    throw new Error("Existing report origin differs")
  for (const entry of prepared.expected) {
    const previous = report.results.find((result) => result.url === entry.url)
    if (!previous || previous.sha256 !== entry.sha256) {
      throw new Error(`Local release changed since verification: ${entry.url}`)
    }
  }
  const archive = path.join(output, "production-verification-strict-cache.json")
  if (!fs.existsSync(archive)) fs.copyFileSync(reportPath, archive)
  const entry = prepared.expected.find((result) => result.url === "/account")
  const actual = await request(entry)
  const failures = mismatches(entry, actual)
  const index = report.results.findIndex((result) => result.url === "/account")
  report.results[index] = {
    ...entry,
    actual,
    failures,
    passed: !failures.length,
  }
  report.accountRecheckedAt = new Date().toISOString()
  report.accountCacheNote =
    "Account accepts no-cache or max-age=0 with must-revalidate. Other 164 HTTP observations retained from verifiedAt; original strict literal check archived."
  report.summary.passed = report.results.filter(
    (result) => result.passed
  ).length
  report.summary.failed = report.results.length - report.summary.passed
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report.summary))
  if (report.summary.failed) process.exitCode = 1
}

async function verify(prepared) {
  const results = new Array(prepared.expected.length)
  let next = 0
  let completed = 0
  const worker = async () => {
    while (next < prepared.expected.length) {
      const index = next++
      const entry = prepared.expected[index]
      const actual = await request(entry)
      const failures = mismatches(entry, actual)
      results[index] = { ...entry, actual, failures, passed: !failures.length }
      completed++
      if (completed % 20 === 0 || failures.length) {
        console.log(
          `${completed}/${results.length} ${entry.url}: ${failures.length ? failures.join(", ") : "passed"}`
        )
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  const report = {
    preparedAt: prepared.preparedAt,
    verifiedAt: new Date().toISOString(),
    origin,
    tableTennisVersion: prepared.tableTennisVersion,
    readOnly: true,
    method: "Anonymous HTTPS GET; SHA256 of decoded response bodies",
    limitations: [
      "Does not authenticate, create rooms, or mutate production data",
      "HTTP byte checks do not replace browser interaction or physical-device acceptance",
      "Model cache headers recorded; versioned model URLs verified against local bytes",
    ],
    summary: {
      total: results.length,
      passed: results.filter((result) => result.passed).length,
      failed: results.filter((result) => !result.passed).length,
      categories: Object.fromEntries(
        [...new Set(results.map((result) => result.category))].map(
          (category) => [
            category,
            results.filter((result) => result.category === category).length,
          ]
        )
      ),
    },
    results,
  }
  fs.writeFileSync(
    path.join(output, "production-verification.json"),
    `${JSON.stringify(report, null, 2)}\n`
  )
  console.log(JSON.stringify(report.summary))
  if (report.summary.failed) process.exitCode = 1
}

async function main() {
  const prepared = prepare()
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(
    path.join(output, "expected-release.json"),
    `${JSON.stringify(prepared, null, 2)}\n`
  )
  console.log(`Prepared ${prepared.expected.length} read-only checks`)
  if (process.argv.includes("--recheck-account")) await recheckAccount(prepared)
  else if (run) await verify(prepared)
  else console.log("No network requests made. Pass --run after deployment.")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
