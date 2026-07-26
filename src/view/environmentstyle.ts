export type EnvironmentStyleId = "galaxy" | "nebula" | "club"

export interface EnvironmentStyle {
  id: EnvironmentStyleId
  name: string
  description: string
  background: number
  backdrop?: string
  intensity: number
  starTint: [number, number, number]
  meteor: boolean
  swatches: string[]
}

export const ENVIRONMENT_STYLE_STORAGE_KEY = "break-builder.environment-style"

export const ENVIRONMENT_STYLES: readonly EnvironmentStyle[] = [
  {
    id: "galaxy",
    name: "深空银河",
    description: "银河、远星与周期流星，沉浸感最强",
    background: 0x02040c,
    backdrop: "assets/cosmic-galaxy-v1.png",
    intensity: 0.92,
    starTint: [0.76, 0.84, 1],
    meteor: true,
    swatches: ["#02040c", "#173067", "#8059a8", "#c6edff"],
  },
  {
    id: "nebula",
    name: "明亮星云",
    description: "更明亮的蓝紫星河与暖色恒星",
    background: 0x0a1022,
    backdrop: "assets/cosmic-galaxy-v1.png",
    intensity: 1.26,
    starTint: [1, 0.82, 0.9],
    meteor: true,
    swatches: ["#0a1022", "#284b8f", "#b261a7", "#ffd59a"],
  },
  {
    id: "club",
    name: "冠军俱乐部",
    description: "深青球房氛围，减少远景干扰并突出球台",
    background: 0x071716,
    intensity: 0.74,
    starTint: [0.7, 0.88, 0.78],
    meteor: false,
    swatches: ["#071716", "#123d39", "#c1974f", "#e6ddca"],
  },
]

export function environmentStyleById(id?: string | null): EnvironmentStyle {
  return (
    ENVIRONMENT_STYLES.find((environment) => environment.id === id) ??
    ENVIRONMENT_STYLES[0]
  )
}

export function savedEnvironmentStyleId(): EnvironmentStyleId {
  try {
    return environmentStyleById(
      globalThis.localStorage?.getItem(ENVIRONMENT_STYLE_STORAGE_KEY)
    ).id
  } catch {
    return ENVIRONMENT_STYLES[0].id
  }
}

export function saveEnvironmentStyleId(id: string): EnvironmentStyleId {
  const styleId = environmentStyleById(id).id
  try {
    globalThis.localStorage?.setItem(ENVIRONMENT_STYLE_STORAGE_KEY, styleId)
  } catch {
    // The current scene can still change when storage is unavailable.
  }
  return styleId
}
