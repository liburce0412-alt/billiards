/* global require, __dirname, process, console */
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { Box3, Matrix4, Quaternion, Vector3 } = require("three")

const root = path.resolve(__dirname, "../..")
const source = path.join(root, ".tmp/legacy-art-export")
const output = path.join(root, "dist/models/legacy-refined")
const evidence = path.join(root, "docs/qa/2026-10-05-blender-mcp")
const families = ["robots", "cues", "environments", "balls", "tables"]
const inventories = families.map((family) =>
  JSON.parse(
    fs.readFileSync(path.join(source, `inventory-${family}.json`), "utf8")
  )
)
const entries = inventories.flatMap((inventory) => inventory.assets)

function readGlb(file) {
  const bytes = fs.readFileSync(file)
  if (
    bytes.readUInt32LE(0) !== 0x46546c67 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    throw new Error(`Invalid GLB container ${file}`)
  const json = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8")
  )
  return {
    bytes,
    json,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  }
}

function glbBounds(json) {
  const bounds = new Box3()
  const restore = new Matrix4().makeRotationX(Math.PI / 2)
  const walk = (index, parent) => {
    const node = json.nodes[index]
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(
          new Vector3(...(node.translation || [0, 0, 0])),
          new Quaternion(...(node.rotation || [0, 0, 0, 1])),
          new Vector3(...(node.scale || [1, 1, 1]))
        )
    const world = new Matrix4().multiplyMatrices(parent, local)
    if (node.mesh !== undefined)
      for (const primitive of json.meshes[node.mesh].primitives) {
        const accessor = json.accessors[primitive.attributes.POSITION]
        if (!accessor.min || !accessor.max)
          throw new Error("Position bounds absent")
        bounds.union(
          new Box3(
            new Vector3(...accessor.min),
            new Vector3(...accessor.max)
          ).applyMatrix4(world)
        )
      }
    for (const child of node.children || []) walk(child, world)
  }
  for (const index of json.scenes[json.scene || 0].nodes) walk(index, restore)
  return { min: bounds.min.toArray(), max: bounds.max.toArray() }
}

function maximumDifference(a, b) {
  return Math.max(
    ...a.min.map((n, i) => Math.abs(n - b.min[i])),
    ...a.max.map((n, i) => Math.abs(n - b.max[i]))
  )
}

const assets = []
const missing = []
const checks = []
for (const entry of entries) {
  const original = readGlb(path.join(source, entry.file))
  if (original.sha256 !== entry.sha256)
    throw new Error(`Source changed after inventory: ${entry.id}`)
  const roundtripBounds = glbBounds(original.json)
  const roundtripError = maximumDifference(roundtripBounds, entry.bounds)
  if (roundtripError > 0.00003)
    throw new Error(
      `Source axis/geometry export mismatch ${entry.id}: ${roundtripError} m`
    )
  checks.push({ id: entry.id, roundtripErrorMetres: roundtripError })
  // Posed robot exports document the unchanged live rig. The five refined
  // prototypes are its production assets, not a frozen posed replacement.
  if (entry.category === "robot-reference") continue
  const file = path.join(output, entry.file)
  if (!fs.existsSync(file)) {
    missing.push(entry.id)
    continue
  }
  const refined = readGlb(file)
  const blend = path.join(root, "assets/blender/legacy", `${entry.id}.blend`)
  const receipt = path.join(evidence, `${entry.id}-refine.json`)
  if (!fs.existsSync(blend) || !fs.existsSync(receipt)) {
    missing.push(`${entry.id} (missing Blender source/MCP receipt)`)
    continue
  }
  const call = JSON.parse(fs.readFileSync(receipt, "utf8"))
  const sourceTime = fs.statSync(path.join(source, entry.file)).mtimeMs
  const refinedTime = fs.statSync(file).mtimeMs
  const receiptTime = Date.parse(call.time || "")
  const stampedSource =
    call.inputs?.sha256 ??
    refined.json.nodes
      ?.map((node) => node.extras?.sourceSha256)
      .find((value) => typeof value === "string")
  if (
    (stampedSource && stampedSource !== original.sha256) ||
    (!stampedSource &&
      (refinedTime < sourceTime ||
        !Number.isFinite(receiptTime) ||
        receiptTime < sourceTime))
  ) {
    missing.push(`${entry.id} (source changed after Blender refinement)`)
    continue
  }
  if (call.result?.isError || call.isError)
    throw new Error(`Failed Blender receipt ${entry.id}`)
  const receiptText = (call.result?.content || call.content || [])
    .filter((item) => item.type === "text")
    .map((item) => item.text || "")
    .join("\n")
  if (
    receiptText.split("\n").some((line) => {
      const text = line.trimStart().toLowerCase()
      return ["error", "rejected", "traceback", "sandboxviolation"].some(
        (prefix) => text.startsWith(prefix)
      )
    })
  )
    throw new Error(`Blender reported an execution error: ${entry.id}`)
  if (!refined.json.nodes?.some((node) => node.extras?.nativeRefined === true))
    throw new Error(`No nativeRefined provenance marker: ${entry.id}`)
  const compact = {
    id: entry.id,
    category: entry.category,
    file: entry.file,
    sha256: refined.sha256,
    sourceSha256: original.sha256,
    sourceVerification: stampedSource
      ? "sha256"
      : "source-before-mcp-timestamp",
    bytes: refined.bytes.length,
    sourceBlend: `assets/blender/legacy/${entry.id}.blend`,
    evidence: `docs/qa/2026-10-05-blender-mcp/${entry.id}-refine.json`,
    angleImages: fs
      .readdirSync(evidence)
      .filter(
        (name) =>
          name.startsWith(`${entry.id}-angles-`) && name.endsWith(".png")
      )
      .map((name) => `docs/qa/2026-10-05-blender-mcp/${name}`),
    visualReviewed: false,
  }
  const reviewFile = path.join(evidence, `${entry.id}-review.json`)
  if (fs.existsSync(reviewFile)) {
    const review = JSON.parse(fs.readFileSync(reviewFile, "utf8"))
    compact.visualReviewed =
      review.passed === true && review.sha256 === refined.sha256
  }
  for (const key of [
    "length",
    "radius",
    "ballRadius",
    "rule",
    "size",
    "style",
    "shape",
    "appearance",
    "colour",
    "label",
    "physicalTable",
    "compatibleRules",
  ])
    if (entry[key] !== undefined) compact[key] = entry[key]
  assets.push(compact)
}

const merged = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sourceUnit: "metres",
  sourceUpAxis: "Z",
  assetUpAxis: "Y",
  runtimeRootRotationX: Math.PI / 2,
  sourceBallRadius: inventories[0].ballRadius,
  families: Object.assign(
    {},
    ...inventories.map((inventory) => inventory.families)
  ),
  assets: entries,
  runtimeExceptions: inventories[0].runtimeExceptions,
  verification: {
    containers: entries.length,
    boundsRoundtrip: checks,
    refinedAvailable: assets.length,
    pending: missing,
  },
}
fs.mkdirSync(path.join(root, "docs/art"), { recursive: true })
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(
  path.join(root, "docs/art/legacy-asset-inventory.json"),
  JSON.stringify(merged, null, 2) + "\n"
)
fs.writeFileSync(
  path.join(output, "manifest.json"),
  JSON.stringify(
    {
      version: 1,
      sourceBallRadius: merged.sourceBallRadius,
      runtimeRootRotationX: Math.PI / 2,
      assets,
    },
    null,
    2
  ) + "\n"
)
console.log(
  `${entries.length} source GLBs passed axis/bounds roundtrip; ${assets.length} actual Blender-refined assets enabled; ${missing.length} pending.`
)
if (process.argv.includes("--require-complete") && missing.length)
  process.exitCode = 1
if (
  process.argv.includes("--require-visual-review") &&
  assets.some((asset) => !asset.visualReviewed)
)
  process.exitCode = 1
