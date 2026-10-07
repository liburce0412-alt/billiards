export class LiquidGlassFx {
  private readonly canvas: HTMLCanvasElement
  private readonly parent: HTMLElement
  private readonly context: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private vertexBuffer?: WebGLBuffer
  private readonly timeLocation: WebGLUniformLocation | null
  private readonly resolutionLocation: WebGLUniformLocation | null
  private readonly pointerLocation: WebGLUniformLocation | null
  private readonly sceneLocation: WebGLUniformLocation | null
  private readonly sceneBoundsLocation: WebGLUniformLocation | null
  private readonly hasSceneLocation: WebGLUniformLocation | null
  private readonly sceneTexture: WebGLTexture | null
  private readonly sourceCanvas: HTMLCanvasElement | null
  private frame = 0
  private observer?: ResizeObserver
  private startedAt = performance.now()
  private pointerX = 0.28
  private pointerY = 0.58
  private lastDrawAt = 0

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
    this.sceneLocation = context.getUniformLocation(this.program, "uScene")
    this.sceneBoundsLocation = context.getUniformLocation(
      this.program,
      "uSceneBounds"
    )
    this.hasSceneLocation = context.getUniformLocation(
      this.program,
      "uHasScene"
    )
    this.sourceCanvas =
      document.querySelector<HTMLCanvasElement>("#viewP1 > canvas")
    this.sceneTexture = context.createTexture()
    context.activeTexture(context.TEXTURE0)
    context.bindTexture(context.TEXTURE_2D, this.sceneTexture)
    context.texParameteri(
      context.TEXTURE_2D,
      context.TEXTURE_MIN_FILTER,
      context.LINEAR
    )
    context.texParameteri(
      context.TEXTURE_2D,
      context.TEXTURE_MAG_FILTER,
      context.LINEAR
    )
    context.texParameteri(
      context.TEXTURE_2D,
      context.TEXTURE_WRAP_S,
      context.CLAMP_TO_EDGE
    )
    context.texParameteri(
      context.TEXTURE_2D,
      context.TEXTURE_WRAP_T,
      context.CLAMP_TO_EDGE
    )
    context.texImage2D(
      context.TEXTURE_2D,
      0,
      context.RGBA,
      1,
      1,
      0,
      context.RGBA,
      context.UNSIGNED_BYTE,
      new Uint8Array([238, 246, 250, 255])
    )
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
      uniform sampler2D uScene;
      uniform vec4 uSceneBounds;
      uniform float uHasScene;
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
        vec2 sceneUv = uSceneBounds.xy + uv * uSceneBounds.zw;
        vec2 refraction = vec2(
          sin((uv.y + fogNoise * 0.12) * 13.0 + t) + pointerLens * (pointer.x - p.x),
          cos((uv.x - fogNoise * 0.08) * 9.0 - t * 0.8) + pointerLens * (pointer.y - p.y)
        ) * vec2(0.0048, 0.0085);
        float chroma = 0.0022 + pointerLens * 0.0016;
        vec3 refracted = vec3(
          texture(uScene, clamp(sceneUv + refraction + vec2(chroma, 0.0), 0.001, 0.999)).r,
          texture(uScene, clamp(sceneUv + refraction, 0.001, 0.999)).g,
          texture(uScene, clamp(sceneUv + refraction - vec2(chroma, 0.0), 0.001, 0.999)).b
        );
        vec3 colour = mix(vec3(0.91, 0.96, 0.99), refracted, uHasScene * 0.94);
        colour = mix(colour, vec3(0.05, 0.88, 0.98), cyan * 0.18);
        colour = mix(colour, vec3(0.46, 0.24, 0.98), violet * 0.12);
        colour = mix(colour, vec3(1.0, 0.36, 0.08), peach * 0.24);
        colour += glint * vec3(0.78, 0.94, 1.0) * 0.055;
        colour += lensEdge * vec3(0.36, 0.74, 1.0) * pointerLens * 0.09;
        colour += arcGlow * vec3(0.03, 0.23, 0.38) * 0.30;
        colour += radialTicks * radialMask * vec3(0.10, 0.86, 0.98) * 0.14;
        colour = mix(colour, vec3(1.0, 0.32, 0.055), lightFog * 0.22);
        colour += vec3(1.0, 0.88, 0.72) * lightFog * 0.07;
        float alpha = mix(0.025, 0.16, uHasScene) + cyan * 0.018 + violet * 0.014 + peach * 0.038;
        alpha += lightFog * 0.045;
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
    if (!vertices) {
      this.context.deleteProgram(program)
      throw new Error("Unable to create liquid glass buffer")
    }
    this.vertexBuffer = vertices
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
    if (!document.hidden && timestamp - this.lastDrawAt >= 1000 / 30) {
      this.lastDrawAt = timestamp
      this.context.useProgram(this.program)
      this.captureScene()
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
      this.context.uniform1i(this.sceneLocation, 0)
      this.context.drawArrays(this.context.TRIANGLES, 0, 6)
    }
    this.frame = requestAnimationFrame(this.render)
  }

  private captureScene() {
    const source = this.sourceCanvas
    let hasScene = 0
    if (source?.width && source.height && this.sceneTexture) {
      try {
        this.context.activeTexture(this.context.TEXTURE0)
        this.context.bindTexture(this.context.TEXTURE_2D, this.sceneTexture)
        this.context.pixelStorei(this.context.UNPACK_FLIP_Y_WEBGL, true)
        this.context.texImage2D(
          this.context.TEXTURE_2D,
          0,
          this.context.RGBA,
          this.context.RGBA,
          this.context.UNSIGNED_BYTE,
          source
        )
        hasScene = 1
      } catch {
        // Cross-origin-tainted scenes retain the translucent CSS fallback.
      }
    }
    const parentRect = this.canvas.getBoundingClientRect()
    const sourceRect = source?.getBoundingClientRect()
    if (sourceRect?.width && sourceRect.height) {
      this.context.uniform4f(
        this.sceneBoundsLocation,
        (parentRect.left - sourceRect.left) / sourceRect.width,
        (sourceRect.bottom - parentRect.bottom) / sourceRect.height,
        parentRect.width / sourceRect.width,
        parentRect.height / sourceRect.height
      )
    } else {
      this.context.uniform4f(this.sceneBoundsLocation, 0, 0, 1, 1)
    }
    this.context.uniform1f(this.hasSceneLocation, hasScene)
    this.parent.classList.toggle("optical-glass-active", hasScene === 1)
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
    if (this.vertexBuffer) this.context.deleteBuffer(this.vertexBuffer)
    this.context.deleteProgram(this.program)
    if (this.sceneTexture) this.context.deleteTexture(this.sceneTexture)
    this.canvas.remove()
  }
}
