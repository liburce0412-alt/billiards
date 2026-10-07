import { CUE_STYLES, CUSTOM_CUE_STYLE_ID, type CueStyle } from "./view/cuestyle"
import {
  ENVIRONMENT_STYLES,
  type EnvironmentStyle,
} from "./view/environmentstyle"

export interface AppearanceCatalogEntry<Id extends string = string> {
  readonly id: Id
  readonly name: string
  readonly description: string
  readonly swatches: readonly string[]
}

function entryFromStyle<
  Style extends {
    id: string
    name: string
    description: string
    swatches: readonly string[]
  },
>(style: Style): AppearanceCatalogEntry<Style["id"]> {
  return {
    id: style.id,
    name: style.name,
    description: style.description,
    swatches: style.swatches,
  }
}

export const CUE_APPEARANCE_CATALOG: readonly AppearanceCatalogEntry[] = [
  ...CUE_STYLES.map((style: CueStyle) => entryFromStyle(style)),
  {
    id: CUSTOM_CUE_STYLE_ID,
    name: "我的定制杆",
    description: "自由组合前把、后把、握把与金属嵌花",
    swatches: ["#0c5d53", "#171b22", "#4c1f2a", "#e8c66a"],
  },
]

export const ENVIRONMENT_APPEARANCE_CATALOG: readonly AppearanceCatalogEntry[] =
  ENVIRONMENT_STYLES.map((style: EnvironmentStyle) => entryFromStyle(style))
