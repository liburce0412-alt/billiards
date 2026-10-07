import { useEffect, useState } from "react"
import { BrowserRouter, Route, Routes } from "react-router"
import type { PlatformMe } from "../platform/api"
import { loadSession } from "../platform/api"
import { applyPersonalisation, platformGate } from "../platform/shell"
import { publishVerifiedGameIdentity } from "../platform/gameidentity"
import { GameRoute } from "./game-route"
import { LauncherPage } from "./launcher-page"
import { LegacyPlatformPage } from "./legacy-page"
import { RulesPage } from "./rules-page"
import { ToolsPage } from "./tools-page"
import { TableTennisRoute } from "./table-tennis-route"

export function App() {
  const [session, setSession] = useState<PlatformMe | null | undefined>(
    undefined
  )

  useEffect(() => {
    let active = true
    loadSession()
      .then(async (next) => {
        if (!next) {
          await platformGate()
          if (active) setSession(null)
          return
        }
        applyPersonalisation(next)
        publishVerifiedGameIdentity(next)
        ;(
          globalThis as typeof globalThis & {
            __BREAK_BUILDER_SESSION__?: PlatformMe
          }
        ).__BREAK_BUILDER_SESSION__ = next
        if (active) setSession(next)
      })
      .catch(async () => {
        await platformGate()
        if (active) setSession(null)
      })
    return () => {
      active = false
    }
  }, [])

  if (session === undefined)
    return (
      <div className="holo-boot">
        <i />
        <span>正在校准透明舱</span>
      </div>
    )
  if (!session) return null

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LauncherPage session={session} />} />
        <Route path="/play" element={<GameRoute session={session} />} />
        <Route
          path="/table-tennis"
          element={<TableTennisRoute session={session} />}
        />
        <Route
          path="/lobby"
          element={<LegacyPlatformPage page="lobby" session={session} />}
        />
        <Route
          path="/account"
          element={<LegacyPlatformPage page="account" session={session} />}
        />
        <Route
          path="/admin"
          element={<LegacyPlatformPage page="admin" session={session} />}
        />
        <Route path="/rules" element={<RulesPage session={session} />} />
        <Route path="/help" element={<ToolsPage session={session} />} />
        <Route path="/tools/*" element={<ToolsPage session={session} />} />
        <Route path="*" element={<LauncherPage session={session} />} />
      </Routes>
    </BrowserRouter>
  )
}
