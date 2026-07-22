import { Session } from "../network/client/session"

export type RenderQualityName = "low" | "balanced" | "high"

export interface RenderQualityProfile {
  readonly name: RenderQualityName
  readonly antialias: boolean
  readonly dynamicShadows: boolean
  readonly environmentLighting: boolean
  readonly shadowMapSize: number
  readonly maxPixelRatio: number
  readonly ballTextureSize: number
}

const profiles: Record<RenderQualityName, RenderQualityProfile> = {
  low: {
    name: "low",
    antialias: false,
    dynamicShadows: false,
    environmentLighting: false,
    shadowMapSize: 0,
    maxPixelRatio: 1,
    ballTextureSize: 128,
  },
  balanced: {
    name: "balanced",
    antialias: true,
    dynamicShadows: true,
    environmentLighting: true,
    shadowMapSize: 1024,
    maxPixelRatio: 1.5,
    ballTextureSize: 256,
  },
  high: {
    name: "high",
    antialias: true,
    dynamicShadows: true,
    environmentLighting: true,
    shadowMapSize: 2048,
    maxPixelRatio: 2,
    ballTextureSize: 512,
  },
}

function qualityFromLod(lod: number): RenderQualityName {
  if (lod <= 1) return "low"
  if (lod >= 5) return "high"
  return "balanced"
}

export function getRenderQuality(
  params = new URLSearchParams(globalThis.location?.search ?? "")
): RenderQualityProfile {
  const requested = params.get("quality")
  if (requested === "low" || requested === "balanced" || requested === "high") {
    return profiles[requested]
  }
  return profiles[qualityFromLod(Session.getLod())]
}
