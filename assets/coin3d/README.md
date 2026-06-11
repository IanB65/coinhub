# 3D coin face textures

Obverse/reverse photos mapped onto the 3D 50p in the CoinHub lightbox.
Which coins are 3D-enabled is controlled by the `COIN3D` manifest in
`CoinHub_v2.html` (search for `const COIN3D`).

## Adding coins — the automated pipeline (preferred)

`scripts/coin3d-prepare.mjs` turns raw product shots into ready-to-use
textures. It isolates the coin from its background (alpha channel, or
contrast flood-fill for white/solid backgrounds), detects the heptagon's
rotation from its 7-fold symmetry and levels it, centres and scales the coin
to fill the frame, applies the master 50p mask (`_shared/mask-50p.png`),
and writes a ~150KB 1024×1024 WebP. It can also update the manifest for you.

```
# 1. Drop raw images into assets/coin3d/_inbox/ named by variant code:
#      UK-D-50P-2011-ARCH-.jpg          → that coin's reverse
#      qe2-obv.png / kc3-obv.png        → shared obverse for that monarch era
# 2. Run (any image format/size; white or transparent backgrounds both fine):
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/coin3d-prepare.mjs --apply-manifest
# 3. Check the result in the app, then commit assets/ + CoinHub_v2.html
```

Useful flags: `--threshold <n>` (background contrast cut-off, default 40 —
raise it if soft shadows get included in the coin), `--list <json>` (download
sources first, e.g. `scripts/coin3d-sources/london-2012-olympics.json`),
`--write-mask`, `--debug`.

Round items (e.g. medallions) are detected via low 7-fold amplitude and are
left unmasked — check those by hand.

## Rollout status (collection by collection)

| Collection | Status |
|------------|--------|
| Lord of the Rings 2026 | Live. LOTS reverse is real; LOTB/LOTC reuse it as placeholders pending real photos; `kc3-obv` obverse still needed |
| London 2012 Olympics (29 coins) | Variant list ready in `scripts/coin3d-sources/london-2012-olympics.json`; needs source images (all old sheet URLs are dead) — drop them in `_inbox/` or fill the `url` fields and run with `--list` |

## Image requirements (for raw inbox photos)

- Straight-on photo, roughly upright (the pipeline corrects tilt within ±25°)
- Coin anywhere in frame; white, solid, or transparent background
- ≥600×600px source recommended (output is 1024×1024)

## Manual entries (fallback)

A manifest entry can also point at an unprocessed photo and calibrate it at
runtime: `reverse:{ src:'…', scale:1.08, rotate:0 }` where `scale` is
`imageWidth / coinWidthInPixels` and `rotate` is degrees clockwise.
