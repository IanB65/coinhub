// Dev-only verification for the 3D coin viewer in CoinHub_v2.html.
// Runs fully offline: forges a client-side token and seeds the localStorage
// sheet cache with fixture coins so loadFromSheets() never touches the network.
//
// Usage:  http-server . -p 8787 -s   (in repo root, separate process)
//         PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/verify-coin3d.mjs
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = (() => {
  for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { return require(spec); } catch (e) {}
  }
  throw new Error('playwright not found — run: npm i --no-save playwright && npx playwright install chromium');
})();

const BASE = process.env.COINHUB_URL || 'http://127.0.0.1:8787/CoinHub_v2.html';
const SHOTS = 'scripts/coin3d-shots';
const LOTS = 'UK-D-50P-2026-LOTS-';
const LOTB = 'UK-D-50P-2026-LOTB-';
const CONTROL = 'UK-D-50P-2025-CTRL-';

const mkCoin = (vc, name, collection) => ({
  variantCode: vc, name, denom: '50p', collection,
  monarch: 'King Charles III', year: 2026, status: 'Need',
  imgUrl: 'images/UK26LRCSPC_-_The_Lord_of_the_Rings_2026_UK_50p_Silver_Proof_Colour_Coin_Reverse_Edge__40243.png',
  notes: '', instCount: 0, parsed: { type: 'D', denom: '50P', year: 2026, id: vc.split('-')[4] + '-' },
  estimatedValue: null, spinkCode: ''
});
const FIXTURE = {
  coins: [
    mkCoin(LOTB, 'LOTR 50p (BU)', 'Lord of the Rings'),
    mkCoin('UK-D-50P-2026-LOTC-', 'LOTR 50p (Colour BU)', 'Lord of the Rings'),
    mkCoin(LOTS, 'LOTR 50p (Silver Proof)', 'Lord of the Rings'),
    mkCoin(CONTROL, 'Control 50p (no 3D)', 'Commemorative')
  ],
  cotuk: {}, instances: {}, storageMap: {}, storage1: [], storage2: [], storage3: [],
  ptypeList: [], collectionsList: ['Lord of the Rings', 'Commemorative'], collectionsMeta: {},
  valuesMap: {}, denomGroupMap: { '50p': 'Decimal' }, denomSortMap: {}, denomGroupOrder: ['Decimal']
};
const TOKEN = 'x.' + Buffer.from(JSON.stringify({ exp: 9999999999 })).toString('base64url') + '.x';
const SEED = `
  localStorage.setItem('coinhub_token', ${JSON.stringify(TOKEN)});
  localStorage.setItem('coinhub_gs_cache', JSON.stringify({ ts: Date.now(), ...${JSON.stringify(FIXTURE)} }));
`;

let failures = 0;
const check = (name, ok, extra) => {
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (extra !== undefined ? '  [' + extra + ']' : ''));
  if (!ok) failures++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newPage(browser, opts = {}, extraInit = '') {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(SEED + extraInit);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#pageMain', { state: 'visible', timeout: 15000 });
  return { ctx, page, errors };
}
const dbg = page => page.evaluate(() => window._coin3dDebug());
const openModal = (page, vc) => page.evaluate(v => openCoinModal(v, null, 0), vc);

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  // ── Desktop: render, drag, inertia, toggle, nav, close ──
  {
    const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1280, height: 900 } });
    await openModal(page, LOTS);
    await page.waitForSelector('#lb3dWrap canvas', { state: 'visible' });
    await sleep(600); // let textures load + first frames render
    let d = await dbg(page);
    check('viewer mounted + loop running', d.mounted && d.running && !d.dead);
    const canvas = page.locator('#lb3dWrap canvas');
    await canvas.screenshot({ path: `${SHOTS}/01-initial.png` });

    // Drag: rotY should change while dragging
    const box = await canvas.boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const rotBefore = (await dbg(page)).rotY;
    await page.mouse.move(cx - 60, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 60, cy, { steps: 6 });
    const rotDuring = (await dbg(page)).rotY;
    check('drag rotates coin', Math.abs(rotDuring - rotBefore) > 0.5, `Δ=${(rotDuring - rotBefore).toFixed(2)} rad`);
    await page.mouse.up();

    // Inertia: velocity after release, rotation continues, then damps to a stop
    d = await dbg(page);
    check('inertia: velocity after release', Math.abs(d.velY) > 0.3, `velY=${d.velY.toFixed(2)} rad/s`);
    await sleep(300);
    const d2 = await dbg(page);
    check('inertia: still spinning after 300ms', Math.abs(d2.rotY - d.rotY) > 0.05, `Δ=${(d2.rotY - d.rotY).toFixed(3)} rad`);
    await canvas.screenshot({ path: `${SHOTS}/02-spinning.png` });
    await sleep(2400); // ~2.7s after release: damped to zero, idle spin not yet started (3.5s)
    const d3 = await dbg(page);
    check('inertia: damped to a stop', d3.velY === 0, `velY=${d3.velY}`);

    // Idle auto-spin after 3.5s without interaction
    await sleep(1500);
    const d4 = await dbg(page);
    await sleep(400);
    const d5 = await dbg(page);
    check('idle auto-spin resumes', d5.rotY > d4.rotY, `Δ=${(d5.rotY - d4.rotY).toFixed(3)} rad`);

    // Toggle to photo and back
    await page.click('#lbPhotoBtn');
    check('toggle: photo visible', await page.locator('#lb3dPhoto').isVisible());
    check('toggle: 3D hidden', await page.locator('#lb3dWrap').isHidden());
    check('toggle: loop stopped', !(await dbg(page)).running);
    await page.screenshot({ path: `${SHOTS}/03-photo-mode.png` });
    await page.click('#lb3dBtn');
    check('toggle: back to 3D', await page.locator('#lb3dWrap canvas').isVisible() && (await dbg(page)).running);

    // Nav re-render to another 3D coin, then close
    await openModal(page, LOTB);
    await page.waitForSelector('#lb3dWrap canvas', { state: 'visible' });
    check('re-render on another coin keeps viewer alive', (await dbg(page)).running);
    await page.evaluate(() => closeCoinModal());
    check('close stops loop + unmounts', !(await dbg(page)).running && !(await dbg(page)).mounted);

    // Control coin: legacy markup, no 3D elements
    await openModal(page, CONTROL);
    check('control coin has no 3D wrap/toggle', await page.locator('#lb3dWrap').count() === 0 && await page.locator('#lb3dToggle').count() === 0);
    check('control coin shows plain img', await page.locator('.lb-img-panel > img').count() === 1);
    await page.evaluate(() => closeCoinModal());

    check('no page errors (desktop)', errors.length === 0, errors.join(' | ') || 'clean');
    await ctx.close();
  }

  // ── Touch: mobile viewport, touch-pointer drag ──
  {
    const { ctx, page, errors } = await newPage(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await openModal(page, LOTS);
    await page.waitForSelector('#lb3dWrap canvas', { state: 'visible' });
    await sleep(400);
    const before = (await dbg(page)).rotY;
    await page.evaluate(() => {
      const c = document.querySelector('#lb3dWrap canvas');
      const r = c.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const ev = (type, x) => c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true }));
      ev('pointerdown', r.left + 40);
      for (let i = 1; i <= 5; i++) ev('pointermove', r.left + 40 + i * 20);
      ev('pointerup', r.left + 140);
    });
    const after = (await dbg(page)).rotY;
    check('touch drag rotates coin', Math.abs(after - before) > 0.5, `Δ=${(after - before).toFixed(2)} rad`);
    await page.screenshot({ path: `${SHOTS}/04-mobile.png` });
    check('no page errors (touch)', errors.length === 0, errors.join(' | ') || 'clean');
    await ctx.close();
  }

  // ── Fallback: WebGL unavailable → photo shown, toggle hidden ──
  {
    const { ctx, page, errors } = await newPage(browser, { viewport: { width: 1280, height: 900 } }, `
      const _origGC = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...a) {
        if (String(type).indexOf('webgl') !== -1) return null;
        return _origGC.call(this, type, ...a);
      };
    `);
    await openModal(page, LOTS);
    check('no-WebGL: photo visible', await page.locator('#lb3dPhoto').isVisible());
    check('no-WebGL: toggle hidden', await page.locator('#lb3dToggle').isHidden());
    check('no-WebGL: no page errors', errors.length === 0, errors.join(' | ') || 'clean');
    await ctx.close();
  }

  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
