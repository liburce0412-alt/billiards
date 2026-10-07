import {
  CUE_APPEARANCE_CATALOG,
  ENVIRONMENT_APPEARANCE_CATALOG,
} from "../../src/appearancecatalog"

describe("shared appearance catalog", () => {
  it("exposes every renderable cue and environment to presentation clients", () => {
    expect(CUE_APPEARANCE_CATALOG).toHaveLength(11)
    expect(ENVIRONMENT_APPEARANCE_CATALOG).toHaveLength(8)
    expect(
      CUE_APPEARANCE_CATALOG.some((item) => item.id === "holo-laser")
    ).toBe(true)
    expect(
      ENVIRONMENT_APPEARANCE_CATALOG.some(
        (item) => item.id === "lunar-observatory"
      )
    ).toBe(true)
  })
})
