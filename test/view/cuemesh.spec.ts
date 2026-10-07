import { Mesh, MeshPhysicalMaterial } from "three"
import { CueMesh } from "../../src/view/cuemesh"

describe("CueMesh showcase presets", () => {
  it("replaces the traditional butt with distinct mechanical chassis and restores it on style changes", () => {
    const cue = CueMesh.createCue(0.004, 0.012, 1.4, "heritage")
    for (const style of ["aurora-prism", "holo-laser", "heritage"]) {
      CueMesh.applyStyle(cue.cueBody, style)
      const visible = cue.cueBody.children.filter((part) => part.visible)
      const chassis = visible.filter((part) => part.userData.cueCyber)
      expect(chassis.length > 0).toBe(style !== "heritage")
      expect(chassis.every((part) => part.userData.cueCyber === style)).toBe(
        true
      )
      expect(visible.some((part) => part.userData.cueRole === "forearm")).toBe(
        style === "heritage"
      )
      expect(visible.length).toBeLessThanOrEqual(14)
    }
    const shaft = cue.cueBody.children.find(
      (part) => part.userData.cueRole === "shaft"
    ) as Mesh
    const material = shaft.material as MeshPhysicalMaterial
    expect(material.map!.image.width).toBe(256)
    expect(material.map!.image.height).toBe(1024)
  })
  it("keeps the selected authored cue under the visible draw budget", () => {
    const cue = CueMesh.createCue(0.004, 0.012, 1.4, "holo-laser")
    let visibleMeshes = 0
    cue.cueBody.traverse((object) => {
      if (object instanceof Mesh && object.visible) visibleMeshes++
    })
    expect(visibleMeshes).toBeLessThanOrEqual(14)
  })

  it("drives the holographic energy ring from cyan toward warm orange", () => {
    const cue = CueMesh.createCue(0.004, 0.012, 1.4, "holo-laser")
    const energyMaterials: MeshPhysicalMaterial[] = []
    cue.cueBody.traverse((object) => {
      if (object instanceof Mesh && object.userData.cueEnergyRing) {
        energyMaterials.push(object.material as MeshPhysicalMaterial)
      }
    })
    CueMesh.setEnergy(cue.cueBody, 1)
    expect(
      energyMaterials.some((material) => material.color.r > material.color.b)
    ).toBe(true)
  })
})
