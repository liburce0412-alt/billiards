import {
  CylinderGeometry,
  DynamicDrawUsage,
  ExtrudeGeometry,
  LatheGeometry,
  Shape,
  Vector2,
  Group,
  InstancedMesh,
  MathUtils,
  MeshStandardMaterial,
  Mesh,
  Material,
  Object3D,
  PerspectiveCamera,
  SphereGeometry,
  Vector3,
} from "three"
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js"
import { Cue } from "./cue"
import { R } from "../model/physics/constants"
import { TableGeometry } from "./tablegeometry"
import { SHOT_HOLD_SECONDS, SHOT_RISE_SECONDS } from "./camera"
import { refinedPrototype } from "./refinedart"

const FLOOR = -0.6143625
const Z = new Vector3(0, 0, 1)
const Y = new Vector3(0, 1, 0)
type Point = [number, number, number]
type Surface = "shell" | "joint" | "light"

/** Travel along the outside of the table, never through its cloth or cabinet. */
export function railPoint(distance: number, x: number, y: number): Vector3 {
  const perimeter = 4 * (x + y)
  let d = ((distance % perimeter) + perimeter) % perimeter
  if (d < 2 * x) return new Vector3(-x + d, -y, FLOOR)
  d -= 2 * x
  if (d < 2 * y) return new Vector3(x, -y + d, FLOOR)
  d -= 2 * y
  if (d < 2 * x) return new Vector3(x - d, y, FLOOR)
  return new Vector3(-x, y - (d - 2 * x), FLOOR)
}

function railDistance(point: Vector3, x: number, y: number): number {
  const px = MathUtils.clamp(point.x, -x, x)
  const py = MathUtils.clamp(point.y, -y, y)
  if (Math.abs(point.x) / x > Math.abs(point.y) / y)
    return point.x > 0 ? 2 * x + py + y : 4 * x + 3 * y - py
  return point.y > 0 ? 3 * x + 2 * y - px : px + x
}

function outwardFromRail(base: Vector3, x: number, y: number) {
  return new Vector3(
    Math.abs(base.x) >= x - 0.001 ? Math.sign(base.x) : 0,
    Math.abs(base.y) >= y - 0.001 ? Math.sign(base.y) : 0,
    0
  ).normalize()
}

/** Bevelled, chamfered armour panels; local X is the outward face. */
function armourGeometry() {
  const profile = new Shape()
  profile.moveTo(-0.34, 0.5)
  profile.lineTo(0.34, 0.5)
  profile.lineTo(0.5, 0.28)
  profile.lineTo(0.36, -0.28)
  profile.lineTo(0.13, -0.5)
  profile.lineTo(-0.13, -0.5)
  profile.lineTo(-0.36, -0.28)
  profile.lineTo(-0.5, 0.28)
  profile.closePath()
  const geometry = new ExtrudeGeometry(profile, {
    depth: 0.22,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.045,
    bevelThickness: 0.055,
  })
  geometry.rotateY(Math.PI / 2).rotateX(Math.PI / 2)
  geometry.center().computeBoundingBox()
  const size = geometry.boundingBox!.getSize(new Vector3())
  geometry.scale(1 / size.x, 1 / size.y, 1 / size.z)
  return geometry
}

function helmetGeometry() {
  const profile = [
    [0, -0.5],
    [0.28, -0.47],
    [0.4, -0.29],
    [0.48, -0.06],
    [0.5, 0.19],
    [0.42, 0.38],
    [0.24, 0.48],
    [0, 0.5],
  ]
  return new LatheGeometry(
    profile.map(([r, z]) => new Vector2(r, z)),
    24
  ).rotateX(Math.PI / 2)
}

class Robot {
  readonly root = new Group()
  readonly position = new Vector3()
  rail = 0
  turn = 0
  stride = 0
  stance = 1
  walking = true
  yieldOffset = 0
  carriedCue?: Group
  private readonly carryMaterials = new Set<Material>()
  private readonly stamp = new Object3D()
  private readonly batches = new Map<string, InstancedMesh>()
  private readonly sphere =
    refinedPrototype("robot-prototype-sphere") ?? new SphereGeometry(1, 12, 8)
  private readonly box =
    refinedPrototype("robot-prototype-box") ??
    new RoundedBoxGeometry(1, 1, 1, 2, 0.12)
  private readonly armour =
    refinedPrototype("robot-prototype-armour") ?? armourGeometry()
  private readonly helmet =
    refinedPrototype("robot-prototype-helmet") ?? helmetGeometry()
  private readonly cylinder =
    refinedPrototype("robot-prototype-cylinder") ??
    new CylinderGeometry(1, 1, 1, 10)
  private readonly materials: Record<Surface, MeshStandardMaterial>

  constructor(index: number) {
    this.root.name = index === 0 ? "robot-ivory-cyan" : "robot-graphite-amber"
    this.materials = {
      shell: new MeshStandardMaterial({
        color: index === 0 ? 0xe0e7eb : 0x374554,
        metalness: 0.64,
        roughness: 0.27,
      }),
      joint: new MeshStandardMaterial({
        color: 0x141d28,
        metalness: 0.7,
        roughness: 0.37,
      }),
      light: new MeshStandardMaterial({
        color: index === 0 ? 0x50dcec : 0xffb35e,
        emissive: index === 0 ? 0x25bcca : 0xc87529,
        emissiveIntensity: 0.7,
        roughness: 0.25,
      }),
    }
    for (const surface of ["shell", "joint", "light"] as const) {
      for (const shape of [
        "sphere",
        "box",
        "cylinder",
        "armour",
        "helmet",
      ] as const) {
        if ((shape === "armour" || shape === "helmet") && surface !== "shell")
          continue
        const mesh = new InstancedMesh(
          this[shape],
          this.materials[surface],
          100
        )
        mesh.name = `${surface}-${shape}`
        mesh.instanceMatrix.setUsage(DynamicDrawUsage)
        mesh.count = 0
        mesh.frustumCulled = false
        mesh.castShadow = surface !== "light"
        this.batches.set(`${surface}-${shape}`, mesh)
        this.root.add(mesh)
      }
    }
  }

  private part(
    shape: string,
    surface: Surface,
    position: Vector3,
    size: Point,
    direction?: Vector3,
    tilt = 0,
    axis = Y
  ) {
    const batch = this.batches.get(`${surface}-${shape}`)!
    this.stamp.position.copy(position)
    this.stamp.scale.set(...size)
    this.stamp.quaternion.identity()
    if (direction) this.stamp.quaternion.setFromUnitVectors(axis, direction)
    if (tilt) this.stamp.rotateY(tilt)
    this.stamp.updateMatrix()
    batch.setMatrixAt(batch.count++, this.stamp.matrix)
  }

  private oval(surface: Surface, at: Point, size: Point) {
    this.part("sphere", surface, new Vector3(...at), size)
  }

  private link(
    a: Vector3,
    b: Vector3,
    width: number,
    surface: Surface = "shell"
  ) {
    const delta = b.clone().sub(a)
    this.part(
      "cylinder",
      surface,
      a.clone().add(b).multiplyScalar(0.5),
      [width, delta.length(), width],
      delta.normalize()
    )
  }

  private platedLimb(a: Vector3, b: Vector3, width: number) {
    const delta = b.clone().sub(a)
    const length = delta.length()
    this.link(a, b, width * 0.34, "joint")
    this.part(
      "armour",
      "shell",
      a.clone().lerp(b, 0.48),
      [width * 0.78, width, length * 0.7],
      delta.normalize(),
      0,
      Z
    )
    // Offset hydraulic rods stay exposed beside the removable armour.
    for (const side of [-1, 1]) {
      const offset = new Vector3(-width * 0.28, side * width * 0.37, 0)
      this.link(
        a.clone().lerp(b, 0.22).add(offset),
        a.clone().lerp(b, 0.8).add(offset),
        width * 0.07,
        "joint"
      )
    }
    this.link(
      a
        .clone()
        .lerp(b, 0.3)
        .add(new Vector3(width * 0.42, 0, 0)),
      a
        .clone()
        .lerp(b, 0.65)
        .add(new Vector3(width * 0.42, 0, 0)),
      width * 0.032,
      "light"
    )
  }

  private arm(shoulder: Vector3, hand: Vector3, side: number) {
    const elbow = shoulder.clone().lerp(hand, 0.52)
    elbow.y += side * 0.13
    elbow.z += 0.09
    if (side < 0 && this.stance < 0.5)
      elbow.copy(hand).add(new Vector3(-0.045, -0.04, 0.27))
    this.platedLimb(shoulder, elbow, 0.115)
    this.platedLimb(elbow, hand, 0.092)
    for (const point of [shoulder, elbow, hand]) {
      const radius = point === hand ? 0.025 : 0.041
      this.part("sphere", "joint", point, [radius, radius, radius])
      this.part("cylinder", "shell", point, [
        radius * 0.68,
        radius * 2.07,
        radius * 0.68,
      ])
      this.part("cylinder", "light", point, [
        radius * 0.34,
        radius * 2.14,
        radius * 0.34,
      ])
    }
  }

  private body(
    s: number,
    hip: Vector3,
    chest: Vector3,
    head: Vector3,
    walk: number
  ) {
    const lean = Math.atan2(chest.x - hip.x, chest.z - hip.z)
    const torsoPoint = (x: number, y: number, z: number) =>
      new Vector3(x, y, z).applyAxisAngle(Y, lean).add(chest)
    this.oval("joint", [0, 0, 0.86], [0.12, 0.15, 0.09])
    this.link(hip, chest, 0.085, "joint")
    this.part(
      "armour",
      "shell",
      hip.clone().add(new Vector3(0.07, 0, -0.025)),
      [0.15, 0.3, 0.16]
    )
    this.part("box", "joint", chest, [0.18, 0.31, 0.23], undefined, lean)
    for (const side of [-1, 1]) {
      // Split pectoral plates and floating shoulder caps make a tapered silhouette.
      this.part(
        "armour",
        "shell",
        torsoPoint(0.105, side * 0.093, 0.025),
        [0.115, 0.18, 0.245],
        undefined,
        lean
      )
      this.part(
        "armour",
        "shell",
        torsoPoint(-0.005, side * 0.245, 0.065),
        [0.22, 0.145, 0.17],
        undefined,
        lean - 0.25
      )
      this.part(
        "box",
        "light",
        torsoPoint(0.16, side * 0.1, 0.1),
        [0.008, 0.12, 0.012],
        undefined,
        lean
      )
      this.part(
        "armour",
        "shell",
        torsoPoint(-0.12, side * 0.08, 0.025),
        [0.055, 0.12, 0.27],
        undefined,
        lean
      )
      for (let vent = 0; vent < 3; vent++) {
        this.part(
          "box",
          "joint",
          torsoPoint(0.165, side * 0.1, -0.016 - vent * 0.019),
          [0.009, 0.057, 0.008],
          undefined,
          lean
        )
      }
      for (const z of [-0.066, 0.113])
        this.part(
          "sphere",
          "joint",
          torsoPoint(0.161, side * 0.138, z),
          [0.006, 0.006, 0.006]
        )
    }
    // Layered abdominal plates expose the flexible black spine between them.
    for (let plate = 0; plate < 4; plate++) {
      const p = hip.clone().lerp(chest, 0.15 + plate * 0.16)
      this.part(
        "armour",
        "shell",
        p.add(new Vector3(0.095, 0, 0)),
        [0.055, 0.19 + plate * 0.008, 0.065],
        undefined,
        lean
      )
    }
    this.part(
      "armour",
      "shell",
      torsoPoint(0.15, 0, 0.068),
      [0.025, 0.053, 0.094],
      undefined,
      lean
    )
    this.part(
      "sphere",
      "light",
      torsoPoint(0.169, 0, 0.075),
      [0.008, 0.016, 0.024]
    )
    this.link(chest, head, 0.037, "joint")
    for (let ring = 0; ring < 3; ring++)
      this.part(
        "cylinder",
        "shell",
        head.clone().add(new Vector3(-0.025, 0, -0.12 + ring * 0.016)),
        [0.045, 0.009, 0.045],
        Z
      )
    // A continuous helmet shell, dark optical visor and sculpted cheek guards.
    this.part("helmet", "shell", head, [0.22, 0.225, 0.275])
    this.part(
      "sphere",
      "joint",
      head.clone().add(new Vector3(0.083, 0, 0.013)),
      [0.045, 0.109, 0.052]
    )
    for (const side of [-1, 1]) {
      this.part(
        "box",
        "light",
        head.clone().add(new Vector3(0.121, side * 0.041, 0.021)),
        [0.006, 0.073, 0.009],
        undefined,
        side * 0.035
      )
      this.part(
        "armour",
        "shell",
        head.clone().add(new Vector3(0.063, side * 0.081, -0.057)),
        [0.075, 0.066, 0.095],
        undefined,
        -0.25
      )
      const ear = head.clone().add(new Vector3(-0.025, side * 0.11, 0.025))
      this.part("cylinder", "joint", ear, [0.045, 0.025, 0.045])
      this.part("cylinder", "shell", ear, [0.035, 0.03, 0.035])
      this.part("cylinder", "light", ear, [0.016, 0.033, 0.016])
    }
    this.part(
      "armour",
      "shell",
      head.clone().add(new Vector3(0.048, 0, -0.092)),
      [0.11, 0.105, 0.055]
    )
    this.part(
      "box",
      "joint",
      head.clone().add(new Vector3(0.105, 0, -0.083)),
      [0.008, 0.044, 0.009]
    )
    for (const side of [-1, 1]) {
      const swing = Math.sin(this.stride + (side > 0 ? Math.PI : 0)) * walk
      const foot = new Vector3(
        swing * 0.2 + (side < 0 ? 0.15 : -0.19) * (1 - s),
        side * 0.18,
        0.065 + Math.max(0, swing) * 0.11
      )
      const knee = new Vector3(0.05 + swing * 0.1, side * 0.16, 0.48)
      const pelvis = hip.clone().add(new Vector3(0, side * 0.12, 0))
      this.platedLimb(pelvis, knee, 0.15)
      this.platedLimb(knee, foot, 0.12)
      this.part("sphere", "joint", knee, [0.065, 0.064, 0.064])
      this.part(
        "armour",
        "shell",
        knee.clone().add(new Vector3(0.055, 0, 0)),
        [0.06, 0.115, 0.115]
      )
      this.part(
        "armour",
        "shell",
        foot.clone().add(new Vector3(0.032, 0, 0)),
        [0.255, 0.135, 0.092]
      )
      this.part(
        "box",
        "joint",
        foot.clone().add(new Vector3(0.025, 0, -0.04)),
        [0.25, 0.138, 0.028]
      )
      this.part(
        "box",
        "light",
        foot.clone().add(new Vector3(0.15, 0, -0.016)),
        [0.008, 0.075, 0.009]
      )
    }
  }

  private bridgeHand(bridge: Vector3) {
    // An open bridge: splayed fingers rest below the shaft, thumb and index
    // make a raised V. Rear fingers curl around the grip rather than a fist.
    this.part(
      "sphere",
      "shell",
      bridge.clone().add(new Vector3(0, 0.025, -0.025)),
      [0.055, 0.045, 0.024]
    )
    for (let finger = 0; finger < 4; finger++) {
      const start = bridge
        .clone()
        .add(new Vector3(0.025, 0.01 + finger * 0.018, -0.025))
      const end = start
        .clone()
        .add(new Vector3(0.07 - finger * 0.009, (finger - 1) * 0.012, -0.018))
      const knuckle = start.clone().lerp(end, 0.48)
      knuckle.z += 0.003
      this.link(start, knuckle, 0.008)
      this.link(knuckle, end, 0.0065)
      this.part("sphere", "joint", knuckle, [0.009, 0.009, 0.009])
      this.part("sphere", "shell", end, [0.007, 0.007, 0.006])
    }
    this.part(
      "armour",
      "shell",
      bridge.clone().add(new Vector3(-0.008, 0.031, -0.005)),
      [0.067, 0.06, 0.011]
    )
    this.part(
      "box",
      "light",
      bridge.clone().add(new Vector3(-0.012, 0.035, 0.001)),
      [0.025, 0.007, 0.003]
    )
    // The thumb folds beneath the shaft, then runs alongside it. It never
    // crosses the shaft; two joints replace the old straight diagonal rod.
    const thumb = [
      new Vector3(-0.035, 0.036, -0.031),
      new Vector3(-0.02, 0.003, -0.029),
      new Vector3(-0.005, -0.019, -0.012),
      new Vector3(0.027, -0.016, -0.008),
    ].map((point) => point.add(bridge))
    for (let joint = 0; joint < thumb.length - 1; joint++) {
      this.link(thumb[joint], thumb[joint + 1], joint === 0 ? 0.009 : 0.007)
      if (joint > 0)
        this.part("sphere", "joint", thumb[joint], [0.008, 0.008, 0.008])
    }
    this.part("sphere", "shell", thumb[3], [0.008, 0.007, 0.006])
  }

  syncCarriedCue(cue: Cue) {
    if (!this.carriedCue) {
      this.carriedCue = new Group()
      this.carriedCue.name = "carried-cue"
      this.root.add(this.carriedCue)
    }
    if (
      this.carriedCue.userData.cueStyleId === cue.styleId &&
      this.carriedCue.userData.artRevision === cue.cueBody.userData.artRevision
    )
      return
    this.carryMaterials.forEach((material) => material.dispose())
    this.carryMaterials.clear()
    this.carriedCue.clear()
    const materials = new Map<Material, Material>()
    const copyMaterial = (source: Material) => {
      let material = materials.get(source)
      if (!material) {
        material = source.clone()
        materials.set(source, material)
        this.carryMaterials.add(material)
      }
      return material
    }
    const copyPart = (source: Object3D): Object3D => {
      let part: Object3D = new Group()
      if (source instanceof Mesh) {
        const material = Array.isArray(source.material)
          ? source.material.map(copyMaterial)
          : copyMaterial(source.material)
        part = new Mesh(source.geometry, material)
      }
      part.name = source.name
      part.position.copy(source.position)
      part.quaternion.copy(source.quaternion)
      part.scale.copy(source.scale)
      part.castShadow = source.castShadow
      for (const child of source.children)
        if (child.visible) part.add(copyPart(child))
      return part
    }
    // Share immutable geometry with the selected cue. Materials are owned by
    // this player so changing the next player's style cannot recolour it.
    for (const part of cue.cueBody.children)
      if (part.visible) this.carriedCue.add(copyPart(part))
    this.carriedCue.scale.setScalar(0.028575 / R)
    this.carriedCue.userData.cueStyleId = cue.styleId
    this.carriedCue.userData.artRevision = cue.cueBody.userData.artRevision
    this.carriedCue.userData.length = (cue.length * 0.028575) / R
    this.carriedCue.visible = false
  }

  private carryCue(
    grip: Vector3,
    bridge: Vector3,
    chalk: number,
    walk: number
  ) {
    if (!this.carriedCue) return
    const direction = bridge
      .clone()
      .sub(grip)
      .normalize()
      .lerp(new Vector3(0.12 * walk, 0, 1).normalize(), this.stance)
      .normalize()
    const length = this.carriedCue.userData.length as number
    const fraction = MathUtils.lerp(0.34, 0.12, this.stance)
    this.carriedCue.visible = true
    this.carriedCue.position
      .copy(grip)
      .addScaledVector(direction, length * fraction)
    this.carriedCue.quaternion.setFromUnitVectors(Y, direction)
    if (chalk > 0) this.part("box", "light", bridge, [0.027, 0.027, 0.027])
  }

  pose(
    bridge: Vector3,
    grip: Vector3,
    walk: number,
    chalk: number,
    firstPerson: boolean
  ) {
    for (const batch of this.batches.values()) batch.count = 0
    if (this.carriedCue) this.carriedCue.visible = false
    const s = this.stance
    if (firstPerson && s > 0.25) {
      for (const batch of this.batches.values()) batch.visible = false
      return
    }
    const hip = new Vector3(0, 0, 0.86)
    const chest = new Vector3(0.28 * (1 - s), 0, 0.9 + s * 0.4)
    const head = new Vector3(0.48 * (1 - s), 0, 0.8 + s * 0.76)
    if (!firstPerson) this.body(s, hip, chest, head, walk)
    const idleBridge = new Vector3(0.26, 0.22, 0.86 + chalk * 0.47)
    const gait = Math.sin(this.stride) * walk
    const idleGrip = new Vector3(
      0.22 + gait * 0.025,
      -0.23,
      0.89 - walk * 0.1 + gait * 0.015
    )
    bridge.lerp(idleBridge, s)
    grip.lerp(idleGrip, s)
    if (chalk > 0) {
      bridge.x = 0.22 + Math.sin(chalk * 20) * 0.01
      bridge.y = -0.23 + Math.sin(chalk * 24) * 0.015
    }
    if (!firstPerson) {
      this.arm(
        chest.clone().add(new Vector3(0, 0.23, 0.04)),
        bridge.clone().add(new Vector3(-0.06, 0.04, -0.035)),
        1
      )
      this.arm(
        chest.clone().add(new Vector3(0, -0.23, 0.04)),
        grip.clone().add(new Vector3(-0.01, -0.06, -0.06)),
        -1
      )
    }
    this.bridgeHand(bridge)
    if (!firstPerson) {
      this.part(
        "sphere",
        "shell",
        grip.clone().add(new Vector3(0, -0.025, -0.035)),
        [0.054, 0.037, 0.05]
      )
      for (let finger = 0; finger < 4; finger++) {
        const p = grip.clone().add(new Vector3((finger - 1.5) * 0.02, -0.03, 0))
        this.link(p, p.clone().add(new Vector3(0, 0.04, -0.025)), 0.01)
      }
    }
    if ((walk > 0 || s > 0.12) && !firstPerson)
      this.carryCue(grip, bridge, chalk, walk)
    for (const batch of this.batches.values()) {
      batch.visible = batch.count > 0
      batch.instanceMatrix.needsUpdate = true
    }
  }

  poseFirstPersonChalk(camera: PerspectiveCamera, scale: number, time: number) {
    for (const batch of this.batches.values()) batch.count = 0
    camera.updateWorldMatrix(true, false)
    const point = (x: number, y: number, z: number) =>
      new Vector3(x, y, z)
        .multiplyScalar(scale)
        .applyMatrix4(camera.matrixWorld)
        .divideScalar(scale)
        .sub(this.position)
        .applyAxisAngle(Z, -this.turn)
    const enter =
      MathUtils.smoothstep(time, 0, 0.35) *
      (1 - MathUtils.smoothstep(time, 2, 2.4))
    const drop = (1 - enter) * 0.45
    const rub = Math.sin(time * 22) * 0.009 * enter
    const tip = point(0.08, -0.015 - drop, -0.52)
    const grip = point(0.11, -0.15 - drop, -0.49)
    const chalk = point(0.08 + rub, -0.003 - drop, -0.52)
    if (this.carriedCue) {
      const axis = tip.clone().sub(grip).normalize()
      this.carriedCue.visible = true
      this.carriedCue.position
        .copy(tip)
        .addScaledVector(axis, -this.carriedCue.userData.length / 2)
      this.carriedCue.quaternion.setFromUnitVectors(Y, axis)
    }
    for (const [hand, wrist] of [
      [grip, point(0.21, -0.39 - drop, -0.38)],
      [
        point(0.018 + rub, 0.035 - drop, -0.52),
        point(-0.21, -0.13 - drop, -0.37),
      ],
    ]) {
      this.platedLimb(wrist, hand, 0.045)
      this.part("sphere", "shell", hand, [0.033, 0.032, 0.033])
    }
    for (let finger = 0; finger < 4; finger++) {
      const y = -0.125 - finger * 0.016 - drop
      this.link(point(0.08, y, -0.465), point(0.135, y, -0.49), 0.009)
      this.link(
        point(0.012 + rub, 0.04 - finger * 0.012 - drop, -0.505),
        point(0.063 + rub, 0.03 - finger * 0.009 - drop, -0.495),
        0.008
      )
    }
    // A dark paper sleeve and a cyan abrasive face read as a real chalk cube.
    const chalkAxis = tip.clone().sub(grip).normalize()
    this.part("box", "joint", chalk, [0.035, 0.028, 0.035], chalkAxis)
    this.part(
      "box",
      "light",
      chalk.clone().lerp(tip, 0.45),
      [0.033, 0.009, 0.033],
      chalkAxis
    )
    for (const batch of this.batches.values()) {
      batch.visible = batch.count > 0
      batch.instanceMatrix.needsUpdate = true
    }
  }

  dispose() {
    this.carryMaterials.forEach((material) => material.dispose())
    this.carryMaterials.clear()
    this.batches.forEach((mesh) => mesh.dispose())
    this.sphere.dispose()
    this.box.dispose()
    this.cylinder.dispose()
    this.armour.dispose()
    this.helmet.dispose()
    Object.values(this.materials).forEach((material) => material.dispose())
    this.root.removeFromParent()
  }
}

export class RobotPlayers {
  readonly root = new Group()
  readonly cameraFrame = {
    eye: new Vector3(),
    position: new Vector3(),
    walking: false,
  }
  private readonly players = [new Robot(0), new Robot(1)]
  private active = 0
  private shotTime = Infinity
  private time = 0
  private shotCount = 0
  readyToStrike = false
  private chalkTime?: number

  get chalking() {
    return this.chalkTime !== undefined
  }

  beginChalk() {
    if (!this.readyToStrike || this.chalking) return false
    this.chalkTime = 0
    this.readyToStrike = false
    return true
  }

  cancelChalk() {
    this.chalkTime = undefined
  }

  updateChalkView(camera: PerspectiveCamera, cue: Cue) {
    if (this.chalkTime === undefined) return
    this.players[this.active].poseFirstPersonChalk(
      camera,
      R / 0.028575,
      this.chalkTime
    )
    cue.cueBody.visible = false
    cue.shadowMesh.visible = false
  }

  get finishingShot() {
    return this.shotTime < SHOT_HOLD_SECONDS + SHOT_RISE_SECONDS
  }

  prepareShot() {
    this.readyToStrike = false
    this.aimQuietTime = 0
    // Existing stance and distance decide whether a walk is needed. Forcing
    // walking here briefly hides the cue even after a small aim adjustment.
  }
  private aimQuietTime = 0
  private lastAimAngle = NaN
  private readonly lastAimPosition = new Vector3(NaN, NaN, NaN)
  private readonly bridge = new Vector3()
  private readonly grip = new Vector3()
  private readonly desired = new Vector3()

  constructor() {
    this.root.name = "robot-players"
    this.root.scale.setScalar(R / 0.028575)
    this.players.forEach((player, i) => {
      player.rail = i === 0 ? 0 : 6
      this.root.add(player.root)
    })
  }

  setActivePlayer(player: number) {
    if (player !== 1 && player !== 2) return
    if (this.active !== player - 1) {
      this.shotTime = Infinity
      this.players[player - 1].walking = true
    }
    this.active = player - 1
  }

  beginShot() {
    this.shotTime = 0
    this.shotCount++
  }

  private avoidOverlap(x: number, y: number, dt: number, hold: boolean) {
    const before = this.players.map((player) => player.yieldOffset)
    const shooter = this.players[this.active]
    const waiting = this.players[1 - this.active]
    for (const player of this.players) {
      const base = player.position.clone()
      const outward = outwardFromRail(base, x, y)
      const close =
        player === waiting && base.distanceTo(shooter.position) < 1.6
      if (player !== shooter || !hold)
        player.yieldOffset = MathUtils.lerp(
          player.yieldOffset,
          close ? 0.95 : 0,
          1 - Math.exp(-dt * 7)
        )
      player.position.addScaledVector(outward, player.yieldOffset)
    }
    // Guarantee clearance even when a turn changes at an already occupied bay.
    // The correction is outward, so it cannot push a player through the table.
    const offset = waiting.position.clone().sub(shooter.position)
    const separation = 0.85
    if (offset.length() < separation) {
      const base = railPoint(waiting.rail, x, y)
      const outward = outwardFromRail(base, x, y)
      const projection = offset.dot(outward)
      const extra =
        -projection +
        Math.sqrt(
          projection * projection + separation * separation - offset.lengthSq()
        )
      waiting.yieldOffset += extra
      waiting.position.addScaledVector(outward, extra)
    }
    return this.players.map((player, index) =>
      Math.abs(player.yieldOffset - before[index])
    )
  }

  private walkingToShot(
    player: Robot,
    distance: number,
    hold: boolean,
    aiming: boolean
  ) {
    if (hold || this.finishingShot) player.walking = false
    else if (player.walking) {
      if (distance < 0.035 && player.yieldOffset < 0.015) player.walking = false
    } else if (aiming && this.aimQuietTime > 0.25 && distance > 0.4) {
      player.walking = true
    }
    return player.walking
  }

  private shotStance(
    player: Robot,
    aiming: boolean,
    moving: boolean,
    distance: number
  ) {
    if (this.shotTime < SHOT_HOLD_SECONDS) return 0
    if (!aiming || this.finishingShot)
      return MathUtils.smoothstep(
        this.shotTime,
        SHOT_HOLD_SECONDS,
        SHOT_HOLD_SECONDS + SHOT_RISE_SECONDS
      )
    // Keep an already standing shooter upright while a new direction settles.
    // Otherwise the quiet-time guard briefly crouches them before walking.
    if (moving || (distance > 0.4 && player.stance >= 0.5)) return 1
    return 0
  }

  private playerEye(player: Robot, cue: Cue, active: boolean, scale: number) {
    const eye = new Vector3(
      0.6 * (1 - player.stance) + 0.1 * player.stance,
      0,
      0.82 + player.stance * 0.76
    )
      .applyAxisAngle(Z, player.turn)
      .add(player.position)
      .multiplyScalar(scale)
    if (active) {
      // Rail-constrained feet cannot define a reliable shooting eye: near a
      // cushion they can put the camera past the ball and crop out the cue.
      const shootingEye = cue.aim.pos
        .clone()
        .add(
          new Vector3(
            -Math.cos(cue.aim.angle) * R * 24,
            -Math.sin(cue.aim.angle) * R * 24,
            0
          )
        )
      shootingEye.z = (FLOOR + 0.82) * scale
      eye.lerp(shootingEye, 1 - player.stance)
    }
    return eye
  }

  update(
    elapsed: number,
    cue: Cue,
    camera: PerspectiveCamera,
    aiming: boolean,
    automaticView = false
  ) {
    const dt = Math.min(Math.max(elapsed, 0), 0.1)
    this.time += dt
    this.shotTime += dt
    if (this.chalkTime !== undefined) {
      this.chalkTime += dt
      if (this.chalkTime >= 2.4) this.chalkTime = undefined
    }
    const scale = R / 0.028575
    const x = TableGeometry.X / scale + 0.48
    const y = TableGeometry.Y / scale + 0.48
    const perimeter = 4 * (x + y)
    cue.cueBody.updateWorldMatrix(true, false)
    // The bridge stays planted while the rear hand follows the moving cue.
    // Use the tilt frame for the bridge, excluding the cue body's stroke offset.
    this.bridge.set(
      -cue.length * 0.22 - R * 1.1,
      cue.aim.offset.x * R,
      cue.aim.offset.y * R
    )
    cue.tiltMesh.localToWorld(this.bridge).divideScalar(scale)
    this.grip.set(0, -cue.length * 0.34, 0)
    cue.cueBody.localToWorld(this.grip).divideScalar(scale)
    // Foot placement uses the resting cue frame, not its power/stroke animation.
    this.desired.set(
      -cue.length * 0.84 - R * 1.1,
      cue.aim.offset.x * R,
      cue.aim.offset.y * R
    )
    cue.tiltMesh.localToWorld(this.desired).divideScalar(scale)
    this.desired.add(
      new Vector3(
        -Math.cos(cue.aim.angle) * 0.13,
        -Math.sin(cue.aim.angle) * 0.13,
        0
      )
    )
    const targetRail = railDistance(this.desired, x, y)
    const hold = this.shotTime < SHOT_HOLD_SECONDS
    const angleChange = Math.abs(
      Math.atan2(
        Math.sin(cue.aim.angle - this.lastAimAngle),
        Math.cos(cue.aim.angle - this.lastAimAngle)
      )
    )
    this.aimQuietTime = angleChange > 0.0001 ? 0 : this.aimQuietTime + dt
    const newPosition =
      this.lastAimPosition.distanceTo(cue.aim.pos) > 0.1 * scale
    this.lastAimAngle = cue.aim.angle
    this.lastAimPosition.copy(cue.aim.pos)
    if (aiming && newPosition) this.players[this.active].walking = true
    // Reserve the striking position first. The waiting player changes bays if
    // that bay is occupied, and uses an outer passing lane when paths meet.
    const strikePosition = railPoint(targetRail, x, y)
    const motion = this.players.map((player, index) => {
      const active = index === this.active
      let waitingRail = index === 0 ? 0.3 : 2 * x + 2 * y + 0.3
      if (railPoint(waitingRail, x, y).distanceTo(strikePosition) < 1.5)
        waitingRail = targetRail + perimeter * 0.5
      const target = active ? targetRail : waitingRail
      const delta =
        MathUtils.euclideanModulo(
          target - player.rail + perimeter / 2,
          perimeter
        ) -
        perimeter / 2
      const moving = active
        ? this.walkingToShot(player, Math.abs(delta), hold, aiming)
        : Math.abs(delta) > 0.025
      const step = moving
        ? Math.sign(delta) * Math.min(Math.abs(delta), dt * 1.65)
        : 0
      player.rail += step
      player.position.copy(railPoint(player.rail, x, y))
      return { active, delta, moving, step }
    })
    this.players[this.active].syncCarriedCue(cue)
    if (!this.players[1 - this.active].carriedCue)
      this.players[1 - this.active].syncCarriedCue(cue)
    const lateralMotion = this.avoidOverlap(x, y, dt, hold)
    this.players.forEach((player, index) => {
      const { active, delta, step } = motion[index]
      const moving =
        motion[index].moving || (!active && lateralMotion[index] > 0.001)
      const stance = active
        ? this.shotStance(player, aiming, moving, Math.abs(delta))
        : 1
      player.stance = MathUtils.lerp(
        player.stance,
        stance,
        1 - Math.exp(-dt * 9)
      )
      const next = railPoint(player.rail + Math.sign(delta) * 0.05, x, y)
      let angle = active
        ? cue.aim.angle
        : Math.atan2(-player.position.y, -player.position.x)
      if (moving)
        angle = Math.atan2(
          next.y - player.position.y,
          next.x - player.position.x
        )
      const turn = Math.atan2(
        Math.sin(angle - player.turn),
        Math.cos(angle - player.turn)
      )
      player.turn += turn * (1 - Math.exp(-dt * 12))
      player.root.position.copy(player.position)
      player.root.rotation.z = player.turn
      player.stride += Math.hypot(step, lateralMotion[index]) * 17
      const local = (point: Vector3) =>
        point.clone().sub(player.position).applyAxisAngle(Z, -player.turn)
      const localEye = local(camera.position.clone().divideScalar(scale))
      const nearEye =
        localEye.x < 0.45 &&
        Math.abs(localEye.y) < 0.4 &&
        camera.position
          .clone()
          .divideScalar(scale)
          .distanceTo(player.position.clone().add(new Vector3(0, 0, 1))) < 1.05
      const chalkPhase = (this.time + index * 11) % 19
      const chalk =
        !active && !moving && chalkPhase < 2.4
          ? Math.sin((chalkPhase / 2.4) * Math.PI)
          : 0
      const eye = this.playerEye(player, cue, active, scale)
      const firstPerson =
        active &&
        (automaticView
          ? !moving || camera.position.distanceTo(eye) < scale * 0.85
          : nearEye && player.stance < 0.6)
      if (active) {
        this.cameraFrame.eye.copy(eye)
        this.cameraFrame.position.copy(player.position).multiplyScalar(scale)
        this.cameraFrame.walking = moving
      }
      player.root.userData.firstPerson = firstPerson
      player.pose(
        local(this.bridge),
        local(this.grip),
        moving ? 1 : 0,
        chalk,
        firstPerson
      )
    })
    const shooter = this.players[this.active]
    this.readyToStrike =
      !this.chalking &&
      !this.finishingShot &&
      !shooter.walking &&
      shooter.stance < 0.025 &&
      this.aimQuietTime > 0.25 &&
      Math.abs(
        Math.atan2(
          Math.sin(cue.aim.angle - shooter.turn),
          Math.cos(cue.aim.angle - shooter.turn)
        )
      ) < 0.03
    cue.cueBody.visible =
      (aiming || this.shotTime < SHOT_HOLD_SECONDS + SHOT_RISE_SECONDS) &&
      !shooter.walking &&
      shooter.stance <= 0.12
    cue.shadowMesh.visible = cue.cueBody.visible && !cue.placerMesh.visible
    let phase = aiming ? "aim" : "observe"
    if (hold) phase = "follow-through"
    if (this.chalking) phase = "chalk"
    this.root.userData.robotState = {
      activePlayer: this.active + 1,
      shotCount: this.shotCount,
      phase,
      drawCalls: this.players.reduce((sum, player) => {
        let count = 0
        player.root.traverseVisible((object) => {
          if (object instanceof Mesh) count++
        })
        return sum + count
      }, 0),
    }
  }

  dispose() {
    this.players.forEach((player) => player.dispose())
    this.root.removeFromParent()
  }
}
