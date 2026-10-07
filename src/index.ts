import { BrowserContainer } from "./container/browsercontainer"
import { AngleInput } from "./view/dom/angleinput"
import { getCanvas } from "./utils/dom"
import { VERSION } from "./utils/version"
import { NetworkLogger } from "./utils/network-logger"
import { mountViewportCoordinator } from "./platform/viewport"
import { MobileGameViewport } from "./view/mobilegameviewport"

customElements.define("angle-input", AngleInput)

NetworkLogger.init()
let activeBrowserContainer: BrowserContainer | undefined
let activeMobileViewport: MobileGameViewport | undefined
let disposeViewportCoordinator: (() => void) | undefined

export function initialiseGame() {
  if (activeBrowserContainer) return activeBrowserContainer
  disposeViewportCoordinator = mountViewportCoordinator({ game: true })
  activeMobileViewport = new MobileGameViewport()
  activeMobileViewport.mount()
  console.log("Version:", VERSION)
  console.log(globalThis.location.href)
  const canvas3d = getCanvas("viewP1")!
  const params = new URLSearchParams(location.search)
  activeBrowserContainer = new BrowserContainer(canvas3d, params)
  activeBrowserContainer.start()
  return activeBrowserContainer
}

export function disposeGame() {
  activeBrowserContainer?.dispose()
  activeBrowserContainer = undefined
  activeMobileViewport?.dispose()
  activeMobileViewport = undefined
  disposeViewportCoordinator?.()
  disposeViewportCoordinator = undefined
}
