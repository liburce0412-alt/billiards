/* global require, __dirname, console */

const fs = require("node:fs")
const path = require("node:path")

const projectRoot = path.resolve(__dirname, "..")
const distDirectory = path.join(projectRoot, "dist")
const legacyGenerated = ["client", "server", ".openai"]

fs.copyFileSync(
  path.join(projectRoot, "tokens.css"),
  path.join(distDirectory, "tokens.css")
)

for (const directory of legacyGenerated) {
  fs.rmSync(path.join(distDirectory, directory), {
    recursive: true,
    force: true,
  })
}

const phosphorSource = path.join(
  projectRoot,
  "node_modules",
  "@phosphor-icons",
  "web",
  "src",
  "regular"
)
const phosphorTarget = path.join(distDirectory, "vendor", "phosphor")
fs.rmSync(phosphorTarget, { recursive: true, force: true })
fs.mkdirSync(phosphorTarget, { recursive: true })
for (const file of ["style.css", "Phosphor.woff2"]) {
  fs.copyFileSync(
    path.join(phosphorSource, file),
    path.join(phosphorTarget, file)
  )
}

const retiredPages = [
  "2p.html",
  "2tab.html",
  "multi.html",
  "redirect.html",
  "korean.html",
  "blog1.html",
  "blog2.html",
  "blog3.html",
  "ww.html",
  "3r.html",
  "embed.html",
  "practice.html",
]
const retiredDirectories = ["itch", "exam", "speedrun"]
for (const file of retiredPages) {
  fs.rmSync(path.join(distDirectory, file), { force: true })
}
for (const directory of retiredDirectories) {
  fs.rmSync(path.join(distDirectory, directory), {
    recursive: true,
    force: true,
  })
}

console.log("Prepared self-hosted UI assets for the Cloudflare Worker bundle")
