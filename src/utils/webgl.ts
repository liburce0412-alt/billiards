import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  WebGLRenderer,
} from "three"
import { getRenderQuality } from "../view/renderquality"

export function renderer(element: HTMLElement) {
  if (typeof process !== "undefined") {
    return undefined
  }

  const quality = getRenderQuality()
  const renderer = new WebGLRenderer({
    antialias: quality.antialias,
    depth: true,
    powerPreference: "high-performance",
    stencil: false,
    alpha: false,
  })

  renderer.shadowMap.enabled = quality.dynamicShadows
  renderer.shadowMap.type = PCFShadowMap
  renderer.autoClear = false
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.88
  renderer.sortObjects = false
  renderer.setSize(element.offsetWidth, element.offsetHeight)
  renderer.setPixelRatio(
    Math.min(globalThis.devicePixelRatio || 1, quality.maxPixelRatio)
  )
  renderer.domElement.draggable = false
  renderer.domElement.style.userSelect = "none"
  renderer.domElement.addEventListener("dragstart", (e) => e.preventDefault())
  element.appendChild(renderer.domElement)
  return renderer
}
