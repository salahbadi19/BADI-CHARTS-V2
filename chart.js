/* =============================================================================
 * BADI-CHARTS-V2 v2.19.1 — Pixel-Perfect Pure JavaScript Trading Chart Library
 *
 * A lightweight, dependency-free candlestick charting library built entirely
 * with the HTML5 Canvas API. Inspired by TradingView Lightweight Charts.
 *
 * Key features:
 *   - 100% pure JavaScript — no HTML/CSS for UI, no dependencies
 *   - Pixel-perfect rendering (HiDPI-aware, LWC-compatible algorithms)
 *   - User-provided data only (no fake/mock data)
 *   - 14 drawing tools (trend, channel, band, arrow, fib, polygon, text, ...)
 *   - 10 indicators (MA, EMA, Bollinger, RSI, MACD, Volume Profile, ...)
 *   - Responsive (desktop + mobile with touch/pinch support)
 *   - Crosshair, current price line, OHLC legend
 *   - Clipping for all chart areas (no overflow)
 *
 * v2.18.3 — PERF: Path2D batching (the "WebGL-like" Canvas 2D optimization).
 *   Instead of calling ctx.fillRect() per candle per rect (~1000 fillRect
 *   calls for 500 candles) and ctx.stroke() per grid line (~30 strokes),
 *   we build ALL rects/lines into Path2D objects in JS, then fill/stroke
 *   each ONCE. The browser rasterizes each batch in a single GPU pass.
 *   This is the Canvas-2D equivalent of WebGL's instanced rendering — same
 *   batching benefit, zero rewrite cost.
 *     drawCandles: ~1000 fillRect → 2 fill(path) calls (bull + bear)
 *     drawGrid:    ~30 stroke     → 2 stroke(path) calls (H + V)
 *   Combined with v2.18.2's priceToY precompute (y = A - B*p) and early-
 *   return guards, a bare-candle chart now does the absolute minimum number
 *   of canvas API calls per frame. No API change; pixel output identical.
 *
 * v2.18.2 — PERF: three hot-path optimizations for the "just candles" case.
 *   The library was reported heavy during pan/zoom even with NO indicators.
 *   Root cause: the render pipeline ran several passes unconditionally, and
 *   drawCandles called this.priceToY(p) — a chain of 5 function calls — FOUR
 *   times per candle (open, high, low, close), i.e. ~2000 function calls per
 *   frame for 500 visible candles. Fixes:
 *   1. drawCandles: precompute the price→Y transform as y = A - B*p (two
 *      arithmetic ops instead of 5 function calls). 2000 calls → 2000 ops.
 *   2. drawCandles: two-pass batched fillStyle (bull pass + bear pass) — sets
 *      fillStyle ONCE per color instead of per-candle (~498 fewer state
 *      changes per frame).
 *   3. drawIndicators: early-return when no overlay indicators are active
 *      (skips helpers allocation + ctx save/clip/restore on every frame).
 *   4. drawDrawings: early-return when no drawings exist (skips the large
 *      drawOne closure allocation on every frame).
 *   Net effect on a bare-candle chart: the render pipeline now does the
 *   minimum work possible — background, grid, candles, axes, crosshair —
 *   with no wasted allocations or function calls. No API change.
 *
 * v2.18.1 — perf: guarded bitmap resize in _safeRenderIndicator's rebuild
 *   branch. `entry.canvas.width = pxW` (even when pxW is UNCHANGED) clears the
 *   bitmap AND forces the browser to allocate a fresh backing store on every
 *   rebuild. During pan/zoom the indicator's STAMP changes every frame
 *   (barSpacing moves) but the region SIZE rarely does — so the old code
 *   reallocated the bitmap 60×/sec for nothing. The guarded form
 *   `if (entry.canvas.width !== pxW) entry.canvas.width = pxW;` skips the
 *   reallocation; the existing clearRect() below already wipes stale pixels,
 *   so the visual result is identical but pan/zoom is lighter. No API change.
 *
 * v2.18.0 — helpers.drawOnMain(fn): pane indicators can draw on the MAIN
 *   candle chart (the price area), using priceToY / indexToX of the candle
 *   chart, NOT clipped to the pane. A pane indicator's render() received
 *   ONLY pane-scale helpers (helpers.paneToY maps into the pane's own 0-100
 *   window) and its ctx was clipped to the pane rect — so a horizontal price
 *   level drawn from inside an RSI render() was erased by the pane clip.
 *   Now an indicator calls h.drawOnMain(function (mctx, mh) { ... }) and the
 *   callback is replayed every frame against the LIVE main-chart ctx clipped
 *   to the price area. Useful for projecting a price level, candle marker, or
 *   touch-index vertical line onto the candle chart from inside a pane.
 *   Callbacks are cached per indicator state (state._mainDraws) and replayed
 *   on cache-HIT frames too. Sandboxed: a throw is swallowed.
 *   RSI (pane) + Bollinger Bands (overlay) run together in ONE chart.
 *
 * v2.17.1 — UNLIMITED bottom indicators (the "draw as many as you want" release):
 *   - NO CAP: the hard limit of 6 pane windows is GONE. Every visible pane-type
 *     indicator (RSI, MACD, Stoch, ...) gets its OWN window — add 7, 12 or 20
 *     bottom indicators and ALL of them render. The old cap silently dropped
 *     panes 7+ (active in the API but drawn NOWHERE, which looked like
 *     "one bottom indicator kills another").
 *   - ADAPTIVE pane heights: the 60px comfort floor holds while N × 60 fits
 *     the pane budget; beyond that it yields down to a 16px absolute floor so
 *     every pane keeps a real window and the price area keeps its guaranteed
 *     minimum. A last-resort squeeze (8px floor) makes NaN coordinates
 *     impossible on any canvas, however small.
 *   - AREA-based rebuild budget: the fixed 2-rebuilds-per-frame budget dates
 *     from the v2.12 era when indicator bitmaps were full-screen sized. Since
 *     v2.16 bitmaps are region-sized (a pane bitmap is ~10× smaller than the
 *     screen), so the count budget made panes appear only 2-per-frame. The
 *     budget now measures bitmap AREA (~2 full-screen areas per frame): a
 *     dozen pane indicators rebuild in ONE frame, heavy overlay bursts are
 *     still throttled.
 *   - Pane labels are skipped on panes shorter than 22px (the label card
 *     would bleed into the pane below).
 *
 * v2.17.0 — helpers context fix:
 *   - helpers.drawLine / drawGradientArea / paneToY now map values through
 *     the CURRENT context's scale — re-pointed per pane during drawPane() —
 *     fixing pane/volume indicators that used the helpers and drew through
 *     the wrong (first) pane's scale.
 *
 * v2.16.0 — Rendering quality + memory + robustness release (23 audit items).
 *   Highlights:
 *   - PIXEL-SNAP consistency: every horizontal/vertical 1px line now snaps to
 *     the BITMAP grid (snapToH/snapToV), not to a CSS pixel + 0.5 offset that
 *     only lands on a true bitmap pixel when dpr is an integer. On 1.25/1.5
 *     DPR (Windows/HiDPI laptops) grid lines, current-price line, separators
 *     and crosshair are now crisp, not "half-transparent shaky".
 *   - TIME-AXIS label width is measured with ctx.measureText instead of
 *     `label.length * 6 + 8` (which broke on bold fonts / wide glyphs / future
 *     Arabic labels). Collision detection actually works now.
 *   - CROSSHAIR on touch: a touch-sized crosshair (and OHLC readout) is now
 *     shown on mobile — the blanket `if (_isMobile) return` was a fully
 *     disabled feature, not a missing one. The time label is clamped to stay
 *     inside the canvas (left/right edges no longer clip outside).
 *   - INDICATOR line downsampling: at extreme zoom-out (>600 visible bars),
 *     collinear interior segments are collapsed via a light Ramer-Douglas-
 *     Peucker pass — no more thousands of overlapping sub-pixel lineTo calls
 *     producing random shimmer. The line endpoints always remain exact.
 *   - GRADIENT AREA: the fill closes back to the FIRST index that actually had
 *     a value, not to `firstIdx` (which could be `null` for the first N
 *     warm-up bars → the gradient extended under no-data area).
 *   - INDICATOR OFFSCREEN MEMORY: each indicator's offscreen canvas is sized
 *     to its actual pane region (overlay → price area, pane → that pane's
 *     rect), NOT the full W×H×DPR of the screen. On a 4K monitor with 8
 *     indicators the previous ~250MB of GPU memory drops to ~10-20MB.
 *   - STAMP split: `_dataVersion` used to bump on every tick → in the LIVE
 *     scenario (the main use case) every indicator rebuilt its bitmap every
 *     frame, so the v2.11 cache was useless. Now `_contentVersion` only bumps
 *     when data ACTUALLY changes (append or replace), while the stamp's
 *     last-candle OHLC field still catches an in-place update of the forming
 *     candle. Hovering with a stable last tick is now a true drawImage blit.
 *   - RESIZE pinning no longer freezes CSS-styled canvases: when the canvas
 *     has a computed CSS width (e.g. `width:100%`), the resize() function
 *     does NOT pin canvas.style.width to a fixed px — that pin used to write
 *     "800px" over the stylesheet rule and freeze the layout at first size
 *     on any responsive page. Only canvases with NO computed size get pinned.
 *   - WHEEL deltaMode (Firefox): wheel events in "lines" mode (deltaY=±3)
 *     are normalized to pixels (×33) before the exp curve, so the zoom factor
 *     matches Chrome. Without this, Firefox's zoom was ~30× weaker per notch.
 *   - VIDEO leak in destroy(): background video is paused + its timeupdate
 *     listener is removed + the element is src-cleared. Previously a destroyed
 *     chart kept a `<video>` alive via the closure, playing forever.
 *   - SYNTHETIC MOUSE after touch: a 600ms guard after touchend drops the
 *     mousedown/mousemove/mouseup sequence that mobile browsers always fire
 *     after a tap. Before, a single tap could start a preview, cancel it, then
 *     re-start it via the synthetic mouse, leaving a stuck preview.
 *   - LATE update() match window: the 300-bar lookup window is now exposed
 *     as `opts.lateUpdateWindow` (default 300, configurable) and a counter
 *   - DATA validation: invalid candles are counted (warning once per
 *     setData), negative volume is clamped to 0, open=0 falls back to the
 *     previous close (or the low) so `changePct` no longer shows Infinity%.
 *   - DRAWINGS by time: every drawing now stores `t1/t2/tIdx` (unix seconds)
 *     alongside its index, and the index is re-derived on every render via
 *     `_indexForTime(t)`. After a 50k trim that shifts all indices, your
 *     trend lines stay anchored to the same candle (was: "drift to other
 *     candles" — a real problem in live long-running sessions).
 *   - BAND hit-test: only the top/bottom edges (and corners) capture a
 *     click — the interior is now pannable like a Rectangle's interior.
 *   - TEXT tool editor: double-click a text drawing opens an inline DOM
 *     editor (same one used for settings-card fields); pressing Enter commits.
 *   - CODE clean-up: the dead first resetView() at line ~2022 was removed;
 *     window.THEME is re-published at the END of every render so external
 *     editors actually see the live instance theme; _openSettingsCard
 *     auto-discovers ALL keys in `state.settings` (not just a hard-coded
 *     list) — period/mult/fast/slow/signal/bins/color stay first; the local
 *     `pad2` inside drawCountdown no longer shadows the module-level helper.
 *   - TIMEZONE/LOCALE: constructor accepts `opts.timezone` (IANA, e.g.
 *     'Asia/Riyadh') and `opts.locale` (BCP-47, e.g. 'ar-SA'). When set,
 *     tick marks + crosshair time + countdown use the local timezone and
 *     locale for display; data is still stored in Unix seconds. Default
 *     behavior is unchanged (UTC + English short month names).
 *   - MIN PRICE AREA: the safety loop now breaks only when EVERY pane is at
 *     the 28px floor (was: when the LARGEST was ≤28, so a single tall pane
 *     could starve the price area on a small canvas).
 *
 * v2.15.0 — Regression fixes from field testing of v2.14.0 + leftover audit
 *   items. Highlights:
 *   - WHEEL ZOOM DIRECTION restored: wheel up = zoom IN (v2.14.0 inverted it);
 *     ctrl+wheel (trackpad pinch) unchanged — both now use -e.deltaY.
 *   - update() normalizes EVERY tick through _norm() again — the v2.14.0
 *     fast path stored the RAW caller object (Binance string prices,
 *     uncorrected high/low, NaN risk) and kept a live reference to it.
 *   - History pinning sign fixed: rightOffset -= appended when rightOffset < 0
 *     (was += at > 12 — scrolled the WRONG way AND at the WRONG time);
 *     _lastDataLen is now reset by setData/setSymbol/setTimeframe.
 *   - layout.paneBottom = chartBottom again — the v2.14.0 alias pointed at
 *     the pane-stack bottom and dropped the time axis INTO the volume strip.
 *   - DPR cap restored in resize() (mobile 2, desktop 3).
 *   - ResizeObserver feedback loop killed: canvas CSS size is pinned from the
 *     first measurement and no-op resizes are skipped (a hidden-sized canvas
 *     used to double its bitmap by DPR every observer cycle).
 *   - _paneResize is cleared on touchend (a single-finger drag used to keep
 *     resizing the pane FOREVER after the first separator touch).
 *   - PriceFormatter contract fixed everywhere: base = 10^decimals, minMove=1
 *     (v2.14.0 passed decimals AS minMove → 2 rounded prices to 0.02 steps,
 *     0 produced NaN; pane base was hard 100 → MACD on forex showed "0").
 *     Outlier legacy priceScale bases snap to the nearest power of 10 instead
 *     of throwing 'unexpected base' inside the render frame.
 *   - Finished drawings keep their own color (the preview no longer bakes the
 *     active/orange color into the drawing object).
 *   - Right-click deletes a drawing only when the cursor is actually OVER it.
 *   - Countdown no longer keeps the loop at 60fps — the 1s interval alone
 *     drives it (render-on-demand is real again).
 *   - invalidate() added to addDrawing / clearDrawings / removeDrawing /
 *     selectDrawingById / removeMarker; background image repaints on onload.
 *   - computeIndicators() is batched at most once per animation frame
 *     (_scheduleCompute) instead of O(N) on every tick.
 *   - Time snapping is skipped for weekly/monthly timeframes (snapTime) —
 *     week candles no longer move to Thursday, months no longer merge; the
 *     50,000-candle cap trims in batches instead of shift() per tick.
 *   - Crosshair time label derives its format from timeframe.ms (no more
 *     '1D'/'1W'/'1S' string matching); time-axis steps are nice numbers and
 *     getTimeMarks() is cached once per frame instead of built 3 times.
 *   - The per-frame rebuild budget is bypassed for 400ms after wheel/pinch/
 *     momentum too (previously only during mouse drags → indicators 3+
 *     lagged behind during zoom).
 *   - volumeProfile: zero price range no longer discards ALL volume; bounds
 *     and numBins are clamped.
 *   - prompt() replaced by an inline DOM editor for settings-card fields.
 *   - W/H get sane defaults when the canvas is hidden at construction.
 *   - destroy() removes the window resize listener (registered in
 *     _listeners) and cancels the queued indicator computation.
 *   - hline/vline/text switch back to cursor via setTool() (onToolChange
 *     fires) and repaint immediately.
 *
 * v2.14.0 — Correctness & robustness release (40+ audit fixes). Highlights:
 *   - paneToY per-pane scale (2nd/3rd pane indicator was drawn through the
 *     FIRST pane's scale → invisible — the reported "one draws, one doesn't
 *     show" bug), countdown real Unix time + adaptive hh:mm / mm:ss format,
 *     hitTestDrawing ctx ReferenceError, isBaseDecimal power-of-10,
 *     resize()→autoScale, RSI/MACD/SMA/EMA/Bollinger math corrections,
 *     hide→relayout, calculate()-null ≠ error + failure backoff, cache
 *     dataVersion stamping (kills per-tick rebuild storm), drag-bypass of
 *     the rebuild budget, pane budget NaN guard + cap 6, Node/SSR-safe
 *     globals, keydown input/Ctrl/multi-chart guards, complete destroy(),
 *     Delete/right-click delete selected drawing, wheel deltaY/deltaX/ctrl,
 *     left-button-only drags + window mousemove, momentum dt clamp, late
 *     candle update by time match, history view pinning, setData keepView,
 *     honest status bar, working onCrosshair (fractional-index fix), touch
 *     reachability, pointer:coarse detection, pane-value crosshair label.
 *
 * v2.13.0 — Multi-pane + countdown:
 *   - MULTI-PANE: each pane-type indicator (RSI, MACD, Stoch, ...) gets its
 *     OWN small window below the price area — its own background, grid,
 *     scale, mini price-axis labels, separator, and grab handle. They are
 *     NOT overlaid on each other. The price area shrinks to fit ALL panes
 *     (guaranteed ≥120px); each pane is clamped to [60, 200]px. All panes
 *     share the time axis + the offscreen-cache pipeline so panning/zooming
 *     stay smooth. Resizing is per-pane (drag the divider above pane[i] to
 *     resize only pane[i]; double-click resets just that pane).
 *     API: setPaneHeight(paneId, h) | setPaneHeight(h) | resetPaneHeight(id)
 *          getPaneHeight() → array of {id, height, auto, userValue}
 *   - COUNTDOWN: a 2-digit number that floats just to the right of the
 *     forming candle, at the close-price Y level — no border, no card, no
 *     background, just digits. Moves with the candle (X) and with the price
 *     (Y). Counts down based on the timeframe: minutes for H1+, seconds for
 *     sub-hourly, hours for D1+. Loop wakes up once per second (setInterval)
 *     while enabled — zero extra CPU when disabled.
 *     API: chart.showCountdown(bool) | chart.setCountdown({format,color,...})
 *          constructor opt: { countdown: true | {...} }
 *   - chart.destroy() — stops rAF + countdown interval + clears caches.
 *
 * v2.12.0 — Resizable pane + extra hardening:
 *   - DRAG-TO-RESIZE bottom indicator section: grab the divider between the
 *     price area and the RSI/MACD section and drag it up or down — the section
 *     grows/shrinks live, the price area takes the rest. A centered grip pill
 *     and an ns-resize cursor signal the affordance. Double-click resets to
 *     auto. setPaneHeight(h) / resetPaneHeight() / getPaneHeight() are the
 *     programmatic equivalents. Safe bounds (price ≥ 120px, pane ≥ 60px)
 *     prevent collapse.
 *   - INTEGER-SNAP layout: every chart edge (chartTop/paneTop/priceBottom/…)
 *     is floored to a whole CSS pixel in updateLayout(). Sub-pixel boundaries
 *     were the source of the faint 1px vibration on the separator + grid lines
 *     on fractional-DPR displays.
 *   - PER-FRAME CACHE REBUILD BUDGET: at most 2 offscreen indicator bitmaps
 *     rebuild in a single rAF tick. When many indicators all need a rebuild
 *     at once (window resize, bulk setData, theme switch), the rest blit
 *     their previous bitmap this frame and catch up over the next few ticks —
 *     no more 80ms+ hitch that drops a frame.
 *   - ASYNC-CALCULATE GUARD: if calculate() returns a Promise, the chart
 *     refuses to feed it into render() and logs a clear error. Previously this
 *     intermittently "disappeared" the indicator as the Promise resolved into
 *     stale state.
 *   - Safe JSON.stringify in the indicator fingerprint (circular settings no
 *     longer crash the cache key) + tight price-range floor (kills grid-line
 *     vibration when only one candle is in view).
 *
 * v2.11.0 — Render robustness (anti-jitter + anti-disappear):
 *   - RENDER-ON-DEMAND: the chart no longer repaints 60 times per second
 *     forever. It renders exactly once per change (interaction, data update,
 *     API call) and goes fully idle (zero CPU) until the next change. This is
 *     how TradingView / lightweight-charts stay smooth: no more frame-rate
 *     oscillation, no more stutter with heavy colorful indicators. The old
 *     alternating idle throttle (60↔30 fps) is gone — it was a visible
 *     jitter source when anything marked activity periodically.
 *   - PER-INDICATOR OFFSCREEN CACHE: every custom indicator renders into its
 *     own offscreen canvas, rebuilt ONLY when its inputs actually change
 *     (data, visible range, scale, size, settings, theme). Hovering the
 *     crosshair with a heavy multi-color indicator now costs one drawImage —
 *     not a full re-render — so the chart stays fluid.
 *   - An indicator that animates by itself can declare animated: true — it
 *     bypasses the cache and keeps the loop running (its render() is called
 *     every frame, like before).
 *   - AUTO-RETRY for failed calculate(): a transient failure (null/throw on
 *     one update) no longer makes an indicator disappear forever — it is
 *     retried automatically ~every 0.7s until it recovers.
 *   - CANVAS-WRECK GUARD: if user render code touches canvas.width/height
 *     (which wipes the whole bitmap — a classic "everything disappears" bug),
 *     the chart detects it and restores the bitmap + transform instantly.
 *
 * v2.9.0 — Dedicated pane section:
 *   - Pane indicators (RSI/MACD) now render in their own DEDICATED SECTION
 *     inside the chart, carved out below the price area (TradingView-style
 *     oscillator panes) — no longer a translucent layer on top of the candles.
 *     The price area shrinks to make room; candles stay fully visible.
 *   - The section has its own scale (autoScale → paneScale) with labels in the
 *     right axis strip, its own grid + separator, and SHARES the time axis so
 *     panning/zooming stay perfectly smooth.
 *   - The section reserves/frees itself automatically on addIndicator /
 *     removeIndicator / setIndicatorVisible (pane type).
 *   - Height: ~24% of chart height, clamped 80–200px. helpers.paneToY() maps
 *     into the section; def.getRange() can pin the scale (RSI 0..100).
 *
 * v2.8.0 — Stability & Signals:
 *   - Custom indicator render()/calculate() are SANDBOXED (per-indicator
 *     save/restore + try/catch): a buggy indicator can no longer leak canvas
 *     state (transform/clip/alpha/shadow) that visually "moves" the whole
 *     chart, nor leave a half-drawn frame (e.g. buy arrows drawn, sell
 *     arrows missing because the code threw mid-loop)
 *   - Errors are ALWAYS logged (not only in debug mode), shown once as a
 *     toast, and flagged with a red "!" badge on the indicator card until
 *     the indicator recovers
 *   - Markers hardened: ms-epoch / ISO-string / Date times auto-normalized
 *     to unix seconds, invalid shape/position/size coerced to safe defaults,
 *     new setMarkers() batch API (idempotent — safe to call every tick),
 *     and markers are drawn ABOVE indicator fills/gradients so buy/sell
 *     arrows are never covered by translucent indicator areas
 *   - Frame guard: nothing can kill the requestAnimationFrame loop; a failed
 *     frame is logged and the next frame starts clean
 *   - (v2.11.0 replaces the v2.8.0 idle half-rate throttle with true
 *     render-on-demand + per-indicator offscreen caching — smoother and cooler)
 *
 * Algorithms ported 1:1 from TradingView Lightweight Charts (v5):
 *   - optimalCandlestickWidth()  — exact same formula
 *   - candlestickWidth()         — wick parity adjustment
 *   - PriceTickSpanCalculator    — same dividers [2, 2.5, 2] rotation
 *   - PriceTickMarkBuilder       — same min(spans) approach
 *   - TickMarks.build()          — weight-based mark selection
 *   - Coordinate transforms      — internalHeight + scaleMargins
 *   - HiDPI rendering            — bitmap vs media coordinates
 *
 * License: Apache-2.0
 * ============================================================================= */

(function () {
'use strict';

/* ============================ Path2D (polyfill for Node.js tests) ========= */
// v2.18.3: drawCandles & drawGrid use Path2D for batched rendering (the
// Canvas-2D equivalent of WebGL instanced rendering — one GPU pass per
// batch instead of one per rect/line). Native Path2D exists in every
// browser since ~2015. In Node.js test sandboxes it doesn't, so we provide
// a minimal polyfill that just collects ops — the test ctx mock absorbs all
// draw calls anyway. The polyfill is NEVER used in a real browser.
var Path2D = (typeof window !== 'undefined' && window.Path2D)
  ? window.Path2D
  : (function () {
      function P() { this.ops = []; }
      P.prototype.rect = function (x, y, w, h) { this.ops.push(['rect', x, y, w, h]); };
      P.prototype.moveTo = function (x, y) { this.ops.push(['moveTo', x, y]); };
      P.prototype.lineTo = function (x, y) { this.ops.push(['lineTo', x, y]); };
      P.prototype.closePath = function () { this.ops.push(['closePath']); };
      P.prototype.arc = function (x, y, r, s, e) { this.ops.push(['arc', x, y, r, s, e]); };
      P.prototype.arcTo = function (x1, y1, x2, y2, r) { this.ops.push(['arcTo', x1, y1, x2, y2, r]); };
      P.prototype.bezierCurveTo = function (cp1x, cp1y, cp2x, cp2y, x, y) { this.ops.push(['bezier', cp1x, cp1y, cp2x, cp2y, x, y]); };
      P.prototype.quadraticCurveTo = function (cpx, cpy, x, y) { this.ops.push(['quad', cpx, cpy, x, y]); };
      P.prototype.ellipse = function (x, y, rx, ry, rot, s, e) { this.ops.push(['ellipse', x, y, rx, ry, rot, s, e]); };
      return P;
    })();

/* ============================ VERSION ====================================== */
const VERSION = '2.19.1';
const BADI_DEBUG = false; // Set to true to enable debug logging
// v2.14.0 (audit #12): tracks the chart the user last hovered/touched, so
// window-level keyboard shortcuts only apply to ONE chart on multi-chart pages.
let _lastActiveChartInstance = null;

/* ============================ THEME ========================================= */
// v2.3.0+: THEME is now a `let` (mutable) so users can override any color
// via the constructor `theme` option or via chart.setTheme(overrides).
// All default colors are listed below — override any of them by passing
// a partial object, e.g. new BadiCharts(canvas, { theme: { bull: '#00ff00', bear: '#ff0000', bg: '#ffffff' } })
let THEME = {
  bg:            '#0e1015',
  panelBg:       '#131722',
  toolbarBg:     '#1a1e2a',
  toolbarBorder: '#2a2e39',
  grid:          '#1c2030',
  gridStrong:    '#2a2e39',
  axis:          '#1c2030',
  // v2.4.0+: Dedicated axis colors — override these to change axis appearance
  // independently of the rest of the chart. Default to panelBg/toolbarBorder/textDim
  // so existing themes keep working.
  axisBg:        '#131722',   // background of the price + time axis area
  axisBorder:    '#2a2e39',   // border line between chart and axes
  axisText:      '#787b86',   // tick label color on both axes
  text:          '#cfd2da',
  textDim:       '#787b86',
  textBright:    '#f0f3fa',
  textFade:      '#5d606b',
  bull:          '#26a69a',
  bear:          '#ef5350',
  bullVol:       'rgba(38,166,154,0.50)',
  bearVol:       'rgba(239,83,80,0.50)',
  accent:        '#2962ff',
  crosshair:     '#787b86',
  crosshairLabel:'#363a45',
  ma1:           '#2962ff',
  ma2:           '#ff9800',
  ma3:           '#e91e63',
  bollingerMid:  '#ff9800',
  bollingerBand: 'rgba(156,39,176,0.40)',
  rsi:           '#7e57c2',
  rsiOver:       '#ef5350',
  rsiUnder:      '#26a69a',
  macd:          '#2962ff',
  macdSignal:    '#ff6d00',
  macdHistBull:  'rgba(38,166,154,0.50)',
  macdHistBear:  'rgba(239,83,80,0.50)',
  drawing:       '#2962ff',
  drawingActive: '#ffb74d',
  buttonBg:      '#1e222d',
  buttonHover:   '#2a2e39',
  buttonText:    '#cfd2da',
  currentPriceBull: '#26a69a',
  currentPriceBear: '#ef5350'
};

/* ============================ LWC-COMPATIBLE ENUMS ========================== */
// TickMarkType — matches LWC v5 enum
const TickMarkType = { Year:0, Month:1, DayOfMonth:2, Time:3, TimeWithSeconds:4 };

// TickMarkWeight values used by LWC's weight-based mark selection.
// Higher = more important (Year > Month > Day > Time > Seconds).
const TickMarkWeight = {
  EndOfTime:    0,
  EndOfGroup:   1,
  TimeWithSeconds: 5,
  Time:         10,
  DayOfMonth:   20,
  Day:          30,
  Week:         40,
  Month:        50,
  Year:         60,
  EndOfScale:   100
};

/* ============================ LWC HELPERS =================================== */
// From LWC src/helpers/mathex.ts
const EPS = 1e-14;
function greaterOrEqual(a, b, eps = EPS) { return a - b >= -eps; }
function equal(a, b, eps = EPS) { return Math.abs(a - b) < eps; }
// v2.14.0 FIX (audit drawing-71): drawings/appends like `color + '22'` assumed
// HEX colors — a named color ('teal') produced 'teal22' (invalid, silently
// ignored → no fill) and an rgba() color produced garbage. This helper builds
// a translucent version of ANY CSS color it can parse and falls back to the
// opaque original otherwise (visual = no tint instead of no drawing).
function withAlpha(color, alpha01) {
  if (typeof color !== 'string') return color;
  const a = Math.max(0, Math.min(1, alpha01));
  let c = color.trim();
  if (c[0] === '#') {
    let r, g, b;
    if (c.length === 7 || c.length === 9) {
      r = parseInt(c.slice(1, 3), 16); g = parseInt(c.slice(3, 5), 16); b = parseInt(c.slice(5, 7), 16);
    } else if (c.length === 4) {
      r = parseInt(c[1] + c[1], 16); g = parseInt(c[2] + c[2], 16); b = parseInt(c[3] + c[3], 16);
    } else {
      return color;
    }
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return color;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
  }
  // Already has alpha? Leave untouched.
  if (c.startsWith('rgba') || c.startsWith('hsla')) return color;
  // Named colors / rgb(): draw through a 1×1 canvas probe once and cache.
  try {
    if (!withAlpha._cache) withAlpha._cache = new Map();
    const key = c + '|' + a.toFixed(2);
    if (withAlpha._cache.has(key)) return withAlpha._cache.get(key);
    if (typeof document === 'undefined') return color;
    const probe = withAlpha._probe || (withAlpha._probe = document.createElement('canvas').getContext('2d'));
    probe.fillStyle = c;                       // normalizes ANY valid CSS color
    const norm = probe.fillStyle;              // '#rrggbb' or 'rgba(...)'
    const out = withAlpha(norm, a);
    withAlpha._cache.set(key, out);
    return out;
  } catch (_) {
    return color;
  }
}
// v2.14.0 FIX: the old check tested power-of-TWO (`base & (base-1) === 0`),
// so a decimal base like 100 was "not base decimal" and the tick-span
// calculator fell into the fractional-dividers branch, producing ugly grids
// like 0.125. LWC's actual check is power-of-TEN (2·5 divisibility):
function isBaseDecimal(base) {
  if (base < 0) return false;
  if (base > 1e18) return true;
  for (let b = base; b > 1; b /= 10) if (b % 10 !== 0) return false;
  return true;
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

// v2.16.0: bitmap-grid pixel snapping for crisp 1px horizontal/vertical lines.
// The old `Math.floor(y) + 0.5` only lands on a true bitmap pixel when dpr is
// an integer (1, 2, 3) — on 1.25 / 1.5 DPR (very common on Windows laptops)
// the +0.5 lands BETWEEN two bitmap rows and the line renders half-transparent
// and shimmering. The correct approach is to round to the nearest bitmap pixel
// then divide back to CSS coords; ctx.setTransform(dpr,...) maps that CSS coord
// to the exact center of a device pixel.
//
//   snapToV(yCss, dpr) → CSS coord on the CENTER of a bitmap row
//   snapToH(xCss, dpr) → CSS coord on the CENTER of a bitmap column
//
// Both also accept a half-shift: pass {half:true} to snap to the CENTER of a
// 1px line on the bitmap grid (used for hairlines), or omit for plain edge snap.
function snapToV(yCss, dpr) {
  // y on the CENTER of a bitmap row (for 1px horizontal strokes)
  return Math.round(yCss * dpr) / dpr + (0.5 / dpr);
}
function snapToH(xCss, dpr) {
  return Math.round(xCss * dpr) / dpr + (0.5 / dpr);
}

// v2.16.0 (#5): build a downsampled polyline from a (possibly null-sparse)
// numeric values array, over [firstIdx, lastIdx]. The result is an array of
// {x, y} screen-space points suitable for moveTo / lineTo.
//
// Strategy:
//   1. Always keep the FIRST and LAST non-null point (silhouette endpoints).
//   2. Always keep LOCAL EXTREMA (a point higher/lower than BOTH neighbors).
//   3. Otherwise, walk forward and drop a point if it is within `eps` pixels
//      of the line interpolated between the last kept point and the next
//      kept point (a tiny Ramer-Douglas-Peucker on the running window).
//
// This collapses the thousands of overlapping sub-pixel segments produced at
// extreme zoom-out (700+ visible bars) into ~50-200 visual segments, killing
// the random shimmer AND the wasted CPU. At normal zoom (<6 visible bars per
// pixel) every point survives, so behavior is identical to v2.15.0.
// v2.17.0 FIX: optional `yMap` — the value→Y mapper. Callers that render
// OUTSIDE the price area (pane indicators via helpers.paneToY, volume
// indicators via volToY) pass their own mapper; when omitted the map falls
// back to chart.priceToY (the historical behavior for overlay helpers).
// BEFORE this fix helpers.drawLine() ALWAYS projected values through the
// PRICE scale, so a pane indicator (RSI 0–100 on a 95,000-priced symbol)
// rasterized its line at price-area Y coordinates — far outside its own
// pane rect — and the pane clip erased it: an EMPTY pane that looked like
// "the bottom indicator doesn't work" (and toggling a second pane indicator
// changed the pane geometry, deciding WHICH of the two windows showed its
// line — the reported "one works, the other doesn't" exclusivity).
function downsampleLineSegments(chart, values, firstIdx, lastIdx, yMap) {
  if (!values) return [];
  const mapY = yMap || function (v) { return chart.priceToY(v); };
  // Step 1: collect non-null screen points (skip null runs).
  const raw = [];
  for (let i = firstIdx; i <= lastIdx; i++) {
    const v = values[i];
    if (v === null || v === undefined || typeof v !== 'number' || !isFinite(v)) continue;
    raw.push({i: i, x: chart.indexToX(i), y: mapY(v)});
  }
  const n = raw.length;
  if (n <= 2) return raw;
  // Density: only downsample if there are more points than ~2x the visible
  // pixel width. Below that the overhead is invisible and keeping every
  // point preserves exact silhouette.
  const visiblePx = Math.max(1, chart.chartRight - chart.chartLeft);
  if (n <= visiblePx * 2) return raw;
  // Step 2: Ramer-Douglas-Peucker with a small screen-space epsilon.
  const eps = 0.3;
  const keep = new Uint8Array(n);
  keep[0] = 1; keep[n - 1] = 1;
  // Use an explicit stack to avoid recursion limits on long series.
  const stack = [0, n - 1];
  while (stack.length > 0) {
    const end = stack.pop();
    const start = stack.pop();
    if (end - start < 2) continue;
    let maxD = -1, maxI = -1;
    const ax = raw[start].x, ay = raw[start].y;
    const bx = raw[end].x,   by = raw[end].y;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    for (let i = start + 1; i < end; i++) {
      const px = raw[i].x, py = raw[i].y;
      let d;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD > eps && maxI > 0) {
      keep[maxI] = 1;
      stack.push(start, maxI, maxI, end);
    }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(raw[i]);
  return out;
}


/* ============================ LWC CANDLESTICK WIDTH ========================= */
// Ported 1:1 from LWC src/renderers/candlestick-renderer.ts → optimalCandlestickWidth
function optimalCandlestickWidth(barSpacing, pixelRatio) {
  const barSpacingSpecialCaseFrom = 2.5;
  const barSpacingSpecialCaseTo = 4;
  const barSpacingSpecialCaseCoeff = 3;
  if (barSpacing >= barSpacingSpecialCaseFrom && barSpacing <= barSpacingSpecialCaseTo) {
    return Math.floor(barSpacingSpecialCaseCoeff * pixelRatio);
  }
  const barSpacingReducingCoeff = 0.2;
  const coeff = 1 -
    (barSpacingReducingCoeff *
      Math.atan(Math.max(barSpacingSpecialCaseTo, barSpacing) - barSpacingSpecialCaseTo)
    ) / (Math.PI * 0.5);
  const res = Math.floor(barSpacing * coeff * pixelRatio);
  const scaledBarSpacing = Math.floor(barSpacing * pixelRatio);
  const optimal = Math.min(res, scaledBarSpacing);
  return Math.max(Math.floor(pixelRatio), optimal);
}

function candlestickWidth(barSpacing, horizontalPixelRatio) {
  let width = optimalCandlestickWidth(barSpacing, horizontalPixelRatio);
  if (width >= 2) {
    const wickWidth = Math.floor(horizontalPixelRatio);
    if (wickWidth % 2 !== width % 2) width--;
  }
  return width;
}

/* ============================ LWC PRICE TICK SPAN =========================== */
// Ported 1:1 from LWC src/model/price-tick-span-calculator.ts
class PriceTickSpanCalculator {
  constructor(base, integralDividers) {
    this._base = base;
    this._integralDividers = integralDividers;
    if (isBaseDecimal(this._base)) {
      this._fractionalDividers = [2, 2.5, 2];
    } else {
      this._fractionalDividers = [];
      let baseRest = this._base;
      while (baseRest !== 1) {
        if ((baseRest % 2) === 0) {
          this._fractionalDividers.push(2);
          baseRest /= 2;
        } else if ((baseRest % 5) === 0) {
          this._fractionalDividers.push(2, 2.5);
          baseRest /= 5;
        } else {
          throw new Error('unexpected base');
        }
        if (this._fractionalDividers.length > 100) {
          throw new Error('something wrong with base');
        }
      }
    }
  }
  tickSpan(high, low, maxTickSpan) {
    const minMovement = (this._base === 0) ? 0 : (1 / this._base);
    let resultTickSpan = Math.pow(10, Math.max(0, Math.ceil(Math.log10(high - low))));
    let index = 0;
    let c = this._integralDividers[0];
    while (true) {
      const resultTickSpanLargerMinMovement =
        greaterOrEqual(resultTickSpan, minMovement) && resultTickSpan > (minMovement + EPS);
      const resultTickSpanLargerMaxTickSpan =
        greaterOrEqual(resultTickSpan, maxTickSpan * c);
      const resultTickSpanLarger1 = greaterOrEqual(resultTickSpan, 1);
      const haveToContinue =
        resultTickSpanLargerMinMovement && resultTickSpanLargerMaxTickSpan && resultTickSpanLarger1;
      if (!haveToContinue) break;
      resultTickSpan /= c;
      c = this._integralDividers[++index % this._integralDividers.length];
    }
    if (resultTickSpan <= (minMovement + EPS)) {
      resultTickSpan = minMovement;
    }
    resultTickSpan = Math.max(1, resultTickSpan);
    if ((this._fractionalDividers.length > 0) && equal(resultTickSpan, 1)) {
      index = 0;
      c = this._fractionalDividers[0];
      while (greaterOrEqual(resultTickSpan, maxTickSpan * c) &&
             resultTickSpan > (minMovement + EPS)) {
        resultTickSpan /= c;
        c = this._fractionalDividers[++index % this._fractionalDividers.length];
      }
    }
    return resultTickSpan;
  }
}

/* ============================ LWC PRICE TICK MARK BUILDER =================== */
// Ported from LWC src/model/price-tick-mark-builder.ts
class PriceTickMarkBuilder {
  constructor(priceScale, base, coordToLogical, logicalToCoord) {
    this._priceScale = priceScale;
    this._base = base;
    this._coordToLogical = coordToLogical;
    this._logicalToCoord = logicalToCoord;
    this._marks = [];
  }
  tickSpan(high, low) {
    if (high < low) throw new Error('high < low');
    const scaleHeight = this._priceScale.height();
    const markHeight = this._tickMarkHeight();
    const maxTickSpan = (high - low) * markHeight / scaleHeight;
    const c1 = new PriceTickSpanCalculator(this._base, [2, 2.5, 2]).tickSpan(high, low, maxTickSpan);
    const c2 = new PriceTickSpanCalculator(this._base, [2, 2, 2.5]).tickSpan(high, low, maxTickSpan);
    const c3 = new PriceTickSpanCalculator(this._base, [2.5, 2, 2]).tickSpan(high, low, maxTickSpan);
    return Math.min(c1, c2, c3);
  }
  _tickMarkHeight() {
    return Math.ceil(this._priceScale.fontSize() * this._priceScale.tickMarkDensity());
  }
  rebuild() {
    const ps = this._priceScale;
    const firstValue = ps.firstValue();
    if (firstValue === null) { this._marks = []; return; }
    const scaleHeight = ps.height();
    const bottom = this._coordToLogical(scaleHeight - 1, firstValue);
    const top = this._coordToLogical(0, firstValue);
    const high = Math.max(bottom, top);
    const low = Math.min(bottom, top);
    if (high === low) { this._marks = []; return; }
    const span = this.tickSpan(high, low);
    this._updateMarks(firstValue, span, high, low);
  }
  _updateMarks(firstValue, span, high, low) {
    const ps = this._priceScale;
    const marks = this._marks;
    let mod = high % span;
    mod += mod < 0 ? span : 0;
    let prevCoord = null;
    let targetIndex = 0;
    const minTickHeight = this._tickMarkHeight();
    for (let logical = high - mod; logical > low; logical -= span) {
      const coord = this._logicalToCoord(logical, firstValue);
      if (prevCoord !== null && Math.abs(coord - prevCoord) < minTickHeight) continue;
      if (coord < 0 || coord > ps.height() - 1) continue;
      if (targetIndex < marks.length) {
        marks[targetIndex].coord = coord;
        marks[targetIndex].label = ps.formatLogical(logical);
        marks[targetIndex].logical = logical;
      } else {
        marks.push({coord, label: ps.formatLogical(logical), logical});
      }
      targetIndex++;
      prevCoord = coord;
    }
    marks.length = targetIndex;
  }
  marks() { return this._marks; }
}

/* ============================ TIME WEIGHT ASSIGNMENT ======================== */
// Assign TickMarkWeight to each candle based on its time (UTCTimestamp).
// Matches LWC's fillWeightsForPoints logic for business-day/UTCTimestamp.
// (v2.14.0: the TimeTickMarks class was deleted — it was dead code. Only
// assignTimeWeight survives, used by getTimeMarks().)
function assignTimeWeight(prevTime, curTime) {
  if (prevTime === null) return TickMarkWeight.EndOfTime;
  const prev = new Date(prevTime * 1000);
  const cur = new Date(curTime * 1000);
  if (cur.getUTCFullYear() !== prev.getUTCFullYear()) return TickMarkWeight.Year;
  if (cur.getUTCMonth() !== prev.getUTCMonth()) return TickMarkWeight.Month;
  if (cur.getUTCDate() !== prev.getUTCDate()) return TickMarkWeight.DayOfMonth;
  if (cur.getUTCHours() !== prev.getUTCHours()) return TickMarkWeight.Time;
  if (cur.getUTCMinutes() !== prev.getUTCMinutes()) return TickMarkWeight.Time;
  return TickMarkWeight.TimeWithSeconds;
}

/* ============================ PRICE FORMATTER ============================== */
// Ported from LWC src/formatters/price-formatter.ts
function numberToStringWithLeadingZero(value, length) {
  if (!Number.isFinite(value)) return 'n/a';
  if (length === 0) return value.toString();
  const dummy = '0000000000000000';
  return (dummy + value.toString()).slice(-length);
}

class PriceFormatter {
  constructor(priceScale = 100, minMove = 1) {
    this._priceScale = priceScale;
    this._minMove = minMove;
    this._fractionalLength = 0;
    if (priceScale > 0 && minMove > 0) {
      let base = priceScale;
      while (base > 1) { base /= 10; this._fractionalLength++; }
    }
  }
  format(price) {
    const sign = price < 0 ? '\u2212' : '';
    price = Math.abs(price);
    return sign + this._formatAsDecimal(price);
  }
  _formatAsDecimal(price) {
    const base = this._priceScale / this._minMove;
    let intPart = Math.floor(price);
    let fracString = '';
    const fracLength = this._fractionalLength;
    if (base > 1) {
      let fracPart = +(Math.round(price * base) - intPart * base).toFixed(fracLength);
      if (fracPart >= base) { fracPart -= base; intPart += 1; }
      fracString = '.' + numberToStringWithLeadingZero(
        +fracPart.toFixed(fracLength) * this._minMove, fracLength);
    } else {
      // v2.15.0 FIX: round the PRICE, not the floored integer — a symbol with
      // decimals = 0 used to display 1234.56 as "1234" (silent floor).
      intPart = Math.round(price * base) / base;
      if (fracLength > 0) fracString = '.' + numberToStringWithLeadingZero(0, fracLength);
    }
    return intPart.toFixed(0) + fracString;
  }
}

/* ============================ DATE/TIME FORMATTERS ========================= */
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

// v2.16.0 (#8): tzOpts is {locale, timezone, hour12}. When timezone is set
// the strings render in that timezone; otherwise UTC (the v2.15.0 default).
function formatMonthYear(date, locale, tzOpts) {
  tzOpts = tzOpts || {};
  const o = {month: 'short', year: 'numeric'};
  o.timeZone = tzOpts.timezone || 'UTC';
  if (tzOpts.hour12 != null) o.hour12 = tzOpts.hour12;
  try { return date.toLocaleDateString(locale || 'en-US', o); }
  catch (_) { return date.toISOString(); }
}
function formatMonth(date, locale, tzOpts) {
  tzOpts = tzOpts || {};
  const o = {month: 'short', year: '2-digit'};
  o.timeZone = tzOpts.timezone || 'UTC';
  try { return date.toLocaleDateString(locale || 'en-US', o); }
  catch (_) { return date.toISOString(); }
}
function formatDay(date, locale, tzOpts) {
  tzOpts = tzOpts || {};
  const o = {day: '2-digit', month: 'short'};
  o.timeZone = tzOpts.timezone || 'UTC';
  try { return date.toLocaleDateString(locale || 'en-US', o); }
  catch (_) { return date.toISOString(); }
}
function formatTime(date, tzOpts) {
  tzOpts = tzOpts || {};
  if (tzOpts.timezone) {
    try {
      const o = {hour: '2-digit', minute: '2-digit', timeZone: tzOpts.timezone};
      if (tzOpts.hour12 != null) o.hour12 = tzOpts.hour12;
      return new Intl.DateTimeFormat(tzOpts.locale || 'en-US', o).format(date);
    } catch (_) {}
  }
  return pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes());
}
function formatTimeWithSeconds(date, tzOpts) {
  tzOpts = tzOpts || {};
  if (tzOpts.timezone) {
    try {
      const o = {hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tzOpts.timezone};
      if (tzOpts.hour12 != null) o.hour12 = tzOpts.hour12;
      return new Intl.DateTimeFormat(tzOpts.locale || 'en-US', o).format(date);
    } catch (_) {}
  }
  return pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes()) + ':' + pad2(date.getUTCSeconds());
}

// Format a tick mark based on its weight (LWC-style tickMarkFormatter).
// Matches LWC's default behavior: shorter labels for higher-density weights.
// v2.16.0: optional tzOpts {locale, timezone, hour12} — when timezone is set,
// the label renders in that timezone instead of UTC. Default = UTC (unchanged).
function formatTickMark(timeSec, weight, tf, tzOpts) {
  const date = new Date(timeSec * 1000);
  switch (weight) {
    case TickMarkWeight.Year:
      if (tzOpts && tzOpts.timezone) {
        try { return new Intl.DateTimeFormat(tzOpts.locale || 'en-US', {year: 'numeric', timeZone: tzOpts.timezone}).format(date); }
        catch (_) {}
      }
      return String(date.getUTCFullYear());
    case TickMarkWeight.Month:
      return formatMonth(date, (tzOpts && tzOpts.locale) || 'en-US', tzOpts);
    case TickMarkWeight.DayOfMonth:
    case TickMarkWeight.Day:
      if (tzOpts && tzOpts.timezone) {
        try { return new Intl.DateTimeFormat(tzOpts.locale || 'en-US', {day: 'numeric', timeZone: tzOpts.timezone}).format(date); }
        catch (_) {}
      }
      return String(date.getUTCDate()); // just day number, like LWC
    case TickMarkWeight.Time:            return formatTime(date, tzOpts);
    case TickMarkWeight.TimeWithSeconds:return formatTimeWithSeconds(date, tzOpts);
    default:                            return formatTime(date, tzOpts);
  }
}

/* ============================ CONSTANTS ===================================== */
// Timeframes and symbols are now USER-PROVIDED via the chart constructor options.
// The chart library itself is data-source-agnostic.

// HEADLESS v2.1.0+: No built-in indicators. The library ships with ZERO
// pre-coded indicators (no MA, EMA, BB, RSI, MACD, volsma, vprof). Users register
// their own indicators via chart.addIndicator(definition).
//
// A custom indicator definition looks like:
//   {
//     id:        'mySMA',                 // unique id
//     label:     'My SMA',                // display label
//     type:      'overlay' | 'pane' | 'volume',  // where it renders
//     color:     '#2962ff',               // color used in legend/cards
//     settings:  { period: 20 },          // default settings (cloned per instance)
//     calculate: function(candles, settings) -> array of values (or null entries)
//     render:    function(ctx, values, helpers, settings, state) -> draws on canvas
//     formatValue: function(value, settings) -> string,        // optional
//     getRange:    function(values, settings) -> {min, max}     // optional, for pane indicators
//   }
//
// `helpers` passed to render() includes:
//   firstIdx, lastIdx, indexToX(i), priceToY(p), volToY(v), paneToY(v),
//   chartLeft, chartRight, priceTop, priceBottom, volTop, volBottom,
//   paneTop, paneBottom, barSpacing, dpr, candles, THEME,
//   optimalCandlestickWidth(barSpacing, dpr)
const INDICATOR_LIST = [];
// `Indicators` is kept as a public math utility (SMA, EMA, Bollinger, RSI, MACD,
// VolumeProfile) — useful when writing your own indicator definitions.
// It is no longer wired to anything inside the chart; you call it from your own
// calculate() functions if you want to reuse the math.

const DRAW_TOOLS = [
  {id:'cursor',   label:'Cursor',           icon:'cursor'},
  {id:'trend',    label:'Trend Line',       icon:'trend'},
  {id:'channel',  label:'Parallel Channel', icon:'channel'},
  {id:'hline',    label:'Horizontal Line',  icon:'hline'},
  {id:'vline',    label:'Vertical Line',    icon:'vline'},
  {id:'band',     label:'Band / Zone',      icon:'band'},
  {id:'rect',     label:'Rectangle',        icon:'rect'},
  {id:'arrow',    label:'Arrow',            icon:'arrow'},
  {id:'fib',      label:'Fib Retracement',  icon:'fib'},
  {id:'brush',    label:'Brush',            icon:'brush'},
  {id:'poly',     label:'Polygon',          icon:'poly'},
  {id:'text',     label:'Text',             icon:'text'},
  {id:'ray',      label:'Ray',              icon:'ray'},
  {id:'eraser',   label:'Delete Drawing',   icon:'eraser'}
];

// Symbol shortcuts for mobile toolbar
const TOOL_SHORTCUTS = {
  cursor:'↖', trend:'╱', channel:'╫', hline:'─', vline:'│',
  band:'▓', rect:'▭', arrow:'→', fib:'Fib', brush:'~',
  poly:'⬠', text:'T', ray:'→│', eraser:'✕'
};

/* ============================ INDICATOR MATH =============================== */
const Indicators = {
  // v2.14.0 FIX (audit #52): input validation. period <= 0 / non-finite no
  // longer poisons the output (NaN cascade) — an invalid period yields an
  // all-null series instead.
  sma(values, period) {
    const out = new Array(values.length).fill(null);
    if (!Array.isArray(values) || !isFinite(period) || period < 1) return out;
    period = Math.floor(period);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      // v2.14.0 (audit #52): NaN/null inputs no longer pollute the rolling sum
      if (v == null || !isFinite(v)) { out[i] = null; continue; }
      sum += v;
      if (i >= period) {
        const old = values[i - period];
        if (old != null && isFinite(old)) sum -= old;
      }
      if (i >= period - 1 && isFinite(sum)) out[i] = sum / period;
    }
    return out;
  },
  ema(values, period) {
    const out = new Array(values.length).fill(null);
    if (!Array.isArray(values) || !isFinite(period) || period < 1) return out;
    period = Math.floor(period);
    const k = 2 / (period + 1);
    let prev = null;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || !isFinite(v)) continue;   // skip bad points, don't poison
      if (prev === null) {
        if (i >= period - 1) {
          let s = 0, cnt = 0;
          for (let j = i - period + 1; j <= i; j++) {
            if (values[j] != null && isFinite(values[j])) { s += values[j]; cnt++; }
          }
          if (cnt === period) { prev = s / period; out[i] = prev; }
        }
      } else {
        prev = v * k + prev * (1 - k);
        out[i] = prev;
      }
    }
    return out;
  },
  bollinger(values, period, mult) {
    const out = { mid: new Array(values.length).fill(null), upper: new Array(values.length).fill(null), lower: new Array(values.length).fill(null) };
    if (!Array.isArray(values) || !isFinite(period) || period < 2) return out;
    // v2.14.0 FIX (audit #52): O(N·period) → O(N) rolling variance.
    period = Math.floor(period);
    const mid = out.mid;
    let sum = 0, sumSq = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v == null || !isFinite(v)) continue;
      sum += v; sumSq += v * v;
      if (i >= period) {
        const old = values[i - period];
        if (old != null && isFinite(old)) { sum -= old; sumSq -= old * old; }
      }
      if (i >= period - 1) {
        const m = sum / period;
        const varr = Math.max(0, sumSq / period - m * m);   // clamp FP drift
        const sd = Math.sqrt(varr);
        mid[i] = m;
        out.upper[i] = m + mult * sd;
        out.lower[i] = m - mult * sd;
      }
    }
    return out;
  },
  rsi(values, period) {
    const out = new Array(values.length).fill(null);
    if (!Array.isArray(values) || !isFinite(period) || period < 1) return out;
    period = Math.floor(period);
    let gainAvg = 0, lossAvg = 0;
    for (let i = 1; i < values.length; i++) {
      const a = values[i - 1], b = values[i];
      if (a == null || b == null || !isFinite(a) || !isFinite(b)) continue;
      const ch = b - a;
      const gain = Math.max(0, ch);
      const loss = Math.max(0, -ch);
      if (i <= period) {
        gainAvg += gain;
        lossAvg += loss;
        if (i === period) {
          gainAvg /= period;
          lossAvg /= period;
          // v2.14.0 FIX (audit #7): the boundary cases were wrong. Correct
          // Wilder RSI: down-move average == 0 → RSI = 100 (pure uptrend);
          // up-move average == 0 → RSI = 0 (pure downtrend). The old code
          // computed `rs = lossAvg === 0 ? 100 : gainAvg/lossAvg` then
          // `100 - 100/(1+rs)` → 99.01 instead of 100.
          if (lossAvg === 0 && gainAvg === 0) out[i] = 50;
          else if (lossAvg === 0) out[i] = 100;
          else if (gainAvg === 0) out[i] = 0;
          else out[i] = 100 - 100 / (1 + gainAvg / lossAvg);
        }
      } else {
        gainAvg = (gainAvg * (period - 1) + gain) / period;
        lossAvg = (lossAvg * (period - 1) + loss) / period;
        if (lossAvg === 0 && gainAvg === 0) out[i] = 50;
        else if (lossAvg === 0) out[i] = 100;
        else if (gainAvg === 0) out[i] = 0;
        else out[i] = 100 - 100 / (1 + gainAvg / lossAvg);
      }
    }
    return out;
  },
  macd(values, fast, slow, signal) {
    const ef = Indicators.ema(values, fast);
    const es = Indicators.ema(values, slow);
    const macdLine = values.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i] - es[i] : null));
    // v2.14.0 FIX (audit #6): the SIGNAL EMA was computed over a series where
    // every pre-warmup null had been replaced by 0 — those fake zeros dragged
    // the signal line toward zero for its entire warm-up and produced a wrong
    // histogram for hundreds of bars. EMA now runs over the COMPACTED valid
    // segment only, and results are mapped back to their original indexes.
    const idxs = [];
    const valid = [];
    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i] !== null && isFinite(macdLine[i])) { idxs.push(i); valid.push(macdLine[i]); }
    }
    const sigValid = Indicators.ema(valid, signal);
    const sig = new Array(macdLine.length).fill(null);
    for (let k = 0; k < idxs.length; k++) sig[idxs[k]] = sigValid[k];
    const hist = macdLine.map((v, i) => (v !== null && sig[i] !== null ? v - sig[i] : null));
    return {macd: macdLine, signal: sig, hist};
  },
  // Volume Profile: builds histogram of volume by price level over visible range.
  // Returns {bins: [{priceLow, priceHigh, volume, isUp}], maxVol, vwap, pocPrice}
  volumeProfile(candles, firstIdx, lastIdx, numBins = 24) {
    // v2.15.0 FIX: clamp the window and the bin count — callers used to pass
    // raw visible indices that could be negative / beyond the array (NaN
    // min/max → a broken profile) and arbitrary numBins (0 → division by
    // zero, huge values → thousands of allocations).
    if (!Array.isArray(candles) || candles.length === 0) return null;
    firstIdx = Math.max(0, Math.floor(firstIdx || 0));
    lastIdx = Math.min(candles.length - 1, Math.floor(lastIdx || 0));
    numBins = Math.max(1, Math.min(500, Math.floor(numBins || 24)));
    if (firstIdx >= lastIdx) return null;
    let minP = Infinity, maxP = -Infinity;
    let totalVol = 0, totalPV = 0;
    for (let i = firstIdx; i <= lastIdx; i++) {
      const c = candles[i];
      if (!c) continue;
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
      const typical = (c.high + c.low + c.close) / 3;
      totalVol += c.volume;
      totalPV += typical * c.volume;
    }
    // v2.15.0 FIX: a ZERO range (every candle high === low, e.g. a flat line
    // or a single price level) previously returned null and DISCARDED all the
    // volume of the window. Give the range a tiny epsilon so everything
    // aggregates into bin 0 instead.
    if (minP === Infinity) return null;
    if (maxP === minP) maxP = minP + (Math.abs(minP) > 0 ? Math.abs(minP) * 1e-6 : 1e-6);
    const range = maxP - minP;
    const binSize = range / numBins;
    const bins = new Array(numBins).fill(0).map((_, i) => ({
      priceLow: minP + i * binSize,
      priceHigh: minP + (i + 1) * binSize,
      volume: 0,
      upVol: 0,
      downVol: 0
    }));
    // Distribute each candle's volume across the bins it spans (using high-low range)
    for (let i = firstIdx; i <= lastIdx; i++) {
      const c = candles[i];
      if (!c) continue;
      const cLow = c.low, cHigh = c.high;
      const cRange = cHigh - cLow;
      const firstBin = Math.max(0, Math.floor((cLow - minP) / binSize));
      const lastBin = Math.min(numBins - 1, Math.floor((cHigh - minP) / binSize));
      const isUp = c.close >= c.open;
      for (let b = firstBin; b <= lastBin; b++) {
        const binLow = bins[b].priceLow;
        const binHigh = bins[b].priceHigh;
        // v2.15.0 FIX: a ZERO-RANGE candle (high === low) produced
        // overlap = 0 → portion = 0 → its volume vanished entirely. A point
        // candle now contributes its whole volume to the bin holding it.
        let portion;
        if (cRange <= 0) {
          portion = (cLow >= binLow && cLow <= binHigh) ? 1 : 0;
        } else {
          const overlapLow = Math.max(cLow, binLow);
          const overlapHigh = Math.min(cHigh, binHigh);
          portion = Math.max(0, overlapHigh - overlapLow) / cRange;
        }
        const vol = c.volume * portion;
        bins[b].volume += vol;
        if (isUp) bins[b].upVol += vol;
        else bins[b].downVol += vol;
      }
    }
    let maxVol = 0;
    let pocIdx = 0;
    for (let i = 0; i < numBins; i++) {
      if (bins[i].volume > maxVol) { maxVol = bins[i].volume; pocIdx = i; }
    }
    const vwap = totalVol > 0 ? totalPV / totalVol : (minP + maxP) / 2;
    const pocPrice = (bins[pocIdx].priceLow + bins[pocIdx].priceHigh) / 2;
    return {bins, maxVol, vwap, pocPrice, pocIdx, minP, maxP, totalVol};
  }
};

/* ============================ DATA LAYER (USER-PROVIDED) ================== */
// The chart does NOT generate fake data. The user must call setData() with
// real candle data. Each candle: {time: number (unix seconds), open, high, low, close, volume}
// time must be monotonically increasing across candles.
class DataLayer {
  constructor() {
    this.candles = [];          // sorted array of candles
    this.timeframeMs = 60 * 60 * 1000; // default 1H, updated via setTimeframe
    // v2.15.0: when true, _norm() snaps incoming times to the timeframe
    // boundary (intraday behavior). Weekly/monthly candles arrive from the
    // exchange ALIGNED to their (irregular) boundaries — snapping a weekly
    // candle to the epoch-week boundary moved it to THURSDAY, and a monthly
    // "tf" merged two real months into one Map key. The chart sets this to
    // false automatically for timeframes >= 1 week (see setTimeframe).
  }
  // v2.5.0+: Normalize + clone a candle object.
  // - Converts time to a number (and from ms to seconds if > 1e11)
  // - Snaps time to the candle's open boundary using timeframeMs
  // - Converts OHLCV to numbers
  // - Validates that all values are finite
  // - Ensures high >= max(open, close) and low <= min(open, close)
  // - Returns a NEW object (never stores a reference to the input)
  // Returns null if the input is invalid.
  // v2.16.0 (#18): negative volume is clamped to 0 (some feeds send signed
  // deltas); open = 0 is repaired from the previous candle's close (or from
  // the low if there is no previous) so the legend's changePct doesn't blow
  // up to Infinity. Both repairs are counted on `this._dataRepairs` and
  // reported once per setData via a console.warn summary.
  _norm(raw, prevClose) {
    if (!raw || typeof raw !== 'object') return null;
    let t = +raw.time;
    if (!Number.isFinite(t)) return null;
    // Auto-convert millisecond timestamps to seconds (Binance uses ms; most APIs use s)
    if (t > 1e11) t = Math.floor(t / 1000);
    // Snap time to the candle's open boundary (align to timeframe) —
    // skipped when snapTime is false (weekly/monthly data, v2.15.0)
    const tf = this.timeframeMs / 1000;
    if (tf > 0 && this.snapTime !== false) t = Math.floor(t / tf) * tf;
    let o = +raw.open, h = +raw.high, l = +raw.low, cl = +raw.close;
    if (![o, h, l, cl].every(Number.isFinite)) return null;
    // v2.16.0 (#18): repair open = 0 → fall back to previous close (the
    // correct continuation value) or, if there is no previous, to the low.
    // An open of 0 made changePct = (close - 0) / 0 * 100 = Infinity in the
    // legend, and any indicator dividing by open produced NaN.
    if (o === 0) {
      if (prevClose != null && isFinite(prevClose) && prevClose !== 0) {
        o = prevClose;
      } else if (l !== 0) {
        o = l;
      } else if (cl !== 0) {
        o = cl;
      } else {
        o = 1;   // all zero — at least keep the legend finite
      }
      if (this._dataRepairs) this._dataRepairs.openZero++;
    }
    // v2.16.0 (#18): clamp negative volume to 0 (some feeds send a signed
    // delta by mistake). Real exchanges never report negative volume.
    let v = +raw.volume;
    if (Number.isFinite(v)) {
      if (v < 0) {
        v = 0;
        if (this._dataRepairs) this._dataRepairs.negativeVolume++;
      }
    } else {
      v = 0;
    }
    return {
      time: t,
      open: o,
      high: Math.max(h, o, cl),
      low:  Math.min(l, o, cl),
      close: cl,
      volume: v
    };
  }
  // v2.5.0+: Clear all stored candles (used on symbol/timeframe switch).
  clear() { this.candles = []; }
  setData(candles) {
    if (!Array.isArray(candles)) throw new Error('setData: expected array of candles');
    // v2.5.0+: Normalize + clone every candle (no shared references).
    // v2.16.0 (#18): count invalid candles + repairs, and warn once per
    // setData so the user knows their feed is dropping/repairing data
    // (previously silent — a feed returning NaN in one field just shrank
    // the dataset with no signal).
    const repairs = {openZero: 0, negativeVolume: 0};
    this._dataRepairs = repairs;
    const map = new Map();
    let invalid = 0, duplicates = 0;
    let prevClose = null;
    for (const raw of candles) {
      const c = this._norm(raw, prevClose);
      if (!c) { invalid++; continue; }
      if (map.has(c.time)) duplicates++;
      map.set(c.time, c);   // last-wins for duplicates (unchanged behavior)
      prevClose = c.close;
    }
    this.candles = Array.from(map.values()).sort((a, b) => a.time - b.time);
    // One warning per setData when something was actually wrong.
    if (typeof console !== 'undefined' && (invalid > 0 || duplicates > 0 ||
        repairs.openZero > 0 || repairs.negativeVolume > 0)) {
      const parts = [];
      if (invalid) parts.push(invalid + ' invalid');
      if (duplicates) parts.push(duplicates + ' duplicate time' + (duplicates > 1 ? 's' : ''));
      if (repairs.openZero) parts.push(repairs.openZero + ' open=0 repaired');
      if (repairs.negativeVolume) parts.push(repairs.negativeVolume + ' negative volume clamped');
      console.warn('[BadiCharts] setData: ' + parts.join(', ') +
        ' (out of ' + candles.length + ' input candles).');
    }
  }
  // Append or update a single candle (real-time tick).
  // v2.5.0+: Normalizes + clones the input. Stale ticks (older than the last
  // candle) are silently ignored to prevent out-of-order data corruption.
  update(raw) {
    const last = this.candles[this.candles.length - 1];
    const c = this._norm(raw, last ? last.close : null);
    if (!c) return;
    if (!last || c.time > last.time) {
      this.candles.push(c);
      // v2.15.0: batched cap trim. The old `shift()` fired on EVERY new candle
      // once the array held 50,000 items — an O(N) array move per tick. Now
      // the array is trimmed back in one splice per 1,000 candles (memory
      // stays bounded at ~51,000, worst-case amortized cost is 100× lower).
      // NOTE: trimming shifts indices — index-anchored drawings/markers keep
      // the pre-existing (documented) behavior of following the array.
      if (this.candles.length > 51000) this.candles.splice(0, this.candles.length - 50000);
    } else if (c.time === last.time) {
      this.candles[this.candles.length - 1] = c;
    }
    // else: stale tick (older than last candle) — ignored
  }
  // Append multiple candles (batch)
  append(candles) {
    if (!Array.isArray(candles)) return;
    for (const c of candles) this.update(c);
  }
  setTimeframeMs(ms) { this.timeframeMs = ms; }
  get length() { return this.candles.length; }
}

/* ============================ PRICE SCALE (LWC-COMPAT) ===================== */
// Wraps the price axis state and provides LWC-compatible coordinate transforms.
class PriceScale {
  constructor(opts) {
    this._height = 0;
    this._priceRange = null; // {min, max}
    this._opts = opts;
    this._formatter = null;
    this._markBuilder = null;
  }
  setHeight(h) { this._height = h; }
  height() { return this._height; }
  setRange(min, max) { this._priceRange = {min, max}; }
  priceRange() { return this._priceRange; }
  isEmpty() { return !this._priceRange || this._priceRange.min === this._priceRange.max; }
  firstValue() { return this._priceRange ? this._priceRange.min : null; }
  fontSize() { return 11; }
  // LWC default: tickMarkDensity = 2.5 (NOT 1).
  // tickMarkHeight = ceil(fontSize * tickMarkDensity) = ceil(11 * 2.5) = 28px
  // This is the MINIMUM spacing between price labels, so they don't overlap.
  tickMarkDensity() { return 2.5; }
  isInverted() { return false; }
  // scaleMargins: {top, bottom} as fractions. LWC defaults: top 0.2, bottom 0.1
  scaleMargins() { return this._opts.scaleMargins || {top: 0.2, bottom: 0.1}; }
  topMarginPx() {
    const m = this.scaleMargins();
    return this.isInverted() ? m.bottom * this._height : m.top * this._height;
  }
  bottomMarginPx() {
    const m = this.scaleMargins();
    return this.isInverted() ? m.top * this._height : m.bottom * this._height;
  }
  internalHeight() {
    return this._height - this.topMarginPx() - this.bottomMarginPx();
  }
  // LWC coordinate transform (logical → coordinate)
  logicalToCoordinate(logical, baseValue) {
    if (this.isEmpty()) return 0;
    const range = this._priceRange;
    const invCoordinate = this.bottomMarginPx() +
      (this.internalHeight() - 1) * (logical - range.min) / (range.max - range.min);
    return this.isInverted() ? invCoordinate : (this._height - 1 - invCoordinate);
  }
  coordinateToLogical(coordinate, baseValue) {
    if (this.isEmpty()) return 0;
    const invCoordinate = this.isInverted() ? coordinate : (this._height - 1 - coordinate);
    const range = this._priceRange;
    return range.min + (range.max - range.min) *
      ((invCoordinate - this.bottomMarginPx()) / (this.internalHeight() - 1));
  }
  setFormatter(f) { this._formatter = f; }
  formatter() { return this._formatter; }
  // v2.15.0: change the tick base at runtime — the mark builder caches the
  // base at construction, so it must be rebuilt (pane scales derive their
  // base from the indicator's value span).
  setBase(b) {
    if (!(isFinite(b) && b > 0) || this._opts.base === b) return;
    this._opts.base = b;
    this._markBuilder = null;
  }
  formatLogical(logical) {
    if (this._formatter) return this._formatter.format(logical);
    return String(logical);
  }
  rebuildMarks() {
    if (!this._markBuilder) {
      const base = this._opts.base || 100;
      this._markBuilder = new PriceTickMarkBuilder(
        this, base,
        (c, v) => this.coordinateToLogical(c, v),
        (l, v) => this.logicalToCoordinate(l, v)
      );
    }
    this._markBuilder.rebuild();
  }
  marks() { return this._markBuilder ? this._markBuilder.marks() : []; }
}

/* ============================ MAIN CHART CLASS ============================= */
class TradingChart {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // v2.3.0+: Mobile optimization — cap DPR at 2 on mobile to avoid the
    // expensive 3x rendering (9x more pixels than 1x). On desktop, allow up to 3x.
    const rawDpr = window.devicePixelRatio || 1;
    // v2.14.0 FIX (audit #24): "mobile" was `maxTouchPoints > 1`, which
    // classifies EVERY touch laptop as mobile — those users lost the crosshair
    // (touch quirks applied) and got 30fps throttling on a machine with a
    // perfectly good mouse. The real signal is the PRIMARY pointer: only
    // coarse-only devices (phones/tablets) are mobile; anything with a fine
    // pointer (mouse) behaves as desktop.
    let isMobileDevice = false;
    try {
      const hasCoarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      const hasFine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
      isMobileDevice = hasCoarse && !hasFine;
      if (!window.matchMedia) {
        isMobileDevice = /Mobi|Android|iPhone/i.test(navigator.userAgent);
      }
    } catch (_) {
      isMobileDevice = /Mobi|Android|iPhone/i.test(navigator.userAgent);
    }
    this.dpr = Math.min(rawDpr, isMobileDevice ? 2 : 3);

    // v2.3.0+: Theme customization — merge user overrides into the global this.theme.
    // v2.5.0+: Theme is now PER-INSTANCE. Each chart gets its own copy of THEME
    // so multiple charts on the same page can have different colors without
    // interfering with each other. During render(), the global THEME is swapped
    // with this.theme so all drawing methods see the instance's colors.
    this.theme = Object.assign({}, THEME, opts.theme || {});

    // v2.14.0 FIX (audit #57): the 33ms mobile throttle capped EVERY touch
    // device at 30fps even though v2.11.0's render-on-demand already makes
    // the chart idle between interactions — the throttle only made drags
    // choppy. Removed; the loop now runs uncapped on all devices and still
    // costs zero CPU when idle.
    // v2.21.4: opts.renderThrottleMs lets the user re-introduce a cap on slow
    // devices. Default 0 = uncapped (60fps+). Set to 33 for a 30fps cap.
    this._isMobile = isMobileDevice;
    this._renderThrottleMs = (typeof opts.renderThrottleMs === 'number' && opts.renderThrottleMs >= 0)
      ? opts.renderThrottleMs : 0;
    this._lastRenderTime = 0;
    // v2.21.4: PERF INSTRUMENTATION — tracks per-frame render time.
    this.perf = {
      enabled: false, lastFrameMs: 0, avgFrameMs: 0, maxFrameMs: 0,
      frames: 0, _window: [], _maxWindow: 60
    };

    // v2.19.0 (2D): BAR REPLAY ENGINE — same feature set as the WebGL
    // edition (see chart-webgl.js for the full design notes).
    this.replay = {
      active: false,
      fullData: [],
      startTime: 0,
      playing: false,
      speed: 1,
      showBar: true,
      _timer: null,
      _stepStartMs: 0,
      _progress: 0,
      _warnedExternal: false
    };
    this._replayHits = [];
    this._replayHover = null;
    this.onReplayStart = null;
    this.onReplayStep = null;
    this.onReplayEnd = null;
    this.onReplayStop = null;

    // v2.4.0+: Momentum scrolling (inertia) — after the user releases the mouse/touch
    // after panning, the chart continues to move with decreasing speed, like
    // TradingView / Binance. Velocity is tracked in pixels/ms during drag, then
    // applied with friction in the render loop until it falls below threshold.
    this._momentum = null;          // { velocity: px/ms, lastTime: ms }
    this._panVelocity = 0;          // current tracked velocity during active drag
    this._lastPanX = 0;             // last X position during drag (for velocity calc)
    this._lastPanTime = 0;          // last timestamp during drag
    // v2.6.0: Gentler momentum — higher friction (stops sooner) + stronger
    // smoothing (instantaneous spikes weighted less) + max velocity cap.
    this._momentumFriction = 0.90;  // velocity × 0.90 per frame → stops in ~0.5s
    // v2.11.0: Render-on-demand + per-indicator offscreen cache (anti-jitter)
    this._lastActivity = performance.now();  // last interaction / data update
    this._needsRender = true;                // dirty flag — render only when set
    this._sceneVersion = 0;                  // bumped on theme/data/layout changes
    this._indCache2 = new Map();             // id -> {canvas, octx, stamp, ok} offscreen cache
    this._cacheHits = 0; this._cacheMisses = 0;  // debug counters
    this._momentumThreshold = 0.05; // px/ms — below this, momentum stops
    this._momentumMaxVelocity = 1.2; // px/ms cap so flicks never fly across the chart
    // v2.20.0: Momentum only fires on FAST flicks that STARTED NEAR a chart
    // edge — a small/slow drag in the middle of the chart now stops dead on
    // release instead of drifting a few extra bars (which made the chart feel
    // heavy even though it isn't). See _shouldStartMomentum().
    this._momentumFastVelocity = 0.45; // px/ms ≈ 450 px/s — real flick, not a nudge
    this._momentumEdgeRatio    = 0.20; // 20% of chart width from each side = edge zone
    // v2.12.0: Per-frame offscreen-rebuild budget — at most 2 indicators rebuild
    // their cached bitmap in a single frame. When many indicators all need a
    // rebuild at once (window resize, bulk data reset), the rest are deferred
    // to subsequent frames. Without this, a single rAF tick could spend 80ms
    // rebuilding 5+ heavy indicator layers and cause a visible hitch.
    this._frameId = 0;                       // monotonic frame counter
    this._frameRebuilds = 0;                 // rebuilds done in the current frame
    // v2.17.1: AREA-based rebuild budget. The old fixed count (2/frame) dates
    // from v2.12 when every offscreen bitmap was FULL-SCREEN sized. Since
    // v2.16 (#10) bitmaps are sized to the indicator's own REGION — a pane
    // bitmap is ~10× smaller than the screen — so with 7+ bottom indicators
    // the count budget made panes appear only 2-per-frame (progressive
    // popping) and blank panes lingered in on-demand render contexts. The
    // budget now measures BITMAP AREA: up to ~2 full-screen areas of new
    // pixels per frame (same anti-hitch intent), which rebuilds a dozen pane
    // indicators in ONE frame while still throttling heavy overlay bursts.
    this._frameRebuildArea = 0;              // bitmap pixels rebuilt this frame
    this._REBUILD_AREA_FACTOR = 2;           // full-screen areas allowed per frame
    this._MAX_FRAME_REBUILDS = 64;           // hard safety ceiling per frame
    // v2.15.0: the rebuild budget is bypassed not only during mouse drags but
    // for a short window after ANY fast interaction (wheel zoom, pinch,
    // momentum) — otherwise indicators 3+ kept showing stale bitmaps while
    // barSpacing changed every frame.
    this._interactUntil = 0;                 // performance.now() until which the budget is bypassed
    // v2.15.0: indicator computation batching — update()/append() queue ONE
    // compute per animation frame instead of recomputing O(N) on every tick.
    this._computeQueued = false;
    this._computeRaf = null;
    // v2.13.0: MULTI-PANE. Each pane-type indicator (RSI, MACD, ...) gets its
    // OWN small window below the price area — its own separator, scale, grid,
    // grab handle and mini price-axis labels — TradingView-style. _panes is
    // rebuilt by updateLayout() in iteration order of activeIndicators; each
    // entry is { id, top, bottom, height, userH, scale, sepHover }.
    // _paneHUsers maps paneId → user-set height (null = auto). Dragging a
    // separator resizes the pane BELOW it. Double-click resets that pane.
    this._panes = [];                        // ordered list of visible pane regions
    this._paneHUsers = {};                   // paneId → height (null/missing = auto)
    this._paneResize = null;                  // null | { paneId, startY, startH } while dragging
    this._paneSepHoverId = null;              // paneId whose separator is hovered (cursor + grip)
    // v2.18.0: drawOnMain — pane indicators can register callbacks that draw
    // on the MAIN chart layer (price area), using priceToY / indexToX of the
    // candle chart, NOT clipped to the pane. The library limitation was that
    // pane indicators only got helpers.paneToY (a pane-relative scale) and
    // their ctx was clipped to the pane rect — so a horizontal price level
    // drawn from inside an RSI render() was erased by the pane clip. Now an
    // indicator calls h.drawOnMain(function (mctx, mh) { ... }) and the
    // callback is replayed after drawPane(), against the LIVE main ctx with
    // the price-area clip (NOT the pane clip). Callbacks are cached per
    // indicator state so cache-HIT frames (no render() call) still replay
    // them — only a cache REBUILD replaces the set.
    this._pendingMainDraws = [];              // per-frame queue of {fn} to replay
    this._currentRenderState = null;          // state of the indicator whose render() is now running
    // v2.13.0: COUNTDOWN — a 2-digit number that floats just to the right of
    // the forming candle, at the close-price Y level, with no border/card.
    // Counts down based on the timeframe: minutes for H1+, seconds for sub-
    // hourly, hours for D1+. Loop wakes up every second while enabled.
    this._countdown = {
      enabled: false,
      format: 'auto',                         // 'auto' | 'mm' | 'ss' | 'hh'
      color: null,                            // null = theme.textDim
      fontSize: 11,
      offsetX: 6,                             // px to the right of the candle body
      offsetY: 0                              // px below the close price (positive = down)
    };
    this._countdownTimer = null;              // setInterval id (1s wakeup)
    if (opts && opts.countdown) {
      const cd = opts.countdown;
      if (cd === true) this._countdown.enabled = true;
      else if (typeof cd === 'object') {
        this._countdown.enabled = cd.enabled !== false;
        if (cd.format) this._countdown.format = cd.format;
        if (cd.color) this._countdown.color = cd.color;
        if (cd.fontSize) this._countdown.fontSize = cd.fontSize;
        if (cd.offsetX != null) this._countdown.offsetX = cd.offsetX;
        if (cd.offsetY != null) this._countdown.offsetY = cd.offsetY;
      }
    }

    // Layout — HEADLESS MODE (v2.0.0+)
    // The built-in toolbar has been REMOVED entirely. The library is now fully
    // headless: tool/indicator/view actions are controlled programmatically via
    // the public API (setTool, addIndicator, resetView, etc.). Build your own
    // UI in HTML/CSS and wire it to the chart through these methods.
    // The optional status bar defaults to OFF for clean embedding.
    this._showToolbar = false;                    // always false (toolbar removed)
    this._showStatusBar = opts.statusBar === true; // default: false
    this._toolChangeCallbacks = [];
    this.layout = {
      toolbarH: 0,                                 // HEADLESS: no toolbar
      statusH: this._showStatusBar ? 26 : 0,
      priceAxisW: 64,
      timeAxisH: 28,
      volumeH: 64,
      paneH: 0,
      gap: 8,
      leftPad: 0
    };

    // User-provided state (no fake data)
    this.symbol = opts.symbol || {label: 'SYMBOL', priceScale: 100, decimals: 2};
    this.timeframe = opts.timeframe || {label: '1H', ms: 60 * 60 * 1000};
    this.sim = new DataLayer();
    this.sim.setTimeframeMs(this.timeframe.ms);
    // v2.15.0: weekly/monthly data must NOT be snapped (see setTimeframe).
    this.sim.snapTime = (opts && opts.snapTime != null) ? !!opts.snapTime :
      this.timeframe.ms < 7 * 24 * 3600 * 1000;
    this._autoTick = false; // disabled by default; user controls updates

    // v2.16.0 (#8): timezone + locale for DISPLAY only. Data stays in Unix
    // seconds; tick marks, the crosshair time label and the countdown all
    // render in the configured timezone/locale when set. Default = UTC +
    // English short month names (matches v2.15.0 exactly).
    //   new BadiCharts(canvas, { timezone: 'Asia/Riyadh', locale: 'ar-SA',
    //                            hour12: false });
    this._timezone = (opts && typeof opts.timezone === 'string' && opts.timezone) || null;
    this._locale = (opts && typeof opts.locale === 'string' && opts.locale) || null;
    this._hour12 = (opts && opts.hour12 != null) ? !!opts.hour12 : null;
    // v2.16.0 (#17): the late-tick match window in update() (default 300) is
    // now configurable. Set lateUpdateWindow: 0 to disable in-place matching
    // entirely (every tick is appended; stale ticks are dropped).
    this._lateUpdateWindow = (opts && isFinite(opts.lateUpdateWindow)) ? Math.max(0, Math.floor(opts.lateUpdateWindow)) : 300;

    // Background: image or video URL (drawn behind the chart)
    this._bgImage = null;   // HTMLImageElement
    this._bgVideo = null;   // HTMLVideoElement
    this._bgOpacity = opts.backgroundOpacity !== undefined ? opts.backgroundOpacity : 0.15;
    if (opts.background) this.setBackground(opts.background);

    // Viewport — barSpacing in media coords (CSS pixels)
    this.barSpacing = 8;       // LWC default ~6, we use 8 for cleaner initial view
    this.minBarSpacing = 1.4;  // LWC default minimum
    this.maxBarSpacing = 80;   // reasonable max — prevents over-sized candles
    this.rightOffset = 4;      // bars of empty space on the right (LWC default ~4-5)

    // Price scales
    // v2.15.0 FIX: base = 10^decimals with minMove = 1 (the v2.14.0-era code
    // formatted with PriceFormatter(priceScale, decimals) — decimals misused
    // as minMove rounded prices to 0.02 steps / NaN). See _symbolBase().
    const _pBase = this._symbolBase();
    this.priceScale = new PriceScale({
      scaleMargins: {top: 0.15, bottom: 0.15},
      base: _pBase
    });
    this.priceScale.setFormatter(new PriceFormatter(_pBase, 1));

    this.volScale = new PriceScale({
      scaleMargins: {top: 0.0, bottom: 0.0},
      base: 100
    });

    this.paneScale = null;     // v2.13.0: legacy — points to _panes[0].scale. Per-pane scales live in _panes[].scale.

    // v2.14.0: data version — bumped on every setData/update/append/setSymbol/
    // setTimeframe. Included in the indicator stamp so the offscreen cache
    // rebuilds exactly when DATA changes (previously computeIndicators()
    // bumped the scene version on every tick, invalidating ALL indicator
    // caches on every single update() — a hidden 60fps rebuild storm).
    this._dataVersion = 0;
    // v2.16.0 (#11): separate "content" version — only bumps when DATA is
    // appended or replaced (not when the forming candle is updated in place).
    // The indicator stamp uses this so a stable tick stream with the SAME
    // last bar doesn't rebuild every indicator every frame.
    this._contentVersion = 0;
    this._lastDataLen = 0;

    // Crosshair
    this.mouseX = null;
    this.mouseY = null;
    this.mouseInside = false;
    this.crosshairIndex = null;

    // Dragging
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartRightOffset = 0;
    this.dragStartLogicalFrom = 0;

    // Drawing
    this.activeTool = 'cursor';
    this.drawings = [];
    this.currentDrawing = null;
    this.hoverDrawing = null;
    this.selectedDrawing = null;  // currently selected drawing (shows properties panel)
    this._customTools = {};       // custom drawing tool renderers (per-instance)
    this._instanceTools = [];     // v2.5.0+: per-instance tool metadata (don't pollute global DRAW_TOOLS)
    this._drawPanelHits = [];     // hit-test for drawing properties panel

    // v2.7.0: Candle markers (arrows/icons drawn above/below candles)
    this.markers = [];
    // v2.7.0: Drawing drag state (handle drag + whole-drawing drag)
    this._dragHandle = null;      // { d, key, ptIndex? } while dragging a handle
    this._dragWhole = null;       // { d, startIdx, startPrice, snapshot } while moving a drawing

    // v2.10.0: Two-step drawing state machine ("click → move → click to place")
    // A drawing tool now understands BOTH gestures:
    //   1) press → drag → release  (classic, finalizes on release)
    //   2) click (anchor) → move mouse (live preview follows) → 2nd click (places it)
    // The chart can never get stuck: mouseup is tracked on the window, Esc /
    // right-click / switching tools always cancels the pending preview.
    this._mouseDown = false;      // left button currently held on canvas
    this._drawAnchor = null;      // { x, y } where the current press started
    this._drawMoved = false;      // pointer moved >4px since the press (real drag)
    this._lastHint = 0;           // throttle for "how to draw" hint toasts
    this._lastPolyTap = 0;        // touch: last tap time for polygon double-tap finish

    // Indicators — HEADLESS v2.1.0+: no built-in indicators, no default 'volume'.
    // User registers custom indicators via addIndicator(definition), or by
    // passing definition objects in opts.indicators.
    this._customIndicators = new Map();              // id -> definition
    this.indicatorStates = new Map();                // id -> state
    this.indCache = {};                              // id -> calculated values
    this.activeIndicators = new Set();
    // Process opts.indicators — each item must be a definition object.
    // (String ids are no longer supported since there are no built-in ids.)
    if (Array.isArray(opts.indicators)) {
      for (const item of opts.indicators) {
        if (item && typeof item === 'object' && item.id) {
          // Register + activate
          this._customIndicators.set(item.id, item);
          this.activeIndicators.add(item.id);
          this.indicatorStates.set(item.id, this._defaultIndicatorState(item.id));
        }
      }
    }
    // Active indicator card (which card's icons are currently shown expanded)
    this.activeIndicatorCard = null;
    // Whether the indicator legend list is collapsed (hidden) — toggled by the arrow
    this.indicatorsCollapsed = false;
    // Settings card popup state
    this.settingsCard = null; // {id, x, y, w, h, fields, onSave}
    // Icon hit-test registry (rebuilt each frame in drawLegend)
    this._iconHits = [];

    // UI
    this.buttons = [];
    this.hoverButton = null;
    this.dropdown = null;
    this.toast = null;

    // Animation
    this.tickInterval = 1000;
    this.lastTickAt = 0;

    // v2.15.0 FIX: W/H stayed undefined when the canvas was hidden
    // (display:none) at construction — updateLayout produced NaN everywhere
    // until the first ResizeObserver callback. Sane fallbacks (canvas bitmap
    // size when set, else 800×450) keep the layout valid immediately; the
    // first real resize replaces them.
    this.W = this.canvas.width > 1 ? Math.min(2000, this.canvas.width) : 800;
    this.H = this.canvas.height > 1 ? Math.min(2000, this.canvas.height) : 450;

    // v2.15.0 FIX: _listeners must exist BEFORE setupHiDPICanvas() registers
    // the window resize listener — previously that listener was stored in a
    // separate field and destroy() never removed it (a destroyed chart kept
    // re-resizing itself on every window resize).
    this._listeners = [];   // [target, type, fn, options]
    this._fieldEditor = null;                  // v2.15.0: inline DOM editor for settings fields

    this.setupHiDPICanvas();
    this.setupEvents();
    this.updateLayout();
    this.computeIndicators();
    this.autoScale();
    // v2.13.0: if countdown was enabled in opts, start its 1s wakeup interval.
    this._syncCountdownTimer();
  }

  /* ============================ PUBLIC API ================================ */
  // Set the full candle dataset. Replaces all existing data.
  // candles: array of {time (unix sec), open, high, low, close, volume}
  // v2.14.0: pass {keepView:true} as the 2nd argument to preserve the current
  // zoom/pan position instead of resetting to the default view — useful for
  // "refresh" flows where the user's viewport should not jump.
  setData(candles, opts) {
    // v2.19.0: a full data replace exits replay mode first.
    if (this.replay && this.replay.active) this._replayStopInternal(false);
    this.sim.setData(candles);
    this._dataVersion++;                       // v2.14.0: stamp invalidation
    this._contentVersion++;                    // v2.16.0 (#11): full replace → all indicator outputs change
    // v2.15.0 FIX: _lastDataLen was never reset here (nor in setSymbol /
    // setTimeframe) — the first update() after a symbol change computed
    // appended = newLen - staleOldLen and made the viewport jump violently.
    this._lastDataLen = this.sim.candles.length;
    // v2.16.0 (#17): reset the late-tick drop counter on a full reload.
    this._droppedLateTicks = 0;
    this.computeIndicators();
    if (opts && opts.keepView) {
      this.constrainRightOffset();
      this.autoScale();
    } else {
      this.resetView();
    }
    this.invalidate();
  }
  // Append or update a single candle (real-time tick).
  // v2.14.0 FIX (audit #20): a LATE update to a PREVIOUS candle (the classic
  // "candle closed" WebSocket message that arrives after the new candle
  // already opened) matches the incoming time against the LAST 300 candles
  // and replaces it in place; only a genuinely new time is appended.
  // v2.15.0 FIX (CRITICAL regression): the in-place branch stored the RAW
  // candle object — it skipped _norm() entirely, so Binance's STRING prices
  // ('123.45') were drawn as NaN, high/low were never corrected against
  // open/close, NaN slipped through, and the chart kept a LIVE REFERENCE to
  // the caller's object (mutating it mutated the chart's history). Every
  // input is normalized through sim._norm() again; the stored object is
  // always a private clone.
  update(candle) {
    // v2.19.0: external ticks are BLOCKED during replay (replay owns the data).
    if (this.replay && this.replay.active) {
      if (!this.replay._warnedExternal) {
        this.replay._warnedExternal = true;
        if (typeof console !== 'undefined') {
          console.warn('[BadiCharts] update() ignored — replay mode is active. Call stopReplay() to resume live updates.');
        }
      }
      return this;
    }
    const c = this.sim._norm(candle);
    if (!c) return this;                       // invalid input — ignore (was: stored raw)
    const cs = this.sim.candles;
    let matched = false;
    // v2.16.0 (#17): the late-tick match window is now configurable via
    // opts.lateUpdateWindow (default 300). Set to 0 to disable in-place
    // matching entirely.
    const win = this._lateUpdateWindow;
    if (win > 0) {
      for (let i = cs.length - 1, k = 0; i >= 0 && k < win; i--, k++) {
        if (cs[i].time === c.time) { cs[i] = c; matched = true; break; }
      }
    }
    if (!matched) {
      const last = cs[cs.length - 1];
      if (last && c.time < last.time) {
        // v2.16.0 (#17): a stale tick older than the match window is now
        // counted (one warning per session) instead of silently dropped.
        this._droppedLateTicks = (this._droppedLateTicks || 0) + 1;
        if (this._droppedLateTicks === 1 && typeof console !== 'undefined') {
          console.warn('[BadiCharts] Late tick dropped (older than the ' + win +
            '-bar update window). Increase opts.lateUpdateWindow if your feed lags.');
        }
        return this;
      }
      cs.push(c);
      if (cs.length > 51000) cs.splice(0, cs.length - 50000);   // batched trim (see DataLayer.update)
      // v2.16.0 (#11): a NEW candle was appended → the indicator OUTPUT shape
      // changed (one more entry in every array). Bump _contentVersion so the
      // offscreen bitmaps rebuild. (An in-place update of the forming candle
      // does NOT bump _contentVersion; the stamp's last OHLC field catches it
      // and the indicator can decide whether its visible range changed.)
      this._contentVersion++;
    }
    this._dataVersion++;
    // v2.14.0 FIX (audit #40) + v2.15.0 SIGN FIX: when the user is browsing
    // history, appending a candle must NOT scroll the view one bar.
    // indexToX() is anchored to the LAST candle, so compensating with
    // rightOffset -= appended keeps the visible candles pixel-stationary.
    // The v2.14.0 condition was backwards (rightOffset > 12 = AT the live
    // edge with future space) and the sign was wrong (+= scrolled history
    // FORWARD by 2 bars per append). "Browsing history" = the last candle is
    // off-screen to the right = rightOffset < 0.
    const appended = cs.length - (this._lastDataLen || cs.length);
    if (appended > 0 && this.rightOffset < 0) this.rightOffset -= appended;
    this._lastDataLen = cs.length;
    this.invalidateTimeMarks();                // future marks shift with the new candle
    this._scheduleCompute();                   // v2.15.0: batched O(N) indicator compute (once per frame)
    this.autoScale();
    this.invalidate();
    return this;
  }
  // Append multiple candles
  append(candles) {
    if (!Array.isArray(candles)) return this;
    // v2.19.0: blocked during replay (same guard as update()).
    if (this.replay && this.replay.active) {
      if (!this.replay._warnedExternal) {
        this.replay._warnedExternal = true;
        if (typeof console !== 'undefined') {
          console.warn('[BadiCharts] append() ignored — replay mode is active. Call stopReplay() to resume live updates.');
        }
      }
      return this;
    }
    const before = this.sim.candles.length;
    this.sim.append(candles);
    const appended = this.sim.candles.length - before;
    this._dataVersion++;
    if (appended > 0) this._contentVersion++;   // v2.16.0 (#11): new bar(s) → rebuild indicator bitmaps
    if (appended > 0 && this.rightOffset < 0) this.rightOffset -= appended;  // v2.15.0: pin history view (sign fixed)
    this._lastDataLen = this.sim.candles.length;
    this.invalidateTimeMarks();
    this._scheduleCompute();                   // v2.15.0: batched indicator compute
    this.autoScale();
    this.invalidate();
    return this;
  }
  // Set symbol config (label, priceScale, decimals)
  // v2.5.0+: Clears all stored candle data — the user must call setData()
  // with the new symbol's data after switching. Prevents mixing old + new data.
  // v2.14.0 FIX (audit #18): also clears markers + all interaction state —
  // previously a selected/hovered drawing or pending preview from the old
  // symbol survived the switch and pointed at stale data.
  // v2.15.0: the price-scale BASE must be 10^decimals (LWC contract:
  // base = 10^fractionalDigits, minMove = 1). v2.14.0 passed `decimals`
  // AS minMove → decimals=2 rounded every price to multiples of 0.02 and
  // decimals=0 produced Infinity/NaN in the formatter. A legacy priceScale
  // that is not of the form 2^a·5^b (e.g. 3, 7, 12.5) used to throw
  // 'unexpected base' from PriceTickSpanCalculator INSIDE the render frame —
  // it is now snapped to the nearest power of 10.
  _symbolBase() {
    const dec = (this.symbol.decimals != null && isFinite(+this.symbol.decimals)) ?
      clamp(Math.floor(+this.symbol.decimals), 0, 12) : null;
    if (dec != null) return Math.pow(10, dec);
    const ps = +this.symbol.priceScale;
    if (!(isFinite(ps) && ps > 0)) return 100;
    // Validate 2^a·5^b; snap to the nearest power of 10 when invalid.
    let n = Math.round(ps);
    if (Math.abs(ps - n) < 1e-9 && n > 0) {
      for (const p of [2, 5]) { while (n % p === 0) n /= p; }
      if (n === 1) return Math.round(ps);
    }
    const snapped = Math.pow(10, Math.round(Math.log10(ps)));
    if (BADI_DEBUG) console.warn('[BadiCharts] symbol.priceScale ' + ps +
      ' is not of the form 2^a*5^b — snapping to ' + snapped);
    return snapped;
  }
  setSymbol(sym) {
    this.sim.clear();
    this.symbol = Object.assign({}, this.symbol, sym);
    // v2.15.0 FIX: base = 10^decimals with minMove = 1 (was
    // PriceFormatter(priceScale, decimals) — decimals misused as minMove).
    const base = this._symbolBase();
    this.priceScale = new PriceScale({scaleMargins:{top:0.15,bottom:0.15}, base: base});
    this.priceScale.setFormatter(new PriceFormatter(base, 1));
    this.priceScale.setHeight(this.priceBottom - this.priceTop);
    this.drawings = [];
    this.markers = [];
    this.selectedDrawing = null;
    this.hoverDrawing = null;
    this.currentDrawing = null;
    this._drawAnchor = null;
    this.deselectDrawing();
    this._dataVersion++;
    this._contentVersion++;                  // v2.16.0 (#11): full clear → rebuild
    this._lastDataLen = 0;                     // v2.15.0: fresh dataset → no phantom append
    this._droppedLateTicks = 0;                // v2.16.0 (#17)
    this.computeIndicators();
    this.resetView();
    this.invalidate();
  }
  // Set timeframe {label, ms}
  // v2.5.0+: Clears all stored candle data — the user must call setData()
  // with the new timeframe's data after switching.
  // v2.14.0 FIX (audit #18): clears markers + interaction state too.
  setTimeframe(tf) {
    this.sim.clear();
    this.timeframe = {
      label: (tf && tf.label) || '1M',
      // v2.14.0 FIX (audit #67): an invalid tf.ms produced NaN in every time
      // label. Validate and fall back to 60s.
      ms: (tf && isFinite(tf.ms) && tf.ms > 0) ? tf.ms : 60000
    };
    this.sim.setTimeframeMs(this.timeframe.ms);
    // v2.15.0: skip time snapping for weekly+ timeframes — weekly candles
    // arrive Monday-aligned (floor-to-epoch-week moved them to Thursday) and
    // monthly candles have irregular boundaries (a fixed ms "month" merged
    // two real months into one Map key and DROPPED candles). Intraday keeps
    // snapping. Override with {snapTime: true/false} if needed.
    this.sim.snapTime = (tf && tf.snapTime != null) ? !!tf.snapTime :
      this.timeframe.ms < 7 * 24 * 3600 * 1000;
    this.drawings = [];
    this.markers = [];
    this.selectedDrawing = null;
    this.hoverDrawing = null;
    this.currentDrawing = null;
    this._drawAnchor = null;
    this.deselectDrawing();
    this._dataVersion++;
    this._contentVersion++;                  // v2.16.0 (#11): full clear → rebuild
    this._lastDataLen = 0;                     // v2.15.0: fresh dataset → no phantom append
    this._droppedLateTicks = 0;                // v2.16.0 (#17)
    this.computeIndicators();
    this.resetView();
    this.invalidate();
  }
  // Default state for an indicator (visible, default settings, default icons)
  _defaultIndicatorState(id) {
    const def = this._customIndicators.get(id) || {};
    return {
      visible: true,
      settings: Object.assign({}, def.settings || {}),
      // Default 4 icons (TradingView-style): hide/show, edit, settings, delete
      icons: ['hide', 'edit', 'settings', 'delete'],
      // Custom icons added by user (array of {id, label, icon, onClick})
      customIcons: [],
      // Callbacks
      onSettings: null,  // function(settings) — called when settings change
      onEdit: null,      // function() — called when edit/code button clicked
      def: def           // reference to the indicator definition (v2.1.0+)
    };
  }
  // Add a custom indicator. Accepts either a definition object (recommended):
  //   chart.addIndicator({ id:'mySMA', label:'My SMA', type:'overlay',
  //                       color:'#2962ff', settings:{period:20},
  //                       calculate: function(candles, s) {...},
  //                       render:    function(ctx, values, helpers, s, state) {...} });
  // or a previously-registered id (rare; only useful if you registered a
  // definition separately and later want to re-activate it):
  //   chart.addIndicator('mySMA');
  // config (2nd arg, optional): { settings, icons, customIcons, onSettings, onEdit }
  addIndicator(idOrDef, config) {
    config = config || {};
    let id, def;
    this._indCache2.delete(idOrDef && idOrDef.id ? idOrDef.id : idOrDef);  // v2.11.0
    if (typeof idOrDef === 'string') {
      id = idOrDef;
      def = this._customIndicators.get(id);
      if (!def) {
        // v2.16.0: this warning is ALWAYS shown now (was BADI_DEBUG-only).
        // A Studio toggling indicators by id string with a typo'd/unregistered
        // id got a SILENT no-op — the indicator "doesn't work" with zero
        // feedback, which looks exactly like the "one pane indicator kills
        // the other" report. Make the cause visible.
        console.warn('[BadiCharts] addIndicator("' + id + '"): no definition registered ' +
          'with this id on THIS chart instance. Register it first via ' +
          'chart.registerIndicator(def) or pass the definition object directly. ' +
          'Registered ids: [' + Array.from(this._customIndicators.keys()).join(', ') + ']');
        return;
      }
    } else if (idOrDef && typeof idOrDef === 'object' && idOrDef.id) {
      def = idOrDef;
      id = def.id;
      // v2.16.0: warn when an ALREADY-ACTIVE id is re-added — the new state
      // silently replaces the old one, so "enabling indicator B" can look
      // like "indicator A stopped working" when both share the same id
      // (a copy-paste id collision in the host app).
      if (this.activeIndicators.has(id)) {
        console.warn('[BadiCharts] addIndicator("' + id + '"): this id is ALREADY active — ' +
          'the previous state/settings were replaced. If two different indicators ' +
          'should coexist, they need DIFFERENT ids.');
      }
      this._customIndicators.set(id, def);
    } else {
      console.warn('[BadiCharts] addIndicator: expected a definition object {id, label, type, calculate, render} or a registered id string');
      return;
    }
    // v2.16.0: validate def.type. A missing/misspelled type ('Pane', 'panes',
    // undefined…) renders NOWHERE: updateLayout only reserves windows for
    // exactly 'pane', drawIndicators only takes exactly 'overlay', drawVolume
    // only exactly 'volume'. The indicator then looks "broken" with no
    // feedback. Normalize to a safe default + warn.
    const VALID_TYPES = ['overlay', 'pane', 'volume'];
    if (VALID_TYPES.indexOf(def.type) === -1) {
      console.warn('[BadiCharts] addIndicator("' + id + '"): def.type "' + def.type +
        '" is not one of overlay|pane|volume — falling back to "overlay". ' +
        'Bottom-pane indicators MUST use type: "pane".');
      def.type = 'overlay';
    }
    this.activeIndicators.add(id);
    const state = this._defaultIndicatorState(id);
    if (config.settings) state.settings = Object.assign({}, state.settings, config.settings);
    if (config.icons) state.icons = config.icons.slice();
    if (config.customIcons) state.customIcons = config.customIcons.slice();
    if (config.onSettings) state.onSettings = config.onSettings;
    if (config.onEdit) state.onEdit = config.onEdit;
    this.indicatorStates.set(id, state);
    this.updateLayout();
    this.computeIndicators();
    this.autoScale();
    this.invalidate();   // v2.16.0: explicit repaint (addIndicator relied on autoScale's side-effect invalidate before)
  }
  // Register a custom indicator definition WITHOUT activating it.
  // Useful for defining indicators once and toggling them by id later.
  registerIndicator(def) {
    if (!def || !def.id) return;
    this._customIndicators.set(def.id, def);
  }
  // Get the definition of a registered indicator (or null).
  getIndicatorDef(id) {
    return this._customIndicators.get(id) || null;
  }
  // Remove an indicator by id
  removeIndicator(id) {
    this.activeIndicators.delete(id);
    this.indicatorStates.delete(id);
    this._indCache2.delete(id);   // v2.11.0: drop offscreen cache
    if (this.activeIndicatorCard === id) this.activeIndicatorCard = null;
    if (this.settingsCard && this.settingsCard.id === id) this.settingsCard = null;
    this.updateLayout();
    this.computeIndicators();
    this.autoScale();
  }
  // Toggle indicator visibility
  setIndicatorVisible(id, visible) {
    const s = this.indicatorStates.get(id);
    if (s) {
      s.visible = visible;
      // v2.9.0: pane indicators live in a dedicated section — reserve/free it
      if (s.def && s.def.type === 'pane') {
        this.updateLayout();
        this.autoScale();
      }
      this._invalidateScene();   // v2.11.0: repaint now that rendering is on-demand
    }
  }
  isIndicatorVisible(id) {
    const s = this.indicatorStates.get(id);
    return s ? s.visible : true;
  }
  // Update indicator settings (calls onSettings callback if set)
  setIndicatorSettings(id, settings) {
    const s = this.indicatorStates.get(id);
    if (s) {
      s.settings = Object.assign({}, s.settings, settings);
      this.computeIndicators();
      this.autoScale();
      if (s.onSettings) s.onSettings(s.settings);
    }
  }
  // Get indicator settings
  getIndicatorSettings(id) {
    const s = this.indicatorStates.get(id);
    return s ? Object.assign({}, s.settings) : {};
  }
  // Add a custom icon to an indicator
  // icon: {id, label, icon (string/emoji), onClick (function)}
  addIndicatorIcon(id, icon) {
    const s = this.indicatorStates.get(id);
    if (s && icon && icon.id) {
      // Replace if exists, else add
      const idx = s.customIcons.findIndex(c => c.id === icon.id);
      if (idx >= 0) s.customIcons[idx] = icon;
      else s.customIcons.push(icon);
    }
  }
  // Open the settings card programmatically for an indicator
  openIndicatorSettings(id) {
    const s = this.indicatorStates.get(id);
    if (!s) return;
    this._openSettingsCard(id, s);
  }
  // Open the code editor callback for an indicator
  openIndicatorEditor(id) {
    const s = this.indicatorStates.get(id);
    if (s && s.onEdit) s.onEdit();
    else this.showToast('No editor for ' + id);
  }
  // Add a drawing programmatically
  addDrawing(drawing) {
    drawing.id = drawing.id || Date.now();
    drawing.color = drawing.color || this.theme.drawing;
    drawing.lineWidth = drawing.lineWidth || 1.5;
    drawing.locked = false;
    // v2.16.0 (#19): stamp anchor times if missing so the drawing follows its
    // candle(s) after future 50k trims. Caller can override t1/t2/tIdx/tPoints
    // explicitly (e.g. drawings restored from storage with their own times).
    this._stampDrawingTimes(drawing);
    this.drawings.push(drawing);
    this.invalidate();   // v2.15.0: the chart was previously not repainted
  }
  // Clear all drawings
  // v2.15.0 FIX: clearDrawings() used to leave the stale drawing on screen
  // until the next unrelated interaction (no repaint was scheduled).
  clearDrawings() {
    this.drawings = [];
    this.selectedDrawing = null;
    this.hoverDrawing = null;
    this.currentDrawing = null;
    this._drawAnchor = null;
    this.invalidate();
  }
  // Set the active drawing tool by id.
  // Accepts built-in tool ids (see getTools()) or any custom tool registered
  // via addDrawingTool(). Calling setTool() fires onToolChange callbacks.
  setTool(toolId) {
    const known = DRAW_TOOLS.find(function (t) { return t.id === toolId; })
      || (this._customTools && this._customTools[toolId]);
    if (!known) {
      if (BADI_DEBUG) console.warn('[BadiCharts] Unknown tool:', toolId);
      return;
    }
    this.activeTool = toolId;
    // v2.10.0: switching (or re-picking) a tool always discards any un-placed
    // preview drawing so the chart can never be left with a stuck overlay.
    this.currentDrawing = null;
    this._drawAnchor = null;
    for (let i = 0; i < this._toolChangeCallbacks.length; i++) {
      try { this._toolChangeCallbacks[i](toolId); } catch (e) { if (BADI_DEBUG) console.error(e); }
    }
  }
  // Get the currently active drawing tool id.
  getActiveTool() { return this.activeTool; }
  // Reset the active tool to the default 'cursor' (no drawing).
  clearTool() { this.setTool('cursor'); }
  // List all available drawing tools (built-in + custom registered on THIS instance).
  // v2.5.0+: Custom tools are per-instance — only tools registered via this
  // chart's addDrawingTool() appear here. Built-in tools are shared.
  getTools() {
    const builtin = DRAW_TOOLS.map(function (t) {
      return {
        id: t.id,
        label: t.label,
        icon: TOOL_SHORTCUTS[t.id] || '◆',
        custom: false
      };
    });
    const custom = (this._instanceTools || []).map(function (t) {
      return {
        id: t.id,
        label: t.label,
        icon: t.icon || '◆',
        custom: true
      };
    });
    return builtin.concat(custom);
  }
  // Subscribe to active tool changes. Returns an unsubscribe function.
  //   chart.onToolChange(function (toolId) { console.log('Tool:', toolId); });
  onToolChange(cb) {
    if (typeof cb !== 'function') return function () {};
    this._toolChangeCallbacks.push(cb);
    const subs = this._toolChangeCallbacks;
    return function () {
      const i = subs.indexOf(cb);
      if (i >= 0) subs.splice(i, 1);
    };
  }
  // Get a snapshot of all drawings on the chart (each drawing object).
  getDrawings() { return this.drawings.slice(); }
  // Get a specific drawing by id (or null if not found).
  getDrawing(id) {
    for (let i = 0; i < this.drawings.length; i++) {
      if (this.drawings[i].id === id) return this.drawings[i];
    }
    return null;
  }
  // Remove a specific drawing by id. Returns the removed drawing or null.
  removeDrawing(id) {
    for (let i = 0; i < this.drawings.length; i++) {
      if (this.drawings[i].id === id) {
        const removed = this.drawings.splice(i, 1)[0];
        if (this.selectedDrawing === removed) this.selectedDrawing = null;
        if (this.hoverDrawing === removed) this.hoverDrawing = null;
        this.invalidate();   // v2.15.0: repaint
        return removed;
      }
    }
    return null;
  }
  // Get the currently selected drawing (clicked by the user), or null.
  getSelectedDrawing() { return this.selectedDrawing; }
  // Programmatically select a drawing by id.
  // v2.15.0 FIX: selectDrawingById() never scheduled a repaint — the
  // selection handles appeared only after the next mouse move.
  selectDrawingById(id) {
    this.selectedDrawing = this.getDrawing(id);
    this.invalidate();
  }
  // List all available indicators with their active state.
  // Returns: [ { id, label, type, color, active } ]
  getIndicators() {
    const self = this;
    const out = [];
    this._customIndicators.forEach(function (def, id) {
      out.push({
        id: id,
        label: def.label || id,
        // v2.14.0 FIX: default a missing type to 'overlay' here too, so
        // getIndicators() matches what addIndicator() actually renders
        // (previously an untyped indicator was drawn as overlay but
        // reported as undefined here).
        type: def.type || 'overlay',
        // v2.14.0 FIX: was `this.theme.ma1` inside a plain function — `this`
        // was undefined there, crashing getIndicators() whenever an indicator
        // had no explicit color.
        color: def.color || self.theme.ma1,
        active: self.activeIndicators.has(id)
      });
    });
    return out;
  }
  // Get the array of currently active indicator ids.
  getActiveIndicators() { return Array.from(this.activeIndicators); }

  // ─── Theme customization (v2.3.0+, per-instance v2.5.0+) ────────────────
  // Override theme colors on THIS instance only (not global).
  //   chart.setTheme({ bull: '#00ff00', bear: '#ff0000', bg: '#ffffff' });
  setTheme(overrides) {
    if (overrides && typeof overrides === 'object') {
      Object.assign(this.theme, overrides);
      this._invalidateScene(); // v2.11.0: theme colors are baked into cached indicators
    }
  }
  // Get a copy of THIS instance's theme.
  getTheme() {
    return Object.assign({}, this.theme);
  }

  // ─── Background image / video ─────────────────────────────────────────────
  // url: string (image URL or video URL), or null to clear
  setBackground(url) {
    // v2.16.0 (#15): explicitly tear down any existing video before clearing
    // the references (otherwise the playing <video> leaks through the closure).
    this._teardownBgVideo();
    this._bgImage = null;
    this._bgVideo = null;
    if (!url) return;
    // Detect video by extension
    const lower = url.toLowerCase();
    const isVideo = lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.ogg') || lower.endsWith('.mov');
    if (isVideo) {
      // v2.16.0 FIX (#15): tear down the previous video FIRST. The old code
      // just overwrote this._bgVideo, leaving the previous <video> element
      // playing in a detached closure with its timeupdate listener firing
      // forever (a real leak on every setBackground() call). _teardownBgVideo
      // pauses, removes the listener, and src-clears the element.
      this._teardownBgVideo();
      const v = document.createElement('video');
      v.src = url;
      v.loop = true;
      v.muted = true;
      v.autoplay = true;
      v.playsInline = true;
      v.play().catch(function () {});
      // v2.14.0: repaint while the video is actually playing (the render-on-
      // demand loop previously never noticed background videos moving).
      // v2.16.0 (#15): store the listener so destroy() can remove it (was
      // anonymous, leaked across the chart's lifetime).
      const self = this;
      const onTimeUpdate = function () { self.invalidate(); };
      v.addEventListener('timeupdate', onTimeUpdate);
      this._bgVideoListener = onTimeUpdate;
      this._bgVideo = v;
    } else {
      const img = new Image();
      // v2.14.0 FIX: crossOrigin='anonymous' was forced on EVERY image,
      // which makes the browser REJECT images served without CORS headers.
      // Only set it when the caller opts in via data-crossorigin.
      if (typeof url === 'string' && url.includes('crossorigin=anonymous')) img.crossOrigin = 'anonymous';
      // v2.14.0: report load errors instead of failing silently.
      // v2.15.0 FIX: repaint once the image HAS loaded — with render-on-
      // demand nothing else triggers a frame, so a background image used to
      // appear only after the next interaction.
      const self = this;
      img.onload = function () { self.invalidate(); };
      img.onerror = function () { console.warn('[BadiCharts] Background image failed to load:', url); };
      img.src = url;
      this._bgImage = img;
    }
    this.invalidate();   // v2.14.0: repaint with the new background
  }
  setBackgroundOpacity(opacity) {
    this._bgOpacity = clamp(opacity, 0, 1);
    this.invalidate();   // v2.14.0
  }
  // v2.16.0 (#15): pause + clean up the background video element so the
  // closure doesn't keep it alive (and playing) after destroy() or after a
  // setBackground(null) / setBackground(otherUrl) call. Safe to call when no
  // video is set.
  _teardownBgVideo() {
    const v = this._bgVideo;
    if (!v) return;
    try {
      if (this._bgVideoListener) {
        v.removeEventListener('timeupdate', this._bgVideoListener);
        this._bgVideoListener = null;
      }
      v.pause();
    } catch (_) {}
    try { v.removeAttribute('src'); v.load(); } catch (_) {}   // release the network stream
    this._bgVideo = null;
  }

  // ─── Candle markers (v2.7.0, hardened v2.8.0) ─────────────────────────
  // Add an icon/arrow marker on a candle:
  //   chart.addMarker({
  //     time: 1700000000,          // unix SECONDS (ms epoch / ISO / Date also accepted — auto-converted)
  //     index: 42,                 // OR a direct candle index (overrides time)
  //     position: 'belowBar',      // 'aboveBar' | 'belowBar' | 'inBar'
  //     shape: 'arrowUp',          // 'arrowUp'|'arrowDown'|'circle'|'square'|'cross'
  //     color: '#26a69a',
  //     size: 1,                   // multiplier (1 = ~5px base, clamped 0.3..10)
  //     text: 'Buy',               // optional label
  //     textColor: '#26a69a'       // optional (defaults to color)
  //   });
  // v2.8.0: invalid fields are coerced to safe defaults; a marker with an
  // unusable time/index is REJECTED (returns null) instead of corrupting the
  // render. TIP: for signal indicators that refresh every tick, prefer
  // setMarkers(batch) below — it replaces the whole array (no duplicates).
  addMarker(marker) {
    if (!marker || typeof marker !== 'object') return null;
    const m = Object.assign({}, marker);
    // ── time normalization (v2.8.0): Date | ISO string | ms epoch | seconds
    if (typeof m.index !== 'number' || !isFinite(m.index)) {
      let t = m.time;
      if (t instanceof Date) t = Math.floor(t.getTime() / 1000);
      else if (typeof t === 'string') { const p = Date.parse(t); t = isNaN(p) ? NaN : Math.floor(p / 1000); }
      else if (typeof t === 'number' && t > 1e11) t = Math.floor(t / 1000); // ms epoch → s
      if (typeof t !== 'number' || !isFinite(t)) return null; // unusable marker
      m.time = t;
      delete m.index;
    } else {
      m.index = Math.round(m.index);
    }
    // ── whitelist shape/position (invalid → safe default, marker still drawn)
    const _shapes = ['arrowUp', 'arrowDown', 'circle', 'square', 'cross'];
    if (_shapes.indexOf(m.shape) === -1) m.shape = 'arrowUp';
    const _positions = ['aboveBar', 'belowBar', 'inBar'];
    if (_positions.indexOf(m.position) === -1) m.position = 'belowBar';
    // ── clamp size / validate color & text
    if (typeof m.size !== 'number' || !isFinite(m.size)) m.size = 1;
    m.size = Math.min(10, Math.max(0.3, m.size));
    if (typeof m.color !== 'string' || !m.color) delete m.color;
    if (m.text !== undefined && typeof m.text !== 'string') m.text = String(m.text);
    m.id = m.id || (Date.now() + Math.floor(Math.random() * 100000));
    this.markers.push(m);
    // v2.8.0: warn once when the array grows abnormally (e.g. addMarker called
    // inside calculate() on every tick — use setMarkers() to replace instead)
    if (this.markers.length > 10000 && !this._markerWarned) {
      this._markerWarned = true;
      console.warn('[BadiCharts] ' + this.markers.length + ' markers accumulated. ' +
        'If you add signal markers on every update(), prefer chart.setMarkers(batch) which replaces the whole array.');
    }
    this.invalidate();
    return m.id;
  }
  // v2.8.0: Replace ALL markers with a new batch (idempotent — safe to call on
  // every data refresh / tick). Recommended for buy/sell signal markers so the
  // array never grows unbounded. Returns the number of stored markers.
  //   chart.setMarkers([
  //     { time: t1, position:'belowBar', shape:'arrowUp',   color:'#26a69a', text:'Buy'  },
  //     { time: t2, position:'aboveBar', shape:'arrowDown', color:'#ef5350', text:'Sell' }
  //   ]);
  setMarkers(markers) {
    this.markers = [];
    this._markerWarned = false;
    if (Array.isArray(markers)) {
      for (const m of markers) this.addMarker(m);
    }
    this.invalidate();
    return this.markers.length;
  }
  // Remove a marker by id. Returns the removed marker or null.
  // v2.15.0 FIX: the found-branch returned BEFORE invalidate() — the marker
  // stayed visible until some other interaction repainted the chart.
  removeMarker(id) {
    for (let i = 0; i < this.markers.length; i++) {
      if (this.markers[i].id === id) {
        const removed = this.markers.splice(i, 1)[0];
        this.invalidate();
        return removed;
      }
    }
    this.invalidate();
    return null;
  }
  // Remove all markers.
  clearMarkers() { this.markers = []; this._markerWarned = false; this.invalidate(); }
  // Get a snapshot of all markers.
  getMarkers() { return this.markers.slice(); }
  // Resolve a time (unix sec) to a candle index (last candle with time <= t).
  // v2.8.0: tolerates ms epoch + invalid input (returns -1 instead of NaN).
  _indexForTime(t) {
    if (typeof t !== 'number' || !isFinite(t)) return -1;
    if (t > 1e11) t = Math.floor(t / 1000); // ms epoch → seconds
    // v2.15.0: respect snapTime — for weekly/monthly data the raw candle
    // times are NOT multiples of a fixed tf, and flooring marker times onto
    // that grid mapped them to the WRONG candle (or to -1).
    const tf = this.sim.timeframeMs / 1000;
    const ts = (tf > 0 && this.sim.snapTime !== false) ? Math.floor(t / tf) * tf : t;
    const arr = this.sim.candles;
    let lo = 0, hi = arr.length - 1, res = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].time <= ts) { res = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return res;
  }

  // ─── Drawing handles (v2.7.0) ────────────────────────────────────────────
  // Compute the draggable handle positions (media coords) for a drawing.
  _getDrawingHandles(d) {
    const handles = [];
    const add = (key, mx, my, extra) => handles.push(Object.assign({ key: key, x: mx, y: my }, extra || {}));
    switch (d.type) {
      case 'trend': case 'ray': case 'channel': case 'arrow':
      case 'rect': case 'band': case 'fib':
        // v2.16.0 (#19): derive indices from stored times.
        add('p1', this.indexToX(this._drawingIdxAt(d, 'i1')), this.priceToY(d.p1));
        add('p2', this.indexToX(this._drawingIdxAt(d, 'i2')), this.priceToY(d.p2));
        break;
      case 'brush': case 'poly':
        if (d.points) {
          for (let i = 0; i < d.points.length; i++) {
            add('pt', this.indexToX(this._drawingVertexIdx(d, i)), this.priceToY(d.points[i].p), { ptIndex: i });
          }
        }
        break;
      case 'hline':
        add('price', this.chartLeft + 20, this.priceToY(d.price));
        break;
      case 'vline':
        add('index', this.indexToX(this._drawingIdxAt(d, 'index')), this.chartTop + 20);
        break;
      case 'text':
        add('anchor', this.indexToX(this._drawingIdxAt(d, 'i')), this.priceToY(d.p));
        break;
    }
    return handles;
  }
  // Hit-test a handle of the selected drawing (returns the handle or null).
  _hitDrawingHandle(x, y) {
    if (!this.selectedDrawing || this.selectedDrawing.locked) return null;
    const handles = this._getDrawingHandles(this.selectedDrawing);
    // v2.14.0 FIX (audit drawing-74): the 9px grab radius is too small for
    // fingers on touch devices — now 12px everywhere (9 was barely usable
    // even with a mouse), which TradingView also uses generously.
    const r = 12;
    for (let i = 0; i < handles.length; i++) {
      if (Math.hypot(x - handles[i].x, y - handles[i].y) <= r) return handles[i];
    }
    return null;
  }
  // Apply a handle drag: move the drawing's point to the given position.
  _applyHandleDrag(x, y) {
    const h = this._dragHandle;
    if (!h || !h.d) return;
    // v2.22.1 (TradingView-style threshold): a click that jitters a couple
    // of pixels must NOT nudge the handle — a click (no real movement)
    // selects, only a real drag moves.
    if (h.startX !== undefined && !h.moved) {
      if (Math.abs(x - h.startX) <= 3 && Math.abs(y - h.startY) <= 3) return;
      h.moved = true;
    }
    const d = h.d;
    const idx = this.xToIndex(x);
    const price = this.yToPrice(y);
    switch (h.key) {
      case 'p1': d.i1 = idx; d.p1 = price; break;
      case 'p2': d.i2 = idx; d.p2 = price; break;
      case 'pt': if (d.points && d.points[h.ptIndex]) d.points[h.ptIndex] = { i: idx, p: price, x: x, y: y }; break;
      case 'price': d.price = price; break;
      case 'index': d.index = idx; break;
      case 'anchor': d.i = idx; d.p = price; break;
    }
    // v2.16.0 (#19): re-stamp anchor times so the moved point keeps following
    // its new candle after future 50k trims.
    this._stampDrawingTimes(d);
    if (typeof d.recalc === 'function') d.recalc();
    this.autoScale();
  }
  // Deep-copy the coordinate fields of a drawing (for whole-drawing drag).
  _snapshotDrawing(d) {
    return JSON.parse(JSON.stringify({
      i1: d.i1, p1: d.p1, i2: d.i2, p2: d.p2,
      index: d.index, price: d.price, i: d.i, p: d.p,
      points: d.points,
      t1: d.t1, t2: d.t2, tIdx: d.tIdx, tPoints: d.tPoints   // v2.16.0 (#19)
    }));
  }
  // Move a whole drawing by the delta between the start position and now.
  _applyWholeDrag(x, y) {
    const dw = this._dragWhole;
    if (!dw || !dw.d) return;
    // v2.22.1 (TradingView-style threshold): a click that jitters a couple
    // of pixels must NOT move the whole drawing a whole candle — a click
    // (no real movement) selects, only a real drag moves.
    if (dw.startX !== undefined && !dw.moved) {
      if (Math.abs(x - dw.startX) <= 3 && Math.abs(y - dw.startY) <= 3) return;
      dw.moved = true;
    }
    const dIdx = this.xToIndex(x) - dw.startIdx;
    const dPrice = this.yToPrice(y) - dw.startPrice;
    const d = dw.d, s = dw.snapshot;
    if (s.i1 !== undefined && s.i1 !== null) { d.i1 = s.i1 + dIdx; d.p1 = s.p1 + dPrice; }
    if (s.i2 !== undefined && s.i2 !== null) { d.i2 = s.i2 + dIdx; d.p2 = s.p2 + dPrice; }
    if (s.index !== undefined && s.index !== null) d.index = s.index + dIdx;
    if (s.price !== undefined && s.price !== null) d.price = s.price + dPrice;
    if (s.i !== undefined && s.i !== null) { d.i = s.i + dIdx; d.p = s.p + dPrice; }
    if (s.points) d.points = s.points.map(function (p) { return { i: p.i + dIdx, p: p.p + dPrice }; });
    // v2.16.0 (#19): clear stale times so _stampDrawingTimes re-derives them
    // from the new indices next render.
    d.t1 = null; d.t2 = null; d.tIdx = null; d.tPoints = null;
    this._stampDrawingTimes(d);
    if (typeof d.recalc === 'function') d.recalc();
    this.autoScale();
  }

  // ─── Custom drawing tools ─────────────────────────────────────────────────
  // tool: { id, label, icon (emoji/short text), onDraw(ctx, drawing),
  //         onHitTest(drawing, x, y), onStart(ctx)?, onUpdate(drawing, ctx)?,
  //         onFinish(drawing)?, defaultStyle }
  // v2.10.0: custom two-point tools follow the same "click → move → click to
  // place / drag → release" flow as built-ins; onFinish fires once the
  // drawing is finally placed.
  addDrawingTool(tool) {
    if (!tool || !tool.id) return;
    // v2.5.0+: Per-instance tool list — don't push to the global DRAW_TOOLS array
    // so multiple charts don't share custom tools.
    if (!this._instanceTools) this._instanceTools = [];
    const exists = this._instanceTools.find(function (t) { return t.id === tool.id; });
    if (!exists) {
      this._instanceTools.push({ id: tool.id, label: tool.label || tool.id, icon: tool.icon || '◆' });
    }
    // Store the custom tool renderer/hit-test (per-instance)
    if (!this._customTools) this._customTools = {};
    this._customTools[tool.id] = tool;
  }

  // ─── Drawing properties panel ─────────────────────────────────────────────
  // When a drawing is selected (clicked), show a floating properties panel
  // with: delete, lock, color picker, stroke width, etc.
  // The selected drawing is stored in this.selectedDrawing.
  selectDrawing(drawing) {
    this.selectedDrawing = drawing;
  }
  deselectDrawing() {
    this.selectedDrawing = null;
  }
  updateDrawingStyle(drawing, style) {
    if (!drawing) return;
    if (style.color !== undefined) drawing.color = style.color;
    if (style.lineWidth !== undefined) drawing.lineWidth = style.lineWidth;
    if (style.locked !== undefined) drawing.locked = style.locked;
  }

  // v2.16.0 (#22a): the FIRST resetView() definition at this spot was DEAD —
  // a second definition later in the file (around line 3900 in v2.15) shadowed
  // it, so this one never ran. It is removed; the live definition (with the
  // explanatory comment about toasts) is the only one now.
  // Subscribe to crosshair updates (callback receives {index, price, time, candle}).
  // v2.14.0 FIX (audit #22): the callback was stored but NEVER fired, and
  // only one callback was supported with no way to unsubscribe. Now supports
  // multiple listeners + offCrosshair(cb), and the callback fires whenever
  // the crosshair index changes (mouse or touch).
  onCrosshair(cb) {
    if (typeof cb !== 'function') return this;
    if (!this._crosshairCbs) this._crosshairCbs = [];
    this._crosshairCbs.push(cb);
    // Back-compat: keep the single-cb field in sync for old integrations.
    this._crosshairCb = cb;
    return this;
  }
  offCrosshair(cb) {
    if (this._crosshairCbs) {
      const i = this._crosshairCbs.indexOf(cb);
      if (i >= 0) this._crosshairCbs.splice(i, 1);
    }
    return this;
  }
  // Internal: fire all crosshair listeners (guarded — a throwing listener
  // must never break input handling).
  _fireCrosshair(idx) {
    if (!this._crosshairCbs || this._crosshairCbs.length === 0) return;
    const candles = this.sim.candles;
    const N = candles.length;
    // v2.14.0: crosshairIndex is FRACTIONAL (xToIndex) — round to the
    // nearest candle for the payload. (The original code indexed
    // candles[375.8] → undefined → TypeError on every mousemove.)
    const ri = Math.max(0, Math.round(idx));
    const inData = ri >= 0 && ri < N;
    const candle = inData ? candles[ri] : null;
    const payload = {
      index: ri,
      price: this.yToPrice(this.mouseY),
      time: this._timeAtIndex(ri),
      candle: candle
    };
    for (const cb of this._crosshairCbs) {
      try { cb(payload); } catch (e) { console.error('[BadiCharts] onCrosshair callback error:', e); }
    }
  }
  // v2.14.0 FIX (audit #42): fit() just called resetView() (fixed 8px bars),
  // which does NOT fit the data — with 3000 candles you still saw ~90 of
  // them. Now it computes the bar spacing that fits ALL candles and shows
  // the whole dataset.
  fit() {
    const N = this.sim.candles.length;
    if (N > 0) {
      const availW = (this.chartRight - this.chartLeft) || 1;
      this.barSpacing = clamp(availW / (N + 4), this.minBarSpacing, this.maxBarSpacing);
      this.rightOffset = 2;
    } else {
      this.barSpacing = 8;
      this.rightOffset = 4;
    }
    this.constrainRightOffset();
    this.invalidateTimeMarks();
    this.autoScale();
    this.invalidate();
    return this;
  }

  /* --------------------------- Canvas Setup ------------------------------ */
  setupHiDPICanvas() {
    // v2.5.0+: Use the canvas's actual bounding rect (not window.innerWidth/innerHeight)
    // so multiple charts can coexist on the same page at different sizes.
    const self = this;
    // v2.14.0: touch-action none so touch drags pan the chart instead of
    // scrolling the page (mobile browsers otherwise hijack the gesture).
    try { this.canvas.style.touchAction = 'none'; } catch (_) {}
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      // v2.14.0 FIX: a hidden canvas (display:none) reports 0×0 — clamping
      // that to 1×1 corrupted the layout every time the chart was hidden
      // (e.g. SPA tab switch). Skip the resize instead; the ResizeObserver /
      // window resize will catch up when it becomes visible again.
      if (rect.width < 2 || rect.height < 2) return;
      const w = Math.floor(rect.width);
      const h = Math.floor(rect.height);
      // v2.14.0 FIX: DPR was read once at construction — moving the tab to a
      // screen with a different zoom left the bitmap blurry. Re-read it.
      // v2.15.0 FIX (regression): the DPR CAP was lost — a phone with
      // devicePixelRatio = 3 rendered (and cached every indicator bitmap)
      // at full 3×. The cap is applied again on every re-read.
      const rawDpr = (window.devicePixelRatio && isFinite(window.devicePixelRatio)) ? window.devicePixelRatio : 1;
      const dpr = Math.min(rawDpr, this._isMobile ? 2 : 3);
      // v2.15.0 FIX (ResizeObserver FEEDBACK LOOP): when the canvas had no
      // CSS size, writing canvas.width changed its DISPLAY size (bitmaps
      // size a canvas without CSS), which fired the observer again, which
      // multiplied the bitmap by DPR again… until the browser cap. Two guards:
      //   1) skip no-op resizes (same CSS size + same bitmap size);
      //   2) pin canvas.style.width/height from the first measured rect so
      //      bitmap changes can never alter the display size again.
      if (w === this.W && h === this.H && dpr === this.dpr &&
          this.canvas.width === Math.floor(w * dpr) &&
          this.canvas.height === Math.floor(h * dpr)) return;
      // v2.16.0 FIX (#13): pinning canvas.style.width/height to a fixed pixel
      // value FROZE responsive layouts — a canvas with `width:100%` in CSS
      // had its inline style overwritten by `width: 800px` on the first
      // measurement, and afterwards the canvas never grew with its container
      // (ResizeObserver kept seeing the same fixed size). Pin ONLY when the
      // canvas has NEITHER an inline style NOR a computed non-pixel size
      // (i.e. no CSS rule is sizing it). When CSS is sizing it, leave the
      // inline style alone — the bitmap follows the layout.
      const inlineW = this.canvas.style.width;
      const inlineH = this.canvas.style.height;
      // "auto" or empty inline → check computed style to see if CSS is sizing
      // the canvas. If the computed width is a pixel value, CSS or layout is
      // already deciding the display size — do NOT pin.
      let cssSizesIt = false;
      if (!inlineW && !inlineH) {
        try {
          const cs = (typeof getComputedStyle === 'function') ? getComputedStyle(this.canvas) : null;
          if (cs) {
            // A canvas with no CSS width rule resolves to the bitmap width
            // ("auto"). If it resolves to a px/%/em value, CSS is sizing it.
            const cw = cs.width, ch = cs.height;
            if (cw && cw !== 'auto' && !/^\d+px$/.test(cw) && !/^\d+px$/.test(ch)) cssSizesIt = true;
            // % or em or vw → definitely CSS-driven
            if ((cw && /[%emvw]/.test(cw)) || (ch && /[%emvw]/.test(ch))) cssSizesIt = true;
          }
        } catch (_) {}
      }
      if (!inlineW && !inlineH && !cssSizesIt) {
        // No CSS rule and no inline style → fall back to the measured rect so
        // the canvas has a sensible display size (otherwise a bare canvas
        // with no CSS sizes itself to the bitmap and the feedback loop
        // returns). This matches the v2.15.0 behavior for the "no CSS" case.
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
      }
      if (dpr !== this.dpr) this.dpr = dpr;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      // Don't override user CSS width/height — but the pin above guarantees
      // a fallback display size exists when none was specified.
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.W = w;
      this.H = h;
      this.updateLayout();
      this.invalidateTimeMarks();
      // v2.14.0 FIX (audit #5): resize() never called autoScale() — price
      // marks were computed against the OLD height, so grid lines no longer
      // matched the candle positions after any resize.
      this.autoScale();
      this.invalidate();
    };
    resize();
    // v2.15.0 FIX: register the window resize listener in _listeners so
    // destroy() removes it (it used to live in _onWindowResize, which
    // destroy() ignored — a destroyed chart kept re-running resize() on
    // every window resize forever).
    window.addEventListener('resize', resize);
    this._listeners.push([window, 'resize', resize]);
    // v2.14.0: ResizeObserver catches container-driven resizes (flex/grid
    // layout changes, sidebar toggles) that never fire window.resize.
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(function () { resize.call(self); });
      this._resizeObserver.observe(this.canvas);
    }
  }

  updateLayout() {
    // Responsive layout: smaller dimensions on mobile (width < 600px)
    const isMobile = this.W < 600;
    if (isMobile) {
      this.layout.toolbarH = 0;                  // HEADLESS
      this.layout.statusH = this._showStatusBar ? 22 : 0;
      this.layout.priceAxisW = 56;
      this.layout.timeAxisH = 24;
      this.layout.volumeH = 50;
      this.layout.gap = 4;
    } else {
      this.layout.toolbarH = 0;                  // HEADLESS
      this.layout.statusH = this._showStatusBar ? 26 : 0;
      this.layout.priceAxisW = 64;
      this.layout.timeAxisH = 28;
      this.layout.volumeH = 64;
      this.layout.gap = 8;
    }

    const paneTop = this.layout.toolbarH;
    const bottomStart = this.H - this.layout.statusH - this.layout.timeAxisH;
    // v2.13.0: MULTI-PANE. Each visible pane-type indicator gets its OWN window
    // below the price area — stacked top-down (pane[0] hugs the price area,
    // pane[N-1] hugs the volume). The price area shrinks to fit ALL panes;
    // candles are NEVER covered. Each pane has its own scale, grid, separator
    // and grab handle. Resizing one pane doesn't move the others (they're
    // anchored to the bottom-up stack — only the price area absorbs the delta).
    const paneIds = [];
    let hasVolume = false;
    for (const id of this.activeIndicators) {
      const state = this.indicatorStates.get(id);
      if (!state || !state.def) continue;
      // v2.14.0 FIX (audit #35b): a HIDDEN volume indicator must free its
      // reserved area — the old loop ignored state.visible and kept the 64px
      // strip reserved even when the user hid the volume indicator.
      if (state.def.type === 'volume') {
        if (state.visible !== false) hasVolume = true;
      } else if (state.def.type === 'pane' && state.visible !== false) {
        paneIds.push(id);
      }
    }
    // v2.17.1: NO CAP. Every visible pane-type indicator gets its OWN window —
    // the user can add as many bottom indicators as they want and ALL of them
    // render. The old hard cap of 6 silently dropped panes 7+ (they stayed
    // "active" in the API but drew NOWHERE, which looked like a bug). Instead
    // of capping, the per-pane heights adapt: the more panes, the smaller each
    // one gets (down to a readable minimum), and the price area always keeps
    // its guaranteed minimum. With a huge number of panes on a small canvas
    // every pane shrinks toward the 16px absolute floor — small, but VISIBLE
    // and error-free (no NaN coordinates are possible: every height stays > 0).
    const N = paneIds.length;
    const hasPane = N > 0;
    const volH = hasVolume ? this.layout.volumeH : 0;   // hoisted (needed by the budget)

    // Sync the _panes array with paneIds (preserve user-set heights + scales
    // across layout recalcs; drop entries for indicators no longer active).
    const prevById = new Map();
    for (const p of this._panes) prevById.set(p.id, p);
    this._panes = paneIds.map(id => {
      const prev = prevById.get(id);
      const userH = this._paneHUsers[id];
      return {
        id: id,
        top: 0, bottom: 0, height: 0,
        userH: (userH == null || !isFinite(userH)) ? null : userH,
        scale: (prev && prev.scale) || null,
        sepHover: false
      };
    });
    // Prune any user-height overrides for indicators that are no longer active
    // (so re-adding one later starts from the auto height, not a stale value).
    for (const k of Object.keys(this._paneHUsers)) {
      if (!paneIds.includes(k)) delete this._paneHUsers[k];
    }

    // Per-pane height: user override wins, else auto. Auto is computed so the
    // TOTAL pane stack stays within ~24% of usableH, divided equally among N
    // panes (each clamped 60–200).
    // v2.14.0 FIX (audit #13a): the volume strip is now SUBTRACTED from the
    // budget first — previously volH was ignored, so with a volume indicator
    // active the panes could overflow into it and squeeze the price area.
    const MIN_PANE_H = 60;      // comfort floor for a handful of panes
    const ABS_MIN_PANE_H = 16;  // v2.17.1: absolute floor — a pane this small still draws
    const MIN_PRICE_H = 120;
    const usableH = Math.max(0, bottomStart - (paneTop + 4) - volH);
    const maxTotalPaneH = Math.max(0, usableH - MIN_PRICE_H);
    // v2.17.1: ADAPTIVE floor. With N panes the 60px comfort floor only holds
    // while N × 60 fits in the pane budget; beyond that the floor yields down
    // to ABS_MIN_PANE_H so EVERY pane keeps a real window (the old behaviour
    // — fixed 60px — overflowed the budget and forced the cap). The floor is
    // GAP-AWARE: the stack also consumes 4px between panes + 4px above + one
    // price gap, and those pixels are reserved BEFORE dividing the budget, so
    // N × paneFloor + gaps ≤ maxTotalPaneH whenever paneFloor > ABS_MIN_PANE_H
    // and the price area keeps its MIN_PRICE_H guarantee for ANY pane count.
    const gapAllowance = (N - 1) * 4 + 4 + this.layout.gap;
    const paneFloor = hasPane
      ? Math.max(ABS_MIN_PANE_H, Math.min(MIN_PANE_H,
          Math.floor(Math.max(0, maxTotalPaneH - gapAllowance) / N)))
      : MIN_PANE_H;
    const autoEach = hasPane
      ? Math.max(paneFloor, Math.min(200, Math.round((usableH * 0.24) / N)))
      : 0;
    let paneTotalH = 0;
    for (const p of this._panes) {
      let h;
      if (p.userH != null) {
        h = Math.max(MIN_PANE_H, Math.min(200, Math.round(p.userH)));
        p.userH = h;   // snap into range
      } else {
        h = autoEach;
      }
      // v2.17.1: never below the adaptive floor (guards a degenerate budget).
      if (h < paneFloor) h = paneFloor;
      p.height = h;
      paneTotalH += h;
    }
    // If the total exceeds the budget (many user-set tall panes), scale them
    // down proportionally to protect the price area.
    // v2.14.0 FIX (audit #13b): MIN_PANE_H is no longer FORCED during the
    // shrink — with e.g. 6 panes × 60px forced minimum on a 400px chart the
    // "protected" sum was still 360px, leaving a 0-or-negative price area and
    // NaN in coordinateToLogical. The proportional shrink is now honest (down
    // to the ADAPTIVE floor per pane — v2.17.1: was a fixed 28px, which still
    // overflowed with 7+ panes: 7 × 28 = 196px on a budget of 160px) and the
    // final safety pass guarantees the price area its minimum whenever the
    // canvas allows it.
    if (paneTotalH > maxTotalPaneH && paneTotalH > 0) {
      const scale = maxTotalPaneH / paneTotalH;
      paneTotalH = 0;
      for (const p of this._panes) {
        p.height = Math.max(paneFloor, Math.round(p.height * scale));
        paneTotalH += p.height;
      }
    }
    this.layout.paneH = paneTotalH;    // legacy: total pane stack height

    this.chartLeft = this.layout.leftPad;
    this.chartRight = this.W - this.layout.priceAxisW;
    this.chartTop = paneTop + 4;
    this.chartBottom = bottomStart;   // all sections live inside [chartTop, chartBottom]

    // Bottom-up layout: volume hugs the time axis, panes stack above it
    // (pane[N-1] at the bottom, pane[0] at the top, just below the price area).
    // v2.14.0 FIX (audit #35b): with no volume indicator the wasted strip
    // above the time axis is gone — the price/pane stack now uses the full
    // chart height.
    this.volBottom = this.chartBottom - (hasVolume ? 4 : 0);
    this.volTop = this.volBottom - volH;
    let cursor = this.volTop - (N > 0 ? 4 : 0);   // bottom of the pane stack
    if (N > 0) {
      // Place panes from LAST to FIRST so pane[0] ends up at the top.
      for (let i = N - 1; i >= 0; i--) {
        const p = this._panes[i];
        p.bottom = cursor;
        p.top = p.bottom - p.height;
        cursor = p.top - 4;   // 4px gap between panes
      }
      this.paneTop = this._panes[0].top;        // legacy: top of pane stack
      this.paneBottom = this._panes[N - 1].bottom;  // legacy: bottom of pane stack
      this.priceBottom = this.paneTop - this.layout.gap;
    } else {
      this.paneTop = 0;
      this.paneBottom = 0;
      this.priceBottom = hasVolume ? this.volTop - 4 : this.chartBottom;
    }
    // v2.14.0 FIX (audit #13b): LAST-RESORT safety pass. Whatever the budget
    // math above produced, the price area must never end up ≤ 0 (NaN cascade
    // in coordinateToLogical) nor below MIN_PRICE_H (declared above) when the
    // canvas has room.
    // v2.16.0 FIX (#9): the loop broke when the LARGEST pane hit 28px — but a
    // single tall pane could keep starving the price area on a small canvas
    // (e.g. one user-set 200px pane on a 320px canvas → price area stuck at
    // ~70-80px instead of the declared 120px minimum). The loop now continues
    // shrinking ANY pane above the adaptive floor until EVERY pane is at
    // paneFloor (only then does it give up — meaning the canvas itself is too
    // small).
    // v2.17.1 LAST-RESORT squeeze: when even N × paneFloor does not fit (only
    // possible on a very small canvas with very many panes — the paneFloor
    // then equals ABS_MIN_PANE_H), shrink ALL panes proportionally to an 8px
    // absolute floor so the price area stays positive. Heights can NEVER
    // reach 0 or below in any code path → no NaN coordinates are possible.
    let guard = 0;
    while ((this.priceBottom - this.priceTop) < MIN_PRICE_H && guard++ < 12) {
      // Pick the tallest pane that is still above the adaptive floor.
      let target = null;
      for (const p of this._panes) {
        if (p.height > paneFloor && (!target || p.height > target.height)) target = p;
      }
      if (!target) break;   // every pane already at the adaptive floor
      const delta = Math.min(target.height - paneFloor, MIN_PRICE_H - (this.priceBottom - this.priceTop));
      if (delta <= 0) break;
      target.height -= delta;
      this.layout.paneH = this._panes.reduce((s, p) => s + p.height, 0);
      // Re-stack with the new heights
      cursor = this.volTop - 4;
      for (let i = this._panes.length - 1; i >= 0; i--) {
        const p = this._panes[i];
        p.bottom = cursor;
        p.top = p.bottom - p.height;
        cursor = p.top - 4;
      }
      this.paneTop = this._panes[0].top;
      this.paneBottom = this._panes[this._panes.length - 1].bottom;
      this.priceBottom = this.paneTop - this.layout.gap;
    }
    if ((this.priceBottom - this.priceTop) < MIN_PRICE_H && this._panes.length > 0) {
      const M = this._panes.length;
      // v2.17.1: gap-aware squeeze — reserve the inter-pane gaps first, then
      // divide what is left; each pane is clamped to an 8px absolute floor so
      // heights can NEVER reach 0 (no NaN coordinates are possible).
      const fitEach = Math.floor(Math.max(0, maxTotalPaneH - ((M - 1) * 4 + 4 + this.layout.gap)) / M);
      const squeezeEach = Math.max(8, Math.min(fitEach, paneFloor));
      for (const p of this._panes) p.height = squeezeEach;
      this.layout.paneH = squeezeEach * M;
      cursor = this.volTop - 4;
      for (let i = M - 1; i >= 0; i--) {
        const p = this._panes[i];
        p.bottom = cursor;
        p.top = p.bottom - p.height;
        cursor = p.top - 4;
      }
      this.paneTop = this._panes[0].top;
      this.paneBottom = this._panes[M - 1].bottom;
      this.priceBottom = this.paneTop - this.layout.gap;
    }
    this.priceTop = this.chartTop;

    // v2.12.0: INTEGER-SNAP every layout edge. Sub-pixel boundaries make the
    // browser anti-alias the 1px separator differently each frame, perceived
    // as a faint vibration. Flooring kills it permanently.
    this.chartLeft   = Math.floor(this.chartLeft);
    this.chartRight  = Math.floor(this.chartRight);
    this.chartTop    = Math.floor(this.chartTop);
    this.chartBottom = Math.floor(this.chartBottom);
    this.priceTop    = Math.floor(this.priceTop);
    this.priceBottom = Math.floor(this.priceBottom);
    this.paneTop     = Math.floor(this.paneTop);
    this.paneBottom  = Math.floor(this.paneBottom);
    this.volTop      = Math.floor(this.volTop);
    this.volBottom   = Math.floor(this.volBottom);
    for (const p of this._panes) {
      p.top = Math.floor(p.top);
      p.bottom = Math.floor(p.bottom);
      p.height = p.bottom - p.top;
    }

    // Update scale heights
    // v2.14.0: guard against a zero/negative price height (empty canvas) —
    // PriceScale with h<=0 produced NaN marks.
    this.priceScale.setHeight(Math.max(1, this.priceBottom - this.priceTop));
    this.volScale.setHeight(Math.max(1, this.volBottom - this.volTop));
    // Keep each pane's scale height in sync (so a window resize, which calls
    // only updateLayout, doesn't leave a stale scale height on the next render).
    for (const p of this._panes) {
      if (p.scale) p.scale.setHeight(Math.max(1, p.height));
    }
    // Legacy alias used at ~10 render sites as `this.layout.paneBottom`:
    // v2.15.0 FIX (regression): v2.14.0 set it to the PANE-STACK bottom —
    // sites like drawTimeAxis (axisTop), drawPriceAxis, the crosshair and
    // background sizing then fell INTO the volume strip when panes + volume
    // were combined (time labels in the middle of the volume bar). The
    // intended semantic of every one of those sites is "top of the time-axis
    // strip" = chartBottom. The pane-stack bottom remains this.paneBottom.
    this.layout.paneBottom = this.chartBottom;
    // Legacy: this.paneScale points to _panes[0].scale (set by autoScale).
    this.paneScale = (N > 0 && this._panes[0].scale) ? this._panes[0].scale : null;
  }

  /* --------------------------- Events ------------------------------------ */
  setupEvents() {
    // v2.8.0: every input event marks the chart active so the idle throttle
    // resumes full-speed rendering instantly on interaction.
    // v2.14.0 FIX (audit #25): every listener is recorded in _listeners so
    // destroy() can actually remove them (anonymous listeners could never be
    // removed — a destroyed chart kept reacting to window keydown/resize
    // forever and leaked across SPA navigations).
    const act = () => this.invalidate();
    // v2.15.0: _listeners is created in the CONSTRUCTOR (before
    // setupHiDPICanvas registers the window resize listener) — do NOT reset
    // it here or the resize listener would leak again.
    if (!this._listeners) this._listeners = [];   // [target, type, fn, options]
    const on = (target, type, fn, options) => {
      target.addEventListener(type, fn, options);
      this._listeners.push([target, type, fn, options]);
    };
    // Mouse events (desktop)
    on(this.canvas, 'mousemove', (e) => { act(); this.onMouseMove(e); });
    on(this.canvas, 'mousedown', (e) => { act(); this.onMouseDown(e); });
    // v2.10.0: mouseup is tracked on the WINDOW, not only the canvas — if the
    // user presses inside the chart and releases outside it (or over another
    // element), the pending drawing is still finalized and the chart can
    // never be left with a preview that follows the mouse forever.
    // v2.14.0 (audit #37): mousemove is ALSO tracked on the window while a
    // drag is active — previously a drag froze when the pointer left the
    // canvas (the canvas stopped receiving mousemove mid-gesture).
    on(window, 'mouseup', (e) => { act(); this.onMouseUp(e); });
    on(window, 'mousemove', (e) => {
      // Only serve moves that the canvas handler missed (pointer outside the
      // canvas during an active drag). Normal in-canvas moves are handled by
      // the canvas listener; this avoids double-processing.
      const dragging = this.isDragging || this._dragHandle || this._dragWhole || this._paneResize;
      if (!dragging) return;
      const r = this.canvas.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right &&
                     e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) this.onMouseMove(e);
    });
    on(this.canvas, 'mouseleave', () => { act(); this.onMouseLeave(); });
    on(this.canvas, 'mouseenter', () => { act(); this.mouseInside = true; });
    on(this.canvas, 'wheel', (e) => { act(); this.onWheel(e); }, {passive: false});
    on(this.canvas, 'contextmenu', (e) => { e.preventDefault(); act(); this.onRightClick(e); });
    // v2.10.0: double-click finishes an in-progress polygon (click-click-click... done)
    on(this.canvas, 'dblclick', (e) => { act(); this.onDblClick(e); });
    on(window, 'keydown', (e) => { act(); this.onKeyDown(e); });

    // Touch events (mobile)
    on(this.canvas, 'touchstart', (e) => { act(); this.onTouchStart(e); }, {passive: false});
    on(this.canvas, 'touchmove', (e) => { act(); this.onTouchMove(e); }, {passive: false});
    on(this.canvas, 'touchend', (e) => { act(); this.onTouchEnd(e); }, {passive: false});
    on(this.canvas, 'touchcancel', (e) => { act(); this.onTouchEnd(e); }, {passive: false});
  }

  /* --------------------------- Touch Handlers ---------------------------- */
  // v2.16.0 (#16): after a touch ends, mobile browsers fire a synthetic
  // mousedown/mousemove/mouseup sequence at the same coordinates. That used
  // to re-arm previews or re-select drawings after the touch path had
  // already cleaned them up — a single tap could start a preview, cancel it,
  // and then start it AGAIN via the synthetic mouse. A 600ms guard after
  // touchend drops these synthetic events so a tap behaves as a single tap.
  _isSyntheticMouse(e) {
    if (e == null) return false;
    // Pointer events carry pointerType directly.
    if (e.pointerType === 'touch') return false;   // real pointer event, not synthetic
    // Mouse events have no pointerType. Use the time since last touchend.
    if (this._lastTouchEndAt && performance.now() - this._lastTouchEndAt < 600) return true;
    // sourceCapabilities is a Chrome-specific hint (null for synthetic).
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents === true) return true;
    return false;
  }
  onTouchStart(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const touches = e.touches;
    // v2.4.0+: Cancel any active momentum when the user starts a new touch
    this._momentum = null;
    this._panVelocity = 0;
    this._lastPanTime = 0;
    // A real touch started → clear the synthetic-mouse guard window.
    this._lastTouchEndAt = 0;
    if (touches.length === 1) {
      // Single touch = pan (like drag)
      const t = touches[0];
      _lastActiveChartInstance = this;   // v2.14.0: multi-chart keyboard guard
      this.touchStartX = t.clientX - r.left;
      this.touchStartY = t.clientY - r.top;
      this.touchStartRightOffset = this.rightOffset;
      this.isDragging = true;
      this.mouseX = this.touchStartX;
      this.mouseY = this.touchStartY;
      this.mouseInside = true;
      // v2.14.0 FIX (audit #23): touch could never reach the indicator cards,
      // the settings card or the drawing properties panel — those were wired
      // into the mouse path only. Route them here first (same priority order
      // as onMouseDown). A successful hit also cancels the pan gesture.
      const scHit = this._hitSettingsCard(this.touchStartX, this.touchStartY);
      if (scHit) {
        this.isDragging = false;
        const fake = { clientX: t.clientX, clientY: t.clientY, button: 0, preventDefault() {}, stopPropagation() {} };
        this.onMouseDown(fake);
        return;
      }
      if (this.selectedDrawing && this._handleDrawPanelClick(this.touchStartX, this.touchStartY)) {
        this.isDragging = false;
        return;
      }
      const iconHit = this._hitIcon(this.touchStartX, this.touchStartY);
      if (iconHit) {
        this.isDragging = false;
        this._handleIconClick(iconHit.indId, iconHit.iconId);
        return;
      }
      const cardHit = this._hitCard(this.touchStartX, this.touchStartY);
      if (cardHit) {
        this.isDragging = false;
        this.activeIndicatorCard = this.activeIndicatorCard === cardHit ? null : cardHit;
        this.invalidate();
        return;
      }
      // Pane separator resize on touch (drag the divider)
      if (this.activeTool === 'cursor') {
        const paneId = this._hitPaneSeparator(this.touchStartX, this.touchStartY);
        if (paneId != null) {
          const pane = this._panes.find(p => p.id === paneId);
          if (pane) {
            this._paneResize = { paneId: paneId, startY: this.touchStartY, startH: pane.height };
            this.isDragging = false;
            return;
          }
        }
      }
      // Check buttons
      const btn = this.hitButton(this.touchStartX, this.touchStartY);
      if (btn) { this.handleButtonClick(btn); this.isDragging = false; return; }
      if (this.dropdown) {
        const item = this.hitDropdown(this.touchStartX, this.touchStartY);
        if (item) { this.handleDropdownSelect(item); this.dropdown = null; this.isDragging = false; return; }
        if (this.touchStartX < this.dropdown.x || this.touchStartX > this.dropdown.x + this.dropdown.w ||
            this.touchStartY < this.dropdown.y || this.touchStartY > this.dropdown.y + this.dropdown.h) {
          this.dropdown = null; this.isDragging = false; return;
        }
      }
      if (this.activeTool !== 'cursor') {
        this.isDragging = false;
        if (this.inChartArea(this.touchStartX, this.touchStartY)) {
          // v2.10.0: polygon on touch — every extra tap adds a vertex
          // (double-tap finishes, see onTouchEnd). Other tools start/continue
          // a drag-drawing; a tap that never moves is discarded in onTouchEnd.
          if (this.currentDrawing && this.currentDrawing.type === 'poly') {
            this.addPolygonVertex(this.touchStartX, this.touchStartY);
          } else if (!this.currentDrawing) {
            this._drawAnchor = { x: this.touchStartX, y: this.touchStartY };
            this._drawMoved = false;
            this.startDrawing(this.touchStartX, this.touchStartY);
          }
        }
      } else if (this.inChartArea(this.touchStartX, this.touchStartY)) {
        // v2.7.0: Drawing handle/whole-drag on touch (before pan)
        if (this.selectedDrawing) {
          const handle = this._hitDrawingHandle(this.touchStartX, this.touchStartY);
          if (handle) {
            this._dragHandle = {
              d: this.selectedDrawing, key: handle.key, ptIndex: handle.ptIndex,
              startX: this.touchStartX, startY: this.touchStartY, moved: false   // v2.22.1: threshold
            };
            this.isDragging = false;
            return;
          }
        }
        const clickedDrawing = this.findDrawingAt(this.touchStartX, this.touchStartY);
        if (clickedDrawing && !clickedDrawing.locked) {
          this.selectDrawing(clickedDrawing);
          this._dragWhole = {
            d: clickedDrawing,
            startIdx: this.xToIndex(this.touchStartX),
            startPrice: this.yToPrice(this.touchStartY),
            snapshot: this._snapshotDrawing(clickedDrawing),
            startX: this.touchStartX, startY: this.touchStartY, moved: false   // v2.22.1: threshold
          };
          this.isDragging = false;
          return;
        }
      }
      // Update crosshair
      if (this.inChartArea(this.touchStartX, this.touchStartY)) {
        const idx = this.xToIndex(this.touchStartX);
        this.crosshairIndex = idx;
      }
    } else if (touches.length === 2) {
      // Two-finger pinch = zoom
      this.isDragging = false;
      this.isPinching = true;
      const t1 = touches[0], t2 = touches[1];
      this.pinchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      this.pinchStartBarSpacing = this.barSpacing;
      this.pinchCenterX = ((t1.clientX + t2.clientX) / 2) - r.left;
      this.pinchCenterY = ((t1.clientY + t2.clientY) / 2) - r.top;
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const touches = e.touches;
    // v2.14.0: pane separator resize (touch) — same semantics as mouse drag
    if (this._paneResize && touches.length >= 1) {
      const t0 = touches[0];
      const y = t0.clientY - r.top;
      const dy = y - this._paneResize.startY;
      const newH = this._paneResize.startH - dy;
      const clamped = Math.max(60, Math.min(200, Math.round(newH)));
      if (clamped !== this._paneHUsers[this._paneResize.paneId]) {
        this._paneHUsers[this._paneResize.paneId] = clamped;
        this.updateLayout();
        this.autoScale();
        this.invalidate();
      }
      return;
    }
    // v2.7.0: Drawing handle drag takes priority over everything else (touch)
    if (this._dragHandle && touches.length >= 1) {
      const t0 = touches[0];
      this._applyHandleDrag(t0.clientX - r.left, t0.clientY - r.top);
      return;
    }
    // v2.7.0: Whole-drawing drag (touch)
    if (this._dragWhole && touches.length >= 1) {
      const t0 = touches[0];
      this._applyWholeDrag(t0.clientX - r.left, t0.clientY - r.top);
      return;
    }

    if (this.isPinching && touches.length === 2) {
      const t1 = touches[0], t2 = touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      this._touchInteract();   // v2.15.0: bypass the rebuild budget while pinching
      if (this.pinchStartDist > 0) {
        const factor = dist / this.pinchStartDist;
        const oldSpacing = this.pinchStartBarSpacing;
        let newSpacing = clamp(oldSpacing * factor, this.minBarSpacing, this.maxBarSpacing);
        if (newSpacing !== this.barSpacing) {
          // Zoom toward pinch center
          const x = this.pinchCenterX;
          const N = this.sim.candles.length;
          const idx = this.xToIndex(x);
          const distFromRight = this.chartRight - x;
          this.barSpacing = newSpacing;
          this.rightOffset = distFromRight / newSpacing - (N - 1 - idx);
          this.constrainRightOffset();
          this.invalidateTimeMarks();
          this.autoScale();
        }
      }
    } else if (this.isDragging && touches.length === 1) {
      const t = touches[0];
      const x = t.clientX - r.left;
      const y = t.clientY - r.top;
      this.mouseX = x;
      this.mouseY = y;
      const dx = x - this.touchStartX;
      const barsMoved = dx / this.barSpacing;
      this.rightOffset = this.touchStartRightOffset - barsMoved;
      this.constrainRightOffset();
      this.autoScale();
      // v2.4.0+: Track velocity for momentum scrolling (touch)
      const now = performance.now();
      const dt = now - this._lastPanTime;
      if (dt > 0 && this._lastPanTime > 0) {
        const instV = (x - this._lastPanX) / dt;
        // v2.6.0: Stronger smoothing + velocity cap
        this._panVelocity = this._panVelocity * 0.65 + instV * 0.35;
        if (this._panVelocity > this._momentumMaxVelocity) this._panVelocity = this._momentumMaxVelocity;
        if (this._panVelocity < -this._momentumMaxVelocity) this._panVelocity = -this._momentumMaxVelocity;
      }
      this._lastPanX = x;
      this._lastPanTime = now;
      if (this.inChartArea(x, y)) {
        const idx = this.xToIndex(x);
        this.crosshairIndex = idx;
      }
    } else if (this.currentDrawing && touches.length === 1) {
      const t = touches[0];
      const x = t.clientX - r.left;
      const y = t.clientY - r.top;
      // v2.10.0: remember whether this touch is a real drag (>8px) or a tap
      if (this._drawAnchor &&
          (Math.abs(x - this._drawAnchor.x) > 8 || Math.abs(y - this._drawAnchor.y) > 8)) {
        this._drawMoved = true;
      }
      this.updateCurrentDrawing(x, y);
    }
  }

  onTouchEnd(e) {
    e.preventDefault();
    // v2.16.0 (#16): mark the moment so the synthetic mouse events that
    // follow (mobile browsers fire mousedown/mousemove/mouseup after every
    // touchend) can be dropped by _isSyntheticMouse().
    this._lastTouchEndAt = performance.now();
    if (this.isPinching) {
      this.isPinching = false;
    }
    // v2.15.0 FIX (regression): _paneResize survived touchend FOREVER — after
    // the first separator touch, every later single-finger drag kept resizing
    // the pane instead of panning the chart (the mouse path cleared it in
    // onMouseUp, the touch path never did).
    if (this._paneResize) {
      this._paneResize = null;
      try { this.canvas.style.cursor = ''; } catch (_) {}
    }
    // v2.7.0: clear drawing drag states
    this._dragHandle = null;
    this._dragWhole = null;
    // v2.4.0+: Start momentum scrolling on touch release (if panning velocity is significant)
    // v2.20.0: only if the flick was fast AND it started near a chart edge.
    if (this.isDragging) {
      this.isDragging = false;
      if (this._shouldStartMomentum(this.touchStartX)) {
        this._momentum = { velocity: this._panVelocity, lastTime: performance.now() };
      }
      this._panVelocity = 0;
      this._lastPanTime = 0;
    }
    if (this.currentDrawing) {
      // v2.10.0: touch drawing endings
      const cd = this.currentDrawing;
      const nowMs = performance.now();
      if (cd.type === 'poly') {
        // Polygon: taps add vertices, a quick double-tap closes the shape
        if (nowMs - (this._lastPolyTap || 0) < 350) {
          this.finishDrawing();
        } else {
          this._lastPolyTap = nowMs;
        }
      } else if (this._drawMoved) {
        // Real drag → place the drawing (classic gesture)
        this.finishDrawing();
      } else {
        // A tap without movement would create a degenerate zero-size drawing
        // → discard it, keep the tool armed and teach the gesture instead.
        this.currentDrawing = null;
        this._drawAnchor = null;
        this._hintOnce('Drag to draw');
      }
    }
    // v2.14.0 FIX (audit #23): after a touch ends there is no pointer over
    // the chart — mouseInside must return to false (or stay false) so the
    // legend stops showing the "hovered" candle values stuck on screen, and
    // the crosshair clears.
    this.mouseInside = false;
    this.crosshairIndex = null;
    this.invalidate();
  }

  onMouseMove(e) {
    // v2.16.0 (#16): drop synthetic mouse moves fired after touchend. They
    // would set mouseInside=true and keep the crosshair + OHLC legend stuck
    // on the last touch position after the finger is off the screen.
    if (this._isSyntheticMouse(e)) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    this.mouseX = x;
    this.mouseY = y;
    this.mouseInside = true;
    _lastActiveChartInstance = this;   // v2.14.0: multi-chart keyboard guard
    this.hoverButton = this.hitButton(x, y);
    // v2.19.0: replay playback-bar hover state
    this._replayHover = (this.replay.active && this.replay.showBar)
      ? ((this._hitReplayBar(x, y) || {}).id || null) : null;
    // Check icon hover
    this.hoverIcon = this._hitIcon(x, y);
    // Check drawing panel hover
    this._hoverDrawPanelIcon = null;
    if (this.selectedDrawing) {
      for (const h of this._drawPanelHits) {
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
          this._hoverDrawPanelIcon = h.action;
          break;
        }
      }
    }

    // v2.13.0: Pane separator hover state — drives the cursor style and the
    // grip handle highlight for whichever pane's divider the cursor is over.
    this._paneSepHoverId = (this.activeTool === 'cursor' && !this._paneResize) ?
                            this._hitPaneSeparator(x, y) : null;
    if (this._paneResize || this._paneSepHoverId != null) {
      try { this.canvas.style.cursor = 'ns-resize'; } catch (_) {}
    } else if (this.activeTool === 'cursor') {
      // v2.22.1 (TradingView affordance): a 'move' cursor over a selectable
      // drawing tells the user it can be grabbed and dragged. Cheap
      // hit-test: O(drawings), cursor mode only, chart area only.
      let cur = '';
      if (this.drawings.length && !this._dragHandle && !this._dragWhole &&
          !this._paneResize && this.inChartArea(x, y)) {
        const hd = this.findDrawingAt(x, y);
        if (hd && !hd.locked) cur = 'move';
      }
      try { this.canvas.style.cursor = cur; } catch (_) {}
    }

    // v2.13.0: Per-pane separator drag — handle BEFORE everything else so the
    // divider doesn't fight pan/drawing handlers. Dragging the divider above
    // pane[i] DOWN grows y, which moves the separator DOWN, which SHRINKS
    // pane[i] (its top edge moves toward its bottom edge). newH = startH - dy.
    // Only THIS pane's height changes; the other panes (and the volume) stay
    // put — the price area absorbs the delta.
    if (this._paneResize) {
      const dy = y - this._paneResize.startY;
      const newH = this._paneResize.startH - dy;
      const MIN_PANE_H = 60, MAX_PANE_H = 200;
      const clamped = Math.max(MIN_PANE_H, Math.min(MAX_PANE_H, Math.round(newH)));
      const prev = this._paneHUsers[this._paneResize.paneId];
      if (clamped !== prev) {
        this._paneHUsers[this._paneResize.paneId] = clamped;
        this.updateLayout();
        this.autoScale();
        this.invalidate();
      }
      return;
    }

    // v2.7.0: Drawing handle drag takes priority over everything else
    if (this._dragHandle) {
      this._applyHandleDrag(x, y);
      return;
    }
    // v2.7.0: Whole-drawing drag
    if (this._dragWhole) {
      this._applyWholeDrag(x, y);
      return;
    }

    // v2.10.0: while the left button is held with a drawing tool, remember
    // whether the pointer really moved (>4px) — release then means "place";
    // a still release means "arm, wait for the 2nd click".
    if (this._mouseDown && this._drawAnchor) {
      if (Math.abs(x - this._drawAnchor.x) > 4 || Math.abs(y - this._drawAnchor.y) > 4) {
        this._drawMoved = true;
      }
    }

    if (this.isDragging && this.activeTool === 'cursor') {
      const dx = x - this.dragStartX;
      const barsMoved = dx / this.barSpacing;
      this.rightOffset = this.dragStartRightOffset - barsMoved;
      this.constrainRightOffset();
      this.autoScale();
      // v2.4.0+: Track velocity for momentum scrolling
      const now = performance.now();
      const dt = now - this._lastPanTime;
      if (dt > 0 && this._lastPanTime > 0) {
        const instV = (x - this._lastPanX) / dt;  // px/ms
        // v2.6.0: Stronger smoothing (previous 60% + instant 40%) so a single
        // fast flick doesn't produce an extreme velocity.
        this._panVelocity = this._panVelocity * 0.65 + instV * 0.35;
        if (this._panVelocity > this._momentumMaxVelocity) this._panVelocity = this._momentumMaxVelocity;
        if (this._panVelocity < -this._momentumMaxVelocity) this._panVelocity = -this._momentumMaxVelocity;
      }
      this._lastPanX = x;
      this._lastPanTime = now;
    } else if (this.currentDrawing) {
      this.updateCurrentDrawing(x, y);
    }

    if (this.mouseInside && this.inChartArea(x, y)) {
      const idx = this.xToIndex(x);
      const prevIdx = this.crosshairIndex;
      // v2.14.0 FIX (audit #27): the crosshair no longer stops at the last
      // candle — it follows the cursor into the FUTURE area too (the time
      // axis and _timeAtIndex already supported it). The value crosshair
      // (price label) hides automatically when the cursor is past the data.
      this.crosshairIndex = Math.max(0, idx);
      if (this.crosshairIndex !== prevIdx) {
        this._fireCrosshair(this.crosshairIndex);   // v2.14.0: fire onCrosshair listeners
      }
    } else {
      this.crosshairIndex = null;
    }
  }

  // Hit-test for indicator icons (returns {indId, iconId} or null)
  _hitIcon(x, y) {
    for (const h of this._iconHits) {
      if (h.type === 'icon' && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        return {indId: h.indId, iconId: h.iconId};
      }
    }
    return null;
  }
  // Hit-test for indicator cards (returns indicator id or null)
  _hitCard(x, y) {
    for (const h of this._iconHits) {
      if (h.type === 'card' && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        return h.id;
      }
    }
    return null;
  }
  // Hit-test for settings card elements
  _hitSettingsCard(x, y) {
    if (!this.settingsCard) return null;
    const sc = this.settingsCard;
    // Close button (X)
    if (x >= sc.x + sc.w - 22 && x <= sc.x + sc.w - 6 && y >= sc.y + 8 && y <= sc.y + 22) {
      return {action: 'close'};
    }
    // Cancel button
    const btnY = sc.y + sc.h - 32;
    if (x >= sc.x + 10 && x <= sc.x + 90 && y >= btnY && y <= btnY + 24) {
      return {action: 'cancel'};
    }
    // Save button
    if (x >= sc.x + sc.w - 90 && x <= sc.x + sc.w - 10 && y >= btnY && y <= btnY + 24) {
      return {action: 'save'};
    }
    // Field input boxes
    let fy = sc.y + 36;
    for (let i = 0; i < sc.fields.length; i++) {
      const ix = sc.x + 90, iw = sc.w - 100, ih = 20;
      if (x >= ix && x <= ix + iw && y >= fy && y <= fy + ih) {
        return {action: 'field', index: i};
      }
      fy += 30;
    }
    // Inside card but not on a control
    if (x >= sc.x && x <= sc.x + sc.w && y >= sc.y && y <= sc.y + sc.h) {
      return {action: 'inside'};
    }
    return null;
  }

  // v2.15.0: inline DOM editor for a settings-card field — replaces the old
  // window.prompt() (blocking, unstyleable, blocked in sandboxed iframes).
  // The <input> is positioned exactly over the field's canvas rect and is
  // fully removed from the DOM on commit/cancel/destroy.
  _openFieldEditor(field, rect) {
    if (typeof document === 'undefined') return;   // headless — keep current value
    this._closeFieldEditor(false);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = String(field.value);
    input.setAttribute('data-badi-field-editor', '1');
    const hostRect = this.canvas.getBoundingClientRect();
    const s = input.style;
    s.position = 'fixed';
    s.left = (hostRect.left + rect.x) + 'px';
    s.top = (hostRect.top + rect.y) + 'px';
    s.width = Math.max(40, rect.w) + 'px';
    s.height = Math.max(18, rect.h) + 'px';
    s.boxSizing = 'border-box';
    s.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    s.background = this.theme.cardBg || '#1e222d';
    s.color = this.theme.textBright || '#d1d4dc';
    s.border = '1px solid ' + (this.theme.accent || '#2962ff');
    s.borderRadius = '3px';
    s.padding = '0 4px';
    s.outline = 'none';
    s.zIndex = '2147483000';
    s.margin = '0';
    const self = this;
    let done = false;   // blur fires AFTER remove() in some browsers — guard
    const commit = function () {
      if (done) return;
      done = true;
      const num = parseFloat(input.value);
      if (input.value.trim() !== '' && isFinite(num)) field.value = num;
      self._closeFieldEditor();
    };
    const cancel = function () {
      if (done) return;
      done = true;
      self._closeFieldEditor();
    };
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
      ev.stopPropagation();   // never leak keys into the chart shortcuts
    });
    input.addEventListener('blur', commit);
    document.body.appendChild(input);
    input.focus();
    input.select();
    this._fieldEditor = input;
    this.invalidate();
  }
  _closeFieldEditor() {
    const input = this._fieldEditor;
    if (!input) return;
    this._fieldEditor = null;
    try { input.remove(); } catch (_) {}
    this.invalidate();
  }

  // Handle a click on an indicator icon
  _handleIconClick(indId, iconId) {
    // Handle the collapse/expand arrow
    if (iconId === 'collapse') {
      this.indicatorsCollapsed = !this.indicatorsCollapsed;
      return;
    }
    const state = this.indicatorStates.get(indId);
    if (!state) return;
    // Check custom icons first
    const custom = state.customIcons.find(c => c.id === iconId);
    if (custom) {
      if (custom.onClick) custom.onClick(indId, state);
      return;
    }
    // Default icons
    switch (iconId) {
      case 'hide':
        state.visible = !state.visible;
        this.showToast(state.visible ? 'Showed ' + indId : 'Hid ' + indId);
        // v2.14.0 FIX (audit #9a): hiding/showing an indicator changes the
        // layout (a hidden pane indicator must release its window and a
        // hidden overlay must release its price-range contribution) — the
        // old code only flipped the flag, so hidden pane indicators KEPT
        // their window and stale content until the next full relayout.
        this.updateLayout();
        this.computeIndicators();
        this.autoScale();
        this.invalidate();
        break;
      case 'edit':
        if (state.onEdit) state.onEdit(state);
        else this.showToast('Editor for ' + indId);
        break;
      case 'settings':
        this._openSettingsCard(indId, state);
        break;
      case 'delete':
        this.removeIndicator(indId);
        this.showToast('Removed ' + indId);
        break;
    }
  }

  onMouseDown(e) {
    // v2.16.0 (#16): drop synthetic mouse events fired by the browser after a
    // touchend (mobile). Without this a tap could start a preview, the
    // touchend cancel it, and the synthetic mousedown re-arm it — leaving a
    // stuck preview waiting for a second click.
    if (this._isSyntheticMouse(e)) return;
    // v2.14.0 FIX (audit #37): only the LEFT button starts interactions —
    // middle-click and right-click previously began a chart drag too.
    if (e.button !== undefined && e.button !== 0) return;
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    _lastActiveChartInstance = this;   // v2.14.0: multi-chart keyboard guard

    // v2.4.0+: Cancel any active momentum when the user starts a new interaction
    this._momentum = null;
    this._panVelocity = 0;
    this._lastPanTime = 0;

    // 1. Check settings card first (topmost overlay)
    const scHit = this._hitSettingsCard(x, y);
    if (scHit) {
      if (scHit.action === 'close' || scHit.action === 'cancel') {
        this.settingsCard = null;
      } else if (scHit.action === 'save') {
        // Apply draft values
        const sc = this.settingsCard;
        const newSettings = {};
        for (const f of sc.fields) newSettings[f.key] = f.value;
        // v2.6.0: Drawing settings card — apply to the drawing object and
        // notify the custom tool via its onSettings(drawing, settings) hook.
        if (sc.isDrawingCard && sc.drawing) {
          const d = sc.drawing;
          if (newSettings.color !== undefined) d.color = newSettings.color;
          if (newSettings.lineWidth !== undefined) d.lineWidth = +newSettings.lineWidth;
          // Merge remaining custom fields into the drawing
          for (const key in newSettings) {
            if (key === 'color' || key === 'lineWidth') continue;
            d[key] = newSettings[key];
          }
          const tool = this._customTools && this._customTools[d.type];
          if (tool && typeof tool.onSettings === 'function') {
            try { tool.onSettings(d, newSettings); } catch (e) {
              if (BADI_DEBUG) console.error('[BadiCharts] Tool onSettings error:', e);
            }
          }
          this.settingsCard = null;
          this.showToast('Tool settings saved');
        } else {
          this.setIndicatorSettings(sc.id, newSettings);
          this.settingsCard = null;
          this.showToast('Settings saved');
        }
      } else if (scHit.action === 'field') {
        // Cycle field value — for number/color
        const sc = this.settingsCard;
        const f = sc.fields[scHit.index];
        if (f.type === 'color') {
          // Cycle through preset colors
          const colors = ['#2962ff','#ff9800','#e91e63','#26a69a','#9c27b0','#ef5350','#7e57c2'];
          const idx = colors.indexOf(f.value);
          f.value = colors[(idx + 1) % colors.length];
          this.invalidate();
        } else {
          // v2.15.0 FIX: window.prompt() is blocking, unstyleable, breaks
          // headless/embedded usage and is blocked in some sandboxed iframes.
          // A small inline DOM <input> is overlaid exactly on the field box;
          // Enter/blur commits, Esc cancels. Requires a document (headless
          // callers keep the current value, same as prompt returning null).
          const fy = sc.y + 36 + scHit.index * 30;
          this._openFieldEditor(f, {
            x: sc.x + 90, y: fy, w: sc.w - 100, h: 20
          });
        }
      }
      return;
    }
    // Click outside settings card closes it
    if (this.settingsCard) {
      this.settingsCard = null;
      return;
    }

    // 1a-bis. v2.19.0: REPLAY playback bar click (overlay UI)
    if (this.replay.active && this.replay.showBar) {
      const rHit = this._hitReplayBar(x, y);
      if (rHit) {
        this._handleReplayClick(rHit);
        return;
      }
    }

    // 1b. Check drawing properties panel (if a drawing is selected)
    if (this.selectedDrawing && this._handleDrawPanelClick(x, y)) {
      return;  // click was on the panel, handled
    }

    // 2. Check indicator icons
    const iconHit = this._hitIcon(x, y);
    if (iconHit) {
      this._handleIconClick(iconHit.indId, iconHit.iconId);
      return;
    }
    // 3. Check indicator cards (click to activate)
    const cardHit = this._hitCard(x, y);
    if (cardHit) {
      this.activeIndicatorCard = this.activeIndicatorCard === cardHit ? null : cardHit;
      return;
    }

    const btn = this.hitButton(x, y);
    if (btn) { this.handleButtonClick(btn); return; }
    if (this.dropdown) {
      const item = this.hitDropdown(x, y);
      if (item) { this.handleDropdownSelect(item); this.dropdown = null; return; }
      if (x < this.dropdown.x || x > this.dropdown.x + this.dropdown.w ||
          y < this.dropdown.y || y > this.dropdown.y + this.dropdown.h) {
        this.dropdown = null; return;
      }
    }
    // v2.14.0 FIX (audit #43): clicking anywhere OUTSIDE the expanded indicator
    // card closes it — previously an expanded card could only be toggled by
    // clicking its own header again, and clicking empty space did nothing.
    if (this.activeIndicatorCard != null) {
      const stillOnCard = this._hitCard(x, y);
      const onIcon = this._hitIcon(x, y);
      if (!stillOnCard && !onIcon) this.activeIndicatorCard = null;
    }
    // v2.13.0: Pane separator resize — takes priority over pan so dragging a
    // divider doesn't also scroll the chart. Only the cursor tool can resize;
    // an active drawing tool ignores separators so clicks near them still
    // place drawings. The divider above pane[i] resizes pane[i] only.
    if (this.activeTool === 'cursor') {
      const paneId = this._hitPaneSeparator(x, y);
      if (paneId != null) {
        const pane = this._panes.find(p => p.id === paneId);
        if (pane) {
          this._paneResize = { paneId: paneId, startY: y, startH: pane.height };
          // Cancel any pending pan/draw state so we don't fight ourselves.
          this.isDragging = false;
          this._dragHandle = null;
          this._dragWhole = null;
          return;
        }
      }
    }
    if (this.activeTool === 'cursor') {
      if (this.inChartArea(x, y)) {
        // v2.7.0: Handle drag takes priority over body hit
        if (this.selectedDrawing) {
          const handle = this._hitDrawingHandle(x, y);
          if (handle) {
            this._dragHandle = {
              d: this.selectedDrawing, key: handle.key, ptIndex: handle.ptIndex,
              startX: x, startY: y, moved: false   // v2.22.1: drag threshold
            };
            return;
          }
        }
        // Check if clicking on a drawing (select + start whole-drag)
        const clickedDrawing = this.findDrawingAt(x, y);
        if (clickedDrawing && !clickedDrawing.locked) {
          this.selectDrawing(clickedDrawing);
          // v2.7.0: set up whole-drawing drag (drag the tool to another candle area)
          // v2.22.1: startX/startY/moved implement the TradingView-style
          // click-to-select vs drag-to-move threshold (3px).
          this._dragWhole = {
            d: clickedDrawing,
            startIdx: this.xToIndex(x),
            startPrice: this.yToPrice(y),
            snapshot: this._snapshotDrawing(clickedDrawing),
            startX: x, startY: y, moved: false
          };
          return;
        }
        // Click on empty area → deselect drawing + start pan
        this.deselectDrawing();
        this.isDragging = true;
        this.dragStartX = x;
        this.dragStartRightOffset = this.rightOffset;
      } else {
        this.deselectDrawing();
      }
    } else if (this.activeTool === 'eraser') {
      if (this.hoverDrawing) {
        this.drawings = this.drawings.filter(d => d !== this.hoverDrawing);
        this.hoverDrawing = null;
        this.showToast('Drawing deleted');
      }
    } else if (this.inChartArea(x, y)) {
      // v2.10.0: two-step drawing. A 2nd click on an armed preview PLACES the
      // drawing at that spot (it then stays there); polygon clicks add vertices.
      if (this.currentDrawing) {
        if (this.currentDrawing.type === 'poly') {
          this.addPolygonVertex(x, y);
        } else {
          this.finishDrawing();
        }
        return;
      }
      this._mouseDown = true;
      this._drawAnchor = { x, y };
      this._drawMoved = false;
      this.startDrawing(x, y);
    }
  }

  onMouseUp() {
    // v2.22.1 FIX (stuck drawing drag — the reported bug): _dragHandle and
    // _dragWhole were only ever cleared on the TOUCH path (onTouchEnd) and
    // on the mouse path NEVER — releasing the button did not let go. Once
    // you clicked a drawing to move it, it kept following the mouse forever
    // (and panning became impossible because onMouseMove checks
    // _dragWhole BEFORE isDragging). TradingView semantics: press → drag →
    // release DROPS the object at that spot, definitively.
    if (this._dragHandle || this._dragWhole) {
      this._dragHandle = null;
      this._dragWhole = null;
      try { this.canvas.style.cursor = ''; } catch (_) {}
      this.invalidate();
    }
    // v2.12.0: Pane separator drag end — finalize the user height and let the
    // cursor style revert on the next mousemove.
    if (this._paneResize) {
      this._paneResize = null;
      try { this.canvas.style.cursor = ''; } catch (_) {}
      this.invalidate();
    }
    if (this.isDragging) {
      this.isDragging = false;
      // v2.4.0+: Start momentum scrolling if the pan velocity is significant
      // v2.20.0: only if the flick was fast AND it started near a chart edge.
      if (this._shouldStartMomentum(this.dragStartX)) {
        this._momentum = { velocity: this._panVelocity, lastTime: performance.now() };
      }
      this._panVelocity = 0;
      this._lastPanTime = 0;
    }
    // v2.10.0: smart release for drawing tools
    const wasDrag = this._drawMoved;
    this._mouseDown = false;
    this._drawAnchor = null;
    if (this.currentDrawing) {
      if (this.currentDrawing.type === 'poly') return;   // waits for more clicks / dbl-click / Enter
      if (wasDrag) { this.finishDrawing(); return; }     // press-drag-release → place it
      // Simple click (no real drag): keep the preview armed so the user can
      // move the mouse and click a 2nd time to place it. A brush dot is
      // useless → discard it and teach the gesture.
      if (this.currentDrawing.type === 'brush') {
        this.currentDrawing = null;
        this._hintOnce('Drag to draw');
      }
    }
  }

  onMouseLeave() {
    this.mouseInside = false;
    this.crosshairIndex = null;
    this.hoverButton = null;
    // v2.10.0: do NOT finalize/cancel the pending drawing here anymore.
    // - A drag that leaves the canvas is finalized by the window-level mouseup.
    // - An armed "click → move → click" preview simply pauses and continues
    //   when the pointer re-enters. This fixes the chart freezing/losing the
    //   drawing when the pointer briefly leaves the canvas mid-gesture.
  }

  onWheel(e) {
    // v2.14.0: preventDefault() only AFTER the area check, so page scrolling
    // is never hijacked when the wheel crosses the canvas edge.
    // v2.15.0 FIX (regression): the zoom DIRECTION was inverted for the plain
    // wheel — scrolling UP (deltaY < 0) zoomed OUT. The original behavior
    // (wheel up = zoom in) is restored. ctrl+wheel (trackpad pinch) already
    // reported the natural sign, so BOTH cases now simply use -e.deltaY:
    //   wheel up  (deltaY < 0) → delta > 0 → factor > 1 → zoom IN
    //   pinch out (ctrl+wheel, deltaY < 0) → delta > 0 → zoom IN
    // v2.16.0 FIX (#14): Firefox reports wheel in "lines" mode (deltaMode=1,
    // deltaY=±3 per notch) instead of pixels (deltaMode=0, deltaY=±100).
    // Without normalization the exp curve produced factor = exp(3×0.002) ≈
    // 0.6% zoom per notch on Firefox vs ~22% on Chrome — zoom was nearly
    // disabled. We multiply by 33 (the spec'd "one line ≈ 33px" heuristic,
    // matching Firefox's own internal conversion) when deltaMode is 1, and
    // by ~1.0 when deltaMode is 2 (pages, rare for chart canvases).
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (!this.inChartArea(x, y) && !this.inPriceAxis(x, y)) return;  // no hijack outside the chart
    e.preventDefault();
    this._touchInteract();   // v2.15.0: bypass the rebuild budget while zooming
    // Normalize deltaMode to PIXEL units.
    const dm = (typeof e.deltaMode === 'number') ? e.deltaMode : 0;
    const modeFactor = (dm === 1) ? 33 : (dm === 2) ? 800 : 1;
    let rawDX = (e.deltaX || 0) * modeFactor;
    let rawDY = (e.deltaY || 0) * modeFactor;
    // Horizontal wheel / shift+wheel = pan instead of zoom.
    // v2.15.0: same "content follows the pointer" metaphor as mouse-drag
    // panning (drag right reveals the past, deltaX > 0 does the same).
    if (Math.abs(rawDX) > Math.abs(rawDY)) {
      const panBars = rawDX * 0.05;
      this.rightOffset -= panBars;
      this.constrainRightOffset();
      this.autoScale();
      this.invalidate();
      return;
    }
    let delta = -rawDY;   // v2.15.0: wheel up = zoom in (was inverted in v2.14.0)
    // Exponential curve: one notch (~100) ≈ +22%, clamped per event so a huge
    // fling can't jump more than ~65% in one step.
    const factor = Math.exp(clamp(delta, -240, 240) * 0.002);
    const oldSpacing = this.barSpacing;
    let newSpacing = clamp(oldSpacing * factor, this.minBarSpacing, this.maxBarSpacing);
    if (newSpacing === oldSpacing) return;

    // ZOOM TOWARD CURSOR — keep the candle under the cursor at the same x.
    // Derivation:
    //   x_at_index(i) = chartRight - (N-1 - i + rightOffset) * barSpacing
    // For idx under cursor to stay at same x after barSpacing changes:
    //   (N-1 - idx + rightOffset_new) * newSpacing = (N-1 - idx + rightOffset_old) * oldSpacing
    // where N = candles.length, idx = xToIndex(x) computed with OLD spacing.
    const N = this.sim.candles.length;
    const idx = this.xToIndex(x);  // fractional index under cursor (using old spacing)
    const distFromRightOld = this.chartRight - x;  // pixels from cursor to right edge
    this.barSpacing = newSpacing;
    this.rightOffset = distFromRightOld / newSpacing - (N - 1 - idx);
    this.constrainRightOffset();
    this.invalidateTimeMarks();
    this.autoScale();
  }

  onRightClick(e) {
    // v2.10.0: right-click while a drawing preview is pending → cancel it
    if (this.currentDrawing) {
      this.currentDrawing = null;
      this._drawAnchor = null;
      // v2.14.0 FIX (audit #44): setTool() instead of a direct assignment so
      // onToolChange fires.
      this.setTool('cursor');
      this.showToast('Drawing cancelled');
      return;
    }
    // v2.14.0 FIX (audit #10): right-click deletes a drawing — hoverDrawing
    // is only populated in eraser mode, so the old branch was dead for users
    // of the normal cursor tool.
    // v2.15.0 FIX (regression): right-clicking ANYWHERE deleted the currently
    // selected drawing even when it was on the other side of the chart. The
    // click position is hit-tested first (findDrawingAt); only a drawing
    // under the cursor is deleted. Clicking empty space keeps the selection.
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const target = this.findDrawingAt(x, y) ||
                   (this.activeTool === 'eraser' ? this.hoverDrawing : null);
    if (target) {
      this.drawings = this.drawings.filter(d => d !== target);
      if (this.hoverDrawing === target) this.hoverDrawing = null;
      this.deselectDrawing();
      this.showToast('Drawing deleted');
      this.invalidate();
      return;
    }
    if (this.activeTool !== 'cursor') {
      // v2.14.0 FIX (audit #44): setTool() so onToolChange fires.
      this.setTool('cursor');
      this.showToast('Cursor tool');
    }
  }

  // v2.10.0: double-click closes an in-progress polygon (trailing duplicate
  // vertices added by the two clicks are removed in finishDrawing()).
  onDblClick(e) {
    // v2.13.0: double-click on a pane separator → reset THAT pane's height
    // to auto (other panes keep their user-set heights). Quick and intuitive.
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const paneId = this._hitPaneSeparator(x, y);
    if (paneId != null) {
      if (this._paneHUsers[paneId] != null) {
        delete this._paneHUsers[paneId];
        this.updateLayout();
        this.autoScale();
        this.invalidate();
        this.showToast('Pane height reset');
      }
      return;
    }
    // v2.16.0 (#21): double-click on a TEXT drawing opens an inline DOM
    // editor for its text. Enter / blur commits; Escape cancels. The old
    // behavior (since v2.14.0 removed the prompt) left text drawings
    // permanently stuck at their default "Text N" label with no way to edit.
    const hitText = this.findDrawingAt(x, y);
    if (hitText && hitText.type === 'text') {
      this._openTextEditor(hitText);
      return;
    }
    if (this.currentDrawing && this.currentDrawing.type === 'poly') {
      this.finishDrawing();
    }
  }

  // v2.16.0 (#21): inline DOM editor for a text drawing's label. Same look
  // + commit semantics as the settings-card field editor (Enter/blur commit,
  // Escape cancels). The editor is positioned over the drawing's anchor.
  _openTextEditor(drawing) {
    if (typeof document === 'undefined') return;
    this._closeFieldEditor(false);
    const idx = this._drawingIdxAt(drawing, 'i');
    const ax = this.indexToX(idx);
    const ay = this.priceToY(drawing.p);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = drawing.text || '';
    input.setAttribute('data-badi-text-editor', '1');
    const hostRect = this.canvas.getBoundingClientRect();
    const s = input.style;
    s.position = 'fixed';
    s.left = (hostRect.left + ax) + 'px';
    s.top = (hostRect.top + ay - 18) + 'px';
    s.minWidth = '120px';
    s.height = '20px';
    s.boxSizing = 'border-box';
    s.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    s.background = this.theme.cardBg || '#1e222d';
    s.color = this.theme.textBright || '#d1d4dc';
    s.border = '1px solid ' + (this.theme.accent || '#2962ff');
    s.borderRadius = '3px';
    s.padding = '0 4px';
    s.outline = 'none';
    s.zIndex = '2147483000';
    s.margin = '0';
    const self = this;
    let done = false;
    const commit = function () {
      if (done) return;
      done = true;
      const v = input.value;
      if (typeof v === 'string' && v.trim() !== '') drawing.text = v;
      self._closeFieldEditor();
    };
    const cancel = function () {
      if (done) return;
      done = true;
      self._closeFieldEditor();
    };
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); commit(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
      ev.stopPropagation();
    });
    input.addEventListener('blur', commit);
    document.body.appendChild(input);
    input.focus();
    input.select();
    this._fieldEditor = input;
    this.invalidate();
  }

  // v2.13.0: hit-test for ANY pane separator. Returns the paneId whose
  // separator (top edge) is within ±6 CSS pixels of (x, y), or null. Each pane
  // has its own divider at its top edge; the topmost pane's divider sits
  // between the price area and pane[0], the next between pane[0] and pane[1],
  // etc. Dragging a divider resizes the pane BELOW it.
  _hitPaneSeparator(x, y) {
    if (this._panes.length === 0) return null;
    if (x < 0 || x > this.W) return null;
    for (const pane of this._panes) {
      if (y < pane.top - 6 || y > pane.top + 6) continue;
      return pane.id;
    }
    return null;
  }

  onKeyDown(e) {
    // v2.14.0 FIX (audit #12): keyboard shortcuts used to fire GLOBALLY —
    //   - while the user typed in any <input>/<textarea>/contentEditable
    //     (pressing "r" inside a search box reset the chart view!),
    //   - while Ctrl/Meta/Alt was held (Ctrl+R reload became "reset + reload",
    //     Ctrl+- browser-zoomed AND chart-zoomed),
    //   - on EVERY chart instance at once (multi-chart pages reset together).
    // Guards: skip form fields, skip modified keys, and only act when this
    // canvas is the hovered/last-touched chart.
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
              t.tagName === 'SELECT' || t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Multi-chart guard: only the chart the user last hovered/touched reacts.
    if (_lastActiveChartInstance && _lastActiveChartInstance !== this) return;
    if (e.key === 'r' || e.key === 'R') { this.resetView(); }
    if (e.key === '+' || e.key === '=') this.zoomAtCenter(1.1);
    if (e.key === '-' || e.key === '_') this.zoomAtCenter(1/1.1);
    // v2.19.0: REPLAY keyboard shortcuts (only while replay mode is active)
    if (this.replay.active) {
      if (e.key === ' ') {
        e.preventDefault();
        if (this.replay.playing) this.replayPause(); else this.replayPlay();
        return;
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); this.replayStep(1); return; }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); this.replayStep(-1); return; }
      if (e.key === 'Escape') {
        this.currentDrawing = null;
        this._drawAnchor = null;
        this.setTool('cursor');
        this.dropdown = null;
        this.deselectDrawing();
        this.stopReplay();
        return;
      }
    }
    if (e.key === 'Escape') {
      // v2.10.0: cancel pending preview (with feedback), then deselect
      if (this.currentDrawing) this.showToast('Drawing cancelled');
      this.currentDrawing = null;
      this._drawAnchor = null;
      // v2.22.1: also drop any in-progress drawing drag (safety net — e.g.
      // the user presses Esc while a whole/handle drag is in flight).
      this._dragHandle = null;
      this._dragWhole = null;
      // v2.14.0 FIX (audit #44): go through setTool() so onToolChange fires
      // (a direct activeTool assignment silently bypassed the callback and
      // desynced external UIs).
      this.setTool('cursor');
      this.dropdown = null;
      this.deselectDrawing();
    }
    // v2.10.0: Enter finishes a multi-point polygon
    if (e.key === 'Enter' && this.currentDrawing && this.currentDrawing.type === 'poly') {
      this.finishDrawing();
    }
    // v2.14.0 FIX (audit #10): Delete/Backspace now deletes the SELECTED
    // drawing (the reliable path) — the old code only deleted hoverDrawing,
    // which is only ever set in eraser mode, so the shortcut was dead in
    // practice. Touch users delete via the selected drawing's panel button.
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const target = this.selectedDrawing || this.hoverDrawing;
      if (target) {
        this.drawings = this.drawings.filter(d => d !== target);
        if (this.hoverDrawing === target) this.hoverDrawing = null;
        this.deselectDrawing();
        this.showToast('Drawing deleted');
        this.invalidate();
      }
    }
  }

  zoomAtCenter(factor) {
    // Same derivation as onWheel, but anchor at chart center
    const cx = (this.chartLeft + this.chartRight) / 2;
    const oldSpacing = this.barSpacing;
    let newSpacing = clamp(oldSpacing * factor, this.minBarSpacing, this.maxBarSpacing);
    if (newSpacing === oldSpacing) return;
    const N = this.sim.candles.length;
    const idx = this.xToIndex(cx);
    const distFromRight = this.chartRight - cx;
    this.barSpacing = newSpacing;
    this.rightOffset = distFromRight / newSpacing - (N - 1 - idx);
    this.constrainRightOffset();
    this.invalidateTimeMarks();
    this.autoScale();
  }

  resetView() {
    this.barSpacing = 8;
    this.rightOffset = 4;
    this.constrainRightOffset();
    this.invalidateTimeMarks();
    this.autoScale();
    // v2.11.0: no built-in toast here. resetView() is also called by setData()
    // at every data load — the toast made the chart render at 60fps for its
    // full 2.2s lifetime right after startup (and headless hosts own their UX
    // feedback anyway). The explicit UI action path (below) still toasts.
  }

  // Constrain rightOffset so the chart cannot be scrolled too far away from data.
  // - Maximum rightOffset: allows up to ~50% of visible width as empty space on right
  // - Minimum rightOffset: keeps at least ~50% of visible width showing actual data
  constrainRightOffset() {
    // Free scrolling — allow dragging freely in both directions (past and future).
    // Like TradingView, the user can scroll as far as they want.
    // The only limit: don't allow scrolling so far that the chart is completely empty
    // (at least keep some context visible). We allow up to 10x the visible width
    // of empty space on either side.
    const visibleBars = (this.chartRight - this.chartLeft) / this.barSpacing;
    const N = this.sim.candles.length;
    const maxEmpty = visibleBars * 10;  // generous limit — 10 screen widths of empty space
    // Right side (future): rightOffset can go up to maxEmpty
    // Left side (past): rightOffset can go down to -(N - 1) - maxEmpty
    const maxRight = maxEmpty;
    const minRight = -(N - 1) - maxEmpty;
    if (this.rightOffset > maxRight) this.rightOffset = maxRight;
    if (this.rightOffset < minRight) this.rightOffset = minRight;
  }

  /* --------------------------- Coordinate Helpers ------------------------ */
  inChartArea(x, y) {
    return x >= this.chartLeft && x <= this.chartRight &&
           y >= this.chartTop && y <= this.chartBottom;
  }
  inPriceAxis(x, y) {
    return x > this.chartRight && x <= this.W &&
           y >= this.chartTop && y <= this.chartBottom;
  }

  // Convert candle index to x (media coords)
  indexToX(i) {
    // i can be fractional; rightmost candle = (length - 1); x of its center = chartRight - rightOffset*barSpacing
    return this.chartRight - (this.sim.candles.length - 1 - i + this.rightOffset) * this.barSpacing;
  }
  xToIndex(x) {
    return (this.sim.candles.length - 1 + this.rightOffset) - (this.chartRight - x) / this.barSpacing;
  }

  // Price → Y (within price chart area)
  priceToY(p) {
    return this.priceTop + this.priceScale.logicalToCoordinate(p, 0);
  }
  yToPrice(y) {
    return this.priceScale.coordinateToLogical(y - this.priceTop, 0);
  }
  volToY(v) {
    return this.volTop + this.volScale.logicalToCoordinate(v, 0);
  }

  /* --------------------------- Time Weights ------------------------------ */
  // v2.14.0: computeTimeWeights() DELETED — it was pure dead work on every
  // data update: O(N) with 2 Date allocations per candle + 1000 unshift/push
  // ops, producing _timePoints that NOTHING ever read (getTimeMarks() builds
  // its own marks directly from _timeAtIndex). The time axis is unchanged.
  invalidateTimeMarks() { this._timeMarksCache = null; }

  getTimeMarks() {
    // v2.15.0: this method was called up to 3× per frame (drawTimeAxis,
    // drawPane, background) and REBUILT the mark array every time. The result
    // is now cached in _timeMarksCache; autoScale() clears it whenever the
    // viewport or data changes, so all call sites within one frame share
    // exactly one build.
    if (this._timeMarksCache) return this._timeMarksCache;
    const visibleBars = Math.ceil((this.chartRight - this.chartLeft) / this.barSpacing);
    const firstIdx = Math.floor(this.xToIndex(this.chartLeft));
    const lastIdx = Math.ceil(this.xToIndex(this.chartRight));
    const tfSec = (this.timeframe.ms || 60000) / 1000;
    // v2.20.4: TIME-ANCHORED marks (was INDEX-anchored). When a new candle
    // was appended at the live edge, the old INDEX-anchored formula
    // (startMark = ceil(firstIdx / stepInBars) * stepInBars) caused ALL marks
    // to suddenly jump by `stepInBars` bars whenever firstIdx crossed a step
    // boundary — visible as a jarring "strange movement" in the time axis +
    // vertical gridlines. Now marks are anchored to natural TIME boundaries
    // (epoch multiples of a "nice" seconds step), so they glide smoothly by
    // 1 bar per new candle. See chart-webgl.js getTimeMarks for the full
    // rationale + the nice-time-step table.
    const firstTime = this._timeAtIndex(firstIdx);
    const lastTime = this._timeAtIndex(lastIdx);
    const spanSec = Math.max(1, lastTime - firstTime);
    const niceTimeSteps = [
      60, 120, 300, 900, 1800, 3600, 7200, 14400, 21600, 43200,
      86400, 172800, 604800, 1209600, 2592000, 7776000, 15552000, 31536000
    ];
    const targetStepSec = spanSec / 10;
    let stepSec = niceTimeSteps.find(s => s >= targetStepSec);
    if (!stepSec) stepSec = Math.ceil(targetStepSec / 31536000) * 31536000;
    if (stepSec < tfSec) stepSec = tfSec;
    const startMarkTime = Math.ceil(firstTime / stepSec) * stepSec;
    const marks = [];
    const firstCandleTime = this.sim.candles.length > 0 ? this.sim.candles[0].time : 0;
    for (let t = startMarkTime; t <= lastTime + stepSec; t += stepSec) {
      if (t <= 0) continue;
      const idx = (t - firstCandleTime) / tfSec;
      if (idx < firstIdx - 1 || idx > lastIdx + 1) continue;
      const prevT = t - tfSec;
      const w = assignTimeWeight(prevT, t);
      marks.push({ index: idx, time: t, weight: w });
    }
    this._timeMarksCache = marks;
    return marks;
  }

  /* --------------------------- Auto Scale -------------------------------- */
  autoScale() {
    this.invalidate();   // v2.11.0: any scale change must schedule a repaint
    // v2.15.0: choke point for the time-marks cache — every pan/zoom/resize/
    // data change flows through here, and marks are rebuilt lazily on the
    // next getTimeMarks() call (once per frame, see getTimeMarks()).
    this._timeMarksCache = null;
    // If no data, set a safe default range and skip
    if (this.sim.candles.length === 0) {
      this.priceScale.setRange(0, 1);
      return;
    }
    // Determine visible candle range
    const firstIdx = Math.max(0, Math.floor(this.xToIndex(this.chartLeft)));
    const lastIdx = Math.min(this.sim.candles.length - 1, Math.ceil(this.xToIndex(this.chartRight)));
    let min = Infinity, max = -Infinity;
    let minVol = Infinity, maxVol = -Infinity;
    for (let i = firstIdx; i <= lastIdx; i++) {
      const c = this.sim.candles[i];
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
      if (c.volume < minVol) minVol = c.volume;
      if (c.volume > maxVol) maxVol = c.volume;
    }
    // HEADLESS v2.1.0+: include overlay indicator values in price scaling
    // v2.14.0 (audit #29): an indicator can opt OUT via
    // `includeInAutoScale: false` in its definition — a far-ranging overlay
    // (e.g. a custom oscillator plotted as overlay) used to crush the candles
    // into a sliver. Default is true (unchanged behavior).
    for (const id of this.activeIndicators) {
      const state = this.indicatorStates.get(id);
      if (!state || !state.def || state.def.type !== 'overlay') continue;
      if (state.visible === false) continue;
      if (state.def.includeInAutoScale === false) continue;
      const values = this.indCache[id];
      if (!values) continue;
      // If the indicator returns an array of numbers, include them in the range.
      // Objects per bar are covered by the getRange() hook below (v2.11.0).
      if (Array.isArray(values)) {
        for (let i = firstIdx; i <= lastIdx; i++) {
          const v = values[i];
          if (v !== null && v !== undefined && typeof v === 'number') {
            if (v > max) max = v;
            if (v < min) min = v;
          }
        }
      }
      // v2.11.0: getRange(values, settings) hook — an indicator whose values
      // are NOT plain numbers (objects per bar, multi-band arrays, ...) can
      // contribute its own price range so its drawing NEVER falls outside the
      // visible scale (a classic "parts of my indicator disappear" cause:
      // autoScale ignored non-array values → the clip cut them off).
      // v2.14.0 (audit #51): the result is cached per (dataVersion, settings)
      // — getRange used to run on EVERY autoScale (i.e. every mousemove
      // during a drag), a hidden O(N) cost per frame for heavy indicators.
      // v2.16.0 (#11): cache key uses _contentVersion (not _dataVersion) so a
      // pure forming-candle tick doesn't invalidate the range. Same semantics
      // as the indicator stamp.
      if (typeof state.def.getRange === 'function') {
        try {
          const cacheKey = this._contentVersion + '|' + this._safeSettingsKey(state);
          if (state._rangeCache && state._rangeCache.key === cacheKey) {
            var r = state._rangeCache.value;
          } else {
            var r = state.def.getRange(values, state.settings);
            state._rangeCache = { key: cacheKey, value: r };
          }
          if (r && isFinite(r.min) && isFinite(r.max)) {
            if (r.min < min) min = r.min;
            if (r.max > max) max = r.max;
          }
        } catch (e) { /* range hook must never break autoScale */ }
      }
    }
    for (const d of this.drawings) {
      // v2.14.0 (audit #29): drawings can opt out too — set
      // drawing.includeInAutoScale = false on a far-away hline.
      if (d.type === 'hline' && d.includeInAutoScale !== false) {
        if (d.price < min) min = d.price;
        if (d.price > max) max = d.price;
      }
    }
    // v2.14.0 FIX (audit #29a): the flat-case fallback used ±1 ABSOLUTE — on
    // a 0.0001-precision asset that jumped the scale to -1..1 and the candles
    // vanished into a sub-pixel sliver. Now RELATIVE to the price level.
    if (!isFinite(min) || !isFinite(max) || min === max) {
      const m0 = isFinite(min) ? min : (isFinite(max) ? max : 0);
      const flatPad = Math.max(Math.abs(m0) * 0.0005, 1e-9);
      min = m0 - flatPad;
      max = m0 + flatPad;
      if (min === max) { min -= flatPad; max += flatPad; }
    }
    // v2.12.0: RANGE-FLOOR — when the visible range is extremely tight (e.g.
    // only one candle in view, or a flat-tick market), the scale marks computed
    // from it can flip between two adjacent tick spans on every mousemove,
    // making the horizontal grid lines vibrate by 1px. Expand any range below
    // 0.0001% of the midpoint to a minimum width so the mark builder picks a
    // stable span. The candle bodies still render correctly because the scale
    // simply has more headroom.
    const span = max - min;
    const mid = (max + min) / 2;
    const minSpan = Math.max(Math.abs(mid) * 1e-6, 1e-9);
    if (span < minSpan) {
      min = mid - minSpan / 2;
      max = mid + minSpan / 2;
    }
    this.priceScale.setRange(min, max);
    this.priceScale.rebuildMarks();

    // Volume scale (0 to maxVol)
    // v2.14.0 FIX (audit #34a): an all-zero volume dataset left maxVol at 0
    // (or -Infinity) → empty scale → columns drawn at FULL height. Floor to
    // a sane 0..1 range when there is no real volume.
    if (isFinite(maxVol) && maxVol > 0) {
      this.volScale.setRange(0, maxVol * 1.1);
    } else {
      this.volScale.setRange(0, 1);
    }
    this.volScale.rebuildMarks();

    // HEADLESS v2.13.0: MULTI-PANE — each pane indicator gets its OWN scale,
    // built from THAT indicator's values + getRange(). All panes share the
    // time axis with the price area (panning/zooming stay smooth).
    for (const pane of this._panes) {
      const state = this.indicatorStates.get(pane.id);
      if (!state || !state.def) continue;
      const values = this.indCache[pane.id];
      let pMin, pMax;
      if (typeof state.def.getRange === 'function') {
        try {
          const r = state.def.getRange(values, state.settings);
          pMin = r.min; pMax = r.max;
        } catch (e) { pMin = 0; pMax = 100; }
      } else if (Array.isArray(values)) {
        // Auto-range from values
        pMin = Infinity; pMax = -Infinity;
        for (let i = firstIdx; i <= lastIdx; i++) {
          const v = values[i];
          if (v !== null && v !== undefined && typeof v === 'number') {
            if (v < pMin) pMin = v;
            if (v > pMax) pMax = v;
          }
        }
      } else if (values && typeof values === 'object') {
        // v2.15.0: multi-series objects ({macd:[], signal:[], hist:[]}) —
        // scan every numeric array member. Previously anything that was not
        // a plain array fell into the 0..100 fallback, so a MACD on a forex
        // symbol (values ±0.003) was "graded" on 0..100 and showed 0.0-style
        // labels nowhere near its data.
        pMin = Infinity; pMax = -Infinity;
        for (const key of Object.keys(values)) {
          const arr = values[key];
          if (!Array.isArray(arr)) continue;
          for (let i = firstIdx; i <= lastIdx && i < arr.length; i++) {
            const v = arr[i];
            if (v !== null && v !== undefined && typeof v === 'number' && isFinite(v)) {
              if (v < pMin) pMin = v;
              if (v > pMax) pMax = v;
            }
          }
        }
      } else {
        pMin = 0; pMax = 100;
      }
      if (!isFinite(pMin)) { pMin = -1; pMax = 1; }
      if (pMin === pMax) { pMin -= 1; pMax += 1; }
      const pad = (pMax - pMin) * 0.1;
      if (!pane.scale) {
        pane.scale = new PriceScale({scaleMargins: {top: 0.12, bottom: 0.08}, base: 100});
      }
      pane.scale.setHeight(pane.height || 100);
      pane.scale.setRange(pMin - pad, pMax + pad);
      // v2.15.0 FIX (regression): the pane formatter was built as
      // PriceFormatter(pBase, pDecimals) — pDecimals was misused as minMove,
      // so pDecimals < 10 rounded every label to even values or "0" (MACD on
      // forex ALWAYS showed 0) and pDecimals >= 1000 produced "n/a". The LWC
      // contract is base = 10^decimals with minMove = 1, and the PriceScale
      // base must match so tick spans grade at 10^-decimals multiples.
      const pSpan = Math.max(1e-12, pMax - pMin);
      let pDec = 0;
      if (pSpan < 1) pDec = clamp(Math.ceil(-Math.log10(pSpan)) + 2, 2, 8);
      else if (pSpan < 10) pDec = 2;
      else if (pSpan < 1000) pDec = 1;
      const pBase = Math.pow(10, pDec);
      pane.scale.setBase(pBase);                              // v2.15.0: was fixed 100 → no grading for small values
      pane.scale.setFormatter(new PriceFormatter(pBase, 1));  // v2.15.0: (10^dec, 1) contract
      pane.scale.rebuildMarks();
    }
    // Legacy: this.paneScale points to _panes[0].scale (or null if no panes).
    this.paneScale = (this._panes.length > 0 && this._panes[0].scale) ? this._panes[0].scale : null;
  }

  /* --------------------------- Indicator Cache --------------------------- */
  // Calls each active indicator's calculate(candles, settings) function and
  // stores the result in indCache[id]. Indicators without calculate() are skipped.
  computeIndicators() {
    this.indCache = {};
    const candles = this.sim.candles;
    for (const id of this.activeIndicators) {
      const state = this.indicatorStates.get(id);
      if (!state || !state.def || typeof state.def.calculate !== 'function') continue;
      try {
        const result = state.def.calculate(candles, state.settings);
        // v2.12.0: ASYNC-CALCULATE GUARD. If calculate() returns a Promise
        // (because the user declared it `async` or returned a thenable), the
        // chart can't await it — feeding a Promise into render() would produce
        // garbage frames and the indicator would "disappear" intermittently
        // as the Promise resolves into a stale state. Detect and flag once,
        // then keep indCache[id] = null so the auto-retry path keeps probing
        // for a synchronous result if the user fixes their code at runtime.
        if (result && typeof result === 'object' && typeof result.then === 'function') {
          this.indCache[id] = null;
          const err = new Error('calculate() must be synchronous — got a Promise. Use setData() + chart.invalidate() when async data arrives.');
          state._lastCalcError = err;
          state._lastCalcTry = performance.now();
          this._flagIndicatorError(id, state, err, 'calculate()');
          continue;
        }
        this.indCache[id] = result;
        // v2.14.0 FIX (audit #47): calculate() returning null/undefined means
        // "no data YET" (e.g. not enough warm-up bars) — that is NOT an error.
        // Clear any stale error flag so the "!" badge doesn't linger.
        this._clearIndicatorError(state);
      } catch (e) {
        this.indCache[id] = null;
        state._lastCalcError = e;
        state._lastCalcTry = performance.now();  // v2.11.0: start retry cooldown
        this._flagIndicatorError(id, state, e, 'calculate()'); // v2.8.0: visible, not silent
      }
    }
    // v2.14.0 FIX (audit #14c): the scene version was bumped here on EVERY
    // data update — invalidating EVERY indicator's offscreen cache on every
    // single tick (a hidden rebuild storm at 60fps with live data). Data
    // changes now invalidate caches through _dataVersion in the stamp
    // instead. Manual invalidation is still available via invalidateScene().
  }

  /* ----------------- User-code sandbox (v2.8.0) ------------------------- */
  // Custom indicator render()/calculate() run with try/catch + a canvas state
  // guard (save/restore). A buggy or heavy user indicator can no longer:
  //   - leak a transform/clip/alpha/shadow that visually "moves" the chart
  //   - leave a half-drawn frame (e.g. buy arrows drawn, sell arrows missing
  //     because the code threw mid-loop and the old catch swallowed it)
  //   - kill the render loop
  // Errors are ALWAYS logged (not only in debug mode), shown once as a toast,
  // and flagged with a red "!" badge on the indicator card until recovery.
  _flagIndicatorError(id, state, e, phase) {
    state._errFlag = true;
    if (!state._errLogged) {
      state._errLogged = true;
      const label = (state.def && state.def.label) ? state.def.label : id;
      try { console.error('[BadiCharts] Indicator "' + label + '" ' + phase + ' error:', e); } catch (_) {}
      this.showToast('Indicator "' + label + '" ' + phase + ' error — see console (F12)');
    }
  }
  _clearIndicatorError(state) {
    state._errFlag = false;
    state._errLogged = false;
  }
  // Safely render ONE indicator (v2.11.0): auto-retries a failed calculate(),
  // renders into a PER-INDICATOR OFFSCREEN CACHE that is rebuilt only when
  // the indicator's inputs change (data / range / scale / size / settings /
  // theme), and blits the cached bitmap. A heavy multi-color indicator now
  // costs one drawImage per frame during hover — the chart can't jitter.
  // Animated indicators (def.animated === true) bypass the cache.
  _safeRenderIndicator(id, state, helpers) {
    const ctx = this.ctx;
    // v2.14.0 FIX (audit #9b): hard visible guard — callers filter too, but a
    // hidden indicator must NEVER render (previously a pane indicator could
    // still be drawn from a stale layout before updateLayout() ran).
    if (state.visible === false) return;
    // v2.11.0: AUTO-RETRY — if calculate() failed transiently (returned null or
    // threw on one update), retry it every ~0.7s instead of hiding the
    // indicator forever. Deterministic failures stay flagged (logged once).
    if (typeof state.def.calculate === 'function' && this.indCache[id] == null) {
      const now = performance.now();
      if (!state._lastCalcTry || now - state._lastCalcTry > 700) {
        state._lastCalcTry = now;
        try {
          const v = state.def.calculate(this.sim.candles, state.settings);
          // v2.12.0: same async-Promise guard as computeIndicators() — the
          // auto-retry path could otherwise store a Promise as the value.
          if (v != null && !(typeof v === 'object' && typeof v.then === 'function')) {
            this.indCache[id] = v;
            this._clearIndicatorError(state);
          } else if (v && typeof v === 'object' && typeof v.then === 'function') {
            // Promise again — keep the cooldown so we don't spin the CPU.
            state._lastCalcError = new Error('calculate() must be synchronous — got a Promise.');
            this._flagIndicatorError(id, state, state._lastCalcError, 'calculate()');
          } else {
            // v2.14.0 FIX (audit #47): null = "not enough data yet" — not an
            // error. Don't flag/toast; the retry cooldown handles it quietly.
            this._clearIndicatorError(state);
          }
        } catch (e) { /* episode already logged by _flagIndicatorError */ }
      }
    }
    if (typeof state.def.calculate === 'function' && this.indCache[id] == null) {
      // Still broken — don't feed null values into user code; drop any cached
      // output so the retry result is picked up as soon as it succeeds.
      const stale = this._indCache2.get(id);
      if (stale) stale.stamp = null;
      if (state._lastCalcError) {
        // Only flag when there was an actual THROWN error. A plain null
        // result (audit #47) is a quiet "waiting for data", not a failure.
        this._flagIndicatorError(id, state, state._lastCalcError, 'render');
      }
      return;
    }

    // v2.11.0: self-animated indicators opt out of the cache — their render()
    // typically depends on time and must run every frame (loop stays awake).
    if (state.def.animated === true) {
      // v2.18.0: thread _currentRenderState + reset state._mainDraws so
      // drawOnMain() callbacks registered during this render replace the
      // previous frame's set (animated indicators re-register every frame).
      this._currentRenderState = state;
      state._mainDraws = [];
      ctx.save();
      try {
        state.def.render(ctx, this.indCache[id], helpers, state.settings, state);
        this._clearIndicatorError(state);
      } catch (e) {
        this._flagIndicatorError(id, state, e, 'render()');
      } finally {
        ctx.restore();  // discard any leaked transform / clip / alpha / shadow
        this._fixCanvasWreck();   // user code may have resized the bitmap
        this._currentRenderState = null;   // v2.18.0: always clear, even on throw
      }
      return;
    }

    // ---------- per-indicator offscreen cache (v2.11.0) ----------
    // v2.12.0: per-frame rebuild budget (max 2 rebuilds per rAF tick) to keep
    // a cold-start burst (window resize / bulk setData / theme switch) from
    // hitching.
    //
    // v2.14.0 FIX (audit #14a): the budget caused VISIBLE CORRUPTION during
    // pan/zoom — dragging changes barSpacing every frame → every stamp
    // changes → with a budget of 2, the 3rd+ indicators kept showing their
    // OLD bitmaps (drawn one frame behind = drawn offset / lagging). Correct-
    // ness beats micro-smoothness: while the user is actively interacting
    // (pan / handle drag / whole-drawing drag / pane resize) the budget is
    // BYPASSED so every indicator rebuilds in the same frame it changed.
    // The budget still protects cold-start bursts when nothing is moving.
    //
    // v2.16.0 FIX (#10): the offscreen canvas used to be sized to the FULL
    // screen (W×H×DPR). On a 4K monitor at dpr=2 that is 3840×2160×4 ≈ 33MB
    // PER INDICATOR — a chart with 8 indicators held ~250MB of GPU memory
    // for bitmaps that mostly drew into a 600×400 price area. The bitmap is
    // now sized to the indicator's actual render REGION (overlay → price
    // area, pane → that pane's rect, volume → volume strip) and translated
    // back to screen coords at blit time. Same correctness, ~5-10× less RAM.
    const region = this._indicatorRegion(id, state);
    const pxW = Math.max(1, Math.floor(region.w * this.dpr));
    const pxH = Math.max(1, Math.floor(region.h * this.dpr));
    const stamp = this._indicatorStamp(id, state);
    let entry = this._indCache2.get(id);
    if (!entry) {
      const oc = document.createElement('canvas');
      entry = { canvas: oc, octx: oc.getContext('2d'), stamp: null, ok: false, failCount: 0, cooldownUntil: 0, region: null };
      this._indCache2.set(id, entry);
      this._evictIndicatorCache();
    }
    const regionChanged = !entry.region ||
      entry.region.x !== region.x || entry.region.y !== region.y ||
      entry.region.w !== region.w || entry.region.h !== region.h;
    const needsRebuild = entry.stamp !== stamp || entry.canvas.width !== pxW || entry.canvas.height !== pxH || regionChanged;
    // v2.15.0 FIX (regression): "interacting" covered only mouse/touch DRAG
    // states — wheel zoom, pinch zoom and momentum changed barSpacing every
    // frame WITHOUT setting any of them, so the 2-rebuild budget applied and
    // indicators 3+ kept showing bitmaps one frame behind (visible lag).
    // Fast interactions now open a 400ms budget-bypass window (_interactUntil).
    const interacting = this.isDragging || !!this._dragHandle || !!this._dragWhole ||
      !!this._paneResize || performance.now() < this._interactUntil;
    // v2.17.1: AREA-based budget (see constructor). Full-screen-area reference
    // is computed once per indicator; the deferred path is unchanged.
    const screenArea = Math.max(1, this.W * this.H * this.dpr * this.dpr);
    const bitmapArea = pxW * pxH;
    const budgetExhausted = !interacting && (
      (this._frameRebuildArea + bitmapArea) > screenArea * this._REBUILD_AREA_FACTOR ||
      this._frameRebuilds >= this._MAX_FRAME_REBUILDS);
    // v2.14.0 FIX (audit #14d): a persistently FAILING render retried every
    // frame FOREVER (stamp=null → needsRebuild → invalidate → 60fps loop).
    // Now: after 3 consecutive failures the indicator cools down for 5s and
    // stops waking the loop. Recovery is automatic (cooldown expiry or a
    // data/theme change bumps the stamp and resets the counter).
    const cooling = entry.cooldownUntil && performance.now() < entry.cooldownUntil;
    if (needsRebuild && cooling) {
      // Cool-down: keep showing the last good bitmap (if any), stay silent.
      // v2.17.0 FIX: only blit when the stored region still matches — a stale
      // bitmap built for an OLD pane rect, blitted into the NEW rect, renders
      // scaled/ghosted content while cooling.
      if (entry.ok && !regionChanged) ctx.drawImage(entry.canvas, region.x, region.y, region.w, region.h);
      return;
    }
    if (needsRebuild && !budgetExhausted) {
      // Rebuild: render the indicator into its own bitmap, sandboxed.
      this._frameRebuilds++;
      this._frameRebuildArea += bitmapArea;   // v2.17.1: area-based budget
      // v2.18.1: only RESIZE the bitmap when the dimensions actually changed.
      // Assigning canvas.width (even to the SAME value) clears the bitmap AND
      // forces the browser to reallocate a fresh backing store — a real cost
      // on every rebuild, especially during pan/zoom where the indicator's
      // STAMP changes every frame (barSpacing moves) but the region size
      // rarely does. Guarded assignment skips the reallocation; the clearRect
      // below already wipes stale pixels, so the visual result is identical.
      if (entry.canvas.width  !== pxW) entry.canvas.width  = pxW;
      if (entry.canvas.height !== pxH) entry.canvas.height = pxH;
      entry.region = region;
      const octx = entry.octx;
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, pxW, pxH);
      // The indicator's render() expects to draw at chart CSS coordinates
      // (helpers.chartLeft, etc.). Translate the offscreen context so those
      // same coords land inside the smaller bitmap. setTransform(dpr, ... dpr)
      // first, then translate by -region.x/-region.y in CSS space.
      octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      octx.translate(-region.x, -region.y);
      let ok = true;
      // v2.18.0: thread _currentRenderState + reset state._mainDraws so
      // drawOnMain() callbacks registered during this render REPLACE the
      // previous cache's set. The cached callbacks are replayed every frame
      // by _flushMainDraws() — including cache-HIT frames where render()
      // is NOT called — so a price-level line drawn from inside a pane
      // indicator stays on screen until the indicator is removed or its
      // inputs change (which triggers a cache rebuild and a fresh set).
      this._currentRenderState = state;
      state._mainDraws = [];
      octx.save();
      try {
        state.def.render(octx, this.indCache[id], helpers, state.settings, state);
        this._clearIndicatorError(state);
      } catch (e) {
        ok = false;
        this._flagIndicatorError(id, state, e, 'render()');
      } finally {
        octx.restore();
        this._currentRenderState = null;   // v2.18.0: always clear, even on throw
      }
      entry.ok = ok;
      // Failed renders are NOT cached — they retry (with backoff, see above).
      entry.stamp = ok ? stamp : null;
      if (ok) {
        entry.failCount = 0;
        entry.cooldownUntil = 0;
        this.invalidate();   // successful rebuild may release deferred siblings
      } else {
        entry.failCount++;
        if (entry.failCount >= 3) entry.cooldownUntil = performance.now() + 5000;
        // v2.14.0: NO invalidate() on failure — the old code woke the loop
        // every frame for a permanently-broken indicator (60fps burn).
      }
    } else if (needsRebuild && budgetExhausted) {
      // Defer: keep the old bitmap on screen this frame, retry next frame.
      this.invalidate();
    }
    // v2.17.0 FIX: when the rebuild was DEFERRED (budget) but the region
    // MOVED (a pane was added/removed/resized), the stored bitmap was built
    // for a DIFFERENT rect — blitting it into the new rect scales and ghosts
    // the old content. Skip the stale blit; the deferred rebuild lands on
    // the very next frame (invalidate() above already scheduled it).
    const staleRegionBlit = needsRebuild && budgetExhausted && regionChanged;
    if (entry.ok && !staleRegionBlit) {
      ctx.drawImage(entry.canvas, region.x, region.y, region.w, region.h);
    }
  }

  // v2.16.0 (#10): the rectangular CSS-pixel region an indicator actually
  // paints into. Overlay indicators draw inside the price area; pane
  // indicators draw inside their own pane; volume indicators inside the
  // volume strip. The offscreen canvas is sized to this region (not the full
  // screen) → ~5-10× less GPU memory for multi-indicator charts.
  _indicatorRegion(id, state) {
    const type = state.def && state.def.type;
    if (type === 'pane') {
      const pane = this._panes.find(p => p.id === id);
      if (pane) {
        return {
          x: this.chartLeft, y: pane.top,
          w: Math.max(1, this.chartRight - this.chartLeft),
          h: Math.max(1, pane.bottom - pane.top)
        };
      }
    }
    if (type === 'volume') {
      return {
        x: this.chartLeft, y: this.volTop,
        w: Math.max(1, this.chartRight - this.chartLeft),
        h: Math.max(1, this.volBottom - this.volTop)
      };
    }
    // overlay (default)
    return {
      x: this.chartLeft, y: this.priceTop,
      w: Math.max(1, this.chartRight - this.chartLeft),
      h: Math.max(1, this.priceBottom - this.priceTop)
    };
  }

  // v2.11.0: Fingerprint of EVERYTHING a custom indicator's render() can see.
  // Same fingerprint + same settings ⇒ same output ⇒ safe to reuse the cached
  // bitmap. Recomputed each frame from live values, so no mutation point can
  // be "forgotten" (self-validating — the cache can never go stale silently).
  // v2.16.0 FIX (#11): the stamp used to include `_dataVersion`, which bumped
  // on EVERY tick. In the live-data scenario (the main use case) every
  // indicator then rebuilt its bitmap every frame — the entire v2.11 cache
  // pipeline was useless. Now the stamp uses `_contentVersion` (only bumps
  // when data is APPENDED or REPLACED, not when the forming candle's OHLC
  // changes), and the forming candle's last.open/high/low/close fields catch
  // in-place updates of the last bar. The result: hovering or moving the
  // viewport with a stable last tick is now a true drawImage blit, and a
  // tick that only updates the forming candle only invalidates indicators
  // whose value at the last index actually changed.
  _indicatorStamp(id, state) {
    const pr = this.priceScale && this.priceScale.priceRange();
    const range = pr ? (pr.min + '~' + pr.max) : 'x';
    // v2.13.0: per-pane scale + region. Look up the pane for this indicator
    // so a pane indicator's cache rebuilds when ITS pane geometry/range
    // changes — not when the legacy this.paneScale (which now points to
    // _panes[0].scale) changes for an unrelated pane.
    // v2.17.0 FIX: ONLY pane-type indicators include their pane's range in
    // the stamp. Overlays/volume render in the PRICE/VOLUME area with
    // priceToY/volToY — they never see a pane scale — yet the old code
    // stamped them with `this.paneScale` (_panes[0].scale) → every pane[0]
    // rescale (its own indicator updating!) rebuilt every overlay/volume
    // bitmap for nothing. Now overlays stamp with 'x' (constant) here.
    const type = state.def && state.def.type;
    const pane = type === 'pane' ? this._panes.find(p => p.id === id) : null;
    const ps = pane ? pane.scale : null;
    const ppr = ps && ps.priceRange() ? (ps.priceRange().min + '~' + ps.priceRange().max) : 'x';
    const paneTop = pane ? pane.top : (this.paneTop || 0);
    const paneBottom = pane ? pane.bottom : (this.paneBottom || 0);
    const N = this.sim.candles.length;
    const last = N ? this.sim.candles[N - 1] : null;
    // v2.12.0: safe settings serialization (circular-safe; shared with the
    // getRange cache via _safeSettingsKey).
    const settingsKey = this._safeSettingsKey(state);
    return [
      this._sceneVersion,
      this._contentVersion,   // v2.16.0: bumps only when DATA is appended/replaced (was _dataVersion → bumped every tick)
      N,
      last ? last.time : 0, last ? last.open : 0, last ? last.high : 0, last ? last.low : 0, last ? last.close : 0,
      Math.round(this.barSpacing * 100) / 100,
      Math.round(this.rightOffset * 100) / 100,
      Math.round(this.W), Math.round(this.H), Math.round(this.dpr * 100) / 100,
      Math.round(this.priceTop), Math.round(this.priceBottom),
      Math.round(paneTop), Math.round(paneBottom),
      Math.round(this.chartLeft), Math.round(this.chartRight),
      range, ppr,
      state.visible !== false ? 1 : 0,
      settingsKey
    ].join('|');
  }
  // v2.14.0: safe settings serialization used by getRange caching. Extracted
  // from _indicatorStamp so both share the circular-safe implementation.
  _safeSettingsKey(state) {
    try {
      return JSON.stringify(state.settings || {});
    } catch (_) {
      const s = state.settings || {};
      const parts = [];
      for (const k of Object.keys(s)) {
        const t = typeof s[k];
        parts.push(k + ':' + (t === 'object' ? '[obj]' : String(s[k])));
      }
      return parts.join(',') || '{}';
    }
  }
  // v2.11.0: keep offscreen bitmaps alive (removed indicators evict
  // explicitly; this is just a safety net for long-running pages).
  // v2.14.0 FIX (audit #14b): the hard cap of 8 thrashed violently with 9+
  // indicators — every frame evicted the oldest bitmap and immediately
  // recreated it (canvas alloc + full rebuild per frame). The limit now
  // scales with the active indicator count (2× + 8 headroom).
  _evictIndicatorCache() {
    const MAX = Math.max(8, this.activeIndicators.size * 2 + 8);
    while (this._indCache2.size > MAX) {
      const oldest = this._indCache2.keys().next().value;
      this._indCache2.delete(oldest);
    }
  }
  // v2.11.0: CANVAS-WRECK GUARD — setting canvas.width/height wipes the whole
  // bitmap and resets the transform (classic "everything disappears" bug when
  // user render code experiments with the canvas). Detect and repair instantly.
  _fixCanvasWreck() {
    const expW = Math.max(1, Math.floor(this.W * this.dpr));
    const expH = Math.max(1, Math.floor(this.H * this.dpr));
    if (this.canvas.width !== expW || this.canvas.height !== expH) {
      this.canvas.width = expW;
      this.canvas.height = expH;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._invalidateScene();
    }
  }
  // v2.11.0: true while any active indicator declares animated: true — keeps
  // the render loop awake so self-animating indicators keep moving.
  _hasAnimatedIndicator() {
    for (const id of this.activeIndicators) {
      const s = this.indicatorStates.get(id);
      if (s && s.def && s.def.animated === true) return true;
    }
    return false;
  }
  // v2.11.0: schedule a repaint + mark activity. Called automatically by all
  // input handlers and all data / indicator / marker / theme APIs. Also safe
  // to call from user code.
  invalidate() {
    this._needsRender = true;              // v2.11.0: schedule exactly one repaint
    this._lastActivity = performance.now();
  }
  // v2.15.0: open a short window during which the per-frame indicator-rebuild
  // budget is bypassed. Fast interactions (wheel zoom, pinch, momentum) change
  // barSpacing every frame without ever entering a drag state — without this
  // window the 3rd+ indicator kept rendering its previous bitmap (lag).
  _touchInteract() {
    this._interactUntil = performance.now() + 400;
  }
  // v2.15.0: BATCH indicator computation — update()/append() used to call
  // computeIndicators() synchronously on EVERY tick, so a burst of WebSocket
  // messages recomputed every indicator O(N) several times per frame. Now
  // ticks only queue the work; ONE rAF callback (coalesced with the render
  // frame) runs computeIndicators() + autoScale() at most once per frame.
  _scheduleCompute() {
    this._computeQueued = true;
    if (this._computeRaf != null) return;
    const run = () => {
      this._computeRaf = null;
      if (this._destroyed || !this._computeQueued) return;
      this._computeQueued = false;
      this.computeIndicators();
      this.autoScale();   // overlay ranges may have changed → re-fit + invalidate
    };
    if (typeof requestAnimationFrame === 'function') {
      this._computeRaf = requestAnimationFrame(run);
    } else {
      run();   // headless / Node — no frames to batch into, compute now
    }
  }
  // v2.11.0: Force every cached indicator to rebuild on the next render.
  // Called when something that affects indicator OUTPUT (but not its geometry
  // fingerprint) changes: theme, settings, data structure, layout.
  _invalidateScene() { this._sceneVersion++; this.invalidate(); }
  // Public alias — safe to call from user code / framework integrations.
  invalidateScene() { this._invalidateScene(); }

  /* ---------- v2.13.0: Multi-pane resizable API ---------- */
  // Two calling conventions:
  //   setPaneHeight(h)            → set height for ALL panes (legacy-friendly)
  //   setPaneHeight(paneId, h)    → set height for ONE pane (paneId is the
  //                                 indicator id, e.g. 'rsi' / 'macd')
  // Pass null for h to revert that pane (or all panes) to the auto height.
  // The value is clamped to [60, 200] on the next updateLayout(); the price
  // area is guaranteed ≥120px regardless of how many panes are tall.
  setPaneHeight(paneIdOrH, maybeH) {
    let paneId, h;
    if (typeof paneIdOrH === 'string') {
      paneId = paneIdOrH;
      h = maybeH;
    } else {
      h = paneIdOrH;
      paneId = null;   // apply to all panes
    }
    if (h != null && !(typeof h === 'number' && isFinite(h))) return this;
    const value = (h == null) ? null : Math.round(h);
    if (paneId != null) {
      if (value == null) delete this._paneHUsers[paneId];
      else this._paneHUsers[paneId] = value;
    } else {
      // Apply to all currently-active panes
      if (value == null) this._paneHUsers = {};
      else for (const p of this._panes) this._paneHUsers[p.id] = value;
    }
    this.updateLayout();
    this.autoScale();
    this.invalidate();
    return this;
  }
  // Reset one pane's height (pass an id) or ALL panes (no arg) back to auto.
  // Also reachable by double-clicking that pane's separator.
  resetPaneHeight(paneId) {
    if (paneId != null) {
      if (this._paneHUsers[paneId] == null) return this;
      delete this._paneHUsers[paneId];
    } else {
      if (Object.keys(this._paneHUsers).length === 0) return this;
      this._paneHUsers = {};
    }
    this.updateLayout();
    this.autoScale();
    this.invalidate();
    return this;
  }
  // Returns the current pane layout. With no arg: array of {id, height, auto,
  // userValue} for every visible pane. With an id: that pane's info object,
  // or null if not visible.
  getPaneHeight(paneId) {
    if (paneId != null) {
      const p = this._panes.find(p => p.id === paneId);
      if (!p) return null;
      return { id: p.id, height: p.height, auto: p.userH == null, userValue: p.userH };
    }
    return this._panes.map(p => ({
      id: p.id, height: p.height, auto: p.userH == null, userValue: p.userH
    }));
  }

  /* ---------- v2.13.0: Countdown public API ---------- */
  // Enable / disable / configure the floating countdown number. Accepts:
  //   showCountdown(true | false)               → toggle on/off
  //   setCountdown({ format, color, fontSize, offsetX, offsetY, enabled })
  //     format:   'auto' (default) | 'mm' | 'ss' | 'hh'
  //     color:    any CSS color string (null/omit = theme.textDim)
  //     fontSize: number (default 11)
  //     offsetX:  px right of the candle body (default 6)
  //     offsetY:  px below the close price (default 0)
  //     enabled:  boolean — same as showCountdown()
  // While enabled, a 1-second interval wakes the render loop so the number
  // updates precisely when the displayed value changes — no 60fps cost.
  showCountdown(enabled) {
    if (!this._countdown) return this;
    this._countdown.enabled = !!enabled;
    this._syncCountdownTimer();
    this.invalidate();
    return this;
  }
  setCountdown(opts) {
    if (!this._countdown || !opts) return this;
    if (opts.format != null) this._countdown.format = opts.format;
    if (opts.color != null) this._countdown.color = opts.color;
    if (opts.fontSize != null) this._countdown.fontSize = opts.fontSize;
    if (opts.offsetX != null) this._countdown.offsetX = opts.offsetX;
    if (opts.offsetY != null) this._countdown.offsetY = opts.offsetY;
    if (opts.enabled != null) this._countdown.enabled = !!opts.enabled;
    this._syncCountdownTimer();
    this.invalidate();
    return this;
  }
  // Internal: start/stop the 1s wakeup interval based on _countdown.enabled.
  // The interval just calls invalidate() — the next rAF tick renders the new
  // value. Stopped when disabled to keep the chart at zero CPU when idle.
  // v2.20.3: also renders directly if the rAF loop hasn't rendered in the
  // last 500ms (throttled/background-tab safety net). See chart-webgl.js
  // _syncCountdownTimer for the full rationale.
  _syncCountdownTimer() {
    if (this._countdown && this._countdown.enabled && !this._countdownTimer) {
      const self = this;
      this._countdownTimer = setInterval(function () {
        try {
          self.invalidate();
          const now = (typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : Date.now();
          const lastRender = self._lastRenderTime || 0;
          if (now - lastRender > 500 && typeof self.render === 'function') {
            self.render(now);
          }
        } catch (_) {}
      }, 1000);
    } else if ((!this._countdown || !this._countdown.enabled) && this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
  }

/* ==================== BAR REPLAY ENGINE (v2.22.0) ====================== */
  // TradingView-style backtest replay. Public API:
  //   chart.startReplay(timeOrIndex)  — freeze history at a bar, enter replay
  //   chart.replayStep(n)             — reveal n candles (n<0 steps back)
  //   chart.replayPlay(speed?)        — animated playback (0.5x–20x)
  //   chart.replayPause()             — pause playback
  //   chart.replaySetSpeed(x)         — set playback speed
  //   chart.stopReplay()              — exit replay, restore full data
  //   chart.isReplaying()             — true while replay mode is active
  // Events: chart.onReplayStart / onReplayStep / onReplayEnd / onReplayStop
  // Keyboard (while replaying): Space=play/pause, ←/→=step, Esc=exit.
  //
  // WHY THE ENGINE LIVES IN THE LIBRARY (not a standalone script):
  //  1. The countdown must count REPLAY time, not wall-clock time — it reads
  //     the internal forming-candle progress every frame.
  //  2. Stepping uses the data layer's incremental path (batched indicator
  //     recompute + rightOffset pinning) — a script calling setData() per
  //     step would rebuild everything and flicker.
  //  3. The replay line, badge and playback bar draw INSIDE the chart's
  //     canvas z-order (over candles, under the settings card).
  //  4. Keyboard shortcuts integrate with the existing multi-chart guard.
  //  5. A live WebSocket feed must be BLOCKED during replay — only the
  //     library can intercept update()/append().

  // Enter replay mode at the bar containing `timeOrIndex`. Accepts:
  //   - epoch SECONDS (>1e8, i.e. anything after 1973)  ← most common
  //   - epoch MILLISECONDS (>1e11)
  //   - a 0-based candle INDEX (0..length-1)
  //   - null/undefined → default cutoff at 2/3 through the dataset
  // Everything AFTER that bar is hidden; the cutoff bar itself is the last
  // visible complete candle.
  startReplay(timeOrIndex) {
    // (Re)enter — stop any previous session FIRST (it restores fullData),
    // then read the restored array. Reading before the stop would slice the
    // stale truncated array into fullData and LOSE history.
    if (this.replay.active) this._replayStopInternal(false);
    const candles = this.sim.candles;
    if (!candles || candles.length === 0) {
      this.showToast('No data to replay');
      return this;
    }
    // Resolve the cutoff index — disambiguate time-vs-index by magnitude:
    // an index is always < 1e8 for any real dataset; epoch seconds are > 1e8
    // for anything after 1973; epoch ms are > 1e11.
    let cutIdx;
    if (timeOrIndex == null) {
      cutIdx = Math.floor(candles.length * 2 / 3);
    } else if (typeof timeOrIndex === 'number' && timeOrIndex > 1e11) {
      cutIdx = this._indexForTime(timeOrIndex / 1000);            // ms epoch
    } else if (typeof timeOrIndex === 'number' && timeOrIndex > 1e8) {
      cutIdx = this._indexForTime(timeOrIndex);                   // s epoch
    } else if (typeof timeOrIndex === 'number') {
      const i = Math.max(0, Math.min(candles.length - 1, Math.floor(timeOrIndex)));
      cutIdx = this._indexForTime(candles[i].time);               // index
    } else {
      cutIdx = Math.floor(candles.length * 2 / 3);
    }
    if (!(cutIdx >= 1)) cutIdx = 1;
    if (cutIdx > candles.length - 1) cutIdx = candles.length - 1;
    this.replay.active = true;
    this.replay.fullData = candles.slice();     // keep the complete dataset safe
    this.replay.startTime = candles[cutIdx].time;
    this.replay.playing = false;
    this.replay._progress = 0;
    this.replay._warnedExternal = false;
    // Truncate the live array to the cutoff (keep the cutoff bar visible)
    this.sim.candles = this.replay.fullData.slice(0, cutIdx + 1);
    this._lastDataLen = this.sim.candles.length;
    this._dataVersion++;
    this._contentVersion++;
    // Scroll so the replay edge is at the RIGHT side of the view (TV-style)
    this.rightOffset = 6;
    this.constrainRightOffset();
    this.computeIndicators();
    this.autoScale();
    this.invalidateTimeMarks();
    this.invalidate();
    if (typeof this.onReplayStart === 'function') {
      try { this.onReplayStart(this.replay); } catch (_) {}
    }
    return this;
  }

  // Exit replay mode — restores the complete dataset.
  stopReplay() { return this._replayStopInternal(true); }
  _replayStopInternal(fireEvent) {
    if (!this.replay.active) return this;
    this._replayClearTimers();
    this.replay.active = false;
    this.replay.playing = false;
    if (this.replay.fullData && this.replay.fullData.length > 0) {
      this.sim.candles = this.replay.fullData;   // restore complete history
      this.replay.fullData = [];
    }
    this._lastDataLen = this.sim.candles.length;
    this._dataVersion++;
    this._contentVersion++;
    this.computeIndicators();
    this.autoScale();
    this.invalidateTimeMarks();
    this.invalidate();
    if (fireEvent && typeof this.onReplayStop === 'function') {
      try { this.onReplayStop(); } catch (_) {}
    }
    return this;
  }
  isReplaying() { return !!this.replay.active; }

  // Reveal n candles. n > 0 steps FORWARD (each revealed candle appears
  // COMPLETE — manual stepping never animates), n < 0 steps BACK (removes
  // the last candle). Returns true if a step happened.
  replayStep(n) {
    if (!this.replay.active) return false;
    n = (typeof n === 'number') ? Math.trunc(n) : 1;
    if (this.replay.playing) this.replayPause();
    let did = false;
    for (let k = 0; k < Math.abs(n); k++) {
      if (n > 0) did = this._replayRevealComplete() || did;
      else did = this._replayStepBack() || did;
    }
    if (did) this._replayAfterDataChange();
    return did;
  }

  // Start animated playback. speed = candles-per-second multiplier: 1x
  // reveals one candle per second with a 4-tick intra-candle simulation.
  replayPlay(speed) {
    if (!this.replay.active) return this;
    if (speed != null) this.replaySetSpeed(speed);
    if (this.replay.playing) return this;
    // If the previous candle is still forming (paused mid-candle), finish it
    this._replayFinalizeForming();
    // Past the end of history? Nothing to play.
    if (this.sim.candles.length >= this.replay.fullData.length) {
      if (typeof this.onReplayEnd === 'function') { try { this.onReplayEnd(); } catch (_) {} }
      return this;
    }
    this.replay.playing = true;
    this.replay._progress = 0;
    this.replay._stepStartMs = performance.now();
    this._replayRevealForming();          // push the next candle as forming
    const self = this;
    const tickMs = this._replayTickMs();
    this.replay._timer = setInterval(function () { self._replayTick(); }, tickMs);
    this.invalidate();
    return this;
  }
  replayPause() {
    if (!this.replay.active || !this.replay.playing) return this;
    this._replayClearTimers();
    this.replay.playing = false;
    this._replayFinalizeForming();        // complete the partial candle
    this._replayAfterDataChange();
    return this;
  }
  replaySetSpeed(x) {
    const speeds = [0.5, 1, 2, 5, 10, 20];
    if (speeds.indexOf(x) < 0) x = 1;
    this.replay.speed = x;
    // Live-adjust a running timer
    if (this.replay.playing && this.replay._timer != null) {
      this._replayClearTimers();
      const self = this;
      this.replay._timer = setInterval(function () { self._replayTick(); }, this._replayTickMs());
    }
    this.invalidate();
    return this;
  }
  replayCycleSpeed() {
    const speeds = [0.5, 1, 2, 5, 10, 20];
    const i = speeds.indexOf(this.replay.speed);
    this.replaySetSpeed(speeds[(i + 1) % speeds.length]);
    return this;
  }
  _replayTickMs() {
    // One candle per `1000/speed` ms; ticks run 4× per candle (clamped ≥25ms
    // so 20x speed still fires reliably — progress just advances faster).
    return Math.max(25, 1000 / this.replay.speed / 4);
  }
  _replayClearTimers() {
    if (this.replay._timer != null) { clearInterval(this.replay._timer); this.replay._timer = null; }
  }

  // ---- internal data mechanics ----
  // Push the next historical candle as a FORMING candle (open only).
  _replayRevealForming() {
    const r = this.replay;
    const curLen = this.sim.candles.length;
    if (curLen >= r.fullData.length) return false;
    const t = r.fullData[curLen];
    const eps = Math.max(Math.abs(t.close) * 0.00005, 1e-9);
    this.sim.candles.push({
      time: t.time, open: t.open,
      high: t.open + eps, low: t.open - eps,
      close: t.open, volume: 0
    });
    this._lastDataLen = this.sim.candles.length;
    this._dataVersion++;
    this._contentVersion++;
    this._scheduleCompute();
    this.autoScale();
    this.invalidate();
    return true;
  }
  // Push the next historical candle COMPLETE (manual step path).
  _replayRevealComplete() {
    const r = this.replay;
    const curLen = this.sim.candles.length;
    if (curLen >= r.fullData.length) return false;
    const t = r.fullData[curLen];
    this.sim.candles.push({ time: t.time, open: t.open, high: t.high, low: t.low, close: t.close, volume: t.volume });
    this._lastDataLen = this.sim.candles.length;
    this._dataVersion++;
    this._contentVersion++;
    if (typeof this.onReplayStep === 'function') {
      try { this.onReplayStep(this.sim.candles[this.sim.candles.length - 1], this.sim.candles.length); } catch (_) {}
    }
    if (this.sim.candles.length >= r.fullData.length && typeof this.onReplayEnd === 'function') {
      try { this.onReplayEnd(); } catch (_) {}
    }
    return true;
  }
  // One tick of the playback loop: advance the forming candle's reveal
  // progress; finalize when the candle's time is up and chain to the next.
  _replayTick() {
    const r = this.replay;
    if (!r.active || !r.playing) return;
    const stepMs = 1000 / r.speed;               // real ms per candle
    const now = performance.now();
    r._progress = Math.min(1.0001, (now - r._stepStartMs) / stepMs);
    const curLen = this.sim.candles.length;
    const forming = this.sim.candles[curLen - 1];
    const target = r.fullData[curLen - 1];
    if (!forming || !target || forming.time !== target.time) return;
    // Mid-candle reveal: NEVER leaks beyond the true candle's range, and the
    // final state is copied EXACTLY from history (clamped interpolation).
    const p = Math.min(1, r._progress);
    // ease-out so the candle "closes" with visible ticks near the end
    const ep = p * p * (3 - 2 * p);   // smoothstep
    const noise = (Math.random() - 0.5) * Math.max(Math.abs(target.close - target.open) * 0.12, Math.abs(target.close) * 0.00004) * (1 - p);
    let close = target.open + (target.close - target.open) * ep + noise;
    close = Math.max(target.low, Math.min(target.high, close));
    forming.close = close;
    forming.high = Math.min(target.high, Math.max(forming.high, close + Math.abs(noise)));
    forming.low  = Math.max(target.low,  Math.min(forming.low,  close - Math.abs(noise)));
    forming.volume = target.volume * ep;
    this._dataVersion++;
    this._scheduleCompute();
    this.autoScale();
    this.invalidate();
    if (r._progress >= 1) {
      // Candle complete — finalize exactly, fire the step event, chain next.
      this._replayFinalizeForming();
      if (typeof this.onReplayStep === 'function') {
        try { this.onReplayStep(this.sim.candles[this.sim.candles.length - 1], this.sim.candles.length); } catch (_) {}
      }
      if (this.sim.candles.length >= r.fullData.length) {
        // History fully revealed — stop at the end
        r.playing = false;
        this._replayClearTimers();
        this._replayAfterDataChange();
        if (typeof this.onReplayEnd === 'function') { try { this.onReplayEnd(); } catch (_) {} }
        return;
      }
      r._progress = 0;
      r._stepStartMs = performance.now();
      this._replayRevealForming();
    }
  }
  // Copy the TRUE historical OHLCV into the forming candle (exact history).
  _replayFinalizeForming() {
    const curLen = this.sim.candles.length;
    if (curLen === 0) return;
    const last = this.sim.candles[curLen - 1];
    const target = this.replay.fullData[curLen - 1];
    if (!target || !last || last.time !== target.time) return;
    last.open = target.open; last.high = target.high;
    last.low = target.low;   last.close = target.close;
    last.volume = target.volume;
    this._dataVersion++;
    this._contentVersion++;
    this._scheduleCompute();
    this.autoScale();
    this.invalidate();
  }
  // Remove the last candle (step back).
  _replayStepBack() {
    const curLen = this.sim.candles.length;
    if (curLen <= 1 || curLen - 1 <= this._replayStartIdx()) return false;
    this._replayFinalizeForming();   // safe no-op if not forming
    this.sim.candles.pop();
    this._lastDataLen = this.sim.candles.length;
    this._dataVersion++;
    this._contentVersion++;
    return true;
  }
  // Index (in fullData) of the replay start bar — the minimum visible length.
  _replayStartIdx() {
    const r = this.replay;
    for (let i = 0; i < r.fullData.length; i++) {
      if (r.fullData[i].time === r.startTime) return i;
    }
    return 0;
  }
  // Jump the replay position to absolute index k in fullData (progress-bar
  // click). k < startIdx is clamped to startIdx.
  _replayJumpTo(k) {
    const r = this.replay;
    if (!r.active) return;
    const startIdx = this._replayStartIdx();
    k = Math.max(startIdx + 1, Math.min(r.fullData.length, Math.trunc(k)));
    this._replayClearTimers();
    r.playing = false;
    r._progress = 0;
    this.sim.candles = r.fullData.slice(0, k);
    this._lastDataLen = this.sim.candles.length;
    this._dataVersion++;
    this._contentVersion++;
    this._replayAfterDataChange();
  }
  // Shared post-mutation work: recompute + rescale + repaint.
  _replayAfterDataChange() {
    this.computeIndicators();
    this.autoScale();
    this.invalidateTimeMarks();
    this.invalidate();
  }

  /* ------------------- Replay drawing (line/badge/bar) ------------------- */
  // Blue vertical line at the replay START bar (TradingView-style anchor).
  drawReplayLine() {
    if (!this.replay.active) return;
    const idx = this._indexForTime(this.replay.startTime);
    if (idx < 0) return;
    const x = this.indexToX(idx);
    if (x < this.chartLeft - 2 || x > this.chartRight + 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = '#2962ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, this.chartTop);
    ctx.lineTo(x, this.chartBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    // Anchor handle at the top
    ctx.fillStyle = '#2962ff';
    ctx.beginPath();
    ctx.arc(x, this.chartTop + 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // REPLAY badge (top-right) + playback bar (over the time axis, centered).
  drawReplayOverlay() {
    if (!this.replay.active) return;
    const ctx = this.ctx;
    // ---- badge ----
    const label = 'REPLAY ' + this.replay.speed + 'x' + (this.replay.playing ? '' : ' ⏸');
    ctx.font = 'bold 11px -apple-system, Segoe UI, Roboto, sans-serif';
    const bw = ctx.measureText(label).width + 16;
    const bx = this.chartRight - bw - 8;
    const by = this.chartTop + 8;
    ctx.fillStyle = '#2962ff';
    this._roundRect(bx, by, bw, 20, 10);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 8, by + 11);
    if (!this.replay.showBar) return;
    // ---- playback bar over the time axis ----
    const barH = 30;
    const barY = this.H - this.layout.timeAxisH - barH - 2;
    // Buttons: [⏮ start] [◀ back] [play/pause] [▶ step] [speed] ... [progress] ... [✕]
    const BTN = 30, GAP = 2;
    const speedsW = 46;
    const exitW = 30;
    const barW = 6 * 4 + BTN * 4 + speedsW + exitW + 24;   // paddings + 4 btns + speed + exit
    const progW = Math.max(120, Math.min(320, (this.W - barW - 40) * 0.55));
    const totalW = barW + progW + 8;
    let x = Math.max(this.chartLeft + 8, (this.W - totalW) / 2);
    const y = barY;
    // Bar background
    ctx.fillStyle = 'rgba(30,34,45,0.96)';
    this._roundRect(x, y, totalW, barH, 6);
    ctx.fill();
    ctx.strokeStyle = '#2a2e39';
    ctx.lineWidth = 1;
    this._roundRect(x + 0.5, y + 0.5, totalW - 1, barH - 1, 6);
    ctx.stroke();
    this._replayHits = [];
    const cy = y + barH / 2;
    const self = this;
    // Button painter — simple vector glyphs (no emoji/unicode dependence)
    const drawBtn = function (id, w, glyph) {
      const hovered = self._replayHover === id;
      if (hovered) {
        ctx.fillStyle = 'rgba(41,98,255,0.25)';
        self._roundRect(x + 1, y + 3, w - 2, barH - 6, 4);
        ctx.fill();
      }
      ctx.fillStyle = self.theme.text;
      ctx.strokeStyle = self.theme.text;
      glyph(x + w / 2, cy);
      self._replayHits.push({ id: id, x: x, y: y, w: w, h: barH });
      x += w + GAP;
    };
    const triRight = function (cx, cy, s) {
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.5, cy - s * 0.7);
      ctx.lineTo(cx - s * 0.5, cy + s * 0.7);
      ctx.lineTo(cx + s * 0.7, cy);
      ctx.closePath(); ctx.fill();
    };
    const triLeft = function (cx, cy, s) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.5, cy - s * 0.7);
      ctx.lineTo(cx + s * 0.5, cy + s * 0.7);
      ctx.lineTo(cx - s * 0.7, cy);
      ctx.closePath(); ctx.fill();
    };
    // 1. jump-to-start
    drawBtn('start', BTN, function (cx, cy) {
      ctx.fillRect(cx - 8, cy - 6, 2, 12);
      triRight(cx + 1, cy, 8);
    });
    // 2. step back
    drawBtn('back', BTN - 4, function (cx, cy) {
      ctx.fillRect(cx - 7, cy - 6, 2, 12);
      triLeft(cx + 2, cy, 7);
    });
    // 3. play / pause
    drawBtn('play', BTN, function (cx, cy) {
      if (self.replay.playing) {
        ctx.fillRect(cx - 5, cy - 6, 3.5, 12);
        ctx.fillRect(cx + 1.5, cy - 6, 3.5, 12);
      } else {
        triRight(cx - 1, cy, 10);
      }
    });
    // 4. step forward
    drawBtn('step', BTN - 4, function (cx, cy) {
      triRight(cx - 2, cy, 7);
      ctx.fillRect(cx + 5, cy - 6, 2, 12);
    });
    // 5. speed
    drawBtn('speed', speedsW, function (cx, cy) {
      ctx.font = 'bold 11px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#2962ff';
      ctx.fillText(self.replay.speed + 'x', cx, cy);
    });
    // 6. progress bar (click to jump)
    {
      const startIdx = this._replayStartIdx();
      const total = this.replay.fullData.length - startIdx - 1;
      const shown = Math.max(0, this.sim.candles.length - startIdx - 1);
      const frac = total > 0 ? Math.min(1, shown / total) : 1;
      const px = x + 2, pw = progW - 4;
      ctx.fillStyle = '#2a2e39';
      this._roundRect(px, cy - 4, pw, 8, 4);
      ctx.fill();
      ctx.fillStyle = '#2962ff';
      if (frac > 0) {
        this._roundRect(px, cy - 4, Math.max(6, pw * frac), 8, 4);
        ctx.fill();
      }
      this._replayHits.push({ id: 'progress', x: px - 2, y: y, w: pw + 4, h: barH,
                              meta: { startIdx: startIdx, total: total } });
      x += progW + GAP;
    }
    // 7. exit
    drawBtn('exit', exitW, function (cx, cy) {
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 5); ctx.lineTo(cx + 5, cy + 5);
      ctx.moveTo(cx + 5, cy - 5); ctx.lineTo(cx - 5, cy + 5);
      ctx.stroke();
    });
  }
  // Hit-test the replay playback bar. Returns {id, meta} or null.
  _hitReplayBar(x, y) {
    for (const h of this._replayHits) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        return { id: h.id, meta: h.meta };
      }
    }
    return null;
  }
  _handleReplayClick(hit) {
    switch (hit.id) {
      case 'start': {
        // Rewind to the replay start (keep the start bar visible)
        this._replayJumpTo(this._replayStartIdx() + 1);
        break;
      }
      case 'back': this.replayStep(-1); break;
      case 'play':
        if (this.replay.playing) this.replayPause();
        else this.replayPlay();
        break;
      case 'step': this.replayStep(1); break;
      case 'speed': this.replayCycleSpeed(); break;
      case 'exit': this.stopReplay(); break;
      case 'progress': {
        // Click position → absolute index in fullData
        const m = hit.meta || {};
        if (m.total > 0) {
          // Map click x within the progress hit-box to 0..1
          const h = this._replayHits.find(function (q) { return q.id === 'progress'; });
          const frac = Math.max(0, Math.min(1, (this.mouseX - h.x) / h.w));
          this._replayJumpTo(m.startIdx + 1 + Math.round(frac * m.total));
        }
        break;
      }
    }
    this.invalidate();
  }

  // Build the helpers object passed to each indicator's render() function.
  // Contains coordinate-conversion functions and current chart geometry.
  // v2.17.0 FIX: `kind` — which render context the helpers serve:
  //   'overlay' (default) → drawLine/drawGradientArea map via priceToY
  //   'pane'              → map via paneToY (the CURRENT pane's own scale)
  //   'volume'            → map via volToY
  // drawIndicators/drawPane/drawVolume each pass their kind. The mapping
  // helpers (yMap/yBottom) read the LIVE helpers.paneScale / _paneRegion,
  // which drawPane() re-points before EACH pane indicator's render — so one
  // shared helpers object still serves every pane correctly.
  _indicatorHelpers(firstIdx, lastIdx, kind) {
    kind = kind || 'overlay';
    const self = this;
    // v2.6.0: paneRegion is mutable — drawPane() overrides .top/.bottom so
    // paneToY() maps into the in-chart overlay region (bottom of price area).
    const paneRegion = { top: self.paneTop || 0, bottom: self.paneBottom || 0 };
    const helpers = {
      firstIdx: firstIdx,
      lastIdx:  lastIdx,
      _kind:    kind,
      indexToX: function (i) { return self.indexToX(i); },
      priceToY: function (p) { return self.priceToY(p); },
      volToY:   function (v) { return self.volToY(v); },
      // v2.14.0 FIX (CRITICAL — the "second pane indicator doesn't show" bug):
      // this used `self.paneScale`, which is the LEGACY pointer to
      // _panes[0].scale. Every pane indicator rendered after the first mapped
      // its values through the FIRST pane's scale — a MACD in pane 2 drew at
      // RSI's coordinate space, clipped away by its own pane → invisible or
      // wrong. Now it reads helpers.paneScale, which drawPane() re-points to
      // the CURRENT pane's scale before each indicator render.
      // v2.17.0 FIX: removed the `|| self.paneScale` fallback — when the pane
      // lookup failed it silently mapped a pane-2 indicator through pane-1's
      // scale (the v2.14.0 bug, resurrected through the back door). With no
      // pane scale the only safe output is the pane's own top edge.
      paneToY:  function (v) {
        const ps = helpers.paneScale;
        if (!ps || typeof ps.logicalToCoordinate !== 'function') return paneRegion.top;
        return paneRegion.top + ps.logicalToCoordinate(v, 0);
      },
      // v2.17.0: context-aware value→Y mapper used by drawLine/drawGradientArea.
      // Pane indicators now rasterize inside THEIR pane (own scale), volume
      // indicators inside the volume strip, overlays in the price area.
      yMap: function (v) {
        if (kind === 'pane') return helpers.paneToY(v);
        if (kind === 'volume') return self.volToY(v);
        return self.priceToY(v);
      },
      // The bottom edge the current context fills down to (gradient area).
      yBottom: function () {
        if (kind === 'pane') return paneRegion.bottom;
        if (kind === 'volume') return self.volBottom;
        return self.priceBottom;
      },
      chartLeft:   this.chartLeft,
      chartRight:  this.chartRight,
      priceTop:    this.priceTop,
      priceBottom: this.priceBottom,
      volTop:      this.volTop,
      volBottom:   this.volBottom,
      paneTop:     this.paneTop,
      paneBottom:  this.paneBottom,
      barSpacing:  this.barSpacing,
      dpr:         this.dpr,
      candles:     this.sim.candles,
      THEME:       THEME,
      optimalCandlestickWidth: optimalCandlestickWidth,
      // v2.7.0: Gradient area helper — fills the area under a line with a
      // vertical gradient and strokes the line on top.
      //   helpers.drawGradientArea(ctx, values, {
      //     lineColor: '#2962ff',
      //     topColor:  'rgba(41,98,255,0.35)',
      //     bottomColor: 'rgba(41,98,255,0.02)',
      //     lineWidth: 1.5
      //   });
      // v2.7.0: Gradient area helper — fills the area under a line with a
      // vertical gradient and strokes the line on top.
      //   helpers.drawGradientArea(ctx, values, {
      //     lineColor: '#2962ff',
      //     topColor:  'rgba(41,98,255,0.35)',
      //     bottomColor: 'rgba(41,98,255,0.02)',
      //     lineWidth: 1.5
      //   });
      // v2.17.0 FIX: values now map through the CURRENT context's scale
      // (pane scale for pane indicators, volume scale for volume indicators,
      // price scale for overlays) and the fill closes to that context's
      // bottom edge — previously it ALWAYS used the price scale and
      // priceBottom, so pane/volume users got an empty or misplaced fill.
      drawGradientArea: function (ctx, values, opts) {
        opts = opts || {};
        const lineColor = opts.lineColor || '#2962ff';
        const topColor = opts.topColor || 'rgba(41,98,255,0.35)';
        const bottomColor = opts.bottomColor || 'rgba(41,98,255,0.02)';
        const lw = opts.lineWidth || 1.5;
        const ctxBottom = helpers.yBottom();
        // v2.16.0 FIX (#7): the fill closed back to `indexToX(firstIdx)` even
        // when the first VISIBLE values were null (warm-up bars). The gradient
        // then extended under a no-data area. Track firstValidIdx / firstValidX
        // and close back to THAT instead.
        let minY = Infinity;
        let firstValidIdx = -1, firstValidX = null, lastValidX = null;
        for (let i = firstIdx; i <= lastIdx; i++) {
          const v = values[i];
          if (v === null || v === undefined) continue;
          const y = helpers.yMap(v);
          if (y < minY) minY = y;
          const x = self.indexToX(i);
          if (firstValidIdx < 0) { firstValidIdx = i; firstValidX = x; }
          lastValidX = x;
        }
        if (firstValidIdx < 0 || !isFinite(minY)) return;
        const grad = ctx.createLinearGradient(0, minY, 0, ctxBottom);
        grad.addColorStop(0, topColor);
        grad.addColorStop(1, bottomColor);
        // Fill area under the line — uses the downsampled path (see drawLine).
        ctx.beginPath();
        const segs = downsampleLineSegments(self, values, firstIdx, lastIdx, helpers.yMap);
        let started = false;
        for (const seg of segs) {
          if (!started) { ctx.moveTo(seg.x, seg.y); started = true; } else ctx.lineTo(seg.x, seg.y);
        }
        if (!started) return;
        ctx.lineTo(lastValidX, ctxBottom);
        ctx.lineTo(firstValidX, ctxBottom);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        // Stroke the line on top (same downsampled path)
        ctx.beginPath();
        started = false;
        for (const seg of segs) {
          if (!started) { ctx.moveTo(seg.x, seg.y); started = true; } else ctx.lineTo(seg.x, seg.y);
        }
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lw;
        ctx.stroke();
      },
      // v2.16.0 (#5): downsampled line stroker. At extreme zoom-out (>600
      // visible bars) drawing one lineTo per candle produces thousands of
      // overlapping sub-pixel segments that anti-alias into a shimmer. This
      // helper collapses collinear interior segments via a light
      // Ramer-Douglas-Peucker pass with epsilon = 0.3px in screen space. End
      // points and local extrema are always kept, so the visual silhouette is
      // identical to the full path. Use this instead of building the path by
      // hand when you have a numeric values array.
      //   helpers.drawLine(ctx, values, { color:'#2962ff', lineWidth:1.5 });
      // v2.17.0 FIX: maps values through the CURRENT context's scale — the
      // pane's own scale for pane indicators (via paneToY), the volume scale
      // for volume indicators, the price scale for overlays. Previously it
      // ALWAYS projected through the price scale, so pane indicators drawn
      // with this helper rasterized OUTSIDE their pane and the clip erased
      // them (empty pane windows — the "bottom indicators don't work" report).
      drawLine: function (ctx, values, opts) {
        opts = opts || {};
        ctx.strokeStyle = opts.color || '#2962ff';
        ctx.lineWidth = opts.lineWidth || 1.5;
        const segs = downsampleLineSegments(self, values, firstIdx, lastIdx, helpers.yMap);
        if (segs.length === 0) return;
        ctx.beginPath();
        ctx.moveTo(segs[0].x, segs[0].y);
        for (let i = 1; i < segs.length; i++) ctx.lineTo(segs[i].x, segs[i].y);
        ctx.stroke();
      },
      // v2.18.0: drawOnMain(fn) — register a callback that draws on the MAIN
      // chart layer (the candlestick price area) using priceToY / indexToX of
      // the candle chart, NOT clipped to this pane. This is the official
      // escape hatch for pane indicators that need to project something onto
      // the candle chart itself (a horizontal price level at the close of the
      // candle that touched RSI 70, a vertical line at the touch index, a
      // marker on the candle, etc.).
      //
      //   render: function (ctx, values, h, s, state) {
      //     // ...draw the RSI line inside this pane...
      //     h.drawOnMain(function (mctx, mh) {
      //       // mctx = the LIVE main-chart canvas context, clipped to the
      //       //        price area (NOT to this pane).
      //       // mh   = main-chart helpers:
      //       //        mh.priceToY(p), mh.indexToX(i),
      //       //        mh.chartLeft, mh.chartRight, mh.priceTop, mh.priceBottom,
      //       //        mh.firstIdx, mh.lastIdx, mh.barSpacing, mh.dpr,
      //       //        mh.candles, mh.THEME
      //       const y = mh.priceToY(level);
      //       mctx.beginPath();
      //       mctx.moveTo(mh.indexToX(i), y);
      //       mctx.lineTo(mh.indexToX(touchIdx), y);
      //       mctx.stroke();
      //     });
      //   }
      //
      // Notes:
      // - The callback runs AFTER drawPane() and AFTER drawIndicators() (the
      //   overlay layer), so it draws on top of overlays (Bollinger Bands, SMA,
      //   etc.) and below markers/drawings/crosshair.
      // - It is replayed every frame, even on cache-HIT frames where the
      //   indicator's render() wasn't called. Callbacks are stored per
      //   indicator state and only replaced when the offscreen cache rebuilds
      //   (i.e. when render() actually runs). Removing the indicator clears
      //   its callbacks.
      // - Safe to call from overlay/volume indicators too, but redundant there
      //   (their ctx is already the price-area / volume-strip ctx).
      // - The callback is sandboxed: a throw is swallowed (and logged when
      //   BADI_DEBUG = true), so one broken drawOnMain never kills the chart.
      drawOnMain: function (fn) {
        if (typeof fn !== 'function') return;
        // Cache on the indicator state — replayed every frame by
        // _flushMainDraws via the state sweep (NO live push to the
        // per-frame queue — that would double-execute the callback, once
        // from the live push and once from the sweep). The state sweep
        // runs AFTER drawPane() in the render pipeline, so it picks up
        // freshly-registered callbacks from THIS frame's render() pass.
        const st = self._currentRenderState;
        if (st) {
          if (!Array.isArray(st._mainDraws)) st._mainDraws = [];
          st._mainDraws.push(fn);
        }
      }
    };
    helpers._paneRegion = paneRegion;
    return helpers;
  }

  /* --------------------------- Drawing Tools ----------------------------- */
  // v2.16.0 (#19): drawings used to be anchored by candle INDEX. When the
  // 50k cap trimmed old candles (a common occurrence in live long-running
  // sessions), every index shifted and your trend line "drifted" to a
  // different candle. We now ALSO stamp the unix time at every anchor point
  // (t1/t2 for line-style drawings, tIdx for vline/text, tPoints[] for
  // brush/poly). At render + hit-test time, _drawingIdxAt(d, key) re-derives
  // the index from the time so the drawing follows the SAME candle forever.
  // The index fields stay for back-compat (and for the rare case where the
  // drawing was created via addDrawing() with no time → fall back to index).
  _timeAtIdx(idx) {
    const arr = this.sim.candles;
    if (idx < 0 || idx >= arr.length) return 0;
    return arr[idx].time;
  }
  _stampDrawingTimes(d) {
    if (!d) return d;
    if (d.i1 != null && d.t1 == null) d.t1 = this._timeAtIdx(Math.round(d.i1));
    if (d.i2 != null && d.t2 == null) d.t2 = this._timeAtIdx(Math.round(d.i2));
    if (d.index != null && d.tIdx == null) d.tIdx = this._timeAtIdx(Math.round(d.index));
    if (d.i != null && d.tIdx == null) d.tIdx = this._timeAtIdx(Math.round(d.i));
    if (Array.isArray(d.points)) {
      if (!Array.isArray(d.tPoints)) d.tPoints = [];
      for (let k = 0; k < d.points.length; k++) {
        if (d.tPoints[k] == null) d.tPoints[k] = this._timeAtIdx(Math.round(d.points[k].i));
      }
    }
    return d;
  }
  // Re-derive the candle index for an anchor from its stored time. Falls back
  // to the stored index when the time is missing or stale (back-compat with
  // drawings created by an older version or via addDrawing()).
  _drawingIdxAt(d, key) {
    const tKey = (key === 'i1') ? 't1' : (key === 'i2') ? 't2' : 'tIdx';
    const t = d[tKey];
    if (t != null && t > 0) {
      const idx = this._indexForTime(t);
      if (idx >= 0) return idx;
    }
    return d[key];
  }
  // Same, but for a brush/poly vertex (returns the index for vertex k).
  _drawingVertexIdx(d, k) {
    const t = d.tPoints && d.tPoints[k];
    if (t != null && t > 0) {
      const idx = this._indexForTime(t);
      if (idx >= 0) return idx;
    }
    return d.points && d.points[k] ? d.points[k].i : 0;
  }
  startDrawing(x, y) {
    const idx = this.xToIndex(x);
    const price = this.yToPrice(y);
    const tool = this.activeTool;
    if (tool === 'hline') {
      this.drawings.push({type:'hline', price, color: this.theme.drawing, id: Date.now()});
      // v2.15.0 FIX: setTool() (not a raw assignment) so onToolChange fires
      // and any pending preview state is cleaned up; + repaint immediately.
      this.setTool('cursor');
      this.showToast('Horizontal line added');
      this.autoScale();
      this.invalidate();
      return;
    }
    if (tool === 'vline') {
      // v2.16.0 (#19): store tIdx so the line stays on its candle after a trim.
      const d = {type:'vline', index: idx, color: this.theme.drawing, id: Date.now()};
      this._stampDrawingTimes(d);
      this.drawings.push(d);
      this.setTool('cursor');   // v2.15.0: fires onToolChange
      this.showToast('Vertical line added');
      this.invalidate();
      return;
    }
    if (tool === 'text') {
      // v2.16.0 (#21): default text + the inline editor is opened by
      // double-clicking the placed text (see onDblClick). The toast tells
      // the user the gesture. _stampDrawingTimes adds tIdx so the text
      // follows its candle after a 50k trim.
      const txt = 'Text ' + (this.drawings.length + 1);
      const d = {type:'text', i: idx, p: price, text: txt, color: this.theme.drawing, id: Date.now()};
      this._stampDrawingTimes(d);
      this.drawings.push(d);
      this.setTool('cursor');   // v2.15.0: fires onToolChange
      this.showToast('Text added — double-click to edit');
      this.invalidate();
      return;
    }
    // Tools that use single drag (i1,p1) → (i2,p2)
    // v2.15.0 FIX (regression): the PREVIEW color (drawingActive/orange) was
    // baked into the drawing object, and finishDrawing only fills a MISSING
    // color — so every finished drawing stayed orange forever. The preview
    // look comes from drawOne(d, isActive=true); the object stores NO color.
    if (tool === 'trend' || tool === 'ray' || tool === 'channel' || tool === 'arrow' ||
        tool === 'rect' || tool === 'band' || tool === 'fib') {
      this.currentDrawing = {
        type: tool, i1: idx, p1: price, i2: idx, p2: price,
        id: Date.now()
      };
      return;
    }
    // Brush / Polygon: multi-point paths
    if (tool === 'brush' || tool === 'poly') {
      this.currentDrawing = {
        type: tool,
        points: [{i: idx, p: price, x, y}],
        id: Date.now(),
        closed: false
      };
      return;
    }
    // ── Custom tool support (v2.1.1+) ──────────────────────────────────
    // If the active tool is a registered custom tool, call its onStart(ctx)
    // hook to create the drawing object. If onStart is not provided, create a
    // generic drawing object with the click position.
    const customTool = this._customTools && this._customTools[tool];
    if (customTool) {
      const startCtx = { x: x, y: y, idx: idx, price: price };
      let newDrawing = null;
      if (typeof customTool.onStart === 'function') {
        try {
          newDrawing = customTool.onStart(startCtx);
        } catch (e) {
          if (BADI_DEBUG) console.error('[BadiCharts] Custom tool onStart error (' + tool + '):', e);
        }
      } else {
        // Default: create a generic click-and-drag drawing object.
        const ds = customTool.defaultStyle || {};
        newDrawing = {
          type: tool,
          i1: idx, p1: price, i2: idx, p2: price,
          x1: x, y1: y, x2: x, y2: y,
          color: ds.color || this.theme.drawing,
          lineWidth: ds.lineWidth || 1.5,
          id: Date.now()
        };
      }
      if (newDrawing) {
        // Ensure required fields
        newDrawing.type = newDrawing.type || tool;
        newDrawing.id = newDrawing.id || Date.now();
        // v2.15.0: fall back to the DEFAULT drawing color (not the active
        // preview color) — a finished custom tool must not stay orange.
        newDrawing.color = newDrawing.color || (customTool.defaultStyle && customTool.defaultStyle.color) || this.theme.drawing;
        newDrawing.lineWidth = newDrawing.lineWidth || (customTool.defaultStyle && customTool.defaultStyle.lineWidth) || 1.5;
        this.currentDrawing = newDrawing;
      }
      return;
    }
  }
  updateCurrentDrawing(x, y) {
    if (!this.currentDrawing) return;
    const idx = this.xToIndex(x);
    const price = this.yToPrice(y);
    // ── Custom tool support (v2.1.1+) ──────────────────────────────────
    const customTool = this._customTools && this._customTools[this.currentDrawing.type];
    if (customTool) {
      if (typeof customTool.onUpdate === 'function') {
        const updateCtx = { x: x, y: y, idx: idx, price: price };
        try {
          customTool.onUpdate(this.currentDrawing, updateCtx);
        } catch (e) {
          if (BADI_DEBUG) console.error('[BadiCharts] Custom tool onUpdate error (' + this.currentDrawing.type + '):', e);
        }
      } else {
        // Default: update i2/p2 and x2/y2 (click-and-drag behavior)
        this.currentDrawing.i2 = idx;
        this.currentDrawing.p2 = price;
        this.currentDrawing.x2 = x;
        this.currentDrawing.y2 = y;
      }
      return;
    }
    if (this.currentDrawing.type === 'brush' || this.currentDrawing.type === 'poly') {
      // For brush: add point on every move (freehand)
      if (this.currentDrawing.type === 'brush') {
        this.currentDrawing.points.push({i: idx, p: price, x, y});
      } else {
        // For polygon: update the last point (the one being dragged)
        const pts = this.currentDrawing.points;
        if (pts.length > 0) {
          pts[pts.length - 1] = {i: idx, p: price, x, y};
        }
      }
    } else {
      this.currentDrawing.i2 = idx;
      this.currentDrawing.p2 = price;
    }
  }
  // For polygon: click to add a vertex, double-click to finish
  addPolygonVertex(x, y) {
    if (!this.currentDrawing || this.currentDrawing.type !== 'poly') return;
    const idx = this.xToIndex(x);
    const price = this.yToPrice(y);
    this.currentDrawing.points.push({i: idx, p: price, x, y});
  }
  finishDrawing() {
    if (!this.currentDrawing) return;
    const d = this.currentDrawing;
    // v2.14.0 FIX (audit drawing-75): the theme default color was FORCED onto
    // every finished drawing, wiping any custom color the caller had set on
    // the drawing object (e.g. tools that assign d.color in onStart/onUpdate).
    if (!d.color) d.color = this.theme.drawing;
    if (d.type === 'poly') {
      // v2.10.0: a double-click adds two vertices at the same spot → drop
      // trailing duplicates before closing.
      while (d.points && d.points.length >= 2) {
        const a = d.points[d.points.length - 1], b = d.points[d.points.length - 2];
        if (Math.abs(a.i - b.i) < 0.01 && Math.abs(a.p - b.p) < 1e-9) d.points.pop();
        else break;
      }
      if (!d.points || d.points.length < 3) {
        // Not enough points → discard instead of committing a broken polygon
        this.currentDrawing = null;
        this._drawAnchor = null;
        this._hintOnce('Polygon needs at least 3 points');
        return;
      }
      d.closed = true;
    }
    // v2.16.0 (#19): stamp anchor times so the drawing survives a 50k trim.
    this._stampDrawingTimes(d);
    this.drawings.push(d);
    this.currentDrawing = null;
    this._drawAnchor = null;
    this._mouseDown = false;
    // v2.22.1 (TradingView behavior): the just-placed drawing stays
    // SELECTED — its handles + properties panel are immediately available,
    // so the user can grab and move/adjust it right away without having to
    // click it first.
    this.selectDrawing(d);
    // v2.14.0 FIX (audit #44): setTool() so onToolChange fires.
    this.setTool('cursor');
    this.showToast('Drawing placed');
    this.invalidate();
    // v2.10.0: custom tools may implement onFinish(drawing) to react when
    // their drawing is finally placed on the chart.
    const ct = this._customTools && this._customTools[d.type];
    if (ct && typeof ct.onFinish === 'function') {
      try { ct.onFinish(d); } catch (e) {
        console.error('[BadiCharts] Custom tool onFinish error (' + d.type + '):', e);
      }
    }
  }

  // v2.10.0: hint toasts are throttled so gesture teaching never spams.
  _hintOnce(text) {
    const now = performance.now();
    if (now - (this._lastHint || 0) < 3000) return;
    this._lastHint = now;
    this.showToast(text);
  }

  /* --------------------------- UI Hit Testing ---------------------------- */
  hitButton(x, y) {
    for (const b of this.buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }
  hitDropdown(x, y) {
    if (!this.dropdown) return null;
    for (const it of this.dropdown.items) {
      if (x >= this.dropdown.x && x <= this.dropdown.x + this.dropdown.w &&
          y >= it.y && y <= it.y + it.h) return it;
    }
    return null;
  }
  handleButtonClick(btn) {
    switch (btn.action) {
      case 'indicator': this.openDropdown('indicator', INDICATOR_LIST.map(i => ({label: i.label, value: i.id, checked: this.activeIndicators.has(i.id)})), btn); break;
      case 'tool': this.openDropdown('tool', DRAW_TOOLS.map(t => ({label: t.label, value: t.id})), btn); break;
      case 'reset': this.resetView(); this.showToast('Reset view'); break;
      case 'settings': this.showToast('R reset · +/- zoom · Esc cancel · Del delete'); break;
    }
  }
  openDropdown(type, items, anchorBtn) {
    this.dropdown = {
      type, items: [], x: anchorBtn.x, y: anchorBtn.y + anchorBtn.h + 2,
      w: Math.max(140, anchorBtn.w), h: 0
    };
    let y = this.dropdown.y + 4;
    const itemH = 24;
    for (const it of items) {
      this.dropdown.items.push({...it, y, h: itemH});
      y += itemH;
    }
    this.dropdown.h = y - this.dropdown.y;
  }
  handleDropdownSelect(item) {
    if (this.dropdown.type === 'indicator') {
      if (this.activeIndicators.has(item.value)) {
        this.activeIndicators.delete(item.value);
        this.showToast('Removed: ' + item.label);
      } else {
        this.activeIndicators.add(item.value);
        this.showToast('Added: ' + item.label);
      }
      this.updateLayout();
      this.computeIndicators();
      this.autoScale();
    } else if (this.dropdown.type === 'tool') {
      this.setTool(item.value);   // v2.10.0: go through setTool (fires callbacks, clears pending preview)
      this.showToast('Tool: ' + item.label);
    }
  }
  showToast(text) { this.toast = {text, until: performance.now() + 2200}; }

  /* --------------------------- MAIN RENDER LOOP -------------------------- */
  // v2.5.0+: Per-instance theme — swap the global THEME with this.theme during
  // render so all drawing methods see this instance's colors. Restored in finally
  // so multiple charts on the same page don't interfere with each other.
  render(now) {
    if (!now) now = performance.now();
    const _perfEnabled = this.perf && this.perf.enabled;
    const _perfStart = _perfEnabled ? performance.now() : 0;
    const savedTheme = THEME;
    THEME = this.theme;
    // v2.12.0: reset the per-frame cache rebuild budget at the START of each
    // rendered frame. _safeRenderIndicator() reads this to decide whether to
    // rebuild an indicator's offscreen bitmap now or defer to a later frame.
    this._frameId++;
    this._frameRebuilds = 0;
    this._frameRebuildArea = 0;   // v2.17.1: area budget resets every frame
    try {
      // No auto-tick. User must call update() with real data.
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.W, this.H);
      this.buttons = [];
      this._iconHits = [];  // Reset icon hit registry once per frame (used by drawPane + drawLegend)
      this.drawBackground();
      this.drawGrid();
      this.drawCandles();
      this.drawVolume();
      this.drawIndicators();
      this.drawVolumeProfile();
      this.drawPane();
      this._flushMainDraws();          // v2.18.0: replay pane indicators' drawOnMain() callbacks
      this.drawPaneSeparators();   // v2.14.0: after pane bg so grips aren't covered
      // v2.8.0: markers are drawn AFTER indicators/pane so translucent fills,
      // gradients and the pane backdrop never cover buy/sell arrows.
      this.drawMarkers();
      this.drawDrawings();
      this.drawDrawingPanel();  // Floating properties panel for selected drawing
      this.drawPriceAxis();
      this.drawTimeAxis();
      this.drawCurrentPriceLine();  // After axes so the price label sits ON TOP
      this.drawCountdown(now);     // v2.13.0: 2-digit countdown near forming candle
      this.drawReplayLine();       // v2.19.0: blue replay anchor line
      this.drawCrosshair();
      this.drawLegend();
      this.drawReplayOverlay();     // v2.19.0: REPLAY badge + playback bar
      this.drawSettingsCard();      // Settings popup (drawn last so it overlays everything)
      // HEADLESS (v2.0.0+): built-in toolbar removed — drawToolbar() is now a no-op.
      if (this._showStatusBar) this.drawStatusBar();
      this.drawDropdown();
      this.drawToast(now);
      if (!this.isDragging && this.activeTool === 'eraser') {
        this.hoverDrawing = this.findDrawingAt(this.mouseX, this.mouseY);
      } else this.hoverDrawing = null;
    } finally {
      THEME = savedTheme;
      // v2.16.0 FIX (#22b): window.THEME was published ONCE at module load
      // pointing to a default THEME object. During every render the global
      // THEME is swapped with this.theme (per-instance), then restored — but
      // window.THEME kept pointing at the OLD object the whole time. So an
      // external user reading window.THEME never saw the instance's live
      // colors (and writes to window.THEME did nothing). Re-publish the live
      // THEME here at the END of every render so external code can read it.
      if (typeof window !== 'undefined') window.THEME = savedTheme;
      // v2.21.4: perf instrumentation — record this frame's wall-clock time.
      if (_perfEnabled) {
        const dt = performance.now() - _perfStart;
        const p = this.perf;
        p.lastFrameMs = dt;
        p.frames++;
        const w = p._window;
        w.push(dt);
        if (w.length > p._maxWindow) w.shift();
        let sum = 0, mx = 0;
        for (let i = 0; i < w.length; i++) {
          sum += w[i];
          if (w[i] > mx) mx = w[i];
        }
        p.avgFrameMs = sum / w.length;
        p.maxFrameMs = mx;
      }
    }
  }
  // v2.21.4: getPerfReport() — returns a human-readable perf summary.
  getPerfReport() {
    const p = this.perf;
    if (!p.enabled) return 'Perf instrumentation is OFF. Enable with chart.perf.enabled = true.';
    if (p.frames === 0) return 'No frames rendered yet.';
    const fps = p.avgFrameMs > 0 ? (1000 / p.avgFrameMs).toFixed(1) : '∞';
    return [
      'BADI-CHARTS-V2 (2D) perf report',
      '  frames rendered: ' + p.frames,
      '  last frame:      ' + p.lastFrameMs.toFixed(2) + ' ms',
      '  avg frame:       ' + p.avgFrameMs.toFixed(2) + ' ms  (~' + fps + ' fps)',
      '  worst frame:     ' + p.maxFrameMs.toFixed(2) + ' ms',
      '  budget @60fps:   ' + (p.avgFrameMs < 16.67 ? 'OK' : 'OVER') +
        ' (' + p.avgFrameMs.toFixed(2) + '/' + 16.67 + ' ms)',
      '  candles:         ' + this.sim.candles.length,
      '  indicators:      ' + this.activeIndicators.size,
      '  drawings:        ' + this.drawings.length,
      '  dpr:             ' + this.dpr,
      '  canvas:          ' + this.W + '×' + this.H
    ].join('\n');
  }

  /* --------------------------- Background -------------------------------- */
  drawBackground() {
    const ctx = this.ctx;
    // Fill base background
    ctx.fillStyle = this.theme.bg;
    ctx.fillRect(0, 0, this.W, this.H);
    // Draw background image or video (behind everything, with opacity)
    if (this._bgImage && this._bgImage.complete && this._bgImage.naturalWidth > 0) {
      ctx.save();
      ctx.globalAlpha = this._bgOpacity;
      // Cover-fit: scale image to cover the chart area while maintaining aspect ratio
      const cw = this.chartRight - this.chartLeft;
      const ch = (this.layout.paneBottom || this.chartBottom) - this.chartTop;
      const iw = this._bgImage.naturalWidth;
      const ih = this._bgImage.naturalHeight;
      const scale = Math.max(cw / iw, ch / ih);
      const dw = iw * scale, dh = ih * scale;
      const dx = this.chartLeft + (cw - dw) / 2;
      const dy = this.chartTop + (ch - dh) / 2;
      ctx.drawImage(this._bgImage, dx, dy, dw, dh);
      ctx.restore();
    }
    if (this._bgVideo && this._bgVideo.readyState >= 2) {
      ctx.save();
      ctx.globalAlpha = this._bgOpacity;
      const cw = this.chartRight - this.chartLeft;
      const ch = (this.layout.paneBottom || this.chartBottom) - this.chartTop;
      const vw = this._bgVideo.videoWidth || cw;
      const vh = this._bgVideo.videoHeight || ch;
      const scale = Math.max(cw / vw, ch / vh);
      const dw = vw * scale, dh = vh * scale;
      const dx = this.chartLeft + (cw - dw) / 2;
      const dy = this.chartTop + (ch - dh) / 2;
      ctx.drawImage(this._bgVideo, dx, dy, dw, dh);
      ctx.restore();
    }
    // Status bar background only (toolbar removed in v2.0.0 — headless mode)
    if (this._showStatusBar && this.layout.statusH > 0) {
      ctx.fillStyle = this.theme.toolbarBg;
      ctx.fillRect(0, this.H - this.layout.statusH, this.W, this.layout.statusH);
      ctx.strokeStyle = this.theme.toolbarBorder;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, this.H - this.layout.statusH - 0.5);
      ctx.lineTo(this.W, this.H - this.layout.statusH - 0.5);
      ctx.stroke();
    }
  }

  /* --------------------------- Grid (price marks) ------------------------ */
  drawGrid() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    ctx.strokeStyle = this.theme.grid;
    ctx.lineWidth = 1;
    // v2.18.3 PERF: Path2D batching for grid lines. Previously each grid
    // line was a separate beginPath/moveTo/lineTo/stroke sequence (~20
    // strokes for H lines + ~10 for V lines = ~30 stroke calls). Now we
    // build all H lines into one Path2D and all V lines into another, then
    // stroke each ONCE. 30 stroke calls → 2.
    const hPath = new Path2D();
    const marks = this.priceScale.marks();
    const chartLeft = this.chartLeft, chartRight = this.chartRight;
    for (const m of marks) {
      const y = this.priceTop + m.coord;
      if (y < this.priceTop - 1 || y > this.priceBottom + 1) continue;
      const ys = snapToV(y, dpr);
      hPath.moveTo(chartLeft, ys);
      hPath.lineTo(chartRight, ys);
    }
    const vPath = new Path2D();
    const timeMarks = this.getTimeMarks();
    const chartTop = this.chartTop, chartBottom = this.chartBottom;
    for (const m of timeMarks) {
      const x = this.indexToX(m.index);
      if (x < chartLeft || x > chartRight) continue;
      const xs = snapToH(x, dpr);
      vPath.moveTo(xs, chartTop);
      vPath.lineTo(xs, chartBottom);
    }
    ctx.stroke(hPath);
    ctx.stroke(vPath);
    // v2.14.0 FIX (audit #28): the separator lines + grip handles were drawn
    // HERE, but drawPane() (which runs LATER in the frame) fills each pane
    // with a solid background — covering the grip pill's bottom half. The
    // separators now render in drawPaneSeparators(), called AFTER drawPane.
  }

  // v2.14.0: pane separators + grip handles, drawn AFTER drawPane() so the
  // pane background can never cover them (was inside drawGrid — audit #28).
  // v2.20.5: the centered grip pill (gray rounded rect with 3 dots) was
  // REMOVED at the user's request — dragging the separator line itself is
  // sufficient and the dot was visual clutter. The line's color + thickness
  // still change on hover/drag for feedback, and the 12px hit-test band
  // (see _hitPaneSeparator) makes the whole line draggable.
  drawPaneSeparators() {
    if (this._panes.length === 0) return;
    const ctx = this.ctx;
    const dpr = this.dpr;
    for (const pane of this._panes) {
      const sepY = snapToV(pane.top, dpr);
      const active = (this._paneSepHoverId === pane.id) ||
                     (this._paneResize && this._paneResize.paneId === pane.id);
      ctx.strokeStyle = active ? this.theme.axisBorder : this.theme.toolbarBorder;
      ctx.lineWidth = active ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(0, sepY);
      ctx.lineTo(this.W, sepY);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
  }

  /* --------------------------- Candles (LWC-correct widths) -------------- */
  drawCandles() {
    const ctx = this.ctx;
    const candles = this.sim.candles;
    const dpr = this.dpr;
    // Determine visible range
    const firstIdx = Math.max(0, Math.floor(this.xToIndex(this.chartLeft)) - 1);
    const lastIdx = Math.min(candles.length - 1, Math.ceil(this.xToIndex(this.chartRight)) + 1);

    // LWC-correct candle width in bitmap pixels
    const bodyWidthBmp = candlestickWidth(this.barSpacing, dpr);
    const wickWidthBmp = Math.max(1, Math.floor(dpr));
    // Convert to media coords for drawing (since ctx is setTransform(dpr,...))
    const bodyWidth = bodyWidthBmp / dpr;
    const wickWidth = wickWidthBmp / dpr;

    // v2.2.0+: When very zoomed out (barSpacing < 4 OR body width <= 1 bitmap px),
    // draw each candle as a single crisp vertical line from high to low —
    // no separate body. This is exactly what Lightweight Charts does at small
    // barSpacing and eliminates the "blurry" anti-aliased look caused by
    // overlapping sub-pixel-wide bodies + wicks.
    const drawAsLine = this.barSpacing < 4 || bodyWidthBmp <= 1;

    // v2.18.2 PERF: Precompute the price→Y linear transform. Instead of
    // calling this.priceToY(p) — which calls logicalToCoordinate → isEmpty →
    // bottomMarginPx → internalHeight → isInverted (~5 function calls) — FOUR
    // times per candle (open, high, low, close), we collapse the whole chain
    // into y = A - B * p (two arithmetic ops). For 500 visible candles that's
    // 2000 function calls → 2000 multiply-subtracts per frame, a major win
    // during pan/zoom where this runs every mousemove.
    //
    // Derivation (isInverted() is always false for the price scale):
    //   priceToY(p) = priceTop + logicalToCoordinate(p, 0)
    //               = priceTop + (_h - 1 - (_bm + (_ih - 1) * (p - min) / (max - min)))
    //               = [priceTop + _h - 1 - _bm + (_ih - 1) * min / (max - min)]
    //                 - [(_ih - 1) / (max - min)] * p
    //               = A - B * p
    const ps = this.priceScale;
    const pr = ps._priceRange;
    let fastPriceToY;
    if (!pr || pr.min === pr.max) {
      // Degenerate range — everything maps to the top of the price area.
      const _top = this.priceTop;
      fastPriceToY = function () { return _top; };
    } else {
      const _ih = ps.internalHeight();
      const _bm = ps.bottomMarginPx();
      const _h  = ps._height;
      const range = pr.max - pr.min;
      const B = (_ih - 1) / range;
      const A = this.priceTop + (_h - 1 - _bm) + B * pr.min;
      fastPriceToY = function (p) { return A - B * p; };
    }

    // Clip to price chart area so candles never overflow into toolbar/volume/axis
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.chartLeft, this.priceTop, this.chartRight - this.chartLeft, this.priceBottom - this.priceTop);
    ctx.clip();

    // v2.18.3 PERF: Path2D batching. Instead of calling ctx.fillRect() per
    // candle per rect (wick + body = ~1000 fillRect calls for 500 candles),
    // we build ALL bull-candle rects into one Path2D and ALL bear-candle
    // rects into another, then fill each with a SINGLE ctx.fill(path) call.
    // The browser rasterizes each color in ONE GPU pass instead of 500
    // separate pipeline submissions. This is the Canvas-2D equivalent of
    // WebGL's instanced rendering — without the rewrite cost.
    //
    // fillRect N=1000 → fill(path) N=2. The JS-side path building (path.rect)
    // is faster than ctx.fillRect because it doesn't trigger canvas state
    // management or pipeline flushes — it just appends to an in-memory path.
    const bullPath = new Path2D();
    const bearPath = new Path2D();
    const chartLeft = this.chartLeft, chartRight = this.chartRight;

    for (let i = firstIdx; i <= lastIdx; i++) {
      const c = candles[i];
      const x = this.indexToX(i);
      if (x < chartLeft - bodyWidth || x > chartRight + bodyWidth) continue;

      const yOpen  = fastPriceToY(c.open);
      const yClose = fastPriceToY(c.close);
      const yHigh  = fastPriceToY(c.high);
      const yLow   = fastPriceToY(c.low);

      const isBull = c.close >= c.open;
      const path = isBull ? bullPath : bearPath;

      // v2.6.0: Draw wick and body BOTH centered on the same snapped center point.
      const cxBmp = Math.round(x * dpr);
      const cx = cxBmp / dpr;             // snapped center (bitmap-aligned)
      const wickCenter = cx + wickWidth / 2; // center of the wick column

      // Vertical extents — snapped to bitmap grid for crisp edges
      const wickTop = Math.floor(yHigh * dpr) / dpr;
      const wickBottom = Math.ceil(yLow * dpr) / dpr;
      const wickH = Math.max(1 / dpr, wickBottom - wickTop);
      const bodyTop = Math.round(Math.min(yOpen, yClose) * dpr) / dpr;
      const bodyBottom = Math.round(Math.max(yOpen, yClose) * dpr) / dpr;
      const bodyH = Math.max(1 / dpr, bodyBottom - bodyTop);

      // Append rects to the path (no canvas state change — pure JS).
      path.rect(cx, wickTop, wickWidth, wickH);
      if (!drawAsLine) {
        const bodyLeft = wickCenter - bodyWidth / 2;
        path.rect(bodyLeft, bodyTop, bodyWidth, bodyH);
      }
    }

    // Two fill calls — one per color. The GPU rasterizes all bull rects in
    // one pass, then all bear rects in one pass.
    ctx.fillStyle = this.theme.bull;
    ctx.fill(bullPath);
    ctx.fillStyle = this.theme.bear;
    ctx.fill(bearPath);

    ctx.restore();
  }

  /* --------------------------- Markers (v2.7.0) --------------------------- */
  // Draw candle markers (arrows/icons) above/below candles.
  // Marker: { time | index, position, shape, color, size, text, textColor }
  drawMarkers() {
    if (!this.markers || this.markers.length === 0) return;
    const candles = this.sim.candles;
    if (candles.length === 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.chartLeft, this.priceTop, this.chartRight - this.chartLeft, this.priceBottom - this.priceTop);
    ctx.clip();

    for (const m of this.markers) {
      // Resolve candle index
      let idx = (typeof m.index === 'number') ? m.index : this._indexForTime(m.time);
      if (idx < 0 || idx >= candles.length) continue;
      // v2.14.0 FIX (audit #65): a marker whose time is AFTER the last candle
      // (future signal, or stale timestamp after a data reset) snapped to the
      // last candle via binary search and "stuck" there forever. Hide any
      // time-based marker that doesn't actually belong to a candle.
      if (typeof m.index !== 'number' && typeof m.time === 'number') {
        let mt = m.time;
        if (mt > 1e11) mt = Math.floor(mt / 1000);
        const tfSec = (this.timeframe.ms || 60000) / 1000;
        const candleT = candles[idx].time;
        if (mt > candleT + tfSec * 0.5 + 1) continue;   // future marker → hide
      }
      const c = candles[idx];
      const x = this.indexToX(idx);
      if (x < this.chartLeft - 20 || x > this.chartRight + 20) continue;

      const s = (m.size || 1) * 5;              // base pixel size
      const color = m.color || this.theme.accent;
      const pos = m.position || 'belowBar';
      let y;
      if (pos === 'aboveBar')      y = this.priceToY(c.high) - s - 4;
      else if (pos === 'inBar')    y = this.priceToY(c.close);
      else                         y = this.priceToY(c.low) + s + 4;

      ctx.fillStyle = color;
      switch (m.shape) {
        case 'arrowDown': {
          ctx.beginPath();
          ctx.moveTo(x, y + s);
          ctx.lineTo(x - s * 0.7, y - s * 0.6);
          ctx.lineTo(x + s * 0.7, y - s * 0.6);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'circle': {
          ctx.beginPath();
          ctx.arc(x, y, s * 0.6, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'square': {
          ctx.fillRect(x - s * 0.55, y - s * 0.55, s * 1.1, s * 1.1);
          break;
        }
        case 'cross': {
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(1.5, s * 0.28);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x - s * 0.6, y - s * 0.6); ctx.lineTo(x + s * 0.6, y + s * 0.6);
          ctx.moveTo(x + s * 0.6, y - s * 0.6); ctx.lineTo(x - s * 0.6, y + s * 0.6);
          ctx.stroke();
          break;
        }
        case 'arrowUp':
        default: {
          ctx.beginPath();
          ctx.moveTo(x, y - s);
          ctx.lineTo(x - s * 0.7, y + s * 0.6);
          ctx.lineTo(x + s * 0.7, y + s * 0.6);
          ctx.closePath();
          ctx.fill();
          break;
        }
      }

      // Optional text label
      if (m.text) {
        ctx.font = 'bold 10px -apple-system, Segoe UI, Roboto, sans-serif';
        ctx.fillStyle = m.textColor || color;
        ctx.textAlign = 'center';
        ctx.textBaseline = pos === 'aboveBar' ? 'bottom' : 'top';
        const ty = pos === 'aboveBar' ? y - s - 2 : y + s + 3;
        ctx.fillText(m.text, x, ty);
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      }
    }
    ctx.restore();
  }

  /* --------------------------- Volume ------------------------------------ */
  drawVolume() {
    const ctx = this.ctx;
    const candles = this.sim.candles;
    const firstIdx = Math.max(0, Math.floor(this.xToIndex(this.chartLeft)) - 1);
    const lastIdx = Math.min(candles.length - 1, Math.ceil(this.xToIndex(this.chartRight)) + 1);
    if (firstIdx > lastIdx) return;

    // Find all active, visible volume-type indicators
    const volIndicators = [];
    for (const id of this.activeIndicators) {
      const state = this.indicatorStates.get(id);
      if (state && state.def && state.def.type === 'volume' && state.visible !== false) {
        volIndicators.push(id);
      }
    }
    // Volume bars use candle data directly — but only show if at least one
    // volume-type indicator is active (so the user explicitly opted in).
    if (volIndicators.length === 0) return;

    // Clip to volume area
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.chartLeft, this.volTop, this.chartRight - this.chartLeft, this.volBottom - this.volTop);
    ctx.clip();

    // LWC-style column width
    const bodyWidthBmp = optimalCandlestickWidth(this.barSpacing, this.dpr);
    const bodyWidth = bodyWidthBmp / this.dpr;

    // Draw volume bars from candle data (always drawn when a volume indicator is active)
    for (let i = firstIdx; i <= lastIdx; i++) {
      const c = candles[i];
      const x = this.indexToX(i);
      if (x < this.chartLeft - bodyWidth || x > this.chartRight + bodyWidth) continue;
      const isBull = c.close >= c.open;
      const yTop = this.volToY(c.volume);
      const yBot = this.volBottom;
      ctx.fillStyle = isBull ? this.theme.bullVol : this.theme.bearVol;
      const left = Math.round((x - bodyWidth / 2) * this.dpr) / this.dpr;
      const top = Math.round(yTop * this.dpr) / this.dpr;
      const h = Math.max(1 / this.dpr, yBot - yTop);
      ctx.fillRect(left, top, bodyWidth, h);
    }

    // Render each active volume indicator (e.g., volume SMA) via its render()
    // v2.17.0: kind 'volume' — helpers.drawLine/drawGradientArea now map via volToY.
    const helpers = this._indicatorHelpers(firstIdx, lastIdx, 'volume');
    for (const id of volIndicators) {
      const state = this.indicatorStates.get(id);
      if (!state || !state.def || typeof state.def.render !== 'function') continue;
      this._safeRenderIndicator(id, state, helpers);   // v2.8.0: sandboxed
    }

    ctx.restore();

    // Volume indicator cards (TradingView-style, with icons)
    const volIdx = this.crosshairIndex !== null ?
      clamp(Math.round(this.crosshairIndex), 0, this.sim.candles.length - 1) :
      this.sim.candles.length - 1;
    let labelY = this.volTop + 2;
    for (const id of volIndicators) {
      const state = this.indicatorStates.get(id);
      const val = this._getIndicatorValueAt(id, volIdx);
      this._drawIndicatorLine(this.chartLeft + 6, labelY, id, state.def, state, val);
      labelY += 22;
    }
  }
  _fmtVol(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(0);
  }

  /* --------------------------- Volume Profile ---------------------------- */
  // HEADLESS v2.1.0+: The built-in Volume Profile indicator has been removed.
  // If you want volume profile, register it as a custom indicator via addIndicator().
  drawVolumeProfile() { /* no-op — built-in vprof removed in v2.1.0 */ }

  /* --------------------------- Indicators -------------------------------- */
  // Renders all active overlay-type custom indicators. Each indicator's
  // render(ctx, values, helpers, settings, state) is called inside a clip
  // to the price chart area.
  drawIndicators() {
    // v2.18.2 PERF: early-return when there are NO active overlay-type
    // indicators. The old code unconditionally allocated the helpers object
    // (a large object literal with ~15 closures including drawOnMain,
    // drawLine, drawGradientArea) and did ctx.save/beginPath/rect/clip/
    // restore — ALL of that per frame, for nothing, on a chart with zero
    // overlay indicators (the common "just candles" case). This guard skips
    // all of it. The loop below still filters by type==='overlay', but the
    // guard avoids even ENTERING the function's heavy prologue.
    if (this.activeIndicators.size === 0) return;
    let hasOverlay = false;
    for (const id of this.activeIndicators) {
      const st = this.indicatorStates.get(id);
      if (st && st.def && st.def.type === 'overlay' && st.visible !== false) {
        hasOverlay = true; break;
      }
    }
    if (!hasOverlay) return;

    const ctx = this.ctx;
    const firstIdx = Math.max(0, Math.floor(this.xToIndex(this.chartLeft)));
    const lastIdx = Math.min(this.sim.candles.length - 1, Math.ceil(this.xToIndex(this.chartRight)));

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.chartLeft, this.priceTop, this.chartRight - this.chartLeft, this.priceBottom - this.priceTop);
    ctx.clip();

    // v2.17.0: kind 'overlay' — helpers.drawLine/drawGradientArea map via priceToY.
    const helpers = this._indicatorHelpers(firstIdx, lastIdx, 'overlay');

    for (const id of this.activeIndicators) {
      const state = this.indicatorStates.get(id);
      if (!state || !state.def) continue;
      if (state.def.type !== 'overlay') continue;
      if (state.visible === false) continue;
      if (typeof state.def.render !== 'function') continue;
      this._safeRenderIndicator(id, state, helpers);   // v2.8.0: sandboxed
    }

    ctx.restore();
  }

  /* --------------------------- Pane (dedicated in-chart section) ---------- */
  // v2.9.0: Pane indicators (RSI/MACD) render in a DEDICATED SECTION inside the
  // chart, carved out below the price area by updateLayout() — like TradingView's
  // oscillator panes. The price area shrinks to make room; candles are NEVER
  // covered (the v2.6.0 translucent overlay is gone). The section has its own
  // scale (autoScale → paneScale), grid, separator and axis labels, and shares
  // the time axis with the price area so panning/zooming stay smooth.
  drawPane() {
    // v2.13.0: MULTI-PANE. Each pane indicator renders in its OWN window with
    // its own background, grid, scale, separator and label. All panes share
    // the time axis (vertical grid lines) with the price area so panning/
    // zooming stay perfectly smooth.
    if (this._panes.length === 0) return;

    const ctx = this.ctx;
    const left = this.chartLeft;
    const right = this.chartRight;
    const firstIdx = Math.max(0, Math.floor(this.xToIndex(this.chartLeft)));
    const lastIdx = Math.min(this.sim.candles.length - 1, Math.ceil(this.xToIndex(this.chartRight)));
    const timeMarks = this.getTimeMarks();
    const paneIdx = this.crosshairIndex !== null ?
      clamp(Math.round(this.crosshairIndex), 0, this.sim.candles.length - 1) :
      this.sim.candles.length - 1;
    // v2.17.0: kind 'pane' — helpers.drawLine/drawGradientArea/paneToY map
    // through the CURRENT pane's own scale (re-pointed per pane below).
    const helpers = this._indicatorHelpers(firstIdx, lastIdx, 'pane');

    for (const pane of this._panes) {
      const state = this.indicatorStates.get(pane.id);
      if (!state || !state.def) continue;
      const top = pane.top;
      const bot = pane.bottom;
      if (!(bot > top)) continue;

      ctx.save();
      // Solid pane background — a real section, NOT an overlay over the candles
      ctx.fillStyle = this.theme.bg;
      ctx.fillRect(left, top, right - left, bot - top);

      // Vertical time grid lines continue through this pane (visual continuity
      // with the price area and the other panes).
      ctx.strokeStyle = this.theme.grid;
      ctx.lineWidth = 1;
      const _dpr = this.dpr;
      for (const m of timeMarks) {
        const x = this.indexToX(m.index);
        if (x < left || x > right) continue;
        const xs = snapToH(x, _dpr);
        ctx.beginPath();
        ctx.moveTo(xs, top);
        ctx.lineTo(xs, bot);
        ctx.stroke();
      }

      // Horizontal grid lines from THIS pane's scale marks
      if (pane.scale) {
        const pmarks = pane.scale.marks();
        for (const m of pmarks) {
          const y = top + m.coord;
          if (y < top - 1 || y > bot + 1) continue;
          const ys = snapToV(y, _dpr);
          ctx.beginPath();
          ctx.moveTo(left, ys);
          ctx.lineTo(right, ys);
          ctx.stroke();
        }
      }

      // Clip to this pane and render the indicator (sandboxed).
      ctx.beginPath();
      ctx.rect(left, top, right - left, bot - top);
      ctx.clip();

      // Per-pane region: helpers.paneToY() maps into THIS pane. The helpers
      // object is shared, but the mutable _paneRegion is overwritten per pane.
      helpers._paneRegion.top = top;
      helpers._paneRegion.bottom = bot;
      helpers.paneTop = top;
      helpers.paneBottom = bot;
      helpers.paneScale = pane.scale;

      if (typeof state.def.render === 'function') {
        this._safeRenderIndicator(pane.id, state, helpers);   // v2.8.0: sandboxed
      }
      ctx.restore();

      // Indicator label inside the pane (top-left). v2.17.1: skipped on
      // panes shorter than 22px — the 18px-tall label card would overflow a
      // micro-pane (16px) and bleed into the pane below.
      if (bot - top >= 22) {
        ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
        ctx.textBaseline = 'top';
        const val = this._getIndicatorValueAt(pane.id, paneIdx);
        this._drawIndicatorLine(left + 6, top + 4, pane.id, state.def, state, val);
      }
    }
  }

  /* --------------------------- drawOnMain replay (v2.18.0) --------------- */
  // _flushMainDraws() — replays every active indicator's cached drawOnMain()
  // callbacks against the LIVE main-chart ctx, clipped to the price area.
  // Called once per frame, AFTER drawPane() (so pane indicators have already
  // had a chance to register fresh callbacks during their cache-rebuild) and
  // BEFORE drawPaneSeparators()/drawMarkers()/drawDrawings()/drawCrosshair()
  // (so the price-level line draws under the crosshair and user drawings).
  //
  // Cache contract:
  //   - state._mainDraws is reset to [] immediately before each render() call
  //     inside _safeRenderIndicator (both the animated and cache-rebuild paths).
  //   - render() then calls h.drawOnMain(fn) one or more times, which pushes
  //     fn into state._mainDraws.
  //   - On cache-HIT frames render() is NOT called, so state._mainDraws keeps
  //     the LAST render's callbacks and they are replayed again — the drawing
  //     stays on screen.
  //   - When the indicator's stamp changes (data/settings/theme/scale), the
  //     cache rebuilds, render() runs, and state._mainDraws is replaced.
  //   - removeIndicator() drops the state entirely (the indicatorStates map
  //     entry is deleted), so its callbacks are no longer found here.
  _flushMainDraws() {
    // Sweep active indicators and seed the per-frame queue from each state's
    // cached _mainDraws. Live registrations during THIS frame's render() pass
    // were already pushed to _pendingMainDraws by helpers.drawOnMain(); the
    // sweep below ALSO adds cache-HIT callbacks from indicators whose render()
    // didn't run this frame (so their previous callbacks still replay).
    if (this.activeIndicators.size > 0) {
      for (const id of this.activeIndicators) {
        const state = this.indicatorStates.get(id);
        if (!state || state.visible === false) continue;
        const draws = state._mainDraws;
        if (!draws || draws.length === 0) continue;
        for (let i = 0; i < draws.length; i++) {
          this._pendingMainDraws.push({ fn: draws[i] });
        }
      }
    }
    if (this._pendingMainDraws.length === 0) return;

    const ctx = this.ctx;
    const firstIdx = Math.max(0, Math.floor(this.xToIndex(this.chartLeft)));
    const lastIdx  = Math.min(this.sim.candles.length - 1,
                              Math.ceil(this.xToIndex(this.chartRight)));
    const self = this;
    // Main-chart helpers — a SUBSET of the regular indicator helpers, exposing
    // ONLY the price-area coordinate converters and geometry. Pane-only fields
    // (paneToY, paneTop, paneBottom, volToY, volTop, volBottom) are omitted on
    // purpose: drawOnMain is for drawing on the CANDLE layer, and exposing the
    // pane/volume scales there would be misleading.
    const mainHelpers = {
      firstIdx:    firstIdx,
      lastIdx:     lastIdx,
      indexToX:    function (i) { return self.indexToX(i); },
      priceToY:    function (p) { return self.priceToY(p); },
      chartLeft:   this.chartLeft,
      chartRight:  this.chartRight,
      priceTop:    this.priceTop,
      priceBottom: this.priceBottom,
      barSpacing:  this.barSpacing,
      dpr:         this.dpr,
      candles:     this.sim.candles,
      THEME:       THEME
    };

    ctx.save();
    // Clip to the price area — main-layer drawings stay inside the candle
    // region (they will NOT leak into the time axis, the pane windows, or the
    // volume strip). This is the key fix: a pane indicator's own ctx was
    // clipped to its pane rect, erasing anything drawn at a price-area Y;
    // here the clip matches what the user wants (the price area itself).
    ctx.beginPath();
    ctx.rect(this.chartLeft, this.priceTop,
             this.chartRight - this.chartLeft,
             this.priceBottom - this.priceTop);
    ctx.clip();
    // Replay every pending callback. Each is sandboxed: a throw is logged
    // (when BADI_DEBUG) and swallowed so one broken callback can't kill the
    // chart or hide sibling callbacks.
    const queue = this._pendingMainDraws;
    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      try {
        entry.fn.call(null, ctx, mainHelpers);
      } catch (e) {
        if (BADI_DEBUG) console.error('[BadiCharts] drawOnMain callback error:', e);
      }
    }
    ctx.restore();
    // Clear the per-frame queue (callback cache lives on state._mainDraws and
    // will be re-seeded next frame).
    this._pendingMainDraws.length = 0;
  }

  /* --------------------------- Drawings ---------------------------------- */
  drawDrawings() {
    // v2.18.2 PERF: early-return when there are NO drawings and NO active
    // drawing-in-progress. The old code unconditionally allocated the large
    // `drawOne` closure (a switch with ~10 cases, capturing ctx, _dpr, theme,
    // selectedDrawing, hoverDrawing, customTools) every frame — even on a
    // bare chart with zero drawings. This guard skips all of it.
    if (this.drawings.length === 0 && !this.currentDrawing) return;
    const ctx = this.ctx;
    const _dpr = this.dpr;
    const drawOne = (d, isActive = false) => {
      const color = isActive ? this.theme.drawingActive : (d.color || this.theme.drawing);
      const isSelected = (d === this.selectedDrawing);
      ctx.strokeStyle = isSelected ? this.theme.drawingActive : color;
      ctx.fillStyle = color;
      ctx.lineWidth = d.lineWidth || 1.5;
      const isHover = (d === this.hoverDrawing);
      if (isHover && !isSelected) { ctx.lineWidth = (d.lineWidth || 1.5) + 1; ctx.strokeStyle = this.theme.drawingActive; }
      if (isSelected) { ctx.lineWidth = (d.lineWidth || 1.5) + 0.5; }

      // v2.2.0+: ALL drawings are clipped to the chart area (chartLeft..chartRight,
      // chartTop..chartBottom). No drawing — including hline, fib, band — is allowed
      // to extend onto the price axis or time axis. Price labels for hline/fib/band
      // are drawn INSIDE the chart at the right edge instead of on the price axis.
      const needsClip = true;
      if (needsClip) {
        ctx.save();
        ctx.beginPath();
        // Clip strictly to the price chart area (not into the pane/volume/time axis)
        ctx.rect(this.chartLeft, this.chartTop, this.chartRight - this.chartLeft, this.chartBottom - this.chartTop);
        ctx.clip();
      }

      switch (d.type) {
        case 'trend': {
          const i1 = this._drawingIdxAt(d, 'i1');
          const i2 = this._drawingIdxAt(d, 'i2');
          const x1 = this.indexToX(i1);
          const x2 = this.indexToX(i2);
          const y1 = this.priceToY(d.p1);
          const y2 = this.priceToY(d.p2);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'ray': {
          // Ray: starts at (i1,p1) and extends through (i2,p2) to the right edge
          const i1 = this._drawingIdxAt(d, 'i1');
          const i2 = this._drawingIdxAt(d, 'i2');
          const x1 = this.indexToX(i1);
          const x2 = this.indexToX(i2);
          const y1 = this.priceToY(d.p1);
          const y2 = this.priceToY(d.p2);
          const dx = x2 - x1, dy = y2 - y1;
          if (Math.abs(dx) < 0.001) {
            ctx.beginPath(); ctx.moveTo(x1, this.chartTop); ctx.lineTo(x1, this.chartBottom); ctx.stroke();
          } else {
            const t = (this.chartRight - x1) / dx;
            const yEnd = y1 + dy * t;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(this.chartRight, yEnd);
            ctx.stroke();
            ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'channel': {
          // Parallel channel: two parallel lines from (i1,p1)-(i2,p2) and offset by (p2-p1)
          const i1 = this._drawingIdxAt(d, 'i1');
          const i2 = this._drawingIdxAt(d, 'i2');
          const x1 = this.indexToX(i1);
          const x2 = this.indexToX(i2);
          const y1 = this.priceToY(d.p1);
          const y2 = this.priceToY(d.p2);
          // Main line
          ctx.beginPath();
          ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          // Parallel line: offset = (p2 - p1) added to both endpoints
          const offsetPrice = d.p2 - d.p1;
          const y1b = this.priceToY(d.p1 + offsetPrice);
          const y2b = this.priceToY(d.p2 + offsetPrice);
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(x1, y1b); ctx.lineTo(x2, y2b); ctx.stroke();
          ctx.setLineDash([]);
          // Fill between
          ctx.fillStyle = withAlpha(color, 0.08);
          ctx.beginPath();
          ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
          ctx.lineTo(x2, y2b); ctx.lineTo(x1, y1b); ctx.closePath(); ctx.fill();
          // Endpoint dots
          ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x1, y1b, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x2, y2b, 3, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'arrow': {
          const i1 = this._drawingIdxAt(d, 'i1');
          const i2 = this._drawingIdxAt(d, 'i2');
          const x1 = this.indexToX(i1);
          const x2 = this.indexToX(i2);
          const y1 = this.priceToY(d.p1);
          const y2 = this.priceToY(d.p2);
          // Main shaft
          ctx.beginPath();
          ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          // Arrowhead at end (x2,y2)
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const headLen = 12;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'band': {
          // Band/Zone: shaded horizontal zone between p1 and p2, spanning chart width
          const y1 = this.priceToY(d.p1);
          const y2 = this.priceToY(d.p2);
          const yTop = Math.min(y1, y2), yBot = Math.max(y1, y2);
          ctx.fillStyle = withAlpha(color, 0.15);
          ctx.fillRect(this.chartLeft, yTop, this.chartRight - this.chartLeft, yBot - yTop);
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(this.chartLeft, Math.floor(yTop) + 0.5);
          ctx.lineTo(this.chartRight, Math.floor(yTop) + 0.5);
          ctx.moveTo(this.chartLeft, Math.floor(yBot) + 0.5);
          ctx.lineTo(this.chartRight, Math.floor(yBot) + 0.5);
          ctx.stroke();
          ctx.setLineDash([]);
          // v2.2.0+: Labels INSIDE the chart at the right edge (not on price axis)
          ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          const t1 = this.priceScale.formatLogical(d.p1);
          const t2 = this.priceScale.formatLogical(d.p2);
          const tw1 = ctx.measureText(t1).width + 8;
          const tw2 = ctx.measureText(t2).width + 8;
          ctx.fillStyle = color;
          ctx.fillRect(this.chartRight - tw1 - 2, Math.floor(y1) - 7, tw1, 14);
          ctx.fillRect(this.chartRight - tw2 - 2, Math.floor(y2) - 7, tw2, 14);
          ctx.fillStyle = this.theme.bg;
          ctx.fillText(t1, this.chartRight - 4, Math.floor(y1));
          ctx.fillText(t2, this.chartRight - 4, Math.floor(y2));
          ctx.textAlign = 'left';
          break;
        }
        case 'hline': {
          const y = this.priceToY(d.price);
          const ys = snapToV(y, _dpr);
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(this.chartLeft, ys);
          ctx.lineTo(this.chartRight, ys);
          ctx.stroke();
          ctx.setLineDash([]);
          // v2.2.0+: Price label INSIDE the chart at the right edge (not on price axis)
          const txt = this.priceScale.formatLogical(d.price);
          ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
          const tw = ctx.measureText(txt).width + 8;
          ctx.fillStyle = color;
          ctx.fillRect(this.chartRight - tw - 2, Math.floor(y) - 7, tw, 14);
          ctx.fillStyle = this.theme.bg;
          ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText(txt, this.chartRight - 4, Math.floor(y));
          ctx.textAlign = 'left';
          break;
        }
        case 'vline': {
          const idx = this._drawingIdxAt(d, 'index');
          const x = this.indexToX(idx);
          const xs = snapToH(x, _dpr);
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          // v2.2.0+: clip vline to chartTop..chartBottom only (not into pane/time axis)
          ctx.moveTo(xs, this.chartTop);
          ctx.lineTo(xs, this.chartBottom);
          ctx.stroke();
          ctx.setLineDash([]);
          break;
        }
        case 'rect': {
          const i1 = this._drawingIdxAt(d, 'i1');
          const i2 = this._drawingIdxAt(d, 'i2');
          const x1 = this.indexToX(i1);
          const x2 = this.indexToX(i2);
          const y1 = this.priceToY(d.p1);
          const y2 = this.priceToY(d.p2);
          const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
          const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
          ctx.fillStyle = withAlpha(color, 0.13);
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);
          break;
        }
        case 'poly': {
          if (!d.points || d.points.length < 2) break;
          ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let i = 0; i < d.points.length; i++) {
            const idx = this._drawingVertexIdx(d, i);
            const x = this.indexToX(idx);
            const y = this.priceToY(d.points[i].p);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          if (d.closed) {
            ctx.closePath();
            ctx.fillStyle = withAlpha(color, 0.13);
            ctx.fill();
          }
          ctx.stroke();
          // Vertex dots
          for (let i = 0; i < d.points.length; i++) {
            const idx = this._drawingVertexIdx(d, i);
            const x = this.indexToX(idx);
            const y = this.priceToY(d.points[i].p);
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'text': {
          const idx = this._drawingIdxAt(d, 'i');
          const x = this.indexToX(idx);
          const y = this.priceToY(d.p);
          ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          // Background box for readability
          const tw = ctx.measureText(d.text).width + 8;
          ctx.fillStyle = withAlpha(color, 0.19);
          ctx.fillRect(x - 2, y - 16, tw, 18);
          ctx.fillStyle = color;
          ctx.fillText(d.text, x + 2, y - 2);
          // Anchor dot
          ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'fib': {
          const i1 = this._drawingIdxAt(d, 'i1');
          const i2 = this._drawingIdxAt(d, 'i2');
          const x1 = this.indexToX(i1);
          const x2 = this.indexToX(i2);
          const y1 = this.priceToY(d.p1);
          const y2 = this.priceToY(d.p2);
          const xL = Math.min(x1, x2), xR = Math.max(x1, x2);
          const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
          const colors = ['#787b86','#ef5350','#ff9800','#26a69a','#2962ff','#9c27b0','#ef5350','#26a69a'];
          ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
          ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
          for (let i = 0; i < levels.length; i++) {
            const y = y1 + (y2 - y1) * levels[i];
            ctx.strokeStyle = colors[i]; ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            const ys = snapToV(y, _dpr);
            ctx.beginPath();
            ctx.moveTo(xL, ys);
            ctx.lineTo(xR, ys);
            ctx.stroke();
            ctx.setLineDash([]);
            const p = d.p1 + (d.p2 - d.p1) * levels[i];
            const txt = (levels[i] * 100).toFixed(1) + '% ' + this.priceScale.formatLogical(p);
            const tw = ctx.measureText(txt).width + 6;
            // v2.2.0+: Label INSIDE the chart at the right edge of the fib span
            const labelX = Math.min(xR, this.chartRight - tw - 2);
            ctx.fillStyle = colors[i];
            ctx.fillRect(labelX, Math.floor(y) - 7, tw, 14);
            ctx.fillStyle = this.theme.bg;
            ctx.fillText(txt, labelX + tw - 3, Math.floor(y));
          }
          ctx.textAlign = 'left';
          break;
        }
        case 'brush': {
          if (!d.points || d.points.length === 0) break;
          ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let i = 0; i < d.points.length; i++) {
            const idx = this._drawingVertexIdx(d, i);
            const x = this.indexToX(idx);
            const y = this.priceToY(d.points[i].p);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
          break;
        }
        default: {
          // ── Custom tool support (v2.1.1+) ────────────────────────────
          // If the drawing's type matches a registered custom tool, call its
          // onDraw(ctx, drawing, helpers) to render it.
          const customTool = this._customTools && this._customTools[d.type];
          if (customTool && typeof customTool.onDraw === 'function') {
            const helpers = this._drawingHelpers();
            ctx.save();   // v2.8.0: sandbox user drawing code
            try {
              customTool.onDraw(ctx, d, helpers);
            } catch (e) {
              console.error('[BadiCharts] Custom tool onDraw error (' + d.type + '):', e);
            } finally {
              ctx.restore();
            }
          }
          break;
        }
      }
      if (needsClip) ctx.restore();
    };
    for (const d of this.drawings) drawOne(d);
    if (this.currentDrawing) drawOne(this.currentDrawing, true);

    // v2.10.0: while a two-step drawing is armed (first click done, waiting
    // for the placing click), draw a small anchor dot on point 1 so the user
    // can see the anchor is FIXED and the preview is following the mouse.
    if (this.currentDrawing) {
      const cd = this.currentDrawing;
      let ax = null, ay = null;
      if (cd.i1 !== undefined && cd.p1 !== undefined) {
        ax = this.indexToX(cd.i1); ay = this.priceToY(cd.p1);
      } else if (cd.points && cd.points.length > 0 && (cd.type === 'poly')) {
        ax = this.indexToX(cd.points[0].i); ay = this.priceToY(cd.points[0].p);
      }
      if (ax !== null && this.inChartArea(ax, ay)) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = this.theme.accent;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = this.theme.bg;
        ctx.stroke();
        ctx.restore();
      }
    }

    // v2.7.0: Draw draggable handles for the SELECTED drawing
    if (this.selectedDrawing && !this.selectedDrawing.locked) {
      const handles = this._getDrawingHandles(this.selectedDrawing);
      for (const h of handles) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = this.theme.bg;
        ctx.fill();
        ctx.strokeStyle = this.theme.accent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  // Build the helpers object passed to custom drawing tools' onDraw / onHitTest.
  // Contains coordinate-conversion functions and current chart geometry.
  _drawingHelpers() {
    const self = this;
    return {
      indexToX:    function (i) { return self.indexToX(i); },
      priceToY:    function (p) { return self.priceToY(p); },
      xToIndex:    function (x) { return self.xToIndex(x); },
      yToPrice:    function (y) { return self.yToPrice(y); },
      chartLeft:   self.chartLeft,
      chartRight:  self.chartRight,
      chartTop:    self.chartTop,
      chartBottom: self.chartBottom,
      priceTop:    self.priceTop,
      priceBottom: self.priceBottom,
      barSpacing:  self.barSpacing,
      dpr:         self.dpr,
      THEME:       THEME
    };
  }

  /* --------------------------- Drawing Properties Panel ------------------- */
  // Floating rectangle that appears when a drawing is selected.
  // v2.2.0+: The panel is ALWAYS positioned at the top of the chart (not next
  // to the drawing) so it never overlaps the price/time axes and stays in a
  // predictable location. Contains: delete, lock, color picker, stroke width.
  drawDrawingPanel() {
    if (!this.selectedDrawing) { this._drawPanelHits = []; return; }
    const d = this.selectedDrawing;
    const ctx = this.ctx;
    this._drawPanelHits = [];

    // Panel dimensions
    const iconSize = 20;
    const iconGap = 4;
    const panelH = 30;
    // Icons: delete, lock, color, width, duplicate
    const colors = ['#2962ff','#26a69a','#ef5350','#ff9800','#9c27b0','#e91e63','#f0f3fa','#787b86'];
    const widths = [1, 1.5, 2, 3, 5];
    const numIcons = 5 + colors.length + widths.length; // delete + lock + colorSwatches + widthButtons + duplicate
    const panelW = 8 + numIcons * (iconSize - 6) + 8;

    // v2.2.0+: Always position at the top-center of the chart area.
    const anchorX = clamp(this.chartLeft + (this.chartRight - this.chartLeft - panelW) / 2,
                          this.chartLeft + 4, this.chartRight - panelW - 4);
    const anchorY = this.chartTop + 4;

    // Draw panel background
    ctx.fillStyle = 'rgba(26,30,42,0.95)';
    this._roundRect(anchorX, anchorY, panelW, panelH, 5);
    ctx.fill();
    ctx.strokeStyle = this.theme.toolbarBorder;
    ctx.lineWidth = 1;
    this._roundRect(anchorX + 0.5, anchorY + 0.5, panelW - 1, panelH - 1, 5);
    ctx.stroke();

    let ix = anchorX + 6;
    const iy = anchorY + 5;
    const drawIconBtn = function (iconFn, action, tooltip) {
      const isHover = this._hoverDrawPanelIcon === action;
      if (isHover) {
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        this._roundRect(ix - 2, iy - 1, iconSize + 2, iconSize + 2, 3);
        ctx.fill();
      }
      ctx.strokeStyle = isHover ? this.theme.textBright : this.theme.textDim;
      ctx.fillStyle = isHover ? this.theme.textBright : this.theme.textDim;
      ctx.lineWidth = 1.3;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      iconFn(ix + iconSize / 2, iy + iconSize / 2);
      this._drawPanelHits.push({ action: action, x: ix - 2, y: iy - 1, w: iconSize + 2, h: iconSize + 2 });
      ix += iconSize - 4;
    }.bind(this);

    // 1. Delete (trash) icon
    drawIconBtn(function (cx, cy) {
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 3); ctx.lineTo(cx + 4, cy - 3);
      ctx.moveTo(cx - 3, cy - 3); ctx.lineTo(cx - 3, cy + 4);
      ctx.lineTo(cx + 3, cy + 4); ctx.lineTo(cx + 3, cy - 3);
      ctx.moveTo(cx - 2, cy - 4); ctx.lineTo(cx + 2, cy - 4);
      ctx.stroke();
    }, 'delete', 'Delete');

    // 2. Lock icon
    drawIconBtn(function (cx, cy) {
      if (d.locked) {
        ctx.fillStyle = this.theme.accent;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(cx - 4, cy - 1, 8, 6, 1) : ctx.rect(cx - 4, cy - 1, 8, 6);
        ctx.fill();
        ctx.strokeStyle = this.theme.accent;
        ctx.beginPath();
        ctx.arc(cx, cy - 1, 2.5, Math.PI, 0);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.rect(cx - 4, cy - 1, 8, 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy - 1, 2.5, Math.PI, 0);
        ctx.stroke();
      }
    }, 'lock', 'Lock');

    // 3. Divider
    ctx.strokeStyle = this.theme.toolbarBorder;
    ctx.beginPath(); ctx.moveTo(ix, iy + 2); ctx.lineTo(ix, iy + iconSize - 4); ctx.stroke();
    ix += 4;

    // 4. Color swatches
    for (let ci = 0; ci < colors.length; ci++) {
      const isSelected = d.color === colors[ci];
      ctx.fillStyle = colors[ci];
      ctx.beginPath();
      ctx.arc(ix + 5, iy + iconSize / 2, isSelected ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = this.theme.textBright;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(ix + 5, iy + iconSize / 2, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
      this._drawPanelHits.push({ action: 'color', value: colors[ci], x: ix - 1, y: iy - 1, w: 12, h: iconSize + 2 });
      ix += 12;
    }

    // 5. Divider
    ctx.strokeStyle = this.theme.toolbarBorder;
    ctx.beginPath(); ctx.moveTo(ix, iy + 2); ctx.lineTo(ix, iy + iconSize - 4); ctx.stroke();
    ix += 4;

    // 6. Stroke width buttons
    for (let wi = 0; wi < widths.length; wi++) {
      const isSelected = (d.lineWidth || 1.5) === widths[wi];
      ctx.strokeStyle = isSelected ? this.theme.accent : this.theme.textDim;
      ctx.lineWidth = widths[wi];
      ctx.beginPath();
      ctx.moveTo(ix + 2, iy + iconSize / 2);
      ctx.lineTo(ix + 10, iy + iconSize / 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      this._drawPanelHits.push({ action: 'width', value: widths[wi], x: ix - 1, y: iy - 1, w: 13, h: iconSize + 2 });
      ix += 13;
    }

    // 7. Divider
    ctx.strokeStyle = this.theme.toolbarBorder;
    ctx.beginPath(); ctx.moveTo(ix, iy + 2); ctx.lineTo(ix, iy + iconSize - 4); ctx.stroke();
    ix += 4;

    // 8. Duplicate icon
    drawIconBtn(function (cx, cy) {
      ctx.beginPath();
      ctx.rect(cx - 4, cy - 4, 6, 6);
      ctx.rect(cx - 2, cy - 2, 6, 6);
      ctx.stroke();
    }, 'duplicate', 'Duplicate');

    // 9. Settings (gear) icon — v2.6.0: opens the deep drawing settings card
    drawIconBtn(function (cx, cy) {
      // Gear: circle + 8 teeth
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 1.2, 0, Math.PI * 2);
      ctx.stroke();
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * 3.2, cy + Math.sin(ang) * 3.2);
        ctx.lineTo(cx + Math.cos(ang) * 5, cy + Math.sin(ang) * 5);
        ctx.stroke();
      }
    }, 'settings', 'Deep settings');

    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  }

  // Handle click on drawing properties panel
  _handleDrawPanelClick(x, y) {
    for (const h of this._drawPanelHits) {
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        const d = this.selectedDrawing;
        if (!d) return true;
        switch (h.action) {
          case 'delete':
            this.drawings = this.drawings.filter(function (dd) { return dd !== d; });
            this.selectedDrawing = null;
            this.showToast('Drawing deleted');
            break;
          case 'lock':
            d.locked = !d.locked;
            this.showToast(d.locked ? 'Drawing locked' : 'Drawing unlocked');
            break;
          case 'color':
            d.color = h.value;
            break;
          case 'width':
            d.lineWidth = h.value;
            break;
          case 'duplicate':
            var copy = JSON.parse(JSON.stringify(d));
            // v2.14.0 FIX (audit small-64): Date.now() ids collide when two
            // drawings are duplicated within the same millisecond — use the
            // monotonic id counter.
            copy.id = (this._drawingIdCounter = (this._drawingIdCounter || 1) + 1);
            // v2.14.0 FIX (audit drawing-73): the copy shifted i1/i2/points
            // ONLY — hline (price/index), vline (index), text (i/p) and band
            // etc. stacked EXACTLY on top of the original (invisible until
            // dragged apart). Offset every coordinate family:
            if (copy.i1 !== undefined) copy.i1 += 5;
            if (copy.i2 !== undefined) copy.i2 += 5;
            if (copy.points) copy.points = copy.points.map(function (p) { return { i: p.i + 5, p: p.p, x: p.x, y: p.y }; });
            // hline has no horizontal anchor — nudge its PRICE by 1 tick of
            // the current scale range so the copy is visible under the original.
            if (copy.type === 'hline' && copy.price !== undefined) {
              const pr = this.priceScale.priceRange();
              const tick = pr ? Math.max(1e-9, (pr.max - pr.min) * 0.01) : 1;
              copy.price += tick;
            }
            if (copy.index !== undefined && copy.type !== 'hline') copy.index += 5;   // vline
            if (copy.i !== undefined) copy.i += 5;                                     // text anchor
            this.drawings.push(copy);
            this.selectedDrawing = copy;
            this.invalidate();
            this.showToast('Drawing duplicated');
            break;
          case 'settings':
            // v2.6.0: Open the deep drawing settings card
            this._openDrawingSettingsCard(d);
            break;
        }
        return true;
      }
    }
    return false;
  }

  // v2.6.0: Open a deep settings card for a drawing (like the indicator
  // settings card). Fields: color, lineWidth, plus any custom-tool defaultStyle
  // keys. When saved, the custom tool's onSettings(drawing, settings) hook is
  // called (if defined) so tools can react to deep changes.
  _openDrawingSettingsCard(d) {
    const fields = [];
    fields.push({key: 'color', label: 'Color', type: 'color', value: d.color || this.theme.drawing});
    fields.push({key: 'lineWidth', label: 'Line Width', type: 'number', value: d.lineWidth || 1.5});
    // Custom tool: include defaultStyle keys as editable fields
    const tool = this._customTools && this._customTools[d.type];
    if (tool && tool.defaultStyle) {
      for (const key in tool.defaultStyle) {
        if (key === 'color' || key === 'lineWidth') continue;
        const v = tool.defaultStyle[key];
        if (typeof v === 'number') fields.push({key: key, label: key, type: 'number', value: v});
        else if (typeof v === 'string') fields.push({key: key, label: key, type: 'color', value: v});
      }
    }
    const w = 220;
    const h = 36 + fields.length * 30 + 40;
    this.settingsCard = {
      id: '__drawing__' + d.id,
      isDrawingCard: true,      // marker: save applies to the drawing
      drawing: d,
      x: this.chartLeft + 50,
      y: this.chartTop + 50,
      w: w,
      h: h,
      fields: fields,
      title: (tool && tool.label) ? tool.label : (d.type || 'Drawing'),
      draft: {color: d.color, lineWidth: d.lineWidth}
    };
  }

  findDrawingAt(x, y) {
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      if (this.hitTestDrawing(this.drawings[i], x, y)) return this.drawings[i];
    }
    return null;
  }
  hitTestDrawing(d, x, y) {
    const tol = 6;
    switch (d.type) {
      case 'trend':
      case 'arrow':
      case 'ray': {
        // v2.16.0 (#19): derive indices from stored times so a drawing stays
        // hittable after a 50k trim shifts the array.
        const i1 = this._drawingIdxAt(d, 'i1'), i2 = this._drawingIdxAt(d, 'i2');
        const x1 = this.indexToX(i1), x2 = this.indexToX(i2);
        const y1 = this.priceToY(d.p1), y2 = this.priceToY(d.p2);
        return this._distToSeg(x, y, x1, y1, x2, y2) < tol;
      }
      case 'channel': {
        // Test both the main line and the parallel line
        const i1 = this._drawingIdxAt(d, 'i1'), i2 = this._drawingIdxAt(d, 'i2');
        const x1 = this.indexToX(i1), x2 = this.indexToX(i2);
        const y1 = this.priceToY(d.p1), y2 = this.priceToY(d.p2);
        const offsetPrice = d.p2 - d.p1;
        const y1b = this.priceToY(d.p1 + offsetPrice);
        const y2b = this.priceToY(d.p2 + offsetPrice);
        return this._distToSeg(x, y, x1, y1, x2, y2) < tol
            || this._distToSeg(x, y, x1, y1b, x2, y2b) < tol;
      }
      case 'band': {
        // v2.16.0 FIX (#20): only the top/bottom EDGES (and the implied corner
        // zones) capture a click — the INTERIOR is pannable, like a Rectangle.
        // The old code accepted any point inside the band, so a user could
        // never pan the chart while the cursor was inside a band region.
        const y1 = this.priceToY(d.p1);
        const y2 = this.priceToY(d.p2);
        const yTop = Math.min(y1, y2), yBot = Math.max(y1, y2);
        const onTop = Math.abs(y - yTop) < tol;
        const onBot = Math.abs(y - yBot) < tol;
        return (onTop || onBot) && x >= this.chartLeft && x <= this.chartRight;
      }
      case 'hline': {
        const y1 = this.priceToY(d.price);
        return Math.abs(y - y1) < tol && x >= this.chartLeft && x <= this.chartRight;
      }
      case 'vline': {
        const idx = this._drawingIdxAt(d, 'index');
        const xx = this.indexToX(idx);
        return Math.abs(x - xx) < tol && y >= this.chartTop && y <= this.chartBottom;
      }
      case 'rect': {
        const i1 = this._drawingIdxAt(d, 'i1'), i2 = this._drawingIdxAt(d, 'i2');
        const x1 = this.indexToX(i1), x2 = this.indexToX(i2);
        const y1 = this.priceToY(d.p1), y2 = this.priceToY(d.p2);
        const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
        const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
        return (Math.abs(y - ry) < tol || Math.abs(y - (ry + rh)) < tol) && x >= rx && x <= rx + rw
            || (Math.abs(x - rx) < tol || Math.abs(x - (rx + rw)) < tol) && y >= ry && y <= ry + rh;
      }
      case 'brush':
      case 'poly': {
        if (!d.points || d.points.length < 2) return false;
        for (let i = 1; i < d.points.length; i++) {
          const idx1 = this._drawingVertexIdx(d, i - 1);
          const idx2 = this._drawingVertexIdx(d, i);
          const x1 = this.indexToX(idx1), y1 = this.priceToY(d.points[i - 1].p);
          const x2 = this.indexToX(idx2), y2 = this.priceToY(d.points[i].p);
          if (this._distToSeg(x, y, x1, y1, x2, y2) < tol) return true;
        }
        return false;
      }
      case 'text': {
        const idx = this._drawingIdxAt(d, 'i');
        const x1 = this.indexToX(idx), y1 = this.priceToY(d.p);
        // v2.14.0 FIX: was `ctx.font` — a bare identifier that threw
        // ReferenceError whenever any click landed in this branch, blocking
        // chart drag/pan whenever a text drawing existed on the canvas.
        this.ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
        const tw = this.ctx.measureText(d.text).width + 8;
        return x >= x1 - 2 && x <= x1 + tw && y >= y1 - 16 && y <= y1 + 2;
      }
      default: {
        // ── Custom tool support (v2.1.1+) ────────────────────────────
        // If the drawing's type matches a registered custom tool, call its
        // onHitTest(drawing, x, y, helpers) to determine if (x,y) is on it.
        const customTool = this._customTools && this._customTools[d.type];
        if (customTool && typeof customTool.onHitTest === 'function') {
          const helpers = this._drawingHelpers();
          try {
            return !!customTool.onHitTest(d, x, y, helpers);
          } catch (e) {
            if (BADI_DEBUG) console.error('[BadiCharts] Custom tool onHitTest error (' + d.type + '):', e);
          }
        }
        return false;
      }
    }
    return false;
  }
  _distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  /* --------------------------- Current Price Line ------------------------ */
  drawCurrentPriceLine() {
    const ctx = this.ctx;
    const last = this.sim.candles[this.sim.candles.length - 1];
    if (!last) return;
    const y = this.priceToY(last.close);
    // Only draw if the price line is within the visible price area
    if (y < this.priceTop - 2 || y > this.priceBottom + 2) return;
    // v2.20.6: skip the LABEL (but still draw the dashed line) when the
    // crosshair is active and its Y is within ~22px of the last close.
    // Before, the current-price label and the crosshair price label both
    // sat at chartRight+1 and overlapped each other when the cursor was
    // near the last close. Now the crosshair label takes precedence.
    const crosshairNear = this.mouseInside && this.crosshairIndex !== null &&
                          Math.abs(this.mouseY - y) < 22;
    const isBull = last.close >= last.open;
    const color = isBull ? this.theme.currentPriceBull : this.theme.currentPriceBear;
    // Dashed line across the chart (stops at chartRight)
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    const ys = snapToV(y, this.dpr);
    ctx.beginPath();
    ctx.moveTo(this.chartLeft, ys);
    ctx.lineTo(this.chartRight, ys);
    ctx.stroke();
    ctx.setLineDash([]);
    if (crosshairNear) return;   // v2.20.6: let the crosshair label show alone
    // v2.3.1: Price label ON the price axis (chartRight + 1) — this is where it
    // belongs: the axis is "connected to the chart" and the price label sits on it.
    const txt = this.priceScale.formatLogical(last.close);
    ctx.font = 'bold 11px -apple-system, Segoe UI, Roboto, sans-serif';
    const tw = ctx.measureText(txt).width + 10;
    const labelX = this.chartRight + 1;
    const labelY = Math.floor(y) - 9;
    // Clamp label Y so it stays within the price axis area
    const minY = this.chartTop;
    const maxY = (this.layout.paneBottom || this.chartBottom) - 18;
    const clampedY = clamp(labelY, minY, maxY);
    ctx.fillStyle = color;
    ctx.fillRect(labelX, clampedY, tw, 18);
    ctx.fillStyle = this.theme.textBright;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, labelX + tw / 2, clampedY + 9);
    ctx.textAlign = 'left';
  }

  /* --------------------------- Countdown (v2.13.0) ----------------------- */
  // A small number that floats just to the RIGHT of the forming (last)
  // candle, vertically aligned with its close price. No border, no card, no
  // background — just digits. As the price moves, the number moves with it
  // (same Y as the close); as the chart pans, it moves with the candle (same
  // X via indexToX).
  //
  // v2.14.0 FIX: the old code subtracted `performance.now()/1000` (ms since
  // PAGE LOAD) from a Unix candle time — the countdown was always garbage
  // (huge negative → clamped to 00). Now uses Date.now()/1000 (real Unix
  // seconds).
  //
  // v2.14.0 FIX: format 'mm' clamped at 99, so H4/D1 timeframes (240 / 1440
  // minutes remaining) showed a pinned "99" for hours.
  //
  // v2.20.1 FIX: 'auto' used to switch to a CLOCK string ("1:05", "23:59")
  // when remaining > 60s — that's 3–4 digits + a colon, breaking the
  // "2-digit number" promise from v2.13.0.
  //
  // v2.20.2 FIX: v2.20.1 picked the unit from the TIMEFRAME (tfSec), so a
  // future-dated last candle made remainingSec exceed tfSec → clamp fired →
  // countdown pinned at "99". Now 'auto' picks the unit from remainingSec
  // DIRECTLY — always 2 digits, never a clamped "99". See chart-webgl.js
  // drawCountdown for the full table.
  drawCountdown(now) {
    if (!this._countdown || !this._countdown.enabled) return;
    const candles = this.sim.candles;
    const N = candles.length;
    if (N === 0) return;
    const last = candles[N - 1];
    if (!last || !last.time) return;
    const tfMs = this.timeframe.ms || 60000;
    const tfSec = Math.round(tfMs / 1000);
    // v2.19.0 (2D): BAR REPLAY — countdown counts REPLAY time while active.
    let remainingSec;
    if (this.replay && this.replay.active) {
      if (!this.replay.playing) return;   // paused → no live countdown
      const p = Math.max(0, Math.min(1, this.replay._progress));
      remainingSec = Math.max(0, Math.round(tfSec * (1 - p)));
    } else {
      const candleCloseSec = last.time + tfSec;
      const nowSec = Math.floor(Date.now() / 1000);   // v2.14.0: real Unix time
      remainingSec = candleCloseSec - nowSec;
      if (remainingSec < 0) remainingSec = 0;
    }
    // v2.21.1: CLAMP remaining to tfSec - 1 so the countdown never shows
    // more than the timeframe's natural max (e.g. 59 for 1m, not 63).
    if (remainingSec >= tfSec) remainingSec = tfSec - 1;
    // v2.16.0 (#22d): the local `pad2` here shadowed the module-level helper
    // — same implementation, but the shadow was a code-smell flag in the
    // audit. Reusing the module helper; behavior is identical.
    const fmt = this._countdown.format || 'auto';
    let text;
    if (fmt === 'auto') {
      // v2.20.2: pick the largest unit whose value fits in 2 digits, based on
      // the ACTUAL remaining time (not the timeframe).
      if (remainingSec < 100) {
        text = pad2(remainingSec);
      } else if (remainingSec < 6000) {
        text = pad2(Math.floor(remainingSec / 60));
      } else if (remainingSec < 360000) {
        text = pad2(Math.floor(remainingSec / 3600));
      } else if (remainingSec < 8640000) {
        text = pad2(Math.floor(remainingSec / 86400));
      } else {
        text = pad2(Math.min(99, Math.floor(remainingSec / 604800)));
      }
    } else if (fmt === 'hh:mm') {
      text = Math.floor(remainingSec / 3600) + ':' + pad2(Math.floor((remainingSec % 3600) / 60));
    } else if (fmt === 'mm:ss') {
      text = Math.floor(remainingSec / 60) + ':' + pad2(remainingSec % 60);
    } else if (fmt === 'ss') {
      text = pad2(remainingSec % 60);
    } else if (fmt === 'mm') {
      text = pad2(Math.min(99, Math.floor(remainingSec / 60)));
    } else if (fmt === 'hh') {
      text = pad2(Math.min(99, Math.floor(remainingSec / 3600)));
    } else {
      text = pad2(remainingSec % 60);
    }

    // Position: just right of the forming candle body, at the close price Y.
    // indexToX(lastIdx) gives the candle's CENTER; adding barSpacing/2 puts
    // us at the right edge of its slot. +offsetX pushes us clear of the body
    // so the number is "near, not stuck to" the candle.
    const x = this.indexToX(N - 1) + this.barSpacing / 2 + this._countdown.offsetX;
    const y = this.priceToY(last.close) + this._countdown.offsetY;
    // Don't draw if the close is off-screen or the candle is off the right edge
    if (y < this.priceTop - 6 || y > this.priceBottom + 6) return;
    if (x < this.chartLeft - 4 || x > this.chartRight - 4) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.font = this._countdown.fontSize + 'px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = this._countdown.color || this.theme.textDim;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, Math.floor(x), Math.floor(y));
    ctx.restore();
  }

  /* --------------------------- Price Axis -------------------------------- */
  // v2.20.8: Lightweight-Charts-style axis — no separate background fill
  // (the chart bg extends seamlessly), but KEEP the subtle border line.
  // v2.20.9: restored the border line that v2.20.8 removed.
  drawPriceAxis() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    // Subtle vertical border line between chart and price axis.
    ctx.strokeStyle = this.theme.axisBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const axBorder = snapToH(this.chartRight, dpr);
    ctx.moveTo(axBorder, this.chartTop);
    ctx.lineTo(axBorder, this.chartBottom);
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = this.theme.axisText;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    // v2.20.7: when the crosshair is active and over the price area, SKIP
    // marks that fall within the crosshair price label's Y range — only
    // ONE number (the crosshair label, drawn later) shows at the cursor's Y.
    const chActive = this.mouseInside && this.crosshairIndex !== null;
    const chY = (chActive && this.mouseY >= this.priceTop - 2 && this.mouseY <= this.priceBottom + 2)
      ? this.mouseY : null;
    // v2.20.6: Y-based collision detection for price marks — skip any mark
    // whose Y is within 12px of the previous drawn mark. Prevents the
    // jumbled "numbers on top of numbers" when marks are dense.
    const marks = this.priceScale.marks();
    let prevDrawnY = -Infinity;
    for (const m of marks) {
      const y = this.priceTop + m.coord;
      if (y < this.priceTop - 1 || y > this.priceBottom + 1) continue;
      if (y - prevDrawnY < 12) continue;   // v2.20.6: collision detection
      if (chY !== null && Math.abs(y - chY) < 14) continue;   // v2.20.7: crosshair label takes this slot
      ctx.fillText(m.label, this.chartRight + 6, Math.floor(y));
      prevDrawnY = y;
    }

    // v2.13.0: Per-pane scale labels — same axis strip, beside each pane's
    // region. Each pane has its own scale (RSI 0..100, MACD -∞..+∞, ...), so
    // the labels in the strip change as you cross a pane boundary.
    // v2.20.6: same Y-based collision detection per pane.
    // v2.20.7: skip marks under the crosshair label when the cursor is in
    // this pane's region.
    for (const pane of this._panes) {
      if (!pane.scale || !(pane.bottom > pane.top)) continue;
      ctx.fillStyle = this.theme.axisText;
      const paneChY = (chActive && this.mouseY >= pane.top && this.mouseY <= pane.bottom)
        ? this.mouseY : null;
      let prevPaneY = -Infinity;
      for (const m of pane.scale.marks()) {
        const y = pane.top + m.coord;
        if (y < pane.top + 7 || y > pane.bottom - 5) continue;
        if (y - prevPaneY < 12) continue;   // v2.20.6: collision detection
        if (paneChY !== null && Math.abs(y - paneChY) < 14) continue;   // v2.20.7
        ctx.fillText(m.label, this.chartRight + 6, Math.floor(y));
        prevPaneY = y;
      }
    }
  }

  /* --------------------------- Time Axis --------------------------------- */
  // Get the time (unix seconds) at any index, including future indices.
  // For indices within the data: use actual candle time.
  // For indices beyond the data (future): extrapolate from last candle + timeframe.
  _timeAtIndex(idx) {
    const N = this.sim.candles.length;
    if (N === 0) return 0;
    if (idx >= 0 && idx < N) return this.sim.candles[idx].time;
    if (idx < 0) {
      // Past: extrapolate backwards from first candle
      return this.sim.candles[0].time + idx * (this.timeframe.ms / 1000);
    }
    // Future: extrapolate from last candle
    return this.sim.candles[N - 1].time + (idx - (N - 1)) * (this.timeframe.ms / 1000);
  }

  // v2.20.8: Lightweight-Charts-style time axis — no separate background
  // fill, but KEEP the subtle top border line between chart and time axis.
  // v2.20.9: restored the border line that v2.20.8 removed.
  drawTimeAxis() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const axisTop = this.layout.paneBottom || this.chartBottom;
    // Subtle horizontal border line between chart and time axis.
    ctx.strokeStyle = this.theme.axisBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, snapToV(axisTop, dpr));
    ctx.lineTo(this.chartRight, snapToV(axisTop, dpr));
    ctx.stroke();
    ctx.lineWidth = 1;

    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = this.theme.axisText;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const marks = this.getTimeMarks();
    // v2.16.0 FIX (#2): label width is MEASURED with the same font set above,
    // not estimated as `label.length * 6 + 8`. The estimate broke on bold
    // fonts, wide glyphs, and (important for the future) Arabic month names
    // — every label assumed 6px per char and either overlapped or wasted
    // space. Collision detection now uses the real measured width.
    const tzOpts = {locale: this._locale, timezone: this._timezone, hour12: this._hour12};
    // v2.20.7: when the crosshair is active, SKIP time marks whose X is
    // within ~45px of the crosshair's X — only ONE time number (the
    // crosshair label, drawn later) shows at the cursor's X.
    const chActiveT = this.mouseInside && this.crosshairIndex !== null;
    const chX = chActiveT ? this.indexToX(Math.round(this.crosshairIndex)) : null;
    let prevRightEdge = -Infinity;
    for (const m of marks) {
      const x = this.indexToX(m.index);
      if (x < this.chartLeft || x > this.chartRight) continue;
      if (chX !== null && Math.abs(x - chX) < 45) continue;   // v2.20.7: crosshair label takes this slot
      // Use the time stored in the mark (works for past, present, and future)
      const label = formatTickMark(m.time, m.weight, this.timeframe.label, tzOpts);
      const labelW = ctx.measureText(label).width + 8;
      const leftEdge = x - labelW / 2;
      const rightEdge = x + labelW / 2;
      if (leftEdge < prevRightEdge + 4) continue;
      if (leftEdge < this.chartLeft + 4 || rightEdge > this.chartRight - 4) continue;
      ctx.fillText(label, Math.floor(x), axisTop + this.layout.timeAxisH / 2);
      prevRightEdge = rightEdge;
    }
  }

  /* --------------------------- Crosshair --------------------------------- */
  drawCrosshair() {
    // v2.16.0 FIX (#3): the crosshair was blanket-disabled on touch devices
    // (`if (_isMobile) return`), but touch handlers DO maintain crosshairIndex
    // for the OHLC legend. A mobile user could see the legend update but never
    // the aiming lines or the time/price readouts — a disabled feature, not a
    // missing one. Now drawn on touch too, with a thinner dash so it doesn't
    // dominate the small screen.
    if (!this.mouseInside || this.crosshairIndex === null) return;
    // v2.10.0: crosshair stays visible while a drawing tool is active too —
    // the user needs it to aim; hiding it made the chart look frozen.
    if (!this.inChartArea(this.mouseX, this.mouseY) &&
        !this.inPriceAxis(this.mouseX, this.mouseY)) return;
    const ctx = this.ctx;
    const dpr = this.dpr;
    const idx = Math.round(this.crosshairIndex);
    // Allow crosshair in future area (idx >= candles.length) and past area (idx < 0)
    const x = this.indexToX(idx);
    const y = this.mouseY;

    ctx.strokeStyle = this.theme.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash(this._isMobile ? [2, 4] : [3, 3]);
    if (this.mouseY < (this.layout.paneBottom || this.chartBottom)) {
      const xs = snapToH(x, dpr);
      ctx.beginPath();
      ctx.moveTo(xs, this.chartTop);
      ctx.lineTo(xs, this.layout.paneBottom || this.chartBottom);
      ctx.stroke();
    }
    if (this.mouseX < this.chartRight) {
      const ys = snapToV(y, dpr);
      ctx.beginPath();
      ctx.moveTo(this.chartLeft, ys);
      ctx.lineTo(this.chartRight, ys);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Time label on axis — use _timeAtIndex for future/past support
    // v2.15.0 FIX: the format matched the timeframe LABEL ('1D'/'1W'/'1S') —
    // any other naming ('D1', 'H4', '1d', custom labels) silently fell into
    // the wrong branch. The format now derives from timeframe.ms itself:
    //   >= 1 day  → YYYY-MM-DD
    //   < 1 min   → HH:MM:SS
    //   else      → MM-DD HH:MM
    // v2.16.0 FIX (#8): honor opts.timezone / opts.locale for display. The
    // data stays in Unix seconds; only the DISPLAYED string changes. Default
    // (no tz/locale) keeps the previous UTC + English short-month behavior.
    const t = this._timeAtIndex(idx);
    const date = new Date(t * 1000);
    const tfSec = (this.timeframe.ms || 60000) / 1000;
    let timeStr;
    if (this._locale || this._timezone) {
      // Use Intl for locale + timezone display. The format chooses fields
      // automatically based on the timeframe span (matches the UTC branches
      // below: day+ for daily+, time+seconds for sub-minute).
      try {
        const opts = {};
        if (tfSec >= 86400) { opts.year = 'numeric'; opts.month = 'short'; opts.day = '2-digit'; }
        else if (tfSec < 60) { opts.hour = '2-digit'; opts.minute = '2-digit'; opts.second = '2-digit'; }
        else { opts.month = 'short'; opts.day = '2-digit'; opts.hour = '2-digit'; opts.minute = '2-digit'; }
        if (this._timezone) opts.timeZone = this._timezone;
        if (this._hour12 != null) opts.hour12 = this._hour12;
        timeStr = new Intl.DateTimeFormat(this._locale || undefined, opts).format(date);
      } catch (_) { timeStr = String(t); }
    } else {
      const pad2 = (n) => n < 10 ? '0' + n : '' + n;
      if (tfSec >= 86400) {
        timeStr = date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
      } else if (tfSec < 60) {
        timeStr = pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes()) + ':' + pad2(date.getUTCSeconds());
      } else {
        timeStr = pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate()) + ' ' + pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes());
      }
    }
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    const tw = ctx.measureText(timeStr).width + 14;
    // v2.16.0 FIX (#4): CLAMP the time label so it stays inside the chart's
    // horizontal extent. The old `x - tw/2` clipped outside the canvas on the
    // left and overlapped the price axis on the right.
    const axisBottom = (this.layout.paneBottom || this.chartBottom);
    const labelX = clamp(x, this.chartLeft + tw / 2 + 2, this.chartRight - tw / 2 - 2);
    ctx.fillStyle = this.theme.crosshairLabel;
    ctx.fillRect(labelX - tw / 2, axisBottom + 2, tw, this.layout.timeAxisH - 4);
    ctx.fillStyle = this.theme.textBright;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, labelX, axisBottom + this.layout.timeAxisH / 2);

    // v2.3.1: Price label ON the price axis (chartRight + 1) — the axis is
    // connected to the chart and the crosshair price label sits on it.
    // v2.14.0 FIX (audit #26): when the cursor is over a PANE, the price-axis
    // label showed an inferred PRICE (meaningless for RSI/MACD space). Now it
    // shows that pane's own VALUE using the pane's scale and formatter.
    if (this.mouseX < this.chartRight && this.mouseY >= this.chartTop && this.mouseY <= this.chartBottom) {
      let valueStr = null;
      let valueFormatter = null;
      const pane = this._panes.find(p => this.mouseY >= p.top && this.mouseY <= p.bottom);
      if (pane && pane.scale) {
        // Pane region: invert through the pane scale
        const paneVal = pane.scale.coordinateToLogical(y - pane.top, 0);
        valueStr = pane.scale.formatLogical(paneVal);
        valueFormatter = this.theme.text;
      } else if (this.mouseY >= this.priceTop && this.mouseY <= this.priceBottom) {
        const price = this.yToPrice(y);
        valueStr = this.priceScale.formatLogical(price);
      }
      if (valueStr != null) {
        const pw = ctx.measureText(valueStr).width + 14;
        ctx.fillStyle = this.theme.crosshairLabel;
        ctx.fillRect(this.chartRight + 1, Math.floor(y) - 9, pw, 18);
        ctx.fillStyle = this.theme.textBright;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(valueStr, this.chartRight + 1 + pw / 2, Math.floor(y));
        ctx.textAlign = 'left';
      }
    }
  }

  /* --------------------------- Legend ------------------------------------ */
  drawLegend() {
    const ctx = this.ctx;
    const isMobile = this.W < 600;
    // If no data, just show the symbol/timeframe label
    if (this.sim.candles.length === 0) {
      ctx.font = 'bold ' + (isMobile ? '11px' : '12px') + ' -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = this.theme.textBright;
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const symTxt = this.symbol.label + ' · ' + this.timeframe.label;
      ctx.fillText(symTxt, this.chartLeft + 6, this.chartTop + 6);
      return;
    }
    const idx = this.crosshairIndex !== null ?
      Math.round(this.crosshairIndex) :
      this.sim.candles.length - 1;
    // For OHLC display, use the last candle if hovering in the future area
    const ohlcIdx = clamp(idx, 0, this.sim.candles.length - 1);
    const c = this.sim.candles[ohlcIdx];
    if (!c) return;

    // Line 1: Symbol · Timeframe · OHLC · Change (always shown)
    ctx.font = (isMobile ? '11px' : '12px') + ' -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    let x = this.chartLeft + 6;
    const y = this.chartTop + 6;
    ctx.fillStyle = this.theme.textBright;
    ctx.font = 'bold ' + (isMobile ? '11px' : '12px') + ' -apple-system, Segoe UI, Roboto, sans-serif';
    const symTxt = this.symbol.label + ' · ' + this.timeframe.label;
    ctx.fillText(symTxt, x, y);
    x += ctx.measureText(symTxt).width + (isMobile ? 8 : 12);
    ctx.font = (isMobile ? '11px' : '12px') + ' -apple-system, Segoe UI, Roboto, sans-serif';
    const isBull = c.close >= c.open;
    const parts = isMobile ? [
      {label:'C', value: this.priceScale.formatLogical(c.close)}
    ] : [
      {label:'O', value: this.priceScale.formatLogical(c.open)},
      {label:'H', value: this.priceScale.formatLogical(c.high)},
      {label:'L', value: this.priceScale.formatLogical(c.low)},
      {label:'C', value: this.priceScale.formatLogical(c.close)},
      {label:'Vol', value: this._fmtVol(c.volume)}
    ];
    const gap = isMobile ? 8 : 12;
    for (const p of parts) {
      ctx.fillStyle = this.theme.textDim;
      ctx.fillText(p.label, x, y);
      x += ctx.measureText(p.label).width + 4;
      ctx.fillStyle = isBull ? this.theme.bull : this.theme.bear;
      ctx.fillText(p.value, x, y);
      x += ctx.measureText(p.value).width + gap;
    }
    const change = c.close - c.open;
    // v2.16.0 (#18): guard against open=0 (still possible if a previous
    // version stored data without the _norm repair, or if a custom feed
    // bypasses DataLayer). 0/0 = NaN → toFixed produced "NaN%"; nonzero/0
    // produced Infinity → "Infinity%". Both are now "—" until open is real.
    const changePct = (c.open !== 0 && isFinite(c.open))
      ? (change / c.open) * 100
      : 0;
    const changeTxt = (c.open !== 0 && isFinite(c.open))
      ? ((change >= 0 ? '+' : '') + this.priceScale.formatLogical(Math.abs(change)) +
         ' (' + (change >= 0 ? '+' : '') + changePct.toFixed(2) + '%)')
      : this.priceScale.formatLogical(Math.abs(change)) + ' (—)';
    ctx.fillStyle = isBull ? this.theme.bull : this.theme.bear;
    ctx.fillText(changeTxt, x, y);

    // Lines 2+: Indicator labels stacked VERTICALLY (TradingView-style)
    // Each indicator on its own line, with icons shown when active (clicked).
    if (isMobile) return;
    // HEADLESS v2.1.0+: legend lists only overlay-type indicators.
    // (Pane indicators are drawn inside drawPane, volume indicators inside drawVolume.)
    const overlayIds = Array.from(this.activeIndicators).filter(id => {
      const s = this.indicatorStates.get(id);
      return s && s.def && s.def.type === 'overlay';
    });
    if (overlayIds.length === 0) return;
    // If collapsed, draw only the expand arrow (downward) and return
    let lineY = y + 20;
    const lineH = 22;  // matches cardH in _drawIndicatorLine
    if (this.indicatorsCollapsed) {
      // Draw a small downward arrow to expand
      this._drawCollapseArrow(this.chartLeft + 8, lineY, false);
      return;
    }
    // Draw each indicator on its own line
    for (const id of overlayIds) {
      const state = this.indicatorStates.get(id) || {visible: true, settings: {}, icons: ['hide','edit','settings','delete'], customIcons: []};
      const meta = state.def || {label: id, color: this.theme.ma1};
      const val = this._getIndicatorValueAt(id, idx);
      this._drawIndicatorLine(this.chartLeft + 6, lineY, id, meta, state, val);
      lineY += lineH;
    }
    // Draw the collapse arrow (upward) below the last indicator
    this._drawCollapseArrow(this.chartLeft + 8, lineY + 2, true);
  }

  // Draw a single indicator line (label + value + icons when active)
  // Stacked vertically like TradingView.
  // v2.21.3: FIXED-VALUE-WIDTH — icons stay at a fixed position (never
  // shift with the value). See chart-webgl.js _drawIndicatorLine.
  _drawIndicatorLine(x, y, id, meta, state, val) {
    const ctx = this.ctx;
    const isActive = this.activeIndicatorCard === id;
    const isVisible = state.visible !== false;
    const color = meta.color;
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const labelTxt = meta.label + ':';
    // v2.21.4 PERF: cache label width per indicator (label never changes).
    let labelW;
    if (state._labelW && state._labelWKey === labelTxt) {
      labelW = state._labelW;
    } else {
      labelW = ctx.measureText(labelTxt).width;
      state._labelW = labelW;
      state._labelWKey = labelTxt;
    }
    // v2.21.3: fixed-width value area — truncate long values with "…"
    // v2.21.4 PERF: binary search instead of char-by-char while loop.
    const VAL_FIXED_W = 72;
    const VAL_MAX_W = VAL_FIXED_W - 4;
    let valTxt = String(val || '');
    if (ctx.measureText(valTxt).width > VAL_MAX_W) {
      let lo = 1, hi = valTxt.length, best = 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (ctx.measureText(valTxt.slice(0, mid) + '…').width <= VAL_MAX_W) {
          best = mid; lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      valTxt = valTxt.slice(0, best) + '…';
    }
    const valW = VAL_FIXED_W;   // always the SAME width — icons never shift
    // v2.8.0: reserve space for the red "!" error badge when this indicator threw
    const errW = state._errFlag ? 14 : 0;
    // Background when active (subtle highlight)
    const allIcons = state.icons.concat(state.customIcons.map(c => c.id));
    const iconSize = 16;   // bigger icons for easier clicking
    const iconGap = 4;
    const padX = 6;
    const cardH = 22;      // taller card for better readability
    const centerY = y + cardH / 2;
    let iconsW = 0;
    if (isActive) iconsW = allIcons.length * (iconSize + iconGap);
    const lineW = padX + labelW + 6 + valW + errW + (isActive ? iconsW + 8 : 0) + padX;
    // Highlight background when active
    if (isActive) {
      ctx.fillStyle = 'rgba(42,46,57,0.85)';
      this._roundRect(x - 2, y, lineW, cardH, 3);
      ctx.fill();
    }
    // Label (colored dot + name)
    ctx.fillStyle = isVisible ? color : this.theme.textDim;
    // Small colored dot before the label
    ctx.beginPath();
    ctx.arc(x + padX + 3, centerY, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(labelTxt, x + padX + 10, centerY);
    // Value
    ctx.fillStyle = isVisible ? this.theme.text : this.theme.textDim;
    ctx.fillText(valTxt, x + padX + 10 + labelW + 6, centerY);
    // v2.8.0: red "!" badge — this indicator's calculate()/render() threw
    if (state._errFlag) {
      const bx = x + padX + 10 + labelW + 6 + valW + 9;
      ctx.fillStyle = '#ef5350';
      ctx.beginPath();
      ctx.arc(bx, centerY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', bx, centerY + 0.5);
      ctx.textAlign = 'left';
    }
    // Icons (only when active)
    if (isActive) {
      let ix = x + padX + 10 + labelW + 6 + valW + 8 + errW;
      for (const iconId of allIcons) {
        const isCustom = state.customIcons.find(c => c.id === iconId);
        this._drawIndicatorIcon(ix, y + (cardH - iconSize) / 2, iconId, iconSize, id, isCustom);
        ix += iconSize + iconGap;
      }
    } else {
      // Register the line area for hit-test (click to activate)
      this._iconHits.push({type: 'card', id: id, x: x - 2, y: y, w: lineW, h: cardH});
    }
  }

  // Draw the collapse/expand arrow for the indicator list
  _drawCollapseArrow(x, y, isUp) {
    const ctx = this.ctx;
    const isHover = this.hoverIcon && this.hoverIcon.iconId === 'collapse';
    const color = isHover ? this.theme.textBright : this.theme.textDim;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Draw a small triangle (up or down)
    const cx = x + 5, cy = y + 6, sz = 4;
    ctx.beginPath();
    if (isUp) {
      // Up arrow (collapse) — triangle pointing up
      ctx.moveTo(cx, cy - sz);
      ctx.lineTo(cx - sz, cy + sz);
      ctx.lineTo(cx + sz, cy + sz);
    } else {
      // Down arrow (expand) — triangle pointing down
      ctx.moveTo(cx, cy + sz);
      ctx.lineTo(cx - sz, cy - sz);
      ctx.lineTo(cx + sz, cy - sz);
    }
    ctx.closePath();
    ctx.fill();
    // Register for hit-test
    this._iconHits.push({type: 'icon', indId: '__legend__', iconId: 'collapse', x: x - 3, y: y - 3, w: 16, h: 16});
  }

  // Get formatted value for an indicator at a given candle index
  _getIndicatorValueAt(id, idx) {
    const state = this.indicatorStates.get(id);
    if (!state || !state.def) return '—';
    const def = state.def;
    const values = this.indCache[id];

    // For volume-type indicators with no calculate(): use the candle's volume directly.
    if (def.type === 'volume' && typeof def.calculate !== 'function') {
      const c = this.sim.candles[idx];
      if (c) return this._fmtVol(c.volume);
      return '—';
    }

    if (!values || idx < 0) return '—';
    // v2.15.0: multi-series objects ({macd:[], signal:[], hist:[]}) — the
    // header reads the FIRST numeric array member (MACD → values.macd).
    // Previously the object itself was indexed → undefined → the pane header
    // showed "—" forever even with perfectly good data.
    let series = values;
    if (!Array.isArray(series) && typeof series === 'object') {
      for (const k of Object.keys(series)) {
        if (Array.isArray(series[k])) { series = series[k]; break; }
      }
    }
    if (!Array.isArray(series) || idx >= series.length) return '—';
    const v = series[idx];
    if (v === null || v === undefined) return '—';

    // Custom formatValue() hook
    if (typeof def.formatValue === 'function') {
      try { return def.formatValue(v, state.settings); } catch (e) { return '—'; }
    }

    // Default formatting based on type/indicator
    if (def.type === 'volume') return this._fmtVol(v);
    if (typeof v === 'number') {
      // For price-like values, use the price formatter if available
      if (def.type === 'overlay') return this.priceScale.formatLogical(v);
      if (def.type === 'pane') {
        // v2.15.0: pane values use the PANE's own formatter (decimals derived
        // from the pane's value span) instead of a blind toFixed(2).
        const pane = this._panes.find(p => p.id === id);
        if (pane && pane.scale) return pane.scale.formatLogical(v);
      }
      return v.toFixed(2);
    }
    if (typeof v === 'object' && v !== null) {
      // Some indicators return objects (e.g., MACD {macd, signal, hist})
      // Show the first numeric property
      for (const k in v) {
        if (typeof v[k] === 'number') return v[k].toFixed(2);
      }
    }
    return String(v);
  }

  // Draw a single indicator card with label + value + icons
  // Returns the card width
  _drawIndicatorCard(x, y, id, meta, state, val) {
    const ctx = this.ctx;
    const isActive = this.activeIndicatorCard === id;
    const isVisible = state.visible !== false;
    const color = meta.color;
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    // Measure label + value
    const labelTxt = meta.label + ':';
    const labelW = ctx.measureText(labelTxt).width;
    const valTxt = val || '';
    const valW = ctx.measureText(valTxt).width;
    // Icons: show only when active (hovered/selected) OR always show on desktop
    const allIcons = state.icons.concat(state.customIcons.map(c => c.id));
    const iconSize = 14;
    const iconGap = 2;
    let iconsW = 0;
    if (isActive) {
      iconsW = allIcons.length * (iconSize + iconGap);
    }
    const padX = 6;
    const cardH = 18;
    const errW = state._errFlag ? 14 : 0;   // v2.8.0: red "!" error badge space
    const cardW = padX + labelW + 4 + valW + errW + padX + (isActive ? iconsW + 4 : 0);
    // Background: always show a solid background for pane cards (RSI/MACD) so they're
    // readable over the indicator line. For main-legend cards, only show when active.
    const isPaneCard = id === 'rsi' || id === 'macd';
    if (isActive || isPaneCard) {
      // Use solid panelBg for pane cards (fully opaque) so text is always readable
      ctx.fillStyle = isActive ? 'rgba(42,46,57,0.95)' : (isPaneCard ? this.theme.panelBg : 'rgba(19,23,34,0.85)');
      this._roundRect(x, y - 3, cardW, cardH + 4, 3);
      ctx.fill();
      // Subtle border for pane cards
      if (isPaneCard && !isActive) {
        ctx.strokeStyle = 'rgba(42,46,57,0.6)';
        ctx.lineWidth = 1;
        this._roundRect(x + 0.5, y - 2.5, cardW - 1, cardH + 3, 3);
        ctx.stroke();
      }
    }
    // Label (colored)
    ctx.fillStyle = isVisible ? color : this.theme.textDim;
    ctx.fillText(labelTxt, x + padX, y);
    // Value
    ctx.fillStyle = isVisible ? this.theme.text : this.theme.textDim;
    ctx.fillText(valTxt, x + padX + labelW + 4, y);
    // v2.8.0: red "!" badge — this indicator's calculate()/render() threw
    if (state._errFlag) {
      const bx = x + padX + labelW + 4 + valW + 9;
      ctx.fillStyle = '#ef5350';
      ctx.beginPath();
      ctx.arc(bx, y + cardH / 2 - 1, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', bx, y + cardH / 2 - 0.5);
      ctx.textAlign = 'left';
    }
    // Icons (only when active)
    if (isActive) {
      let ix = x + padX + labelW + 4 + valW + 4 + errW;
      for (const iconId of allIcons) {
        const isCustom = state.customIcons.find(c => c.id === iconId);
        this._drawIndicatorIcon(ix, y, iconId, iconSize, id, isCustom);
        ix += iconSize + iconGap;
      }
    } else {
      // Register the card area for hit-test (click to activate)
      this._iconHits.push({type: 'card', id: id, x: x, y: y - 2, w: cardW, h: cardH + 2});
    }
    return cardW;
  }

  // Draw a single icon (default icons: hide/edit/settings/delete, or custom)
  _drawIndicatorIcon(x, y, iconId, size, indId, custom) {
    const ctx = this.ctx;
    const cx = x + size / 2;
    const cy = y + size / 2 - 1;
    const state = this.indicatorStates.get(indId);
    const isHover = this.hoverIcon && this.hoverIcon.indId === indId && this.hoverIcon.iconId === iconId;
    // Hover background
    if (isHover) {
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      this._roundRect(x, y - 1, size, size, 2);
      ctx.fill();
    }
    ctx.strokeStyle = isHover ? this.theme.textBright : this.theme.textDim;
    ctx.fillStyle = isHover ? this.theme.textBright : this.theme.textDim;
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (custom && custom.icon) {
      // Custom icon: draw as emoji/text
      ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(custom.icon, cx, cy);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    } else {
      // v2.6.0: Beautiful TradingView-style icons
      switch (iconId) {
        case 'hide': {
          // TradingView-style eye: almond (lens) shape + pupil
          if (state && state.visible !== false) {
            // Open eye — almond outline
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy);
            ctx.quadraticCurveTo(cx, cy - 4.5, cx + 5, cy);
            ctx.quadraticCurveTo(cx, cy + 4.5, cx - 5, cy);
            ctx.closePath();
            ctx.stroke();
            // Pupil (filled dot)
            ctx.beginPath();
            ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Hidden — almond outline + diagonal slash
            ctx.beginPath();
            ctx.moveTo(cx - 5, cy);
            ctx.quadraticCurveTo(cx, cy - 4.5, cx + 5, cy);
            ctx.quadraticCurveTo(cx, cy + 4.5, cx - 5, cy);
            ctx.closePath();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - 4.5, cy - 3.5);
            ctx.lineTo(cx + 4.5, cy + 3.5);
            ctx.stroke();
          }
          break;
        }
        case 'edit': {
          // Pencil: diagonal body + filled tip (TradingView-style)
          ctx.beginPath();
          ctx.moveTo(cx - 2.2, cy + 2.8);   // bottom-left of body
          ctx.lineTo(cx + 2.2, cy - 2.8);   // top-right of body
          ctx.lineTo(cx + 3.6, cy - 1.4);   // body width
          ctx.lineTo(cx - 0.8, cy + 4.2);   // near the tip
          ctx.closePath();
          ctx.stroke();
          // Tip (filled triangle)
          ctx.beginPath();
          ctx.moveTo(cx - 2.2, cy + 2.8);
          ctx.lineTo(cx - 3.4, cy + 4.6);
          ctx.lineTo(cx - 0.8, cy + 4.2);
          ctx.closePath();
          ctx.fill();
          break;
        }
        case 'settings': {
          // Gear: ring + inner hole + 8 teeth (TradingView-style)
          ctx.beginPath();
          ctx.arc(cx, cy, 3, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(cx, cy, 1.1, 0, Math.PI * 2);
          ctx.stroke();
          for (let a = 0; a < 8; a++) {
            const ang = (a / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(ang) * 3, cy + Math.sin(ang) * 3);
            ctx.lineTo(cx + Math.cos(ang) * 4.6, cy + Math.sin(ang) * 4.6);
            ctx.stroke();
          }
          break;
        }
        case 'delete': {
          // Trash can: lid + handle + tapered body + ribs (TradingView-style)
          ctx.beginPath();
          ctx.moveTo(cx - 4, cy - 2.5);
          ctx.lineTo(cx + 4, cy - 2.5);   // lid
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - 1.8, cy - 2.5);
          ctx.lineTo(cx - 1.8, cy - 4);   // handle
          ctx.lineTo(cx + 1.8, cy - 4);
          ctx.lineTo(cx + 1.8, cy - 2.5);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - 3, cy - 2.5);
          ctx.lineTo(cx - 2.4, cy + 4.2); // left side (tapered)
          ctx.lineTo(cx + 2.4, cy + 4.2);
          ctx.lineTo(cx + 3, cy - 2.5);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - 1.2, cy - 0.8);
          ctx.lineTo(cx - 1.2, cy + 2.2); // left rib
          ctx.moveTo(cx + 1.2, cy - 0.8);
          ctx.lineTo(cx + 1.2, cy + 2.2); // right rib
          ctx.stroke();
          break;
        }
      }
    }
    // Register icon for hit-test
    this._iconHits.push({type: 'icon', indId: indId, iconId: iconId, x: x, y: y - 1, w: size, h: size});
  }

  // Open a settings card popup for an indicator
  _openSettingsCard(id, state) {
    // HEADLESS v2.1.0+: settings fields are auto-generated from the indicator's
    // settings object (any key present becomes an editable field).
    // v2.16.0 FIX (#22c): the previous implementation only knew about a
    // hard-coded list (period/mult/fast/slow/signal/bins/color). Any other
    // key the user put on `state.settings` was silently invisible in the
    // card, even though the comment above the loop claimed "any key present
    // becomes an editable field". Now ALL keys are discovered; the known
    // ones get friendly labels + types, everything else is auto-labeled.
    const fields = [];
    const s = state.settings || {};
    const known = {
      period:  {label: 'Period',      type: 'number'},
      mult:    {label: 'Std Dev Mult', type: 'number'},
      fast:    {label: 'Fast',        type: 'number'},
      slow:    {label: 'Slow',        type: 'number'},
      signal:  {label: 'Signal',      type: 'number'},
      bins:    {label: 'Bins',        type: 'number'},
      color:   {label: 'Color',       type: 'color'}
    };
    // First, the known keys (in their stable order — so the indicator's
    // "primary" fields stay at the top in the same order users are used to).
    for (const k of Object.keys(known)) {
      if (s[k] !== undefined) {
        fields.push({key: k, label: known[k].label, type: known[k].type, value: s[k]});
      }
    }
    // Then, every other key in insertion order (custom user settings).
    for (const k of Object.keys(s)) {
      if (known[k]) continue;
      const v = s[k];
      let t = 'text';
      if (typeof v === 'number') t = 'number';
      else if (typeof v === 'boolean') t = 'checkbox';
      else if (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)) t = 'color';
      // Prettify the label: camelCase → "Camel Case", snake_case → "Snake Case".
      const label = k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
                     .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      fields.push({key: k, label: label, type: t, value: v});
    }
    const w = 220;
    const h = 36 + fields.length * 30 + 40;
    this.settingsCard = {
      id: id,
      x: this.chartLeft + 50,
      y: this.chartTop + 50,
      w: w,
      h: h,
      fields: fields,
      // v2.5.1: Use state.def.label (the indicator definition) instead of the
      // removed `meta` variable. Falls back to the id if no definition is found.
      title: (state.def && state.def.label) ? state.def.label : id,
      // Editable field values (copied so user can cancel)
      draft: Object.assign({}, s)
    };
  }

  // Draw the settings card popup
  drawSettingsCard() {
    if (!this.settingsCard) return;
    const ctx = this.ctx;
    const sc = this.settingsCard;
    // Backdrop overlay (semi-transparent) — clicking outside closes
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, this.W, this.H);
    // Card background
    ctx.fillStyle = this.theme.panelBg;
    this._roundRect(sc.x, sc.y, sc.w, sc.h, 6);
    ctx.fill();
    ctx.strokeStyle = this.theme.toolbarBorder;
    ctx.lineWidth = 1;
    this._roundRect(sc.x + 0.5, sc.y + 0.5, sc.w - 1, sc.h - 1, 6);
    ctx.stroke();
    // Title bar
    ctx.fillStyle = this.theme.toolbarBg;
    this._roundRect(sc.x, sc.y, sc.w, 28, 6);
    // Only round top corners — redraw bottom of title bar as straight
    ctx.fillRect(sc.x, sc.y + 20, sc.w, 8);
    ctx.fill();
    ctx.font = 'bold 12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = this.theme.textBright;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(sc.title + ' Settings', sc.x + 10, sc.y + 14);
    // Close button (X)
    ctx.strokeStyle = this.theme.textDim;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sc.x + sc.w - 18, sc.y + 10);
    ctx.lineTo(sc.x + sc.w - 12, sc.y + 18);
    ctx.moveTo(sc.x + sc.w - 12, sc.y + 10);
    ctx.lineTo(sc.x + sc.w - 18, sc.y + 18);
    ctx.stroke();
    // Fields
    let fy = sc.y + 36;
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    for (const f of sc.fields) {
      ctx.fillStyle = this.theme.text;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(f.label, sc.x + 10, fy + 8);
      // Input box
      const ix = sc.x + 90, iy = fy, iw = sc.w - 100, ih = 20;
      ctx.fillStyle = this.theme.bg;
      this._roundRect(ix, iy, iw, ih, 3);
      ctx.fill();
      ctx.strokeStyle = this.theme.toolbarBorder;
      this._roundRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1, 3);
      ctx.stroke();
      // Value text
      ctx.fillStyle = this.theme.textBright;
      ctx.textAlign = 'left';
      const valStr = String(f.type === 'color' ? f.value : f.value);
      ctx.fillText(valStr, ix + 6, iy + ih / 2);
      if (f.type === 'color') {
        // Color swatch
        ctx.fillStyle = f.value;
        ctx.fillRect(ix + iw - 20, iy + 3, 14, 14);
      }
      fy += 30;
    }
    // Save / Cancel buttons
    const btnY = sc.y + sc.h - 32;
    // Cancel
    ctx.fillStyle = this.theme.buttonBg;
    this._roundRect(sc.x + 10, btnY, 80, 24, 3);
    ctx.fill();
    ctx.strokeStyle = this.theme.toolbarBorder;
    this._roundRect(sc.x + 10.5, btnY + 0.5, 79, 23, 3);
    ctx.stroke();
    ctx.fillStyle = this.theme.text;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Cancel', sc.x + 50, btnY + 12);
    // Save
    ctx.fillStyle = this.theme.accent;
    this._roundRect(sc.x + sc.w - 90, btnY, 80, 24, 3);
    ctx.fill();
    ctx.fillStyle = this.theme.textBright;
    ctx.fillText('Save', sc.x + sc.w - 50, btnY + 12);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  /* --------------------------- Toolbar ----------------------------------- */
  // HEADLESS MODE (v2.0.0+): The built-in toolbar has been REMOVED.
  // All chart actions (tools, indicators, reset, settings) are now controlled
  // programmatically through the public API:
  //
  //   chart.setTool('trend');          // activate a drawing tool
  //   chart.addIndicator('rsi');       // add an indicator
  //   chart.removeIndicator('rsi');    // remove an indicator
  //   chart.resetView();               // reset zoom/pan
  //   chart.clearDrawings();           // remove all drawings
  //
  // Build your own HTML/CSS toolbar and wire its buttons to these methods.
  drawToolbar() { /* no-op — headless mode (v2.0.0+) */ }
  drawButton(btn) {
    const ctx = this.ctx;
    const isHover = this.hoverButton && this.hoverButton.id === btn.id;
    ctx.fillStyle = isHover ? this.theme.buttonHover : this.theme.buttonBg;
    this._roundRect(btn.x, btn.y, btn.w, btn.h, 4); ctx.fill();
    ctx.strokeStyle = this.theme.toolbarBorder; ctx.lineWidth = 1;
    this._roundRect(btn.x + 0.5, btn.y + 0.5, btn.w - 1, btn.h - 1, 4); ctx.stroke();
    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = this.theme.buttonText;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const cx = btn.x + btn.w / 2, cy = btn.y + btn.h / 2;
    const textW = ctx.measureText(btn.label).width;
    let labelX = cx;
    if (btn.icon === 'caret') labelX = cx - 6;
    if (btn.icon === 'plus') labelX = cx - 6;
    ctx.fillText(btn.label, labelX, cy);
    if (btn.icon === 'caret') {
      ctx.fillStyle = this.theme.textDim;
      ctx.beginPath();
      ctx.moveTo(cx + textW / 2 + 4, cy - 3);
      ctx.lineTo(cx + textW / 2 + 9, cy);
      ctx.lineTo(cx + textW / 2 + 4, cy + 3);
      ctx.closePath(); ctx.fill();
    } else if (btn.icon === 'plus') {
      ctx.strokeStyle = this.theme.textDim; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx + textW / 2 + 4, cy - 3);
      ctx.lineTo(cx + textW / 2 + 9, cy + 2);
      ctx.moveTo(cx + textW / 2 + 6.5, cy - 4);
      ctx.lineTo(cx + textW / 2 + 6.5, cy + 3);
      ctx.stroke();
    }
    this.buttons.push(btn);
    return btn.x + btn.w;
  }
  _roundRect(x, y, w, h, r) {
    const ctx = this.ctx;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* --------------------------- Status Bar -------------------------------- */
  drawStatusBar() {
    const ctx = this.ctx;
    const isMobile = this.W < 600;
    const y = this.H - this.layout.statusH;
    const last = this.sim.candles[this.sim.candles.length - 1];
    if (!last) return;
    ctx.font = (isMobile ? '10px' : '11px') + ' -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let x = isMobile ? 6 : 10;
    const gap = isMobile ? 10 : 16;
    const draw = (label, value, color) => {
      ctx.fillStyle = this.theme.textDim;
      ctx.fillText(label, x, y + this.layout.statusH / 2);
      x += ctx.measureText(label).width + 4;
      ctx.fillStyle = color || this.theme.text;
      ctx.fillText(value, x, y + this.layout.statusH / 2);
      x += ctx.measureText(value).width + gap;
    };
    if (isMobile) {
      // v2.14.0 FIX (audit #21): the "24h" stats were literally the last 24
      // CANDLES regardless of timeframe (24 hourly bars = 24h, but 24 daily
      // bars = 24 days, 24 one-minute bars = 24 minutes — fake numbers).
      // The window is now computed from the TIMEFRAME: lastN = 24h / tf, and
      // the label states the real window. Bid/Ask/Spread (fabricated close±0.5
      // values) were removed entirely — inventing market data is worse than
      // showing none.
      draw('B', this.priceScale.formatLogical(last.close), this.theme.text);
      const win = this._windowCandles(24 * 3600 * 1000);
      draw('H', this.priceScale.formatLogical(win.reduce((m, c) => Math.max(m, c.high), 0)));
      draw('Vol', this._fmtVol(win.reduce((s, c) => s + (c.volume || 0), 0)));
    } else {
      draw('Close', this.priceScale.formatLogical(last.close), last.close >= last.open ? this.theme.bull : this.theme.bear);
      const win = this._windowCandles(24 * 3600 * 1000);
      const label = this.timeframe.ms >= 24 * 3600 * 1000 ? 'All High' : '24h High';
      draw(label, this.priceScale.formatLogical(win.reduce((m, c) => Math.max(m, c.high), 0)));
      const label2 = this.timeframe.ms >= 24 * 3600 * 1000 ? 'All Low' : '24h Low';
      draw(label2, this.priceScale.formatLogical(win.reduce((m, c) => Math.min(m, c.low), Infinity)));
      draw('Vol', this._fmtVol(win.reduce((s, c) => s + (c.volume || 0), 0)));
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = this.theme.textDim;
    if (isMobile) {
      const toolShort = TOOL_SHORTCUTS[this.activeTool] || '↖';
      ctx.fillText(toolShort, this.W - 6, y + this.layout.statusH / 2);
    } else {
      // v2.10.0 FIX: the old code did DRAW_TOOLS.find(...).label which threw a
      // TypeError for CUSTOM tools (addDrawingTool) — the exception aborted
      // every rendered frame and the chart appeared FROZEN while a custom tool
      // was active. Look the label up safely in both lists and add a short
      // interaction hint so users know the click → click gesture.
      const tdef = DRAW_TOOLS.find(t => t.id === this.activeTool)
        || (this._customTools && this._customTools[this.activeTool]);
      let toolTxt = 'Tool: ' + (tdef && tdef.label ? tdef.label : this.activeTool);
      const hint = this._toolHint(this.activeTool);
      if (hint) toolTxt += '  ' + hint;
      ctx.fillText(toolTxt, this.W - 10, y + this.layout.statusH / 2);
      if (this.drawings.length > 0) {
        ctx.fillStyle = this.theme.accent;
        ctx.fillText(this.drawings.length + ' drawings', this.W - 10 - ctx.measureText(toolTxt).width - 16, y + this.layout.statusH / 2);
      }
    }
  }

  // v2.14.0: candles covering the last `windowMs` of TIME (not a fixed bar
  // count) — used by the status bar so "24h High" really means 24 hours
  // regardless of the chart timeframe. Falls back to everything when the
  // dataset doesn't span the window.
  _windowCandles(windowMs) {
    const candles = this.sim.candles;
    const N = candles.length;
    if (N === 0) return [];
    const last = candles[N - 1];
    const cutoff = last.time - windowMs / 1000;
    let start = N;
    for (let i = N - 1; i >= 0; i--) {
      if (candles[i].time < cutoff) break;
      start = i;
    }
    return candles.slice(start);
  }

  // v2.10.0: short status-bar hint explaining the current tool's gesture
  _toolHint(id) {
    if (id === 'poly') return '(click: add points, double-click/Enter: finish)';
    if (id === 'brush') return '(drag to draw)';
    if (id === 'hline' || id === 'vline' || id === 'text') return '(click to place)';
    if (id === 'eraser') return '(click a drawing to delete)';
    if (id === 'cursor') return '';
    return '(click, then click again to place - or drag)';
  }

  /* --------------------------- Dropdown ---------------------------------- */
  drawDropdown() {
    if (!this.dropdown) return;
    const ctx = this.ctx;
    const d = this.dropdown;
    ctx.fillStyle = this.theme.panelBg;
    this._roundRect(d.x, d.y, d.w, d.h, 4); ctx.fill();
    ctx.strokeStyle = this.theme.toolbarBorder; ctx.lineWidth = 1;
    this._roundRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1, 4); ctx.stroke();
    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const mouseItem = this.mouseInside ? this.hitDropdown(this.mouseX, this.mouseY) : null;
    for (const it of d.items) {
      if (it === mouseItem) {
        ctx.fillStyle = this.theme.buttonHover;
        ctx.fillRect(d.x + 1, it.y, d.w - 2, it.h);
      }
      let xc = d.x + 12;
      if (it.checked !== undefined) {
        ctx.strokeStyle = it.checked ? this.theme.accent : this.theme.textDim;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(xc, it.y + it.h / 2 - 6, 12, 12);
        if (it.checked) {
          ctx.strokeStyle = this.theme.accent;
          ctx.beginPath();
          ctx.moveTo(xc + 2, it.y + it.h / 2);
          ctx.lineTo(xc + 5, it.y + it.h / 2 + 3);
          ctx.lineTo(xc + 10, it.y + it.h / 2 - 3);
          ctx.stroke();
        }
        xc += 18;
      }
      ctx.fillStyle = it.checked ? this.theme.textBright : this.theme.text;
      ctx.fillText(it.label, xc, it.y + it.h / 2);
    }
  }

  /* --------------------------- Toast ------------------------------------- */
  drawToast(now) {
    if (!this.toast) return;
    if (now > this.toast.until) { this.toast = null; return; }
    const ctx = this.ctx;
    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    const tw = ctx.measureText(this.toast.text).width + 20;
    const th = 26;
    const x = this.W - tw - 12;
    const y = this.layout.toolbarH + 8;
    ctx.fillStyle = 'rgba(41,98,255,0.95)';
    this._roundRect(x, y, tw, th, 4); ctx.fill();
    ctx.fillStyle = this.theme.textBright;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.toast.text, x + tw / 2, y + th / 2);
  }

  /* --------------------------- Main Loop --------------------------------- */
  // v2.3.0+: Mobile render throttle — on mobile devices, cap at ~30fps to
  // reduce CPU/battery usage. Desktop renders uncapped (60fps). Also pause
  // rendering when the tab is hidden (Page Visibility API) to save battery.
  // v2.4.0+: Apply momentum scrolling (inertia) each frame.
  // v2.11.0: RENDER-ON-DEMAND — the loop idles at ZERO cost until something
  // changes (this._needsRender) or a continuous condition holds (momentum,
  // visible toast, self-animated indicator). This kills the two jitter
  // sources of the old design: constant 60fps full repaints with heavy
  // colorful indicators, and the v2.8.0 alternating idle throttle that made
  // the frame rate oscillate between 60 and 30 fps.
  start() {
    // v2.14.0 FIX (audit #25): calling start() twice ran TWO parallel rAF
    // loops (double CPU, double-speed panning). A loop is already running if
    // rafId is set and destroy() hasn't cleared it.
    if (this._loopRunning) return this;
    this._loopRunning = true;
    const loop = (now) => {
      this.rafId = requestAnimationFrame(loop);
      // Pause when tab is hidden
      if (document.hidden) return;
      // Apply momentum scrolling (inertia) — runs every frame regardless
      this._applyMomentum(now);
      // Continuous conditions: something is genuinely animating right now.
      if (this.toast && now > this.toast.until) {
        this.toast = null;            // expired — one last repaint clears it
        this._needsRender = true;
      }
      // v2.13.0: countdown is driven ONLY by its 1-second setInterval, which
      // calls invalidate() → the loop renders once per second and idles the
      // other ~59 frames.
      // v2.15.0 FIX (regression): the countdown was listed as a "continuous"
      // condition, which woke the loop EVERY frame (constant 60fps even with
      // nothing moving) and silently defeated render-on-demand.
      const continuous = !!this._momentum || !!this.toast ||
                         this._hasAnimatedIndicator();
      if (!continuous && !this._needsRender) return;   // idle — zero work
      // Throttle on mobile
      if (this._renderThrottleMs > 0) {
        if (now - this._lastRenderTime < this._renderThrottleMs) return;
      }
      this._needsRender = false;
      this._lastRenderTime = now;
      // v2.8.0: frame guard — nothing a user indicator/tool does can kill the
      // render loop; a failed frame is logged and the next frame starts clean.
      try {
        this.render(now);
      } catch (e) {
        console.error('[BadiCharts] Render frame error:', e);
      }
    };
    this.rafId = requestAnimationFrame(loop);
    return this;
  }
  // v2.13.0/v2.14.0: Tear down the chart completely — stop the rAF loop,
  // clear the countdown interval, remove ALL event listeners (window +
  // canvas — previously anonymous and unstoppable), disconnect the
  // ResizeObserver, and drop cached bitmaps. Safe to call multiple times.
  // Essential for SPA route changes to prevent leaks and ghost interactions
  // (a destroyed chart used to keep reacting to window keydown/resize!).
  destroy() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this._loopRunning = false;
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
    // v2.19.0: stop the replay playback timer on destroy.
    if (this.replay && this.replay._timer != null) {
      clearInterval(this.replay._timer);
      this.replay._timer = null;
    }
    this.replay.active = false;
    if (this._listeners) {
      for (const [target, type, fn, options] of this._listeners) {
        try { target.removeEventListener(type, fn, options); } catch (_) {}
      }
      this._listeners = [];
    }
    if (this._resizeObserver) {
      try { this._resizeObserver.disconnect(); } catch (_) {}
      this._resizeObserver = null;
    }
    // v2.15.0: cancel a queued indicator computation + close the field editor
    if (this._computeRaf != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._computeRaf);
      this._computeRaf = null;
      this._computeQueued = false;
    }
    if (this._fieldEditor) this._closeFieldEditor(false);
    // v2.16.0 (#15): tear down background video — pause, remove the timeupdate
    // listener, src-clear. Without this the <video> kept playing inside a
    // closure on a "dead" chart, leaking memory + network for the page's life.
    this._teardownBgVideo();
    if (this._bgImage) this._bgImage = null;
    if (_lastActiveChartInstance === this) _lastActiveChartInstance = null;
    this._panes = [];
    if (this._indCache2) this._indCache2.clear();
    this.markers = [];
    this._destroyed = true;
  }
  // v2.20.0: Decide whether the just-ended pan should coast (inertia) or stop
  // dead. The chart only coasts when BOTH are true:
  //   1. The release velocity exceeds _momentumFastVelocity (a real flick, not
  //      a slow reposition). The old code only checked _momentumThreshold
  //      (0.05 px/ms ≈ 50 px/s) so even a slow drag drifted a few extra bars,
  //      which read as "the chart is heavy".
  //   2. The drag STARTED inside one of the edge zones — the leftmost or
  //      rightmost _momentumEdgeRatio of the chart area. A drag that started
  //      in the center is treated as a precise reposition and stops on release.
  // startX is the canvas-space X where the drag began (dragStartX for mouse,
  // touchStartX for touch).
  _shouldStartMomentum(startX) {
    const v = Math.abs(this._panVelocity);
    if (v < this._momentumThreshold) return false;      // baseline: pointer basically still
    if (v < this._momentumFastVelocity) return false;   // must be a real flick
    if (startX === undefined || startX === null) return false;
    const left = this.chartLeft  || 0;
    const right = this.chartRight || (this.W || 0);
    const w = right - left;
    if (w <= 0) return false;                            // layout not ready yet
    const edge = w * this._momentumEdgeRatio;
    const xRel = startX - left;
    if (xRel < 0 || xRel > w) return false;              // started outside the chart area
    // Edge zone = first `edge` px OR last `edge` px of the chart area.
    return (xRel <= edge) || (xRel >= w - edge);
  }
  // v2.4.0+: Apply momentum scrolling. Called every frame from the render loop.
  // Moves the chart by velocity * deltaTime, then applies friction. Stops when
  // velocity falls below threshold or the user starts a new interaction.
  _applyMomentum(now) {
    if (!this._momentum) return;
    const m = this._momentum;
    // v2.14.0 FIX (audit #39): dt was unbounded — returning to a tab after it
    // was hidden reported a dt of many seconds, flinging the chart across the
    // whole dataset in one frame. Clamp to ~50ms (3 missed frames max).
    const dt = Math.min(50, Math.max(0, now - m.lastTime));
    if (dt <= 0) return;
    // Convert px/ms to bars/ms and apply to rightOffset
    const barsPerMs = m.velocity / this.barSpacing;
    this.rightOffset -= barsPerMs * dt;
    this.constrainRightOffset();
    // v2.15.0: momentum changes the viewport every frame without a drag state
    // — keep the rebuild budget bypassed while it is active.
    this._touchInteract();
    // Apply friction (per-frame, approximated for dt)
    const frictionPerFrame = Math.pow(this._momentumFriction, dt / 16.67);
    m.velocity *= frictionPerFrame;
    m.lastTime = now;
    // Stop when velocity is very small
    if (Math.abs(m.velocity) < this._momentumThreshold) {
      this._momentum = null;
    }
    this.invalidateTimeMarks();
    this.autoScale();
  }
}

/* ============================ LIBRARY EXPORT =============================== */
// BADI-CHARTS-V2 — expose the chart as a global so users can create instances
// with their own data.
//
// Usage (browser, standalone):
//   const chart = new BadiCharts(canvas, {
//     symbol:    { label:'BTCUSDT', priceScale:100, decimals:2 },
//     timeframe: { label:'1H', ms:60*60*1000 },
//     indicators: ['ma20','ma50','volsma']  // optional
//   });
//   chart.setData(candles);  // [{time, open, high, low, close, volume}, ...]
//   chart.start();
//
// Usage (ES module / npm):
//   import BadiCharts from 'badi-charts-v2';
//   const chart = new BadiCharts(canvas, opts);

// v2.14.0 FIX (audit #11): the globals were assigned unconditionally — in
// Node/SSR `window` doesn't exist and the whole FILE threw ReferenceError
// on require(), before module.exports was ever reached. Now the browser
// globals are guarded, and the CommonJS export works in pure Node.
if (typeof window !== 'undefined') {
  // Global alias (preferred)
  window.BadiCharts = TradingChart;
  // Backward-compatible aliases
  window.CanvasKlines = TradingChart;
  window.TradingChart = TradingChart;
  // Expose version and helpers
  window.BadiCharts.version = VERSION;
  window.THEME = THEME;
  window.INDICATOR_LIST = INDICATOR_LIST;
  window.DRAW_TOOLS = DRAW_TOOLS;
  window.TOOL_SHORTCUTS = TOOL_SHORTCUTS;
  window.Indicators = Indicators;
  window.PriceFormatter = PriceFormatter;
  window.PriceScale = PriceScale;
}

// UMD-style export for CommonJS / ES modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TradingChart;
  module.exports.default = TradingChart;
  module.exports.BadiCharts = TradingChart;
  module.exports.VERSION = VERSION;
}
if (typeof define === 'function' && define.amd) {
  define([], function () { return TradingChart; });
}

})();
