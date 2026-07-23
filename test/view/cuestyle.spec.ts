import {
  CUE_STYLE_STORAGE_KEY,
  CUSTOM_CUE_STYLE_ID,
  CUSTOM_CUE_STYLE_STORAGE_KEY,
  cueStyleById,
  customCueColours,
  saveCueStyleId,
  saveCustomCueColours,
  savedCueStyleId,
} from "../../src/view/cuestyle"

describe("cue customisation", () => {
  beforeEach(() => {
    localStorage.removeItem(CUE_STYLE_STORAGE_KEY)
    localStorage.removeItem(CUSTOM_CUE_STYLE_STORAGE_KEY)
  })

  it("persists a colour combination as the custom cue", () => {
    const style = saveCustomCueColours({
      forearm: "#123456",
      sleeve: "#222222",
      wrap: "#654321",
      accent: "#fedcba",
    })

    expect(style.id).toBe(CUSTOM_CUE_STYLE_ID)
    expect(style.forearm).toBe(0x123456)
    expect(style.sleeve).toBe(0x222222)
    expect(style.wrap).toBe(0x654321)
    expect(style.accent).toBe(0xfedcba)
    expect(customCueColours().accent).toBe(0xfedcba)
  })

  it("restores the custom cue as the selected style", () => {
    saveCustomCueColours({ forearm: "#315a48" })
    saveCueStyleId(CUSTOM_CUE_STYLE_ID)

    expect(savedCueStyleId()).toBe(CUSTOM_CUE_STYLE_ID)
    expect(cueStyleById(savedCueStyleId()).forearm).toBe(0x315a48)
  })

  it("ignores invalid stored colour values", () => {
    localStorage.setItem(
      CUSTOM_CUE_STYLE_STORAGE_KEY,
      JSON.stringify({ forearm: "not-a-colour" })
    )

    expect(customCueColours().forearm).toBe(0x0c5d53)
  })
})
