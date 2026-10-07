import { Mesh, ShaderMaterial, SphereGeometry } from "three"
import { R } from "../model/physics/constants"
import { EnvironmentStyle } from "./environmentstyle"
import { RenderQualityProfile } from "./renderquality"

const noiseFunctions = /* glsl */ `
  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float noise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
      mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)), f.x),
      mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float value = 0.0, weight = 0.5;
    for (int i=0; i<4; i++) {
      value += noise(p) * weight;
      p = p * 2.07 + vec3(13.2,7.1,3.8);
      weight *= 0.5;
    }
    return value;
  }
`

export const domeFragmentShader = /* glsl */ `
  precision highp float;
  uniform vec3 uZenith, uHorizon, uAccent, uStarTint;
  uniform float uTime, uStars, uClouds, uTheme;
  varying vec3 vDirection;
  ${noiseFunctions}
  void main() {
    vec3 d = normalize(vDirection);
    vec2 uv = vec2(atan(d.y,d.x)/6.2831853+0.5, asin(d.z)/3.1415926+0.5);
    vec3 colour = mix(uHorizon,uZenith,smoothstep(-0.12,0.75,d.z));
    vec2 cell = floor(uv*vec2(1600.0,800.0));
    vec2 centre = fract(uv*vec2(1600.0,800.0))-0.5;
    float star = step(0.9968,hash(vec3(cell,2.0))) * exp(-dot(centre,centre)*32.0);
    colour += uStarTint * star * uStars * 1.6;

    if (uTheme > 0.5 && uTheme < 1.5) {
      // Oblique Milky Way: bright star fields separated by a dark dust lane.
      float beltDistance = d.z + d.x*0.32 - 0.12;
      float belt = exp(-pow(beltDistance/0.16,2.0));
      float clouds = fbm(d*9.0);
      float dust = smoothstep(0.33,0.7,fbm(d*18.0+4.0));
      colour += mix(vec3(0.11,0.15,0.38),vec3(0.58,0.39,0.32),clouds) * belt * (0.3+clouds);
      colour *= 1.0-belt*dust*0.75;
      colour += vec3(0.5,0.7,1.0)*star*belt*2.0;
    } else if (uTheme > 1.5 && uTheme < 2.5) {
      // A stellar nursery: broad emission lobes, branching dust and hot cores.
      vec3 p = d*3.4 + vec3(uTime*0.002,0.0,0.0);
      float n = fbm(p + fbm(p*1.7)*1.8);
      float plume = smoothstep(0.3,0.72,n);
      float filaments = pow(fbm(p*5.0),3.0);
      colour = mix(colour, mix(vec3(0.08,0.3,0.52),vec3(0.7,0.2,0.38),n),plume*0.85);
      colour += vec3(0.58,0.27,0.15)*filaments*1.2;
      float core = pow(max(dot(d,normalize(vec3(-0.35,1.0,0.26))),0.0),250.0);
      colour += vec3(1.0,0.62,0.3)*core*0.8;
    } else if (uTheme > 2.5 && uTheme < 3.5) {
      // Multiple high-altitude, pleated aurora curtains, never a flat floor decal.
      for (int i=0; i<3; i++) {
        float phase = float(i)*1.8;
        float baseline = -0.02+0.045*float(i)+0.035*sin(uv.x*19.0+phase+uTime*0.06);
        float height = d.z-baseline;
        float curtain = exp(-abs(height)*6.0)*smoothstep(-0.035,0.02,height);
        float pleats = 0.45+0.55*pow(sin(uv.x*310.0+phase+uTime*0.1),2.0);
        vec3 aurora = mix(vec3(0.08,0.85,0.53),vec3(0.39,0.17,0.73),clamp(height*3.5,0.0,1.0));
        colour += aurora*curtain*pleats*0.5;
      }
    } else if (uTheme > 3.5 && uTheme < 4.5) {
      // Sunlit cloud banks below the floating temple, with shaded billows.
      float cloud = fbm(d*5.0+vec3(uTime*0.003,0,0));
      float layer = 1.0-smoothstep(-0.22,0.22,d.z);
      vec3 clouds = mix(vec3(0.47,0.64,0.74),vec3(1.0,0.94,0.8),smoothstep(0.25,0.72,cloud));
      colour = mix(colour,clouds,layer*0.92);
    } else if (uTheme > 4.5 && uTheme < 5.5) {
      // Water column, attenuated sunlight and suspended particles; no stars.
      colour = mix(vec3(0.006,0.045,0.08),vec3(0.025,0.31,0.36),smoothstep(-0.3,0.8,d.z));
      float rays = pow(0.5+0.5*sin(uv.x*78.0+sin(uv.x*21.0)*2.0+uTime*0.04),12.0);
      colour += vec3(0.06,0.28,0.26)*rays*smoothstep(-0.1,0.8,d.z)*0.5;
    }
    gl_FragColor = vec4(colour,1.0);
  }
`

export function backdropTheme(id: EnvironmentStyle["id"]): number {
  return {
    spectra: 0,
    galaxy: 1,
    nebula: 2,
    "aurora-hall": 3,
    "sky-temple": 4,
    "abyss-palace": 5,
    "lunar-observatory": 6,
    club: 7,
  }[id]
}

const planetVertex = /* glsl */ `
  varying vec3 vSurface;
  void main() {
    vSurface = normalize(position);
    gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);
  }
`
const earthFragment = /* glsl */ `
  precision highp float;
  varying vec3 vSurface;
  ${noiseFunctions}
  void main() {
    vec3 n=normalize(vSurface);
    float terrain=fbm(n*4.8+vec3(2.7,7.3,1.2));
    float land=smoothstep(0.49,0.53,terrain);
    vec3 ocean=mix(vec3(0.025,0.09,0.22),vec3(0.05,0.3,0.55),terrain);
    vec3 ground=mix(vec3(0.08,0.24,0.12),vec3(0.48,0.39,0.21),smoothstep(0.53,0.72,terrain));
    vec3 colour=mix(ocean,ground,land);
    float cloud=smoothstep(0.49,0.7,fbm(n*15.0+vec3(9,1,3)));
    colour=mix(colour,vec3(0.94,0.97,1.0),cloud*0.9);
    colour=mix(colour,vec3(0.88,0.95,1.0),smoothstep(0.86,0.98,abs(n.z)));
    float sun=max(dot(n,normalize(vec3(-0.6,-1.0,0.7))),0.0);
    colour*=0.16+sun*1.15;
    float rim=pow(1.0-abs(n.y),3.0);
    colour+=vec3(0.08,0.3,0.65)*rim*0.42;
    gl_FragColor=vec4(colour,1.0);
  }
`

export function createCelestialBody(
  style: EnvironmentStyle,
  quality: RenderQualityProfile
): Mesh | undefined {
  if (style.id !== "lunar-observatory") return undefined
  const material = new ShaderMaterial({
    vertexShader: planetVertex,
    fragmentShader: earthFragment,
    toneMapped: false,
  })
  const mesh = new Mesh(
    new SphereGeometry(
      R * 40,
      quality.name === "low" ? 16 : 48,
      quality.name === "low" ? 12 : 32
    ),
    material
  )
  mesh.name = "lunar-earth-with-continents-and-clouds"
  mesh.position.set(R * 65, R * 330, R * 40)
  return mesh
}
