// Coin texture pre-processing pipeline for the 3D viewer (dev-only).
//
// Takes raw coin product shots, isolates the coin from its background
// (alpha channel or contrast flood-fill), detects the heptagon's rotation via
// the shape's 7-fold symmetry, normalises scale/centre, applies the master
// 50p Reuleaux-heptagon mask (M1), and writes a 1024x1024 WebP texture to
// assets/coin3d/<variantCode>/reverse.webp. Optionally updates the COIN3D
// manifest in CoinHub_v2.html.
//
// Usage:
//   node scripts/coin3d-prepare.mjs [options]
//     --inbox <dir>        source folder (default assets/coin3d/_inbox)
//                          files named <variantCode>.<ext>  -> reverse face
//                          files named kc3-obv.<ext> / qe2-obv.<ext> -> shared obverse
//     --list <json>        source list [{code,name,url}]; entries with a url are
//                          downloaded into the inbox first (needs network)
//     --apply-manifest     insert/update COIN3D entries in CoinHub_v2.html
//     --threshold <n>      background colour distance threshold (default 40)
//     --write-mask         also write the master mask to assets/coin3d/_shared/mask-50p.png
//     --debug              write per-image debug composites to scripts/coin3d-shots/
//
// Requires: PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers (chromium does the pixel work,
// so processing matches what browsers decode at runtime — incl. WebP-named-.png files).
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = (() => {
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(spec); } catch (e) {}
  }
  throw new Error('playwright not found — run: npm i --no-save playwright && npx playwright install chromium');
})();

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i === -1 ? def : args[i + 1]; };
const flag = name => args.includes('--' + name);
const INBOX = path.resolve(ROOT, opt('inbox', 'assets/coin3d/_inbox'));
const THRESHOLD = Number(opt('threshold', 40));
const SHARED_KEYS = { 'kc3-obv': 'King Charles III obverse', 'qe2-obv': 'Queen Elizabeth II obverse' };

// ── In-browser processing (runs inside chromium via page.evaluate) ───────────
// Returns { webpBase64, report } or { error }.
const PROCESS_FN = async ({ b64, threshold, isObverse }) => {
  const S = 1024;
  const img = new Image();
  img.src = 'data:application/octet-stream;base64,' + b64;
  try { await img.decode(); } catch (e) { return { error: 'image failed to decode' }; }
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  const px = x.getImageData(0, 0, W, H).data;

  // ── Phase 1: background isolation ──
  // If the image has real transparency, the alpha channel is the mask.
  // Otherwise flood-fill from the borders using colour distance to the median
  // border colour, so near-white highlights INSIDE the coin are not punched out.
  let hasAlpha = false;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { hasAlpha = true; break; }
  const mask = new Uint8Array(W * H);
  if (hasAlpha) {
    for (let i = 0; i < W * H; i++) mask[i] = px[i * 4 + 3] > 16 ? 1 : 0;
  } else {
    const border = [];
    for (let i = 0; i < W; i++) border.push(i, (H - 1) * W + i);
    for (let i = 0; i < H; i++) border.push(i * W, i * W + W - 1);
    const ch = c => border.map(p => px[p * 4 + c]).sort((a, b) => a - b)[Math.floor(border.length / 2)];
    const bg = [ch(0), ch(1), ch(2)];
    const isBg = p => { const i = p * 4, dr = px[i] - bg[0], dg = px[i + 1] - bg[1], db = px[i + 2] - bg[2]; return Math.sqrt(dr * dr + dg * dg + db * db) < threshold; };
    mask.fill(1);
    const stack = [];
    for (const p of border) if (isBg(p) && mask[p]) { mask[p] = 0; stack.push(p); }
    while (stack.length) {
      const p = stack.pop(), py = (p / W) | 0, pxx = p % W;
      for (const q of [p - W, p + W, pxx > 0 ? p - 1 : -1, pxx < W - 1 ? p + 1 : -1]) {
        if (q >= 0 && q < W * H && mask[q] && isBg(q)) { mask[q] = 0; stack.push(q); }
      }
    }
  }

  // bbox + centroid of the isolated coin
  let minX = W, maxX = 0, minY = H, maxY = 0, cx = 0, cy = 0, n = 0;
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    if (mask[yy * W + xx]) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (yy < minY) minY = yy; if (yy > maxY) maxY = yy; cx += xx; cy += yy; n++; }
  }
  if (n < 100) return { error: 'no coin found (mask empty — adjust --threshold?)' };
  cx /= n; cy /= n;

  // ── Phase 2: rotation via 7-fold symmetry of the boundary radial profile ──
  // r(angle) peaks at the 7 vertices; the phase of the 7th harmonic gives the
  // orientation. Snap to vertex-up (the standard upright 50p) within ±(180/7)°.
  const BINS = 1024, rad = new Float32Array(BINS);
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
    const p = yy * W + xx;
    if (!mask[p]) continue;
    if (xx > 0 && xx < W - 1 && yy > 0 && yy < H - 1 && mask[p - 1] && mask[p + 1] && mask[p - W] && mask[p + W]) continue; // interior
    const dx = xx - cx, dy = cy - yy; // image y down -> maths y up
    const r = Math.sqrt(dx * dx + dy * dy);
    const b = Math.round(((Math.atan2(dy, dx) + 2 * Math.PI) % (2 * Math.PI)) / (2 * Math.PI) * BINS) % BINS;
    if (r > rad[b]) rad[b] = r;
  }
  let mean = 0, cnt = 0;
  for (let b = 0; b < BINS; b++) if (rad[b]) { mean += rad[b]; cnt++; }
  mean /= cnt || 1;
  let re = 0, im = 0;
  for (let b = 0; b < BINS; b++) {
    if (!rad[b]) continue;
    const a = b / BINS * 2 * Math.PI;
    re += (rad[b] - mean) * Math.cos(7 * a);
    im += (rad[b] - mean) * Math.sin(7 * a);
  }
  const amp = Math.sqrt(re * re + im * im) / cnt; // ~0 for circular coins
  let rotDeg = 0;
  const heptagonal = amp > 0.004 * mean;
  if (heptagonal) {
    const vertexAngle = Math.atan2(im, re) / 7;       // a vertex direction, mod 2π/7
    const step = 2 * Math.PI / 7;
    let d = (Math.PI / 2 - vertexAngle) % step;        // rotation to put a vertex at top
    if (d > step / 2) d -= step; if (d < -step / 2) d += step;
    rotDeg = d * 180 / Math.PI;                        // CCW in maths = CCW on screen via canvas -rotate below
  }

  // ── Normalise: rotate, centre on bbox, scale to fill, apply master mask ──
  // Work on an intermediate canvas with the coin centred on its centroid.
  const mid = document.createElement('canvas'); mid.width = W * 2; mid.height = H * 2;
  const mx = mid.getContext('2d', { willReadFrequently: true });
  // strip the background using the mask first
  const cut = document.createElement('canvas'); cut.width = W; cut.height = H;
  const cutx = cut.getContext('2d');
  cutx.drawImage(img, 0, 0);
  const cd = cutx.getImageData(0, 0, W, H);
  for (let p = 0; p < W * H; p++) if (!mask[p]) cd.data[p * 4 + 3] = 0;
  cutx.putImageData(cd, 0, 0);
  mx.translate(W, H);
  mx.rotate(-rotDeg * Math.PI / 180);
  mx.drawImage(cut, -cx, -cy);
  // bbox of the rotated coin
  const md = mx.getImageData(0, 0, W * 2, H * 2).data;
  let rMinX = W * 2, rMaxX = 0, rMinY = H * 2, rMaxY = 0;
  for (let yy = 0; yy < H * 2; yy++) for (let xx = 0; xx < W * 2; xx++) {
    if (md[(yy * W * 2 + xx) * 4 + 3] > 16) { if (xx < rMinX) rMinX = xx; if (xx > rMaxX) rMaxX = xx; if (yy < rMinY) rMinY = yy; if (yy > rMaxY) rMaxY = yy; }
  }
  const bw = rMaxX - rMinX + 1, bh = rMaxY - rMinY + 1;
  const out = document.createElement('canvas'); out.width = out.height = S;
  const ox = out.getContext('2d');
  ox.imageSmoothingQuality = 'high';
  // a Reuleaux heptagon's bbox is its width in both axes; fit the larger extent
  const k = S / Math.max(bw, bh);
  ox.drawImage(mid, rMinX, rMinY, bw, bh, (S - bw * k) / 2, (S - bh * k) / 2, bw * k, bh * k);

  // master mask M1: exact Reuleaux heptagon (vertex up), same maths as the geometry
  if (heptagonal) {
    const R7 = 1 / (2 * Math.sin(3 * Math.PI / 7)); // circumradius for width 1
    const vtx = [];
    for (let kk = 0; kk < 7; kk++) { const a = Math.PI / 2 + kk * 2 * Math.PI / 7; vtx.push([R7 * Math.cos(a), R7 * Math.sin(a)]); }
    const pts = [];
    for (let i = 0; i < 7; i++) {
      const A = vtx[i], B = vtx[(i + 1) % 7], C = vtx[(i + 4) % 7];
      const a0 = Math.atan2(A[1] - C[1], A[0] - C[0]), a1raw = Math.atan2(B[1] - C[1], B[0] - C[0]);
      let d = a1raw - a0; while (d <= 0) d += 2 * Math.PI;
      for (let j = 0; j < 24; j++) { const a = a0 + d * j / 24; pts.push([C[0] + Math.cos(a), C[1] + Math.sin(a)]); }
    }
    let mnX = 9, mxX = -9, mnY = 9, mxY = -9;
    pts.forEach(p => { mnX = Math.min(mnX, p[0]); mxX = Math.max(mxX, p[0]); mnY = Math.min(mnY, p[1]); mxY = Math.max(mxY, p[1]); });
    const ccx = (mnX + mxX) / 2, ccy = (mnY + mxY) / 2, span = mxX - mnX;
    ox.globalCompositeOperation = 'destination-in';
    ox.beginPath();
    // tiny outset (1.004) so the mask never shaves the coin's own edge pixels
    pts.forEach((p, i) => { const X = S / 2 + (p[0] - ccx) / span * S * 1.004, Y = S / 2 - (p[1] - ccy) / span * S * 1.004; i ? ox.lineTo(X, Y) : ox.moveTo(X, Y); });
    ox.closePath(); ox.fill();
    ox.globalCompositeOperation = 'source-over';
  }

  const webp = out.toDataURL('image/webp', 0.85);
  return {
    webpBase64: webp.slice(webp.indexOf(',') + 1),
    report: {
      source: W + 'x' + H, bg: hasAlpha ? 'alpha' : 'flood-fill',
      coinSpanPx: Math.max(maxX - minX + 1, maxY - minY + 1),
      heptagonal, sevenFoldAmp: +(amp / mean).toFixed(4), rotationAppliedDeg: +rotDeg.toFixed(2)
    }
  };
};

// master mask M1 as a standalone artifact
const MASK_FN = () => {
  const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d');
  const R7 = 1 / (2 * Math.sin(3 * Math.PI / 7)), vtx = [], pts = [];
  for (let k = 0; k < 7; k++) { const a = Math.PI / 2 + k * 2 * Math.PI / 7; vtx.push([R7 * Math.cos(a), R7 * Math.sin(a)]); }
  for (let i = 0; i < 7; i++) {
    const A = vtx[i], B = vtx[(i + 1) % 7], C = vtx[(i + 4) % 7];
    const a0 = Math.atan2(A[1] - C[1], A[0] - C[0]); let d = Math.atan2(B[1] - C[1], B[0] - C[0]) - a0; while (d <= 0) d += 2 * Math.PI;
    for (let j = 0; j < 24; j++) { const a = a0 + d * j / 24; pts.push([C[0] + Math.cos(a), C[1] + Math.sin(a)]); }
  }
  let mnX = 9, mxX = -9, mnY = 9, mxY = -9;
  pts.forEach(p => { mnX = Math.min(mnX, p[0]); mxX = Math.max(mxX, p[0]); mnY = Math.min(mnY, p[1]); mxY = Math.max(mxY, p[1]); });
  const ccx = (mnX + mxX) / 2, ccy = (mnY + mxY) / 2, span = mxX - mnX;
  x.fillStyle = '#000';
  x.beginPath();
  pts.forEach((p, i) => { const X = S / 2 + (p[0] - ccx) / span * S, Y = S / 2 - (p[1] - ccy) / span * S; i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
  x.closePath(); x.fill();
  return cv.toDataURL('image/png').split(',')[1];
};

// ── Manifest update ───────────────────────────────────────────────────────────
// Rewrites the COIN3D.coins block as a whole: parses existing one-per-line
// entries, merges in the new ones (sorted by variant code), and regenerates.
function applyManifest(entries) {
  const file = path.join(ROOT, 'CoinHub_v2.html');
  let html = fs.readFileSync(file, 'utf8');
  for (const key of new Set(entries.map(e => e.obvKey).filter(Boolean))) {
    if (!html.includes(`'${key}':`)) {
      html = html.replace(/(const COIN3D = \{\n  shared: \{\n)/,
        `$1    '${key}': { src:'assets/coin3d/_shared/${key}.webp', scale:1, rotate:0 },\n`);
    }
  }
  const blockRe = /(  coins: \{\n)([\s\S]*?)(\n  \}\n\};)/;
  const m = html.match(blockRe);
  if (!m) throw new Error('COIN3D.coins block not found in CoinHub_v2.html');
  const coins = {};
  for (const lm of m[2].matchAll(/'([^']+)': (\{.*\}),?\s*$/gm)) coins[lm[1]] = lm[2];
  for (const e of entries) coins[e.code] = `{ obverse:'${e.obvKey}', reverse:{ src:'${e.src}' } }`;
  const body = Object.keys(coins).sort().map(c => `    '${c}': ${coins[c]}`).join(',\n');
  html = html.replace(blockRe, `$1${body}$3`);
  fs.writeFileSync(file, html);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(INBOX, { recursive: true });

  // optional download step from a source list
  const listPath = opt('list', null);
  if (listPath) {
    const list = JSON.parse(fs.readFileSync(path.resolve(ROOT, listPath), 'utf8'));
    for (const item of list) {
      if (!item.url) { console.log(`  skip ${item.code} — no url in list (drop a file into _inbox instead)`); continue; }
      const dest = path.join(INBOX, item.code + path.extname(new URL(item.url).pathname || '.png'));
      if (fs.existsSync(dest)) continue;
      try {
        const res = await fetch(item.url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        console.log(`  downloaded ${item.code}`);
      } catch (e) { console.log(`  FAILED download ${item.code}: ${e.message}`); }
    }
  }

  const files = fs.readdirSync(INBOX).filter(f => /\.(png|jpe?g|webp|gif|avif)$/i.test(f));
  if (!files.length && !flag('write-mask')) { console.log(`Nothing to do: no images in ${INBOX}`); return; }

  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  await page.goto('about:blank');

  if (flag('write-mask')) {
    const b64 = await page.evaluate(MASK_FN);
    const dest = path.join(ROOT, 'assets/coin3d/_shared/mask-50p.png');
    fs.writeFileSync(dest, Buffer.from(b64, 'base64'));
    console.log('Wrote master mask M1 -> assets/coin3d/_shared/mask-50p.png');
  }

  const manifestEntries = [];
  for (const f of files) {
    const stem = f.replace(/\.[^.]+$/, '');
    const sharedKey = SHARED_KEYS[stem] ? stem : null;
    const b64 = fs.readFileSync(path.join(INBOX, f)).toString('base64');
    const res = await page.evaluate(PROCESS_FN, { b64, threshold: THRESHOLD, isObverse: !!sharedKey });
    if (res.error) { console.log(`  FAIL ${f}: ${res.error}`); continue; }
    const r = res.report;
    let dest, src;
    if (sharedKey) {
      dest = path.join(ROOT, 'assets/coin3d/_shared', sharedKey + '.webp');
      src = `assets/coin3d/_shared/${sharedKey}.webp`;
    } else {
      dest = path.join(ROOT, 'assets/coin3d', stem, 'reverse.webp');
      src = `assets/coin3d/${stem}/reverse.webp`;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(res.webpBase64, 'base64'));
    const kb = Math.round(fs.statSync(dest).size / 1024);
    console.log(`  OK   ${f} -> ${src}  [${r.source} ${r.bg}, ${r.heptagonal ? 'heptagon, rot ' + r.rotationAppliedDeg + '°' : 'NOT heptagonal (round?) — no mask applied'}, 7-fold amp ${r.sevenFoldAmp}, ${kb}KB]`);
    if (!sharedKey) {
      const year = Number(stem.split('-')[3]) || 0;
      manifestEntries.push({ code: stem, src, obvKey: year >= 2023 ? 'kc3-obv' : 'qe2-obv' });
    }
  }
  await browser.close();

  if (manifestEntries.length && flag('apply-manifest')) {
    applyManifest(manifestEntries);
    console.log(`Manifest updated in CoinHub_v2.html (${manifestEntries.length} coin(s)).`);
  } else if (manifestEntries.length) {
    console.log('\nManifest lines (re-run with --apply-manifest to write them automatically):');
    manifestEntries.forEach(e => console.log(`    '${e.code}': { obverse:'${e.obvKey}', reverse:{ src:'${e.src}' } },`));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
