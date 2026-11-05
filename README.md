# BADI-CHARTS-V2

> **A lightweight, dependency-free, HEADLESS candlestick charting library built entirely with the HTML5 Canvas API.**
>
> Pixel-perfect rendering, 14 drawing tools, fully custom indicators via API — you bring the data, the UI, and the indicators. BADI-CHARTS-V2 renders the chart.

[![Version](https://img.shields.io/badge/version-2.3.1-2962ff.svg)](#)
[![License](https://img.shields.io/badge/license-Apache--2.0-26a69a.svg)](LICENSE)
[![No Dependencies](https://img.shields.io/badge/dependencies-zero-ff9800.svg)](#)
[![Headless](https://img.shields.io/badge/UI-headless-9c27b0.svg)](#)

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
  <script src="https://cdn.jsdelivr.net/gh/salahbadi19/BADI-CHARTS-V2@v2.3.1/chart.js"></script>
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
  type: 'overlay',              // 'overlay' | 'pane' | 'volume'
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
