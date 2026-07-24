/* global require, __dirname, console */

const fs = require("node:fs")
const path = require("node:path")

const projectRoot = path.resolve(__dirname, "..")
const distDirectory = path.join(projectRoot, "dist")
const clientDirectory = path.join(distDirectory, "client")
const serverDirectory = path.join(distDirectory, "server")
const hostingSource = path.join(projectRoot, ".openai", "hosting.json")
const hostingDirectory = path.join(distDirectory, ".openai")
const workerSource = path.join(projectRoot, "worker", "index.js")

const generatedDirectories = new Set(["client", "server", ".openai"])

fs.rmSync(clientDirectory, { recursive: true, force: true })
fs.rmSync(serverDirectory, { recursive: true, force: true })
fs.rmSync(hostingDirectory, { recursive: true, force: true })
fs.mkdirSync(clientDirectory, { recursive: true })

for (const entry of fs.readdirSync(distDirectory, { withFileTypes: true })) {
  if (generatedDirectories.has(entry.name)) continue
  fs.cpSync(
    path.join(distDirectory, entry.name),
    path.join(clientDirectory, entry.name),
    { recursive: true }
  )
}

fs.mkdirSync(serverDirectory, { recursive: true })
fs.copyFileSync(workerSource, path.join(serverDirectory, "index.js"))

fs.mkdirSync(hostingDirectory, { recursive: true })
fs.copyFileSync(hostingSource, path.join(hostingDirectory, "hosting.json"))

console.log("Prepared the Sites worker and static asset bundle in dist/")
