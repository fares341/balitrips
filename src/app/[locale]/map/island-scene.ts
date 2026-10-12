/**
 * The 3D island, as a plain three.js scene.
 *
 * Ported from a standalone prototype. Deliberately imperative rather than
 * react-three-fiber: the prototype is 300 lines of hand-written GLSL for the
 * water, sky and lakes, and rewriting that into declarative components would
 * have risked the exact thing that makes it look good while buying nothing.
 * React owns the surrounding UI; this owns the canvas.
 *
 * REPLACES a 10.9 MB Draco-compressed GLB of the same island. This is 737 kB:
 * a 402 kB gzipped uint16 heightmap and a 336 kB colour texture, from which
 * the mesh is built at runtime. Same geography -- the silhouettes match --
 * for 7% of the bytes, and with a real ocean, reef foam and a volcano plume
 * the GLB never had.
 *
 * The heightmap also removes the need to raycast for pin heights. `sampleH`
 * interpolates a height at any point for the cost of four array reads, where
 * the GLB needed a ray fired at ~800k triangles per pin.
 */

import {
  ACESFilmicToneMapping,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Clock,
  Color,
  DataTexture,
  DataUtils,
  DirectionalLight,
  Fog,
  Group,
  HalfFloatType,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  RedFormat,
  Raycaster,
  SRGBColorSpace,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  TextureLoader,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  type Object3D,
  type Texture,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export interface IslandMeta {
  gw: number
  gh: number
  w: number
  d: number
  hmin: number
  hmax: number
  lakes: [number, number, number][]
  volcano: [number, number]
}

export interface IslandPin {
  id: string
  slug: string
  /** 0-1 across MAP_BBOX, from projectLon(). */
  u: number
  /** 0-1 down MAP_BBOX, from projectLat(). */
  v: number
  color: string
}

export interface IslandHandle {
  /** Terrain height at a world x/z. */
  sampleH(x: number, z: number): number
  setPins(pins: readonly IslandPin[]): void
  dispose(): void
}

/**
 * Bump when any of the three files below is replaced.
 *
 * Caddy serves these `immutable` for a year, which is only safe because the
 * URL changes when the content does. Replace a model without touching this
 * and every returning visitor keeps the old island until their cache expires.
 */
const ISLAND_VERSION = '1'

const HEIGHT_URL = `/map/island-height.gz?v=${ISLAND_VERSION}`
// WebP, not JPEG: 198 kB against 336 kB for a texture nobody inspects at
// 1:1. AVIF would be 126 kB but Safari only took it in 16.4, and a texture
// that fails to decode is a broken island rather than a slower one.
const TEX_URL = `/map/island-tex.webp?v=${ISLAND_VERSION}`
const META_URL = `/map/island-meta.json?v=${ISLAND_VERSION}`

/**
 * `noUncheckedIndexedAccess` is on, so every typed-array read is
 * `number | undefined`. These keep the hot loops readable instead of
 * scattering non-null assertions through the geometry build.
 */
function at(a: Float32Array, i: number): number {
  return a[i] ?? 0
}

async function loadHeights(meta: IslandMeta): Promise<Float32Array> {
  const response = await fetch(HEIGHT_URL)
  if (!response.ok) throw new Error(`heightmap ${response.status}`)
  const gz = await response.arrayBuffer()

  // The file is stored gzipped and decompressed in the browser rather than
  // served with Content-Encoding: gzip, so it survives any proxy that decides
  // to re-encode, and so the 402 kB on the wire is guaranteed rather than
  // dependent on server configuration.
  const stream = new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))
  const buf = await new Response(stream).arrayBuffer()

  const q = new Uint16Array(buf)
  const out = new Float32Array(q.length)
  const k = (meta.hmax - meta.hmin) / 65535
  for (let i = 0; i < q.length; i++) out[i] = meta.hmin + (q[i] ?? 0) * k
  return out
}

const NOISE_GLSL = `
  float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=.5; } return s; }`

export async function createIslandScene(
  container: HTMLElement,
  options: { onSelect?: (slug: string) => void; onReady?: () => void } = {},
): Promise<IslandHandle> {
  const meta = (await (await fetch(META_URL)).json()) as IslandMeta
  const heights = await loadHeights(meta)

  const GW = meta.gw
  const GH = meta.gh
  const W = meta.w
  const D = meta.d

  function sampleH(x: number, z: number): number {
    const u = ((x + W / 2) / W) * (GW - 1)
    const v = ((z + D / 2) / D) * (GH - 1)
    if (u < 0 || v < 0 || u > GW - 1 || v > GH - 1) return -6
    const x0 = Math.floor(u)
    const z0 = Math.floor(v)
    const x1 = Math.min(x0 + 1, GW - 1)
    const z1 = Math.min(z0 + 1, GH - 1)
    const fx = u - x0
    const fz = v - z0
    const g = (i: number, j: number) => at(heights, j * GW + i)
    return (
      (g(x0, z0) * (1 - fx) + g(x1, z0) * fx) * (1 - fz) +
      (g(x0, z1) * (1 - fx) + g(x1, z1) * fx) * fz
    )
  }

  // ---------- renderer / scene ----------
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  // Capped at 2: a phone at DPR 3 renders nine times the pixels for a
  // difference nobody can see on water, and it is the biggest mobile lever.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.touchAction = 'none'
  renderer.domElement.style.cursor = 'grab'
  container.appendChild(renderer.domElement)

  const scene = new Scene()
  const HORIZON = new Color(0xf2c48a)
  const ZENITH = new Color(0x0d2a52)
  scene.fog = new Fog(0x9fb4c8, 140, 420)

  const camera = new PerspectiveCamera(38, 1, 0.1, 2000)
  camera.position.set(0, 74, 94)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 25
  controls.maxDistance = 190
  controls.maxPolarAngle = Math.PI * 0.46
  controls.autoRotate = true
  controls.autoRotateSpeed = 0.35
  controls.enablePan = false

  const SUN = new Vector3(-0.55, 0.32, -0.77).normalize()

  // ---------- sky ----------
  const sky = new Mesh(
    new SphereGeometry(900, 48, 24),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { sun: { value: SUN }, hor: { value: HORIZON }, zen: { value: ZENITH } },
      vertexShader: `varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `uniform vec3 sun, hor, zen; varying vec3 vd;
    void main(){ vec3 d = normalize(vd); float t = clamp(d.y*1.6,0.,1.);
      vec3 c = mix(hor, zen, pow(t,0.55));
      if(d.y<0.) c = mix(hor*0.8, vec3(0.03,0.1,0.22), clamp(-d.y*4.,0.,1.));
      float s = max(dot(d,sun),0.);
      c += vec3(1.,0.75,0.4)*pow(s,8.)*0.55 + vec3(1.,0.9,0.7)*pow(s,400.)*6.;
      gl_FragColor = vec4(c,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
    }),
  )
  scene.add(sky)

  // ---------- lights ----------
  scene.add(new HemisphereLight(0xcfe6ff, 0x2a4a3a, 0.9))
  const sunLight = new DirectionalLight(0xffd9a8, 2.4)
  sunLight.position.copy(SUN).multiplyScalar(100)
  scene.add(sunLight)

  // ---------- terrain ----------
  const tex: Texture = await new TextureLoader().loadAsync(TEX_URL)
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy()

  const geo = new BufferGeometry()
  const pos = new Float32Array(GW * GH * 3)
  const uvs = new Float32Array(GW * GH * 2)
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const k = j * GW + i
      pos[k * 3] = -W / 2 + (W * i) / (GW - 1)
      pos[k * 3 + 1] = at(heights, k)
      pos[k * 3 + 2] = -D / 2 + (D * j) / (GH - 1)
      uvs[k * 2] = i / (GW - 1)
      uvs[k * 2 + 1] = 1 - j / (GH - 1)
    }
  }
  const idx = new Uint32Array((GW - 1) * (GH - 1) * 6)
  let p = 0
  for (let j = 0; j < GH - 1; j++) {
    for (let i = 0; i < GW - 1; i++) {
      const a = j * GW + i
      const b = a + 1
      const c = a + GW
      const d = c + 1
      idx[p++] = a
      idx[p++] = c
      idx[p++] = b
      idx[p++] = b
      idx[p++] = c
      idx[p++] = d
    }
  }
  geo.setAttribute('position', new BufferAttribute(pos, 3))
  geo.setAttribute('uv', new BufferAttribute(uvs, 2))
  geo.setIndex(new BufferAttribute(idx, 1))
  geo.computeVertexNormals()

  const terrainMat = new MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: 0xffffff,
    emissiveIntensity: 0.38,
    roughness: 0.95,
    metalness: 0,
  })
  const terrain = new Mesh(geo, terrainMat)
  scene.add(terrain)

  const seabed = new Mesh(new PlaneGeometry(2000, 2000), new MeshBasicMaterial({ color: 0x0a2a4e }))
  seabed.rotation.x = -Math.PI / 2
  seabed.position.y = -5.9
  scene.add(seabed)

  // ---------- water ----------
  // Depth is read from the heightmap in the shader, which is what produces the
  // turquoise shallows and the reef-break foam following the real coastline.
  const hData = new Uint16Array(GW * GH)
  for (let i = 0; i < hData.length; i++) hData[i] = DataUtils.toHalfFloat(at(heights, i))
  const hTex = new DataTexture(hData, GW, GH, RedFormat, HalfFloatType)
  hTex.minFilter = LinearFilter
  hTex.magFilter = LinearFilter
  hTex.needsUpdate = true

  const waterMat = new ShaderMaterial({
    transparent: true,
    uniforms: {
      t: { value: 0 },
      hMap: { value: hTex },
      bounds: { value: new Vector4(-W / 2, -D / 2, W, D) },
      sun: { value: SUN },
      hor: { value: HORIZON },
      zen: { value: ZENITH },
    },
    vertexShader: `varying vec3 vw; void main(){ vec4 w = modelMatrix*vec4(position,1.); vw = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float t; uniform sampler2D hMap; uniform vec4 bounds; uniform vec3 sun, hor, zen; varying vec3 vw;
    ${NOISE_GLSL}
    float wave(vec2 p){
      vec2 q = p + 0.8*vec2(fbm(p*0.15 + t*0.05), fbm(p*0.15 + 7.3 - t*0.04));
      return 0.22*sin(dot(q,vec2(0.9,0.4))*1.3 + t*1.1) + 0.16*sin(dot(q,vec2(-0.3,1.0))*2.3 + t*1.5)
           + 0.8*fbm(q*1.3 + vec2(t*0.22, t*0.15)) + 0.35*fbm(q*4.1 - vec2(t*0.35, -t*0.2));
    }
    void main(){
      vec2 uv = (vw.xz - bounds.xy)/bounds.zw;
      float th = -6.;
      if(uv.x>0. && uv.y>0. && uv.x<1. && uv.y<1.) th = texture2D(hMap, uv).r;
      float depth = -th;
      if(depth < -0.02) discard;
      vec2 p = vw.xz; float e = 0.05;
      float h0 = wave(p), hx = wave(p+vec2(e,0.)), hz = wave(p+vec2(0.,e));
      float dist = length(cameraPosition - vw);
      float strength = 0.08 * mix(1., 0.15, smoothstep(30., 200., dist));
      vec3 n = normalize(vec3(-(hx-h0)/e*strength, 1., -(hz-h0)/e*strength));
      vec3 v = normalize(cameraPosition - vw);
      float fres = 0.02 + 0.98*pow(1.-max(dot(n,v),0.),5.);
      vec3 r = reflect(-v,n);
      vec3 skyc = mix(hor, zen, pow(clamp(r.y*1.6,0.,1.),0.55));
      skyc += vec3(1.,.75,.4)*pow(max(dot(r,sun),0.),8.)*0.5;
      float spec = pow(max(dot(r,sun),0.), 280.)*5. + pow(max(dot(r,sun),0.), 30.)*0.25;
      vec3 shallow = vec3(0.16,0.78,0.78), mid = vec3(0.02,0.42,0.62), deep = vec3(0.012,0.09,0.24);
      vec3 col = mix(shallow, mid, smoothstep(0.,1.6,depth));
      col = mix(col, deep, smoothstep(1.4,5.,depth));
      col *= 0.85 + 0.3*max(dot(n,sun),0.);
      col = mix(col, skyc, fres*0.75) + vec3(1.,.85,.6)*spec;
      float alpha = mix(0.28, 0.97, smoothstep(0.05, 3.2, depth));
      float fn = fbm(p*3. + vec2(t*0.4,-t*0.3));
      float shore = 1. - smoothstep(0.0, 0.22 + 0.12*sin(t*1.7 + p.x*0.8 + p.y*0.6), depth + (fn-0.5)*0.15);
      float reef = smoothstep(0.55,0.8,fn) * (1.-smoothstep(0.,0.25,abs(depth-1.3))) * 0.7;
      float foam = clamp(shore + reef, 0., 1.);
      col = mix(col, vec3(0.97,0.99,1.), foam);
      alpha = max(alpha, foam*0.95);
      alpha = max(alpha, fres*0.6);
      float fogf = smoothstep(140., 440., dist);
      col = mix(col, mix(hor, vec3(0.62,0.7,0.8), 0.45), fogf);
      gl_FragColor = vec4(col, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  })
  const water = new Mesh(new PlaneGeometry(2000, 2000), waterMat)
  water.rotation.x = -Math.PI / 2
  water.renderOrder = 1
  scene.add(water)

  // ---------- crater lakes ----------
  const lakeMat = new ShaderMaterial({
    transparent: true,
    uniforms: {
      t: waterMat.uniforms.t ?? { value: 0 },
      sun: { value: SUN },
      hor: { value: HORIZON },
      zen: { value: ZENITH },
    },
    vertexShader: `varying vec3 vw; varying vec2 vu; void main(){ vu=uv; vec4 w=modelMatrix*vec4(position,1.); vw=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform float t; uniform vec3 sun,hor,zen; varying vec3 vw; varying vec2 vu; ${NOISE_GLSL}
    void main(){ float r = length(vu-0.5)*2.; if(r>1.) discard;
      vec2 p=vw.xz*4.; float e=.05; float h0=fbm(p+t*.3), hx=fbm(p+vec2(e,0.)+t*.3), hz=fbm(p+vec2(0.,e)+t*.3);
      vec3 n=normalize(vec3(-(hx-h0)/e*.05,1.,-(hz-h0)/e*.05)); vec3 v=normalize(cameraPosition-vw);
      float fres=.02+.98*pow(1.-max(dot(n,v),0.),5.); vec3 rr=reflect(-v,n);
      vec3 col=mix(vec3(.04,.38,.46), mix(hor,zen,clamp(rr.y*1.6,0.,1.)), fres*.5) + pow(max(dot(rr,sun),0.),200.)*2.;
      gl_FragColor=vec4(col, 0.78*(1.-smoothstep(.7,1.,r)));
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  })
  for (const [lx, lz, ly] of meta.lakes) {
    const lake = new Mesh(new PlaneGeometry(5.4, 4.2), lakeMat)
    lake.rotation.x = -Math.PI / 2
    lake.position.set(lx, ly, lz)
    scene.add(lake)
  }

  // ---------- soft sprite texture ----------
  function puffTexture(): CanvasTexture {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 128
    const g = c.getContext('2d')
    if (g) {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
      gr.addColorStop(0, 'rgba(255,255,255,1)')
      gr.addColorStop(0.45, 'rgba(255,255,255,0.55)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gr
      g.fillRect(0, 0, 128, 128)
    }
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }
  const puff = puffTexture()

  // ---------- volcano steam ----------
  const [vx, vz] = meta.volcano
  let peak = { x: vx, z: vz, y: -99 }
  for (let dx = -2; dx <= 2; dx += 0.25) {
    for (let dz = -2; dz <= 2; dz += 0.25) {
      const y = sampleH(vx + dx, vz + dz)
      if (y > peak.y) peak = { x: vx + dx, z: vz + dz, y }
    }
  }
  const steam: Sprite[] = []
  for (let i = 0; i < 46; i++) {
    const s = new Sprite(
      new SpriteMaterial({
        map: puff,
        color: 0xf4f0ea,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    )
    s.userData.life = Math.random()
    s.userData.seed = Math.random() * 10
    scene.add(s)
    steam.push(s)
  }

  // ---------- clouds ----------
  const clouds = new Group()
  const cloudSpots: [number, number, number][] = [
    [-70, 18, -60],
    [60, 20, -70],
    [85, 16, 10],
    [-85, 17, 25],
    [30, 22, 60],
    [-40, 21, 70],
    [0, 24, -95],
    [110, 19, -30],
  ]
  for (const [cx, cy, cz] of cloudSpots) {
    const g = new Group()
    for (let i = 0; i < 9; i++) {
      const s = new Sprite(
        new SpriteMaterial({
          map: puff,
          color: 0xfff6ec,
          transparent: true,
          depthWrite: false,
          opacity: 0.8,
        }),
      )
      const sc = 8 + Math.random() * 9
      s.scale.set(sc, sc * 0.65, 1)
      s.position.set(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 2.5,
        (Math.random() - 0.5) * 9,
      )
      g.add(s)
    }
    g.position.set(cx, cy, cz)
    clouds.add(g)
  }
  scene.add(clouds)

  // ---------- boats ----------
  const wakeTex = (() => {
    const c = document.createElement('canvas')
    c.width = 32
    c.height = 256
    const g = c.getContext('2d')
    if (g) {
      const gr = g.createLinearGradient(0, 0, 0, 256)
      gr.addColorStop(0, 'rgba(255,255,255,0.9)')
      gr.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = gr
      g.beginPath()
      g.moveTo(14, 0)
      g.lineTo(18, 0)
      g.lineTo(32, 256)
      g.lineTo(0, 256)
      g.fill()
    }
    return new CanvasTexture(c)
  })()

  const boats: Group[] = []
  const hullMat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
  let tries = 0
  while (boats.length < 9 && tries++ < 500) {
    const a = Math.random() * Math.PI * 2
    const r = 20 + Math.random() * 55
    const cx = Math.cos(a) * r
    const cz = Math.sin(a) * r * 0.75
    const dir = Math.random() * Math.PI * 2
    const len = 10
    let ok = true
    // Reject any track that would run a boat aground.
    for (let s = -1; s <= 1; s += 0.1) {
      if (sampleH(cx + Math.cos(dir) * len * s, cz + Math.sin(dir) * len * s) > -2.2) ok = false
    }
    if (!ok) continue
    const b = new Group()
    const hull = new Mesh(new BoxGeometry(0.22, 0.1, 0.55), hullMat)
    hull.position.y = 0.05
    b.add(hull)
    const wake = new Mesh(
      new PlaneGeometry(1.1, 5),
      new MeshBasicMaterial({ map: wakeTex, transparent: true, depthWrite: false, opacity: 0.7 }),
    )
    wake.rotation.x = -Math.PI / 2
    wake.position.set(0, 0.02, 2.7)
    b.add(wake)
    b.userData = { cx, cz, dir, len, ph: Math.random() * 6.28, sp: 0.05 + Math.random() * 0.05 }
    b.renderOrder = 2
    scene.add(b)
    boats.push(b)
  }

  // ---------- pins ----------
  const pinGroup = new Group()
  pinGroup.renderOrder = 3
  scene.add(pinGroup)
  const pinSprites: Sprite[] = []

  function pinTexture(color: string): CanvasTexture {
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const g = c.getContext('2d')
    if (g) {
      g.beginPath()
      g.arc(32, 32, 26, 0, Math.PI * 2)
      g.fillStyle = 'rgba(255,255,255,.95)'
      g.fill()
      g.beginPath()
      g.arc(32, 32, 19, 0, Math.PI * 2)
      g.fillStyle = color
      g.fill()
    }
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    return t
  }

  function setPins(pins: readonly IslandPin[]): void {
    for (const s of pinSprites) {
      s.material.map?.dispose()
      s.material.dispose()
      pinGroup.remove(s)
    }
    pinSprites.length = 0

    for (const pin of pins) {
      // u/v span MAP_BBOX; the heightmap spans the same bounds, so the
      // mapping is a straight linear one into the model's centred extent.
      const x = (pin.u - 0.5) * W
      const z = (pin.v - 0.5) * D
      // Sits ON the terrain, using the heightmap rather than a raycast.
      const y = Math.max(sampleH(x, z), 0) + 2.6

      const s = new Sprite(
        new SpriteMaterial({ map: pinTexture(pin.color), transparent: true, depthWrite: false }),
      )
      s.position.set(x, y, z)
      // World units on a 110-unit-wide island. At the default camera distance
      // this is roughly 25 px, which reads as a marker rather than a speck.
      s.scale.set(5.2, 5.2, 1)
      s.userData.slug = pin.slug
      pinGroup.add(s)
      pinSprites.push(s)
    }
  }

  // ---------- picking ----------
  const raycaster = new Raycaster()
  const pointer = new Vector2()
  let downAt: { x: number; y: number } | null = null

  const onPointerDown = (event: PointerEvent) => {
    controls.autoRotate = false
    downAt = { x: event.clientX, y: event.clientY }
  }

  const onPointerUp = (event: PointerEvent) => {
    // A drag is a camera move, not a click. Without this, every orbit that
    // happens to finish over a pin opens its panel.
    if (!downAt) return
    const moved = Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y)
    downAt = null
    if (moved > 6 || pinSprites.length === 0) return

    const rect = renderer.domElement.getBoundingClientRect()
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hit = raycaster.intersectObjects(pinSprites as Object3D[], false)[0]
    const slug = hit?.object.userData.slug
    if (typeof slug === 'string') options.onSelect?.(slug)
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointerup', onPointerUp)

  // ---------- resize / loop ----------
  function resize() {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) return
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    // Widen the lens on a portrait viewport, or the island is cropped rather
    // than framed — the whole point of the mobile fix.
    camera.fov = w / h < 1 ? 55 : 38
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  const clock = new Clock()
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05)
    const t = clock.elapsedTime
    const tu = waterMat.uniforms.t
    if (tu) tu.value = t

    for (const s of steam) {
      const u = s.userData as { life: number; seed: number }
      u.life += dt * 0.09
      if (u.life > 1) u.life -= 1
      const L = u.life
      s.position.set(
        peak.x + Math.sin(u.seed + L * 3) * 0.6 + L * 5.5,
        peak.y + 0.3 + L * 9,
        peak.z + Math.cos(u.seed) * 0.5 - L * 1.5,
      )
      const sc = 1.2 + L * 6
      s.scale.set(sc, sc, 1)
      s.material.opacity = Math.sin(Math.PI * Math.min(L * 1.6, 1)) * 0.75 * Math.pow(1 - L, 0.6)
    }

    for (const g of clouds.children) {
      g.position.x += dt * 0.6
      if (g.position.x > 140) g.position.x = -140
    }

    for (const b of boats) {
      const u = b.userData as {
        cx: number
        cz: number
        dir: number
        len: number
        ph: number
        sp: number
      }
      const s = Math.sin(t * u.sp + u.ph)
      const ds = Math.cos(t * u.sp + u.ph)
      b.position.set(u.cx + Math.cos(u.dir) * u.len * s, 0, u.cz + Math.sin(u.dir) * u.len * s)
      b.rotation.y = Math.atan2(-Math.cos(u.dir) * ds, -Math.sin(u.dir) * ds)
    }

    controls.update()
    renderer.render(scene, camera)
  })

  options.onReady?.()

  return {
    sampleH,
    setPins,
    dispose() {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      renderer.domElement.removeEventListener('pointerup', onPointerUp)
      controls.dispose()
      // Frees GPU memory. A map opened and closed a few times without this
      // leaks tens of megabytes and eventually loses the WebGL context.
      scene.traverse((obj: Object3D) => {
        const mesh = obj as Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = (mesh as unknown as { material?: { dispose?: () => void } }).material
        mat?.dispose?.()
      })
      tex.dispose()
      hTex.dispose()
      puff.dispose()
      wakeTex.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
