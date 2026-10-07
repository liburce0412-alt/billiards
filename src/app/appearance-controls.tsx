import { useEffect, useState } from "react"
import {
  glassChangeEvent,
  readGlassPreferences,
  writeGlassPreferences,
  type GlassPreferences,
} from "../../packages/table-tennis/src/browser/glass"

/** Local UI preferences never recreate a game or change account/match state. */
export function AppearanceControls() {
  const [preferences, setPreferences] = useState(readGlassPreferences)
  useEffect(() => {
    const update = () => setPreferences(readGlassPreferences())
    window.addEventListener(glassChangeEvent, update)
    return () => window.removeEventListener(glassChangeEvent, update)
  }, [])
  function change<K extends keyof GlassPreferences>(
    key: K,
    value: GlassPreferences[K]
  ) {
    const next = { ...preferences, [key]: value }
    setPreferences(next)
    writeGlassPreferences(next)
  }
  return (
    <details className="caesar-appearance">
      <summary aria-label="界面外观设置">
        <i className="ph ph-sparkle" aria-hidden="true" /> 外观
      </summary>
      <section className="caesar-appearance__panel" aria-label="本机界面外观">
        <header>
          <strong>让光随你而动</strong>
          <small>外观保存在此设备</small>
        </header>
        <label>
          主题
          <select
            value={preferences.theme}
            onChange={(event) =>
              change("theme", event.target.value as GlassPreferences["theme"])
            }
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
        <label>
          配色
          <select
            value={preferences.palette}
            onChange={(event) =>
              change(
                "palette",
                event.target.value as GlassPreferences["palette"]
              )
            }
          >
            <option value="lagoon">青屿</option>
            <option value="violet">暮紫</option>
            <option value="sunrise">晨曦</option>
          </select>
        </label>
        <label>
          氛围
          <select
            value={preferences.atmosphere}
            onChange={(event) =>
              change(
                "atmosphere",
                event.target.value as GlassPreferences["atmosphere"]
              )
            }
          >
            <option value="classic">Classic · 克制</option>
            <option value="fluid">Fluid · 流动</option>
          </select>
        </label>
        {(
          [
            ["materialMotion", "界面动态效果"],
            ["rimLight", "跟手边缘光"],
            ["aurora", "深色极光"],
            ["meteors", "深色流星"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="caesar-switch">
            {label}
            <input
              type="checkbox"
              checked={preferences[key]}
              onChange={(event) => change(key, event.target.checked)}
            />
          </label>
        ))}
        <p>关闭界面动效不会暂停球赛。低画质及减少动态偏好会进一步收敛效果。</p>
      </section>
    </details>
  )
}
