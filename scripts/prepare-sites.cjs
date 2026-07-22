/* global require, __dirname, console */

const fs = require("node:fs")
const path = require("node:path")

const projectRoot = path.resolve(__dirname, "..")
const distDirectory = path.join(projectRoot, "dist")
const clientDirectory = path.join(distDirectory, "client")
const serverDirectory = path.join(distDirectory, "server")
const hostingSource = path.join(projectRoot, ".openai", "hosting.json")
const hostingDirectory = path.join(distDirectory, ".openai")

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
fs.writeFileSync(
  path.join(serverDirectory, "index.js"),
  `const getAsset = (request, env, pathname) => {
  const url = new URL(request.url)
  url.pathname = pathname
  return env.ASSETS.fetch(new Request(url, request))
}

export default {
  async fetch(request, env) {
    if (!env.ASSETS) {
      return new Response("Static asset binding is unavailable", { status: 500 })
    }

    const url = new URL(request.url)
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname
    const response = await getAsset(request, env, pathname)
    if (response.status !== 404) return response

    const acceptsHtml = request.headers.get("accept")?.includes("text/html")
    if ((request.method === "GET" || request.method === "HEAD") && acceptsHtml) {
      return getAsset(request, env, "/index.html")
    }

    return response
  },
}
`
)

fs.mkdirSync(hostingDirectory, { recursive: true })
fs.copyFileSync(hostingSource, path.join(hostingDirectory, "hosting.json"))

console.log("Prepared the Sites worker and static asset bundle in dist/")
