import fs from "node:fs"
import path from "node:path"
import {
  BufferGeometry,
  Float32BufferAttribute,
  Int8BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  Box3,
} from "three"
import {
  compactTableCoordinate,
  fitPocketTableModel,
} from "../../src/view/tablemodelgeometry"
import { TableConfig } from "../../src/view/tableconfig"
import { TableGeometry } from "../../src/view/tablegeometry"
import { R } from "../../src/model/physics/constants"

/** Read the actual authored vertex/index buffers, without mocking their shape. */
function sourceTable(filename: string) {
  const directory = path.resolve("dist/models")
  const gltf = JSON.parse(
    fs.readFileSync(path.join(directory, filename), "utf8")
  )
  const buffers = gltf.buffers.map((buffer) =>
    fs.readFileSync(path.join(directory, buffer.uri))
  )
  const accessor = (index: number, width: number) => {
    const spec = gltf.accessors[index]
    const view = gltf.bufferViews[spec.bufferView]
    const buffer = buffers[view.buffer]
    const start = (view.byteOffset ?? 0) + (spec.byteOffset ?? 0)
    const bytes = spec.componentType === 5126 ? 4 : 2
    const values: number[] = []
    for (let row = 0; row < spec.count; row++)
      for (let col = 0; col < width; col++) {
        const offset =
          start + row * (view.byteStride ?? width * bytes) + col * bytes
        values.push(
          spec.componentType === 5126
            ? buffer.readFloatLE(offset)
            : buffer.readUInt16LE(offset)
        )
      }
    return values
  }
  const scene = new Group()
  scene.scale.setScalar(R / 0.5)
  for (const node of gltf.nodes) {
    if (node.mesh === undefined) continue
    const group = new Group()
    if (node.translation) group.position.fromArray(node.translation)
    if (node.scale) group.scale.fromArray(node.scale)
    if (node.rotation) group.quaternion.fromArray(node.rotation)
    scene.add(group)
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const geometry = new BufferGeometry()
      geometry.setAttribute(
        "position",
        new Float32BufferAttribute(
          accessor(primitive.attributes.POSITION, 3),
          3
        )
      )
      geometry.setIndex(accessor(primitive.indices, 1))
      const material = new MeshStandardMaterial()
      material.name = gltf.materials[primitive.material]?.name ?? ""
      group.add(new Mesh(geometry, material))
    }
  }
  return scene
}

afterEach(() => TableConfig.apply("eightball", 10))

it("rebuilds quantized GLTF normals without overflowing their original Int8 storage", () => {
  const geometry = new BufferGeometry()
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute([0, 0, 0, 16383, 0, 0, 0, 9209, 0], 3)
  )
  geometry.setAttribute(
    "normal",
    new Int8BufferAttribute([0, 0, 127, 0, 0, 127, 0, 0, 127], 3, true)
  )
  geometry.setIndex([0, 1, 2])
  const mesh = new Mesh(geometry, new MeshStandardMaterial())
  mesh.scale.setScalar(0.0002)
  const scene = new Group()
  scene.add(mesh)
  TableConfig.apply("eightball", 5)
  fitPocketTableModel(scene, "eightball", 5)
  const normal = mesh.geometry.getAttribute("normal")
  expect(normal.array).toBeInstanceOf(Float32Array)
  for (let i = 0; i < 3; i++) expect(normal.getZ(i)).toBeCloseTo(1, 6)
})

it("moves all six pocket centres to the compact table without shrinking their mouths", () => {
  const targetX = R * 22.5
  for (const center of [-R * 44, 0, R * 44]) {
    const left = compactTableCoordinate(center - R, R * 44, targetX, R * 3)
    const right = compactTableCoordinate(center + R, R * 44, targetX, R * 3)
    expect(right - left).toBeCloseTo(2 * R, 7)
    expect((right + left) / 2).toBeCloseTo(Math.sign(center) * targetX, 7)
  }
})

it.each(["p8.min.gltf", "chinese-pool.min.gltf", "d-snooker.min.gltf"])(
  "fits the actual %s bed to the 5-foot physics and generated trim",
  (filename) => {
    const scene = sourceTable(filename)
    TableConfig.apply(filename.startsWith("d-") ? "snooker" : "eightball", 5)
    fitPocketTableModel(
      scene,
      filename.startsWith("d-") ? "snooker" : "eightball",
      5
    )
    let cloth: Mesh | undefined
    scene.traverse((object) => {
      if (
        object instanceof Mesh &&
        (object.material as MeshStandardMaterial).name === "cloth"
      )
        cloth = object
    })
    const bounds = new Box3().setFromObject(cloth!)
    // Original cloth extends two radii beyond the inner cushion boundary.
    expect(bounds.max.x).toBeCloseTo(TableGeometry.X + 2 * R, 3)
    expect(bounds.max.y).toBeCloseTo(TableGeometry.Y + 2 * R, 3)
    const before = bounds.getSize(new Vector3())
    fitPocketTableModel(scene, "eightball", 5)
    expect(
      new Box3().setFromObject(cloth!).getSize(new Vector3()).distanceTo(before)
    ).toBeLessThan(1e-6)
  }
)

it("removes only the two disconnected snooker leg assemblies, preserving rails", () => {
  const scene = sourceTable("d-snooker.min.gltf")
  let wood: Mesh | undefined
  scene.traverse((object) => {
    if (
      object instanceof Mesh &&
      (object.material as MeshStandardMaterial).name === "wood"
    )
      wood = object
  })
  const original = wood!.geometry.getAttribute("position")
  const railPositions = new Set<string>()
  for (let i = 0; i < original.count; i++)
    if (original.getZ(i) >= 3500)
      railPositions.add(
        [original.getX(i), original.getY(i), original.getZ(i)].join(",")
      )
  expect(wood!.geometry.index!.count / 3).toBe(124)
  fitPocketTableModel(scene, "snooker", 10)
  expect(wood!.geometry.index!.count / 3).toBe(84)
  const retained = wood!.geometry.getAttribute("position")
  for (let i = 0; i < retained.count; i++)
    expect(
      railPositions.has(
        [retained.getX(i), retained.getY(i), retained.getZ(i)].join(",")
      )
    ).toBe(true)
})
