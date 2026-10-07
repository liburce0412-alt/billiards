import {
  ENVIRONMENT_STYLES,
  ENVIRONMENT_STYLE_STORAGE_KEY,
  environmentStyleById,
  saveEnvironmentStyleId,
  savedEnvironmentStyleId,
} from "../../src/view/environmentstyle"

describe("EnvironmentStyle", () => {
  beforeEach(() => localStorage.removeItem(ENVIRONMENT_STYLE_STORAGE_KEY))

  it("offers four upgraded and four new showcase environments", () => {
    expect(ENVIRONMENT_STYLES.map((style) => style.id)).toEqual([
      "spectra",
      "galaxy",
      "nebula",
      "club",
      "aurora-hall",
      "sky-temple",
      "abyss-palace",
      "lunar-observatory",
    ])
    expect(
      new Set(ENVIRONMENT_STYLES.map((style) => style.architecture)).size
    ).toBe(8)
  })

  it("persists a valid selection and rejects unknown ids", () => {
    saveEnvironmentStyleId("nebula")
    expect(savedEnvironmentStyleId()).toBe("nebula")
    expect(environmentStyleById("missing").id).toBe("spectra")
  })

  it("uses a contrasted SPECTRA base behind the GLSL environment", () => {
    const spectra = environmentStyleById("spectra")
    expect(spectra.background).toBe(0xc9d7e4)
    expect(spectra.description).toContain("GLSL")
  })
})
