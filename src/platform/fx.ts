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

void main() {
  vec2 uv = gl_FragCoord.xy / max(u_resolution.xy, vec2(1.0));
  vec2 p = (uv - 0.5) * vec2(u_resolution.x / u_resolution.y, 1.0);
  float t = u_time * 0.055 * u_motion;
  vec2 pointer = (u_pointer - 0.5) * 0.28;
  float field = fbm(p * 2.2 + vec2(t, -t * 0.7) + pointer);
  float ribbon = sin((p.x + field * 0.48) * 7.0 - t * 4.0) * 0.5 + 0.5;
  ribbon = smoothstep(0.45, 0.9, ribbon) * smoothstep(0.05, 0.95, uv.y);
  vec3 paper = vec3(0.972, 0.978, 0.996);
  vec3 cyan = vec3(0.20, 0.88, 0.92);
  vec3 violet = vec3(0.48, 0.30, 0.98);
  vec3 peach = vec3(1.0, 0.66, 0.48);
  vec3 color = mix(cyan, violet, smoothstep(0.2, 0.85, field));
  color = mix(color, peach, smoothstep(0.68, 0.98, field + p.x * 0.22));
  float vignette = smoothstep(1.05, 0.16, length(p * vec2(0.88, 1.1)));
  float alpha = (0.08 + ribbon * 0.24 + field * 0.08) * vignette;
  outColor = vec4(mix(paper, color, alpha), 1.0);
}
`

export function mountSpectraFx(
  canvas: HTMLCanvasElement,
  options: { quality?: "low" | "balanced" | "high"; interactive?: boolean } = {}
): FxHandle {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches
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
  gl.useProgram(program)
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const point = { x: 0.5, y: 0.5 }
  let frame = 0
  let disposed = false
  let visible = !document.hidden
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
    if (disposed) return
    resize()
    gl.uniform2f(resolution, canvas.width, canvas.height)
    gl.uniform1f(time, now / 1000)
    gl.uniform2f(pointer, point.x, point.y)
    gl.uniform1f(motion, reduceMotion || quality === "low" ? 0 : 1)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    if (visible && !reduceMotion && quality !== "low") {
      frame = requestAnimationFrame(render)
    }
  }
  const onPointer = (event: PointerEvent) => {
    if (!options.interactive) return
    const bounds = canvas.getBoundingClientRect()
    point.x = (event.clientX - bounds.left) / Math.max(1, bounds.width)
    point.y = 1 - (event.clientY - bounds.top) / Math.max(1, bounds.height)
  }
  const onVisibility = () => {
    visible = !document.hidden
    cancelAnimationFrame(frame)
    if (visible) frame = requestAnimationFrame(render)
  }
  canvas.addEventListener("pointermove", onPointer, { passive: true })
  document.addEventListener("visibilitychange", onVisibility)
  frame = requestAnimationFrame(render)
  return {
    dispose() {
      disposed = true
      cancelAnimationFrame(frame)
      canvas.removeEventListener("pointermove", onPointer)
      document.removeEventListener("visibilitychange", onVisibility)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
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
  if (!vertexShader || !fragmentShader) return null
  const program = gl.createProgram()
  if (!program) return null
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
