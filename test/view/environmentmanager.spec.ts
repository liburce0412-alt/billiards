import { Mesh, Raycaster, Scene, Vector3 } from "three"
import { EnvironmentManager } from "../../src/view/environmentmanager"
import { ENVIRONMENT_STYLES } from "../../src/view/environmentstyle"
import { RENDER_QUALITY_PROFILES } from "../../src/view/renderquality"
import { createArchitecture } from "../../src/view/environmentarchitecture"

describe("EnvironmentManager", () => {
  it("keeps low-tier geometry bounded and the playable rectangle clear", () => {
    for (const style of ENVIRONMENT_STYLES) {
      const architecture = createArchitecture(
        style,
        RENDER_QUALITY_PROFILES.low
      )
      const budget = architecture.root.userData.environmentBudget
      expect(budget.drawCalls).toBeLessThanOrEqual(6)
      expect(budget.triangles).toBeLessThanOrEqual(8000)
      architecture.root.updateMatrixWorld(true)
      for (const x of [-1.25, 0, 1.25]) {
        for (const y of [-0.64, 0, 0.64]) {
          const ray = new Raycaster(new Vector3(x, y, 6), new Vector3(0, 0, -1))
          const hits = ray.intersectObject(architecture.root, true)
          expect(hits.some((hit) => hit.point.z > -0.05)).toBe(false)
        }
      }
      const meshes: Mesh[] = []
      architecture.root.traverse((object) => {
        if (object instanceof Mesh) meshes.push(object)
      })
      const released = meshes.map((mesh) =>
        jest.spyOn(mesh.geometry, "dispose")
      )
      architecture.dispose()
      released.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1))
    }
  })

  it("owns exactly one authored environment while switching all eight styles", () => {
    const scene = new Scene()
    const manager = new EnvironmentManager(
      scene,
      undefined,
      RENDER_QUALITY_PROFILES.high
    )

    const geometrySignatures = new Set<string>()
    for (const style of ENVIRONMENT_STYLES) {
      manager.setStyle(style)
      expect(manager.diagnostics().styleId).toBe(style.id)
      const environmentLayer = scene.getObjectByName("environment-layer")
      expect(
        environmentLayer?.children.filter(
          (child) =>
            child.name.endsWith("environment") ||
            child.name.endsWith("environment-instance")
        )
      ).toHaveLength(1)
      const architecture = scene.getObjectByName(`${style.id}-architecture`)
      const landmark = architecture?.getObjectByName(
        `${style.architecture}-landmark`
      )
      expect(landmark).toBeDefined()
      geometrySignatures.add(
        landmark!.children
          .map((child: any) =>
            [
              child.type,
              child.name,
              child.count ?? 1,
              child.geometry?.type ?? "Group",
            ].join(":")
          )
          .join("|")
      )
    }
    expect(geometrySignatures.size).toBe(ENVIRONMENT_STYLES.length)

    manager.dispose()
    expect(manager.diagnostics().styleId).toBe("lunar-observatory")
    expect(scene.getObjectByName("environment-layer")).toBeUndefined()
  })

  it("rebuilds the active scene for a lower adaptive tier", () => {
    const manager = new EnvironmentManager(
      new Scene(),
      undefined,
      RENDER_QUALITY_PROFILES.high
    )
    manager.setStyle(ENVIRONMENT_STYLES[4])
    manager.applyQuality(RENDER_QUALITY_PROFILES.low)
    expect(manager.diagnostics()).toMatchObject({
      styleId: "aurora-hall",
      quality: "low",
      animated: false,
    })
  })
})
