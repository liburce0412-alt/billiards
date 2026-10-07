import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  Scene,
  ShaderMaterial,
  Texture,
  Vector3,
} from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import {
  disposeRefinedArt,
  clearRefinedArtCache,
  preloadRefinedArt,
  refinedArt,
  refinedPrototype,
  refinedTableId,
} from "../../src/view/refinedart"
import { CueMesh } from "../../src/view/cuemesh"
import { EnvironmentManager } from "../../src/view/environmentmanager"
import { environmentStyleById } from "../../src/view/environmentstyle"
import { RENDER_QUALITY_PROFILES } from "../../src/view/renderquality"
import { saveCustomCueDetails } from "../../src/view/cuestyle"

const load = jest.fn()
const sha = "a".repeat(64)
const sourceLength = 1.40825
const imageClosers: jest.Mock[] = []

function sourceAsset(id: string) {
  const scene = new Group()
  const converted = new Group()
  converted.rotation.x = -Math.PI / 2
  scene.add(converted)
  const material = new MeshPhysicalMaterial({
    color: 0x685544,
    roughness: 0.413,
  })
  const close = jest.fn()
  imageClosers.push(close)
  material.map = new Texture({ close })
  const mesh = new Mesh(new BoxGeometry(2, 4, 6), material)
  if (id.startsWith("cue-")) mesh.userData.cueRole = "shaft"
  if (id === "cue-custom") {
    mesh.userData.cueRole = "forearm"
    for (const pattern of ["diamond", "chevron"]) {
      const inlay = new Mesh(new BoxGeometry(1, 1, 1), material.clone())
      inlay.userData.cuePattern = pattern
      converted.add(inlay)
    }
  }
  if (id === "environment-galaxy") {
    mesh.userData.legacyNode =
      "/environment-layer/galaxy-environment/galaxy-dome"
    material.userData.requiresRuntimeMaterial = true
  }
  converted.add(mesh)
  return { scene }
}

beforeAll(() => {
  window.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      version: 1,
      sourceBallRadius: 0.03275,
      runtimeRootRotationX: Math.PI / 2,
      assets: [
        "robot-prototype-box",
        "cue-heritage",
        "cue-royal",
        "cue-custom",
        "environment-galaxy",
      ].map((id) => ({
        id,
        file: `${id}.glb`,
        sha256: sha,
        category: id.split("-")[0],
        length: id.startsWith("cue-") ? sourceLength : undefined,
      })),
    }),
  })
  load.mockImplementation(async (url: string) => {
    const id = url.split("/").pop()!.split(".glb")[0]
    return sourceAsset(id)
  })
  GLTFLoader.prototype.loadAsync = load
})

it("deduplicates downloads and restores the source Z-up dimensions", async () => {
  await Promise.all([
    preloadRefinedArt(["robot-prototype-box"]),
    preloadRefinedArt(["robot-prototype-box"]),
  ])
  expect(load).toHaveBeenCalledTimes(1)
  const art = refinedArt("robot-prototype-box")!
  const size = new Box3().setFromObject(art).getSize(new Vector3())
  expect(size.x).toBeCloseTo(2)
  expect(size.y).toBeCloseTo(4)
  expect(size.z).toBeCloseTo(6)
  const geometry = refinedPrototype("robot-prototype-box")!
  geometry.computeBoundingBox()
  expect(
    geometry.boundingBox!.getSize(new Vector3()).distanceTo(size)
  ).toBeLessThan(1e-5)
})

it("gives scene owners independent disposable geometry and materials", () => {
  const first = refinedArt("robot-prototype-box")!
  const second = refinedArt("robot-prototype-box")!
  const meshes: Mesh[] = []
  for (const art of [first, second])
    art.traverse((object) => {
      if (object instanceof Mesh) meshes.push(object)
    })
  expect(meshes[0].geometry).not.toBe(meshes[1].geometry)
  expect(meshes[0].material).not.toBe(meshes[1].material)
  const released = jest.spyOn(meshes[1].geometry, "dispose")
  disposeRefinedArt(first)
  expect(released).not.toHaveBeenCalled()
  disposeRefinedArt(second)
  expect(released).toHaveBeenCalledTimes(1)
})

it("preserves the authored cue finish and its animated pivot across style changes", async () => {
  await preloadRefinedArt(["cue-heritage", "cue-royal"])
  const cue = CueMesh.createCue(0.004, 0.012, 1.2, "heritage")
  const position = cue.cueBody.position.clone()
  const quaternion = cue.cueBody.quaternion.clone()
  const beforeRevision = cue.cueBody.userData.artRevision
  CueMesh.applyStyle(cue.cueBody, "royal")
  expect(cue.cueBody.position.equals(position)).toBe(true)
  expect(cue.cueBody.quaternion.equals(quaternion)).toBe(true)
  expect(cue.cueBody.userData.artRevision).toBeGreaterThan(beforeRevision)
  expect(cue.cueBody.userData.refinedCueStyle).toBe("royal")
  let shaft: Mesh | undefined
  cue.cueBody.traverse((object) => {
    if (object instanceof Mesh && object.userData.cueRole === "shaft")
      shaft = object
  })
  expect((shaft!.material as MeshPhysicalMaterial).roughness).toBeCloseTo(0.413)
})

it("keeps the live sky shader while adopting refined geometry", async () => {
  await preloadRefinedArt(["environment-galaxy"])
  const scene = new Scene()
  const manager = new EnvironmentManager(
    scene,
    undefined,
    RENDER_QUALITY_PROFILES.high
  )
  manager.setStyle(environmentStyleById("galaxy"))
  const dome = scene.getObjectByName("galaxy-dome") as Mesh
  expect(dome.material).toBeInstanceOf(ShaderMaterial)
  const shader = dome.material as ShaderMaterial
  const initialTime = shader.uniforms.uTime.value
  manager.update({ elapsed: 0.05, width: 800, height: 600, cueX: 0, cueY: 0 })
  expect(shader.uniforms.uTime.value).toBeGreaterThan(initialTime)
  expect(dome.visible).toBe(true)
  expect(scene.getObjectByName("refined-environment-galaxy")).toBeDefined()
  manager.dispose()
  expect(scene.getObjectByName("refined-environment-galaxy")).toBeUndefined()
})

it("uses the same pool geometry without confusing size or style variants", () => {
  expect(refinedTableId("nineball", 5, "american-ivory")).toBe(
    "table-eightball-5-american-ivory"
  )
  expect(refinedTableId("snooker", 10, "chinese-ebony")).toBe(
    "table-snooker-10-chinese-ebony"
  )
})

it("keeps custom colour, wood pattern and inlay controls on the refined cue", async () => {
  await preloadRefinedArt(["cue-custom"])
  saveCustomCueDetails({
    forearm: "#0080ff",
    inlayPattern: "chevron",
    forearmPattern: "burl",
  })
  const cue = CueMesh.createCue(0.004, 0.012, 1.2, "custom")
  let body: Mesh | undefined
  cue.cueBody.traverse((object) => {
    if (!(object instanceof Mesh)) return
    if (object.userData.cueRole === "forearm") body = object
    if (object.userData.cuePattern)
      expect(object.visible).toBe(object.userData.cuePattern === "chevron")
  })
  const material = body!.material as MeshPhysicalMaterial
  const authoredMap = material.map
  expect(material.color.getHex()).toBe(0x0080ff)
  expect(material.roughness).toBeCloseTo(0.413)
  saveCustomCueDetails({ forearm: "#ff4400", forearmPattern: "flame" })
  CueMesh.applyStyle(cue.cueBody, "custom")
  expect(material.color.getHex()).toBe(0xff4400)
  expect(material.map).not.toBe(authoredMap)
  saveCustomCueDetails({ forearmPattern: "burl" })
  CueMesh.applyStyle(cue.cueBody, "custom")
  expect(material.map).toBe(authoredMap)
  disposeRefinedArt(cue.cueBody)
})

it("releases texture images after consumers and survives 20 cache lifecycles", async () => {
  clearRefinedArtCache()
  for (let cycle = 0; cycle < 20; cycle++) {
    await preloadRefinedArt(["robot-prototype-box"])
    const consumer = refinedArt("robot-prototype-box")!
    const close = imageClosers[imageClosers.length - 1]
    disposeRefinedArt(consumer)
    expect(close).not.toHaveBeenCalled()
    clearRefinedArtCache()
    expect(close).toHaveBeenCalledTimes(1)
    expect(refinedArt("robot-prototype-box")).toBeUndefined()
  }
})

it("disposes a late download instead of repopulating an exited game cache", async () => {
  let finish: ((value: ReturnType<typeof sourceAsset>) => void) | undefined
  load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const request = preloadRefinedArt(["robot-prototype-box"])
  while (!finish) await Promise.resolve()
  clearRefinedArtCache()
  finish(sourceAsset("robot-prototype-box"))
  await request
  expect(refinedArt("robot-prototype-box")).toBeUndefined()
  expect(imageClosers[imageClosers.length - 1]).toHaveBeenCalledTimes(1)
})
