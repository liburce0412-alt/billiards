import { expect } from "chai"
import {
  TABLE_STYLES,
  tableAssetForStyle,
  tableStyleById,
} from "../../src/view/tablestyle"

describe("TableStyle", () => {
  it("offers both American and Chinese table profiles", () => {
    expect(TABLE_STYLES.some((style) => style.profile === "american")).to.be
      .true
    expect(TABLE_STYLES.some((style) => style.profile === "chinese")).to.be.true
  })

  it("uses the rounded-pocket model for Chinese pool tables", () => {
    expect(
      tableAssetForStyle("eightball", "models/p8.min.gltf", "chinese-ebony")
    ).to.equal("models/snooker.min.gltf")
    expect(
      tableAssetForStyle("eightball", "models/p8.min.gltf", "american-walnut")
    ).to.equal("models/p8.min.gltf")
  })

  it("does not replace the rule model outside pool games", () => {
    expect(
      tableAssetForStyle(
        "snooker",
        "models/d-snooker.min.gltf",
        "american-walnut"
      )
    ).to.equal("models/d-snooker.min.gltf")
    expect(tableStyleById("missing").id).to.equal("american-walnut")
  })
})
