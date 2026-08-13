export class LiquidGlassFx {
  private readonly canvas: HTMLCanvasElement
  private readonly parent: HTMLElement
  private readonly context: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly timeLocation: WebGLUniformLocation | null
  private readonly resolutionLocation: WebGLUniformLocation | null
  private readonly pointerLocation: WebGLUniformLocation | null
  private frame = 0
  private observer?: ResizeObserver
  private startedAt = performance.now()
  private pointerX = 0.28
  private pointerY = 0.58

  static mount(parent: HTMLElement | null): LiquidGlassFx | undefined {
    if (
      !parent ||
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      new URLSearchParams(globalThis.location?.search ?? "").get("quality") ===
        "low"
    ) {
      parent?.classList.add("liquid-glass-fallback")
      return
    }
    if (parent.querySelector(".liquid-glass-fx")) return
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("webgl2", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    })
    if (!context) {
      parent.classList.add("liquid-glass-fallback")
      return
    }
    try {
      const effect = new LiquidGlassFx(parent, context, canvas)
      parent.prepend(effect.canvas)
      effect.start()
      return effect
    } catch {
      canvas.remove()
      parent.classList.add("liquid-glass-fallback")
      return
    }
  }

  private constructor(
    parent: HTMLElement,
    context: WebGL2RenderingContext,
    canvas: HTMLCanvasElement
  ) {
    this.parent = parent
    this.context = context
    this.canvas = canvas
    this.canvas.className = "liquid-glass-fx"
    this.canvas.setAttribute("aria-hidden", "true")
    this.program = this.createProgram()
    this.timeLocation = context.getUniformLocation(this.program, "uTime")
    this.resolutionLocation = context.getUniformLocation(
      this.program,
      "uResolution"
    )
    this.pointerLocation = context.getUniformLocation(this.program, "uPointer")
  }

  private shader(type: number, source: string): WebGLShader {
    const shader = this.context.createShader(type)
    if (!shader) throw new Error("Unable to create liquid glass shader")
    this.context.shaderSource(shader, source)
    this.context.compileShader(shader)
    if (!this.context.getShaderParameter(shader, this.context.COMPILE_STATUS)) {
      const message = this.context.getShaderInfoLog(shader) ?? "Shader failed"
      this.context.deleteShader(shader)
      throw new Error(message)
    }
    return shader
  }

  private createProgram(): WebGLProgram {
    const vertex = this.shader(
      this.context.VERTEX_SHADER,
      `#version 300 es
      in vec2 aPosition;
      void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`
    )
    const fragment = this.shader(
      this.context.FRAGMENT_SHADER,
      `#version 300 es
      precision highp float;
      uniform float uTime;
      uniform vec2 uResolution;
      uniform vec2 uPointer;
      out vec4 outColor;

      float softBand(float value, float center, float width) {
        return exp(-pow((value - center) / width, 2.0));
      }

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x),
          f.y
        );
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / max(uResolution, vec2(1.0));
        vec2 p = uv - 0.5;
        float aspect = uResolution.x / max(uResolution.y, 1.0);
        p.x *= aspect;
        float t = uTime * 0.12;
        vec2 pointer = (uPointer - 0.5) * vec2(aspect, 1.0);
        float pointerLens = exp(-dot(p - pointer, p - pointer) * 3.6);
        float fogNoise = noise(vec2(p.x * 0.72 + t * 0.25, p.y * 2.8 - t * 0.18));
        fogNoise += noise(vec2(p.x * 1.45 - t * 0.11, p.y * 5.2 + t * 0.26)) * 0.45;
        float warp = sin(p.x * 4.2 + t) * 0.09;
        warp += sin(p.y * 7.4 - t * 0.7) * 0.052;
        warp += pointerLens * sin(t * 2.1 + length(p - pointer) * 18.0) * 0.055;
        float cyan = softBand(p.y + warp, -0.22, 0.18);
        float violet = softBand(p.y - sin(p.x * 3.1 - t) * 0.10, 0.12, 0.24);
        float peach = softBand(
          p.y + sin(p.x * 1.55 + t * 0.6) * 0.16,
          0.02 + sin(p.x * 0.72 - t * 0.3) * 0.16,
          0.29
        );
        float glint = softBand(
          p.y + p.x * 0.08,
          sin(t * 0.72) * 0.12,
          0.19
        );
        float lensEdge = smoothstep(0.58, 0.18, abs(length(p - pointer) - 0.32));
        float arc = abs(length(vec2(p.x * 0.68, p.y + 1.12)) - 1.04);
        float arcGlow = 1.0 - smoothstep(0.025, 0.075, arc);
        float radial = atan(p.y + 0.62, p.x - aspect * 0.5);
        float radialTicks = pow(max(0.0, cos(radial * 24.0)), 22.0);
        float radialMask = 1.0 - smoothstep(0.38, 0.78, length(p - vec2(aspect * 0.5, -0.5)));
        float lightFog = smoothstep(0.22, 1.05, fogNoise) * (0.38 + peach * 0.62);
        vec3 colour = vec3(0.91, 0.96, 0.99);
        colour = mix(colour, vec3(0.05, 0.88, 0.98), cyan * 0.48);
        colour = mix(colour, vec3(0.46, 0.24, 0.98), violet * 0.38);
        colour = mix(colour, vec3(1.0, 0.36, 0.08), peach * 0.62);
        colour += glint * vec3(0.78, 0.94, 1.0) * 0.10;
        colour += lensEdge * vec3(0.36, 0.74, 1.0) * pointerLens * 0.14;
        colour += arcGlow * vec3(0.03, 0.23, 0.38) * 0.48;
        colour += radialTicks * radialMask * vec3(0.10, 0.86, 0.98) * 0.22;
        colour = mix(colour, vec3(1.0, 0.32, 0.055), lightFog * 0.68);
        colour += vec3(1.0, 0.88, 0.72) * lightFog * 0.16;
        float alpha = 0.038 + cyan * 0.038 + violet * 0.034 + peach * 0.145;
        alpha += lightFog * 0.13;
        outColor = vec4(colour, alpha);
      }`
    )
    const program = this.context.createProgram()
    if (!program) throw new Error("Unable to create liquid glass program")
    this.context.attachShader(program, vertex)
    this.context.attachShader(program, fragment)
    this.context.linkProgram(program)
    this.context.deleteShader(vertex)
    this.context.deleteShader(fragment)
    if (!this.context.getProgramParameter(program, this.context.LINK_STATUS)) {
      throw new Error(this.context.getProgramInfoLog(program) ?? "Link failed")
    }
    const vertices = this.context.createBuffer()
    this.context.bindBuffer(this.context.ARRAY_BUFFER, vertices)
    this.context.bufferData(
      this.context.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      this.context.STATIC_DRAW
    )
    const location = this.context.getAttribLocation(program, "aPosition")
    this.context.enableVertexAttribArray(location)
    this.context.vertexAttribPointer(
      location,
      2,
      this.context.FLOAT,
      false,
      0,
      0
    )
    return program
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect()
    const density = Math.min(globalThis.devicePixelRatio || 1, 1.5)
    this.canvas.width = Math.max(1, Math.round(rect.width * density))
    this.canvas.height = Math.max(1, Math.round(rect.height * density))
    this.context.viewport(0, 0, this.canvas.width, this.canvas.height)
  }

  private trackPointer = (event: PointerEvent) => {
    const rect = this.parent.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const nextX = (event.clientX - rect.left) / rect.width
    const nextY = 1 - (event.clientY - rect.top) / rect.height
    this.pointerX = Math.max(0, Math.min(1, nextX))
    this.pointerY = Math.max(0, Math.min(1, nextY))
  }

  private contextLost = (event: Event) => {
    event.preventDefault()
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.parent.classList.add("liquid-glass-fallback")
  }

  private contextRestored = () => {
    this.parent.classList.remove("liquid-glass-fallback")
    this.startedAt = performance.now()
    if (!this.frame) this.frame = requestAnimationFrame(this.render)
  }

  private render = (timestamp: number) => {
    if (!document.hidden) {
      this.context.useProgram(this.program)
      this.context.uniform1f(
        this.timeLocation,
        (timestamp - this.startedAt) / 1000
      )
      this.context.uniform2f(
        this.resolutionLocation,
        this.canvas.width,
        this.canvas.height
      )
      this.context.uniform2f(this.pointerLocation, this.pointerX, this.pointerY)
      this.context.drawArrays(this.context.TRIANGLES, 0, 6)
    }
    this.frame = requestAnimationFrame(this.render)
  }

  private start() {
    this.resize()
    if (typeof ResizeObserver !== "undefined") {
      this.observer = new ResizeObserver(this.resize)
      this.observer.observe(this.parent)
    } else {
      globalThis.addEventListener("resize", this.resize)
    }
    this.parent.addEventListener("pointermove", this.trackPointer, {
      passive: true,
    })
    this.canvas.addEventListener("webglcontextlost", this.contextLost)
    this.canvas.addEventListener("webglcontextrestored", this.contextRestored)
    this.frame = requestAnimationFrame(this.render)
  }

  dispose() {
    cancelAnimationFrame(this.frame)
    this.observer?.disconnect()
    globalThis.removeEventListener("resize", this.resize)
    this.parent.removeEventListener("pointermove", this.trackPointer)
    this.canvas.removeEventListener("webglcontextlost", this.contextLost)
    this.canvas.removeEventListener(
      "webglcontextrestored",
      this.contextRestored
    )
    this.context.deleteProgram(this.program)
    this.canvas.remove()
  }
}
