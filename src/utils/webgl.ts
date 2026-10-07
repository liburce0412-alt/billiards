import {
  ACESFilmicToneMapping,
  PCFShadowMap,
  SRGBColorSpace,
  WebGLRenderer,
} from "three"
import {
  AdaptiveRenderQuality,
  pixelRatioForViewport,
  registerRenderQualityController,
  renderQualityMode,
} from "../view/renderquality"

export function renderer(element: HTMLElement) {
  if (typeof process !== "undefined") {
    return undefined
  }

  const qualityController = new AdaptiveRenderQuality(renderQualityMode())
  const quality = qualityController.profile
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
  const applyQuality = (profile = qualityController.profile) => {
    renderer.shadowMap.enabled = profile.dynamicShadows
    renderer.setPixelRatio(
      pixelRatioForViewport(profile, element.offsetWidth, element.offsetHeight)
    )
  }
  applyQuality()
  qualityController.onChange(applyQuality)
  registerRenderQualityController(renderer, qualityController)
  renderer.domElement.draggable = false
  renderer.domElement.style.userSelect = "none"
  renderer.domElement.addEventListener("dragstart", (e) => e.preventDefault())
  element.appendChild(renderer.domElement)
  return renderer
}
