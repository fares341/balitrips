/**
 * Work out where a latitude/longitude lands on the 3D island.
 *
 * The problem: the model's bounding box is NOT a geographic rectangle. It is
 * wherever the artist's coastline happened to stop, and its aspect (1.385)
 * does not match Bali+Nusa's true coastline aspect (~1.617). Fitting the box
 * to a lat/lon box is therefore wrong by kilometres — about 7 km at the
 * extremes, which at full zoom on the 2D map is 330 px. A pin that wrong still
 * looks plausible, which is what makes it dangerous.
 *
 * The fix: register the model's land silhouette against public/map's satellite
 * raster, which is ALREADY georeferenced by MAP_BBOX in projection.ts and is
 * what the 2D map has been projecting onto correctly all along. Solve for the
 * 4-parameter transform (scale and offset per axis) that best overlaps the two
 * land masks, then invert it.
 *
 * Deliberately CPU only — triangles are projected and scan-converted here, not
 * rendered. No GPU, no headless browser, no network, so it runs in CI.
 *
 *   node scripts/calibrate-map.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Must match MAP_BBOX in src/app/[locale]/map/projection.ts.
const MAP_BBOX = { w: 114.05, e: 116.1, n: -7.75, s: -9.15 }

/**
 * The UNCOMPRESSED source, not public/map/bali.glb.
 *
 * The shipped model is Draco-compressed, which moves geometry into the
 * KHR_draco_mesh_compression extension and leaves the accessors without a
 * bufferView — unreadable without a Draco decoder. Calibration is a one-off
 * offline step against the same mesh before compression, and the result is
 * committed as model-fit.json, so the runtime never needs to decode anything.
 *
 *   node scripts/calibrate-map.mjs path/to/uncompressed.glb
 */
const GLB = process.argv[2] ?? resolve(root, 'public/map/bali.glb')
const RASTER = resolve(root, 'public/map/bali-satellite.webp')
const OUT_JSON = resolve(root, 'src/app/[locale]/map/model-fit.json')
const OUT_PREVIEW = resolve(root, 'scripts/.calibration-preview.png')

const GRID_W = 512 // working resolution; plenty for a 4-parameter fit

/* ---------------------------------------------------------------- GLB ---- */

const COMPONENT = {
  5120: { size: 1, get: (d, o) => d.getInt8(o) },
  5121: { size: 1, get: (d, o) => d.getUint8(o) },
  5122: { size: 2, get: (d, o) => d.getInt16(o, true) },
  5123: { size: 2, get: (d, o) => d.getUint16(o, true) },
  5125: { size: 4, get: (d, o) => d.getUint32(o, true) },
  5126: { size: 4, get: (d, o) => d.getFloat32(o, true) },
}

function loadGlb(path) {
  const buf = readFileSync(path)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
  const bin = buf.subarray(20 + jsonLen + 8)
  return { json, bin }
}

function readAccessor(json, bin, index, comps) {
  const acc = json.accessors[index]
  const view = json.bufferViews[acc.bufferView]
  const c = COMPONENT[acc.componentType]
  const stride = view.byteStride ?? c.size * comps
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength)
  const out = new Float64Array(acc.count * comps)
  for (let i = 0; i < acc.count; i++) {
    for (let k = 0; k < comps; k++) out[i * comps + k] = c.get(dv, base + i * stride + k * c.size)
  }
  return out
}

/* ------------------------------------------------------------- masks ---- */

/**
 * Rasterise the terrain's footprint by scan-converting its triangles.
 *
 * Only the largest mesh is used. The vegetation meshes are scattered points
 * that would pepper the mask with holes, and any sea plane or base plate would
 * fill it to the bounding box — either would ruin the fit.
 */
function modelMask(json, bin, w, h) {
  let best = null
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      const ai = prim.attributes?.POSITION
      if (ai === undefined || prim.indices === undefined) continue
      const acc = json.accessors[ai]
      const span = (acc.max[0] - acc.min[0]) * (acc.max[2] - acc.min[2])
      const tris = json.accessors[prim.indices].count / 3
      const score = span * Math.log10(tris + 10)
      if (!best || score > best.score) best = { prim, acc, score, name: mesh.name }
    }
  }
  if (!best) throw new Error('no indexed primitive with POSITION found')

  const pos = readAccessor(json, bin, best.prim.attributes.POSITION, 3)
  const idx = readAccessor(json, bin, best.prim.indices, 1)
  const [minX, , minZ] = best.acc.min
  const [maxX, , maxZ] = best.acc.max
  const mask = new Uint8Array(w * h)

  const sx = (w - 1) / (maxX - minX)
  const sz = (h - 1) / (maxZ - minZ)

  for (let t = 0; t < idx.length; t += 3) {
    const xs = []
    const ys = []
    for (let k = 0; k < 3; k++) {
      const v = idx[t + k] * 3
      xs.push((pos[v] - minX) * sx)
      ys.push((pos[v + 2] - minZ) * sz)
    }
    const y0 = Math.max(0, Math.floor(Math.min(...ys)))
    const y1 = Math.min(h - 1, Math.ceil(Math.max(...ys)))
    for (let y = y0; y <= y1; y++) {
      // Scanline crossings of the triangle's three edges.
      const cross = []
      for (let e = 0; e < 3; e++) {
        const ax = xs[e]
        const ay = ys[e]
        const bx = xs[(e + 1) % 3]
        const by = ys[(e + 1) % 3]
        if (ay === by) continue
        const yy = y + 0.5
        if (yy < Math.min(ay, by) || yy >= Math.max(ay, by)) continue
        cross.push(ax + ((yy - ay) / (by - ay)) * (bx - ax))
      }
      if (cross.length < 2) continue
      const lo = Math.max(0, Math.floor(Math.min(...cross)))
      const hi = Math.min(w - 1, Math.ceil(Math.max(...cross)))
      for (let x = lo; x <= hi; x++) mask[y * w + x] = 1
    }
  }
  return { mask, bounds: { minX, maxX, minZ, maxZ }, source: best.name }
}

/** Land in the satellite raster: vegetation and bare rock both beat the sea. */
async function rasterMask(path, w, h) {
  const { data } = await sharp(path)
    .resize(w, h, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const mask = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 3]
    const g = data[i * 3 + 1]
    const b = data[i * 3 + 2]
    // Sea in this raster is strongly blue-dominant; land is not.
    mask[i] = b > g + 8 && b > r + 8 ? 0 : 1
  }

  /**
   * Erase every landmass touching the frame edge.
   *
   * MAP_BBOX is drawn wide enough to give Bali some sea margin, which means
   * the raster also catches JAVA along the west edge and LOMBOK along the
   * east. The model contains neither. Left in, they are pure disagreement:
   * they cannot ever overlap the model, so they inflate the union, crush the
   * IoU, and — far worse — drag the best-fit transform sideways as the search
   * tries to cover land that does not exist in the mesh.
   *
   * Bali, Nusa Penida, Lembongan and Ceningan all sit clear of the frame, so
   * "touches the edge" separates them cleanly. Flood-filled iteratively rather
   * than recursively: a component this size would blow the call stack.
   */
  const stack = []
  for (let x = 0; x < w; x++) {
    if (mask[x]) stack.push(x)
    if (mask[(h - 1) * w + x]) stack.push((h - 1) * w + x)
  }
  for (let y = 0; y < h; y++) {
    if (mask[y * w]) stack.push(y * w)
    if (mask[y * w + w - 1]) stack.push(y * w + w - 1)
  }
  let erased = 0
  while (stack.length > 0) {
    const i = stack.pop()
    if (!mask[i]) continue
    mask[i] = 0
    erased++
    const x = i % w
    const y = (i / w) | 0
    if (x > 0) stack.push(i - 1)
    if (x < w - 1) stack.push(i + 1)
    if (y > 0) stack.push(i - w)
    if (y < h - 1) stack.push(i + w)
  }
  console.log(`  erased ${erased} px of edge-touching land (Java, Lombok)`)

  return mask
}

/* --------------------------------------------------------------- fit ---- */

function iou(a, b, w, h, sx, sz, ox, oz) {
  let inter = 0
  let union = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const av = a[y * w + x]
      // Where in the model mask does this raster pixel fall?
      const mx = Math.round((x - ox) / sx)
      const my = Math.round((y - oz) / sz)
      const bv = mx >= 0 && mx < w && my >= 0 && my < h ? b[my * w + mx] : 0
      if (av || bv) union++
      if (av && bv) inter++
    }
  }
  return union === 0 ? 0 : inter / union
}

function search(rasterM, modelM, w, h) {
  let best = { score: -1 }
  // Coarse to fine over scale and offset, in raster-pixel units.
  let range = { sx: [0.6, 1.6], sz: [0.6, 1.6], ox: [-0.3 * w, 0.3 * w], oz: [-0.3 * h, 0.3 * h] }
  let steps = 9
  for (let pass = 0; pass < 6; pass++) {
    const cand = { ...best }
    for (let i = 0; i < steps; i++) {
      const sx = range.sx[0] + ((range.sx[1] - range.sx[0]) * i) / (steps - 1)
      for (let j = 0; j < steps; j++) {
        const sz = range.sz[0] + ((range.sz[1] - range.sz[0]) * j) / (steps - 1)
        for (let k = 0; k < steps; k++) {
          const ox = range.ox[0] + ((range.ox[1] - range.ox[0]) * k) / (steps - 1)
          for (let l = 0; l < steps; l++) {
            const oz = range.oz[0] + ((range.oz[1] - range.oz[0]) * l) / (steps - 1)
            const s = iou(rasterM, modelM, w, h, sx, sz, ox, oz)
            if (s > best.score) best = { score: s, sx, sz, ox, oz }
          }
        }
      }
    }
    if (best.score <= (cand.score ?? -1) && pass > 0) break
    const shrink = 0.35
    const span = (r) => (r[1] - r[0]) * shrink
    range = {
      sx: [best.sx - span(range.sx) / 2, best.sx + span(range.sx) / 2],
      sz: [best.sz - span(range.sz) / 2, best.sz + span(range.sz) / 2],
      ox: [best.ox - span(range.ox) / 2, best.ox + span(range.ox) / 2],
      oz: [best.oz - span(range.oz) / 2, best.oz + span(range.oz) / 2],
    }
    console.log(`  pass ${pass + 1}: IoU ${best.score.toFixed(4)}`)
  }
  return best
}

/* -------------------------------------------------------------- main ---- */

const { json, bin } = loadGlb(GLB)
const aspect = (MAP_BBOX.e - MAP_BBOX.w) / (MAP_BBOX.n - MAP_BBOX.s)
const H = Math.round(GRID_W / aspect)

console.log(`\n  grid ${GRID_W}x${H} (bbox aspect ${aspect.toFixed(4)})`)
const { mask: modelM, bounds, source } = modelMask(json, bin, GRID_W, H)
console.log(`  terrain mesh: ${source}`)
const rasterM = await rasterMask(RASTER, GRID_W, H)

const coverage = (m) => (m.reduce((a, b) => a + b, 0) / m.length) * 100
console.log(
  `  land coverage — raster ${coverage(rasterM).toFixed(1)}%, model ${coverage(modelM).toFixed(1)}%`,
)

console.log('\n  fitting…')
const fit = search(rasterM, modelM, GRID_W, H)
console.log(
  `\n  best IoU ${fit.score.toFixed(4)}  sx=${fit.sx.toFixed(4)} sz=${fit.sz.toFixed(4)} ox=${fit.ox.toFixed(2)} oz=${fit.oz.toFixed(2)}`,
)

/**
 * Convert the pixel-space fit into the numbers the app needs: given a
 * projection fraction (0..1 across MAP_BBOX, which is exactly what
 * projectLng/projectLat already return), produce a model x/z.
 */
const uPerPx = 1 / GRID_W
const vPerPx = 1 / H
const model = {
  generatedAt: null,
  bbox: MAP_BBOX,
  iou: Number(fit.score.toFixed(4)),
  terrainMesh: source,
  modelBounds: bounds,
  // u,v (0..1 over MAP_BBOX) -> model x,z
  uToX: {
    scale: ((bounds.maxX - bounds.minX) / fit.sx) * (GRID_W * uPerPx),
    offset: bounds.minX - (fit.ox / fit.sx) * ((bounds.maxX - bounds.minX) / GRID_W),
  },
  vToZ: {
    scale: ((bounds.maxZ - bounds.minZ) / fit.sz) * (H * vPerPx),
    offset: bounds.minZ - (fit.oz / fit.sz) * ((bounds.maxZ - bounds.minZ) / H),
  },
}

writeFileSync(OUT_JSON, JSON.stringify(model, null, 2) + '\n')
console.log(`  wrote ${OUT_JSON}`)

// Visual proof: red = satellite land, green = model land, yellow = agreement.
const px = Buffer.alloc(GRID_W * H * 3)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < GRID_W; x++) {
    const i = (y * GRID_W + x) * 3
    const a = rasterM[y * GRID_W + x]
    const mx = Math.round((x - fit.ox) / fit.sx)
    const my = Math.round((y - fit.oz) / fit.sz)
    const b = mx >= 0 && mx < GRID_W && my >= 0 && my < H ? modelM[my * GRID_W + mx] : 0
    px[i] = a ? 220 : 12
    px[i + 1] = b ? 220 : 12
    px[i + 2] = 20
  }
}
/**
 * Plot the real places on top.
 *
 * This is the verification step, and it is the whole point of the exercise: a
 * transform with a good IoU can still be subtly wrong, and the only honest
 * check is whether known locations land where a human knows they belong.
 * White cross = on model land. Magenta = in the sea, which means the fit is
 * wrong for that pin and must not ship.
 */
const PLACES = [
  ['uluwatu-temple', -8.829, 115.085],
  ['canggu', -8.648, 115.138],
  ['sekumpul-waterfall', -8.16, 115.16],
  ['ubud', -8.507, 115.263],
  ['tegallalang', -8.431, 115.279],
  ['mount-batur', -8.242, 115.375],
  ['nusa-penida', -8.727, 115.544],
  ['diamond-beach', -8.795, 115.595],
  ['lempuyang-temple', -8.392, 115.631],
]

console.log('\n  pin verification (u,v -> model x,z -> is it on land?)')
let onLand = 0
for (const [name, lat, lon] of PLACES) {
  const u = (lon - MAP_BBOX.w) / (MAP_BBOX.e - MAP_BBOX.w)
  const v = (MAP_BBOX.n - lat) / (MAP_BBOX.n - MAP_BBOX.s)
  const mx = model.uToX.offset + u * model.uToX.scale
  const mz = model.vToZ.offset + v * model.vToZ.scale
  // Back into the model-mask grid to test for land.
  const gx = Math.round(((mx - bounds.minX) / (bounds.maxX - bounds.minX)) * (GRID_W - 1))
  const gz = Math.round(((mz - bounds.minZ) / (bounds.maxZ - bounds.minZ)) * (H - 1))
  const land = gx >= 0 && gx < GRID_W && gz >= 0 && gz < H && modelM[gz * GRID_W + gx] === 1
  if (land) onLand++
  console.log(
    `    ${land ? 'LAND' : 'SEA '}  ${name.padEnd(20)} x=${mx.toFixed(1)} z=${mz.toFixed(1)}`,
  )

  // Draw at the RASTER position, which is where the overlay is drawn.
  const px0 = Math.round(u * (GRID_W - 1))
  const py0 = Math.round(v * (H - 1))
  const [cr, cg, cb] = land ? [255, 255, 255] : [255, 0, 255]
  for (let d = -4; d <= 4; d++) {
    for (const [qx, qy] of [
      [px0 + d, py0],
      [px0, py0 + d],
    ]) {
      if (qx < 0 || qx >= GRID_W || qy < 0 || qy >= H) continue
      const o = (qy * GRID_W + qx) * 3
      px[o] = cr
      px[o + 1] = cg
      px[o + 2] = cb
    }
  }
}
console.log(`\n  ${onLand}/${PLACES.length} pins land on model terrain`)

await sharp(px, { raw: { width: GRID_W, height: H, channels: 3 } })
  .png()
  .toFile(OUT_PREVIEW)
console.log(`  wrote ${OUT_PREVIEW} (red=satellite, green=model, yellow=agreement)\n`)
