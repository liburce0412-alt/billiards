import {
  AdditiveBlending,
  BackSide,
  Group,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
} from "three"
import { R } from "../model/physics/constants"

const vertexShader = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform vec2 uViewport;
  varying vec3 vDirection;

  float ribbon(vec2 p, float offset, float frequency, float width) {
    float curve = offset + sin(p.x * frequency + uTime * 0.055) * 0.12;
    return exp(-pow(abs(p.y - curve) / width, 2.0));
  }

  float line(float value, float width) {
    return 1.0 - smoothstep(0.0, width, abs(value));
  }

  void main() {
    vec3 direction = normalize(vDirection);
    vec2 uv = vec2(
      atan(direction.y, direction.x) / 6.2831853 + 0.5,
      asin(direction.z) / 3.1415926 + 0.5
    );
    vec2 p = (uv - 0.5) * vec2(2.65, 2.0);
    p.x += sin(p.y * 2.1) * 0.08;

    vec3 colour = mix(
      vec3(0.65, 0.74, 0.83),
      vec3(0.9, 0.94, 0.97),
      smoothstep(-0.55, 0.52, p.y)
    );

    float cyan = ribbon(p, -0.20, 2.9, 0.19);
    float violet = ribbon(p + vec2(0.34, 0.0), 0.18, 3.7, 0.24);
    float peach = ribbon(p - vec2(0.42, 0.0), 0.43, 2.25, 0.28);
    colour = mix(colour, vec3(0.35, 0.86, 0.92), cyan * 0.22);
    colour = mix(colour, vec3(0.54, 0.43, 0.94), violet * 0.14);
    colour = mix(colour, vec3(1.0, 0.67, 0.49), peach * 0.11);

    float facetA = line(fract((p.x + p.y * 0.72) * 0.86) - 0.5, 0.012);
    float facetB = line(fract((p.x - p.y * 1.08) * 0.62) - 0.5, 0.009);
    float horizon = line(p.y + 0.47, 0.018);
    colour += vec3(0.72, 0.86, 0.96) * (facetA * 0.07 + facetB * 0.05);
    colour += vec3(0.9, 0.96, 1.0) * horizon * 0.12;

    float halo = exp(-dot(p - vec2(-0.36, -0.17), p - vec2(-0.36, -0.17)) * 3.2);
    colour += vec3(0.25, 0.85, 0.94) * halo * 0.08;

    float aspect = max(1.0, uViewport.x / max(uViewport.y, 1.0));
    float vignette = smoothstep(1.72, 0.24, length(p * vec2(0.72 / aspect, 0.74)));
    colour *= mix(0.91, 1.03, vignette);
    colour = min(colour, vec3(0.94));

    gl_FragColor = vec4(colour, 1.0);
  }
`

const causticVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const causticFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  varying vec2 vUv;

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
    vec2 p = (vUv - 0.5) * 2.0;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    vec2 q = p * 3.2;
    float n1 = noise(q * 0.82 + vec2(uTime * 0.12, -uTime * 0.08));
    float n2 = noise(q * 1.7 + vec2(-uTime * 0.09, uTime * 0.15));
    float fieldA = sin(q.x * 2.15 + sin(q.y * 1.42 + uTime * 0.22) * 1.7);
    fieldA += sin(q.y * 2.48 + sin(q.x * 1.18 - uTime * 0.16) * 1.9);
    float fieldB = sin((q.x + q.y) * 1.72 + n1 * 3.4 - uTime * 0.18);
    fieldB += sin((q.x - q.y) * 1.54 - n2 * 3.1 + uTime * 0.14);
    float web = 1.0 - smoothstep(0.05, 0.31, abs(fieldA) * 0.5);
    float webB = 1.0 - smoothstep(0.035, 0.22, abs(fieldB) * 0.5);
    web = pow(max(web, webB * 0.78), 2.0);
    float shards = pow(max(0.0, sin(angle * 11.0 + n2 * 4.0)), 14.0);
    float falloff = 1.0 - smoothstep(0.08, 0.94, radius);
    float innerClear = smoothstep(0.12, 0.27, radius);
    float caustic = web * 0.82 + shards * 0.18;
    float rainbowCurve = p.y + 0.16 + p.x * 0.34;
    rainbowCurve += sin(p.x * 7.0 + uTime * 0.17) * 0.045;
    float rainbowBand = exp(-pow(rainbowCurve / 0.072, 2.0));
    rainbowBand *= exp(-dot(p - vec2(0.16, -0.18), p - vec2(0.16, -0.18)) * 5.8);
    float spectral = smoothstep(-0.18, 0.46, p.x - p.y * 0.28);
    vec3 whiteWater = vec3(0.93, 1.0, 1.0);
    vec3 cyan = vec3(0.04, 0.94, 1.0);
    vec3 violet = vec3(0.55, 0.16, 1.0);
    vec3 gold = vec3(1.0, 0.72, 0.18);
    vec3 rainbow = mix(cyan, violet, spectral);
    rainbow = mix(rainbow, gold, smoothstep(0.66, 1.0, spectral));
    vec3 colour = mix(whiteWater, rainbow, min(1.0, rainbowBand * 1.18));
    float asymmetric = 0.28 + smoothstep(-0.76, 0.64, -p.x + p.y * 0.18) * 0.72;
    float alpha = falloff * innerClear * (caustic * 0.84 + rainbowBand * 0.66);
    alpha *= asymmetric;
    gl_FragColor = vec4(colour, alpha * uOpacity);
  }
`

const rainbowFragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    p.x -= 0.1;
    p.y -= 0.1;
    p.y += p.x * 0.31 + sin(p.x * 6.0 + uTime * 0.17) * 0.045;
    float stripe = exp(-pow(p.y / 0.065, 2.0));
    float falloff = exp(-dot(p, p) * 3.8);
    float spectral = smoothstep(-0.52, 0.58, p.x);
    vec3 cyan = vec3(0.04, 0.94, 1.0);
    vec3 violet = vec3(0.56, 0.14, 1.0);
    vec3 gold = vec3(1.0, 0.72, 0.16);
    vec3 colour = mix(cyan, violet, spectral);
    colour = mix(colour, gold, smoothstep(0.65, 1.0, spectral));
    gl_FragColor = vec4(colour, stripe * falloff * 0.58);
  }
`

export class SpectraEnvironment {
  readonly root = new Group()

  readonly material = new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uViewport: { value: new Vector2(1, 1) },
    },
    vertexShader,
    fragmentShader,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  })

  readonly mesh = new Mesh(new SphereGeometry(R * 760, 48, 24), this.material)

  private readonly causticMaterial = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.72 } },
    vertexShader: causticVertexShader,
    fragmentShader: causticFragmentShader,
    transparent: true,
    blending: NormalBlending,
    depthWrite: false,
    toneMapped: false,
  })

  private readonly caustic = new Mesh(
    new PlaneGeometry(R * 18, R * 18),
    this.causticMaterial
  )

  private readonly causticHaloMaterial = (() => {
    const material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.19 } },
      vertexShader: causticVertexShader,
      fragmentShader: causticFragmentShader,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
    return material
  })()

  private readonly causticHalo = new Mesh(
    new PlaneGeometry(R * 24, R * 24),
    this.causticHaloMaterial
  )

  private readonly rainbowMaterial = new ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: causticVertexShader,
    fragmentShader: rainbowFragmentShader,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })

  private readonly rainbow = new Mesh(
    new PlaneGeometry(R * 13, R * 8),
    this.rainbowMaterial
  )

  constructor() {
    this.root.name = "spectra-environment"
    this.mesh.name = "spectra-environment-dome"
    this.mesh.renderOrder = -10_000
    this.mesh.frustumCulled = false
    this.caustic.name = "spectra-cue-caustic"
    this.caustic.position.z = R * 0.08
    this.caustic.renderOrder = 2
    this.causticHalo.name = "spectra-cue-caustic-halo"
    this.causticHalo.position.z = R * 0.06
    this.causticHalo.renderOrder = 1
    this.causticHalo.scale.set(1.0, 0.72, 1.0)
    this.rainbow.name = "spectra-cue-rainbow"
    this.rainbow.position.z = R * 0.11
    this.rainbow.renderOrder = 3
    this.root.add(this.mesh, this.causticHalo, this.caustic, this.rainbow)
  }

  update(
    elapsed: number,
    width: number,
    height: number,
    cueX: number,
    cueY: number
  ): void {
    this.material.uniforms.uTime.value += Math.min(Math.max(elapsed, 0), 0.1)
    this.material.uniforms.uViewport.value.set(width, height)
    this.causticMaterial.uniforms.uTime.value =
      this.material.uniforms.uTime.value
    this.causticHaloMaterial.uniforms.uTime.value =
      this.material.uniforms.uTime.value + 4.7
    this.rainbowMaterial.uniforms.uTime.value =
      this.material.uniforms.uTime.value
    this.caustic.position.x = cueX
    this.caustic.position.y = cueY
    this.caustic.rotation.z = this.material.uniforms.uTime.value * 0.045
    this.causticHalo.position.x = cueX
    this.causticHalo.position.y = cueY
    this.causticHalo.rotation.z = -this.material.uniforms.uTime.value * 0.024
    this.rainbow.position.x = cueX - R * 0.8
    this.rainbow.position.y = cueY - R * 0.65
    this.rainbow.rotation.z = -0.13
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
    this.caustic.geometry.dispose()
    this.causticMaterial.dispose()
    this.causticHalo.geometry.dispose()
    this.causticHaloMaterial.dispose()
    this.rainbow.geometry.dispose()
    this.rainbowMaterial.dispose()
  }
}
