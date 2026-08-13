import { expect } from "chai"
import { Group } from "three"
import {
  TABLE_STYLES,
  applyTableStyle,
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
    ).to.equal("models/chinese-pool.min.gltf")
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
    expect(tableStyleById("missing").id).to.equal("american-ivory")
  })

  it("adds the layered silver SPECTRA trim to the ivory table", () => {
    const root = new Group()
    applyTableStyle(root, "american-ivory")
    const details = root.getObjectByName("spectra-ivory-table-details")
    expect(details).to.not.be.undefined
    expect(details?.children.length).to.be.greaterThan(12)
  })
})
