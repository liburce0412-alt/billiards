import { mountSpectraFx } from "./platform/fx"

const canvas = document.querySelector<HTMLCanvasElement>(".rule-fx")
if (canvas) mountSpectraFx(canvas, { quality: "balanced", interactive: true })
