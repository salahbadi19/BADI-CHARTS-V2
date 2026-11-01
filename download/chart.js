/* =============================================================================
 * TRADING CHART ENGINE - Pure JavaScript Canvas Implementation
 * TradingView-inspired charting library built from scratch.
 * No HTML elements for UI, no CSS styling - everything is canvas-drawn.
 *
 * Features:
 *   - Candlestick chart with wicks
 *   - Volume histogram
 *   - Right-side price axis, bottom time axis
 *   - Grid lines (auto-spaced)
 *   - Crosshair with price/time labels
 *   - Pan (drag) and zoom (wheel)
 *   - Auto-scale price to visible range
 *   - Real-time tick simulation
 *   - Indicators: MA, EMA, Bollinger Bands, RSI, MACD, Volume SMA
 *   - Drawing tools: trendline, horizontal line, rectangle, fibonacci
 *   - Toolbar drawn on canvas (symbol, timeframe, indicators, tools)
 *   - Status bar with OHLC legend
 *   - Dark theme matching TradingView
 * ============================================================================= */

(function () {
'use strict';

/* ============================ THEME ========================================= */
const THEME = {
  bg:            '#0e1015',
  panelBg:       '#131722',
  toolbarBg:     '#1a1e2a',
  toolbarBorder: '#2a2e39',
  grid:          '#1c2030',
  gridStrong:    '#2a2e39',
  axis:          '#1c2030',
  text:          '#cfd2da',
  textDim:       '#787b86',
  textBright:    '#f0f3fa',
  textFade:      '#5d606b',
  bull:          '#26a69a',
  bear:          '#ef5350',
  bullWick:      '#26a69a',
  bearWick:      '#ef5350',
  bullVol:       'rgba(38,166,154,0.55)',
  bearVol:       'rgba(239,83,80,0.55)',
  accent:        '#2962ff',
  accentDim:     'rgba(41,98,255,0.18)',
  crosshair:     '#787b86',
  crosshairDot:  '#ffffff',
  crosshairLabel:'#2a2e39',
  ma1:           '#2962ff',
  ma2:            '#ff9800',
  ma3:            '#e91e63',
  bollingerMid:  '#ff9800',
  bollingerBand: 'rgba(156,39,176,0.45)',
  rsi:           '#7e57c2',
  rsiOver:       '#ef5350',
  rsiUnder:      '#26a69a',
  macd:          '#2962ff',
  macdSignal:    '#ff6d00',
  macdHistBull:  'rgba(38,166,154,0.55)',
  macdHistBear:  'rgba(239,83,80,0.55)',
  drawing:       '#2962ff',
  drawingActive: '#ffb74d',
  currentPrice:  '#2962ff',
  currentPriceBull: '#26a69a',
  currentPriceBear: '#ef5350',
  buttonBg:      '#1e222d',
  buttonHover:   '#2a2e39',
  buttonActive:  '#2962ff',
  buttonText:    '#cfd2da',
  scrollbar:     '#2a2e39',
  scrollbarThumb:'#3f4350'
};

/* ============================ CONSTANTS ===================================== */
const TIMEFRAMES = [
  {label:'1m',  ms:60*1000},
  {label:'5m',  ms:5*60*1000},
  {label:'15m', ms:15*60*1000},
  {label:'1H',  ms:60*60*1000},
  {label:'4H',  ms:4*60*60*1000},
  {label:'1D',  ms:24*60*60*1000},
  {label:'1W',  ms:7*24*60*60*1000}
];

const SYMBOLS = [
  {label:'BTCUSD', price:67500, vol:0.025, decimals:2},
  {label:'ETHUSD', price:3500,  vol:0.030, decimals:2},
  {label:'SOLUSD', price:175,   vol:0.045, decimals:2},
  {label:'XAUUSD', price:2380,  vol:0.008, decimals:2},
  {label:'EURUSD', price:1.085, vol:0.004, decimals:5},
  {label:'AAPL',   price:225,   vol:0.015, decimals:2},
  {label:'TSLA',   price:250,   vol:0.035, decimals:2},
  {label:'NVDA',   price:120,   vol:0.028, decimals:2}
];

const INDICATOR_LIST = [
  {id:'ma20',   label:'MA 20',       type:'overlay',  color:THEME.ma1},
  {id:'ma50',   label:'MA 50',       type:'overlay',  color:THEME.ma2},
  {id:'ma200',  label:'MA 200',      type:'overlay',  color:THEME.ma3},
  {id:'ema20',  label:'EMA 20',      type:'overlay',  color:THEME.ma1},
  {id:'ema50',  label:'EMA 50',      type:'overlay',  color:THEME.ma2},
  {id:'bb',     label:'Bollinger',   type:'overlay',  color:THEME.bollingerMid},
  {id:'volsma', label:'Vol SMA 20',  type:'volume',   color:THEME.ma2},
  {id:'rsi',    label:'RSI 14',      type:'pane',     color:THEME.rsi},
  {id:'macd',   label:'MACD',        type:'pane',     color:THEME.macd}
];

const DRAW_TOOLS = [
  {id:'cursor',  label:'Cursor',          icon:'cursor'},
  {id:'trend',   label:'Trend Line',      icon:'trend'},
  {id:'hline',   label:'Horizontal Line', icon:'hline'},
  {id:'vline',   label:'Vertical Line',   icon:'vline'},
  {id:'rect',    label:'Rectangle',       icon:'rect'},
  {id:'fib',     label:'Fib Retracement', icon:'fib'},
  {id:'brush',   label:'Brush',           icon:'brush'},
  {id:'ruler',   label:'Measure',         icon:'ruler'},
  {id:'eraser',  label:'Delete Drawing',  icon:'eraser'}
];

/* ============================ UTILITIES ===================================== */
const fmt = (n, d = 2) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
};

const fmtPrice = (n, decimals = 2) => fmt(n, decimals);

const fmtVolume = (n) => {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
  return n.toFixed(0);
};

const fmtTime = (t, tf) => {
  const d = new Date(t);
  const pad = (x) => String(x).padStart(2, '0');
  if (tf === '1D' || tf === '1W') {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
};

const fmtTimeShort = (t, tf) => {
  const d = new Date(t);
  const pad = (x) => String(x).padStart(2, '0');
  if (tf === '1D' || tf === '1W') {
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const roundRect = (ctx, x, y, w, h, r) => {
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
};

/* ============================ INDICATORS ==================================== */
const Indicators = {
  sma(values, period) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  },

  ema(values, period) {
    const out = new Array(values.length).fill(null);
    const k = 2 / (period + 1);
    let prev = null;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (prev === null) {
        // seed with SMA
        if (i >= period - 1) {
          let s = 0;
          for (let j = i - period + 1; j <= i; j++) s += values[j];
          prev = s / period;
          out[i] = prev;
        }
      } else {
        prev = v * k + prev * (1 - k);
        out[i] = prev;
      }
    }
    return out;
  },

  bollinger(values, period, mult) {
    const mid = Indicators.sma(values, period);
    const upper = new Array(values.length).fill(null);
    const lower = new Array(values.length).fill(null);
    for (let i = period - 1; i < values.length; i++) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += Math.pow(values[j] - mid[i], 2);
      const sd = Math.sqrt(s / period);
      upper[i] = mid[i] + mult * sd;
      lower[i] = mid[i] - mult * sd;
    }
    return {mid, upper, lower};
  },

  rsi(values, period) {
    const out = new Array(values.length).fill(null);
    let gainAvg = 0, lossAvg = 0;
    for (let i = 1; i < values.length; i++) {
      const ch = values[i] - values[i - 1];
      const gain = Math.max(0, ch);
      const loss = Math.max(0, -ch);
      if (i <= period) {
        gainAvg += gain;
        lossAvg += loss;
        if (i === period) {
          gainAvg /= period;
          lossAvg /= period;
          const rs = lossAvg === 0 ? 100 : gainAvg / lossAvg;
          out[i] = 100 - 100 / (1 + rs);
        }
      } else {
        gainAvg = (gainAvg * (period - 1) + gain) / period;
        lossAvg = (lossAvg * (period - 1) + loss) / period;
        const rs = lossAvg === 0 ? 100 : gainAvg / lossAvg;
        out[i] = 100 - 100 / (1 + rs);
      }
    }
    return out;
  },

  macd(values, fast, slow, signal) {
    const ef = Indicators.ema(values, fast);
    const es = Indicators.ema(values, slow);
    const macdLine = values.map((_, i) => (ef[i] !== null && es[i] !== null ? ef[i] - es[i] : null));
    const validMacd = macdLine.map(v => v === null ? 0 : v);
    const sig = Indicators.ema(validMacd, signal);
    const hist = macdLine.map((v, i) => (v !== null && sig[i] !== null ? v - sig[i] : null));
    return {macd: macdLine, signal: sig, hist};
  },

  atr(highs, lows, closes, period) {
    const tr = [];
    for (let i = 0; i < highs.length; i++) {
      if (i === 0) tr.push(highs[i] - lows[i]);
      else {
        tr.push(Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i - 1]),
          Math.abs(lows[i] - closes[i - 1])
        ));
      }
    }
    return Indicators.sma(tr, period);
  }
};

/* ============================ DATA SIMULATOR ================================ */
class DataSimulator {
  constructor(symbol, timeframe) {
    this.symbol = symbol;
    this.timeframe = timeframe;
    this.tfMs = timeframe.ms;
    this.candles = [];
    this.basePrice = symbol.price;
    this.vol = symbol.vol;
    this.decimals = symbol.decimals;
    this.lastTick = 0;
    this.generate(800);
  }

  generate(count) {
    let price = this.basePrice;
    const now = Date.now();
    const startTime = now - count * this.tfMs;
    for (let i = 0; i < count; i++) {
      const t = startTime + i * this.tfMs;
      const open = price;
      // Volatility clustering via sine + noise
      const volMult = 1 + Math.sin(i * 0.07) * 0.4 + (Math.random() - 0.5) * 0.6;
      // Signed drift (zero mean) - no compounding bias
      const drift = (Math.random() - 0.5) * this.vol * volMult * 1.6;
      // Macro trend: deterministic sine waves so it oscillates without runaway
      const macroBias = Math.sin(i * 0.013) * 0.0018
                      + Math.sin(i * 0.005 + 0.7) * 0.0012
                      + Math.sin(i * 0.027 + 1.3) * 0.0008;
      // Mean reversion to keep price near basePrice
      const meanRevert = (this.basePrice - price) / price * 0.006;
      const close = open * (1 + drift + macroBias + meanRevert);
      const range = this.vol * volMult * price * (0.5 + Math.random() * 0.8);
      const high = Math.max(open, close) + range * Math.random() * 0.7;
      const low = Math.min(open, close) - range * Math.random() * 0.7;
      const volume = Math.abs(close - open) / open * price * 50 + Math.random() * 1000 + 500;
      this.candles.push({
        time: t, open, high, low, close, volume
      });
      price = close;
    }
    this.lastTick = now;
  }

  // Real-time tick: update last candle (or roll a new one)
  tick() {
    const now = Date.now();
    const last = this.candles[this.candles.length - 1];
    const lastTfStart = Math.floor(now / this.tfMs) * this.tfMs;

    if (lastTfStart > last.time) {
      // roll new candle
      const open = last.close;
      const drift = (Math.random() - 0.5) * this.vol * 2;
      const range = this.vol * open * (0.4 + Math.random() * 0.6);
      const high = open + Math.abs(drift) * open + range * Math.random();
      const low = open - Math.abs(drift) * open * 0.6 - range * Math.random();
      const close = low + (high - low) * Math.random();
      const volume = Math.abs(close - open) / open * open * 30 + 500 + Math.random() * 500;
      this.candles.push({time: lastTfStart, open, high, low, close, volume});
      if (this.candles.length > 5000) this.candles.shift();
    } else {
      // update current candle
      const drift = (Math.random() - 0.5) * this.vol * 0.5;
      const newClose = last.close * (1 + drift);
      last.close = newClose;
      last.high = Math.max(last.high, newClose);
      last.low = Math.min(last.low, newClose);
      last.volume += Math.random() * 50 + 10;
    }
    this.lastTick = now;
  }
}

/* ============================ MAIN CHART CLASS ============================== */
class TradingChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;

    // Layout
    this.layout = {
      toolbarH: 44,
      statusH: 26,
      paneTop: 44,
      paneBottom: 0,    // set on resize
      priceAxisW: 72,
      timeAxisH: 28,
      volumeH: 70,
      gap: 8,
      paneH: 0,         // RSI/MACD pane height
      leftPad: 8
    };

    // State
    this.symbol = SYMBOLS[0];
    this.timeframe = TIMEFRAMES[3]; // 1H
    this.sim = new DataSimulator(this.symbol, this.timeframe);

    // Viewport (indices into candles array)
    this.viewEnd = this.sim.candles.length;       // exclusive
    this.candleW = 9;                              // body width in px
    this.candleGap = 1.5;
    this.maxCandleW = 32;
    this.minCandleW = 1.5;

    // Auto-fit margin
    this.priceTopPad = 0.10;
    this.priceBottomPad = 0.10;

    // Visible price range (computed in autoScale)
    this.minPrice = 0;
    this.maxPrice = 1;

    // Crosshair
    this.mouseX = null;
    this.mouseY = null;
    this.mouseInside = false;
    this.crosshairIndex = null;

    // Dragging
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartViewEnd = 0;

    // Drawing tools
    this.activeTool = 'cursor';
    this.drawings = [];
    this.currentDrawing = null;
    this.hoverDrawing = null;

    // Active indicators
    this.activeIndicators = new Set(['ma20', 'ma50', 'volsma']);

    // UI state
    this.buttons = [];          // clickable regions, refreshed each frame
    this.hoverButton = null;
    this.dropdown = null;       // {type, items, x, y, w, h}
    this.toast = null;          // {text, until}

    // Animation
    this.lastRender = 0;
    this.tickInterval = 1000;   // 1s simulated tick
    this.lastTickAt = 0;
    this.rafId = null;

    // Crosshair snap
    this.snapToCandle = true;

    // Price line
    this.showCurrentPriceLine = true;

    // Pre-computed indicator cache
    this.indCache = {};

    this.setupHiDPICanvas();
    this.setupEvents();
    this.fit();
    this.computeIndicators();
  }

  /* --------------------------- Canvas Setup ------------------------------ */
  setupHiDPICanvas() {
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.W = w;
      this.H = h;
      this.updateLayout();
    };
    resize();
    window.addEventListener('resize', resize);
  }

  updateLayout() {
    this.layout.paneTop = this.layout.toolbarH;
    const bottomStart = this.H - this.layout.statusH - this.layout.timeAxisH;
    this.layout.paneBottom = bottomStart;

    // Determine if any pane indicators are active
    const hasPane = this.activeIndicators.has('rsi') || this.activeIndicators.has('macd');
    this.layout.paneH = hasPane ? 110 : 0;

    // Main chart area
    this.chartLeft = this.layout.leftPad;
    this.chartRight = this.W - this.layout.priceAxisW;
    this.chartTop = this.layout.paneTop + 4;
    this.chartBottom = this.layout.paneBottom - this.layout.paneH - (this.layout.paneH > 0 ? this.layout.gap : 0);

    // Volume area is inside main chart area (bottom)
    this.volTop = this.chartBottom - this.layout.volumeH;
    this.volBottom = this.chartBottom - 4;

    // Actual price chart (above volume)
    this.priceTop = this.chartTop;
    this.priceBottom = this.volTop - 6;

    // Pane (RSI/MACD) area
    if (hasPane) {
      this.paneLeft = this.chartLeft;
      this.paneRight = this.chartRight;
      this.paneTop = this.layout.paneBottom - this.layout.paneH;
      this.paneBottom = this.layout.paneBottom;
    }
  }

  /* --------------------------- Events ------------------------------------ */
  setupEvents() {
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', (e) => this.onMouseLeave(e));
    this.canvas.addEventListener('mouseenter', (e) => this.onMouseEnter(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), {passive: false});
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onRightClick(e); });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  onMouseMove(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    this.mouseX = x;
    this.mouseY = y;
    this.mouseInside = true;

    // Hover buttons
    this.hoverButton = this.hitButton(x, y);

    if (this.isDragging && this.activeTool === 'cursor') {
      const dx = x - this.dragStartX;
      const candlesMoved = dx / (this.candleW + this.candleGap);
      this.viewEnd = this.dragStartViewEnd - candlesMoved;
      this.constrainView();
      this.autoScale();
      this.computeIndicators();
    } else if (this.currentDrawing) {
      this.updateCurrentDrawing(x, y);
    }

    // Update crosshair snap
    if (this.mouseInside && this.inChartArea(x, y)) {
      const idx = this.xToIndex(x);
      this.crosshairIndex = clamp(idx, 0, this.sim.candles.length - 1);
    } else {
      this.crosshairIndex = null;
    }
  }

  onMouseDown(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    // Check buttons first
    const btn = this.hitButton(x, y);
    if (btn) {
      this.handleButtonClick(btn);
      return;
    }

    // Check dropdown
    if (this.dropdown) {
      const item = this.hitDropdown(x, y);
      if (item) {
        this.handleDropdownSelect(item);
        this.dropdown = null;
        return;
      } else if (x < this.dropdown.x || x > this.dropdown.x + this.dropdown.w ||
                 y < this.dropdown.y || y > this.dropdown.y + this.dropdown.h) {
        this.dropdown = null;
        return;
      }
    }

    if (this.activeTool === 'cursor') {
      if (this.inChartArea(x, y)) {
        this.isDragging = true;
        this.dragStartX = x;
        this.dragStartViewEnd = this.viewEnd;
      }
    } else if (this.activeTool === 'eraser') {
      if (this.hoverDrawing) {
        this.drawings = this.drawings.filter(d => d !== this.hoverDrawing);
        this.hoverDrawing = null;
        this.showToast('Drawing deleted');
      }
    } else if (this.inChartArea(x, y)) {
      this.startDrawing(x, y);
    }
  }

  onMouseUp(e) {
    if (this.isDragging) {
      this.isDragging = false;
    }
    if (this.currentDrawing) {
      this.finishDrawing();
    }
  }

  onMouseLeave(e) {
    this.mouseInside = false;
    this.crosshairIndex = null;
    this.hoverButton = null;
    if (this.currentDrawing) {
      this.finishDrawing();
    }
  }

  onMouseEnter(e) {
    this.mouseInside = true;
  }

  onWheel(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

    if (!this.inChartArea(x, y) && !this.inPriceAxis(x, y)) return;

    const dir = e.deltaY < 0 ? 1 : -1;
    const factor = dir > 0 ? 0.9 : 1.111;
    const oldStep = this.candleW + this.candleGap;
    let newW = clamp(this.candleW * factor, this.minCandleW, this.maxCandleW);
    if (newW === this.candleW) return;
    this.candleW = newW;
    const newStep = this.candleW + this.candleGap;

    // Zoom toward cursor: keep candle under cursor stable
    const idxAtCursor = this.xToIndex(x);
    this.viewEnd = idxAtCursor + (x - this.chartLeft) / newStep + 1;
    this.constrainView();
    this.autoScale();
    this.computeIndicators();
  }

  onRightClick(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    // If on a drawing, delete it
    if (this.hoverDrawing) {
      this.drawings = this.drawings.filter(d => d !== this.hoverDrawing);
      this.hoverDrawing = null;
      this.showToast('Drawing deleted');
    } else {
      this.activeTool = 'cursor';
      this.showToast('Cursor tool');
    }
  }

  onKeyDown(e) {
    if (e.key === 'r' || e.key === 'R') { this.fit(); this.autoScale(); }
    if (e.key === '+' || e.key === '=') { this.zoomAtCenter(0.9); }
    if (e.key === '-' || e.key === '_') { this.zoomAtCenter(1.111); }
    if (e.key === 'Escape') { this.activeTool = 'cursor'; this.currentDrawing = null; this.dropdown = null; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.hoverDrawing) {
        this.drawings = this.drawings.filter(d => d !== this.hoverDrawing);
        this.hoverDrawing = null;
      }
    }
  }

  zoomAtCenter(factor) {
    const centerX = (this.chartLeft + this.chartRight) / 2;
    const oldStep = this.candleW + this.candleGap;
    let newW = clamp(this.candleW * factor, this.minCandleW, this.maxCandleW);
    if (newW === this.candleW) return;
    this.candleW = newW;
    const newStep = this.candleW + this.candleGap;
    const idxAtCenter = this.xToIndex(centerX);
    this.viewEnd = idxAtCenter + (centerX - this.chartLeft) / newStep + 1;
    this.constrainView();
    this.autoScale();
    this.computeIndicators();
  }

  /* --------------------------- View Helpers ------------------------------ */
  inChartArea(x, y) {
    return x >= this.chartLeft && x <= this.chartRight && y >= this.chartTop && y <= this.chartBottom;
  }
  inPriceAxis(x, y) {
    return x > this.chartRight && x <= this.W && y >= this.chartTop && y <= this.chartBottom;
  }
  inTimeAxis(x, y) {
    return x >= this.chartLeft && x <= this.chartRight && y > this.chartBottom && y <= this.layout.paneBottom;
  }

  fit() {
    const visibleCount = Math.floor((this.chartRight - this.chartLeft) / (this.candleW + this.candleGap));
    this.viewEnd = this.sim.candles.length;
    const start = Math.max(0, this.viewEnd - visibleCount);
    // We use viewEnd + visible width = how many candles fit; we shift viewEnd
    // Actually we want last `visibleCount` candles visible
    // To keep semantics simple, let viewEnd be exclusive end and visibleCount computed from viewEnd - viewStart
    // We need viewStart = viewEnd - visibleCount
    // For panning, we move viewEnd (and thus viewStart = viewEnd - visibleCount)
    // Set viewEnd such that visible window is last `visibleCount`
    this.viewEnd = this.sim.candles.length + 5; // little overshoot allowed
    this.constrainView();
    this.autoScale();
  }

  constrainView() {
    const visibleCount = this.getVisibleCount();
    const minEnd = visibleCount * 0.5;
    const maxEnd = this.sim.candles.length + 30;
    this.viewEnd = clamp(this.viewEnd, minEnd, maxEnd);
  }

  getVisibleCount() {
    return Math.ceil((this.chartRight - this.chartLeft) / (this.candleW + this.candleGap));
  }

  get viewStart() {
    return this.viewEnd - this.getVisibleCount();
  }

  autoScale() {
    const start = Math.max(0, Math.floor(this.viewStart));
    const end = Math.min(this.sim.candles.length, Math.ceil(this.viewEnd));
    if (start >= end) return;
    let min = Infinity, max = -Infinity;
    for (let i = start; i < end; i++) {
      const c = this.sim.candles[i];
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
    }
    // Include visible Bollinger / drawings
    if (this.activeIndicators.has('bb')) {
      const bb = this.indCache.bb;
      if (bb) {
        for (let i = start; i < end; i++) {
          if (bb.upper[i] !== null) { if (bb.upper[i] > max) max = bb.upper[i]; if (bb.lower[i] < min) min = bb.lower[i]; }
        }
      }
    }
    for (const d of this.drawings) {
      if (d.type === 'hline' && d.price >= min && d.price <= max) {
        // already in range
      } else if (d.type === 'hline') {
        // include
        if (d.price < min) min = d.price;
        if (d.price > max) max = d.price;
      }
    }
    const range = max - min;
    if (range === 0) { min -= 1; max += 1; }
    this.minPrice = min - range * this.priceBottomPad;
    this.maxPrice = max + range * this.priceTopPad;
  }

  /* --------------------------- Coordinate Transforms --------------------- */
  priceToY(p) {
    const r = this.maxPrice - this.minPrice;
    if (r === 0) return (this.priceTop + this.priceBottom) / 2;
    return this.priceTop + (1 - (p - this.minPrice) / r) * (this.priceBottom - this.priceTop);
  }
  yToPrice(y) {
    const r = this.maxPrice - this.minPrice;
    return this.minPrice + (1 - (y - this.priceTop) / (this.priceBottom - this.priceTop)) * r;
  }
  indexToX(i) {
    return this.chartLeft + (i - this.viewStart + 0.5) * (this.candleW + this.candleGap);
  }
  xToIndex(x) {
    return Math.floor((x - this.chartLeft) / (this.candleW + this.candleGap) + this.viewStart);
  }

  /* --------------------------- Indicator Cache --------------------------- */
  computeIndicators() {
    const closes = this.sim.candles.map(c => c.close);
    const vols = this.sim.candles.map(c => c.volume);
    this.indCache = {};
    if (this.activeIndicators.has('ma20'))  this.indCache.ma20  = Indicators.sma(closes, 20);
    if (this.activeIndicators.has('ma50'))  this.indCache.ma50  = Indicators.sma(closes, 50);
    if (this.activeIndicators.has('ma200')) this.indCache.ma200 = Indicators.sma(closes, 200);
    if (this.activeIndicators.has('ema20')) this.indCache.ema20 = Indicators.ema(closes, 20);
    if (this.activeIndicators.has('ema50')) this.indCache.ema50 = Indicators.ema(closes, 50);
    if (this.activeIndicators.has('bb'))    this.indCache.bb    = Indicators.bollinger(closes, 20, 2);
    if (this.activeIndicators.has('volsma'))this.indCache.volsma= Indicators.sma(vols, 20);
    if (this.activeIndicators.has('rsi'))   this.indCache.rsi   = Indicators.rsi(closes, 14);
    if (this.activeIndicators.has('macd'))  this.indCache.macd  = Indicators.macd(closes, 12, 26, 9);
  }

  /* --------------------------- Drawing Tools ----------------------------- */
  startDrawing(x, y) {
    const idx = this.xToIndex(x);
    const price = this.yToPrice(y);
    const tool = this.activeTool;
    const base = {type: tool, t1: this.candleTime(idx), p1: price, t2: this.candleTime(idx), p2: price};
    if (tool === 'hline') {
      this.drawings.push({type:'hline', price, color: THEME.drawing, id: Date.now()});
      this.currentDrawing = null;
      this.activeTool = 'cursor';
      this.showToast('Horizontal line added');
      return;
    }
    if (tool === 'vline') {
      this.drawings.push({type:'vline', time: this.candleTime(idx), color: THEME.drawing, id: Date.now()});
      this.currentDrawing = null;
      this.activeTool = 'cursor';
      this.showToast('Vertical line added');
      return;
    }
    this.currentDrawing = {...base, color: THEME.drawingActive, id: Date.now(), points: tool === 'brush' ? [{x, y, t: this.candleTime(idx), p: price}] : null};
  }

  updateCurrentDrawing(x, y) {
    if (!this.currentDrawing) return;
    const idx = this.xToIndex(x);
    const price = this.yToPrice(y);
    if (this.currentDrawing.type === 'brush') {
      this.currentDrawing.points.push({x, y, t: this.candleTime(idx), p: price});
    } else {
      this.currentDrawing.t2 = this.candleTime(idx);
      this.currentDrawing.p2 = price;
    }
  }

  finishDrawing() {
    if (!this.currentDrawing) return;
    this.currentDrawing.color = THEME.drawing;
    this.drawings.push(this.currentDrawing);
    this.currentDrawing = null;
    this.activeTool = 'cursor';
    this.showToast('Drawing added');
  }

  candleTime(idx) {
    if (idx < 0 || idx >= this.sim.candles.length) return null;
    return this.sim.candles[idx].time;
  }
  timeToIndex(t) {
    // find nearest candle by time
    let lo = 0, hi = this.sim.candles.length - 1, best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.sim.candles[mid].time === t) return mid;
      if (this.sim.candles[mid].time < t) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return best;
  }
  timeToX(t) {
    const i = this.timeToIndex(t);
    if (i < 0) return null;
    return this.indexToX(i);
  }

  /* --------------------------- Button Hit Testing ------------------------ */
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
      case 'symbol':
        this.openDropdown('symbol', SYMBOLS.map(s => ({label: s.label, value: s.label})), btn);
        break;
      case 'timeframe':
        this.openDropdown('timeframe', TIMEFRAMES.map(t => ({label: t.label, value: t.label})), btn);
        break;
      case 'indicator':
        this.openDropdown('indicator', INDICATOR_LIST.map(i => ({
          label: i.label, value: i.id, checked: this.activeIndicators.has(i.id)
        })), btn);
        break;
      case 'tool':
        this.openDropdown('tool', DRAW_TOOLS.map(t => ({label: t.label, value: t.id})), btn);
        break;
      case 'reset':
        this.fit();
        this.showToast('Reset view');
        break;
      case 'settings':
        this.showToast('Settings: press R to reset, +/- to zoom, Esc to cancel tool');
        break;
      case 'snapshot':
        this.showToast('Snapshot: ' + this.symbol.label + ' ' + this.timeframe.label);
        break;
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
    if (this.dropdown.type === 'symbol') {
      const sym = SYMBOLS.find(s => s.label === item.value);
      if (sym) {
        this.symbol = sym;
        this.sim = new DataSimulator(this.symbol, this.timeframe);
        this.fit();
        this.computeIndicators();
        this.drawings = [];
        this.showToast('Loaded ' + sym.label);
      }
    } else if (this.dropdown.type === 'timeframe') {
      const tf = TIMEFRAMES.find(t => t.label === item.value);
      if (tf) {
        this.timeframe = tf;
        this.sim = new DataSimulator(this.symbol, this.timeframe);
        this.fit();
        this.computeIndicators();
        this.showToast('Timeframe: ' + tf.label);
      }
    } else if (this.dropdown.type === 'indicator') {
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
      this.activeTool = item.value;
      this.showToast('Tool: ' + item.label);
    }
    this.dropdown = null;
  }

  showToast(text) {
    this.toast = {text, until: performance.now() + 2200};
  }

  /* --------------------------- Main Render ------------------------------- */
  render(now) {
    if (!now) now = performance.now();
    // Tick simulation
    if (now - this.lastTickAt > this.tickInterval) {
      this.sim.tick();
      this.lastTickAt = now;
      this.computeIndicators();
      // If user is at the right edge, follow the price
      if (this.viewEnd >= this.sim.candles.length + 5) {
        this.viewEnd = this.sim.candles.length + 5;
      }
      this.autoScale();
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    this.buttons = [];

    this.drawBackground();
    this.drawGrid();
    this.drawCandles();
    this.drawVolume();
    this.drawIndicators();
    this.drawPane();
    this.drawDrawings();
    this.drawCurrentPriceLine();
    this.drawPriceAxis();
    this.drawTimeAxis();
    this.drawCrosshair();
    this.drawLegend();
    this.drawToolbar();
    this.drawStatusBar();
    this.drawDropdown();
    this.drawToast(now);

    // Hover detection for drawings (only if not dragging)
    if (!this.isDragging && this.activeTool === 'eraser') {
      this.hoverDrawing = this.findDrawingAt(this.mouseX, this.mouseY);
    } else {
      this.hoverDrawing = null;
    }
  }

  drawBackground() {
    const ctx = this.ctx;
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, this.W, this.H);
    // Toolbar area
    ctx.fillStyle = THEME.toolbarBg;
    ctx.fillRect(0, 0, this.W, this.layout.toolbarH);
    // Status bar area
    ctx.fillStyle = THEME.toolbarBg;
    ctx.fillRect(0, this.H - this.layout.statusH, this.W, this.layout.statusH);
    // Borders
    ctx.strokeStyle = THEME.toolbarBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.layout.toolbarH + 0.5);
    ctx.lineTo(this.W, this.layout.toolbarH + 0.5);
    ctx.moveTo(0, this.H - this.layout.statusH - 0.5);
    ctx.lineTo(this.W, this.H - this.layout.statusH - 0.5);
    ctx.stroke();
  }

  /* --------------------------- Grid -------------------------------------- */
  drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = THEME.textDim;
    ctx.textBaseline = 'middle';

    // Horizontal price grid lines - auto-spacing
    const range = this.maxPrice - this.minPrice;
    const targetLines = 8;
    const rawStep = range / targetLines;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    let step;
    if (norm < 1.5) step = 1 * mag;
    else if (norm < 3) step = 2 * mag;
    else if (norm < 7) step = 5 * mag;
    else step = 10 * mag;
    const decimals = this.symbol.decimals;

    const startP = Math.ceil(this.minPrice / step) * step;
    for (let p = startP; p <= this.maxPrice; p += step) {
      const y = this.priceToY(p);
      if (y < this.priceTop - 1 || y > this.priceBottom + 1) continue;
      ctx.beginPath();
      ctx.moveTo(this.chartLeft, Math.floor(y) + 0.5);
      ctx.lineTo(this.chartRight, Math.floor(y) + 0.5);
      ctx.stroke();
    }

    // Vertical time grid lines
    const stepIdx = this.calcTimeStep();
    const startIdx = Math.max(0, Math.floor(this.viewStart));
    const endIdx = Math.min(this.sim.candles.length, Math.ceil(this.viewEnd));
    ctx.strokeStyle = THEME.grid;
    for (let i = startIdx; i < endIdx; i++) {
      if (i % stepIdx === 0) {
        const x = this.indexToX(i);
        if (x < this.chartLeft || x > this.chartRight) continue;
        ctx.beginPath();
        ctx.moveTo(Math.floor(x) + 0.5, this.chartTop);
        ctx.lineTo(Math.floor(x) + 0.5, this.layout.paneBottom);
        ctx.stroke();
      }
    }

    // Pane separator
    if (this.layout.paneH > 0) {
      ctx.strokeStyle = THEME.toolbarBorder;
      ctx.beginPath();
      ctx.moveTo(0, this.paneTop - 0.5);
      ctx.lineTo(this.W, this.paneTop - 0.5);
      ctx.stroke();
    }
  }

  calcTimeStep() {
    const visible = this.getVisibleCount();
    if (visible < 10) return 1;
    if (visible < 25) return 5;
    if (visible < 60) return 10;
    if (visible < 150) return 30;
    if (visible < 400) return 60;
    return 120;
  }

  /* --------------------------- Candles ----------------------------------- */
  drawCandles() {
    const ctx = this.ctx;
    const start = Math.max(0, Math.floor(this.viewStart));
    const end = Math.min(this.sim.candles.length, Math.ceil(this.viewEnd));
    const bodyW = Math.max(1, this.candleW);
    const wickW = Math.max(1, this.candleW * 0.12);
    const decimals = this.symbol.decimals;

    for (let i = start; i < end; i++) {
      const c = this.sim.candles[i];
      const x = this.indexToX(i);
      if (x < this.chartLeft - bodyW || x > this.chartRight + bodyW) continue;

      const isBull = c.close >= c.open;
      const color = isBull ? THEME.bull : THEME.bear;
      const yOpen = this.priceToY(c.open);
      const yClose = this.priceToY(c.close);
      const yHigh = this.priceToY(c.high);
      const yLow = this.priceToY(c.low);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = wickW;
      ctx.beginPath();
      ctx.moveTo(Math.floor(x) + 0.5, yHigh);
      ctx.lineTo(Math.floor(x) + 0.5, yLow);
      ctx.stroke();

      // Body
      ctx.fillStyle = color;
      const bodyTop = Math.min(yOpen, yClose);
      const bodyH = Math.max(1, Math.abs(yClose - yOpen));
      ctx.fillRect(Math.floor(x - bodyW / 2), Math.floor(bodyTop), Math.ceil(bodyW), Math.ceil(bodyH));
    }
  }

  /* --------------------------- Volume ------------------------------------ */
  drawVolume() {
    const ctx = this.ctx;
    const start = Math.max(0, Math.floor(this.viewStart));
    const end = Math.min(this.sim.candles.length, Math.ceil(this.viewEnd));
    if (start >= end) return;

    let maxVol = 0;
    for (let i = start; i < end; i++) {
      if (this.sim.candles[i].volume > maxVol) maxVol = this.sim.candles[i].volume;
    }
    if (maxVol === 0) return;

    const bodyW = Math.max(1, this.candleW);
    const volTop = this.volTop;
    const volBot = this.volBottom;
    const h = volBot - volTop;

    for (let i = start; i < end; i++) {
      const c = this.sim.candles[i];
      const x = this.indexToX(i);
      if (x < this.chartLeft - bodyW || x > this.chartRight + bodyW) continue;
      const isBull = c.close >= c.open;
      const barH = (c.volume / maxVol) * h;
      ctx.fillStyle = isBull ? THEME.bullVol : THEME.bearVol;
      ctx.fillRect(Math.floor(x - bodyW / 2), Math.floor(volBot - barH), Math.ceil(bodyW), Math.ceil(barH));
    }

    // Volume SMA
    if (this.activeIndicators.has('volsma') && this.indCache.volsma) {
      const sma = this.indCache.volsma;
      ctx.strokeStyle = THEME.ma2;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (let i = start; i < end; i++) {
        if (sma[i] === null) continue;
        const x = this.indexToX(i);
        const y = volBot - (sma[i] / maxVol) * h;
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // Volume label
    ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = THEME.textDim;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const lastVol = this.sim.candles[end - 1].volume;
    ctx.fillText('Vol ' + fmtVolume(lastVol), this.chartLeft + 6, volTop + 2);
  }

  /* --------------------------- Indicators -------------------------------- */
  drawIndicators() {
    const ctx = this.ctx;
    const start = Math.max(0, Math.floor(this.viewStart));
    const end = Math.min(this.sim.candles.length, Math.ceil(this.viewEnd));

    const drawLine = (arr, color, lw = 1.4) => {
      if (!arr) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      let started = false;
      for (let i = start; i < end; i++) {
        if (arr[i] === null || arr[i] === undefined) { started = false; continue; }
        const x = this.indexToX(i);
        const y = this.priceToY(arr[i]);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    if (this.activeIndicators.has('ma20'))  drawLine(this.indCache.ma20,  THEME.ma1);
    if (this.activeIndicators.has('ma50'))  drawLine(this.indCache.ma50,  THEME.ma2);
    if (this.activeIndicators.has('ma200')) drawLine(this.indCache.ma200, THEME.ma3);
    if (this.activeIndicators.has('ema20')) drawLine(this.indCache.ema20, THEME.ma1, 1.6);
    if (this.activeIndicators.has('ema50')) drawLine(this.indCache.ema50, THEME.ma2, 1.6);

    if (this.activeIndicators.has('bb') && this.indCache.bb) {
      const bb = this.indCache.bb;
      // Fill between upper and lower
      ctx.fillStyle = THEME.bollingerBand;
      ctx.beginPath();
      let started = false;
      for (let i = start; i < end; i++) {
        if (bb.upper[i] === null) { started = false; continue; }
        const x = this.indexToX(i);
        const y = this.priceToY(bb.upper[i]);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      for (let i = end - 1; i >= start; i--) {
        if (bb.lower[i] === null) continue;
        const x = this.indexToX(i);
        const y = this.priceToY(bb.lower[i]);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      drawLine(bb.upper, THEME.ma3, 1);
      drawLine(bb.lower, THEME.ma3, 1);
      drawLine(bb.mid,   THEME.bollingerMid, 1);
    }
  }

  /* --------------------------- Pane (RSI/MACD) --------------------------- */
  drawPane() {
    if (this.layout.paneH === 0) return;
    const ctx = this.ctx;
    const top = this.paneTop;
    const bot = this.paneBottom;
    const left = this.paneLeft;
    const right = this.paneRight;

    if (this.activeIndicators.has('rsi')) {
      const rsi = this.indCache.rsi;
      if (!rsi) return;
      // Background grid for 30/50/70
      ctx.strokeStyle = THEME.grid;
      ctx.lineWidth = 1;
      [30, 50, 70].forEach(level => {
        const y = top + (1 - level / 100) * (bot - top);
        ctx.beginPath();
        ctx.moveTo(left, y + 0.5);
        ctx.lineTo(right, y + 0.5);
        ctx.stroke();
      });
      // Overbought/oversold lines
      ctx.strokeStyle = THEME.rsiOver;
      ctx.setLineDash([3, 3]);
      let y70 = top + (1 - 70 / 100) * (bot - top);
      ctx.beginPath(); ctx.moveTo(left, y70); ctx.lineTo(right, y70); ctx.stroke();
      ctx.strokeStyle = THEME.rsiUnder;
      let y30 = top + (1 - 30 / 100) * (bot - top);
      ctx.beginPath(); ctx.moveTo(left, y30); ctx.lineTo(right, y30); ctx.stroke();
      ctx.setLineDash([]);

      // RSI line
      const start = Math.max(0, Math.floor(this.viewStart));
      const end = Math.min(rsi.length, Math.ceil(this.viewEnd));
      ctx.strokeStyle = THEME.rsi;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let i = start; i < end; i++) {
        if (rsi[i] === null) { started = false; continue; }
        const x = this.indexToX(i);
        const y = top + (1 - rsi[i] / 100) * (bot - top);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Label
      ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = THEME.rsi;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const last = rsi[rsi.length - 1];
      ctx.fillText('RSI 14: ' + (last !== null ? last.toFixed(2) : '—'), left + 6, top + 4);

      // Right axis labels
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'left';
      [70, 50, 30].forEach(level => {
        const y = top + (1 - level / 100) * (bot - top);
        ctx.fillText(String(level), right + 4, y - 5);
      });
    } else if (this.activeIndicators.has('macd')) {
      const macd = this.indCache.macd;
      if (!macd) return;
      const start = Math.max(0, Math.floor(this.viewStart));
      const end = Math.min(macd.macd.length, Math.ceil(this.viewEnd));
      // Find max abs value
      let maxAbs = 0;
      for (let i = start; i < end; i++) {
        if (macd.hist[i] !== null) maxAbs = Math.max(maxAbs, Math.abs(macd.hist[i]), Math.abs(macd.macd[i] || 0), Math.abs(macd.signal[i] || 0));
      }
      if (maxAbs === 0) maxAbs = 1;
      const midY = (top + bot) / 2;
      const halfH = (bot - top) / 2 - 4;
      // Zero line
      ctx.strokeStyle = THEME.gridStrong;
      ctx.beginPath();
      ctx.moveTo(left, midY + 0.5);
      ctx.lineTo(right, midY + 0.5);
      ctx.stroke();
      // Histogram
      const bodyW = Math.max(1, this.candleW);
      for (let i = start; i < end; i++) {
        if (macd.hist[i] === null) continue;
        const x = this.indexToX(i);
        const h = (macd.hist[i] / maxAbs) * halfH;
        ctx.fillStyle = macd.hist[i] >= 0 ? THEME.macdHistBull : THEME.macdHistBear;
        if (h >= 0) ctx.fillRect(Math.floor(x - bodyW / 2), Math.floor(midY - h), Math.ceil(bodyW), Math.ceil(h));
        else ctx.fillRect(Math.floor(x - bodyW / 2), Math.floor(midY), Math.ceil(bodyW), Math.ceil(-h));
      }
      // MACD line
      const drawMacdLine = (arr, color) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        let started = false;
        for (let i = start; i < end; i++) {
          if (arr[i] === null) { started = false; continue; }
          const x = this.indexToX(i);
          const y = midY - (arr[i] / maxAbs) * halfH;
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      drawMacdLine(macd.macd, THEME.macd);
      drawMacdLine(macd.signal, THEME.macdSignal);

      // Label
      ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = THEME.macd;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const lastMacd = macd.macd[macd.macd.length - 1];
      ctx.fillText('MACD 12,26,9: ' + (lastMacd !== null ? lastMacd.toFixed(3) : '—'), left + 6, top + 4);
    }
  }

  /* --------------------------- Drawings ---------------------------------- */
  drawDrawings() {
    const ctx = this.ctx;
    const drawOne = (d, isActive = false) => {
      const color = isActive ? THEME.drawingActive : (d.color || THEME.drawing);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.5;
      const isHover = (d === this.hoverDrawing);
      if (isHover) { ctx.lineWidth = 2.5; ctx.strokeStyle = THEME.drawingActive; }

      switch (d.type) {
        case 'trend': {
          const x1 = this.timeToX(d.t1);
          const x2 = this.timeToX(d.t2);
          if (x1 === null || x2 === null) return;
          const y1 = this.priceToY(d.p1);
          const y2 = this.priceToY(d.p2);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          // Endpoint dots
          ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill();
          break;
        }
        case 'hline': {
          const y = this.priceToY(d.price);
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(this.chartLeft, y);
          ctx.lineTo(this.chartRight, y);
          ctx.stroke();
          ctx.setLineDash([]);
          // Label on right
          ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
          const txt = fmtPrice(d.price, this.symbol.decimals);
          const tw = ctx.measureText(txt).width + 8;
          ctx.fillStyle = color;
          ctx.fillRect(this.chartRight + 1, y - 7, tw, 14);
          ctx.fillStyle = THEME.bg;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(txt, this.chartRight + 5, y);
          break;
        }
        case 'vline': {
          const x = this.timeToX(d.time);
          if (x === null) return;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(x, this.chartTop);
          ctx.lineTo(x, this.layout.paneBottom);
          ctx.stroke();
          ctx.setLineDash([]);
          break;
        }
        case 'rect': {
          const x1 = this.timeToX(d.t1);
          const x2 = this.timeToX(d.t2);
          if (x1 === null || x2 === null) return;
          const y1 = this.priceToY(d.p1);
          const y2 = this.priceToY(d.p2);
          const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
          const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
          ctx.fillStyle = color + '22';
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);
          break;
        }
        case 'fib': {
          const x1 = this.timeToX(d.t1);
          const x2 = this.timeToX(d.t2);
          if (x1 === null || x2 === null) return;
          const y1 = this.priceToY(d.p1);
          const y2 = this.priceToY(d.p2);
          const xL = Math.min(x1, x2), xR = Math.max(x1, x2);
          const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
          const colors = ['#787b86','#ef5350','#ff9800','#26a69a','#2962ff','#9c27b0','#ef5350','#26a69a'];
          ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          for (let i = 0; i < levels.length; i++) {
            const y = y1 + (y2 - y1) * levels[i];
            ctx.strokeStyle = colors[i];
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(xL, y);
            ctx.lineTo(xR, y);
            ctx.stroke();
            ctx.setLineDash([]);
            const p = d.p1 + (d.p2 - d.p1) * levels[i];
            const txt = (levels[i] * 100).toFixed(1) + '% ' + fmtPrice(p, this.symbol.decimals);
            const tw = ctx.measureText(txt).width + 6;
            ctx.fillStyle = colors[i];
            ctx.fillRect(xR + 1, y - 7, tw, 14);
            ctx.fillStyle = THEME.bg;
            ctx.fillText(txt, xR + 4, y);
          }
          break;
        }
        case 'brush': {
          if (!d.points || d.points.length === 0) return;
          ctx.beginPath();
          // Use stored absolute coords - but those are stale after pan.
          // Better: re-project from t/p
          ctx.lineWidth = 2;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (let i = 0; i < d.points.length; i++) {
            const p = d.points[i];
            const x = p.t !== null ? (this.timeToX(p.t) !== null ? this.timeToX(p.t) : p.x) : p.x;
            const y = this.priceToY(p.p);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          break;
        }
      }
    };

    for (const d of this.drawings) drawOne(d);
    if (this.currentDrawing) drawOne(this.currentDrawing, true);
  }

  findDrawingAt(x, y) {
    // Reverse so top drawings are hit first
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      if (this.hitTestDrawing(d, x, y)) return d;
    }
    return null;
  }

  hitTestDrawing(d, x, y) {
    const tol = 6;
    switch (d.type) {
      case 'trend': {
        const x1 = this.timeToX(d.t1);
        const x2 = this.timeToX(d.t2);
        if (x1 === null || x2 === null) return false;
        const y1 = this.priceToY(d.p1);
        const y2 = this.priceToY(d.p2);
        return this.distToSegment(x, y, x1, y1, x2, y2) < tol;
      }
      case 'hline': {
        const yy = this.priceToY(d.price);
        return Math.abs(y - yy) < tol && x >= this.chartLeft && x <= this.chartRight;
      }
      case 'vline': {
        const xx = this.timeToX(d.time);
        if (xx === null) return false;
        return Math.abs(x - xx) < tol && y >= this.chartTop && y <= this.layout.paneBottom;
      }
      case 'rect': {
        const x1 = this.timeToX(d.t1);
        const x2 = this.timeToX(d.t2);
        if (x1 === null || x2 === null) return false;
        const y1 = this.priceToY(d.p1);
        const y2 = this.priceToY(d.p2);
        const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
        const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
        // Edge hit
        const onTop    = Math.abs(y - ry) < tol && x >= rx && x <= rx + rw;
        const onBot    = Math.abs(y - (ry + rh)) < tol && x >= rx && x <= rx + rw;
        const onLeft   = Math.abs(x - rx) < tol && y >= ry && y <= ry + rh;
        const onRight  = Math.abs(x - (rx + rw)) < tol && y >= ry && y <= ry + rh;
        return onTop || onBot || onLeft || onRight;
      }
    }
    return false;
  }

  distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return dist(px, py, x1, y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / len2;
    t = clamp(t, 0, 1);
    return dist(px, py, x1 + t * dx, y1 + t * dy);
  }

  /* --------------------------- Current Price Line ------------------------ */
  drawCurrentPriceLine() {
    if (!this.showCurrentPriceLine) return;
    const ctx = this.ctx;
    const last = this.sim.candles[this.sim.candles.length - 1];
    if (!last) return;
    const y = this.priceToY(last.close);
    const isBull = last.close >= last.open;
    const color = isBull ? THEME.currentPriceBull : THEME.currentPriceBear;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(this.chartLeft, y);
    ctx.lineTo(this.chartRight, y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Label on price axis
    const txt = fmtPrice(last.close, this.symbol.decimals);
    ctx.font = 'bold 11px -apple-system, Segoe UI, Roboto, sans-serif';
    const tw = ctx.measureText(txt).width + 10;
    ctx.fillStyle = color;
    roundRect(ctx, this.chartRight + 1, y - 9, tw, 18, 2);
    ctx.fill();
    ctx.fillStyle = THEME.textBright;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, this.chartRight + 1 + tw / 2, y);
  }

  /* --------------------------- Price Axis -------------------------------- */
  drawPriceAxis() {
    const ctx = this.ctx;
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = THEME.textDim;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const range = this.maxPrice - this.minPrice;
    const targetLines = 8;
    const rawStep = range / targetLines;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    let step;
    if (norm < 1.5) step = 1 * mag;
    else if (norm < 3) step = 2 * mag;
    else if (norm < 7) step = 5 * mag;
    else step = 10 * mag;
    const decimals = this.symbol.decimals;
    const startP = Math.ceil(this.minPrice / step) * step;
    ctx.fillStyle = THEME.panelBg;
    ctx.fillRect(this.chartRight + 1, this.chartTop, this.W - this.chartRight - 1, this.chartBottom - this.chartTop);
    ctx.fillStyle = THEME.textDim;
    for (let p = startP; p <= this.maxPrice; p += step) {
      const y = this.priceToY(p);
      if (y < this.priceTop - 1 || y > this.priceBottom + 1) continue;
      ctx.fillText(fmtPrice(p, decimals), this.chartRight + 6, y);
    }
    // Border between chart and price axis
    ctx.strokeStyle = THEME.toolbarBorder;
    ctx.beginPath();
    ctx.moveTo(this.chartRight + 0.5, this.chartTop);
    ctx.lineTo(this.chartRight + 0.5, this.chartBottom);
    ctx.stroke();
  }

  /* --------------------------- Time Axis --------------------------------- */
  drawTimeAxis() {
    const ctx = this.ctx;
    ctx.fillStyle = THEME.panelBg;
    ctx.fillRect(0, this.layout.paneBottom, this.chartRight + 1, this.layout.timeAxisH);
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = THEME.textDim;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const stepIdx = this.calcTimeStep();
    const startIdx = Math.max(0, Math.floor(this.viewStart));
    const endIdx = Math.min(this.sim.candles.length, Math.ceil(this.viewEnd));
    for (let i = startIdx; i < endIdx; i++) {
      if (i % stepIdx !== 0) continue;
      const x = this.indexToX(i);
      if (x < this.chartLeft + 20 || x > this.chartRight - 20) continue;
      const t = this.sim.candles[i].time;
      ctx.fillText(fmtTimeShort(t, this.timeframe.label), x, this.layout.paneBottom + this.layout.timeAxisH / 2);
    }
    // Border
    ctx.strokeStyle = THEME.toolbarBorder;
    ctx.beginPath();
    ctx.moveTo(0, this.layout.paneBottom + 0.5);
    ctx.lineTo(this.chartRight, this.layout.paneBottom + 0.5);
    ctx.stroke();
  }

  /* --------------------------- Crosshair --------------------------------- */
  drawCrosshair() {
    if (!this.mouseInside || this.crosshairIndex === null) return;
    if (this.activeTool !== 'cursor') return;
    const ctx = this.ctx;
    const idx = this.crosshairIndex;
    if (idx < 0 || idx >= this.sim.candles.length) return;
    const x = this.indexToX(idx);
    const y = this.mouseY;
    if (!this.inChartArea(this.mouseX, this.mouseY) && !this.inPriceAxis(this.mouseX, this.mouseY) && !this.inTimeAxis(this.mouseX, this.mouseY)) return;

    ctx.strokeStyle = THEME.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    // Vertical line
    if (this.mouseY < this.layout.paneBottom) {
      ctx.beginPath();
      ctx.moveTo(Math.floor(x) + 0.5, this.chartTop);
      ctx.lineTo(Math.floor(x) + 0.5, this.layout.paneBottom);
      ctx.stroke();
    }
    // Horizontal line
    if (this.mouseX < this.chartRight) {
      ctx.beginPath();
      ctx.moveTo(this.chartLeft, Math.floor(y) + 0.5);
      ctx.lineTo(this.chartRight, Math.floor(y) + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Time label on axis
    const t = this.sim.candles[idx].time;
    const timeStr = fmtTime(t, this.timeframe.label);
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    const tw = ctx.measureText(timeStr).width + 14;
    ctx.fillStyle = THEME.crosshairLabel;
    roundRect(ctx, x - tw / 2, this.layout.paneBottom + 2, tw, this.layout.timeAxisH - 4, 3);
    ctx.fill();
    ctx.fillStyle = THEME.textBright;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, x, this.layout.paneBottom + this.layout.timeAxisH / 2);

    // Price label on axis
    if (this.mouseX < this.chartRight && this.mouseY >= this.chartTop && this.mouseY <= this.chartBottom) {
      const price = this.yToPrice(y);
      const priceStr = fmtPrice(price, this.symbol.decimals);
      const pw = ctx.measureText(priceStr).width + 14;
      ctx.fillStyle = THEME.crosshairLabel;
      roundRect(ctx, this.chartRight + 1, y - 9, pw, 18, 3);
      ctx.fill();
      ctx.fillStyle = THEME.textBright;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(priceStr, this.chartRight + 1 + pw / 2, y);
    }
  }

  /* --------------------------- Legend ------------------------------------ */
  drawLegend() {
    const ctx = this.ctx;
    const last = this.sim.candles[this.sim.candles.length - 1];
    if (!last) return;
    const idx = this.crosshairIndex !== null ? this.crosshairIndex : this.sim.candles.length - 1;
    const c = this.sim.candles[idx];
    const decimals = this.symbol.decimals;

    // OHLC legend top-left of chart
    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    let xCursor = this.chartLeft + 6;
    const yCursor = this.chartTop + 6;

    // Symbol + TF
    ctx.fillStyle = THEME.textBright;
    ctx.font = 'bold 12px -apple-system, Segoe UI, Roboto, sans-serif';
    const symTxt = this.symbol.label + ' · ' + this.timeframe.label;
    ctx.fillText(symTxt, xCursor, yCursor);
    xCursor += ctx.measureText(symTxt).width + 12;

    // OHLC values
    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    const isBull = c.close >= c.open;
    const parts = [
      {label:'O', value: fmtPrice(c.open, decimals)},
      {label:'H', value: fmtPrice(c.high, decimals)},
      {label:'L', value: fmtPrice(c.low, decimals)},
      {label:'C', value: fmtPrice(c.close, decimals)},
      {label:'Vol', value: fmtVolume(c.volume)}
    ];
    for (const p of parts) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(p.label, xCursor, yCursor);
      xCursor += ctx.measureText(p.label).width + 4;
      ctx.fillStyle = isBull ? THEME.bull : THEME.bear;
      ctx.fillText(p.value, xCursor, yCursor);
      xCursor += ctx.measureText(p.value).width + 12;
    }
    // Change
    const change = c.close - c.open;
    const changePct = (change / c.open) * 100;
    const changeTxt = (change >= 0 ? '+' : '') + fmtPrice(change, decimals) + ' (' + (change >= 0 ? '+' : '') + changePct.toFixed(2) + '%)';
    ctx.fillStyle = isBull ? THEME.bull : THEME.bear;
    ctx.fillText(changeTxt, xCursor, yCursor);

    // Indicator values next line
    let yLine2 = yCursor + 18;
    let xLine2 = this.chartLeft + 6;
    const drawIndVal = (label, val, color) => {
      ctx.fillStyle = color;
      ctx.fillText(label, xLine2, yLine2);
      xLine2 += ctx.measureText(label).width + 4;
      ctx.fillStyle = THEME.text;
      ctx.fillText(val, xLine2, yLine2);
      xLine2 += ctx.measureText(val).width + 14;
    };
    if (this.activeIndicators.has('ma20') && this.indCache.ma20 && this.indCache.ma20[idx] !== null) drawIndVal('MA20:', fmtPrice(this.indCache.ma20[idx], decimals), THEME.ma1);
    if (this.activeIndicators.has('ma50') && this.indCache.ma50 && this.indCache.ma50[idx] !== null) drawIndVal('MA50:', fmtPrice(this.indCache.ma50[idx], decimals), THEME.ma2);
    if (this.activeIndicators.has('ma200') && this.indCache.ma200 && this.indCache.ma200[idx] !== null) drawIndVal('MA200:', fmtPrice(this.indCache.ma200[idx], decimals), THEME.ma3);
    if (this.activeIndicators.has('ema20') && this.indCache.ema20 && this.indCache.ema20[idx] !== null) drawIndVal('EMA20:', fmtPrice(this.indCache.ema20[idx], decimals), THEME.ma1);
    if (this.activeIndicators.has('ema50') && this.indCache.ema50 && this.indCache.ema50[idx] !== null) drawIndVal('EMA50:', fmtPrice(this.indCache.ema50[idx], decimals), THEME.ma2);
    if (this.activeIndicators.has('bb') && this.indCache.bb && this.indCache.bb.mid[idx] !== null) {
      drawIndVal('BB(20,2):', fmtPrice(this.indCache.bb.mid[idx], decimals), THEME.bollingerMid);
      drawIndVal('U:', fmtPrice(this.indCache.bb.upper[idx], decimals), THEME.ma3);
      drawIndVal('L:', fmtPrice(this.indCache.bb.lower[idx], decimals), THEME.ma3);
    }
  }

  /* --------------------------- Toolbar ----------------------------------- */
  drawToolbar() {
    const ctx = this.ctx;
    let x = 8;
    const y = 7;
    const h = 30;

    // Symbol button
    x = this.drawButton({id:'symbol', action:'symbol', x, y, w: 100, h, label: this.symbol.label, icon:'caret'});
    x += 6;
    // Timeframe button
    x = this.drawButton({id:'tf', action:'timeframe', x, y, w: 50, h, label: this.timeframe.label, icon:'caret'});
    x += 6;
    // Indicators button
    x = this.drawButton({id:'ind', action:'indicator', x, y, w: 110, h, label:'Indicators', icon:'plus'});
    x += 6;
    // Drawing tools button
    const toolLabel = DRAW_TOOLS.find(t => t.id === this.activeTool).label;
    x = this.drawButton({id:'tool', action:'tool', x, y, w: 130, h, label: toolLabel, icon:'caret'});
    x += 6;
    // Reset
    x = this.drawButton({id:'reset', action:'reset', x, y, w: 60, h, label:'Reset', icon:null});
    x += 6;
    // Settings
    x = this.drawButton({id:'settings', action:'settings', x, y, w: 70, h, label:'Settings', icon:null});

    // Right side: live indicator
    const rightX = this.W - 8;
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = THEME.textDim;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    const liveTxt = '● LIVE';
    ctx.fillStyle = THEME.bull;
    ctx.fillText(liveTxt, rightX, y + h / 2);
    // Clock
    const now = new Date();
    const pad = (v) => String(v).padStart(2, '0');
    const timeTxt = pad(now.getUTCHours()) + ':' + pad(now.getUTCMinutes()) + ':' + pad(now.getUTCSeconds()) + ' UTC';
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(timeTxt, rightX - 60, y + h / 2);
  }

  drawButton(btn) {
    const ctx = this.ctx;
    const isHover = this.hoverButton && this.hoverButton.id === btn.id;
    let bg = THEME.buttonBg;
    if (isHover) bg = THEME.buttonHover;
    if (btn.active) bg = THEME.buttonActive;
    ctx.fillStyle = bg;
    roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 4);
    ctx.fill();
    // Border
    ctx.strokeStyle = THEME.toolbarBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, btn.x + 0.5, btn.y + 0.5, btn.w - 1, btn.h - 1, 4);
    ctx.stroke();
    // Label
    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = btn.active ? THEME.textBright : THEME.buttonText;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const cx = btn.x + btn.w / 2;
    const cy = btn.y + btn.h / 2;
    let textW = ctx.measureText(btn.label).width;
    let labelX = cx;
    if (btn.icon === 'caret') labelX = cx - 6;
    if (btn.icon === 'plus') labelX = cx - 6;
    ctx.fillText(btn.label, labelX, cy);
    // Icon
    if (btn.icon === 'caret') {
      ctx.fillStyle = THEME.textDim;
      ctx.beginPath();
      ctx.moveTo(cx + textW / 2 + 4, cy - 3);
      ctx.lineTo(cx + textW / 2 + 9, cy);
      ctx.lineTo(cx + textW / 2 + 4, cy + 3);
      ctx.closePath();
      ctx.fill();
    } else if (btn.icon === 'plus') {
      ctx.strokeStyle = THEME.textDim;
      ctx.lineWidth = 1.2;
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

  /* --------------------------- Status Bar -------------------------------- */
  drawStatusBar() {
    const ctx = this.ctx;
    const y = this.H - this.layout.statusH;
    const last = this.sim.candles[this.sim.candles.length - 1];
    if (!last) return;

    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    let x = 10;
    const draw = (label, value, color) => {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(label, x, y + this.layout.statusH / 2);
      x += ctx.measureText(label).width + 4;
      ctx.fillStyle = color || THEME.text;
      ctx.fillText(value, x, y + this.layout.statusH / 2);
      x += ctx.measureText(value).width + 16;
    };

    draw('Bid', fmtPrice(last.close - 0.5, this.symbol.decimals), THEME.bear);
    draw('Ask', fmtPrice(last.close + 0.5, this.symbol.decimals), THEME.bull);
    draw('Spread', fmt(0.5 * 2, this.symbol.decimals));
    draw('24h High', fmtPrice(this.sim.candles.slice(-24).reduce((m, c) => Math.max(m, c.high), 0), this.symbol.decimals));
    draw('24h Low', fmtPrice(this.sim.candles.slice(-24).reduce((m, c) => Math.min(m, c.low), Infinity), this.symbol.decimals));
    draw('24h Vol', fmtVolume(this.sim.candles.slice(-24).reduce((s, c) => s + c.volume, 0)));

    // Right side: tool indicator
    ctx.textAlign = 'right';
    ctx.fillStyle = THEME.textDim;
    const toolTxt = 'Tool: ' + DRAW_TOOLS.find(t => t.id === this.activeTool).label;
    ctx.fillText(toolTxt, this.W - 10, y + this.layout.statusH / 2);
    if (this.drawings.length > 0) {
      ctx.fillStyle = THEME.accent;
      ctx.fillText(this.drawings.length + ' drawings', this.W - 10 - ctx.measureText(toolTxt).width - 16, y + this.layout.statusH / 2);
    }
  }

  /* --------------------------- Dropdown ---------------------------------- */
  drawDropdown() {
    if (!this.dropdown) return;
    const ctx = this.ctx;
    const d = this.dropdown;
    // Backdrop shadow
    ctx.fillStyle = THEME.panelBg;
    roundRect(ctx, d.x, d.y, d.w, d.h, 4);
    ctx.fill();
    ctx.strokeStyle = THEME.toolbarBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1, 4);
    ctx.stroke();

    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const mouseItem = this.mouseInside ? this.hitDropdown(this.mouseX, this.mouseY) : null;
    for (const it of d.items) {
      const isHover = (it === mouseItem);
      if (isHover) {
        ctx.fillStyle = THEME.buttonHover;
        ctx.fillRect(d.x + 1, it.y, d.w - 2, it.h);
      }
      let xCursor = d.x + 12;
      // Checkbox for indicators
      if (it.checked !== undefined) {
        ctx.strokeStyle = it.checked ? THEME.accent : THEME.textDim;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(xCursor, it.y + it.h / 2 - 6, 12, 12);
        if (it.checked) {
          ctx.strokeStyle = THEME.accent;
          ctx.beginPath();
          ctx.moveTo(xCursor + 2, it.y + it.h / 2);
          ctx.lineTo(xCursor + 5, it.y + it.h / 2 + 3);
          ctx.lineTo(xCursor + 10, it.y + it.h / 2 - 3);
          ctx.stroke();
        }
        xCursor += 18;
      }
      ctx.fillStyle = it.checked ? THEME.textBright : THEME.text;
      ctx.fillText(it.label, xCursor, it.y + it.h / 2);
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
    roundRect(ctx, x, y, tw, th, 4);
    ctx.fill();
    ctx.fillStyle = THEME.textBright;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.toast.text, x + tw / 2, y + th / 2);
  }

  /* --------------------------- Main Loop --------------------------------- */
  start() {
    const loop = (now) => {
      this.render(now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }
}

/* ============================ BOOTSTRAP ==================================== */
window.addEventListener('DOMContentLoaded', () => {
  // Minimal body styling (no CSS file, just JS to remove default margin)
  document.body.style.margin = '0';
  document.body.style.background = THEME.bg;
  document.body.style.overflow = 'hidden';
  document.body.style.fontFamily = '-apple-system, Segoe UI, Roboto, sans-serif';

  const canvas = document.getElementById('chart');
  canvas.style.display = 'block';
  canvas.style.cursor = 'crosshair';

  const chart = new TradingChart(canvas);
  chart.start();

  // Expose for debugging
  window.__chart = chart;
});

})();
