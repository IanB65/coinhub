# 3D coin face textures

Obverse/reverse photos mapped onto the 3D 50p in the CoinHub lightbox.
Which coins are 3D-enabled is controlled by the `COIN3D` manifest in
`CoinHub_v2.html` (search for `const COIN3D`).

## Layout

```
_shared/                      faces shared by many coins (e.g. one KC3 portrait)
<variantCode>/reverse.png     per-coin reverse face
```

## Image requirements

- Straight-on photo, coin centred, square image, ≥1000×1000px
- **Transparent background strongly preferred** (the viewer fills transparent
  areas with cupronickel metal); white also works but shows at the face corners
- PNG or WebP (file extension doesn't matter — browsers sniff the format)
- Target ~150–300KB; these are downloaded on every lightbox view
- The manifest's per-texture `scale` is `imageWidth / coinWidthInPixels`
  (e.g. coin spans 925px of a 1000px image → `scale: 1.08`); `rotate` is
  degrees clockwise to make the heptagon flat-edge-down

## Still needed (currently showing placeholders)

| File | What |
|------|------|
| `_shared/obverse-kc3-50p.png` | King Charles III 50p obverse (shared by all KC3 coins) |
| `UK-D-50P-2026-LOTB-/reverse.png` | LOTR BU reverse (currently a copy of the Silver Proof photo) |
| `UK-D-50P-2026-LOTC-/reverse.png` | LOTR Colour BU reverse (currently a copy of the Silver Proof photo) |

`UK-D-50P-2026-LOTS-/reverse.png` is the real Silver Proof photo.

## Adding a new 3D coin (e.g. Olympic 2012)

1. Drop `assets/coin3d/<variantCode>/reverse.png`
2. Add one line to `COIN3D.coins` in `CoinHub_v2.html`
3. For QE2-era coins, add a shared `qe2-obv` entry to `COIN3D.shared` once
   and reference it from each coin
