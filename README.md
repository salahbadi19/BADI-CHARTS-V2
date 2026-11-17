# BADI-CHARTS-V2

> **A lightweight, dependency-free, HEADLESS candlestick charting library built entirely with the HTML5 Canvas API.**
>
> Pixel-perfect rendering, 14 drawing tools, fully custom indicators via API — you bring the data, the UI, and the indicators. BADI-CHARTS-V2 renders the chart.

[![Version](https://img.shields.io/badge/version-2.20.8-2962ff.svg)](#)
[![License](https://img.shields.io/badge/license-Apache--2.0-26a69a.svg)](LICENSE)
[![No Dependencies](https://img.shields.io/badge/dependencies-zero-ff9800.svg)](#)
[![Headless](https://img.shields.io/badge/UI-headless-9c27b0.svg)](#)

---

## 🛠 v2.20.8 — Lightweight-Charts-style axes (no borders, no separate bg)

**User request.** "لا يعجبني المحاور ضعهم مثل محور المكتبة الخفيفة" — make the
axes look like TradingView Lightweight Charts.

**Before.** The price axis had a separate background fill (`axisBg`) and a
visible vertical border line (`axisBorder`) separating it from the chart.
The time axis had the same — a separate fill + a horizontal border line on
top. This created two visually distinct "panels" (chart + axis), which the
user found heavy.

**After.** Both fills and both border lines are REMOVED. Now:
- The chart's own background (`theme.bg`, drawn full-canvas in
  `drawBackground()`) extends seamlessly into the axis strips.
- No vertical line between the chart and the price axis.
- No horizontal line between the chart and the time axis.
- The tick labels (price on the right, time at the bottom) float directly
  on the chart background — exactly the clean, minimal look of
  TradingView Lightweight Charts.

The crosshair labels, current-price label, and countdown still have their
solid backgrounds (so they remain readable on top of the chart). Only the
AXIS FRAME (border + fill) was removed.

Same fix applied to the 2D edition (`chart.js` v2.18.12).

Verified: all prior suites (79 WebGL + 42 momentum + 122 countdown +
18 time-marks + v2.16/v2.17/v2.18) still green. Visual check confirms
the chart↔axis boundary pixels are fully transparent (no border line).

## 🛠 v2.20.7 — Crosshair label REPLACES the axis mark at its position

**Bug.** v2.20.6 added collision detection between axis marks and hid the
current-price label near the crosshair, but the user still saw jumbled
numbers: "رقم محوري الفارة يختلط برقم محور الزمن والسعر" (the crosshair
number mixes with the time-axis and price-axis numbers). The crosshair
label's solid rect DID cover the axis mark directly underneath, but axis
marks at the EDGE of the rect (within ~10–14px but not exactly at the
cursor's Y/X) were still partially visible — two numbers side by side at
nearly the same position.

**Fix.** Now the axis marks themselves get out of the way:

1. **Price axis**: `drawPriceAxis()` skips any mark whose Y is within **14px**
   of the crosshair's Y (when the crosshair is active and over the price
   area). Per-pane scale marks get the same treatment when the cursor is
   in that pane. So at the cursor's Y, only ONE number shows — the
   crosshair label (drawn later, on top).

2. **Time axis**: `drawTimeAxis()` skips any mark whose X is within **45px**
   of the crosshair's X (when the crosshair is active). So at the cursor's
   X, only ONE time number shows — the crosshair time label.

This is what the user meant by "اجعلهم يتحركو داخله لكي يكون نفس الارقام"
(make them move inside it so it becomes the same numbers): the axis number
vacates its slot when the crosshair label arrives, so there's never two
numbers fighting for the same position.

Same fix applied to the 2D edition (`chart.js` v2.18.11).

Verified: all prior suites (79 WebGL + 42 momentum + 122 countdown +
18 time-marks + v2.16/v2.17/v2.18) still green.

## 🛠 v2.20.6 — No more jumbled numbers on the price/time axes

**Bug.** The user reported that the price axis, the time axis, the current-price
line label, and the crosshair labels were all overlapping each other — "الارقام
متداخلة ببعضها ومشوشة" (numbers jumbled on top of each other and confusing).

**Two root causes:**

1. **Price axis labels had no collision detection.** `drawPriceAxis()` drew
   every mark whose Y was in `[priceTop, priceBottom]`. On a tall chart with
   a tight price range, marks could be ~10px apart — their 11px-font labels
   overlapped each other, producing the jumbled stack. The time axis already
   had X-based collision detection; the price axis didn't.

2. **Current-price label vs. crosshair price label.** Both labels sat at
   `chartRight + 1` on the price axis. The current-price label was at the
   last close's Y; the crosshair label at the cursor's Y. When the cursor
   was near the last close (within ~18px), the two colored rects partially
   covered each other and their numbers interlocked.

**Fix:**

1. `drawPriceAxis()` now skips any mark whose Y is within 12px of the
   previous drawn mark's Y — same collision-detection pattern as the time
   axis. Per-pane scale labels get the same treatment.

2. `drawCurrentPriceLine()` now skips the LABEL (but still draws the dashed
   line) when the crosshair is active and its Y is within ~22px of the last
   close. The crosshair label (drawn AFTER, with a solid background) takes
   precedence — same convention as TradingView.

Same fixes applied to the 2D edition (`chart.js` v2.18.10).

Verified: all prior suites (79 WebGL + 42 momentum + 122 countdown +
18 time-marks + v2.16/v2.17/v2.18) still green.

## 🛠 v2.20.5 — Removed the gray grip pill from pane separators

**User request.** The centered gray pill (rounded rect with 3 dots) on each
pane separator was visual clutter — dragging the separator LINE itself is
sufficient and more intuitive.

**Fix.** `drawPaneSeparators()` no longer draws the pill. The separator
line's color (`axisBorder` vs `toolbarBorder`) and thickness (1.5 vs 1)
still change on hover/drag for feedback, and the 12-pixel hit-test band
(`_hitPaneSeparator`: `pane.top ± 6px`) makes the whole line draggable
across its full width — so removing the pill doesn't affect usability,
only appearance.

Same fix applied to the 2D edition (`chart.js` v2.18.9).

Verified: all prior suites (79 WebGL + 42 momentum + 122 countdown +
18 time-marks + v2.16/v2.17/v2.18) still green.

## 🛠 v2.20.4 — Time axis no longer "jumps" when a new candle appears

**Bug.** When a new candle was appended at the live edge (real-time feed),
the time axis labels AND the vertical gridlines suddenly JUMPED by
`stepInBars` bars (e.g. 10 bars at once) instead of gliding smoothly by 1.
The user saw this as a "strange movement" in `محور الزمن وخطوط الزمن`
(the time axis and time gridlines) every time a new candle appeared.

**Root cause.** `getTimeMarks()` anchored marks to an INDEX multiple:
`startMark = ceil(firstIdx / stepInBars) * stepInBars`. When a new candle
was appended at the live edge, `firstIdx` shifted by 1 (the view scrolled
by 1 bar). If `firstIdx` crossed a `stepInBars` boundary, ALL marks
suddenly jumped to the next multiple — a `stepInBars`-bar shift in one
frame.

**Fix.** Marks are now anchored to natural **TIME boundaries** (epoch
multiples of a "nice" seconds step: 1m / 5m / 15m / 30m / 1h / 2h / 4h /
6h / 12h / 1d / 2d / 1w / 2w / 1M / 3M / 6M / 1Y). The mark TIMES don't
depend on which candle is visible, so as the chart scrolls (or new
candles appear), the marks glide smoothly by 1 bar per candle instead of
jumping in `stepInBars` chunks. The mark INDEX is computed AFTER the fact
(`idx = (markTime - firstCandleTime) / tfSec`) so `indexToX(idx)` still
positions the label correctly — and the index can be fractional, letting
a mark sit BETWEEN two candles when `stepSec` isn't a multiple of `tfSec`
(e.g. 15-min marks on a 7-min chart).

Same fix applied to the 2D edition (`chart.js` v2.18.8).

Verified: a new regression test appends a candle at the live edge and
confirms:
- All pre-existing mark TIMES are preserved (marks are TIME-anchored).
- Marks' X positions shift by exactly 1 bar (smooth scroll), not by
  `stepInBars` bars (jarring jump).
All prior suites (79 WebGL + 42 momentum + 122 countdown + v2.16/v2.17/v2.18)
still green.

## 🛠 v2.20.3 — Countdown no longer "stuck" when rAF is throttled

**Bug.** v2.20.2 fixed the "99" clamp, but users on throttled browsers
(background tab, power-saving mode, throttled iframe, or any case where
`requestAnimationFrame` fires less than once per second) saw the countdown
"stuck" at its initial value — e.g. an H1 chart at the start of the hour
showed "60" forever instead of dropping to "59" after 1 second.

**Root cause.** The countdown's 1-second `setInterval` only called
`invalidate()` (set `_needsRender = true`) and relied on the rAF loop to
consume the flag. If rAF was throttled below 1 fps, no rAF tick fired to
render the new value, so the countdown appeared frozen.

**Fix.** The `setInterval` now ALSO calls `this.render(now)` directly when
`_lastRenderTime` is more than 500ms stale — guaranteeing at least one
render per second regardless of rAF behavior. If the rAF loop IS keeping
up (the normal case), the 500ms gate fails and we don't double-render.

Same fix applied to the 2D edition (`chart.js` v2.18.7).

Verified: a new regression test replaces `requestAnimationFrame` with a
no-op (simulating a throttled tab) and confirms the countdown still
updates across a 70-second window. All prior suites (79 WebGL + 42
momentum + 122 countdown + v2.16/v2.17/v2.18) still green.

## 🛠 v2.20.2 — Countdown no longer pins at "99"

**Bug.** v2.20.1's `auto` format picked the display unit (seconds / minutes /
hours / days / weeks) based on the **timeframe** (`tfSec`). So when the last
candle's `time` was in the future (a misaligned feed, a feed that emits the
next candle ahead of time, or simply a clock skew), `remainingSec` could
exceed `tfSec` and the `Math.min(99, …)` clamp fired — the countdown pinned
at "99" for the whole period.

**Fix.** `auto` now picks the unit from `remainingSec` DIRECTLY: the largest
unit whose value still fits in 2 digits. The display is always exactly 2
digits, and the unit gracefully steps down (weeks → days → hours → minutes →
seconds) as the countdown progresses:

| remaining time | unit | example |
|---|---|---|
| < 100 s | seconds | "59".."00" |
| < 100 min | minutes | "60".."00" |
| < 100 hours | hours | "23".."00" |
| < 100 days | days | "30".."00" |
| 100+ days | weeks | "99".."00" (clamp fires only for 2+ year candles) |

So an H1 chart with a candle 2 hours in the future now shows "03" (hours)
instead of "99" (clamped minutes). Same fix applied to the 2D edition
(`chart.js` v2.18.6).

Verified: 122-check countdown regression suite passes for both editions —
including 5 future-dated scenarios (1m/5m/1h/1d, offsets up to 50 days)
that all produce a real value, never the "99" clamp.

## 🛠 v2.20.1 — Countdown fix (2 digits + actually ticking)

Two bugs reported against the floating countdown near the forming candle:

1. **Showed 3 digits instead of 2.** The default `'auto'` format switched to
   a CLOCK string ("1:05", "23:59") as soon as the remaining time exceeded
   60 seconds — 3–4 digits plus a colon, breaking the "2-digit number"
   promise from v2.13.0. `'auto'` now picks the LARGEST unit whose
   **full-period value fits in 2 digits**, so the countdown ALWAYS renders
   as exactly 2 digits:
   | timeframe | unit | example |
   |---|---|---|
   | < 100s (1s, 5s, 30s, 60s, 90s) | seconds | "59".."00" |
   | 100s..99m (1m, 5m, 15m, 30m, 1h, 90m) | minutes | "60".."00" |
   | 100m..99h (2h, 4h, 6h, 12h, 23h, 1d, 2d, 4d) | hours | "23".."00" |
   | 100h..99d (1w, 2w, 1M) | days | "07".."00" |
   | 100d+ (3M, 6M, 1Y) | weeks | "52".."00" |

   Explicit formats (`'hh:mm'`, `'mm:ss'`, `'ss'`, `'mm'`, `'hh'`) still
   behave exactly as before — only `'auto'` changed.

2. **"Didn't work" (frozen at 00).** The demo's data set the last candle's
   time to `now - tfSec`, so its close time was `now` and `remainingSec`
   was 0 (or negative → clamped to 0) from page load onward — the countdown
   had nothing to count down from. The demo now:
   - Aligns the last candle's start to `floor(now/tfSec) * tfSec` so its
     close lands on the NEXT period boundary (a real future timestamp).
   - Enables `countdown: { enabled: true }` in the constructor opts.
   - Runs a small live-feed simulation (every 2s jitters the forming
     candle's close, rolls over to a new candle at the period boundary)
     that mirrors what a real WebSocket feed would do — so the countdown
     visibly ticks and the price line moves.

Same `drawCountdown` fix applied to the 2D edition (`chart.js` v2.18.5).

## 🛠 v2.20.0 — Inertia (momentum scrolling) re-tuned

**Problem.** The momentum/inertia after a pan used to fire for *any* drag whose
release velocity was above `0.05 px/ms` (~50 px/s) — i.e. essentially every
drag, including tiny slow repositions. A 3-pixel nudge could drift the chart a
few extra bars after release, which read as *"the chart is heavy"*, even though
the renderer itself was fast.

**Fix.** Momentum now fires **only when BOTH** are true:

1. **The flick was fast.** Release velocity must exceed `_momentumFastVelocity`
   (0.45 px/ms ≈ 450 px/s) — a real flick, not a nudge.
2. **The drag started near a chart edge.** The press-down X must be inside the
   leftmost or rightmost `_momentumEdgeRatio` (20%) of the chart area. A drag
   that started in the center is treated as a precise reposition and stops dead
   on release, exactly like TradingView and Binance.

Small/slow drags in the middle → no inertia → the chart feels light and
responsive. Fast flicks from the edges still coast naturally with friction.

The new gate lives in a single helper, `BadiCharts.prototype._shouldStartMomentum(startX)`,
called from both `onMouseUp` and `onTouchEnd`. `_applyMomentum()` (the per-frame
friction step) is unchanged. The same fix is applied to the 2D edition
(`chart.js` v2.18.4) for parity.

Tuning knobs (constructor, override per-instance if needed):
```js
chart._momentumFastVelocity = 0.45; // px/ms — flick gate (lower = easier to fling)
chart._momentumEdgeRatio    = 0.20; // 0..0.5 — edge zone fraction from each side
```

## 🛠 v2.19.2 — Alignment & Interaction Fixes (field-verified)

Four real-world bugs found while testing the WebGL edition on a page whose host
holds a header bar above the chart:

1. **GL/text canvas misalignment (the "OHLC bar not at the top" bug).** The GL
   canvas was stretched over the whole host (`inset:0`) — with a header or any
   sibling above the chart canvas, ALL geometry (candles, grid, panes) rendered
   ~50-60px ABOVE the text layer, so the currency info bar appeared to float far
   below the top of the chart. The GL canvas is now measured and pinned to the
   overlay canvas's exact box (`GLBackend.syncPosition()`), re-synced on every
   resize AND layout change. Both layouts (full-bleed and header-above) verified
   pixel-exact.
2. **Indicator values showed "—".** Object-valued indicators (Bollinger Bands
   `{mid, upper, lower}` and any custom object shape) formatted to a dash. The
   legend now renders every numeric member joined by " / " with the proper price
   formatter: `Bollinger Bands: 1.09939 / 1.10266 / 1.09612`.
3. **Settings card opened at a hard-coded corner.** It now opens right AFTER the
   indicator's own legend line (TradingView-style), clamped to stay inside the
   chart — on mouse AND touch (the icon hit-test now carries its geometry).
4. **Inline settings editor closed instantly.** The browser's post-mousedown
   focus change blurred the freshly-focused `<input>` in the same tick, so
   editing a value (e.g. BB Period 20 → 30) was impossible. Focus is now
   deferred past the mousedown default action (+ `preventDefault`); verified
   end-to-end: edit → Enter → Save → recalculation.

Regression proof: 24-check Node suite (new, covers all four fixes), 79-check
browser-free GL suite, and the full v2.16/v2.17/v2.18 suites — all green. A
14-step scripted browser run (crosshair, cards, settings save, drawings, pan,
multi-pane, markers, hide/show, volume profile, status bar, reset) produced
pixel-verified screenshots for every feature.

## 🚀 NEW in v2.19.0 — THE COMPLETE STANDALONE WEBGL LIBRARY

**`chart-webgl.js` is now a FULL LIBRARY, not a layer.** One file — 450+ KB, ~10,100 lines — containing the entire feature set of the 2D edition rendered with **real WebGL**. Load it INSTEAD of `chart.js`; nothing else is required. Same public API, same indicator contract, same tools — every feature carried over 1:1.

### Architecture (one file, real GPU pipeline)

```
┌────────────────────────────────────────────────────────────────────────┐
│  GLCtx — Canvas-2D-compatible command layer (the whole chart draws     │
│  with ctx.fillRect / stroke / arc / fillText exactly like Canvas 2D —  │
│  every primitive is tessellated and batched into GPU buffers)          │
├────────────────────────────────────────────────────────────────────────┤
│  GLBackend — real WebGL context + 3 shader programs:                   │
│   · SOLID — batched triangle soup (bg, grid, fills, strokes, drawings, │
│     crosshair, cards — miter-joined stroke tessellation, dash support, │
│     Sutherland-Hodgman clipping, ear-clip concave fill triangulation)  │
│   · INST  — hardware-instanced quads (candles + volume bars:           │
│     50,000+ candles at 60fps, one drawArraysInstanced per layer)       │
│   · TEX   — textured quads (bg image/video + indicator offscreen       │
│     bitmaps uploaded as GPU textures)                                  │
│   MSAA anti-aliasing (antialias: true) — smooth lines everywhere       │
├────────────────────────────────────────────────────────────────────────┤
│  TEXT OVERLAY — user's own <canvas> stays in front (transparent), only │
│  text renders on it: axis labels, legend, crosshair chips, countdown,  │
│  cards. Pixel-crisp at any DPR (no glyph atlas needed).                │
├────────────────────────────────────────────────────────────────────────┤
│  FALLBACK — no WebGL? GLCtx forwards every call to the native 2D       │
│  context: identical features, identical look, zero risk.               │
└────────────────────────────────────────────────────────────────────────┘
```

### Usage — swap ONE URL

```html
<canvas id="chart"></canvas>
<script src="https://cdn.jsdelivr.net/gh/salahbadi19/BADI-CHARTS-V2@v2.19.0/chart-webgl.js"></script>
<script>
  const chart = new BadiCharts(document.getElementById('chart'), {
    symbol:    { label: 'BTCUSDT', priceScale: 100, decimals: 2 },
    timeframe: { label: '1H', ms: 3600000 }
  });
  chart.setData(candles);
  chart.start();
  // chart._glBackend.ready === true  → WebGL active
  // window.BadiChartsWebGL           → explicit alias
</script>
```

**Everything else is identical** — the same `addIndicator` definitions (a real Canvas-2D context for user indicator code via the offscreen cache layer, blitted to the GPU as textures), `drawOnMain`, unlimited panes, 14 drawing tools + custom tools, markers, themes, countdown, timezone/locale, crosshair callbacks, momentum, touch/pinch. If WebGL is unavailable the SAME file renders through Canvas 2D — no second file, no errors, no missing features.

### What renders on the GPU in v2.19.0
- Background + grid + separators (batched solid triangles)
- **Candlesticks — hardware instanced** (2 instances per candle: wick + body; same bitmap-snapping math as the 2D edition)
- **Volume bars — hardware instanced**
- Overlay indicator lines & fills drawn by the chart through GLCtx (miter-joined stroke tessellation + gradient fills sampled per-vertex)
- User indicator offscreen bitmaps → GPU textures (blitted every frame, re-uploaded only when rebuilt)
- Drawings (trend/channel/band/rect/fib/brush/poly/ray/arrows) through GLCtx
- Crosshair, current-price line, countdown — through GLCtx
- Axis labels, legend, cards, tooltips — crisp text overlay

### Performance (measured)
| Scenario | v2.18.3 Canvas 2D | v2.19.0 WebGL |
|----------|-------------------|---------------|
| 500 candles, static | ~0.24 ms/frame | ~0.05 ms/frame |
| 50,000 candles, static | not practical (100k+ fillRects) | **0.48–0.72 ms/frame (1400+ fps)** |
| 50,000 candles, panning | not practical | **0.53 ms/frame (1900 fps)** |
| GPU draw calls / frame | — | ~3–8 (2 instanced layers + batched solids) |

*(Node.js benchmark with mock GL measures the real CPU-side cost — instance building, tessellation, batching. In-browser (SwiftShader) the demo runs at 60fps with 5,000 candles + 5 indicators; a hardware GPU removes rasterization cost entirely.)*

### Verify it is active
```js
!!chart._glBackend && chart._glBackend.ready   // true = WebGL
chart.ctx.__isGL                               // true = GPU command layer
```

---

## ⚠️ What changed in v2.18.3

**Path2D batching — the "WebGL-like" Canvas 2D optimization.** Instead of calling `ctx.fillRect()` per candle per rect and `ctx.stroke()` per grid line, all rects/lines are built into `Path2D` objects in JS, then `fill()`/`stroke()`d in a single call. The browser rasterizes each batch in ONE GPU pass.

### Why this matters
The question was asked: "shouldn't we use WebGL for performance?" WebGL IS faster for batched rendering, but migrating an 8000-line Canvas 2D library to WebGL is a **full rewrite** (weeks of work, loss of simplicity, harder debugging). `Path2D` batching gives the **same batching benefit** as WebGL's instanced rendering — fewer pipeline submissions, one GPU pass per batch — **with zero rewrite cost** and works in every browser.

### What changed
1. **`drawCandles`: ~1000 `fillRect` → 2 `fill(path)` calls.** All bull-candle rects (wick + body) are appended to one `Path2D`, all bear-candle rects to another. Two `ctx.fill(path)` calls rasterize everything. The GPU processes each color in a single pass instead of 500 separate pipeline submissions.
2. **`drawGrid`: ~30 `stroke` → 2 `stroke(path)` calls.** All horizontal grid lines go into one `Path2D`, all vertical into another. Two `ctx.stroke(path)` calls.

### Combined with v2.18.2
A bare-candle chart now does the **absolute minimum** number of canvas API calls per frame:
- `drawBackground`: 1 `fillRect` (full canvas)
- `drawGrid`: 2 `stroke(path)` (H + V grid lines)
- `drawCandles`: 2 `fill(path)` (bull + bear rects)
- `drawPriceAxis` / `drawTimeAxis`: ~10 `fillText` (text can't be batched)
- `drawCrosshair`: 2 `stroke` (only when hovering)

**Total: ~17 canvas API calls per frame** for a bare-candle chart with 500 visible candles. Previously: ~1030. This is a **60× reduction** in canvas pipeline submissions.

No API changes. Pixel output is identical (verified by regression tests). All v2.16/v2.17/v2.17.1/v2.18.0/v2.18.1/v2.18.2 tests pass.

### Future: WebGL / OffscreenCanvas
If even this isn't enough for your use case (e.g. 50,000+ visible candles, or dozens of animated indicators with heavy custom render code), the next steps would be:
- **OffscreenCanvas + Web Worker**: moves rendering off the main thread so the UI never stutters. ~95% browser support. Moderate complexity.
- **WebGL renderer**: a full GPU rewrite. Maximum performance, but a major project. Would be a separate module (`chart-webgl.js`) sharing the same API.

---

## ⚠️ What changed in v2.18.2

**Performance: hot-path optimizations for the "just candles" case** — the library was reported heavy during pan/zoom even with NO indicators active.

### Root cause
The render pipeline ran several draw passes **unconditionally**, and `drawCandles()` called `this.priceToY(p)` — a chain of 5 function calls (`logicalToCoordinate` → `isEmpty` → `bottomMarginPx` → `internalHeight` → `isInverted`) — **four times per candle** (open, high, low, close). For 500 visible candles that's ~2000 function calls per frame, every mousemove during pan.

### Fixes
1. **`drawCandles`: precomputed price→Y transform.** The entire call chain collapses to `y = A - B * p` (two arithmetic ops). The constants `A` and `B` are derived once at the top of `drawCandles` from the price scale's current range/margins/height. For 500 candles: **2000 function calls → 2000 multiply-subtracts** per frame.
2. **`drawCandles`: two-pass batched `fillStyle`.** Bull candles are drawn in one pass (fillStyle set once), bear candles in a second pass (fillStyle set once). Previously fillStyle was set per-candle — ~500 state changes per frame, now 2. Each state change can trigger a canvas pipeline flush; minimizing them is a measurable win.
3. **`drawIndicators`: early-return when no overlay indicators.** The old code unconditionally allocated the helpers object (a large literal with ~15 closures: `drawOnMain`, `drawLine`, `drawGradientArea`, `indexToX`, `priceToY`, ...) and did `ctx.save/beginPath/rect/clip/restore` — all per frame, for nothing, on a chart with zero overlay indicators. The guard skips all of it.
4. **`drawDrawings`: early-return when no drawings.** The old code allocated the large `drawOne` closure (a switch with ~10 cases) every frame even when `this.drawings.length === 0` and no drawing was in progress. The guard skips the allocation.

### Net effect
On a bare-candle chart (no indicators, no drawings), the render pipeline now does the **minimum work possible**: background, grid, candles, axes, crosshair — with no wasted allocations or function calls. Pan/zoom is significantly lighter. No API changes; pixel output is identical (verified by regression tests).

---

## ⚠️ What changed in v2.18.1

**Performance: guarded bitmap resize in `_safeRenderIndicator`** — eliminates a hidden per-frame reallocation during pan/zoom.

### What was wrong
In the indicator cache-rebuild branch, the line:
```js
entry.canvas.width = pxW; entry.canvas.height = pxH;
```
ran on EVERY rebuild. Assigning `canvas.width` (even to the SAME value) **clears the bitmap AND forces the browser to allocate a fresh backing store**. During pan/zoom the indicator's stamp changes every frame (because `barSpacing` moves), so the cache rebuilds 60×/sec — but the region SIZE (pxW × pxH) rarely changes at all. The old code was reallocating an identical-size bitmap 60 times per second for nothing.

### What changed
```js
if (entry.canvas.width  !== pxW) entry.canvas.width  = pxW;
if (entry.canvas.height !== pxH) entry.canvas.height = pxH;
```
The bitmap is now resized ONLY when its dimensions actually change. The `clearRect` immediately below already wipes stale pixels, so the visual result is identical. Pan/zoom is noticeably lighter, especially on charts with many indicators (each indicator's cache was independently paying this cost).

Also: the file header banner comment is now in sync with `VERSION` (both say `2.18.x`). The CDN cache for v2.18.0 was briefly serving a stale banner line — the source was already correct; this release makes it unambiguous.

No breaking API changes. Purely a perf optimization.

---

## ⚠️ What changed in v2.18.0

**`helpers.drawOnMain(fn)` — pane indicators can now draw on the MAIN candle chart**, using `priceToY` / `indexToX` of the price area, NOT clipped to the pane.

### What was wrong
A pane indicator (RSI, MACD, Stochastic, ...) only ever received **pane-scale** helpers (`helpers.paneToY(v)` maps into the pane's own 0–100 / oscillator window), and its `ctx` was **clipped to the pane rect**. There was no way for a pane indicator to project a price-level line, a candle marker, or a touch-index vertical line onto the candle chart itself: anything drawn at a `priceToY` Y-coordinate was erased by the pane clip. This was a library limitation, not a bug in user code — `helpers.priceToY` existed but was unusable from inside a pane render because of the clip.

### What changed
1. **New helper: `h.drawOnMain(fn)`** — register a callback that runs once per frame, AFTER `drawPane()`, against the **live main-chart ctx clipped to the price area** (NOT the pane). The callback receives `(mctx, mh)` where `mh` exposes `priceToY`, `indexToX`, `chartLeft`, `chartRight`, `priceTop`, `priceBottom`, `firstIdx`, `lastIdx`, `barSpacing`, `dpr`, `candles`, `THEME`.
2. **Per-frame replay, cache-safe.** Callbacks are stored on the indicator's state (`state._mainDraws`) and replayed every frame — including **cache-HIT frames** where the indicator's `render()` was NOT called. They are only replaced when the offscreen cache rebuilds (i.e. when `render()` actually runs). Removing the indicator drops its callbacks.
3. **Sandboxed.** A throw inside a `drawOnMain` callback is swallowed (logged when `BADI_DEBUG = true`), so one broken callback never kills the chart or hides sibling callbacks.
4. **Z-order.** The callback runs AFTER `drawIndicators()` (the overlay layer) and `drawPane()` (pane indicators), so it draws on TOP of overlays (Bollinger Bands, SMA, EMA) and BELOW markers, user drawings, the crosshair and the price-axis labels.

### Usage — pane indicator draws a price level on the candle chart

```js
chart.addIndicator({
  id: 'rsi', label: 'RSI 14', type: 'pane', color: '#d32f53',
  settings: { period: 14 },
  calculate: function (c, s) { /* ...RSI calc... */ return out; },
  getRange:  function () { return { min: 0, max: 100 }; },
  render: function (ctx, v, h, s, state) {
    // 1. Draw the RSI line INSIDE the pane (as before).
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = h.firstIdx; i <= h.lastIdx; i++) {
      if (v[i] === null) { started = false; continue; }
      const x = h.indexToX(i), y = h.paneToY(v[i]);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 2. Project a price-level line onto the CANDLE chart from inside the pane.
    //    Find the last candle whose RSI crossed 70 and draw a horizontal line
    //    at that candle's CLOSE price, spanning from the touch index to the
    //    last visible candle.
    let touchIdx = -1;
    for (let i = h.lastIdx; i >= h.firstIdx; i--) {
      if (v[i] !== null && v[i] >= 70) { touchIdx = i; break; }
    }
    if (touchIdx >= 0) {
      const level = h.candles[touchIdx].close;
      h.drawOnMain(function (mctx, mh) {
        const y  = mh.priceToY(level);
        const x1 = mh.indexToX(touchIdx);
        const x2 = mh.indexToX(mh.lastIdx);
        mctx.strokeStyle = '#ff5252';
        mctx.lineWidth = 1;
        mctx.setLineDash([4, 3]);
        mctx.beginPath();
        mctx.moveTo(x1, y);
        mctx.lineTo(x2, y);
        mctx.stroke();
        mctx.setLineDash([]);
      });
    }
  }
});
```

### RSI (pane) + Bollinger Bands (overlay) in ONE chart

Both indicator types can be active at the same time and render correctly — they were always independent (overlays render in `drawIndicators()` with `kind: 'overlay'`; panes in `drawPane()` with `kind: 'pane'`), but `drawOnMain()` now lets a pane indicator also draw on the candle layer that the overlay lives on. Example:

```js
// Overlay: Bollinger Bands on the candle chart
chart.addIndicator({
  id: 'bb', label: 'BB 20 2σ', type: 'overlay',
  settings: { period: 20, mult: 2 },
  calculate: function (c, s) {
    const p = s.period, m = s.mult, out = { upper: [], mid: [], lower: [] };
    for (let i = 0; i < c.length; i++) {
      if (i < p - 1) { out.upper[i] = out.mid[i] = out.lower[i] = null; continue; }
      let sum = 0;
      for (let k = i - p + 1; k <= i; k++) sum += c[k].close;
      const mean = sum / p;
      let sq = 0;
      for (let k = i - p + 1; k <= i; k++) sq += (c[k].close - mean) ** 2;
      const sd = Math.sqrt(sq / p);
      out.upper[i] = mean + m * sd;
      out.mid[i]   = mean;
      out.lower[i] = mean - m * sd;
    }
    return out;
  },
  render: function (ctx, v, h, s) {
    ctx.lineWidth = 1; ctx.strokeStyle = '#9c27b0';
    ['upper', 'lower'].forEach(function (k) {
      ctx.beginPath();
      let st = false;
      for (let i = h.firstIdx; i <= h.lastIdx; i++) {
        if (v[k][i] === null) { st = false; continue; }
        const x = h.indexToX(i), y = h.priceToY(v[k][i]);
        if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.strokeStyle = '#ce93d8'; ctx.setLineDash([2, 2]);
    ctx.beginPath();
    let st = false;
    for (let i = h.firstIdx; i <= h.lastIdx; i++) {
      if (v.mid[i] === null) { st = false; continue; }
      const x = h.indexToX(i), y = h.priceToY(v.mid[i]);
      if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }
});

// Pane: RSI 14 — also projects a price-level line via h.drawOnMain()
chart.addIndicator({
  id: 'rsi', label: 'RSI 14', type: 'pane', color: '#d32f53',
  settings: { period: 14 },
  calculate: function (c, s) { /* ... */ },
  getRange:  function () { return { min: 0, max: 100 }; },
  render:    function (ctx, v, h, s, state) {
    /* ...draw RSI line in pane... */
    /* ...h.drawOnMain(function (mctx, mh) { ...priceToY(level)... })... */
  }
});
```

Both indicators render at the same time: Bollinger Bands inside the price area, RSI in its own pane below, and any `drawOnMain()` callbacks from RSI replay on top of the Bollinger Bands (and the candles) inside the price area.

No breaking API changes. `helpers.drawOnMain()` is purely additive — existing indicators (overlay, pane, volume) keep working unchanged.

---

## ⚠️ What changed in v2.17.1

**Unlimited bottom indicators** — answers the question "how many bottom indicators can I add?" with **as many as you want, and every single one draws**.

### What was wrong
Pane windows were hard-capped at **6** (`MAX_PANES = 6` in `updateLayout()`). A 7th active pane-type indicator stayed registered in the API (`getActiveIndicators()` listed it, `setIndicatorSettings()` worked) but got **no window** — it rendered nowhere, with only a console warning as a clue. To users this looked exactly like "I added a bottom indicator and it doesn't show". The cap existed because the pane heights were built on a **fixed 60px minimum per pane**: 7 × 60px already overflowed the pane budget on a 500px-tall canvas, so the code protected itself by dropping panes.

### What changed
1. **No cap.** Every visible pane-type indicator gets its own window — 7, 12 or 20 bottom indicators all render, stacked between the price area and the volume strip. `MAX_PANES` and its overflow warning are gone.
2. **Adaptive pane heights.** The 60px comfort floor holds while `N × 60` fits the pane budget. Beyond that the floor yields **down to 16px per pane** (`ABS_MIN_PANE_H`) — small but fully drawn, with its own grid, scale labels and separator. The price area keeps its guaranteed 120px minimum for any pane count.
3. **Last-resort squeeze (8px floor).** On a tiny canvas with very many panes, a final proportional squeeze keeps the price area positive and every height ≥ 8px — **NaN coordinates are impossible in any code path** (verified by stress tests).
4. **Area-based rebuild budget.** The fixed 2-rebuilds-per-frame budget dates from v2.12 when indicator bitmaps were full-screen sized. Since v2.16 bitmaps are region-sized (a pane bitmap is ~10× smaller than the screen), so the old count budget made panes appear only 2-per-frame after a bulk add. The budget now measures bitmap **area** (~2 full-screen areas per frame): a dozen pane indicators rebuild in ONE frame; heavy overlay bursts are still throttled. The 400ms interaction bypass is unchanged.
5. **Micro-pane labels.** The indicator label card is skipped on panes shorter than 22px (it would bleed into the pane below).

Resize limits are unchanged (user drag clamps to 60–200px; the proportional shrink protects the price area when the user makes many panes tall). All behavior is covered by `test_chart_v2_17_1_unlimited_panes.js`: 12 panes on a 900×500 canvas (all render, no overlap, all rasterized inside their own band), progressive 1→12 add, 10 panes on a 360×320 canvas, 8 user-resized 200px panes, and volume + overlay + 8 panes combined.

**How many indicators are supported?** Overlays and pane indicators: **unlimited** (the offscreen-cache limit scales with the active count since v2.14.0). Bottom panes are now unlimited too — the only real limit is that each pane still needs a few pixels of height, which the adaptive floors manage automatically.

---

## ⚠️ What changed in v2.17.0

**Critical pane-indicator rendering fix** — resolves the reported "bottom indicators are mutually exclusive: enabling one stops the other, disabling it brings the other back".

### Root cause
`helpers.drawLine(ctx, values, opts)` (introduced in v2.16.0) and `helpers.drawGradientArea(...)` ALWAYS projected indicator values through the **price scale** — regardless of where the indicator renders. A pane indicator (RSI 0–100 on a 95,000-priced symbol) rasterized its line at price-area Y coordinates, far outside its own pane rect, and the pane clip erased it: an **empty pane window** (label + axis rendered, line didn't). Toggling a second pane indicator shifted the pane geometry, which decided **which** of the two windows happened to show its line — the reported one-works/one-doesn't exclusivity. Verified by rasterized-coordinate tests: on v2.16.0 an RSI line landed at Y [175.8–367.0] for a pane band [244–304] (5 points even leaked into the neighboring pane), a MACD line landed entirely BELOW its pane [418.9–474.0] vs [308–368], and a volume line landed at Y ≈ −6976.

### Fixes
1. **Context-aware value→Y mapping** — `_indicatorHelpers()` now takes a `kind` (`'overlay' | 'pane' | 'volume'`), passed by `drawIndicators` / `drawPane` / `drawVolume` respectively. `helpers.drawLine` and `helpers.drawGradientArea` map values through the CURRENT context's scale (`priceToY` / the pane's OWN scale via `paneToY` / `volToY`) and `drawGradientArea` closes its fill to that context's bottom edge (pane bottom / volume bottom / price bottom). Overlays are pixel-identical to v2.16.0; pane and volume indicators finally rasterize inside their own region.
2. **`downsampleLineSegments` accepts a `yMap`** — the RDP downsampler maps points through the caller's mapper instead of hardcoding `priceToY`.
3. **`helpers.paneToY` fallback removed** — the silent `|| self.paneScale` fallback mapped a pane-2 indicator through pane-1's scale when the pane lookup failed (the v2.14.0 bug through the back door). With no pane scale the safe output is the pane's own top edge.
4. **Stamp no longer churns overlays** — only pane-type indicators include their pane's range in the offscreen-cache stamp. Previously every pane[0] rescale rebuilt every overlay/volume bitmap for nothing (`this.paneScale` leaked into their stamps).
5. **Stale-region blit guard** — when a rebuild is deferred (frame budget) but the indicator's region moved (pane added/removed/resized), the old bitmap is no longer blitted into the new rect scaled/ghosted; the deferred rebuild lands on the next frame instead.

No breaking API changes. All three render contexts are covered by automated rasterized-coordinate regression tests (pane-in-pane, overlay-in-price, volume-in-strip, no cross-pane leakage, gradient closes to pane bottom).

---

## ⚠️ What changed in v2.16.0

**Rendering quality + memory + robustness release.** A 23-point audit of the v2.15.0 file (drawing, performance, robustness — no candlestick-pattern feedback) is addressed in full. Headline improvements:

### Rendering quality
1. **Pixel-snap consistency** — every 1px horizontal/vertical line now snaps to the BITMAP grid via `snapToH`/`snapToV`, not to a CSS `Math.floor(y) + 0.5` that only lands on a true device pixel when dpr is an integer. Grid, separators, current-price line, crosshair, hline/vline/fib are all crisp on 1.25 / 1.5 DPR (Windows/HiDPI laptops).
2. **Time-axis label width** — measured with `ctx.measureText` instead of `label.length * 6 + 8` (broke on bold fonts, wide glyphs, future Arabic labels). Collision detection actually works now.
3. **Crosshair on touch** — the blanket `if (_isMobile) return` was a fully disabled feature; mobile now shows a thinner-dashed crosshair + OHLC readout.
4. **Crosshair time label clamp** — clamped to stay inside the canvas (left/right edges no longer clip outside).
5. **Indicator line downsampling** — at extreme zoom-out (>2 visible bars per pixel), a light Ramer-Douglas-Peucker pass collapses collinear interior segments. New `helpers.drawLine(ctx, values, opts)` exposes it; `drawGradientArea` uses it internally. (v2.17.0 fix: both helpers now map values through the CURRENT context's scale — see the v2.17.0 changelog; in v2.16.0 they always used the price scale, which broke pane/volume indicators that used them.)
6. **Gradient area close path** — closes back to the FIRST index that actually had a value, not to `firstIdx` (which could be `null` for warm-up bars).
7. **Min price area safety loop** — only gives up when EVERY pane is at the 28px floor (was: when the largest was, so a single tall pane could starve the price area).

### Performance & memory
8. **Indicator offscreen canvas sized to REGION** — overlay → price area, pane → that pane's rect, volume → volume strip. On a 4K monitor with 8 indicators, ~250MB of GPU memory drops to ~10-20MB. The render context is translated by `-region.x/-region.y` so user render code keeps using chart CSS coordinates.
9. **Stamp split** — `_dataVersion` used to bump on every tick, so in the LIVE scenario every indicator rebuilt its bitmap every frame and the entire v2.11 cache pipeline was useless. New `_contentVersion` bumps ONLY when data is appended/replaced; the stamp's last-OHLC field still catches in-place updates of the forming candle. Hovering with a stable last tick is now a true `drawImage` blit.
10. **ResizeObserver freezing CSS canvas fixed** — pinning `canvas.style.width = w+'px'` was freezing responsive layouts (`width:100%` got overwritten). Pin only fires when the canvas has NO computed CSS size.
11. **Wheel `deltaMode` (Firefox)** — line-mode deltaY is multiplied by 33 before the exp curve; zoom now matches Chrome (was ~30× weaker per notch).
12. **`destroy()` video leak fixed** — background video is paused + its `timeupdate` listener removed + src-cleared. Previously the `<video>` kept playing in a closure on a "dead" chart.

### Robustness
13. **Synthetic mouse after touch** — a 600ms guard after `touchend` drops the synthetic mousedown/mousemove/mouseup that mobile browsers always fire. A tap no longer starts a preview, cancels it, then re-starts it via the synthetic mouse.
14. **Late-tick window configurable** — `opts.lateUpdateWindow` (default 300, set 0 to disable). Stale ticks older than the window are counted (one warning per session) instead of silently dropped.
15. **Data validation** — invalid candles are counted + warned once per `setData`; negative volume clamped to 0; `open = 0` is repaired from the previous close (or low, or 1) so the legend's `changePct` no longer shows `Infinity%` or `NaN%`.
16. **Drawings anchored by time** — every drawing now stores `t1/t2/tIdx/tPoints` (unix seconds) alongside its index. Render + hit-test re-derive the index from the time, so after a 50k trim that shifts all indices, your trend lines stay on the SAME candle.
17. **Band hit-test** — only the top/bottom EDGES capture a click; the interior is pannable like a Rectangle.
18. **Text tool editor** — double-click a text drawing opens an inline DOM `<input>` (Enter/blur commits, Esc cancels). The v2.14.0 removal of `prompt()` had left text drawings permanently stuck at their default label.
19. **Timezone / locale** — constructor accepts `opts.timezone` (IANA, e.g. `'Asia/Riyadh'`) and `opts.locale` (BCP-47, e.g. `'ar-SA'`). Tick marks + crosshair time + countdown render in the local timezone/locale; data stays in Unix seconds. Default behavior (UTC + English short months) is unchanged.

### Code quality
20. **Dead `resetView()` removed** — the first of two definitions was unreachable.
21. **`window.THEME` re-published every render** — external code reading it now sees the live instance theme (was pinned to a stale default at module load).
22. **Settings card auto-discovers ALL keys** — `period/mult/fast/slow/signal/bins/color` stay first with friendly labels; every other key in `state.settings` is auto-labeled and editable (camelCase/snake_case → "Camel Case").
23. **Local `pad2` in `drawCountdown` no longer shadows the module-level helper.**

No breaking API changes. All new opts are optional. 9 automated assertions cover the headline items.

---

## ⚠️ What changed in v2.15.0

**Regression-fix release.** Field testing of v2.14.0 found 10 regressions introduced by the audit fixes, plus several audit items that had survived untouched. All fixed and covered by a 57-assertion automated test suite.

### Regressions introduced by v2.14.0 (all fixed)
1. **Wheel zoom direction inverted** — wheel UP now zooms IN again (v2.14.0 flipped the sign for the plain wheel while leaving ctrl+wheel correct; both now use `-e.deltaY`). Horizontal wheel panning uses the same "content follows the pointer" metaphor as mouse-drag (verified consistent in tests).
2. **`update()` fast path skipped normalization** — the in-place tick branch stored the RAW candle: Binance STRING prices (`"124.00"`) were never converted to numbers, high/low were never corrected against open/close, NaN slipped through, and the chart kept a LIVE REFERENCE to the caller's object (mutating it mutated the chart's history). Every tick passes through `_norm()` again; the stored object is always a private clone.
3. **History pinning was doubly wrong** — the condition (`rightOffset > 12` = AT the live edge) and the sign (`+=`) were both backwards: appending a candle scrolled the view FORWARD two bars. Correct rule: `rightOffset -= appended` **only when `rightOffset < 0`** (browsing history, last candle off-screen); at the live edge the view follows normally. `_lastDataLen` is now also reset by `setData`/`setSymbol`/`setTimeframe` (a symbol change used to make the first update jump violently).
4. **`layout.paneBottom` broke the time axis** — the new alias pointed at the PANE-STACK bottom, so with panes + volume the time axis, crosshair and price-axis strip dropped INTO the volume strip. It is `chartBottom` again (the pane-stack bottom stays on `this.paneBottom`).
5. **DPR cap lost** — `resize()` re-read `devicePixelRatio` without the cap; a DPR-3 phone rendered (and cached every indicator bitmap) at 3×. Cap re-applied on every re-read (mobile 2, desktop 3).
6. **ResizeObserver growth loop** — a canvas WITHOUT a CSS size grows its bitmap by DPR on every observer callback (setting `canvas.width` changes the display size → observer fires again → …). The CSS size is now pinned from the first measurement and no-op resizes are skipped.
7. **Touch pane-resize stuck forever** — `_paneResize` survived `touchend`, so after one separator touch every later single-finger drag kept resizing the pane instead of panning. Cleared on touchend (and touchcancel).
8. **Price formats misused `PriceFormatter(base, minMove)`** — `setSymbol` passed `decimals` AS `minMove`: `decimals: 2` rounded every price to multiples of **0.02**, `decimals: 0` produced NaN. The LWC contract is `base = 10^decimals, minMove = 1`; `decimals: 0` now rounds (1234.56 → "1235", was silently floored to "1234"). Pane scales: base follows `10^dec` (was a fixed 100 → MACD on forex graded "0.0"); the pane auto-range scans multi-series objects (`{macd, signal, hist}`) instead of falling back to 0..100; the pane header reads `values.macd` (showed "—" forever) formatted through the pane's own formatter. A legacy `priceScale` that is not 2^a·5^b (3, 7, 12.5…) snaps to the nearest power of 10 instead of throwing `unexpected base` inside the render frame.
9. **Finished drawings stayed orange** — the preview color (`drawingActive`) was baked into the drawing object and `finishDrawing` only filled a MISSING color. The preview look now comes from the render path; the object stores no color. (Custom-tool generic drawings fall back to the default drawing color.)
10. **Right-click deleted the selected drawing from anywhere** — the click position is now hit-tested (`findDrawingAt`) first; only a drawing under the cursor is deleted, clicking empty space keeps the selection.

### Audit items that v2.14.0 had missed (now done)
11. **Countdown kept the loop at 60fps** — the countdown was listed as a "continuous" condition, silently defeating render-on-demand. The 1-second interval alone drives it now (measured: 1–2 renders per 1.25s, not 75).
12. **Missing `invalidate()`** — `addDrawing`, `clearDrawings`, `removeDrawing`, `selectDrawingById`, `removeMarker` now repaint immediately; background images repaint on `onload` (with render-on-demand nothing else would trigger the frame).
13. **`computeIndicators()` batched once per frame** — update()/append() queue ONE compute per animation frame (`_scheduleCompute`); a burst of 5 WebSocket ticks recomputes indicators once, not 5×.
14. **Weekly/monthly time snapping removed** — flooring a weekly candle onto the epoch-week boundary moved it to THURSDAY, and a fixed-ms "month" merged two real months into one Map key and DROPPED candles. `snapTime` is off automatically for timeframes ≥ 1 week (override with `{label, ms, snapTime}`); marker time→index mapping respects it too. The 50,000-candle cap now trims in one batched splice per 1,000 candles (was `shift()` per tick).
15. **Time axis & crosshair formats** — the crosshair label derives its format from `timeframe.ms` (≥1d → date, <1m → HH:MM:SS, else MM-DD HH:MM) instead of matching the strings '1D'/'1W'/'1S'; time-axis steps come from a nice-numbers table (1, 2, 3, 5, 10, 15, 20, 30, 60…) instead of powers of two; `getTimeMarks()` is cached per frame (was rebuilt up to 3× per frame) with invalidation riding on `autoScale()`/data changes.
16. **Rebuild budget bypassed for wheel/pinch/momentum too** — those change `barSpacing` every frame without entering a drag state, so indicators 3+ lagged one frame behind. Any fast interaction opens a 400ms budget-bypass window.
17. **`Indicators.volumeProfile`** — a zero price range (every candle high === low) kept ALL the volume (was discarded, bins all 0); window bounds are clamped into the array (no NaN from out-of-range indices); `numBins` clamped 1..500.
18. **`prompt()` removed from settings** — editing a settings-card field opens an inline DOM `<input>` positioned exactly over the field box (Enter/blur commits, Esc cancels, headless-safe: silently keeps the current value when no `document`).
19. **Hidden canvas at construction** — W/H fell back to finite defaults (canvas bitmap size or 800×450) instead of `undefined` → NaN layout until the first observer callback.
20. **`destroy()` removes the window resize listener** — it is registered in `_listeners` now (it previously lived outside and kept re-running `resize()` on a destroyed chart); the queued indicator computation is cancelled and the field editor is closed as well.
21. **`hline`/`vline`/`text` placement goes through `setTool('cursor')`** — `onToolChange` fires and the chart repaints immediately.
22. Header version comment updated (was still v2.11.0).

No breaking API changes. 57 automated assertions cover every item above.

---

## ⚠️ What changed in v2.14.0

**Major correctness & robustness release — 40+ fixes from a full external audit.** The headline: **the second pane indicator now actually renders** (this was the reported bug: with 2+ pane indicators, each pane's indicator mapped its values through the FIRST pane's scale and was clipped away — "one draws, one never appears").

### Critical fixes (breaking/wrong results)
1. **Multi-pane scale (`paneToY`) — the reported bug.** Each pane indicator now maps values through **its own** pane scale (`helpers.paneScale`, re-pointed per pane by `drawPane()`), not `_panes[0]`'s. Verified pixel-level: MACD in pane 2 now draws its line + histogram + signal inside its own window.
2. **Countdown timer — real Unix time.** The old code subtracted `performance.now()/1000` (seconds since PAGE LOAD) from a Unix candle time — the countdown was garbage. Now `Date.now()/1000`. Format `auto` also upgraded: `hh:mm` when ≥1h remains, `mm:ss` when ≥1m, `ss` below (the old `mm` pinned at "99" for H4/D1).
3. **`hitTestDrawing` text branch** used a bare `ctx` → ReferenceError on every click near a text drawing, blocking pan/drag whenever any text drawing existed.
4. **`isBaseDecimal`** now checks power-of-**10** (LWC-accurate) instead of power-of-2 — decimal bases like 100 no longer produce 0.125-style grid ticks.
5. **`resize()` calls `autoScale()`** — grid marks no longer computed against the old height after any resize. Plus: ResizeObserver (catches container resizes), DPR re-read (moving between screens), and hidden-canvas (0×0) resizes are skipped instead of corrupting layout.

### Indicator math
6. **`Indicators.rsi`**: pure uptrend now = **100** (was 99.01), pure downtrend = **0**; flat = 50. Correct Wilder boundaries.
7. **`Indicators.macd`**: the SIGNAL EMA is computed over the compacted valid segment only — pre-warmup nulls were previously converted to ZEROS and dragged the signal/histogram wrong for hundreds of bars.
8. **`Indicators.sma/ema/bollinger`**: NaN/null inputs no longer poison rolling sums; invalid periods (≤0) return all-null instead of NaN cascades; Bollinger is O(N) rolling variance (was O(N·period)).
9. **Hiding an indicator** now releases its pane window / scale contribution (`updateLayout + computeIndicators + autoScale` were missing). `_safeRenderIndicator` also hard-guards `visible === false`.
10. **`getIndicators()`** no longer crashes on an indicator without `color` (`this.theme` → `self.theme`); missing `type` defaults to `overlay` consistently.
11. **`calculate()` returning null** = "not enough data yet" — no more error badge + toast + eternal retry; only thrown errors are flagged. A persistently failing `render()` backs off after 3 failures (5s cooldown) instead of burning 60fps forever.

### Performance & cache
12. **`computeIndicators()` no longer bumps the scene version** — that invalidated EVERY indicator's offscreen cache on EVERY `update()` tick (hidden rebuild storm). Cache invalidation now rides on `_dataVersion` inside the stamp.
13. **Rebuild budget bypassed during active drag** — pan/zoom used to leave the 3rd+ indicators showing stale (offset) bitmaps while the budget throttled rebuilds. During interaction, everything rebuilds in-frame; the budget still protects cold-start bursts.
14. **Cache limit scales with indicator count** (was a hard 8 — thrashed violently with 9+ indicators, allocating + rebuilding every frame).
15. **`computeTimeWeights()` + `TimeTickMarks` deleted** — pure dead code doing O(N) work with 2 `Date` allocations per candle on every tick; their output (`_timePoints`) was never read.
16. **`getRange()` hook results cached** per (dataVersion, settings) — previously ran on every mousemove during drag.
17. **Pane layout budget**: volume strip subtracted first; proportional shrink (no forced minimum that produced 0/negative price height → NaN); hard cap of 6 panes; last-resort pass guarantees the price area.
18. **`update()` accepts late corrections** of the last 300 candles by time match (the WebSocket "candle closed" message that arrives after the next bar opened). Appending pins the view when you're browsing history (`rightOffset > 12`), follows the live edge otherwise.

### Security & environment
19. **Node/SSR safe**: globals guarded (`typeof window`) — `require('chart.js')` works; previously the whole file threw ReferenceError.
20. **Keyboard shortcuts sanitized**: ignored while typing in inputs/textareas/contentEditable, ignored with Ctrl/Meta/Alt (Ctrl+R, Ctrl+-), and only the last-hovered chart reacts on multi-chart pages.
21. **`destroy()` really destroys** — removes every window + canvas listener (stored refs now), disconnects ResizeObserver, stops loop + countdown. `start()` twice no longer runs two loops.
22. **Delete key / right-click delete the SELECTED drawing** (the old code deleted `hoverDrawing`, only set in eraser mode — dead in practice). Touch deletes via the drawing panel.

### Input & UX
23. **Wheel**: zoom factor follows |deltaY| (trackpad fling ≡ gentle, no more fixed 10% steps), deltaX pans, Ctrl+wheel (pinch) zooms, and `preventDefault` only fires inside the chart (page scroll no longer hijacked at the edges).
24. **Only the left mouse button** starts drags; window-level `mousemove` keeps drags alive when the pointer leaves the canvas mid-gesture.
25. **Momentum dt clamped to 50ms** — returning to a hidden tab no longer flings the chart across the dataset.
26. **Touch can reach everything**: indicator cards, settings card, drawing properties panel and pane-resize dividers all route through touch now; `mouseInside` clears on touchend (no more legend stuck on the last candle).
27. **Mobile detection via `pointer: coarse`** — touch laptops keep the crosshair and full framerate; the 33ms mobile throttle is removed (render-on-demand already handles idle).
28. **Status bar honest**: fabricated Bid/Ask/Spread removed; "24h" stats are computed from actual TIME (24h of bars for the current timeframe), labeled accordingly.
29. **Crosshair**: shows the PANE's value when over a pane (was a meaningless price); follows the cursor into the future area; `onCrosshair(cb)` now actually fires (supports multiple listeners + `offCrosshair`) — and no longer throws on fractional indexes.
30. **Pane grips render after the pane background** (the pill was half-covered before).

### Other fixes
31. `setData(candles, {keepView:true})`; `fit()` really fits all data (was just resetView).
32. Expanded indicator card closes on outside click; `Escape`/right-click/finish go through `setTool()` (onToolChange now fires).
33. `setSymbol`/`setTimeframe` clear markers + drawings + selection/preview state; invalid `timeframe.ms` falls back to 60s (was NaN labels).
34. Pane scale formatter derives base/decimals from the pane's own range (small-valued panes no longer show "0.00").
35. `includeInAutoScale: false` option for indicators/drawings that would crush the candle scale; flat-market autoScale is now RELATIVE (precise assets no longer jump to -1..1).
36. All-zero volume no longer renders full-height columns; hidden volume frees its 64px strip; no-volume layout no longer wastes 8px.
37. Markers with a future time are hidden instead of sticking to the last candle; `withAlpha()` replaces all `color + '22'` concatenations (works with named/rgba colors); duplicate drawing offsets ALL coordinate families; drawing handle grab radius 12px; misleading "double-click to edit" toast removed; `layout.paneBottom` alias fixed (8 sites used a property that never existed); `touch-action: none` on canvas; background video repaints while playing; image `crossOrigin` no longer forced.

No breaking API changes. `require()` in Node now works.

---

## ⚠️ What changed in v2.13.0

**Multi-pane indicators + floating countdown timer.** Each pane indicator (RSI, MACD, Stoch…) now gets its OWN small window below the price area (TradingView-style) instead of all sharing one. Plus a 2-digit countdown that floats next to the forming candle.

1. **Multiple pane indicators, each in its own window.** Add `chart.addIndicator({type:'pane', ...})` for RSI, then again for MACD — they render in **separate stacked panes**, each with its own background, grid, scale, mini price-axis labels, separator, and grab handle. They are NOT overlaid on each other. The price area shrinks to fit all panes (guaranteed ≥120px); each pane is clamped to [60, 200]px. Panning/zooming stays smooth — all panes share the time axis and the offscreen-cache pipeline.
   ```js
   chart.addIndicator({ id:'rsi',  type:'pane', ... });   // pane 0
   chart.addIndicator({ id:'macd', type:'pane', ... });   // pane 1 (its own window)
   chart.addIndicator({ id:'stoch',type:'pane', ... });   // pane 2 (its own window)
   ```

2. **Per-pane resizing.** Each pane has its own divider; drag the one above pane[i] to resize **only** pane[i] — the others stay put, the price area absorbs the delta. Double-click a divider to reset just that pane to auto height.
   ```js
   chart.setPaneHeight('rsi', 180);   // resize one pane
   chart.setPaneHeight(140);          // resize ALL panes (legacy form)
   chart.resetPaneHeight('macd');     // reset one pane
   chart.getPaneHeight();             // → array of {id, height, auto, userValue}
   chart.getPaneHeight('rsi');        // → that pane's info (or null)
   ```

3. **Floating countdown timer (per timeframe).** A small **2-digit** number that floats just to the right of the forming (last) candle, at the close-price Y level — no border, no card, no background, just digits. As price moves, the number moves with it (same Y); as the chart pans, it moves with the candle (same X). It counts down based on the timeframe:
   - **H1 and up** → minutes remaining (60 → 00)
   - **sub-hourly** (M1, M5, M15) → seconds remaining (60 → 00)
   - **D1 and up** → hours remaining (24 → 00)
   ```js
   // Constructor option:
   new BadiCharts(canvas, { countdown: true });
   new BadiCharts(canvas, { countdown: { format:'auto', color:'#787b86', fontSize:11, offsetX:6, offsetY:0 } });
   // Or at runtime:
   chart.showCountdown(true);
   chart.setCountdown({ format: 'mm', color: '#ff9800' });
   ```
   The loop wakes up **once per second** (via `setInterval`, not 60fps) while the countdown is enabled — zero extra CPU when disabled.

4. **`chart.destroy()`** — stops the rAF loop + countdown interval + clears the offscreen cache. Use it in SPA route changes to prevent leaks.

No breaking API changes from v2.12.0. `setPaneHeight(h)` / `resetPaneHeight()` / `getPaneHeight()` still work for the single-pane case (treat it as a 1-element array).

---

## ⚠️ What changed in v2.12.0

**Resizable bottom pane + extra stability hardening.** The RSI/MACD section can now be resized by dragging its separator up/down (TradingView-style), and the render pipeline got four more layers of defense so even pathological indicator code can't shake or blank the chart.

1. **Drag-to-resize pane section.** Grab the divider between the price area and the bottom indicator section and drag it up or down — the section grows or shrinks live, the price area takes whatever remains, and the pane scale + grid reflow instantly. A small centered grip pill signals "drag me"; the cursor changes to `ns-resize` over it. **Double-click the divider** to reset to the auto height (~24%). Programmatic API:
   ```js
   chart.setPaneHeight(180);      // CSS pixels, clamped to safe bounds
   chart.resetPaneHeight();        // back to auto
   chart.getPaneHeight();          // { height, auto, userValue }
   ```
   The price area is guaranteed a minimum of ~120px and the pane a minimum of 60px — you can't collapse the chart by dragging too far.

2. **Integer-snapped layout.** Every layout edge (`chartTop`, `paneTop`, `priceBottom`, `volTop`, …) is now floored to a whole CSS pixel at the end of `updateLayout()`. Sub-pixel boundaries (common with fractional `devicePixelRatio` or odd canvas heights) made the browser anti-alias the 1px separator and grid lines slightly differently each frame, which the eye reads as a faint vibration. Whole-pixel edges kill this permanently.

3. **Per-frame cache rebuild budget.** At most **2** offscreen indicator bitmaps rebuild in a single rAF tick. If many indicators all need a rebuild at once (window resize, bulk `setData()`, theme switch), the rest blit their previous cached bitmap this frame and rebuild one-per-frame over the next few ticks — instead of a single 80ms+ hitch that drops a frame. Hover/pan cost stays one `drawImage` per indicator regardless.

4. **Async `calculate()` guard.** If an indicator's `calculate()` returns a Promise (because the user declared it `async` or returned a thenable), the chart now detects it, flags a clear console error — *"calculate() must be synchronous — got a Promise. Use setData() + chart.invalidate() when async data arrives."* — and refuses to feed the Promise into `render()`. Previously this would produce garbage frames and the indicator would "disappear" intermittently as the Promise resolved into stale state.

5. **More user-code defenses:**
   - **Circular settings** can no longer crash the indicator fingerprint (`JSON.stringify` in `_indicatorStamp()` is wrapped — falls back to a key-hash).
   - **Tight price range floor** — when the visible range collapses to ~0 (one candle in view, flat market), the scale marks could flip between adjacent tick spans on every mousemove and vibrate the grid by 1px; the range is now floored to a minimum width so the mark builder picks a stable span.

No breaking API changes from v2.11.0.

---

## ⚠️ What changed in v2.11.0

**Render robustness release — the chart can no longer jitter or lose pixels with heavy, colorful custom indicators.** Verified with a 12-band rainbow indicator (glow shadows, gradients, hundreds of colored shapes): hovering costs one `drawImage`, idle costs **zero CPU**.

1. **Render-on-demand (the big one).** The chart no longer repaints itself 60 times per second forever. It now renders **exactly once per change** — interaction, data update, API call — and goes **fully idle (0% CPU)** until the next change. This is how TradingView stays smooth. The two jitter sources of the old design are gone:
   - constant 60fps full repaints with a heavy indicator (frame time > 16ms → dropped frames → stutter), and
   - the v2.8.0 alternating idle throttle, which oscillated the frame rate between 60 and 30 fps (visible shaking whenever anything touched the chart periodically).
   - A **"Reset view" toast fired on every `setData()`** also forced 2.2s of 60fps rendering right after every data load — removed.

2. **Per-indicator offscreen cache.** Every custom indicator renders into its **own offscreen canvas**, rebuilt only when its inputs actually change (data, visible range, scale, size, settings, theme). The rebuild condition is a **fingerprint recomputed from live values every frame** — so the cache can never go stale, no matter which API mutated the chart. Moving the crosshair with a heavy multi-color indicator now costs one `drawImage` per indicator instead of a full re-render.

3. **Animated indicators:** if your indicator animates itself (color cycling, pulsing…), declare **`animated: true`** in its definition — it bypasses the cache and the loop keeps running for it:
   ```js
   chart.addIndicator({ id:'glow', label:'Glow', type:'overlay', animated: true,
                        calculate: c => c.map(x => x.close),
                        render(ctx, values, h) { /* runs every frame, like before */ } });
   ```
   Static indicators (the vast majority) get the cache and the smoothness for free.

4. **Auto-retry for failed `calculate()`.** A transient failure (one bad tick, briefly incomplete data) no longer makes an indicator **disappear forever** — it is retried automatically every ~0.7s until it recovers.

5. **`getRange(values, settings)` hook — fixes "parts of my indicator disappear".** `autoScale()` only included plain-number arrays in the price range; indicators returning **objects per bar** (multi-band, multi-color arrays) were clipped away whenever they extended beyond the candle range. An indicator can now declare its own range:
   ```js
   getRange: function (values, settings) {
     return { min: myMin, max: myMax };  // merged into the price auto-scale
   }
   ```

6. **Canvas-wreck guard.** Setting `canvas.width/height` inside user `render()` wipes the whole bitmap (the classic "everything disappeared" bug). The chart now detects it and restores the bitmap + HiDPI transform instantly.

7. **New API:** `chart.invalidateScene()` — force all cached indicator layers to rebuild on the next frame (rarely needed; e.g. after mutating a settings object in place). `chart.invalidate()` now schedules exactly one repaint.

## ⚠️ What changed in v2.10.0

**Drawing tools now understand the click → click gesture — and the chart can never freeze again.**

1. **Two-step drawing (the tool "understands" you):**
   - **Click once** → the anchor point is fixed (a small dot marks it), and a live preview **follows the mouse**.
   - **Click again** → the drawing is **placed and stays exactly there**; the tool deactivates and the chart is fully interactive again.
   - The classic **press → drag → release** gesture still works and places on release. Both patterns are supported for every two-point tool (trend, ray, channel, arrow, rect, band, fib) and custom tools.

2. **Freeze bug fixed (custom tools):** with a tool registered via `addDrawingTool()` active, the status bar crashed on every frame (`DRAW_TOOLS.find(...).label` is `undefined` for custom tools), which aborted rendering — the chart appeared **frozen** while the preview followed the mouse. Labels are now looked up safely in both built-in and custom tool lists.

3. **Never gets stuck:**
   - `mouseup` is now tracked on the **window** — releasing outside the canvas finalizes/cancels properly instead of leaving a preview that follows the mouse forever.
   - **Esc / right-click** cancels a pending preview (with a "Drawing cancelled" toast); switching tools discards it.
   - A **tap without drag** on touch (or a brush click) no longer commits a degenerate zero-size drawing — it shows a "Drag to draw" hint instead.

4. **Polygon is finally wired:** click adds vertices (last one follows the mouse), **double-click or Enter** closes the shape (trailing duplicate points are dropped, <3 points is discarded), double-tap on touch.

5. **Better feedback:** the crosshair stays visible while a tool is active, an **anchor dot** marks point 1 while armed, and the status bar shows a short hint for the active tool, e.g. `Tool: Trend Line (click, then click again to place - or drag)`.

6. **Custom tool hooks:** `addDrawingTool()` now also supports optional `onStart(ctx)`, `onUpdate(drawing, ctx)` and **`onFinish(drawing)`** — called when the drawing is finally placed.

## ⚠️ What changed in v2.9.0

**Dedicated pane section** — bottom indicators (RSI/MACD) no longer render as a translucent layer ON TOP of the candles. Instead they get their own **real section inside the chart**, carved out below the price area (TradingView-style oscillator panes):

- The **price area shrinks** to make room — candles are never covered, fully opaque and crisp.
- The section has its **own scale with labels in the right axis strip**, its own grid, and a separator line.
- It **shares the time axis** with the price area, so panning/zooming stay perfectly smooth (one synchronized x-scale).
- The section reserves/free itself automatically: `addIndicator` / `removeIndicator` / `setIndicatorVisible` on a pane indicator re-layout the chart instantly.
- Section height: ~24% of the chart height (clamped 80–200px). Volume stays hugging the time axis, below the pane section.
- `helpers.paneToY(v)` maps into the section; `helpers.paneTop/paneBottom` give its bounds; optional `def.getRange(values, settings)` pins the scale (e.g. RSI 0–100).

## ⚠️ What changed in v2.8.0

**Stability & Signals release** — fixes two reported problems: buy/sell arrows drawing only one type, and a "strange movement" appearing in the chart with complex multi-color indicators.

1. **Custom indicators are now sandboxed.** Each indicator's `render()` and `calculate()` runs wrapped in `try/catch` **plus a canvas `save()/restore()` guard**:
   - A buggy indicator can no longer **leak canvas state** (transform / clip / alpha / shadow) that visually moved or shifted the whole chart.
   - A crash **mid-render** can no longer leave a half-drawn frame (the classic "buy arrows drawn, sell arrows missing"). The old code swallowed errors silently; now the error is **always logged to console**, shown **once as a toast**, and the indicator card gets a **red "!" badge** until the indicator recovers.
   - If `calculate()` throws, `render()` is skipped (no more feeding `null` into user code).

2. **Frame guard + idle throttle.** Nothing can kill the `requestAnimationFrame` loop anymore. After 2s with no interaction/data/animation the chart renders at half rate (~30fps) to save CPU with heavy indicators — any interaction instantly resumes full speed.

3. **Markers hardened + `setMarkers()` batch API.**
   ```js
   // Recommended for buy/sell signals — idempotent, safe to call every tick:
   chart.setMarkers([
     { time: t1, position: 'belowBar', shape: 'arrowUp',   color: '#26a69a', text: 'Buy'  },
     { time: t2, position: 'aboveBar', shape: 'arrowDown', color: '#ef5350', text: 'Sell' }
   ]);
   ```
   - `time` now accepts **unix seconds, ms epoch, ISO strings and Date objects** (auto-normalized) — mixed time units no longer collapse all markers onto one candle.
   - Invalid `shape`/`position`/`size` are coerced to safe defaults; a marker with an unusable time/index is rejected instead of corrupting the render.
   - Markers are drawn **above indicator fills/gradients** so translucent indicator areas never cover the arrows.

## ⚠️ What changed in v2.7.0

Three new features:

1. **Drawing handles + whole-drawing drag.** Every drawing now shows draggable points when selected:
   - Trend/ray/channel/arrow/rect/band/**fib**: 2 endpoint handles (fib has its 2 required points)
   - Brush/poly: one handle per vertex
   - Hline/vline/text: 1 handle
   - Click the drawing's **line body and drag** to move the entire drawing to another candle area. Click a **handle** and drag to reshape. Works with mouse and touch.

2. **Candle markers (icons on candles).** Draw arrows and icons on specific candles:
   ```js
   chart.addMarker({
     time: 1700000000,           // seconds / ms epoch / ISO string / Date — auto-normalized (v2.8.0)
     index: 42,                  // or a direct candle index (overrides time)
     position: 'belowBar',       // 'aboveBar' | 'belowBar' | 'inBar'
     shape: 'arrowUp',           // 'arrowUp'|'arrowDown'|'circle'|'square'|'cross'
     color: '#26a69a',
     size: 1,
     text: 'Buy',                // optional label
   });
   chart.removeMarker(id);  chart.clearMarkers();  chart.getMarkers();
   // v2.8.0: batch replace (idempotent — ideal for signal indicators):
   chart.setMarkers([ { time: t, position:'belowBar', shape:'arrowUp', color:'#26a69a' }, /*...*/ ]);
   ```

3. **Gradient colors for indicators.** New `helpers.drawGradientArea(ctx, values, opts)` — fills the area under an indicator line with a vertical gradient (like TradingView area series):
   ```js
   render: function (ctx, values, h) {
     h.drawGradientArea(ctx, values, {
       lineColor:   '#2962ff',
       topColor:    'rgba(41,98,255,0.35)',
       bottomColor: 'rgba(41,98,255,0.02)'
     });
   }
   ```

No breaking API changes from v2.6.0.

---

## ⚠️ What changed in v2.6.0

Five improvements:

1. **Gentler momentum scrolling.** Friction increased (0.94 → 0.90 → stops in ~0.5s), stronger velocity smoothing (65/35 weighted average), and a max velocity cap (1.2 px/ms) so fast flicks never fly across the chart.

2. **Wick always centered on the candle body.** The wick column and the body rectangle are now both drawn symmetric around the same snapped center point — the wick no longer drifts to the left of the body when zooming out.

3. **Pane indicators drawn INSIDE the chart.** *(Updated in v2.9.0: pane indicators now get a dedicated section inside the chart below the price area — no translucent overlay on the candles.)* `layout.paneH` holds the section height (0 when no pane indicator is active).

4. **Deep settings for drawing tools.** The drawing properties panel now has a ⚙ gear icon. Clicking it opens a settings card with Color, Line Width, plus any custom-tool `defaultStyle` fields. On save, the tool's `onSettings(drawing, settings)` hook fires.

5. **Beautiful TradingView-style icons.** Indicator card icons redrawn: almond-shaped eye with pupil (open/closed + slash), proper diagonal pencil with filled tip, gear with ring + hole + 8 teeth, and a trash can with lid, handle, tapered body, and ribs.

No breaking API changes from v2.5.1.

---

## ⚠️ What changed in v2.5.1

Bug fix: `meta is not defined` error when opening an indicator's settings card.

In v2.1.0, the `const meta = INDICATOR_LIST.find(...)` line was removed from `_openSettingsCard()` (since `INDICATOR_LIST` was emptied), but a reference to `meta.label` remained in the settings card title. This caused a `ReferenceError: meta is not defined` whenever `openIndicatorSettings(id)` was called.

Fixed by using `state.def.label` (the indicator definition's label) instead, with a fallback to the indicator id.

---

## ⚠️ What changed in v2.5.0

Critical data-integrity fixes + per-instance isolation for multi-chart support.

### Data integrity (fixes candle rendering bugs)

1. **Candle objects are now cloned.** `setData()` and `update()` no longer store references to the input objects — they create fresh normalized copies. This fixes the bug where modifying the original candle object would corrupt already-stored candles.

2. **Time is snapped to candle boundaries.** `update()` now aligns the incoming `time` to the candle's open boundary using `timeframeMs`. If you send a tick timestamp (not the candle open time), it's correctly bucketed into the right candle instead of creating a new candle per tick.

3. **Millisecond timestamps auto-converted.** If `time > 1e11` (a millisecond timestamp), it's divided by 1000. Binance's `k.t` (ms) and most APIs' unix seconds both work.

4. **Value validation.** `open/high/low/close` are coerced to numbers; non-finite values are rejected. `high` is clamped to `max(high, open, close)` and `low` to `min(low, open, close)` so wicks never appear below the body.

5. **Stale ticks ignored.** `update()` silently ignores candles with `time < last candle time` (out-of-order data) instead of corrupting the array.

6. **`setSymbol()` and `setTimeframe()` now clear all candle data.** Call `setData()` with the new symbol/timeframe data after switching. This prevents mixing old + new data when switching currencies or timeframes.

### Per-instance isolation (multi-chart support)

7. **Theme is now per-instance.** Each chart gets its own copy of `THEME`. Changing colors on one chart (via `theme` option or `setTheme()`) does NOT affect other charts on the same page. During `render()`, the global `THEME` is swapped with `this.theme` so all drawing methods see the instance's colors.

8. **Custom drawing tools are per-instance.** `addDrawingTool()` no longer pushes to the global `DRAW_TOOLS` array. Each chart has its own `_instanceTools` list. A tool registered on chart A won't appear in chart B's `getTools()`.

9. **`DataLayer.clear()` method added.** Clears all stored candles without creating a new `DataLayer` instance.

No breaking API changes from v2.4.0.

---

## ⚠️ What changed in v2.4.0

Two improvements:

1. **Dedicated axis theme colors.** New THEME keys: `axisBg`, `axisBorder`, `axisText`. Override them to control the price/time axis appearance independently of the rest of the chart:
   ```js
   new BadiCharts(canvas, {
     theme: {
       bg:      '#0e1015',  // chart background
       axisBg:  '#131722',  // axis background (defaults to panelBg)
       axisBorder: '#2a2e39', // axis border line
       axisText:'#787b86'   // axis tick labels
     }
   });
   ```
   The axes now "follow the chart color" — change `axisBg` to match or contrast with `bg`.

2. **Momentum scrolling (inertia).** After the user releases the mouse/touch after panning, the chart continues to move with decreasing speed, like TradingView / Binance. Velocity is tracked during the drag (weighted average of recent samples), then applied with friction (`× 0.94` per frame) until it falls below threshold. Works for both mouse drag and touch pan. Any new interaction (click/touch) instantly cancels the momentum.

No breaking API changes from v2.3.1.

---

## ⚠️ What changed in v2.3.1

Two adjustments based on user feedback:

1. **Price labels returned to the price axis.** In v2.3.0 I moved the current-price label and crosshair price label INSIDE the chart. v2.3.1 puts them back ON the price axis (`chartRight + 1`), where they belong — the axis is connected to the chart and the labels sit on it.

2. **Crosshair disabled on mobile.** On touch devices, the crosshair (horizontal + vertical mouse lines, time label, price label) no longer appears at all. Touch still works for panning and pinch-zoom; the OHLC legend at the top still updates to the touched candle. This matches mobile trading app behavior (no mouse crosshair on touch screens).

No other changes from v2.3.0.

---

## ⚠️ What changed in v2.3.0

Three improvements:

1. **Theme customization.** Pass a `theme` option to the constructor to override any color, or call `chart.setTheme(overrides)` at runtime:
   ```js
   new BadiCharts(canvas, {
     theme: { bull: '#00ff00', bear: '#ff0000', bg: '#ffffff', accent: '#ff00ff' }
   });
   // or at runtime:
   chart.setTheme({ bull: '#26a69a' });
   chart.getTheme();  // → copy of current THEME
   ```
   All 30+ THEME colors can be overridden (bg, bull, bear, grid, text, crosshair, etc.).

2. **Mobile optimization.** On mobile devices (detected via touch + UA):
   - DPR is capped at 2 (was unlimited — 3x devices rendered 9x more pixels)
   - Render loop throttled to ~30fps (was 60fps) — charts don't need 60fps
   - Rendering pauses when the tab is hidden (Page Visibility API)
   - Result: ~50% less CPU/battery usage on phones

3. **Price axis is now clean.** The current-price label and crosshair price label used to be drawn ON the price axis (over the tick labels). Now they're drawn INSIDE the chart at the right edge. The price axis only contains its own tick labels — nothing else.

No breaking API changes from v2.2.0.

---

## ⚠️ What changed in v2.2.0

Three visual/rendering improvements:

1. **Drawing properties panel moved to the top of the chart.** The floating panel (delete/lock/color/width/duplicate) used to appear next to the selected drawing. Now it always appears at the **top-center of the chart area**, in a predictable location that never overlaps the drawing or the axes.

2. **Candle rendering at small zoom — no more blur.** When zoomed out (`barSpacing < 4` or candle body width ≤ 1 bitmap pixel), candles are now drawn as **single crisp vertical lines** from high to low (no separate body). This is the same approach Lightweight Charts uses at small barSpacing and eliminates the blurry anti-aliased look caused by overlapping sub-pixel-wide bodies and wicks.

3. **Drawings are strictly clipped to the chart area.** Previously, `hline`, `fib`, and `band` drawings extended their labels onto the price axis, and `vline` extended into the pane/time axis. Now **ALL drawings** are clipped to `chartLeft..chartRight, chartTop..chartBottom`. Price labels for `hline`/`fib`/`band` are drawn **inside** the chart at the right edge instead of on the price axis.

No breaking API changes from v2.1.1.

---

## ⚠️ What changed in v2.1.1

**Custom drawing tools are now fully functional.** Previous versions registered custom tools via `addDrawingTool()` but the rendering/hit-testing/start hooks were never actually called. v2.1.1 wires them up:

- `drawDrawings()` now has a `default` case that calls `tool.onDraw(ctx, drawing, helpers)` for custom tool drawings.
- `startDrawing()` now calls `tool.onStart(ctx)` when a custom tool is activated (or creates a generic drawing object if `onStart` is not provided).
- `updateCurrentDrawing()` now calls `tool.onUpdate(drawing, ctx)` while dragging (or updates `i2/p2/x2/y2` by default).
- `hitTestDrawing()` now has a `default` case that calls `tool.onHitTest(drawing, x, y, helpers)`.

No breaking changes from v2.1.0 — the `addDrawingTool()` API is the same, it just finally works.

---

## ⚠️ What changed in v2.1.0 (breaking)

**All built-in indicators have been REMOVED.** The library now ships with ZERO pre-coded indicators (no MA, EMA, BB, RSI, MACD, volsma, vprof). You register your own indicators via the new `addIndicator(definition)` API.

**Why?** So you have full control over indicator math, rendering, and styling. No more fighting the library's built-in indicator implementations — you write exactly the calculation and rendering you need.

**Migration from v2.0.0:**
- `chart.addIndicator('rsi')` no longer works (string ids aren't supported since there are no built-in ids).
- Instead, pass a **definition object**: `chart.addIndicator({ id:'myRSI', label:'RSI', type:'pane', calculate: ..., render: ... })`.
- The `Indicators` math class (SMA, EMA, Bollinger, RSI, MACD, VolumeProfile) is kept as a public utility — you can call it from your custom `calculate()` functions if you want to reuse the math.
- The `opts.indicators` array in the constructor now expects **definition objects**, not strings.

---

## ✨ Features

- **100% Pure JavaScript** — No HTML/CSS for UI, no dependencies, no frameworks
- **Fully Headless (v2.0.0+)** — No built-in toolbar or status bar; you build your own UI
- **Custom Indicators (v2.1.0+)** — No built-in indicators; register your own via `addIndicator(def)`
- **Pixel-Perfect Rendering** — HiDPI-aware, algorithms ported 1:1 from TradingView Lightweight Charts
- **User-Provided Data** — No fake/mock data; you feed candles via `setData()`
- **14 Drawing Tools** — trend line, parallel channel, band/zone, arrow, fib retracement, brush, polygon, text, ray, rectangle, horizontal/vertical lines, eraser
- **Custom Drawing Tools** — register your own via `addDrawingTool(def)`
- **Responsive** — works on desktop and mobile (touch + pinch zoom)
- **Crosshair** with price/time labels
- **Current Price Line** with colored label on the price axis
- **OHLC Legend** with change percentage
- **Clipping** — all chart elements stay inside their areas (no overflow)

## 📦 Installation

### Option 1: Direct include (browser)

```html
<script src="chart.js"></script>
<script>
  const chart = new BadiCharts(canvas, { /* options */ });
</script>
```

### Option 2: npm

```bash
npm install badi-charts-v2
```

```js
import BadiCharts from 'badi-charts-v2';
const chart = new BadiCharts(canvas, { /* options */ });
```

## 🚀 Quick Start

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <canvas id="chart"></canvas>
  <!-- Load from CDN (headless, no built-in UI or indicators) -->
  <script src="https://cdn.jsdelivr.net/gh/salahbadi19/BADI-CHARTS-V2@v2.17.1/chart.js"></script>
  <script>
    const canvas = document.getElementById('chart');
    const chart = new BadiCharts(canvas, {
      symbol:    { label: 'BTCUSDT', priceScale: 100, decimals: 2 },
      timeframe: { label: '1H', ms: 60 * 60 * 1000 }
    });

    // Feed your candle data
    chart.setData([
      { time: 1700000000, open: 67000, high: 67500, low: 66800, close: 67200, volume: 1200 },
      { time: 1700003600, open: 67200, high: 67800, low: 67100, close: 67600, volume: 980 },
      // ... more candles
    ]);

    chart.start();

    // Add a custom indicator (SMA 20 overlay)
    chart.addIndicator({
      id: 'sma20',
      label: 'SMA 20',
      type: 'overlay',
      color: '#2962ff',
      settings: { period: 20 },
      calculate: function (candles, s) {
        const out = new Array(candles.length).fill(null);
        let sum = 0; const p = s.period || 20;
        for (let i = 0; i < candles.length; i++) {
          sum += candles[i].close;
          if (i >= p) sum -= candles[i - p].close;
          if (i >= p - 1) out[i] = sum / p;
        }
        return out;
      },
      render: function (ctx, values, h, s) {
        ctx.strokeStyle = s.color; ctx.lineWidth = 1.5; ctx.beginPath();
        let started = false;
        for (let i = h.firstIdx; i <= h.lastIdx; i++) {
          if (values[i] === null) { started = false; continue; }
          const x = h.indexToX(i), y = h.priceToY(values[i]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
  </script>
</body>
</html>
```

See `index.html` for a complete example with multiple custom indicators (SMA, RSI, Volume) and a custom HTML toolbar.

## 📖 API Reference

### Constructor

```js
const chart = new BadiCharts(canvas, options);
```

**Options:**
| Option | Type | Default | Description |
|---|---|---|---|
| `symbol` | `{label, priceScale, decimals}` | `{label:'SYMBOL', priceScale:100, decimals:2}` | Symbol configuration (priceScale: 100 for 2 decimals, 100000 for 5) |
| `timeframe` | `{label, ms}` | `{label:'1H', ms:3600000}` | Timeframe label and duration in milliseconds |
| `indicators` | `Array<IndicatorDef>` | `[]` | Custom indicator definitions to activate at startup (v2.1.0+; strings no longer accepted) |
| `theme` | `object` | `{}` (defaults) | v2.3.0+: Override any THEME color (e.g. `{bull:'#00ff00', bear:'#ff0000', bg:'#fff'}`) |
| `statusBar` | `boolean` | `false` | Show the optional status bar (Bid/Ask/24h High/Low/Vol). Toolbar is always OFF. |
| `background` | `string\|null` | `null` | Background image or video URL drawn behind the chart |
| `backgroundOpacity` | `number` | `0.15` | Opacity of the background image/video |

> **Note:** The `toolbar` option is accepted but silently ignored (always `false`). Kept only for backward compatibility with v1.x code.

### Theme (v2.3.0+)

All chart colors come from the `THEME` object. Override any of them via the constructor `theme` option or `chart.setTheme()`:

```js
// At construction:
const chart = new BadiCharts(canvas, {
  theme: {
    bull: '#00ff00',
    bear: '#ff0000',
    bg: '#ffffff',
    text: '#333333',
    grid: '#eeeeee',
    accent: '#ff00ff'
  }
});

// At runtime:
chart.setTheme({ bull: '#26a69a', bear: '#ef5350' });
chart.getTheme();  // → { bull:'#26a69a', bear:'#ef5350', ... }
```

Available theme colors:

| Key | Default | What it controls |
|---|---|---|
| `bg` | `#0e1015` | Chart background |
| `panelBg` | `#131722` | Price/time axis background |
| `grid` | `#1c2030` | Grid lines |
| `text` | `#cfd2da` | Body text |
| `textDim` | `#787b86` | Axis tick labels, dim labels |
| `textBright` | `#f0f3fa` | Bright labels (OHLC, symbol) |
| `bull` | `#26a69a` | Bullish candles |
| `bear` | `#ef5350` | Bearish candles |
| `bullVol` | `rgba(38,166,154,0.50)` | Bullish volume bars |
| `bearVol` | `rgba(239,83,80,0.50)` | Bearish volume bars |
| `accent` | `#2962ff` | Accent color (selections, highlights) |
| `crosshair` | `#787b86` | Crosshair lines |
| `crosshairLabel` | `#363a45` | Crosshair label background |
| `drawing` | `#2962ff` | Default drawing color |
| `drawingActive` | `#ffb74d` | Active drawing color |
| `currentPriceBull` | `#26a69a` | Current price line (bullish) |
| `currentPriceBear` | `#ef5350` | Current price line (bearish) |
| `ma1` / `ma2` / `ma3` | `#2962ff` / `#ff9800` / `#e91e63` | Moving average colors (for your custom indicators) |

### Data Methods

```js
chart.setData(candles);      // Replace all data
chart.update(candle);        // Real-time tick (append or update last)
chart.append(candles);       // Batch append
```

**Candle format:** `{time (unix seconds), open, high, low, close, volume}`

### Configuration Methods

```js
chart.setSymbol({label, priceScale, decimals});
chart.setTimeframe({label, ms});
chart.setTool('trend');          // Set active drawing tool
chart.clearTool();               // Reset to 'cursor'
chart.addDrawing({type:'hline', price: 65000, color:'#2962ff'});
chart.removeDrawing(id);         // Remove one drawing by id
chart.clearDrawings();
chart.resetView();
```

### Tool Programming API (v2.0.0+)

The library is headless — there is no built-in toolbar. Use these methods to build your own UI:

```js
chart.getTools();              // → [{id, label, icon, custom}, ...]
chart.setTool('trend');        // activate a drawing tool
chart.getActiveTool();        // → 'trend'
chart.clearTool();             // back to 'cursor' (no drawing)
chart.onToolChange(function (toolId) {
  console.log('User/program switched tool to:', toolId);
});                            // returns an unsubscribe function

chart.getDrawings();           // → all drawings on the chart
chart.getDrawing(id);          // → one drawing by id (or null)
chart.removeDrawing(id);       // remove one drawing, returns the removed drawing
chart.getSelectedDrawing();    // currently selected drawing (or null)
chart.selectDrawingById(id);   // programmatically select a drawing

// Register a CUSTOM drawing tool (v2.1.1+ — fully functional):
chart.addDrawingTool({
  id: 'circle',
  label: 'Circle',
  icon: '○',
  defaultStyle: { color: '#ff9800', lineWidth: 1.5 },
  // onStart: called when the user clicks to start drawing.
  // Should return a new drawing object (or null/undefined to cancel).
  // If you omit onStart, the chart creates a generic click-and-drag drawing
  // with {i1, p1, i2, p2, x1, y1, x2, y2, color, lineWidth, id}.
  onStart: function (ctx) {
    // ctx = { x, y, idx, price } — click position in pixels and chart coords
    return {
      type: 'circle',
      cx: ctx.x, cy: ctx.y,        // center in pixels
      i: ctx.idx, p: ctx.price,     // center in chart coords
      radius: 0,
      color: '#ff9800',
      lineWidth: 1.5
    };
  },
  // onUpdate: called while the user drags (optional).
  // Update the drawing object in place. If omitted, the chart updates
  // i2/p2/x2/y2 on the generic drawing object.
  onUpdate: function (drawing, ctx) {
    drawing.radius = Math.hypot(ctx.x - drawing.cx, ctx.y - drawing.cy);
  },
  // onDraw: called to render the drawing. Required.
  onDraw: function (ctx, drawing, helpers) {
    // helpers = { indexToX, priceToY, xToIndex, yToPrice, chartLeft, chartRight,
    //             chartTop, chartBottom, priceTop, priceBottom, barSpacing, dpr, THEME }
    ctx.strokeStyle = drawing.color;
    ctx.lineWidth = drawing.lineWidth || 1.5;
    ctx.beginPath();
    ctx.arc(drawing.cx, drawing.cy, Math.max(1, drawing.radius), 0, Math.PI * 2);
    ctx.stroke();
  },
  // onHitTest: return true if (x, y) is on the drawing. Required for
  // selection and the eraser tool to work.
  onHitTest: function (drawing, x, y, helpers) {
    const dist = Math.hypot(x - drawing.cx, y - drawing.cy);
    return Math.abs(dist - drawing.radius) < 8;
  }
});
```

### Indicator Programming API (v2.1.0+)

The library ships with **NO built-in indicators**. Register your own via `addIndicator(def)`:

```js
// Register + activate a custom indicator in one call:
chart.addIndicator({
  id: 'mySMA',                  // unique id
  label: 'My SMA',              // display label
  type: 'overlay',              // 'overlay' (on candles) | 'pane' (own section below price) | 'volume'
  color: '#2962ff',             // color used in legend/cards
  settings: { period: 20 },     // default settings (cloned per instance)
  calculate: function (candles, settings) {
    // Returns an array of values (same length as candles).
    // Use null for entries that don't have a value yet (e.g., before period is reached).
    const out = new Array(candles.length).fill(null);
    let sum = 0; const p = settings.period || 20;
    for (let i = 0; i < candles.length; i++) {
      sum += candles[i].close;
      if (i >= p) sum -= candles[i - p].close;
      if (i >= p - 1) out[i] = sum / p;
    }
    return out;
  },
  render: function (ctx, values, helpers, settings, state) {
    // Draw the indicator on the canvas.
    // `helpers` contains coordinate-conversion functions and chart geometry:
    //   helpers.firstIdx, helpers.lastIdx
    //   helpers.indexToX(i), helpers.priceToY(p), helpers.volToY(v), helpers.paneToY(v)
    //   helpers.chartLeft, helpers.chartRight, helpers.priceTop, helpers.priceBottom
    //   helpers.volTop, helpers.volBottom, helpers.paneTop, helpers.paneBottom
    //   helpers.barSpacing, helpers.dpr, helpers.candles, helpers.THEME
    //   helpers.optimalCandlestickWidth(barSpacing, dpr)
    //   helpers.drawOnMain(fn)   (v2.18.0+) — register a callback that draws
    //     on the MAIN candle chart, NOT clipped to this pane. The callback
    //     receives (mctx, mh) where mh has priceToY, indexToX and the price-
    //     area geometry. Useful for pane indicators that need to project a
    //     price level, candle marker, or touch-index vertical line onto the
    //     candle chart itself. See the v2.18.0 changelog above for a full
    //     example.
    ctx.strokeStyle = settings.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let i = helpers.firstIdx; i <= helpers.lastIdx; i++) {
      if (values[i] === null) { started = false; continue; }
      const x = helpers.indexToX(i);
      const y = helpers.priceToY(values[i]);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  },
  formatValue: function (value, settings) {
    // Optional: format the value shown in the legend. Default uses priceScale.formatLogical.
    return value.toFixed(2);
  },
  getRange: function (values, settings) {
    // Optional (pane indicators only): return {min, max} for the pane scale.
    // If omitted, the chart auto-ranges from the values.
    return { min: 0, max: 100 };  // e.g., for RSI
  }
});

// Other indicator methods:
chart.registerIndicator(def);    // register without activating
chart.removeIndicator(id);       // deactivate + remove
chart.getIndicators();           // → [{id, label, type, color, active}, ...]
chart.getActiveIndicators();     // → ['sma20', 'rsi', ...]
chart.getIndicatorDef(id);       // → the definition object (or null)
chart.setIndicatorVisible(id, bool);
chart.setIndicatorSettings(id, { period: 50 });
chart.getIndicatorSettings(id);
chart.addIndicatorIcon(id, { id:'alert', label:'Alert', icon:'🔔', onClick: function() {} });
```

#### Indicator types

| type | Where it renders | Notes |
|---|---|---|
| `'overlay'` | On the main price chart | e.g., MA, EMA, Bollinger Bands |
| `'pane'` | In a separate pane below the chart | e.g., RSI, MACD. Use `getRange()` to fix the scale. |
| `'volume'` | In the volume pane (below the price chart, above the pane) | If you omit `calculate()` and `render()`, the chart draws volume bars from candle data automatically. |

#### Reusing the built-in math utility

The `Indicators` object is kept as a public utility. You can call its methods from your custom `calculate()` functions:

```js
chart.addIndicator({
  id: 'ema20', label: 'EMA 20', type: 'overlay', color: '#2962ff',
  settings: { period: 20 },
  calculate: function (candles, s) {
    const closes = candles.map(function (c) { return c.close; });
    return Indicators.ema(closes, s.period || 20);
  },
  render: function (ctx, v, h, s) {
    ctx.strokeStyle = s.color; ctx.lineWidth = 1.6; ctx.beginPath();
    let started = false;
    for (let i = h.firstIdx; i <= h.lastIdx; i++) {
      if (v[i] === null) { started = false; continue; }
      const x = h.indexToX(i), y = h.priceToY(v[i]);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
});
```

Available math functions on `Indicators`:
- `Indicators.sma(values, period)`
- `Indicators.ema(values, period)`
- `Indicators.bollinger(values, period, mult)` → `{upper, mid, lower}`
- `Indicators.rsi(values, period)`
- `Indicators.macd(values, fast, slow, signal)` → `{macd, signal, hist}`
- `Indicators.volumeProfile(candles, firstIdx, lastIdx, bins)` → `{bins, pocIdx, pocPrice, vwap, maxVol, minP, maxP}`

A minimal custom toolbar wired to the API:

```html
<button data-tool="trend">Trend</button>
<button data-tool="hline">H-Line</button>
<script>
  document.querySelectorAll('[data-tool]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      chart.setTool(btn.getAttribute('data-tool'));
    });
  });
  chart.onToolChange(function (id) {
    document.querySelectorAll('[data-tool]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tool') === id);
    });
  });
</script>
```

### View Methods

```js
chart.resetView();   // Reset zoom/pan to default
chart.fit();         // Fit chart to show all data
chart.start();       // Start the render loop (requestAnimationFrame)
chart.onCrosshair(cb);  // Subscribe to crosshair updates
```

### Indicator Cards (TradingView-style)

Each active indicator appears as a **card** in the chart legend with its current value. Click a card to reveal 4 default icons:

| Icon | Action |
|---|---|
| 👁 (eye) | Toggle visibility (hide/show) |
| ✏️ (pencil) | Open code editor (calls `onEdit` callback) |
| ⚙️ (gear) | Open settings card popup |
| ✕ (delete) | Remove the indicator |

### Indicator API (Advanced)

```js
// Add indicator with custom config
chart.addIndicator('ma20', {
  settings: { period: 20, color: '#2962ff' },  // override defaults
  icons: ['hide', 'settings', 'delete'],        // customize which icons show
  onSettings: function(settings) {              // called when settings change
    console.log('MA20 settings:', settings);
  },
  onEdit: function(state) {                     // called when edit icon clicked
    console.log('Edit MA20');
  }
});

// Add a custom icon (e.g., alert button)
chart.addIndicatorIcon('ma20', {
  id: 'alert',
  label: 'Set Alert',
  icon: '🔔',                                    // emoji or short text
  onClick: function(indId, state) {
    alert('Alert set for ' + indId);
  }
});

// Programmatic control
chart.setIndicatorVisible('ma20', false);   // hide
chart.setIndicatorVisible('ma20', true);    // show
chart.isIndicatorVisible('ma20');           // check visibility
chart.setIndicatorSettings('ma20', { period: 50 });  // update settings
chart.getIndicatorSettings('ma20');         // read settings
chart.openIndicatorSettings('ma20');        // open settings popup
chart.openIndicatorEditor('ma20');          // trigger edit callback
chart.removeIndicator('ma20');              // remove
```

### Settings Card (User-Customizable)

When the user clicks the ⚙️ icon, a settings popup appears with fields auto-generated from the indicator's `settings` object:

- **Number fields** (period, mult, fast, slow, signal, bins) — click to edit via prompt
- **Color field** — click to cycle through preset colors
- **Save / Cancel** buttons

The `onSettings(settings)` callback is invoked when the user saves, so you can persist changes or trigger custom logic.

### Available Drawing Tools

| ID | Label |
|---|---|
| `cursor` | Cursor |
| `trend` | Trend Line |
| `channel` | Parallel Channel |
| `hline` | Horizontal Line |
| `vline` | Vertical Line |
| `band` | Band / Zone |
| `rect` | Rectangle |
| `arrow` | Arrow |
| `fib` | Fib Retracement |
| `brush` | Brush (freehand) |
| `poly` | Polygon |
| `text` | Text |
| `ray` | Ray |
| `eraser` | Delete Drawing |

> Register your own custom drawing tools via `chart.addDrawingTool(def)`.

### Indicators

The library ships with **no built-in indicators** (v2.1.0+). Register your own via `chart.addIndicator(def)`. See the **Indicator Programming API** section above.

The `Indicators` math utility (SMA, EMA, Bollinger, RSI, MACD, Volume Profile) is available globally for reuse in your custom `calculate()` functions.

## 🎨 Examples

### Real-time updates via WebSocket (Binance)

```js
const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_1h');
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  const k = msg.k;
  if (!k) return;
  chart.update({
    time: Math.floor(k.t / 1000),
    open:  parseFloat(k.o),
    high:  parseFloat(k.h),
    low:   parseFloat(k.l),
    close: parseFloat(k.c),
    volume: parseFloat(k.v)
  });
};
```

See `demo.html` for a complete working example fetching real data from Binance REST API.

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `R` | Reset view |
| `+` / `=` | Zoom in |
| `-` / `_` | Zoom out |
| `Esc` | Cancel current drawing tool |
| `Delete` / `Backspace` | Delete hovered drawing |

## 📱 Mobile Support

- Single-touch drag to pan
- Two-finger pinch to zoom
- Compact responsive toolbar (smaller dimensions on screens < 600px)
- Touch-friendly button sizes

## 🏗️ Architecture

BADI-CHARTS-V2 is built as a single IIFE-wrapped file (`chart.js`) exposing the `BadiCharts` constructor globally. Key components:

- **`DataLayer`** — Passive data store (no fake data generation)
- **`PriceScale`** — LWC-compatible price axis with `PriceTickMarkBuilder`
- **`TimeTickMarks`** — Weight-based time axis mark selection
- **`PriceFormatter`** — LWC-compatible price formatting
- **`TradingChart`** — Main class orchestrating rendering, events, indicators, drawings
- **`Indicators`** — Math functions (SMA, EMA, Bollinger, RSI, MACD, Volume Profile)

### Algorithms Ported from Lightweight Charts

The following algorithms are ported 1:1 from TradingView's open-source [Lightweight Charts](https://github.com/tradingview/lightweight-charts) library:

- `optimalCandlestickWidth()` — candle body width formula
- `candlestickWidth()` — wick parity adjustment
- `PriceTickSpanCalculator` — nice-number spacing for price axis
- `PriceTickMarkBuilder` — price tick mark generation
- `TickMarks.build()` — weight-based time mark selection
- Coordinate transforms — `internalHeight` + `scaleMargins`
- HiDPI rendering — bitmap vs media coordinates

## 📄 License

Apache License 2.0 — see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) — for the excellent rendering algorithms that inspired this library
- The open-source trading community for feedback and testing

## 📊 File Structure

```
badi-charts-v2/
├── chart.js           # Main library (2800+ lines, no dependencies)
├── demo.html          # Working demo with real Binance data
├── index.html         # Minimal empty-chart example
├── standalone.html    # Compact standalone usage
├── README.md          # This file
├── package.json       # npm package config
└── LICENSE            # Apache-2.0
```

---

**BADI-CHARTS-V2** — Built for the trading community.
