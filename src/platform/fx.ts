import {
  glassChangeEvent,
  isDarkGlass,
  readGlassPreferences,
} from "../../packages/table-tennis/src/browser/glass"

type FxHandle = { dispose(): void }

const vertexSource = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`

const fragmentSource = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_motion;
uniform float u_dark;
uniform float u_palette;
uniform float u_fluid;
uniform float u_aurora;
uniform float u_meteors;
out vec4 outColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.52;
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = mat2(1.62, 1.21, -1.21, 1.62) * p + 0.17;
    amplitude *= 0.5;
  }
  return value;
}

float fogOrb(vec2 p, vec2 center, float radius, float warp) {
  vec2 q = p - center;
  q += (fbm(p * 2.5 + warp) - 0.5) * 0.23;
  return smoothstep(radius, 0.0, length(q));
}

void main() {
  vec2 uv = gl_FragCoord.xy / max(u_resolution.xy, vec2(1.0));
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_time * 0.045;
  vec2 pointer = (u_pointer - 0.5) * vec2(0.38, 0.28);
  float field = fbm(p * 2.1 + vec2(t, -t * 0.72) + pointer);
  float cyanFog = fogOrb(p, vec2(-0.50, 0.22) + pointer * 0.3, 0.78, t);
  float violetFog = fogOrb(p, vec2(0.34, -0.27), 0.66, t + 4.0);
  float orangeFog = fogOrb(p, vec2(0.56, 0.18), 0.72, t + 8.0);
  float ribbon = sin((p.x + field * 0.42) * 6.4 - t * 3.6) * 0.5 + 0.5;
  ribbon = smoothstep(0.52, 0.92, ribbon) * smoothstep(0.02, 0.92, uv.y);
  vec3 paper = vec3(0.88, 0.94, 0.96);
  vec3 cyan = vec3(0.12, 0.84, 0.91);
  vec3 violet = vec3(0.47, 0.31, 0.98);
  vec3 orange = vec3(.94, .63, .81);
  if(u_palette > .5 && u_palette < 1.5) { cyan=vec3(.55,.58,.92); violet=vec3(.73,.40,.86); orange=vec3(.96,.67,.70); }
  if(u_palette > 1.5) { cyan=vec3(.95,.76,.51); violet=vec3(.91,.48,.49); orange=vec3(.95,.64,.34); }
  vec3 color = paper;
  color = mix(color, cyan, cyanFog * (0.23 + field * 0.12));
  color = mix(color, violet, violetFog * (0.18 + field * 0.10));
  color = mix(color, orange, orangeFog * (0.18 + ribbon * 0.13));
  float glassSweep = smoothstep(0.76, 0.98, ribbon + field * 0.22);
  color += glassSweep * vec3(0.035, 0.042, 0.055);
  float edge = smoothstep(1.25, 0.12, length(p * vec2(0.82, 1.05)));
  color = mix(paper, color, edge * mix(.65, 1., u_fluid));
  // A structured satin fold gives the glass a real silhouette to refract.
  float foldLine=sin(p.x*3.2+t*.65)*.16;
  float fold=exp(-pow((p.y-foldLine+.06)*9.,2.));
  float seam=exp(-pow((p.y-foldLine+.09)*85.,2.));
  color=mix(color,mix(cyan,violet,uv.x),fold*.13*u_fluid);
  color+=seam*.045*u_fluid;
  if(u_dark > .5) {
    vec3 night=vec3(.025,.044,.083);
    float wave=p.y + sin(p.x*3. + t)*.18 + sin(p.x*7. - t*.6)*.06;
    float curtain=exp(-pow((wave-.12-field*.15)*5.,2.));
    float folds=.45+.55*sin(p.x*17.+field*7.+t);
    vec3 fluidNight=night+mix(cyan,violet,smoothstep(-.7,.5,p.x))*curtain*folds*.32*u_aurora;
    float classicBand=exp(-pow((p.y-.1-sin(p.x*1.6+t*.18)*.035)*4.8,2.));
    vec3 classicNight=night+mix(cyan,violet,uv.x)*classicBand*.09*u_aurora;
    color=mix(classicNight,fluidNight,u_fluid);
    vec2 grid=floor(uv*vec2(160.,100.));
    float star=step(.994,hash(grid))*pow(max(0.,1.-length(fract(uv*vec2(160.,100.))-.5)*2.),6.);
    color+=star*.48;
    float phase=fract(u_time*.065*u_motion);
    vec2 meteor=uv-vec2(1.-phase*1.3,.88-phase*.45);
    float tail=exp(-abs(meteor.y-meteor.x*.35)*650.)*smoothstep(-.13,0.,meteor.x)*smoothstep(.035,0.,meteor.x);
    color+=tail*.28*u_meteors*u_motion;
  }
  outColor = vec4(color, 1.0);
}
`

export function mountSpectraFx(
  canvas: HTMLCanvasElement,
  options: {
    quality?: "low" | "balanced" | "high"
    interactive?: boolean
    reducedMotion?: boolean
    onRender?: (now: number) => void
  } = {}
): FxHandle {
  const motionMedia = matchMedia("(prefers-reduced-motion: reduce)")
  const darkMedia = matchMedia("(prefers-color-scheme: dark)")
  let preferences = readGlassPreferences()
  const motionEnabled = () =>
    preferences.materialMotion &&
    !motionMedia.matches &&
    !options.reducedMotion &&
    quality !== "low"
  const quality = options.quality ?? "high"
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    powerPreference: quality === "low" ? "low-power" : "high-performance",
  })
  if (!gl) {
    canvas.classList.add("spectra-fx--fallback")
    return { dispose() {} }
  }
  const program = createProgram(gl, vertexSource, fragmentSource)
  if (!program) {
    canvas.classList.add("spectra-fx--fallback")
    return { dispose() {} }
  }
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  )
  const position = gl.getAttribLocation(program, "a_position")
  const resolution = gl.getUniformLocation(program, "u_resolution")
  const time = gl.getUniformLocation(program, "u_time")
  const pointer = gl.getUniformLocation(program, "u_pointer")
  const motion = gl.getUniformLocation(program, "u_motion")
  const dark = gl.getUniformLocation(program, "u_dark")
  const palette = gl.getUniformLocation(program, "u_palette")
  const fluid = gl.getUniformLocation(program, "u_fluid")
  const aurora = gl.getUniformLocation(program, "u_aurora")
  const meteors = gl.getUniformLocation(program, "u_meteors")
  gl.useProgram(program)
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const point = { x: 0.5, y: 0.5 }
  let frame = 0
  let disposed = false
  let contextLost = false
  let restoredHandle: FxHandle | undefined
  let animationTime = 0
  let previousTime = performance.now()
  let visible = !document.hidden
  let intersecting = true
  let lastFrame = -Infinity
  const frameInterval = 1000 / 30
  const qualityPixelRatio = {
    low: 0.75,
    balanced: 1.1,
    high: 1.5,
  }[quality]
  const pixelRatio = Math.min(
    qualityPixelRatio,
    globalThis.devicePixelRatio || 1
  )
  const resize = () => {
    const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio))
    const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio))
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      gl.viewport(0, 0, width, height)
    }
  }
  const render = (now: number) => {
    if (disposed || contextLost) return
    if (motionEnabled())
      animationTime += Math.min(0.1, Math.max(0, now - previousTime) / 1000)
    previousTime = now
    if (now - lastFrame >= frameInterval || lastFrame < 0) {
      lastFrame = now
      resize()
      gl.uniform2f(resolution, canvas.width, canvas.height)
      gl.uniform1f(time, animationTime)
      gl.uniform2f(pointer, point.x, point.y)
      gl.uniform1f(motion, motionEnabled() ? 1 : 0)
      gl.uniform1f(dark, isDarkGlass(preferences) ? 1 : 0)
      gl.uniform1f(
        palette,
        ["lagoon", "violet", "sunrise"].indexOf(preferences.palette)
      )
      gl.uniform1f(fluid, preferences.atmosphere === "fluid" ? 1 : 0)
      gl.uniform1f(aurora, preferences.aurora ? 1 : 0)
      gl.uniform1f(meteors, preferences.meteors ? 1 : 0)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      options.onRender?.(now)
    }
    if (visible && intersecting && motionEnabled()) {
      frame = requestAnimationFrame(render)
    }
  }
  const onPointer = (event: PointerEvent) => {
    if (!options.interactive || !motionEnabled()) return
    const bounds = canvas.getBoundingClientRect()
    point.x = (event.clientX - bounds.left) / Math.max(1, bounds.width)
    point.y = 1 - (event.clientY - bounds.top) / Math.max(1, bounds.height)
  }
  const onVisibility = () => {
    visible = !document.hidden
    cancelAnimationFrame(frame)
    previousTime = performance.now()
    if (visible && intersecting && !contextLost)
      frame = requestAnimationFrame(render)
  }
  const onPreferences = () => {
    preferences = readGlassPreferences()
    lastFrame = -Infinity
    onVisibility()
  }
  const onContextLost = (event: Event) => {
    event.preventDefault()
    contextLost = true
    cancelAnimationFrame(frame)
    canvas.classList.add("spectra-fx--fallback")
  }
  const onContextRestored = () => {
    disposeCurrent()
    canvas.classList.remove("spectra-fx--fallback")
    restoredHandle = mountSpectraFx(canvas, options)
  }
  const observer = new IntersectionObserver((entries) => {
    intersecting = entries[0]?.isIntersecting ?? true
    cancelAnimationFrame(frame)
    if (visible && intersecting) frame = requestAnimationFrame(render)
  })
  observer.observe(canvas)
  globalThis.addEventListener("pointermove", onPointer, { passive: true })
  document.addEventListener("visibilitychange", onVisibility)
  window.addEventListener(glassChangeEvent, onPreferences)
  window.addEventListener("bb-glass-redraw", onPreferences)
  window.addEventListener("resize", onPreferences)
  motionMedia.addEventListener("change", onPreferences)
  darkMedia.addEventListener("change", onPreferences)
  canvas.addEventListener("webglcontextlost", onContextLost)
  canvas.addEventListener("webglcontextrestored", onContextRestored)
  frame = requestAnimationFrame(render)
  function disposeCurrent() {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(frame)
    observer.disconnect()
    globalThis.removeEventListener("pointermove", onPointer)
    document.removeEventListener("visibilitychange", onVisibility)
    window.removeEventListener(glassChangeEvent, onPreferences)
    window.removeEventListener("bb-glass-redraw", onPreferences)
    window.removeEventListener("resize", onPreferences)
    motionMedia.removeEventListener("change", onPreferences)
    darkMedia.removeEventListener("change", onPreferences)
    canvas.removeEventListener("webglcontextlost", onContextLost)
    canvas.removeEventListener("webglcontextrestored", onContextRestored)
    gl?.deleteBuffer(buffer)
    gl?.deleteProgram(program)
  }
  return {
    dispose() {
      restoredHandle?.dispose()
      disposeCurrent()
    },
  }
}

function createProgram(
  gl: WebGL2RenderingContext,
  vertex: string,
  fragment: string
) {
  const vertexShader = compile(gl, gl.VERTEX_SHADER, vertex)
  const fragmentShader = compile(gl, gl.FRAGMENT_SHADER, fragment)
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader)
    if (fragmentShader) gl.deleteShader(fragmentShader)
    return null
  }
  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    return null
  }
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }
  return program
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}
