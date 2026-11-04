# BADI-CHARTS-V2

> **A lightweight, dependency-free, HEADLESS candlestick charting library built entirely with the HTML5 Canvas API.**
>
> Pixel-perfect rendering, 14 drawing tools, fully custom indicators via API — you bring the data, the UI, and the indicators. BADI-CHARTS-V2 renders the chart.

[![Version](https://img.shields.io/badge/version-2.1.0-2962ff.svg)](#)
[![License](https://img.shields.io/badge/license-Apache--2.0-26a69a.svg)](LICENSE)
[![No Dependencies](https://img.shields.io/badge/dependencies-zero-ff9800.svg)](#)
[![Headless](https://img.shields.io/badge/UI-headless-9c27b0.svg)](#)

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
  <script src="https://cdn.jsdelivr.net/gh/salahbadi19/BADI-CHARTS-V2@v2.1.0/chart.js"></script>
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
| `statusBar` | `boolean` | `false` | Show the optional status bar (Bid/Ask/24h High/Low/Vol). Toolbar is always OFF. |
| `background` | `string\|null` | `null` | Background image or video URL drawn behind the chart |
| `backgroundOpacity` | `number` | `0.15` | Opacity of the background image/video |

> **Note:** The `toolbar` option is accepted but silently ignored (always `false`). Kept only for backward compatibility with v1.x code.

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

// Register a CUSTOM drawing tool (advanced):
chart.addDrawingTool({
  id: 'myTool',
  label: 'My Tool',
  icon: '◆',
  onDraw: function (ctx, drawing) { /* render */ },
  onHitTest: function (drawing, x, y) { return boolean; },
  defaultStyle: { color: '#2962ff', lineWidth: 1.5 }
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
