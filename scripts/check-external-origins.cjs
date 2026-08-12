/* global require, __dirname, console, process */

const fs = require("node:fs")
const path = require("node:path")

const root = path.resolve(__dirname, "..")
const targets = ["src", "dist", "server"]
const ignoredNames = new Set(["LICENSE", "COPYING"])
const readable = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".md",
  ".ts",
  ".txt",
  ".webmanifest",
  ".xml",
])
const forbidden = [
  /scoreboard-tailuge\.vercel\.app/i,
  /nchanproxy\.tailuge\.workers\.dev/i,
  /billiards\.tailuge\.workers\.dev/i,
  /billiards-network\.onrender\.com/i,
  /tailuge\.github\.io\/billiards/i,
  /github\.com\/tailuge\/billiards/i,
  /liburce3d-billiards\.sharp-heron-2601\.chatgpt\.site/i,
]

const violations = []

for (const target of targets) {
  walk(path.join(root, target))
}

if (violations.length) {
  console.error("Forbidden legacy origins remain in deployable code:")
  for (const violation of violations) console.error(`- ${violation}`)
  process.exitCode = 1
} else {
  console.log("Origin audit passed: no legacy runtime or product origins found")
}

function walk(entry) {
  if (!fs.existsSync(entry)) return
  const stat = fs.statSync(entry)
  if (stat.isDirectory()) {
    const relative = path.relative(root, entry).replaceAll("\\", "/")
    if (relative === "dist/client" || relative === "dist/server") return
    for (const child of fs.readdirSync(entry)) walk(path.join(entry, child))
    return
  }
  if (
    ignoredNames.has(path.basename(entry)) ||
    !readable.has(path.extname(entry))
  ) {
    return
  }
  const content = fs.readFileSync(entry, "utf8")
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      violations.push(`${path.relative(root, entry)} (${pattern.source})`)
    }
  }
}
