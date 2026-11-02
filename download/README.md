# BADI-CHARTS-V2

> **A lightweight, dependency-free candlestick charting library built entirely with the HTML5 Canvas API.**
>
> Pixel-perfect rendering, 14 drawing tools, 10 indicators, mobile-responsive, no fake data — you bring the data, BADI-CHARTS-V2 renders it.

[![Version](https://img.shields.io/badge/version-1.0.0-2962ff.svg)](#)
[![License](https://img.shields.io/badge/license-Apache--2.0-26a69a.svg)](LICENSE)
[![No Dependencies](https://img.shields.io/badge/dependencies-zero-ff9800.svg)](#)

---

## ✨ Features

- **100% Pure JavaScript** — No HTML/CSS for UI, no dependencies, no frameworks
- **Pixel-Perfect Rendering** — HiDPI-aware, algorithms ported 1:1 from TradingView Lightweight Charts
- **User-Provided Data** — No fake/mock data; you feed candles via `setData()`
- **14 Drawing Tools** — trend line, parallel channel, band/zone, arrow, fib retracement, brush, polygon, text, ray, rectangle, horizontal/vertical lines, eraser
- **10 Indicators** — MA (20/50/200), EMA (20/50), Bollinger Bands, RSI, MACD, Volume SMA, Volume Profile (with POC & VWAP)
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
  <script src="chart.js"></script>
  <script>
    const canvas = document.getElementById('chart');
    const chart = new BadiCharts(canvas, {
      symbol:    { label: 'BTCUSDT', priceScale: 100, decimals: 2 },
      timeframe: { label: '1H', ms: 60 * 60 * 1000 },
      indicators: ['ma20', 'ma50', 'volsma']
    });

    // Feed your candle data
    chart.setData([
      { time: 1700000000, open: 67000, high: 67500, low: 66800, close: 67200, volume: 1200 },
      { time: 1700003600, open: 67200, high: 67800, low: 67100, close: 67600, volume: 980 },
      // ... more candles
    ]);

    chart.start();
  </script>
</body>
</html>
```

## 📖 API Reference

### Constructor

```js
const chart = new BadiCharts(canvas, options);
```

**Options:**
| Option | Type | Description |
|---|---|---|
| `symbol` | `{label, priceScale, decimals}` | Symbol configuration (priceScale: 100 for 2 decimals, 100000 for 5) |
| `timeframe` | `{label, ms}` | Timeframe label and duration in milliseconds |
| `indicators` | `string[]` | Initial active indicators (e.g. `['ma20', 'rsi']`) |

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
chart.addIndicator('rsi');       // Add indicator by id
chart.removeIndicator('rsi');    // Remove indicator by id
chart.setTool('trend');          // Set active drawing tool
chart.addDrawing({type:'hline', price: 65000, color:'#2962ff'});
chart.clearDrawings();
```

### View Methods

```js
chart.resetView();   // Reset zoom/pan to default
chart.fit();         // Fit chart to show all data
chart.start();       // Start the render loop (requestAnimationFrame)
chart.onCrosshair(cb);  // Subscribe to crosshair updates
```

### Available Indicators

| ID | Label | Type |
|---|---|---|
| `ma20` | MA 20 | Overlay |
| `ma50` | MA 50 | Overlay |
| `ma200` | MA 200 | Overlay |
| `ema20` | EMA 20 | Overlay |
| `ema50` | EMA 50 | Overlay |
| `bb` | Bollinger Bands | Overlay |
| `volsma` | Volume SMA 20 | Volume |
| `rsi` | RSI 14 | Pane |
| `macd` | MACD | Pane |
| `vprof` | Volume Profile | Overlay (with POC & VWAP) |

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
