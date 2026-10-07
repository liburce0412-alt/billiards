/* global require, __dirname, process, console, Buffer, document, module */
// Offline authoring bridge. Reads current constructors; never starts a game or changes physics.
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { transformSync } = require("@swc/core")
const { JSDOM } = require("jsdom")
const canvas = require("canvas")

const root = path.resolve(__dirname, "../..")
const output = path.resolve(
  process.argv[2] || path.join(root, ".tmp/legacy-art-export")
)
const family = process.argv[3] || "all"
const selectedId = process.argv[4]
fs.mkdirSync(output, { recursive: true })
const dom = new JSDOM(
  fs.readFileSync(path.join(root, "dist/index.html"), "utf8"),
  { url: "https://authoring.invalid/?quality=high&tableSize=10" }
)
for (const key of [
  "window",
  "document",
  "localStorage",
  "location",
  "HTMLElement",
  "HTMLCanvasElement",
  "customElements",
  "FileReader",
  "Blob",
])
  globalThis[key] = dom.window[key]
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
})
globalThis.ImageData = canvas.ImageData
globalThis.Image = canvas.Image
globalThis.HTMLImageElement = canvas.Image
globalThis.self = globalThis
globalThis.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
})
globalThis.ProgressEvent = dom.window.ProgressEvent
const createElementNS = document.createElementNS.bind(document)
document.createElementNS = (namespace, name, ...rest) =>
  name === "img" ? authoringImage() : createElementNS(namespace, name, ...rest)

function authoringImage() {
  const image = new canvas.Image()
  image.addEventListener = (event, handler) => {
    image[`on${event}`] = (value) => handler.call(image, value)
  }
  image.removeEventListener = (event) => {
    image[`on${event}`] = undefined
  }
  return image
}

function compile(module, filename, typescript) {
  const code = transformSync(fs.readFileSync(filename, "utf8"), {
    filename,
    jsc: {
      target: "es2022",
      parser: { syntax: typescript ? "typescript" : "ecmascript", tsx: false },
    },
    module: { type: "commonjs" },
  }).code
  module._compile(code, filename)
}
require.extensions[".ts"] = (module, filename) =>
  compile(module, filename, true)
const javascript = require.extensions[".js"]
require.extensions[".js"] = (module, filename) =>
  filename.replaceAll("\\", "/").includes("/three/examples/jsm/")
    ? compile(module, filename, false)
    : javascript(module, filename)
const THREE = require("three")
const { GLTFExporter } = require("three/examples/jsm/exporters/GLTFExporter.js")
const { GLTFLoader } = require("three/examples/jsm/loaders/GLTFLoader.js")
const source = (name) => require(path.join(root, `src/view/${name}.ts`))
const { R } = require(path.join(root, "src/model/physics/constants.ts"))
const { TableConfig } = source("tableconfig")
const { TableGeometry } = source("tablegeometry")
const { RENDER_QUALITY_PROFILES } = source("renderquality")
TableConfig.apply("eightball", 10)
const inventory = {
  generatedAt: new Date().toISOString(),
  sourceUnit: "metres",
  sourceUpAxis: "Z",
  assetUpAxis: "Y",
  runtimeRootRotationX: Math.PI / 2,
  ballRadius: R,
  families: {},
  assets: [],
  runtimeExceptions: [
    {
      kind: "render-support",
      reason:
        "PMREM reflection studio is a lighting implementation detail, not visible scenery; retained at runtime.",
    },
    {
      kind: "input-guides",
      reason:
        "Cue aiming cone, placement arrows, cue contact shadow, traces and spin axes express interaction state; their existing runtime geometry stays unchanged.",
    },
    {
      kind: "shader-effects",
      reason:
        "Animated environment shaders and dotted-ball material shader cannot be encoded as glTF PBR; geometry is exported with explicit runtime material slots and original shader source hashes.",
    },
  ],
}
const textureImages = new Map()

function exportTexture(texture) {
  if (!texture?.isTexture || !texture.image?.data) return texture
  if (textureImages.has(texture.uuid)) return textureImages.get(texture.uuid)
  const { width, height, data } = texture.image
  if (!(data instanceof Uint8Array) || data.length !== width * height * 4)
    throw new Error(
      `Unsupported data texture ${texture.name}: export must preserve the source pixels`
    )
  const image = document.createElement("canvas")
  image.width = width
  image.height = height
  image
    .getContext("2d")
    .putImageData(
      new canvas.ImageData(new Uint8ClampedArray(data), width, height),
      0,
      0
    )
  const converted = new THREE.CanvasTexture(image)
  for (const key of [
    "mapping",
    "wrapS",
    "wrapT",
    "magFilter",
    "minFilter",
    "anisotropy",
    "colorSpace",
    "flipY",
    "rotation",
    "channel",
  ])
    converted[key] = texture[key]
  converted.repeat.copy(texture.repeat)
  converted.offset.copy(texture.offset)
  converted.center.copy(texture.center)
  converted.name = texture.name
  textureImages.set(texture.uuid, converted)
  return converted
}

function bounds(object) {
  object.updateMatrixWorld(true)
  object.traverse((node) => {
    if (node.isInstancedMesh) node.computeBoundingBox()
  })
  const box = new THREE.Box3().setFromObject(object)
  return {
    min: box.min.toArray(),
    max: box.max.toArray(),
    size: box.getSize(new THREE.Vector3()).toArray(),
  }
}

function serialData(data) {
  return Object.fromEntries(
    Object.entries(data || {}).filter(
      ([, value]) =>
        !value?.isMaterial && !value?.isObject3D && !value?.isTexture
    )
  )
}

function cloneArt(input, descriptor) {
  const target = input.isScene ? new THREE.Group() : new THREE.Object3D()
  target.name = input.name || "asset"
  target.position.copy(input.position)
  target.quaternion.copy(input.quaternion)
  target.scale.copy(input.scale)
  target.userData = serialData(input.userData)
  let meshCount = 0
  const copy = (node, parent, route, visible) => {
    if (
      (!descriptor.includeHidden && (!visible || !node.visible)) ||
      node.isLight ||
      node.isCamera
    )
      return
    const key = `${route}/${node.name || node.type}`
    let next
    if (node.isInstancedMesh) {
      next = new THREE.Group()
      next.name = node.name
      for (let i = 0; i < node.count; i++) {
        const mesh = new THREE.Mesh(
          node.geometry,
          materialFor(node.material, `${key}[${i}]`)
        )
        const matrix = new THREE.Matrix4()
        node.getMatrixAt(i, matrix)
        matrix.decompose(mesh.position, mesh.quaternion, mesh.scale)
        mesh.name = `${node.name}-${i}`
        mesh.userData = {
          ...serialData(node.userData),
          legacyBatch: node.name,
          legacyInstance: i,
        }
        next.add(mesh)
        meshCount++
      }
    } else if (node.isMesh || node.isLine) {
      let type = THREE.Mesh
      if (node.isLineSegments) type = THREE.LineSegments
      else if (node.isLine) type = THREE.Line
      next = new type(node.geometry, materialFor(node.material, key))
      meshCount++
    } else next = new THREE.Group()
    next.name ||= node.name
    next.position.copy(node.position)
    next.quaternion.copy(node.quaternion)
    next.scale.copy(node.scale)
    next.userData = { ...serialData(node.userData), legacyNode: key }
    if (descriptor.includeHidden) next.userData.legacyVisible = node.visible
    parent.add(next)
    for (const child of node.children) copy(child, next, key, true)
  }
  function materialFor(material, key) {
    if (Array.isArray(material))
      return material.map((part, index) =>
        materialFor(part, `${key}:material-${index}`)
      )
    if (material.isShaderMaterial) {
      const hash = crypto
        .createHash("sha256")
        .update(material.vertexShader + material.fragmentShader)
        .digest("hex")
      descriptor.runtimeMaterials.push({
        node: key,
        kind: "ShaderMaterial",
        sourceHash: hash,
      })
      const proxy = new THREE.MeshStandardMaterial({
        color: 0x667788,
        side: material.side,
        transparent: material.transparent,
        opacity: material.opacity,
      })
      proxy.name = `${material.name || "runtime-shader"}-${hash.slice(0, 12)}`
      proxy.userData = {
        runtimeShaderHash: hash,
        requiresRuntimeMaterial: true,
      }
      return proxy
    }
    if (material.customProgramCacheKey?.().includes("shared-ball-marker")) {
      descriptor.runtimeMaterials.push({
        node: key,
        kind: "onBeforeCompile",
        cacheKey: material.customProgramCacheKey(),
      })
    }
    const converted = material.clone()
    converted.userData = serialData(material.userData)
    for (const [property, texture] of Object.entries(converted))
      if (texture?.isTexture) {
        if (!texture.image)
          throw new Error(
            `Missing image in ${key}/${material.name}/${property}`
          )
        converted[property] = exportTexture(texture)
      }
    return converted
  }
  // Export the root itself when it owns geometry, not only its children.
  if (input.isMesh || input.isLine) {
    target.position.set(0, 0, 0)
    target.quaternion.identity()
    target.scale.setScalar(1)
    copy(input, target, "", true)
  } else for (const child of input.children) copy(child, target, "", true)
  descriptor.meshCount = meshCount
  return target
}

async function exportArt(id, category, object, meta = {}) {
  const entry = {
    id,
    category,
    file: `${id}.glb`,
    ...meta,
    runtimeMaterials: [],
  }
  const art = cloneArt(object, entry)
  art.name = id
  art.userData.legacyAsset = id
  entry.bounds = bounds(art)
  entry.sourceBounds = bounds(object)
  let triangles = 0
  art.traverse((node) => {
    if (node.isMesh)
      triangles +=
        (node.geometry.index?.count ||
          node.geometry.attributes.position.count) / 3
  })
  entry.triangles = triangles
  const coordinateRoot = new THREE.Group()
  coordinateRoot.name = "legacy-z-up-to-gltf-y-up"
  coordinateRoot.rotation.x = -Math.PI / 2
  coordinateRoot.userData = {
    sourceUpAxis: "Z",
    runtimeRootRotationX: Math.PI / 2,
  }
  coordinateRoot.add(art)
  const result = await new GLTFExporter().parseAsync(coordinateRoot, {
    binary: true,
    onlyVisible: false,
    includeCustomExtensions: true,
  })
  const bytes = Buffer.from(result)
  fs.writeFileSync(path.join(output, entry.file), bytes)
  entry.bytes = bytes.length
  entry.sha256 = crypto.createHash("sha256").update(bytes).digest("hex")
  // Verify the saved container rather than assuming parseAsync emitted all nodes.
  if (bytes.readUInt32LE(0) !== 0x46546c67)
    throw new Error(`Invalid glTF binary: ${id}`)
  const jsonLength = bytes.readUInt32LE(12)
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"))
  entry.exportedNodes = json.nodes?.length || 0
  entry.exportedMeshes = json.meshes?.length || 0
  entry.embeddedImages = json.images?.length || 0
  if (!entry.exportedMeshes) throw new Error(`Export contains no meshes: ${id}`)
  inventory.assets.push(entry)
  console.log(
    `${id}: ${entry.meshCount} meshes / ${Math.round(triangles)} triangles / ${Math.round(bytes.length / 1024)} KiB`
  )
  return entry
}

async function loadTable(relative) {
  const filename = path.join(root, "dist", relative)
  const data = JSON.parse(fs.readFileSync(filename, "utf8"))
  for (const buffer of data.buffers || [])
    if (buffer.uri && !buffer.uri.startsWith("data:"))
      buffer.uri = `data:application/octet-stream;base64,${fs.readFileSync(path.join(path.dirname(filename), buffer.uri)).toString("base64")}`
  for (const image of data.images || [])
    if (image.uri && !image.uri.startsWith("data:"))
      image.uri = `data:image/png;base64,${fs.readFileSync(path.join(path.dirname(filename), image.uri)).toString("base64")}`
  return (await new GLTFLoader().parseAsync(JSON.stringify(data), "")).scene
}

async function exportCues() {
  const { CueMesh } = source("cuemesh")
  const { CUE_STYLES, CUSTOM_CUE_STYLE_ID } = source("cuestyle")
  const styles = [...CUE_STYLES.map((style) => style.id), CUSTOM_CUE_STYLE_ID]
  inventory.families.cues = {
    count: styles.length,
    styles,
    contract:
      "Local +Y points to tip; keep cueRole/cuePattern/cueRingCount/cueEnergyRing/cueDimensions extras for runtime appearance and carry-cue updates. Custom exports default colours; runtime custom colours remain configurable.",
  }
  for (const style of styles) {
    if (selectedId && selectedId !== `cue-${style}`) continue
    const cue = CueMesh.createCue(
      R * 0.14,
      R * 0.46,
      TableGeometry.tableX,
      style
    )
    cue.cueBody.position.set(0, 0, 0)
    cue.cueBody.quaternion.identity()
    await exportArt(`cue-${style}`, "cue", cue.cueBody, {
      style,
      length: TableGeometry.tableX,
      includeHidden: style === "custom",
    })
  }
}

async function exportRobots() {
  const { RobotPlayers } = source("robotplayers")
  const robots = new RobotPlayers()
  inventory.families.robots = {
    count: 2,
    poses: ["standing", "aiming"],
    prototypeShapes: ["sphere", "box", "cylinder", "armour", "helmet"],
    contract:
      "Refine prototype geometries in their original local coordinates; runtime InstancedMesh matrices retain all animation timing. Static expanded posed exports are references, not replacement skeletal rigs.",
  }
  for (const player of robots.players) {
    for (const [name, stance] of [
      ["standing", 1],
      ["aiming", 0],
    ]) {
      player.stance = stance
      player.pose(
        new THREE.Vector3(0.85, 0.15, 0.72),
        new THREE.Vector3(0.3, -0.2, 0.78),
        0,
        0,
        false
      )
      await exportArt(
        `${player.root.name}-${name}`,
        "robot-reference",
        player.root,
        { pose: name }
      )
    }
  }
  for (const shape of inventory.families.robots.prototypeShapes) {
    const prototype = new THREE.Mesh(
      robots.players[0][shape],
      new THREE.MeshStandardMaterial({
        color: 0xcddce1,
        roughness: 0.3,
        metalness: 0.6,
      })
    )
    prototype.name = shape
    await exportArt(`robot-prototype-${shape}`, "robot-prototype", prototype, {
      shape,
    })
  }
}

async function exportStyledTable(rule, size, style, rulesInstance) {
  const { applyTableStyle, tableAssetForStyle } = source("tablestyle")
  const { enhanceTableMaterials } = source("materialenhancer")
  const { fitPocketTableModel } = source("tablemodelgeometry")
  const { Assets } = source("assets")
  const constants = require(path.join(root, "src/model/physics/constants.ts"))
  const sourceAsset = tableAssetForStyle(rule, rulesInstance.asset, style)
  const table = await loadTable(sourceAsset)
  // importGltf applies the legacy model's half-unit ball calibration
  // before any rule-specific table scaling.
  table.scale.setScalar(constants.R / 0.5)
  table.updateMatrixWorld(true)
  rulesInstance.scaleTableModel?.(table)
  fitPocketTableModel(table, rule, size)
  // Capture the exact compact cloth recolouring/UV path after its image
  // has loaded; it does not resize the collision geometry.
  if (size === 5 && rule !== "snooker") {
    Assets.prototype.customizeTableScene.call(
      Object.create(Assets.prototype),
      table
    )
  }
  enhanceTableMaterials(table, RENDER_QUALITY_PROFILES.high, rule)
  applyTableStyle(table, style)
  await exportArt(`table-${rule}-${size}-${style}`, "table", table, {
    rule,
    size,
    style,
    sourceAsset,
    ballRadius: constants.R,
    compatibleRules:
      rule === "eightball" ? ["eightball", "nineball", "fourball"] : [rule],
    physicalTable: {
      halfX: TableGeometry.tableX,
      halfY: TableGeometry.tableY,
      hasPockets: TableGeometry.hasPockets,
    },
  })
}

function selectedTable(rule, size, style) {
  if (selectedId === "table-size-fix")
    return (
      size === 5 ||
      rule === "snooker" ||
      (rule === "threecushion" && style.startsWith("chinese-"))
    )
  if (selectedId === "snooker-textures") return rule === "snooker"
  return true
}

async function exportTables() {
  const { TABLE_STYLES } = source("tablestyle")
  const { RuleFactory } = require(
    path.join(root, "src/controller/rules/rulefactory.ts")
  )
  const { applyPhysicsProfileForRule } = require(
    path.join(root, "src/model/physics/profile.ts")
  )
  const constants = require(path.join(root, "src/model/physics/constants.ts"))
  const wave = new THREE.Texture(
    await canvas.loadImage(path.join(root, "dist/assets/wave.jpg"))
  )
  wave.needsUpdate = true
  const originalLoad = THREE.TextureLoader.prototype.load
  THREE.TextureLoader.prototype.load = function (url, ready, ...rest) {
    if (url !== "assets/wave.jpg")
      return originalLoad.call(this, url, ready, ...rest)
    const texture = wave.clone()
    ready?.(texture)
    return texture
  }
  const styles = TABLE_STYLES.map((style) => style.id)
  const rules = ["eightball", "nineball", "fourball", "snooker", "threecushion"]
  inventory.families.tables = {
    styles,
    rules,
    dimensions: [5, 10],
    contract:
      "Keep top/cushion/pocket contact surfaces and all original local origins fixed; appearance refinements must not move physical edges. Exports cover each style and distinct rule geometry, including compact-size variants.",
  }
  // Pool rules share geometry; retain their compatibility list instead of exporting duplicate files.
  for (const rule of ["eightball", "snooker", "threecushion"])
    for (const size of [10, 5]) {
      dom.reconfigure({
        url: `https://authoring.invalid/?quality=high&tableSize=${size}`,
      })
      applyPhysicsProfileForRule(rule)
      const rulesInstance = RuleFactory.create(rule, null)
      TableConfig.apply(rule, size)
      for (const style of styles) {
        if (!selectedTable(rule, size, style)) continue
        await exportStyledTable(rule, size, style, rulesInstance)
      }
    }
  TableConfig.apply("eightball", 10)
  constants.setR(R)
  dom.reconfigure({
    url: "https://authoring.invalid/?quality=high&tableSize=10",
  })
  THREE.TextureLoader.prototype.load = originalLoad
}

async function exportBalls() {
  const { BallMesh } = source("ballmesh")
  const { Rack } = require(path.join(root, "src/utils/rack.ts"))
  const racks = [
    Rack.eightBall(),
    Rack.diamond(),
    Rack.three(),
    Rack.fourBall(),
    Rack.fourBallChase(),
    Rack.snooker(),
  ]
  const variants = new Map()
  for (const ball of racks.flat()) {
    const colour = ball.ballmesh.color.getHexString()
    const appearance = ball.label === undefined ? "texturedDots" : "projected"
    const id =
      ball.label === undefined
        ? `ball-dotted-${colour}`
        : `ball-pool-${ball.label}`
    variants.set(id, { colour, label: ball.label, appearance })
  }
  inventory.families.balls = {
    variants: [...variants.keys()],
    contract:
      "Actual Rack palette and appearances, not approximate colours. Canonical radius in manifest; runtime scales geometry to current physical R. Numbered PBR maps embedded; dotted shader restored at runtime. No invented solid-snooker replacement.",
  }
  for (const [id, variant] of variants) {
    if (
      selectedId === "numbered-fix" &&
      (variant.label === undefined || variant.label <= 0)
    )
      continue
    const mesh = new BallMesh(
      Number.parseInt(variant.colour, 16),
      variant.label,
      variant.appearance
    ).mesh
    mesh.quaternion.identity()
    await exportArt(id, "ball", mesh, { ...variant, radius: R })
  }
}

async function exportEnvironments() {
  const { ENVIRONMENT_STYLES } = source("environmentstyle")
  const { EnvironmentManager } = source("environmentmanager")
  inventory.families.environments = {
    count: ENVIRONMENT_STYLES.length,
    styles: ENVIRONMENT_STYLES.map((style) => style.id),
    contract:
      "Visible architecture and decor exported together. Preserve floor/central table clearance. Runtime sky/caustics/meteor shaders remain separate; GLB shader proxies are labelled and not a replacement for shader rendering.",
  }
  for (const style of ENVIRONMENT_STYLES) {
    const scene = new THREE.Scene()
    const environment = new EnvironmentManager(
      scene,
      undefined,
      RENDER_QUALITY_PROFILES.high
    )
    environment.setStyle(style)
    environment.update({
      elapsed: 0,
      width: 1440,
      height: 900,
      cueX: 0,
      cueY: 0,
    })
    await exportArt(`environment-${style.id}`, "environment", scene, {
      style: style.id,
      architecture: style.architecture,
    })
    environment.dispose()
  }
}

async function main() {
  if (family === "all" || family === "cues") await exportCues()
  if (family === "all" || family === "robots") await exportRobots()
  if (family === "all" || family === "tables") await exportTables()
  if (family === "all" || family === "balls") await exportBalls()
  if (family === "all" || family === "environments") await exportEnvironments()
  const filename = path.join(output, `inventory-${family}.json`)
  if (selectedId && fs.existsSync(filename)) {
    const previous = JSON.parse(fs.readFileSync(filename, "utf8"))
    const replacements = new Map(
      inventory.assets.map((entry) => [entry.id, entry])
    )
    inventory.assets = previous.assets.map(
      (entry) => replacements.get(entry.id) || entry
    )
  }
  fs.writeFileSync(filename, JSON.stringify(inventory, null, 2) + "\n")
  console.log(
    `Wrote ${inventory.assets.length} verified containers: ${filename}`
  )
  dom.window.close()
}
if (require.main === module)
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
    dom.window.close()
  })
else module.exports = { THREE, source, dom }
