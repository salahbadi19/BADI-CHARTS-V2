/* =============================================================================
 * TRADING CHART ENGINE v2 — Pixel-Perfect Pure JavaScript Canvas
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
 * No HTML elements for UI, no CSS styling — everything is canvas-drawn.
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
function isBaseDecimal(base) { return base !== 0 && (base & (base - 1)) === 0; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

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

/* ============================ LWC TIME TICK MARKS =========================== */
// Ported from LWC src/model/tick-marks.ts
class TimeTickMarks {
  constructor() {
    this._marksByWeight = new Map();
    this._cache = null;
  }
  setPoints(points) {
    this._marksByWeight.clear();
    this._cache = null;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      let arr = this._marksByWeight.get(p.weight);
      if (!arr) { arr = []; this._marksByWeight.set(p.weight, arr); }
      arr.push({index: i, time: p.time, weight: p.weight});
    }
  }
  build(spacing, maxWidth) {
    const maxIndexesPerMark = Math.ceil(maxWidth / spacing);
    if (!this._cache || this._cache.maxIndexesPerMark !== maxIndexesPerMark) {
      this._cache = {
        maxIndexesPerMark,
        marks: this._buildImpl(maxIndexesPerMark)
      };
    }
    return this._cache.marks;
  }
  _buildImpl(maxIndexesPerMark) {
    let marks = [];
    const weights = Array.from(this._marksByWeight.keys()).sort((a, b) => b - a);
    for (const w of weights) {
      const currentWeight = this._marksByWeight.get(w);
      const prevMarks = marks;
      marks = [];
      const prevMarksLength = prevMarks.length;
      let prevMarksPointer = 0;
      const currentWeightLength = currentWeight.length;
      let rightIndex = Infinity;
      let leftIndex = -Infinity;
      for (let i = 0; i < currentWeightLength; i++) {
        const mark = currentWeight[i];
        const currentIndex = mark.index;
        while (prevMarksPointer < prevMarksLength) {
          const lastMark = prevMarks[prevMarksPointer];
          const lastIndex = lastMark.index;
          if (lastIndex < currentIndex) {
            prevMarksPointer++;
            marks.push(lastMark);
            leftIndex = lastIndex;
            rightIndex = Infinity;
          } else {
            rightIndex = lastIndex;
            break;
          }
        }
        if (rightIndex - currentIndex >= maxIndexesPerMark &&
            currentIndex - leftIndex >= maxIndexesPerMark) {
          marks.push(mark);
          leftIndex = currentIndex;
        }
      }
      for (; prevMarksPointer < prevMarksLength; prevMarksPointer++) {
        marks.push(prevMarks[prevMarksPointer]);
      }
    }
    return marks;
  }
}

/* ============================ TIME WEIGHT ASSIGNMENT ======================== */
// Assign TickMarkWeight to each candle based on its time (UTCTimestamp).
// Matches LWC's fillWeightsForPoints logic for business-day/UTCTimestamp.
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
      intPart = Math.round(intPart * base) / base;
      if (fracLength > 0) fracString = '.' + numberToStringWithLeadingZero(0, fracLength);
    }
    return intPart.toFixed(0) + fracString;
  }
}

/* ============================ DATE/TIME FORMATTERS ========================= */
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function formatMonthYear(date, locale = 'en-US') {
  // For year tick marks: short month name + year, e.g. "Jan 2025"
  return date.toLocaleDateString(locale, {month: 'short', year: 'numeric', timeZone: 'UTC'});
}
function formatMonth(date, locale = 'en-US') {
  return date.toLocaleDateString(locale, {month: 'short', year: '2-digit', timeZone: 'UTC'});
}
function formatDay(date) {
  return date.toLocaleDateString('en-US', {day: '2-digit', month: 'short', timeZone: 'UTC'});
}
function formatTime(date) {
  return pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes());
}
function formatTimeWithSeconds(date) {
  return pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes()) + ':' + pad2(date.getUTCSeconds());
}

// Format a tick mark based on its weight (LWC-style tickMarkFormatter).
// Matches LWC's default behavior: shorter labels for higher-density weights.
function formatTickMark(timeSec, weight, tf) {
  const date = new Date(timeSec * 1000);
  switch (weight) {
    case TickMarkWeight.Year:            return String(date.getUTCFullYear());
    case TickMarkWeight.Month:          return date.toLocaleDateString('en-US', {month: 'short', timeZone: 'UTC'});
    case TickMarkWeight.DayOfMonth:
    case TickMarkWeight.Day:            return String(date.getUTCDate()); // just day number, like LWC
    case TickMarkWeight.Time:           return formatTime(date);
    case TickMarkWeight.TimeWithSeconds:return formatTimeWithSeconds(date);
    default:                            return formatTime(date);
  }
}

/* ============================ CONSTANTS ===================================== */
const TIMEFRAMES = [
  {label:'1S',  ms:1000},
  {label:'1m',  ms:60*1000},
  {label:'5m',  ms:5*60*1000},
  {label:'15m', ms:15*60*1000},
  {label:'1H',  ms:60*60*1000},
  {label:'4H',  ms:4*60*60*1000},
  {label:'1D',  ms:24*60*60*1000},
  {label:'1W',  ms:7*24*60*60*1000}
];

const SYMBOLS = [
  {label:'BTCUSD', price:67500,   vol:0.012, decimals:2, priceScale:100},
  {label:'ETHUSD', price:3500,    vol:0.014, decimals:2, priceScale:100},
  {label:'SOLUSD', price:175,     vol:0.020, decimals:2, priceScale:100},
  {label:'XAUUSD', price:2380,    vol:0.004, decimals:2, priceScale:100},
  {label:'EURUSD', price:1.085,   vol:0.002, decimals:5, priceScale:100000},
  {label:'GBPUSD', price:1.275,   vol:0.002, decimals:5, priceScale:100000},
  {label:'AAPL',   price:225,     vol:0.008, decimals:2, priceScale:100},
  {label:'TSLA',   price:250,     vol:0.018, decimals:2, priceScale:100},
  {label:'NVDA',   price:120,     vol:0.014, decimals:2, priceScale:100}
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
  {id:'eraser',  label:'Delete Drawing',  icon:'eraser'}
];

/* ============================ INDICATOR MATH =============================== */
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
  }
};

/* ============================ DATA SIMULATOR =============================== */
class DataSimulator {
  constructor(symbol, timeframe) {
    this.symbol = symbol;
    this.timeframe = timeframe;
    this.tfMs = timeframe.ms;
    this.candles = [];
    this.basePrice = symbol.price;
    this.vol = symbol.vol;
    this.decimals = symbol.decimals;
    this.generate(800);
  }
  generate(count) {
    let price = this.basePrice;
    const now = Date.now();
    const startTime = Math.floor(now / this.tfMs) * this.tfMs - count * this.tfMs;
    for (let i = 0; i < count; i++) {
      const t = startTime + i * this.tfMs;
      const open = price;
      const volMult = 1 + Math.sin(i * 0.07) * 0.4 + (Math.random() - 0.5) * 0.6;
      const drift = (Math.random() - 0.5) * this.vol * volMult * 1.6;
      const macroBias = Math.sin(i * 0.013) * 0.0018
                      + Math.sin(i * 0.005 + 0.7) * 0.0012
                      + Math.sin(i * 0.027 + 1.3) * 0.0008;
      const meanRevert = (this.basePrice - price) / price * 0.006;
      const close = open * (1 + drift + macroBias + meanRevert);
      const range = this.vol * volMult * price * (0.5 + Math.random() * 0.8);
      const high = Math.max(open, close) + range * Math.random() * 0.7;
      const low = Math.min(open, close) - range * Math.random() * 0.7;
      const volume = Math.abs(close - open) / open * price * 50 + Math.random() * 1000 + 500;
      this.candles.push({time: Math.floor(t / 1000), open, high, low, close, volume});
      price = close;
    }
  }
  tick() {
    const now = Math.floor(Date.now() / this.tfMs) * this.tfMs;
    const last = this.candles[this.candles.length - 1];
    if (now > last.time * 1000) {
      const open = last.close;
      const drift = (Math.random() - 0.5) * this.vol * 2;
      const range = this.vol * open * (0.4 + Math.random() * 0.6);
      const high = open + Math.abs(drift) * open + range * Math.random();
      const low = open - Math.abs(drift) * open * 0.6 - range * Math.random();
      const close = low + (high - low) * Math.random();
      const volume = Math.abs(close - open) / open * open * 30 + 500 + Math.random() * 500;
      this.candles.push({time: Math.floor(now / 1000), open, high, low, close, volume});
      if (this.candles.length > 5000) this.candles.shift();
    } else {
      const drift = (Math.random() - 0.5) * this.vol * 0.5;
      const newClose = last.close * (1 + drift);
      last.close = newClose;
      last.high = Math.max(last.high, newClose);
      last.low = Math.min(last.low, newClose);
      last.volume += Math.random() * 50 + 10;
    }
  }
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
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;

    // Layout
    this.layout = {
      toolbarH: 44,
      statusH: 26,
      priceAxisW: 64,
      timeAxisH: 28,
      volumeH: 64,
      paneH: 0,
      gap: 8,
      leftPad: 0
    };

    // State
    this.symbol = SYMBOLS[0];
    this.timeframe = TIMEFRAMES[4]; // 1H
    this.sim = new DataSimulator(this.symbol, this.timeframe);

    // Viewport — barSpacing in media coords (CSS pixels)
    this.barSpacing = 8;       // LWC default ~6, we use 8 for cleaner initial view
    this.minBarSpacing = 1.4;  // LWC default minimum
    this.maxBarSpacing = 1e6;
    this.rightOffset = 4;      // bars of empty space on the right (LWC default ~4-5)

    // Price scales
    this.priceScale = new PriceScale({
      scaleMargins: {top: 0.15, bottom: 0.15},
      base: this.symbol.priceScale
    });
    this.priceScale.setFormatter(new PriceFormatter(this.symbol.priceScale, 1));

    this.volScale = new PriceScale({
      scaleMargins: {top: 0.0, bottom: 0.0},
      base: 100
    });

    this.paneScale = null;     // for RSI/MACD — set when needed

    // Time tick marks
    this.timeTickMarks = new TimeTickMarks();
    this._timePointsCache = null;

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

    // Indicators
    this.activeIndicators = new Set(['ma20', 'ma50', 'volsma']);
    this.indCache = {};

    // UI
    this.buttons = [];
    this.hoverButton = null;
    this.dropdown = null;
    this.toast = null;

    // Animation
    this.tickInterval = 1000;
    this.lastTickAt = 0;

    this.setupHiDPICanvas();
    this.setupEvents();
    this.updateLayout();
    this.computeTimeWeights();
    this.computeIndicators();
    this.autoScale();
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
      this.invalidateTimeMarks();
    };
    resize();
    window.addEventListener('resize', resize);
  }

  updateLayout() {
    const paneTop = this.layout.toolbarH;
    const bottomStart = this.H - this.layout.statusH - this.layout.timeAxisH;
    const hasPane = this.activeIndicators.has('rsi') || this.activeIndicators.has('macd');
    this.layout.paneH = hasPane ? 100 : 0;

    this.chartLeft = this.layout.leftPad;
    this.chartRight = this.W - this.layout.priceAxisW;
    this.chartTop = paneTop + 4;
    this.chartBottom = bottomStart - this.layout.paneH - (this.layout.paneH > 0 ? this.layout.gap : 0);

    this.volTop = this.chartBottom - this.layout.volumeH;
    this.volBottom = this.chartBottom - 4;
    this.priceTop = this.chartTop;
    this.priceBottom = this.volTop - 4;

    if (hasPane) {
      this.paneLeft = this.chartLeft;
      this.paneRight = this.chartRight;
      this.paneTop = bottomStart - this.layout.paneH;
      this.paneBottom = bottomStart;
    }

    // Update scale heights
    this.priceScale.setHeight(this.priceBottom - this.priceTop);
    this.volScale.setHeight(this.volBottom - this.volTop);
  }

  /* --------------------------- Events ------------------------------------ */
  setupEvents() {
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.onMouseLeave());
    this.canvas.addEventListener('mouseenter', () => this.mouseInside = true);
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
    this.hoverButton = this.hitButton(x, y);

    if (this.isDragging && this.activeTool === 'cursor') {
      const dx = x - this.dragStartX;
      const barsMoved = dx / this.barSpacing;
      this.rightOffset = this.dragStartRightOffset - barsMoved;
      this.constrainRightOffset();
      this.autoScale();
    } else if (this.currentDrawing) {
      this.updateCurrentDrawing(x, y);
    }

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
    if (this.activeTool === 'cursor') {
      if (this.inChartArea(x, y)) {
        this.isDragging = true;
        this.dragStartX = x;
        this.dragStartRightOffset = this.rightOffset;
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

  onMouseUp() {
    if (this.isDragging) this.isDragging = false;
    if (this.currentDrawing) this.finishDrawing();
  }

  onMouseLeave() {
    this.mouseInside = false;
    this.crosshairIndex = null;
    this.hoverButton = null;
    if (this.currentDrawing) this.finishDrawing();
  }

  onWheel(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    if (!this.inChartArea(x, this.mouseY) && !this.inPriceAxis(x, this.mouseY)) return;
    const dir = e.deltaY < 0 ? 1 : -1;
    const factor = dir > 0 ? 1.1 : 1/1.1;
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
    // (N-1 - idx + rightOffset_old) * oldSpacing = distFromRightOld
    // => (N-1 - idx + rightOffset_new) * newSpacing = distFromRightOld
    // => rightOffset_new = distFromRightOld / newSpacing - (N-1 - idx)
    this.barSpacing = newSpacing;
    this.rightOffset = distFromRightOld / newSpacing - (N - 1 - idx);
    this.constrainRightOffset();
    this.invalidateTimeMarks();
    this.autoScale();
  }

  onRightClick(e) {
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
    if (e.key === 'r' || e.key === 'R') { this.resetView(); }
    if (e.key === '+' || e.key === '=') this.zoomAtCenter(1.1);
    if (e.key === '-' || e.key === '_') this.zoomAtCenter(1/1.1);
    if (e.key === 'Escape') { this.activeTool = 'cursor'; this.currentDrawing = null; this.dropdown = null; }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.hoverDrawing) {
        this.drawings = this.drawings.filter(d => d !== this.hoverDrawing);
        this.hoverDrawing = null;
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
    this.showToast('Reset view');
  }

  // Constrain rightOffset so the chart cannot be scrolled too far away from data.
  // - Maximum rightOffset: allows up to ~50% of visible width as empty space on right
  // - Minimum rightOffset: keeps at least ~50% of visible width showing actual data
  constrainRightOffset() {
    const visibleBars = (this.chartRight - this.chartLeft) / this.barSpacing;
    const N = this.sim.candles.length;
    // Don't allow scrolling more than half the visible width past the last candle
    const maxRight = visibleBars * 0.5;
    // Don't allow scrolling more than (N + half visible) past — prevents leaving chart blank
    const minRight = -(N - 1) - visibleBars * 0.5 + (N - 1); // = -visibleBars * 0.5
    // Actually: we need at least the last candle visible-ish OR first candle visible
    // Simpler: ensure the rightmost visible index is at least 0 (some data on screen)
    // idx_at_chartRight = N - 1 + rightOffset
    // require: idx_at_chartLeft >= -visibleBars * 0.5  (allow some empty space on left)
    //          idx_at_chartRight <= N - 1 + visibleBars * 0.5  (allow some empty on right)
    const idxAtRight = (N - 1) + this.rightOffset;
    const idxAtLeft = idxAtRight - visibleBars;
    const minIdxLeft = -visibleBars * 0.3;
    const maxIdxRight = (N - 1) + visibleBars * 0.3;
    if (idxAtLeft < minIdxLeft) {
      this.rightOffset = minIdxLeft + visibleBars - (N - 1);
    }
    if (idxAtRight > maxIdxRight) {
      this.rightOffset = maxIdxRight - (N - 1);
    }
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
  computeTimeWeights() {
    // Build time points with weights for time tick mark builder
    const pts = [];
    const candles = this.sim.candles;
    for (let i = 0; i < candles.length; i++) {
      const prev = i > 0 ? candles[i - 1].time : null;
      const w = assignTimeWeight(prev, candles[i].time);
      pts.push({time: candles[i].time, weight: w});
    }
    this._timePoints = pts;
    this.timeTickMarks.setPoints(pts);
    this.invalidateTimeMarks();
  }
  invalidateTimeMarks() { this._timeMarksCache = null; }

  getTimeMarks() {
    // LWC: maxLabelWidth = pixelsPerCharacter * tickMarkMaxCharacterLength
    // pixelsPer8Characters = (fontSize + 4) * 5
    // pixelsPerCharacter = pixelsPer8Characters / defaultTickMarkMaxCharacterLength (8)
    // => maxLabelWidth = (fontSize + 4) * 5  (since both numerator/denominator use 8)
    const fontSize = 11;
    const maxLabelWidth = (fontSize + 4) * 5; // = 75 for fontSize=11
    if (!this._timeMarksCache) {
      this._timeMarksCache = this.timeTickMarks.build(this.barSpacing, maxLabelWidth);
    }
    return this._timeMarksCache;
  }

  /* --------------------------- Auto Scale -------------------------------- */
  autoScale() {
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
    if (this.activeIndicators.has('bb') && this.indCache.bb) {
      const bb = this.indCache.bb;
      for (let i = firstIdx; i <= lastIdx; i++) {
        if (bb.upper[i] !== null) {
          if (bb.upper[i] > max) max = bb.upper[i];
          if (bb.lower[i] < min) min = bb.lower[i];
        }
      }
    }
    for (const d of this.drawings) {
      if (d.type === 'hline') {
        if (d.price < min) min = d.price;
        if (d.price > max) max = d.price;
      }
    }
    if (!isFinite(min) || !isFinite(max) || min === max) {
      min = (min || 0) - 1; max = (max || 1) + 1;
    }
    this.priceScale.setRange(min, max);
    this.priceScale.rebuildMarks();

    // Volume scale (0 to maxVol)
    if (isFinite(maxVol)) {
      this.volScale.setRange(0, maxVol * 1.1);
      this.volScale.rebuildMarks();
    }

    // Pane scale (RSI: 0-100, MACD: auto)
    if (this.activeIndicators.has('rsi')) {
      this.paneScale = new PriceScale({scaleMargins: {top: 0.1, bottom: 0.1}, base: 100});
      this.paneScale.setHeight(this.paneBottom - this.paneTop);
      this.paneScale.setRange(0, 100);
      this.paneScale.setFormatter(new PriceFormatter(100, 1));
      this.paneScale.rebuildMarks();
    } else if (this.activeIndicators.has('macd')) {
      // Auto-scale MACD
      const macd = this.indCache.macd;
      if (macd) {
        let mMin = Infinity, mMax = -Infinity;
        for (let i = firstIdx; i <= lastIdx; i++) {
          if (macd.macd[i] !== null) {
            mMin = Math.min(mMin, macd.macd[i], macd.signal[i], macd.hist[i]);
            mMax = Math.max(mMax, macd.macd[i], macd.signal[i], macd.hist[i]);
          }
        }
        if (!isFinite(mMin)) { mMin = -1; mMax = 1; }
        const pad = (mMax - mMin) * 0.1;
        this.paneScale = new PriceScale({scaleMargins: {top: 0.1, bottom: 0.1}, base: 1000});
        this.paneScale.setHeight(this.paneBottom - this.paneTop);
        this.paneScale.setRange(mMin - pad, mMax + pad);
        this.paneScale.setFormatter(new PriceFormatter(1000, 1));
        this.paneScale.rebuildMarks();
      }
    }
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
    if (tool === 'hline') {
      this.drawings.push({type:'hline', price, color: THEME.drawing, id: Date.now()});
      this.activeTool = 'cursor';
      this.showToast('Horizontal line added');
      this.autoScale();
      return;
    }
    if (tool === 'vline') {
      this.drawings.push({type:'vline', index: idx, color: THEME.drawing, id: Date.now()});
      this.activeTool = 'cursor';
      this.showToast('Vertical line added');
      return;
    }
    this.currentDrawing = {
      type: tool, i1: idx, p1: price, i2: idx, p2: price,
      color: THEME.drawingActive, id: Date.now(),
      points: tool === 'brush' ? [{i: idx, p: price, x, y}] : null
    };
  }
  updateCurrentDrawing(x, y) {
    if (!this.currentDrawing) return;
    const idx = this.xToIndex(x);
    const price = this.yToPrice(y);
    if (this.currentDrawing.type === 'brush') {
      this.currentDrawing.points.push({i: idx, p: price, x, y});
    } else {
      this.currentDrawing.i2 = idx;
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
      case 'symbol': this.openDropdown('symbol', SYMBOLS.map(s => ({label: s.label, value: s.label})), btn); break;
      case 'timeframe': this.openDropdown('timeframe', TIMEFRAMES.map(t => ({label: t.label, value: t.label})), btn); break;
      case 'indicator': this.openDropdown('indicator', INDICATOR_LIST.map(i => ({label: i.label, value: i.id, checked: this.activeIndicators.has(i.id)})), btn); break;
      case 'tool': this.openDropdown('tool', DRAW_TOOLS.map(t => ({label: t.label, value: t.id})), btn); break;
      case 'reset': this.resetView(); break;
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
    if (this.dropdown.type === 'symbol') {
      const sym = SYMBOLS.find(s => s.label === item.value);
      if (sym) {
        this.symbol = sym;
        this.sim = new DataSimulator(sym, this.timeframe);
        this.priceScale = new PriceScale({scaleMargins:{top:0.15,bottom:0.15}, base: sym.priceScale});
        this.priceScale.setFormatter(new PriceFormatter(sym.priceScale, 1));
        this.priceScale.setHeight(this.priceBottom - this.priceTop);
        this.volScale.setHeight(this.volBottom - this.volTop);
        this.drawings = [];
        this.computeTimeWeights();
        this.computeIndicators();
        this.resetView();
        this.showToast('Loaded ' + sym.label);
      }
    } else if (this.dropdown.type === 'timeframe') {
      const tf = TIMEFRAMES.find(t => t.label === item.value);
      if (tf) {
        this.timeframe = tf;
        this.sim = new DataSimulator(this.symbol, tf);
        this.drawings = [];
        this.computeTimeWeights();
        this.computeIndicators();
        this.resetView();
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
  }
  showToast(text) { this.toast = {text, until: performance.now() + 2200}; }

  /* --------------------------- MAIN RENDER LOOP -------------------------- */
  render(now) {
    if (!now) now = performance.now();
    if (now - this.lastTickAt > this.tickInterval) {
      this.sim.tick();
      this.lastTickAt = now;
      this.computeTimeWeights();
      this.computeIndicators();
      // Do NOT auto-follow price. User controls the view via pan/zoom only.
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
    if (!this.isDragging && this.activeTool === 'eraser') {
      this.hoverDrawing = this.findDrawingAt(this.mouseX, this.mouseY);
    } else this.hoverDrawing = null;
  }

  /* --------------------------- Background -------------------------------- */
  drawBackground() {
    const ctx = this.ctx;
    ctx.fillStyle = THEME.bg;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.fillStyle = THEME.toolbarBg;
    ctx.fillRect(0, 0, this.W, this.layout.toolbarH);
    ctx.fillRect(0, this.H - this.layout.statusH, this.W, this.layout.statusH);
    ctx.strokeStyle = THEME.toolbarBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, this.layout.toolbarH + 0.5);
    ctx.lineTo(this.W, this.layout.toolbarH + 0.5);
    ctx.moveTo(0, this.H - this.layout.statusH - 0.5);
    ctx.lineTo(this.W, this.H - this.layout.statusH - 0.5);
    ctx.stroke();
  }

  /* --------------------------- Grid (price marks) ------------------------ */
  drawGrid() {
    const ctx = this.ctx;
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    // Use price tick marks for horizontal grid lines
    const marks = this.priceScale.marks();
    for (const m of marks) {
      const y = this.priceTop + m.coord;
      if (y < this.priceTop - 1 || y > this.priceBottom + 1) continue;
      ctx.beginPath();
      ctx.moveTo(this.chartLeft, Math.floor(y) + 0.5);
      ctx.lineTo(this.chartRight, Math.floor(y) + 0.5);
      ctx.stroke();
    }
    // Time tick marks for vertical grid lines
    const timeMarks = this.getTimeMarks();
    for (const m of timeMarks) {
      if (m.index < 0 || m.index >= this.sim.candles.length) continue;
      const x = this.indexToX(m.index);
      if (x < this.chartLeft || x > this.chartRight) continue;
      ctx.beginPath();
      ctx.moveTo(Math.floor(x) + 0.5, this.chartTop);
      ctx.lineTo(Math.floor(x) + 0.5, this.chartBottom);
      ctx.stroke();
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

    // Clip to price chart area so candles never overflow into toolbar/volume/axis
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.chartLeft, this.priceTop, this.chartRight - this.chartLeft, this.priceBottom - this.priceTop);
    ctx.clip();

    for (let i = firstIdx; i <= lastIdx; i++) {
      const c = candles[i];
      const x = this.indexToX(i);
      if (x < this.chartLeft - bodyWidth || x > this.chartRight + bodyWidth) continue;
      const isBull = c.close >= c.open;
      const color = isBull ? THEME.bull : THEME.bear;
      const yOpen = this.priceToY(c.open);
      const yClose = this.priceToY(c.close);
      const yHigh = this.priceToY(c.high);
      const yLow = this.priceToY(c.low);

      // Snap center to integer bitmap pixel for crisp wick
      const wickXBmp = Math.round(x * dpr);
      const wickX = wickXBmp / dpr;
      const wickLeft = wickX - wickWidth / 2;

      // Draw wick as a filled rectangle (LWC-style) for pixel-perfect crispness
      ctx.fillStyle = color;
      const wickTop = Math.floor(yHigh * dpr) / dpr;
      const wickBottom = Math.ceil(yLow * dpr) / dpr;
      const wickH = Math.max(1 / dpr, wickBottom - wickTop);
      ctx.fillRect(wickLeft, wickTop, wickWidth, wickH);

      // Body — pixel-perfect rectangle
      const bodyLeftBmp = wickXBmp - Math.floor(bodyWidthBmp / 2);
      const bodyLeft = bodyLeftBmp / dpr;
      const bodyTop = Math.round(Math.min(yOpen, yClose) * dpr) / dpr;
      const bodyBottom = Math.round(Math.max(yOpen, yClose) * dpr) / dpr;
      const bodyH = Math.max(1 / dpr, bodyBottom - bodyTop);
      ctx.fillRect(bodyLeft, bodyTop, bodyWidth, bodyH);
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

    // Clip to volume area
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.chartLeft, this.volTop, this.chartRight - this.chartLeft, this.volBottom - this.volTop);
    ctx.clip();

    // Use LWC-style column width (slightly less than barSpacing)
    const bodyWidthBmp = optimalCandlestickWidth(this.barSpacing, this.dpr);
    const bodyWidth = bodyWidthBmp / this.dpr;

    for (let i = firstIdx; i <= lastIdx; i++) {
      const c = candles[i];
      const x = this.indexToX(i);
      if (x < this.chartLeft - bodyWidth || x > this.chartRight + bodyWidth) continue;
      const isBull = c.close >= c.open;
      const yTop = this.volToY(c.volume);
      const yBot = this.volBottom;
      ctx.fillStyle = isBull ? THEME.bullVol : THEME.bearVol;
      const left = Math.round((x - bodyWidth / 2) * this.dpr) / this.dpr;
      const top = Math.round(yTop * this.dpr) / this.dpr;
      const h = Math.max(1 / this.dpr, yBot - yTop);
      ctx.fillRect(left, top, bodyWidth, h);
    }

    // Vol SMA
    if (this.activeIndicators.has('volsma') && this.indCache.volsma) {
      const sma = this.indCache.volsma;
      ctx.strokeStyle = THEME.ma2;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      let started = false;
      for (let i = firstIdx; i <= lastIdx; i++) {
        if (sma[i] === null) { started = false; continue; }
        const x = this.indexToX(i);
        const y = this.volToY(sma[i]);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Vol label (drawn after restore so not clipped)
    ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = THEME.textDim;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const lastVol = candles[Math.min(candles.length - 1, lastIdx)].volume;
    ctx.fillText('Vol ' + this._fmtVol(lastVol), this.chartLeft + 6, this.volTop + 2);
  }
  _fmtVol(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return n.toFixed(0);
  }

  /* --------------------------- Indicators -------------------------------- */
  drawIndicators() {
    const ctx = this.ctx;
    const firstIdx = Math.max(0, Math.floor(this.xToIndex(this.chartLeft)));
    const lastIdx = Math.min(this.sim.candles.length - 1, Math.ceil(this.xToIndex(this.chartRight)));

    // Clip to price chart area so indicator lines stay inside the chart
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.chartLeft, this.priceTop, this.chartRight - this.chartLeft, this.priceBottom - this.priceTop);
    ctx.clip();

    const drawLine = (arr, color, lw = 1.4) => {
      if (!arr) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      let started = false;
      for (let i = firstIdx; i <= lastIdx; i++) {
        if (arr[i] === null) { started = false; continue; }
        const x = this.indexToX(i);
        const y = this.priceToY(arr[i]);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
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
      ctx.fillStyle = THEME.bollingerBand;
      ctx.beginPath();
      let started = false;
      for (let i = firstIdx; i <= lastIdx; i++) {
        if (bb.upper[i] === null) { started = false; continue; }
        const x = this.indexToX(i);
        const y = this.priceToY(bb.upper[i]);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      for (let i = lastIdx; i >= firstIdx; i--) {
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
    ctx.restore();
  }

  /* --------------------------- Pane (RSI/MACD) --------------------------- */
  drawPane() {
    if (this.layout.paneH === 0 || !this.paneScale) return;
    const ctx = this.ctx;
    const top = this.paneTop, bot = this.paneBottom, left = this.paneLeft, right = this.paneRight;
    const firstIdx = Math.max(0, Math.floor(this.xToIndex(this.chartLeft)));
    const lastIdx = Math.min(this.sim.candles.length - 1, Math.ceil(this.xToIndex(this.chartRight)));

    // Grid (use pane scale marks) — drawn without clip so grid extends full width
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    const pmarks = this.paneScale.marks();
    for (const m of pmarks) {
      const y = top + m.coord;
      if (y < top - 1 || y > bot + 1) continue;
      ctx.beginPath();
      ctx.moveTo(left, Math.floor(y) + 0.5);
      ctx.lineTo(right, Math.floor(y) + 0.5);
      ctx.stroke();
    }

    // Clip to pane area for indicator drawings (lines/histograms)
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bot - top);
    ctx.clip();

    if (this.activeIndicators.has('rsi') && this.indCache.rsi) {
      const rsi = this.indCache.rsi;
      // 30/70 dashed lines
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      const y70 = top + this.paneScale.logicalToCoordinate(70, 0);
      const y30 = top + this.paneScale.logicalToCoordinate(30, 0);
      ctx.strokeStyle = THEME.rsiOver;
      ctx.beginPath(); ctx.moveTo(left, Math.floor(y70) + 0.5); ctx.lineTo(right, Math.floor(y70) + 0.5); ctx.stroke();
      ctx.strokeStyle = THEME.rsiUnder;
      ctx.beginPath(); ctx.moveTo(left, Math.floor(y30) + 0.5); ctx.lineTo(right, Math.floor(y30) + 0.5); ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = THEME.rsi;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let i = firstIdx; i <= lastIdx; i++) {
        if (rsi[i] === null) { started = false; continue; }
        const x = this.indexToX(i);
        const y = top + this.paneScale.logicalToCoordinate(rsi[i], 0);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (this.activeIndicators.has('macd') && this.indCache.macd) {
      const macd = this.indCache.macd;
      const midY = (top + bot) / 2;
      // Zero line
      ctx.strokeStyle = THEME.gridStrong;
      ctx.beginPath();
      ctx.moveTo(left, Math.floor(midY) + 0.5);
      ctx.lineTo(right, Math.floor(midY) + 0.5);
      ctx.stroke();

      // Histogram (use LWC-style column width)
      const bodyWidthBmp = optimalCandlestickWidth(this.barSpacing, this.dpr);
      const bodyWidth = bodyWidthBmp / this.dpr;
      for (let i = firstIdx; i <= lastIdx; i++) {
        if (macd.hist[i] === null) continue;
        const x = this.indexToX(i);
        const y = top + this.paneScale.logicalToCoordinate(macd.hist[i], 0);
        const h = Math.abs(y - midY);
        ctx.fillStyle = macd.hist[i] >= 0 ? THEME.macdHistBull : THEME.macdHistBear;
        const left2 = Math.round((x - bodyWidth / 2) * this.dpr) / this.dpr;
        if (macd.hist[i] >= 0) ctx.fillRect(left2, Math.floor(y), bodyWidth, Math.ceil(h));
        else ctx.fillRect(left2, Math.floor(midY), bodyWidth, Math.ceil(h));
      }

      // MACD and signal lines
      const drawML = (arr, color) => {
        ctx.strokeStyle = color; ctx.lineWidth = 1.4;
        ctx.beginPath();
        let started = false;
        for (let i = firstIdx; i <= lastIdx; i++) {
          if (arr[i] === null) { started = false; continue; }
          const x = this.indexToX(i);
          const y = top + this.paneScale.logicalToCoordinate(arr[i], 0);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      };
      drawML(macd.macd, THEME.macd);
      drawML(macd.signal, THEME.macdSignal);
    }
    ctx.restore();

    // Labels (drawn after restore so not clipped)
    ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'top';
    if (this.activeIndicators.has('rsi') && this.indCache.rsi) {
      const rsi = this.indCache.rsi;
      const last = rsi[rsi.length - 1];
      ctx.fillStyle = THEME.rsi;
      ctx.textAlign = 'left';
      ctx.fillText('RSI 14: ' + (last !== null ? last.toFixed(2) : '—'), left + 6, top + 4);
      ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
      for (const m of pmarks) ctx.fillText(m.label, right + 4, top + m.coord - 5);
    } else if (this.activeIndicators.has('macd') && this.indCache.macd) {
      const macd = this.indCache.macd;
      const lm = macd.macd[macd.macd.length - 1];
      ctx.fillStyle = THEME.macd;
      ctx.textAlign = 'left';
      ctx.fillText('MACD 12,26,9: ' + (lm !== null ? lm.toFixed(3) : '—'), left + 6, top + 4);
      ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
      for (const m of pmarks) ctx.fillText(m.label, right + 4, top + m.coord - 5);
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

      // For drawings that stay inside the chart area, apply clip.
      // hline and fib draw labels on the price axis, so they need special handling.
      const needsClip = d.type !== 'hline' && d.type !== 'fib';
      if (needsClip) {
        ctx.save();
        ctx.beginPath();
        // Clip to entire chart vertical range (price + volume + pane if present)
        const clipTop = this.chartTop;
        const clipBottom = this.layout.paneBottom || this.chartBottom;
        ctx.rect(this.chartLeft, clipTop, this.chartRight - this.chartLeft, clipBottom - clipTop);
        ctx.clip();
      }

      switch (d.type) {
        case 'trend': {
          const x1 = this.indexToX(d.i1);
          const x2 = this.indexToX(d.i2);
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
        case 'hline': {
          const y = this.priceToY(d.price);
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(this.chartLeft, Math.floor(y) + 0.5);
          ctx.lineTo(this.chartRight, Math.floor(y) + 0.5);
          ctx.stroke();
          ctx.setLineDash([]);
          const txt = this.priceScale.formatLogical(d.price);
          ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
          const tw = ctx.measureText(txt).width + 8;
          ctx.fillStyle = color;
          ctx.fillRect(this.chartRight + 1, Math.floor(y) - 7, tw, 14);
          ctx.fillStyle = THEME.bg;
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(txt, this.chartRight + 5, Math.floor(y));
          break;
        }
        case 'vline': {
          const x = this.indexToX(d.index);
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(Math.floor(x) + 0.5, this.chartTop);
          ctx.lineTo(Math.floor(x) + 0.5, this.layout.paneBottom || this.chartBottom);
          ctx.stroke();
          ctx.setLineDash([]);
          break;
        }
        case 'rect': {
          const x1 = this.indexToX(d.i1);
          const x2 = this.indexToX(d.i2);
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
          const x1 = this.indexToX(d.i1);
          const x2 = this.indexToX(d.i2);
          const y1 = this.priceToY(d.p1);
          const y2 = this.priceToY(d.p2);
          const xL = Math.min(x1, x2), xR = Math.max(x1, x2);
          const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
          const colors = ['#787b86','#ef5350','#ff9800','#26a69a','#2962ff','#9c27b0','#ef5350','#26a69a'];
          ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
          ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
          for (let i = 0; i < levels.length; i++) {
            const y = y1 + (y2 - y1) * levels[i];
            ctx.strokeStyle = colors[i]; ctx.lineWidth = 1;
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(xL, Math.floor(y) + 0.5);
            ctx.lineTo(xR, Math.floor(y) + 0.5);
            ctx.stroke();
            ctx.setLineDash([]);
            const p = d.p1 + (d.p2 - d.p1) * levels[i];
            const txt = (levels[i] * 100).toFixed(1) + '% ' + this.priceScale.formatLogical(p);
            const tw = ctx.measureText(txt).width + 6;
            ctx.fillStyle = colors[i];
            ctx.fillRect(xR + 1, Math.floor(y) - 7, tw, 14);
            ctx.fillStyle = THEME.bg;
            ctx.fillText(txt, xR + 4, Math.floor(y));
          }
          break;
        }
        case 'brush': {
          if (!d.points || d.points.length === 0) break;
          ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let i = 0; i < d.points.length; i++) {
            const p = d.points[i];
            const x = this.indexToX(p.i);
            const y = this.priceToY(p.p);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          ctx.stroke();
          break;
        }
      }
      if (needsClip) ctx.restore();
    };
    for (const d of this.drawings) drawOne(d);
    if (this.currentDrawing) drawOne(this.currentDrawing, true);
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
      case 'trend': {
        const x1 = this.indexToX(d.i1), x2 = this.indexToX(d.i2);
        const y1 = this.priceToY(d.p1), y2 = this.priceToY(d.p2);
        return this._distToSeg(x, y, x1, y1, x2, y2) < tol;
      }
      case 'hline': {
        const yy = this.priceToY(d.price);
        return Math.abs(y - yy) < tol && x >= this.chartLeft && x <= this.chartRight;
      }
      case 'vline': {
        const xx = this.indexToX(d.index);
        return Math.abs(x - xx) < tol && y >= this.chartTop && y <= this.chartBottom;
      }
      case 'rect': {
        const x1 = this.indexToX(d.i1), x2 = this.indexToX(d.i2);
        const y1 = this.priceToY(d.p1), y2 = this.priceToY(d.p2);
        const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
        const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
        return (Math.abs(y - ry) < tol || Math.abs(y - (ry + rh)) < tol) && x >= rx && x <= rx + rw
            || (Math.abs(x - rx) < tol || Math.abs(x - (rx + rw)) < tol) && y >= ry && y <= ry + rh;
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
    const isBull = last.close >= last.open;
    const color = isBull ? THEME.currentPriceBull : THEME.currentPriceBear;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(this.chartLeft, Math.floor(y) + 0.5);
    ctx.lineTo(this.chartRight, Math.floor(y) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    const txt = this.priceScale.formatLogical(last.close);
    ctx.font = 'bold 11px -apple-system, Segoe UI, Roboto, sans-serif';
    const tw = ctx.measureText(txt).width + 10;
    ctx.fillStyle = color;
    ctx.fillRect(this.chartRight + 1, Math.floor(y) - 9, tw, 18);
    ctx.fillStyle = THEME.textBright;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, this.chartRight + 1 + tw / 2, Math.floor(y));
  }

  /* --------------------------- Price Axis -------------------------------- */
  drawPriceAxis() {
    const ctx = this.ctx;
    // Fill the entire right column (price axis + corner with time axis) with panelBg
    // so there's no empty gap at the bottom-right corner.
    const axisTop = this.chartTop;
    const axisBottom = (this.layout.paneBottom || this.chartBottom) + this.layout.timeAxisH;
    ctx.fillStyle = THEME.panelBg;
    ctx.fillRect(this.chartRight + 1, axisTop, this.W - this.chartRight - 1, axisBottom - axisTop);
    ctx.strokeStyle = THEME.toolbarBorder;
    ctx.beginPath();
    ctx.moveTo(this.chartRight + 0.5, this.chartTop);
    ctx.lineTo(this.chartRight + 0.5, this.chartBottom);
    ctx.stroke();

    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = THEME.textDim;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const marks = this.priceScale.marks();
    for (const m of marks) {
      const y = this.priceTop + m.coord;
      if (y < this.priceTop - 1 || y > this.priceBottom + 1) continue;
      ctx.fillText(m.label, this.chartRight + 6, Math.floor(y));
    }
  }

  /* --------------------------- Time Axis --------------------------------- */
  drawTimeAxis() {
    const ctx = this.ctx;
    const axisTop = this.layout.paneBottom || this.chartBottom;
    ctx.fillStyle = THEME.panelBg;
    ctx.fillRect(0, axisTop, this.chartRight + 1, this.layout.timeAxisH);
    ctx.strokeStyle = THEME.toolbarBorder;
    ctx.beginPath();
    ctx.moveTo(0, axisTop + 0.5);
    ctx.lineTo(this.chartRight, axisTop + 0.5);
    ctx.stroke();

    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = THEME.textDim;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const marks = this.getTimeMarks();
    // LWC-style collision detection: skip labels that would overlap previous one.
    // Use estimated label width + small gap.
    let prevRightEdge = -Infinity;
    for (const m of marks) {
      if (m.index < 0 || m.index >= this.sim.candles.length) continue;
      const x = this.indexToX(m.index);
      if (x < this.chartLeft || x > this.chartRight) continue;
      const label = formatTickMark(this.sim.candles[m.index].time, m.weight, this.timeframe.label);
      // Approximate width: each char ~6px at 11px font
      const labelW = label.length * 6 + 8;
      const leftEdge = x - labelW / 2;
      const rightEdge = x + labelW / 2;
      // Skip if would overlap previous label or go off-chart
      if (leftEdge < prevRightEdge + 4) continue;
      if (leftEdge < this.chartLeft + 4 || rightEdge > this.chartRight - 4) continue;
      ctx.fillText(label, Math.floor(x), axisTop + this.layout.timeAxisH / 2);
      prevRightEdge = rightEdge;
    }
  }

  /* --------------------------- Crosshair --------------------------------- */
  drawCrosshair() {
    if (!this.mouseInside || this.crosshairIndex === null) return;
    if (this.activeTool !== 'cursor') return;
    if (!this.inChartArea(this.mouseX, this.mouseY) &&
        !this.inPriceAxis(this.mouseX, this.mouseY)) return;
    const ctx = this.ctx;
    const idx = Math.round(this.crosshairIndex);
    if (idx < 0 || idx >= this.sim.candles.length) return;
    const x = this.indexToX(idx);
    const y = this.mouseY;

    ctx.strokeStyle = THEME.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    if (this.mouseY < (this.layout.paneBottom || this.chartBottom)) {
      ctx.beginPath();
      ctx.moveTo(Math.floor(x) + 0.5, this.chartTop);
      ctx.lineTo(Math.floor(x) + 0.5, this.layout.paneBottom || this.chartBottom);
      ctx.stroke();
    }
    if (this.mouseX < this.chartRight) {
      ctx.beginPath();
      ctx.moveTo(this.chartLeft, Math.floor(y) + 0.5);
      ctx.lineTo(this.chartRight, Math.floor(y) + 0.5);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Time label on axis
    const t = this.sim.candles[idx].time;
    const date = new Date(t * 1000);
    const pad2 = (n) => n < 10 ? '0' + n : '' + n;
    let timeStr;
    if (this.timeframe.label === '1D' || this.timeframe.label === '1W') {
      timeStr = date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
    } else if (this.timeframe.label === '1S') {
      timeStr = pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes()) + ':' + pad2(date.getUTCSeconds());
    } else {
      timeStr = pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate()) + ' ' + pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes());
    }
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    const tw = ctx.measureText(timeStr).width + 14;
    ctx.fillStyle = THEME.crosshairLabel;
    ctx.fillRect(x - tw / 2, (this.layout.paneBottom || this.chartBottom) + 2, tw, this.layout.timeAxisH - 4);
    ctx.fillStyle = THEME.textBright;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, x, (this.layout.paneBottom || this.chartBottom) + this.layout.timeAxisH / 2);

    // Price label on axis
    if (this.mouseX < this.chartRight && this.mouseY >= this.chartTop && this.mouseY <= this.chartBottom) {
      const price = this.yToPrice(y);
      const priceStr = this.priceScale.formatLogical(price);
      const pw = ctx.measureText(priceStr).width + 14;
      ctx.fillStyle = THEME.crosshairLabel;
      ctx.fillRect(this.chartRight + 1, Math.floor(y) - 9, pw, 18);
      ctx.fillStyle = THEME.textBright;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(priceStr, this.chartRight + 1 + pw / 2, Math.floor(y));
    }
  }

  /* --------------------------- Legend ------------------------------------ */
  drawLegend() {
    const ctx = this.ctx;
    const idx = this.crosshairIndex !== null ?
      clamp(Math.round(this.crosshairIndex), 0, this.sim.candles.length - 1) :
      this.sim.candles.length - 1;
    const c = this.sim.candles[idx];
    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    let x = this.chartLeft + 6;
    const y = this.chartTop + 6;
    ctx.fillStyle = THEME.textBright;
    ctx.font = 'bold 12px -apple-system, Segoe UI, Roboto, sans-serif';
    const symTxt = this.symbol.label + ' · ' + this.timeframe.label;
    ctx.fillText(symTxt, x, y);
    x += ctx.measureText(symTxt).width + 12;
    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    const isBull = c.close >= c.open;
    const parts = [
      {label:'O', value: this.priceScale.formatLogical(c.open)},
      {label:'H', value: this.priceScale.formatLogical(c.high)},
      {label:'L', value: this.priceScale.formatLogical(c.low)},
      {label:'C', value: this.priceScale.formatLogical(c.close)},
      {label:'Vol', value: this._fmtVol(c.volume)}
    ];
    for (const p of parts) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(p.label, x, y);
      x += ctx.measureText(p.label).width + 4;
      ctx.fillStyle = isBull ? THEME.bull : THEME.bear;
      ctx.fillText(p.value, x, y);
      x += ctx.measureText(p.value).width + 12;
    }
    const change = c.close - c.open;
    const changePct = (change / c.open) * 100;
    const changeTxt = (change >= 0 ? '+' : '') + this.priceScale.formatLogical(Math.abs(change)) +
                      ' (' + (change >= 0 ? '+' : '') + changePct.toFixed(2) + '%)';
    ctx.fillStyle = isBull ? THEME.bull : THEME.bear;
    ctx.fillText(changeTxt, x, y);

    // Indicator values second line
    let x2 = this.chartLeft + 6, y2 = y + 18;
    const drawInd = (label, val, color) => {
      ctx.fillStyle = color;
      ctx.fillText(label, x2, y2);
      x2 += ctx.measureText(label).width + 4;
      ctx.fillStyle = THEME.text;
      ctx.fillText(val, x2, y2);
      x2 += ctx.measureText(val).width + 14;
    };
    if (this.activeIndicators.has('ma20') && this.indCache.ma20 && this.indCache.ma20[idx] !== null)
      drawInd('MA20:', this.priceScale.formatLogical(this.indCache.ma20[idx]), THEME.ma1);
    if (this.activeIndicators.has('ma50') && this.indCache.ma50 && this.indCache.ma50[idx] !== null)
      drawInd('MA50:', this.priceScale.formatLogical(this.indCache.ma50[idx]), THEME.ma2);
    if (this.activeIndicators.has('ma200') && this.indCache.ma200 && this.indCache.ma200[idx] !== null)
      drawInd('MA200:', this.priceScale.formatLogical(this.indCache.ma200[idx]), THEME.ma3);
    if (this.activeIndicators.has('ema20') && this.indCache.ema20 && this.indCache.ema20[idx] !== null)
      drawInd('EMA20:', this.priceScale.formatLogical(this.indCache.ema20[idx]), THEME.ma1);
    if (this.activeIndicators.has('ema50') && this.indCache.ema50 && this.indCache.ema50[idx] !== null)
      drawInd('EMA50:', this.priceScale.formatLogical(this.indCache.ema50[idx]), THEME.ma2);
    if (this.activeIndicators.has('bb') && this.indCache.bb && this.indCache.bb.mid[idx] !== null) {
      drawInd('BB(20,2):', this.priceScale.formatLogical(this.indCache.bb.mid[idx]), THEME.bollingerMid);
      drawInd('U:', this.priceScale.formatLogical(this.indCache.bb.upper[idx]), THEME.ma3);
      drawInd('L:', this.priceScale.formatLogical(this.indCache.bb.lower[idx]), THEME.ma3);
    }
  }

  /* --------------------------- Toolbar ----------------------------------- */
  drawToolbar() {
    const ctx = this.ctx;
    let x = 8, y = 7, h = 30;
    x = this.drawButton({id:'symbol', action:'symbol', x, y, w:100, h, label:this.symbol.label, icon:'caret'});
    x += 6;
    x = this.drawButton({id:'tf', action:'timeframe', x, y, w:50, h, label:this.timeframe.label, icon:'caret'});
    x += 6;
    x = this.drawButton({id:'ind', action:'indicator', x, y, w:110, h, label:'Indicators', icon:'plus'});
    x += 6;
    const toolLabel = DRAW_TOOLS.find(t => t.id === this.activeTool).label;
    x = this.drawButton({id:'tool', action:'tool', x, y, w:130, h, label:toolLabel, icon:'caret'});
    x += 6;
    x = this.drawButton({id:'reset', action:'reset', x, y, w:60, h, label:'Reset', icon:null});
    x += 6;
    x = this.drawButton({id:'settings', action:'settings', x, y, w:70, h, label:'Settings', icon:null});

    // Right side: LIVE + clock
    const rightX = this.W - 8;
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = THEME.bull;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.fillText('● LIVE', rightX, y + h / 2);
    const now = new Date();
    const pad2 = (n) => n < 10 ? '0' + n : '' + n;
    const timeTxt = pad2(now.getUTCHours()) + ':' + pad2(now.getUTCMinutes()) + ':' + pad2(now.getUTCSeconds()) + ' UTC';
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(timeTxt, rightX - 60, y + h / 2);
  }
  drawButton(btn) {
    const ctx = this.ctx;
    const isHover = this.hoverButton && this.hoverButton.id === btn.id;
    ctx.fillStyle = isHover ? THEME.buttonHover : THEME.buttonBg;
    this._roundRect(btn.x, btn.y, btn.w, btn.h, 4); ctx.fill();
    ctx.strokeStyle = THEME.toolbarBorder; ctx.lineWidth = 1;
    this._roundRect(btn.x + 0.5, btn.y + 0.5, btn.w - 1, btn.h - 1, 4); ctx.stroke();
    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = THEME.buttonText;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const cx = btn.x + btn.w / 2, cy = btn.y + btn.h / 2;
    const textW = ctx.measureText(btn.label).width;
    let labelX = cx;
    if (btn.icon === 'caret') labelX = cx - 6;
    if (btn.icon === 'plus') labelX = cx - 6;
    ctx.fillText(btn.label, labelX, cy);
    if (btn.icon === 'caret') {
      ctx.fillStyle = THEME.textDim;
      ctx.beginPath();
      ctx.moveTo(cx + textW / 2 + 4, cy - 3);
      ctx.lineTo(cx + textW / 2 + 9, cy);
      ctx.lineTo(cx + textW / 2 + 4, cy + 3);
      ctx.closePath(); ctx.fill();
    } else if (btn.icon === 'plus') {
      ctx.strokeStyle = THEME.textDim; ctx.lineWidth = 1.2;
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
    const y = this.H - this.layout.statusH;
    const last = this.sim.candles[this.sim.candles.length - 1];
    if (!last) return;
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let x = 10;
    const draw = (label, value, color) => {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(label, x, y + this.layout.statusH / 2);
      x += ctx.measureText(label).width + 4;
      ctx.fillStyle = color || THEME.text;
      ctx.fillText(value, x, y + this.layout.statusH / 2);
      x += ctx.measureText(value).width + 16;
    };
    draw('Bid', this.priceScale.formatLogical(last.close - 0.5), THEME.bear);
    draw('Ask', this.priceScale.formatLogical(last.close + 0.5), THEME.bull);
    draw('Spread', this.priceScale.formatLogical(0.5 * 2));
    const last24 = this.sim.candles.slice(-24);
    draw('24h High', this.priceScale.formatLogical(last24.reduce((m, c) => Math.max(m, c.high), 0)));
    draw('24h Low', this.priceScale.formatLogical(last24.reduce((m, c) => Math.min(m, c.low), Infinity)));
    draw('24h Vol', this._fmtVol(last24.reduce((s, c) => s + c.volume, 0)));
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
    ctx.fillStyle = THEME.panelBg;
    this._roundRect(d.x, d.y, d.w, d.h, 4); ctx.fill();
    ctx.strokeStyle = THEME.toolbarBorder; ctx.lineWidth = 1;
    this._roundRect(d.x + 0.5, d.y + 0.5, d.w - 1, d.h - 1, 4); ctx.stroke();
    ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const mouseItem = this.mouseInside ? this.hitDropdown(this.mouseX, this.mouseY) : null;
    for (const it of d.items) {
      if (it === mouseItem) {
        ctx.fillStyle = THEME.buttonHover;
        ctx.fillRect(d.x + 1, it.y, d.w - 2, it.h);
      }
      let xc = d.x + 12;
      if (it.checked !== undefined) {
        ctx.strokeStyle = it.checked ? THEME.accent : THEME.textDim;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(xc, it.y + it.h / 2 - 6, 12, 12);
        if (it.checked) {
          ctx.strokeStyle = THEME.accent;
          ctx.beginPath();
          ctx.moveTo(xc + 2, it.y + it.h / 2);
          ctx.lineTo(xc + 5, it.y + it.h / 2 + 3);
          ctx.lineTo(xc + 10, it.y + it.h / 2 - 3);
          ctx.stroke();
        }
        xc += 18;
      }
      ctx.fillStyle = it.checked ? THEME.textBright : THEME.text;
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
    ctx.fillStyle = THEME.textBright;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
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
  document.body.style.margin = '0';
  document.body.style.background = THEME.bg;
  document.body.style.overflow = 'hidden';
  document.body.style.fontFamily = '-apple-system, Segoe UI, Roboto, sans-serif';
  const canvas = document.getElementById('chart');
  canvas.style.display = 'block';
  canvas.style.cursor = 'crosshair';
  const chart = new TradingChart(canvas);
  chart.start();
  window.__chart = chart;
});

})();
