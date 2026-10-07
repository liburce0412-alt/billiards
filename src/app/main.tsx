import { createRoot } from "react-dom/client"
import { App } from "./app"
import { mountViewportStore } from "./stores"

const legacyRoutes: Record<string, string> = {
  "/account.html": "/account",
  "/admin.html": "/admin",
  "/lobby.html": "/lobby",
  "/rules.html": "/rules",
}

const current = new URL(globalThis.location.href)
const normalizedPath = legacyRoutes[current.pathname]
if (normalizedPath) {
  current.pathname = normalizedPath
  globalThis.history.replaceState({}, "", current)
} else if (current.searchParams.has("play") && current.pathname === "/") {
  current.pathname = "/play"
  globalThis.history.replaceState({}, "", current)
}

document.body.classList.toggle("app-game-route", current.pathname === "/play")
document.body.classList.toggle(
  "app-platform-route",
  current.pathname !== "/play"
)
mountViewportStore()

const root = document.querySelector<HTMLElement>("#appRoot")
if (!root) throw new Error("React application root is missing")
createRoot(root).render(<App />)
