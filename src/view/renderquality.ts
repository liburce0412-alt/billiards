import { Session } from "../network/client/session"

export type RenderQualityName = "low" | "balanced" | "high"
export type RenderQualityMode = "adaptive" | RenderQualityName

export interface RenderQualityProfile {
  readonly name: RenderQualityName
  readonly antialias: boolean
  readonly dynamicShadows: boolean
  readonly environmentLighting: boolean
  readonly environmentMotion: boolean
  readonly shadowMapSize: number
  readonly maxPixelRatio: number
  readonly compactTouchPixelRatio: number
  readonly canvasPixelBudget: number
  readonly ballTextureSize: number
  readonly ballSegments: number
  readonly ballRows: number
  readonly environmentSegments: number
  readonly environmentDrawBudget: number
  readonly environmentTriangleBudget: number
  readonly pmremSize: number
  readonly maxAnisotropy: number
}

export const RENDER_QUALITY_STORAGE_KEY = "break-builder.render-quality"

export const RENDER_QUALITY_PROFILES: Readonly<
  Record<RenderQualityName, RenderQualityProfile>
> = {
  low: {
    name: "low",
    antialias: false,
    dynamicShadows: false,
    environmentLighting: false,
    environmentMotion: false,
    shadowMapSize: 0,
    maxPixelRatio: 1,
    compactTouchPixelRatio: 1,
    canvasPixelBudget: 1_000_000,
    ballTextureSize: 256,
    ballSegments: 24,
    ballRows: 16,
    environmentSegments: 24,
    environmentDrawBudget: 6,
    environmentTriangleBudget: 8_000,
    pmremSize: 0,
    maxAnisotropy: 1,
  },
  balanced: {
    name: "balanced",
    antialias: true,
    dynamicShadows: true,
    environmentLighting: true,
    environmentMotion: true,
    shadowMapSize: 1024,
    maxPixelRatio: 1.5,
    compactTouchPixelRatio: 1.75,
    canvasPixelBudget: 2_000_000,
    ballTextureSize: 512,
    ballSegments: 48,
    ballRows: 32,
    environmentSegments: 40,
    environmentDrawBudget: 16,
    environmentTriangleBudget: 80_000,
    pmremSize: 256,
    maxAnisotropy: 8,
  },
  high: {
    name: "high",
    antialias: true,
    dynamicShadows: true,
    environmentLighting: true,
    environmentMotion: true,
    shadowMapSize: 2048,
    maxPixelRatio: 2,
    compactTouchPixelRatio: 2.5,
    canvasPixelBudget: 3_500_000,
    ballTextureSize: 512,
    ballSegments: 64,
    ballRows: 40,
    environmentSegments: 64,
    environmentDrawBudget: 28,
    environmentTriangleBudget: 200_000,
    pmremSize: 512,
    maxAnisotropy: 16,
  },
}

const QUALITY_ORDER: readonly RenderQualityName[] = ["low", "balanced", "high"]

function qualityFromLod(lod: number): RenderQualityName {
  if (lod <= 1) return "low"
  if (lod >= 5) return "high"
  return "balanced"
}

function isQualityName(value: string | null): value is RenderQualityName {
  return value === "low" || value === "balanced" || value === "high"
}

export function renderQualityMode(
  params = new URLSearchParams(globalThis.location?.search ?? ""),
  fallback: RenderQualityMode = "adaptive"
): RenderQualityMode {
  const requested = params.get("quality")
  if (isQualityName(requested)) return requested
  if (requested === "adaptive" || requested === "auto") return "adaptive"

  try {
    const stored = globalThis.localStorage?.getItem(RENDER_QUALITY_STORAGE_KEY)
    if (stored === "adaptive" || isQualityName(stored)) return stored
  } catch {
    // Storage is optional; adaptive showcase quality is the product default.
  }
  return fallback
}

/**
 * The account API predates adaptive rendering and can only persist concrete
 * tiers. Treat its historical `high` default as visual-first adaptive unless
 * the user explicitly locked a mode in the URL or local storage.
 */
export function renderQualityModeForPreference(
  preference: RenderQualityName,
  params = new URLSearchParams(globalThis.location?.search ?? "")
): RenderQualityMode {
  return renderQualityMode(
    params,
    preference === "high" ? "adaptive" : preference
  )
}

/** Keep the existing server schema compatible while adaptive stays local. */
export function serverQualityForRenderMode(
  mode: RenderQualityMode
): RenderQualityName {
  return mode === "adaptive" ? "high" : mode
}

export function saveRenderQualityMode(mode: string): RenderQualityMode {
  const resolved: RenderQualityMode =
    mode === "adaptive" || isQualityName(mode) ? mode : "adaptive"
  try {
    globalThis.localStorage?.setItem(RENDER_QUALITY_STORAGE_KEY, resolved)
  } catch {
    // The live selection still applies when storage is unavailable.
  }
  return resolved
}

export function getRenderQuality(
  params = new URLSearchParams(globalThis.location?.search ?? "")
): RenderQualityProfile {
  const mode = renderQualityMode(params)
  if (mode === "adaptive") return RENDER_QUALITY_PROFILES.high
  return RENDER_QUALITY_PROFILES[mode]
}

export function legacyRenderQuality(
  lod = Session.getLod()
): RenderQualityProfile {
  return RENDER_QUALITY_PROFILES[qualityFromLod(lod)]
}

export function pixelRatioForViewport(
  profile: RenderQualityProfile,
  width: number,
  height: number,
  devicePixelRatio = globalThis.devicePixelRatio || 1,
  compactTouch = typeof matchMedia === "function" &&
    matchMedia("(pointer: coarse) and (max-height: 600px)").matches
): number {
  const cssPixels = Math.max(1, width * height)
  const budgetLimit = Math.sqrt(profile.canvasPixelBudget / cssPixels)
  const densityLimit = compactTouch
    ? profile.compactTouchPixelRatio
    : profile.maxPixelRatio
  return Math.max(0.75, Math.min(devicePixelRatio, densityLimit, budgetLimit))
}

export type RenderQualityListener = (profile: RenderQualityProfile) => void

export interface RenderQualityDiagnostics {
  mode: RenderQualityMode
  tier: RenderQualityName
  locked: boolean
  pendingDowngrade: boolean
  frameP95Ms: number | null
  downgradeReason: "sustained-frame-pressure" | "webgl-context-pressure" | null
  pixelRatio: number | null
  drawCalls: number | null
  triangles: number | null
  textures: number | null
  geometries: number | null
  programs: number | null
}

/** Visual-first monitor that waits for a stationary table before stepping down. */
export class AdaptiveRenderQuality {
  private readonly listeners = new Set<RenderQualityListener>()
  private readonly samples: number[] = []
  private slowDurationMs = 0
  private pendingDowngrade = false
  private currentName: RenderQualityName
  private frameP95Ms: number | null = null
  private downgradeReason: RenderQualityDiagnostics["downgradeReason"] = null

  constructor(
    readonly mode: RenderQualityMode = "adaptive",
    initialName: RenderQualityName = mode === "adaptive" ? "high" : mode
  ) {
    this.currentName = initialName
  }

  get profile(): RenderQualityProfile {
    return RENDER_QUALITY_PROFILES[this.currentName]
  }

  get isLocked(): boolean {
    return this.mode !== "adaptive"
  }

  onChange(listener: RenderQualityListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  observeFrame(frameMs: number, safeToApply: boolean): boolean {
    if (this.isLocked || this.currentName === "low") return false
    const sample = Math.min(250, Math.max(1, frameMs))
    this.samples.push(sample)
    if (this.samples.length > 180) this.samples.shift()

    if (this.samples.length >= 60) {
      const ordered = [...this.samples].sort((a, b) => a - b)
      const p95 = ordered[Math.floor((ordered.length - 1) * 0.95)]
      this.frameP95Ms = p95
      this.slowDurationMs = p95 > 33 ? this.slowDurationMs + sample : 0
      if (this.slowDurationMs >= 5_000) this.pendingDowngrade = true
    }

    if (!this.pendingDowngrade || !safeToApply) return false
    return this.downgrade()
  }

  emergencyFallback(): boolean {
    if (this.currentName === "low") return false
    this.currentName = "low"
    this.downgradeReason = "webgl-context-pressure"
    this.resetWindow()
    this.notify()
    return true
  }

  private downgrade(): boolean {
    const currentIndex = QUALITY_ORDER.indexOf(this.currentName)
    if (currentIndex <= 0) return false
    this.currentName = QUALITY_ORDER[currentIndex - 1]
    this.downgradeReason = "sustained-frame-pressure"
    this.resetWindow()
    this.notify()
    return true
  }

  private resetWindow(): void {
    this.samples.length = 0
    this.slowDurationMs = 0
    this.pendingDowngrade = false
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.profile))
  }

  diagnostics(): Omit<
    RenderQualityDiagnostics,
    | "pixelRatio"
    | "drawCalls"
    | "triangles"
    | "textures"
    | "geometries"
    | "programs"
  > {
    return {
      mode: this.mode,
      tier: this.currentName,
      locked: this.isLocked,
      pendingDowngrade: this.pendingDowngrade,
      frameP95Ms: this.frameP95Ms,
      downgradeReason: this.downgradeReason,
    }
  }
}

const controllers = new WeakMap<object, AdaptiveRenderQuality>()

export function registerRenderQualityController(
  owner: object,
  controller: AdaptiveRenderQuality
): void {
  controllers.set(owner, controller)
}

export function renderQualityControllerFor(
  owner: object | undefined
): AdaptiveRenderQuality | undefined {
  return owner ? controllers.get(owner) : undefined
}

type RendererDiagnosticsSource = {
  getPixelRatio?: () => number
  info?: {
    render?: { calls?: number; triangles?: number }
    memory?: { textures?: number; geometries?: number }
    programs?: unknown[] | null
  }
}

export function renderQualityDiagnostics(
  owner: (object & RendererDiagnosticsSource) | undefined
): RenderQualityDiagnostics | undefined {
  if (!owner) return undefined
  const controller = renderQualityControllerFor(owner)
  if (!controller) return undefined
  const base = controller.diagnostics()
  return {
    ...base,
    pixelRatio: owner.getPixelRatio?.() ?? null,
    drawCalls: owner.info?.render?.calls ?? null,
    triangles: owner.info?.render?.triangles ?? null,
    textures: owner.info?.memory?.textures ?? null,
    geometries: owner.info?.memory?.geometries ?? null,
    programs: owner.info?.programs?.length ?? null,
  }
}
