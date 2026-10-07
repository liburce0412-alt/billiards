import type { PlatformMe } from "./api"

export interface GameDebugSource {
  getMobileInputState?: () => unknown
  getControlLayout?: () => unknown
  getPowerState?: () => unknown
  getPhysicsState?: () => unknown
  exportLastShotRepro?: () => unknown
  getRenderQuality?: () => unknown
  getRenderStats?: () => unknown
}

type WebMcpTool = {
  name: string
  title: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, never>
    additionalProperties: false
  }
  annotations: { readOnlyHint: true; idempotentHint: true }
  execute: () => Promise<unknown>
}

type WebModelContext = {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal }
  ) => Promise<void> | void
}

let debugSource: GameDebugSource = {}

function isSensitiveDiagnosticKey(key: string): boolean {
  return /email|token|secret|cookie|authorization|chat|message/i.test(key)
}

function isIdentityDiagnosticKey(key: string): boolean {
  return /^(user|client|sender|owner)Id$/i.test(key)
}

export function setGameDebugSource(source: GameDebugSource): () => void {
  debugSource = { ...debugSource, ...source }
  return () => {
    for (const [key, getter] of Object.entries(source)) {
      if (debugSource[key as keyof GameDebugSource] === getter) {
        delete debugSource[key as keyof GameDebugSource]
      }
    }
  }
}

function sanitise(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth limited]"
  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value
  }
  if (typeof value === "string") return value.slice(0, 256)
  if (Array.isArray(value)) {
    return value.slice(0, 64).map((item) => sanitise(item, depth + 1))
  }
  if (typeof value !== "object") return String(value)
  return sanitiseObject(value, depth)
}

function sanitiseObject(value: object, depth: number): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (isSensitiveDiagnosticKey(key)) continue
    if (isIdentityDiagnosticKey(key)) {
      const id = typeof item === "string" ? item : ""
      result[key] = id ? `${id.slice(0, 8)}…` : ""
      continue
    }
    result[key] = sanitise(item, depth + 1)
  }
  return result
}

function readLayout() {
  const selectors = [
    ["canvas", "#viewP1"],
    ["controlRail", "#panel"],
    ["power", "#powerSliderContainer"],
    ["cueBall", "#cueBall"],
    ["freeBall", "#repositionCueBall, #cueHit[data-action-mode='placement']"],
  ] as const
  const elements = Object.fromEntries(
    selectors.map(([name, selector]) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) return [name, null]
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return [
        name,
        {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          visible: style.display !== "none" && style.visibility !== "hidden",
          pointerEvents: style.pointerEvents,
        },
      ]
    })
  )
  return {
    viewport: {
      width: globalThis.innerWidth,
      height: globalThis.innerHeight,
      dpr: globalThis.devicePixelRatio,
      orientation:
        globalThis.innerWidth >= globalThis.innerHeight
          ? "landscape"
          : "portrait",
    },
    elements,
  }
}

function read(name: keyof GameDebugSource, fallback?: () => unknown) {
  try {
    const value = debugSource[name]?.() ?? fallback?.()
    return sanitise(value ?? { available: false })
  } catch (error) {
    return {
      available: false,
      error: error instanceof Error ? error.message : "diagnostic unavailable",
    }
  }
}

function tool(
  name: string,
  title: string,
  description: string,
  getter: keyof GameDebugSource,
  fallback?: () => unknown
): WebMcpTool {
  return {
    name,
    title,
    description,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
    execute: async () => read(getter, fallback),
  }
}

function isLocalDebugOrigin() {
  return ["localhost", "127.0.0.1"].includes(globalThis.location.hostname)
}

export function registerGameDebugTools(session: PlatformMe): () => void {
  const modelContext = (
    document as Document & { modelContext?: WebModelContext }
  ).modelContext
  if (
    !modelContext ||
    (!isLocalDebugOrigin() && !session.capabilities.adminDemoAssist)
  ) {
    return () => undefined
  }

  const controller = new AbortController()
  const tools = [
    tool(
      "game_get_mobile_input_state",
      "读取移动输入状态",
      "只读返回当前手势阶段、指针数量与瞄准灵敏度。",
      "getMobileInputState"
    ),
    tool(
      "game_get_control_layout",
      "读取控制布局",
      "只读返回 Canvas 与右侧操作栏的可见边界和命中状态。",
      "getControlLayout",
      readLayout
    ),
    tool(
      "game_get_power_state",
      "读取击球力度",
      "只读返回当前标准化力度、蓄力状态与绝对杆速。",
      "getPowerState"
    ),
    tool(
      "game_get_physics_state",
      "读取物理状态",
      "只读返回球的运动、滑动与能量诊断，不返回玩家身份。",
      "getPhysicsState"
    ),
    tool(
      "game_export_last_shot_repro",
      "导出最近一杆复现",
      "只读返回最近一杆的确定性物理复现数据。",
      "exportLastShotRepro"
    ),
    tool(
      "game_get_render_quality",
      "读取渲染画质",
      "只读返回当前画质档、DPR 与自适应降档原因。",
      "getRenderQuality"
    ),
    tool(
      "game_get_render_stats",
      "读取渲染统计",
      "只读返回绘制调用、三角形与纹理数量。",
      "getRenderStats"
    ),
  ]
  for (const item of tools) {
    try {
      void Promise.resolve(
        modelContext.registerTool(item, { signal: controller.signal })
      ).catch((error) =>
        console.warn(`WebMCP tool ${item.name} unavailable`, error)
      )
    } catch (error) {
      console.warn(`WebMCP tool ${item.name} unavailable`, error)
    }
  }
  return () => controller.abort()
}
