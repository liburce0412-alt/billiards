import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { randomBytes } from "node:crypto"
import process from "node:process"
import ts from "typescript"

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
)
const configPath = path.join(root, ".wrangler/table-tennis-qa.json")
const config = ts.parseConfigFileTextToJson(
  "wrangler.jsonc",
  await readFile(path.join(root, "wrangler.jsonc"), "utf8")
).config
config.name = "break-builder-tt-qa"
config.main = path.resolve(root, config.main)
config.assets.directory = path.resolve(root, config.assets.directory)
for (const database of config.d1_databases)
  database.migrations_dir = path.resolve(root, database.migrations_dir)
config.routes = []
let secret = randomBytes(32).toString("base64url")
try {
  secret = JSON.parse(await readFile(configPath, "utf8")).vars
    .BETTER_AUTH_SECRET
} catch {
  /* First isolated local run. */
}
config.vars = {
  ...config.vars,
  APP_ORIGIN: "http://127.0.0.1:8792",
  ENVIRONMENT: "development",
  BETTER_AUTH_SECRET: secret,
  TURNSTILE_SECRET_KEY: "",
  TURNSTILE_SITE_KEY: "",
}
await mkdir(path.dirname(configPath), { recursive: true })
await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 })
const common = [
  "--local",
  "--config",
  configPath,
  "--persist-to",
  ".wrangler/table-tennis-qa-state",
]
const run = (args) =>
  spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", ...args], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  })
const migration = run([
  "d1",
  "migrations",
  "apply",
  "break-builder-prod",
  ...common,
])
const [migrationExit] = await once(migration, "exit")
if (migrationExit !== 0) process.exit(migrationExit || 1)
const worker = run(["dev", "--ip", "127.0.0.1", "--port", "8792", ...common])
process.on("SIGINT", () => worker.kill("SIGINT"))
process.on("SIGTERM", () => worker.kill("SIGTERM"))
const [workerExit] = await once(worker, "exit")
process.exitCode = workerExit || 0
