export type CueInlayPattern = "spear" | "diamond" | "chevron" | "feather"

export interface CueStyle {
  id: string
  name: string
  description: string
  shaft: number
  forearm: number
  sleeve: number
  wrap: number
  accent: number
  ferrule: number
  tip: number
  shaftMetalness?: number
  inlayPattern: CueInlayPattern
  swatches: string[]
}

export const CUE_STYLE_STORAGE_KEY = "break-builder.cue-style"
export const CUSTOM_CUE_STYLE_STORAGE_KEY = "break-builder.custom-cue-style"
export const CUSTOM_CUE_STYLE_ID = "custom"

export interface CustomCueColours {
  forearm: number
  sleeve: number
  wrap: number
  accent: number
}

const DEFAULT_CUSTOM_CUE_COLOURS: CustomCueColours = {
  forearm: 0x0c5d53,
  sleeve: 0x171b22,
  wrap: 0x4c1f2a,
  accent: 0xe8c66a,
}

export const CUE_STYLES: readonly CueStyle[] = [
  {
    id: "heritage",
    name: "胡桃传承",
    description: "枫木前节、胡桃木后把与墨绿亚麻握把",
    shaft: 0xd8bd91,
    forearm: 0x8b4b26,
    sleeve: 0x351b12,
    wrap: 0x174735,
    accent: 0xd8b25c,
    ferrule: 0xf2ead8,
    tip: 0x2e7190,
    inlayPattern: "spear",
    swatches: ["#d8bd91", "#8b4b26", "#174735", "#d8b25c"],
  },
  {
    id: "obsidian",
    name: "黑曜碳纤",
    description: "哑光碳纤前节、黑檀后把与暗红皮革",
    shaft: 0x24282d,
    forearm: 0x0c0e11,
    sleeve: 0x050607,
    wrap: 0x5d151b,
    accent: 0xaeb7c2,
    ferrule: 0x22262b,
    tip: 0x315f7a,
    shaftMetalness: 0.34,
    inlayPattern: "chevron",
    swatches: ["#24282d", "#050607", "#5d151b", "#aeb7c2"],
  },
  {
    id: "jade",
    name: "翡翠金线",
    description: "深翡翠色拼接、象牙白嵌花与细金环",
    shaft: 0xd6b98a,
    forearm: 0x0e665a,
    sleeve: 0x073a34,
    wrap: 0x172522,
    accent: 0xe5c56f,
    ferrule: 0xf4edda,
    tip: 0x2f7794,
    inlayPattern: "diamond",
    swatches: ["#d6b98a", "#0e665a", "#073a34", "#e5c56f"],
  },
  {
    id: "royal",
    name: "紫檀鎏金",
    description: "紫檀色后把、黑色握把与暖金嵌花",
    shaft: 0xd1ae78,
    forearm: 0x672a47,
    sleeve: 0x281122,
    wrap: 0x121116,
    accent: 0xd9a94d,
    ferrule: 0xeee5d1,
    tip: 0x3d7190,
    inlayPattern: "spear",
    swatches: ["#d1ae78", "#672a47", "#281122", "#d9a94d"],
  },
  {
    id: "glacier",
    name: "冰川蓝",
    description: "浅枫木前节、午夜蓝后把与冰蓝珠光环",
    shaft: 0xe1c89f,
    forearm: 0x174f78,
    sleeve: 0x0a243c,
    wrap: 0x182b40,
    accent: 0x77d4e8,
    ferrule: 0xf0f4f5,
    tip: 0x367e9c,
    inlayPattern: "chevron",
    swatches: ["#e1c89f", "#174f78", "#0a243c", "#77d4e8"],
  },
  {
    id: "ivory",
    name: "白玉雀翎",
    description: "奶油白后把、焦糖皮革与孔雀蓝点缀",
    shaft: 0xddc49a,
    forearm: 0xe7dfcc,
    sleeve: 0x73513a,
    wrap: 0x8b5c3d,
    accent: 0x167c87,
    ferrule: 0xf6f0e4,
    tip: 0x34728e,
    inlayPattern: "feather",
    swatches: ["#ddc49a", "#e7dfcc", "#8b5c3d", "#167c87"],
  },
]

export function cueStyleById(id?: string | null): CueStyle {
  if (id === CUSTOM_CUE_STYLE_ID) return customCueStyle()
  return CUE_STYLES.find((style) => style.id === id) ?? CUE_STYLES[0]
}

function validColour(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? "").replace(/^#/, ""), 16)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffffff
    ? parsed
    : fallback
}

export function customCueColours(): CustomCueColours {
  if (typeof globalThis.localStorage === "undefined") {
    return { ...DEFAULT_CUSTOM_CUE_COLOURS }
  }
  try {
    const stored = JSON.parse(
      globalThis.localStorage.getItem(CUSTOM_CUE_STYLE_STORAGE_KEY) ?? "{}"
    )
    return {
      forearm: validColour(stored.forearm, DEFAULT_CUSTOM_CUE_COLOURS.forearm),
      sleeve: validColour(stored.sleeve, DEFAULT_CUSTOM_CUE_COLOURS.sleeve),
      wrap: validColour(stored.wrap, DEFAULT_CUSTOM_CUE_COLOURS.wrap),
      accent: validColour(stored.accent, DEFAULT_CUSTOM_CUE_COLOURS.accent),
    }
  } catch {
    return { ...DEFAULT_CUSTOM_CUE_COLOURS }
  }
}

export function saveCustomCueColours(
  colours: Partial<Record<keyof CustomCueColours, number | string>>
): CueStyle {
  const current = customCueColours()
  const next: CustomCueColours = {
    forearm: validColour(colours.forearm, current.forearm),
    sleeve: validColour(colours.sleeve, current.sleeve),
    wrap: validColour(colours.wrap, current.wrap),
    accent: validColour(colours.accent, current.accent),
  }
  if (typeof globalThis.localStorage !== "undefined") {
    try {
      globalThis.localStorage.setItem(
        CUSTOM_CUE_STYLE_STORAGE_KEY,
        JSON.stringify(next)
      )
    } catch {
      // The live customisation still works when storage is unavailable.
    }
  }
  return customCueStyle(next)
}

export function cueColourHex(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`
}

function customCueStyle(colours = customCueColours()): CueStyle {
  return {
    id: CUSTOM_CUE_STYLE_ID,
    name: "我的定制杆",
    description: "自由组合前把、后把、握把与金属嵌花",
    shaft: 0xd8bf96,
    forearm: colours.forearm,
    sleeve: colours.sleeve,
    wrap: colours.wrap,
    accent: colours.accent,
    ferrule: 0xf4eee2,
    tip: 0x2e7190,
    inlayPattern: "diamond",
    swatches: [
      cueColourHex(colours.forearm),
      cueColourHex(colours.sleeve),
      cueColourHex(colours.wrap),
      cueColourHex(colours.accent),
    ],
  }
}

export function savedCueStyleId(): string {
  if (typeof globalThis.localStorage === "undefined") {
    return CUE_STYLES[0].id
  }
  try {
    return cueStyleById(globalThis.localStorage.getItem(CUE_STYLE_STORAGE_KEY))
      .id
  } catch {
    return CUE_STYLES[0].id
  }
}

export function saveCueStyleId(id: string): string {
  const styleId = cueStyleById(id).id
  if (typeof globalThis.localStorage !== "undefined") {
    try {
      globalThis.localStorage.setItem(CUE_STYLE_STORAGE_KEY, styleId)
    } catch {
      // Storage can be disabled in private browsing; the live selection still works.
    }
  }
  return styleId
}
