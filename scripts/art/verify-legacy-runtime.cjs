/* global require, __dirname, process, console, window */
const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const { THREE, source, dom } = require("./export-legacy-assets.cjs")
const { GLTFLoader } = require("three/examples/jsm/loaders/GLTFLoader.js")
const root = path.resolve(__dirname, "../..")
const directory = path.join(root, "dist/models/legacy-refined")
const manifest = JSON.parse(
  fs.readFileSync(path.join(directory, "manifest.json"), "utf8")
)
const report = {
  generatedAt: new Date().toISOString(),
  scope:
    "Actual GLB decoding and runtime geometry/material adoption; not a WebGL screenshot or phone test",
  assetVersions: Object.fromEntries(
    manifest.assets.map((entry) => [entry.id, entry.sha256])
  ),
  cues: [],
  balls: [],
  environments: [],
  robots: [],
  tables: [],
}

async function decode(file) {
  const bytes = fs.readFileSync(file)
  const length = bytes.readUInt32LE(12)
  const gltf = JSON.parse(bytes.subarray(20, 20 + length).toString("utf8"))
  const binStart = 20 + length + 8
  const bin = bytes.subarray(binStart)
  for (const image of gltf.images || []) {
    if (image.bufferView === undefined) continue
    const view = gltf.bufferViews[image.bufferView]
    image.uri = `data:${image.mimeType};base64,${bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength).toString("base64")}`
    delete image.bufferView
  }
  gltf.buffers[0].uri = `data:application/octet-stream;base64,${bin.toString("base64")}`
  return new GLTFLoader().parseAsync(JSON.stringify(gltf), "")
}

function meshes(object) {
  const result = []
  object.traverse((part) => {
    if (part instanceof THREE.Mesh) result.push(part)
  })
  return result
}

async function main() {
  window.fetch = async () => ({ ok: true, json: async () => manifest })
  GLTFLoader.prototype.loadAsync = async (url) =>
    decode(path.join(directory, path.basename(url.split("?")[0])))
  const art = source("refinedart")
  await art.preloadRefinedArt(manifest.assets.map((entry) => entry.id))
  const { CueMesh } = source("cuemesh")
  const { saveCustomCueDetails } = source("cuestyle")
  for (const entry of manifest.assets.filter(
    (entry) => entry.category === "cue"
  )) {
    const cue = CueMesh.createCue(
      0.028575 * 0.14,
      0.028575 * 0.46,
      1.228725,
      entry.style
    )
    assert.equal(
      cue.cueBody.userData.refinedCueStyle,
      entry.style,
      `${entry.id} failed to adopt`
    )
    const parts = meshes(cue.cueBody)
    assert(parts.some((part) => part.userData.cueRole === "tip"))
    assert(parts.some((part) => part.userData.cueRole === "shaft"))
    const textured = parts.filter((part) => part.material.map)
    assert(textured.length > 0, `${entry.id} lost its PBR textures`)
    for (const part of textured)
      assert(
        part.material.map.image?.width > 0,
        `${entry.id} image did not decode`
      )
    if (entry.style === "custom") {
      saveCustomCueDetails({
        forearm: "#0080ff",
        forearmPattern: "flame",
        inlayPattern: "chevron",
      })
      CueMesh.applyStyle(cue.cueBody, "custom")
      const forearm = parts.find((part) => part.userData.cueRole === "forearm")
      assert.equal(forearm.material.color.getHex(), 0x0080ff)
      const inlays = parts.filter((part) => part.userData.cuePattern)
      assert(
        inlays.some(
          (part) => part.userData.cuePattern === "chevron" && part.visible
        )
      )
      assert(
        inlays.every(
          (part) => part.visible === (part.userData.cuePattern === "chevron")
        )
      )
    }
    report.cues.push({
      id: entry.id,
      meshes: parts.length,
      texturedMeshes: parts.filter((part) => part.material.map).length,
      customControls: entry.style === "custom",
    })
    art.disposeRefinedArt(cue.cueBody)
  }
  const { BallMesh } = source("ballmesh")
  for (const entry of manifest.assets.filter(
    (entry) => entry.category === "ball"
  )) {
    const ball = new BallMesh(
      Number.parseInt(entry.colour, 16),
      entry.label,
      entry.appearance
    )
    assert.equal(ball.mesh.userData.refinedArtId, entry.id)
    ball.mesh.geometry.computeBoundingBox()
    const size = ball.mesh.geometry.boundingBox.getSize(new THREE.Vector3())
    assert(Math.abs(size.x - 0.03275 * 2) < 0.00001)
    if (entry.appearance === "texturedDots")
      assert(
        ball.mesh.material
          .customProgramCacheKey()
          .includes("shared-ball-marker")
      )
    report.balls.push({
      id: entry.id,
      radius: size.x / 2,
      shaderRetained: entry.appearance === "texturedDots",
    })
    ball.mesh.geometry.dispose()
  }
  const { RobotPlayers } = source("robotplayers")
  const robots = new RobotPlayers()
  for (const player of robots.players)
    for (const shape of ["sphere", "box", "cylinder", "armour", "helmet"]) {
      assert.equal(
        player[shape].userData.refinedArtId,
        `robot-prototype-${shape}`
      )
      report.robots.push({ robot: player.root.name, shape })
    }
  robots.dispose()
  const { EnvironmentManager } = source("environmentmanager")
  const { environmentStyleById } = source("environmentstyle")
  const { RENDER_QUALITY_PROFILES } = source("renderquality")
  for (const entry of manifest.assets.filter(
    (entry) => entry.category === "environment"
  )) {
    const scene = new THREE.Scene()
    const environment = new EnvironmentManager(
      scene,
      undefined,
      RENDER_QUALITY_PROFILES.high
    )
    environment.setStyle(environmentStyleById(entry.style))
    assert(scene.getObjectByName(`refined-${entry.id}`))
    const visibleShaders = meshes(scene).filter(
      (part) => part.visible && part.material instanceof THREE.ShaderMaterial
    )
    assert(visibleShaders.length > 0, `${entry.id} lost runtime sky`)
    environment.update({
      elapsed: 0.1,
      width: 800,
      height: 600,
      cueX: 0,
      cueY: 0,
    })
    report.environments.push({
      id: entry.id,
      liveShaderObjects: visibleShaders.length,
    })
    environment.dispose()
  }
  for (const entry of manifest.assets.filter(
    (entry) => entry.category === "table"
  )) {
    const model = art.refinedArt(entry.id)
    assert(model)
    const bounds = new THREE.Box3().setFromObject(model)
    assert(
      bounds.getSize(new THREE.Vector3()).x > entry.physicalTable.halfX * 2
    )
    report.tables.push({
      id: entry.id,
      meshes: meshes(model).length,
      halfX: entry.physicalTable.halfX,
    })
    art.disposeRefinedArt(model)
  }
  art.clearRefinedArtCache()
  fs.writeFileSync(
    path.join(
      root,
      "docs/qa/2026-10-05-blender-mcp/runtime-asset-adoption.json"
    ),
    JSON.stringify(report, null, 2) + "\n"
  )
  console.log(
    `Actual GLBs adopted: ${report.cues.length} cues, ${report.balls.length} balls, ${report.robots.length} robot shape slots, ${report.environments.length} environments, ${report.tables.length} tables.`
  )
}
main()
  .then(() => dom.window.close())
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
    dom.window.close()
  })
