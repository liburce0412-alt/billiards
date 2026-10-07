import { PowerArcGeometry, PowerArcOrientation } from "./powerarcgeometry"

type ArcContext = WebGL2RenderingContext | CanvasRenderingContext2D

export class PowerArcRenderer {
  readonly canvas: HTMLCanvasElement
  private readonly context: ArcContext
  private readonly webgl: boolean
  private program?: WebGLProgram
  private buffer?: WebGLBuffer
  private resizeObserver?: ResizeObserver
  private geometry = new PowerArcGeometry(1, 1)
  private value = 0
  private orientation: PowerArcOrientation = "horizontal"

  static mount(parent: HTMLElement | null): PowerArcRenderer | undefined {
    if (!parent) return
    const canvas = document.createElement("canvas")
    canvas.className = "power-arc-canvas"
    canvas.setAttribute("aria-hidden", "true")
    const lowQuality =
      new URLSearchParams(globalThis.location?.search ?? "").get("quality") ===
      "low"
    const context = lowQuality
      ? canvas.getContext("2d")
      : (canvas.getContext("webgl2", {
          alpha: true,
          antialias: false,
          depth: false,
          premultipliedAlpha: true,
          powerPreference: "low-power",
        }) ?? canvas.getContext("2d"))
    if (!context) return
    parent.prepend(canvas)
    try {
      return new PowerArcRenderer(parent, canvas, context)
    } catch {
      canvas.remove()
      return
    }
  }

  private constructor(
    private readonly parent: HTMLElement,
    canvas: HTMLCanvasElement,
    context: ArcContext
  ) {
    this.canvas = canvas
    this.context = context
    this.webgl =
      typeof WebGL2RenderingContext !== "undefined" &&
      context instanceof WebGL2RenderingContext
    if (this.webgl)
      this.program = this.createProgram(context as WebGL2RenderingContext)
    this.resize()
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(this.resize)
      this.resizeObserver.observe(parent)
    } else {
      globalThis.addEventListener("resize", this.resize)
    }
  }

  getGeometry(): PowerArcGeometry {
    return this.geometry
  }

  setOrientation(orientation: PowerArcOrientation) {
    if (this.orientation === orientation) return
    this.orientation = orientation
    this.resize()
  }

  setValue(value: number) {
    this.value = this.geometry.clamp(value)
    this.positionDom(this.value)
    this.draw()
  }

  private resize = () => {
    const rect = this.parent.getBoundingClientRect()
    const width = Math.max(1, rect.width)
    const height = Math.max(
      1,
      this.orientation === "vertical"
        ? rect.height
        : Math.min(128, rect.height - 18)
    )
    const density = Math.min(globalThis.devicePixelRatio || 1, 1.75)
    this.canvas.width = Math.max(1, Math.round(width * density))
    this.canvas.height = Math.max(1, Math.round(height * density))
    this.canvas.style.width = `${width}px`
    this.canvas.style.height = `${height}px`
    this.geometry = new PowerArcGeometry(
      width,
      height,
      undefined,
      undefined,
      undefined,
      this.orientation
    )
    if (this.webgl) {
      const gl = this.context as WebGL2RenderingContext
      gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    }
    this.positionDom(this.value)
    this.draw()
  }

  private positionDom(value: number) {
    const point = this.geometry.pointAt(value)
    const normal = this.geometry.normalAt(value)
    this.parent.style.setProperty("--power-x", `${point.x}px`)
    this.parent.style.setProperty("--power-y", `${point.y}px`)
    this.parent.style.setProperty(
      "--power-angle",
      `${Math.atan2(normal.y, normal.x) * (180 / Math.PI) - 90}deg`
    )
  }

  private shader(
    gl: WebGL2RenderingContext,
    type: number,
    source: string
  ): WebGLShader {
    const shader = gl.createShader(type)
    if (!shader) throw new Error("Unable to create power arc shader")
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) ?? "Power arc shader failed"
      gl.deleteShader(shader)
      throw new Error(message)
    }
    return shader
  }

  private createProgram(gl: WebGL2RenderingContext): WebGLProgram {
    const vertex = this.shader(
      gl,
      gl.VERTEX_SHADER,
      `#version 300 es
      in vec2 aPosition;
      void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`
    )
    const fragment = this.shader(
      gl,
      gl.FRAGMENT_SHADER,
      `#version 300 es
      precision highp float;
      uniform vec2 uResolution;
      uniform float uPower;
      uniform float uInset;
      uniform float uCross;
      uniform float uSag;
      uniform float uVertical;
      out vec4 outColor;

      float curveCross(float primary, float primarySize) {
        float t = clamp((primary - uInset) / max(1.0, primarySize - 2.0 * uInset), 0.0, 1.0);
        float c = t * 2.0 - 1.0;
        return uCross + uSag * (1.0 - c * c);
      }

      void main() {
        vec2 p = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
        float primary = mix(p.x, p.y, uVertical);
        float cross = mix(p.y, p.x, uVertical);
        float primarySize = mix(uResolution.x, uResolution.y, uVertical);
        float t = clamp((primary - uInset) / max(1.0, primarySize - 2.0 * uInset), 0.0, 1.0);
        float curve = curveCross(primary, primarySize);
        float dc = abs(cross - curve);
        float ends = smoothstep(0.0, 0.012, t) * smoothstep(0.0, 0.012, 1.0 - t);
        float outer = (1.0 - smoothstep(13.0, 15.0, dc)) * ends;
        float slot = (1.0 - smoothstep(7.0, 8.4, dc)) * ends;
        float core = (1.0 - smoothstep(2.2, 3.8, dc)) * ends * step(t, uPower);
        float glow = (1.0 - smoothstep(4.0, 16.0, dc)) * step(t, uPower) * ends;
        float highlightOffset = mix(-8.2, 8.2, uVertical);
        float upper = exp(-pow((cross - (curve + highlightOffset)) / 1.6, 2.0)) * ends;

        float majorPhase = abs(fract(t * 4.0 + 0.5) - 0.5);
        float minorPhase = abs(fract(t * 20.0 + 0.5) - 0.5);
        float major = (1.0 - smoothstep(0.0, 0.035, majorPhase)) *
          (1.0 - smoothstep(8.0, 13.0, dc)) * ends;
        float minor = (1.0 - smoothstep(0.0, 0.055, minorPhase)) *
          (1.0 - smoothstep(9.0, 11.5, dc)) * ends * 0.5;

        vec3 silver = mix(vec3(0.37, 0.48, 0.56), vec3(0.99), clamp((curve - cross + 14.0) / 28.0, 0.0, 1.0));
        vec3 colour = silver * outer;
        colour = mix(colour, vec3(0.025, 0.105, 0.16), slot);
        colour += vec3(0.06, 0.88, 0.98) * core;
        colour += vec3(0.04, 0.72, 0.91) * glow * 0.34;
        colour += vec3(1.0, 0.56, 0.24) * glow * max(0.0, 0.45 - abs(t - 0.82)) * 0.62;
        colour += vec3(1.0) * upper * 0.72;
        colour += vec3(0.93, 0.98, 1.0) * max(major, minor);
        float alpha = clamp(outer * 0.96 + slot + core + glow * 0.38 + major + minor, 0.0, 1.0);
        outColor = vec4(colour, alpha);
      }`
    )
    const program = gl.createProgram()
    if (!program) throw new Error("Unable to create power arc program")
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    gl.deleteShader(vertex)
    gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "Power arc link failed")
    }
    const buffer = gl.createBuffer()
    if (!buffer) {
      gl.deleteProgram(program)
      throw new Error("Unable to create power arc buffer")
    }
    this.buffer = buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    )
    const location = gl.getAttribLocation(program, "aPosition")
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
    return program
  }

  private draw() {
    if (this.webgl) this.drawWebgl()
    else this.drawCanvas()
  }

  private drawWebgl() {
    const gl = this.context as WebGL2RenderingContext
    const program = this.program
    if (!program) return
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)
    gl.uniform2f(
      gl.getUniformLocation(program, "uResolution"),
      this.canvas.width,
      this.canvas.height
    )
    const density = this.canvas.width / Math.max(1, this.geometry.width)
    gl.uniform1f(gl.getUniformLocation(program, "uPower"), this.value)
    gl.uniform1f(
      gl.getUniformLocation(program, "uInset"),
      this.geometry.inset * density
    )
    gl.uniform1f(
      gl.getUniformLocation(program, "uCross"),
      this.geometry.top * density
    )
    gl.uniform1f(
      gl.getUniformLocation(program, "uSag"),
      this.geometry.sag * density
    )
    gl.uniform1f(
      gl.getUniformLocation(program, "uVertical"),
      this.orientation === "vertical" ? 1 : 0
    )
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  private trace(
    context: CanvasRenderingContext2D,
    from: number,
    to: number,
    steps = 80
  ) {
    context.beginPath()
    for (let index = 0; index <= steps; index++) {
      const t = from + ((to - from) * index) / steps
      const point = this.geometry.pointAt(t)
      if (index === 0) context.moveTo(point.x, point.y)
      else context.lineTo(point.x, point.y)
    }
  }

  private drawCanvas() {
    const context = this.context as CanvasRenderingContext2D
    const density = this.canvas.width / Math.max(1, this.geometry.width)
    context.setTransform(density, 0, 0, density, 0, 0)
    context.clearRect(0, 0, this.geometry.width, this.geometry.height)
    context.lineCap = "round"
    this.trace(context, 0, 1)
    context.strokeStyle = "rgba(194, 210, 220, .98)"
    context.lineWidth = 26
    context.stroke()
    this.trace(context, 0, 1)
    context.strokeStyle = "#071d2c"
    context.lineWidth = 14
    context.stroke()
    this.trace(context, 0, this.value)
    context.strokeStyle = "#19cce2"
    context.lineWidth = 6
    context.shadowColor = "rgba(25, 204, 226, .72)"
    context.shadowBlur = 10
    context.stroke()
    context.shadowBlur = 0
    for (let index = 0; index <= 20; index++) {
      const t = index / 20
      const point = this.geometry.pointAt(t)
      const normal = this.geometry.normalAt(t)
      const size = index % 5 === 0 ? 12 : 7
      context.beginPath()
      context.moveTo(point.x + normal.x * 8, point.y + normal.y * 8)
      context.lineTo(
        point.x + normal.x * (8 + size),
        point.y + normal.y * (8 + size)
      )
      context.strokeStyle = "rgba(255,255,255,.86)"
      context.lineWidth = index % 5 === 0 ? 2 : 1
      context.stroke()
    }
  }

  dispose() {
    this.resizeObserver?.disconnect()
    globalThis.removeEventListener("resize", this.resize)
    if (this.webgl) {
      const gl = this.context as WebGL2RenderingContext
      if (this.buffer) gl.deleteBuffer(this.buffer)
      if (this.program) gl.deleteProgram(this.program)
      this.buffer = undefined
      this.program = undefined
    }
    this.canvas.remove()
  }
}
