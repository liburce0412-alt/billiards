import { expect } from "chai"
import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Texture,
} from "three"
import { TableGeometry } from "../../src/view/tablegeometry"
import {
  TABLE_STYLES,
  applyTableStyle,
  tableAssetForStyle,
  tableStyleById,
} from "../../src/view/tablestyle"

describe("TableStyle", () => {
  it("does not put pocket collars on a pocketless Chinese carom table", () => {
    const original = TableGeometry.hasPockets
    try {
      TableGeometry.hasPockets = false
      const root = new Group()
      applyTableStyle(root, "chinese-ebony")
      const details = root.getObjectByName("chinese-steel-cushion-details")!
      expect(details.children).to.have.length(4)
      expect(
        details.children.every(
          (child: any) => child.geometry.type !== "TorusGeometry"
        )
      ).to.be.true
    } finally {
      TableGeometry.hasPockets = original
    }
  })

  it("preserves snooker baulk and D markings when styling ivory cloth", () => {
    const root = new Group()
    const material = new MeshStandardMaterial({ map: new Texture() })
    material.name = "cloth"
    material.userData.snookerMarkings = true
    const markings = material.map
    root.add(new Mesh(new PlaneGeometry(), material))
    applyTableStyle(root, "american-ivory")
    expect(material.map).to.equal(markings)
  })

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
    expect(details?.children).to.have.length(12)
    expect(
      details?.children.some((child) =>
        ["RingGeometry", "TorusGeometry"].includes(
          (child as any).geometry?.type
        )
      )
    ).to.be.false
  })

  it("adds a four-leg support frame below every table", () => {
    const root = new Group()
    applyTableStyle(root, "american-ivory")
    const support = root.getObjectByName("break-builder-table-support")
    expect(support).to.not.be.undefined
    expect(support?.children.length).to.equal(15)
    expect(support?.children.every((child) => child.position.z < 0)).to.be.true
    expect(
      support?.children.filter(
        (child: any) => child.material?.name === "table-support-collar"
      )
    ).to.have.length(4)

    applyTableStyle(root, "american-graphite")
    expect(
      root.children.filter(
        (child) => child.name === "break-builder-table-support"
      )
    ).to.have.length(1)
  })

  it("keeps generated supports at world scale for imported table roots", () => {
    const root = new Group()
    root.scale.setScalar(0.05715)
    applyTableStyle(root, "american-ivory")
    const support = root.getObjectByName("break-builder-table-support")!
    expect(support.scale.x * root.scale.x).to.be.closeTo(1, 1e-9)
    const details = root.getObjectByName("spectra-ivory-table-details")!
    expect(details.scale.y * root.scale.y).to.be.closeTo(1, 1e-9)
  })
})
