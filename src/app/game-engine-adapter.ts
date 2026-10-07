import { gameUiStore } from "./stores"

declare global {
  var __BREAK_BUILDER_GAME_STARTED__: boolean | undefined
}

/**
 * Transitional boundary around the deterministic Three.js game. React owns
 * navigation and chrome while pointer-frequency commands stay outside React.
 */
export class GameEngineAdapter {
  private mounting: Promise<void> | null = null
  private module?: typeof import("../index")
  private shouldRemainMounted = false

  mount() {
    this.shouldRemainMounted = true
    if (globalThis.__BREAK_BUILDER_GAME_STARTED__) {
      this.module?.initialiseGame()
      return Promise.resolve()
    }
    if (this.mounting) return this.mounting
    gameUiStore.update({
      phase: "loading",
      error: null,
      controlsEnabled: false,
    })
    this.mounting = import("../index")
      .then((gameModule) => {
        this.module = gameModule
        if (this.shouldRemainMounted) gameModule.initialiseGame()
        globalThis.__BREAK_BUILDER_GAME_STARTED__ = true
        gameUiStore.update({
          phase: "ready",
          error: null,
          controlsEnabled: true,
        })
      })
      .catch((error: unknown) => {
        this.mounting = null
        const message =
          error instanceof Error ? error.message : "3D 游戏引擎加载失败"
        gameUiStore.update({
          phase: "error",
          error: message,
          controlsEnabled: false,
        })
        throw error
      })
    return this.mounting
  }

  unmount() {
    this.shouldRemainMounted = false
    this.module?.disposeGame()
  }
}

export const gameEngineAdapter = new GameEngineAdapter()
