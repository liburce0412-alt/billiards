import {
  ENVIRONMENT_STYLES,
  ENVIRONMENT_STYLE_STORAGE_KEY,
  environmentStyleById,
  saveEnvironmentStyleId,
  savedEnvironmentStyleId,
} from "../../src/view/environmentstyle"

describe("EnvironmentStyle", () => {
  beforeEach(() => localStorage.removeItem(ENVIRONMENT_STYLE_STORAGE_KEY))

  it("offers galaxy, nebula and club environments", () => {
    expect(ENVIRONMENT_STYLES.map((style) => style.id)).toEqual([
      "galaxy",
      "nebula",
      "club",
    ])
  })

  it("persists a valid selection and rejects unknown ids", () => {
    saveEnvironmentStyleId("nebula")
    expect(savedEnvironmentStyleId()).toBe("nebula")
    expect(environmentStyleById("missing").id).toBe("galaxy")
  })
})
