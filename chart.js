/* =============================================================================
 * BADI-CHARTS-V2 v1.0.0 — Pixel-Perfect Pure JavaScript Trading Chart Library
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

/* ============================ VERSION ====================================== */
const VERSION = '2.5.1';
const BADI_DEBUG = false; // Set to true to enable debug logging

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
  },
  // Volume Profile: builds histogram of volume by price level over visible range.
  // Returns {bins: [{priceLow, priceHigh, volume, isUp}], maxVol, vwap, pocPrice}
  volumeProfile(candles, firstIdx, lastIdx, numBins = 24) {
    if (firstIdx >= lastIdx || lastIdx <= 0) return null;
    let minP = Infinity, maxP = -Infinity;
    let totalVol = 0, totalPV = 0;
    for (let i = firstIdx; i <= lastIdx; i++) {
      const c = candles[i];
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
      const typical = (c.high + c.low + c.close) / 3;
      totalVol += c.volume;
      totalPV += typical * c.volume;
    }
    if (minP === Infinity || maxP === minP) return null;
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
      const cLow = c.low, cHigh = c.high;
      const cRange = cHigh - cLow || 1;
      const firstBin = Math.max(0, Math.floor((cLow - minP) / binSize));
      const lastBin = Math.min(numBins - 1, Math.floor((cHigh - minP) / binSize));
      const isUp = c.close >= c.open;
      for (let b = firstBin; b <= lastBin; b++) {
        const binLow = bins[b].priceLow;
        const binHigh = bins[b].priceHigh;
        const overlapLow = Math.max(cLow, binLow);
        const overlapHigh = Math.min(cHigh, binHigh);
        const overlap = Math.max(0, overlapHigh - overlapLow);
        const portion = overlap / cRange;
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
  }
  // v2.5.0+: Normalize + clone a candle object.
  // - Converts time to a number (and from ms to seconds if > 1e11)
  // - Snaps time to the candle's open boundary using timeframeMs
  // - Converts OHLCV to numbers
  // - Validates that all values are finite
  // - Ensures high >= max(open, close) and low <= min(open, close)
  // - Returns a NEW object (never stores a reference to the input)
  // Returns null if the input is invalid.
  _norm(raw) {
    if (!raw || typeof raw !== 'object') return null;
    let t = +raw.time;
    if (!Number.isFinite(t)) return null;
    // Auto-convert millisecond timestamps to seconds (Binance uses ms; most APIs use s)
    if (t > 1e11) t = Math.floor(t / 1000);
    // Snap time to the candle's open boundary (align to timeframe)
    const tf = this.timeframeMs / 1000;
    if (tf > 0) t = Math.floor(t / tf) * tf;
    const o = +raw.open, h = +raw.high, l = +raw.low, cl = +raw.close;
    if (![o, h, l, cl].every(Number.isFinite)) return null;
    const v = +raw.volume;
    return {
      time: t,
      open: o,
      high: Math.max(h, o, cl),
      low:  Math.min(l, o, cl),
      close: cl,
      volume: Number.isFinite(v) ? v : 0
    };
  }
  // v2.5.0+: Clear all stored candles (used on symbol/timeframe switch).
  clear() { this.candles = []; }
  setData(candles) {
    if (!Array.isArray(candles)) throw new Error('setData: expected array of candles');
    // v2.5.0+: Normalize + clone every candle (no shared references).
    const map = new Map();
    for (const raw of candles) {
      const c = this._norm(raw);
      if (c) map.set(c.time, c);
    }
    this.candles = Array.from(map.values()).sort((a, b) => a.time - b.time);
  }
  // Append or update a single candle (real-time tick).
  // v2.5.0+: Normalizes + clones the input. Stale ticks (older than the last
  // candle) are silently ignored to prevent out-of-order data corruption.
  update(raw) {
    const c = this._norm(raw);
    if (!c) return;
    const last = this.candles[this.candles.length - 1];
    if (!last || c.time > last.time) {
      this.candles.push(c);
      if (this.candles.length > 50000) this.candles.shift();
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
    const isMobileDevice = (typeof window !== 'undefined' &&
      (navigator.maxTouchPoints > 1 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)));
    this.dpr = Math.min(rawDpr, isMobileDevice ? 2 : 3);

    // v2.3.0+: Theme customization — merge user overrides into the global this.theme.
    // v2.5.0+: Theme is now PER-INSTANCE. Each chart gets its own copy of THEME
    // so multiple charts on the same page can have different colors without
    // interfering with each other. During render(), the global THEME is swapped
    // with this.theme so all drawing methods see the instance's colors.
    this.theme = Object.assign({}, THEME, opts.theme || {});

    // v2.3.0+: Mobile render throttle — on mobile devices, cap the render loop
    // at ~30fps instead of 60fps to reduce CPU/battery usage. The chart still
    // looks smooth because candlestick charts don't need 60fps.
    this._isMobile = isMobileDevice;
    this._renderThrottleMs = isMobileDevice ? 33 : 0;  // ~30fps on mobile, uncapped on desktop
    this._lastRenderTime = 0;

    // v2.4.0+: Momentum scrolling (inertia) — after the user releases the mouse/touch
    // after panning, the chart continues to move with decreasing speed, like
    // TradingView / Binance. Velocity is tracked in pixels/ms during drag, then
    // applied with friction in the render loop until it falls below threshold.
    this._momentum = null;          // { velocity: px/ms, lastTime: ms }
    this._panVelocity = 0;          // current tracked velocity during active drag
    this._lastPanX = 0;             // last X position during drag (for velocity calc)
    this._lastPanTime = 0;          // last timestamp during drag
    this._momentumFriction = 0.94;  // velocity multiplier per frame (~60fps → stops in ~1s)
    this._momentumThreshold = 0.02; // px/ms — below this, momentum stops

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
    this._autoTick = false; // disabled by default; user controls updates

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
    this.selectedDrawing = null;  // currently selected drawing (shows properties panel)
    this._customTools = {};       // custom drawing tool renderers (per-instance)
    this._instanceTools = [];     // v2.5.0+: per-instance tool metadata (don't pollute global DRAW_TOOLS)
    this._drawPanelHits = [];     // hit-test for drawing properties panel

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

    this.setupHiDPICanvas();
    this.setupEvents();
    this.updateLayout();
    this.computeTimeWeights();
    this.computeIndicators();
    this.autoScale();
  }

  /* ============================ PUBLIC API ================================ */
  // Set the full candle dataset. Replaces all existing data.
  // candles: array of {time (unix sec), open, high, low, close, volume}
  setData(candles) {
    this.sim.setData(candles);
    this.computeTimeWeights();
    this.computeIndicators();
    this.resetView();
  }
  // Append or update a single candle (real-time tick)
  update(candle) {
    this.sim.update(candle);
    this.computeTimeWeights();
    this.computeIndicators();
    this.autoScale();
  }
  // Append multiple candles
  append(candles) {
    this.sim.append(candles);
    this.computeTimeWeights();
    this.computeIndicators();
    this.autoScale();
  }
  // Set symbol config (label, priceScale, decimals)
  // v2.5.0+: Clears all stored candle data — the user must call setData()
  // with the new symbol's data after switching. Prevents mixing old + new data.
  setSymbol(sym) {
    this.sim.clear();
    this.symbol = Object.assign({}, this.symbol, sym);
    this.priceScale = new PriceScale({scaleMargins:{top:0.15,bottom:0.15}, base: this.symbol.priceScale});
    this.priceScale.setFormatter(new PriceFormatter(this.symbol.priceScale, 1));
    this.priceScale.setHeight(this.priceBottom - this.priceTop);
    this.drawings = [];
    this.computeTimeWeights();
    this.computeIndicators();
    this.resetView();
  }
  // Set timeframe {label, ms}
  // v2.5.0+: Clears all stored candle data — the user must call setData()
  // with the new timeframe's data after switching.
  setTimeframe(tf) {
    this.sim.clear();
    this.timeframe = tf;
    this.sim.setTimeframeMs(tf.ms);
    this.drawings = [];
    this.computeTimeWeights();
    this.computeIndicators();
    this.resetView();
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
    if (typeof idOrDef === 'string') {
      id = idOrDef;
      def = this._customIndicators.get(id);
      if (!def) {
        if (BADI_DEBUG) console.warn('[BadiCharts] Unknown indicator id:', id,
          '(in v2.1.0+, pass a definition object instead)');
        return;
      }
    } else if (idOrDef && typeof idOrDef === 'object' && idOrDef.id) {
      def = idOrDef;
      id = def.id;
      this._customIndicators.set(id, def);
    } else {
      if (BADI_DEBUG) console.warn('[BadiCharts] addIndicator: expected definition object or id');
      return;
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
    if (this.activeIndicatorCard === id) this.activeIndicatorCard = null;
    if (this.settingsCard && this.settingsCard.id === id) this.settingsCard = null;
    this.updateLayout();
    this.computeIndicators();
    this.autoScale();
  }
  // Toggle indicator visibility
  setIndicatorVisible(id, visible) {
    const s = this.indicatorStates.get(id);
    if (s) { s.visible = visible; }
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
    this.drawings.push(drawing);
  }
  // Clear all drawings
  clearDrawings() { this.drawings = []; }
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
        return removed;
      }
    }
    return null;
  }
  // Get the currently selected drawing (clicked by the user), or null.
  getSelectedDrawing() { return this.selectedDrawing; }
  // Programmatically select a drawing by id.
  selectDrawingById(id) { this.selectedDrawing = this.getDrawing(id); }
  // List all available indicators with their active state.
  // Returns: [ { id, label, type, color, active } ]
  getIndicators() {
    const self = this;
    const out = [];
    this._customIndicators.forEach(function (def, id) {
      out.push({
        id: id,
        label: def.label || id,
        type: def.type || 'overlay',
        color: def.color || this.theme.ma1,
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
    }
  }
  // Get a copy of THIS instance's theme.
  getTheme() {
    return Object.assign({}, this.theme);
  }

  // ─── Background image / video ─────────────────────────────────────────────
  // url: string (image URL or video URL), or null to clear
  setBackground(url) {
    this._bgImage = null;
    this._bgVideo = null;
    if (!url) return;
    // Detect video by extension
    const lower = url.toLowerCase();
    const isVideo = lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.ogg') || lower.endsWith('.mov');
    if (isVideo) {
      const v = document.createElement('video');
      v.src = url;
      v.loop = true;
      v.muted = true;
      v.autoplay = true;
      v.playsInline = true;
      v.play().catch(function () {});
      this._bgVideo = v;
    } else {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      this._bgImage = img;
    }
  }
  setBackgroundOpacity(opacity) {
    this._bgOpacity = clamp(opacity, 0, 1);
  }

  // ─── Custom drawing tools ─────────────────────────────────────────────────
  // tool: { id, label, icon (emoji/short text), onDraw(ctx, drawing), onHitTest(drawing, x, y), defaultStyle }
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

  // Reset the view (zoom/pan) to fit all data
  resetView() {
    this.barSpacing = 8;
    this.rightOffset = 4;
    this.constrainRightOffset();
    this.invalidateTimeMarks();
    this.autoScale();
  }
  // Subscribe to crosshair updates (callback receives {index, price, time, candle})
  onCrosshair(cb) { this._crosshairCb = cb; }
  // Fit the chart to show all data
  fit() { this.resetView(); }

  /* --------------------------- Canvas Setup ------------------------------ */
  setupHiDPICanvas() {
    // v2.5.0+: Use the canvas's actual bounding rect (not window.innerWidth/innerHeight)
    // so multiple charts can coexist on the same page at different sizes.
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      // Don't override CSS width/height — let the user's CSS control the display size.
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
    // HEADLESS v2.1.0+: scan custom indicators for type='pane' and type='volume'
    let hasPane = false, hasVolume = false;
    for (const id of this.activeIndicators) {
      const state = this.indicatorStates.get(id);
      if (!state || !state.def) continue;
      if (state.def.type === 'pane') hasPane = true;
      else if (state.def.type === 'volume') hasVolume = true;
    }
    this.layout.paneH = hasPane ? (isMobile ? 110 : 140) : 0;
    const volH = hasVolume ? this.layout.volumeH : 0;

    this.chartLeft = this.layout.leftPad;
    this.chartRight = this.W - this.layout.priceAxisW;
    this.chartTop = paneTop + 4;
    this.chartBottom = bottomStart - this.layout.paneH - (this.layout.paneH > 0 ? this.layout.gap : 0);

    this.volTop = this.chartBottom - volH;
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
    // Mouse events (desktop)
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('mouseleave', () => this.onMouseLeave());
    this.canvas.addEventListener('mouseenter', () => this.mouseInside = true);
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), {passive: false});
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onRightClick(e); });
    window.addEventListener('keydown', (e) => this.onKeyDown(e));

    // Touch events (mobile)
    this.canvas.addEventListener('touchstart', (e) => this.onTouchStart(e), {passive: false});
    this.canvas.addEventListener('touchmove', (e) => this.onTouchMove(e), {passive: false});
    this.canvas.addEventListener('touchend', (e) => this.onTouchEnd(e), {passive: false});
    this.canvas.addEventListener('touchcancel', (e) => this.onTouchEnd(e), {passive: false});
  }

  /* --------------------------- Touch Handlers ---------------------------- */
  onTouchStart(e) {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const touches = e.touches;
    // v2.4.0+: Cancel any active momentum when the user starts a new touch
    this._momentum = null;
    this._panVelocity = 0;
    this._lastPanTime = 0;
    if (touches.length === 1) {
      // Single touch = pan (like drag)
      const t = touches[0];
      this.touchStartX = t.clientX - r.left;
      this.touchStartY = t.clientY - r.top;
      this.touchStartRightOffset = this.rightOffset;
      this.isDragging = true;
      this.mouseX = this.touchStartX;
      this.mouseY = this.touchStartY;
      this.mouseInside = true;
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
          this.startDrawing(this.touchStartX, this.touchStartY);
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
    if (this.isPinching && touches.length === 2) {
      const t1 = touches[0], t2 = touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
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
        this._panVelocity = this._panVelocity * 0.4 + instV * 0.6;
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
      this.updateCurrentDrawing(x, y);
    }
  }

  onTouchEnd(e) {
    e.preventDefault();
    if (this.isPinching) {
      this.isPinching = false;
    }
    // v2.4.0+: Start momentum scrolling on touch release (if panning velocity is significant)
    if (this.isDragging) {
      this.isDragging = false;
      if (Math.abs(this._panVelocity) > this._momentumThreshold) {
        this._momentum = { velocity: this._panVelocity, lastTime: performance.now() };
      }
      this._panVelocity = 0;
      this._lastPanTime = 0;
    }
    if (this.currentDrawing) {
      this.finishDrawing();
    }
    // Hide crosshair after a delay on mobile
    setTimeout(() => {
      if (!this.mouseInside) this.crosshairIndex = null;
    }, 2000);
  }

  onMouseMove(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    this.mouseX = x;
    this.mouseY = y;
    this.mouseInside = true;
    this.hoverButton = this.hitButton(x, y);
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
        // Smooth: weighted average of previous velocity and instantaneous
        this._panVelocity = this._panVelocity * 0.4 + instV * 0.6;
      }
      this._lastPanX = x;
      this._lastPanTime = now;
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
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;

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
        this.setIndicatorSettings(sc.id, newSettings);
        this.settingsCard = null;
        this.showToast('Settings saved');
      } else if (scHit.action === 'field') {
        // Cycle field value via prompt (simple editor) — for number/color
        const sc = this.settingsCard;
        const f = sc.fields[scHit.index];
        if (f.type === 'color') {
          // Cycle through preset colors
          const colors = ['#2962ff','#ff9800','#e91e63','#26a69a','#9c27b0','#ef5350','#7e57c2'];
          const idx = colors.indexOf(f.value);
          f.value = colors[(idx + 1) % colors.length];
        } else {
          // Prompt for new number value
          const newVal = prompt(f.label + ' (current: ' + f.value + '):', String(f.value));
          if (newVal !== null) {
            const num = parseFloat(newVal);
            if (!isNaN(num)) f.value = num;
          }
        }
      }
      return;
    }
    // Click outside settings card closes it
    if (this.settingsCard) {
      this.settingsCard = null;
      return;
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
    if (this.activeTool === 'cursor') {
      if (this.inChartArea(x, y)) {
        // Check if clicking on a drawing (select it) before starting drag
        const clickedDrawing = this.findDrawingAt(x, y);
        if (clickedDrawing && !clickedDrawing.locked) {
          this.selectDrawing(clickedDrawing);
          return;  // don't start drag — user clicked on a drawing
        }
        // Click on empty area → deselect drawing + start drag
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
      this.startDrawing(x, y);
    }
  }

  onMouseUp() {
    if (this.isDragging) {
      this.isDragging = false;
      // v2.4.0+: Start momentum scrolling if the pan velocity is significant
      if (Math.abs(this._panVelocity) > this._momentumThreshold) {
        this._momentum = { velocity: this._panVelocity, lastTime: performance.now() };
      }
      this._panVelocity = 0;
      this._lastPanTime = 0;
    }
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
    // Reasonable zoom factor (10% per tick) — smooth, not too fast
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
    if (e.key === 'Escape') { this.activeTool = 'cursor'; this.currentDrawing = null; this.dropdown = null; this.deselectDrawing(); }
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
  computeTimeWeights() {
    // Build time points with weights for time tick mark builder.
    // Include virtual points for the future/past area so the time axis
    // shows labels when scrolling beyond the data (like TradingView).
    const pts = [];
    const candles = this.sim.candles;
    const N = candles.length;
    const tfSec = this.timeframe.ms / 1000;

    // Actual candle data
    for (let i = 0; i < N; i++) {
      const prev = i > 0 ? candles[i - 1].time : null;
      const w = assignTimeWeight(prev, candles[i].time);
      pts.push({time: candles[i].time, weight: w});
    }

    // Virtual future points: extend up to 500 bars beyond the last candle
    // so the time axis shows future labels when scrolling right
    if (N > 0) {
      const lastTime = candles[N - 1].time;
      const prevLastTime = N > 1 ? candles[N - 2].time : lastTime - tfSec;
      for (let i = 1; i <= 500; i++) {
        const t = lastTime + i * tfSec;
        const w = assignTimeWeight(lastTime + (i - 1) * tfSec, t);
        pts.push({time: t, weight: w});
      }
    }

    // Virtual past points: extend 500 bars before the first candle
    if (N > 0) {
      const firstTime = candles[0].time;
      for (let i = 1; i <= 500; i++) {
        const t = firstTime - i * tfSec;
        const nextT = firstTime - (i - 1) * tfSec;
        const w = assignTimeWeight(t, nextT);
        pts.unshift({time: t, weight: w});
      }
    }

    this._timePoints = pts;
    this.timeTickMarks.setPoints(pts);
    this.invalidateTimeMarks();
  }
  invalidateTimeMarks() { this._timeMarksCache = null; }

  getTimeMarks() {
    // Simple approach: generate time marks at regular intervals across the
    // visible range (including future/past areas). This is simpler and more
    // reliable than the weight-based LWC system for free-scrolling charts.
    const visibleBars = Math.ceil((this.chartRight - this.chartLeft) / this.barSpacing);
    const firstIdx = Math.floor(this.xToIndex(this.chartLeft));
    const lastIdx = Math.ceil(this.xToIndex(this.chartRight));
    // Choose a step so we get ~8-12 marks
    let step = 1;
    const targetMarks = 10;
    while (Math.ceil(visibleBars / step) > targetMarks * 1.5) {
      step *= 2;
      if (step > visibleBars) break;
    }
    // Round step to nice numbers (5, 10, 15, 30, 60, 120, 240, 360, 720)
    const niceSteps = [1, 2, 3, 5, 6, 10, 15, 30, 60, 120, 240, 360, 720, 1440];
    const stepInBars = step;
    // Build marks
    const marks = [];
    const startMark = Math.ceil(firstIdx / stepInBars) * stepInBars;
    for (let i = startMark; i <= lastIdx; i += stepInBars) {
      const t = this._timeAtIndex(i);
      if (t <= 0) continue;
      // Assign weight based on time boundaries
      const tfSec = this.timeframe.ms / 1000;
      const prevT = t - tfSec;
      const w = assignTimeWeight(prevT, t);
      marks.push({index: i, time: t, weight: w});
    }
    return marks;
  }

  /* --------------------------- Auto Scale -------------------------------- */
  autoScale() {
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
    for (const id of this.activeIndicators) {
      const state = this.indicatorStates.get(id);
      if (!state || !state.def || state.def.type !== 'overlay') continue;
      if (state.visible === false) continue;
      const values = this.indCache[id];
      if (!values) continue;
      // If the indicator returns an array of numbers, include them in the range.
      // If it returns an object (e.g., {upper, lower, mid}), skip — the indicator's
      // render() should stay within the candle range, or it should provide its own
      // autoScale contribution via a future hook.
      if (Array.isArray(values)) {
        for (let i = firstIdx; i <= lastIdx; i++) {
          const v = values[i];
          if (v !== null && v !== undefined && typeof v === 'number') {
            if (v > max) max = v;
            if (v < min) min = v;
          }
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
      min = isFinite(min) ? min - 1 : -1;
      max = isFinite(max) ? max + 1 : 1;
      if (min === max) { min -= 1; max += 1; }
    }
    this.priceScale.setRange(min, max);
    this.priceScale.rebuildMarks();

    // Volume scale (0 to maxVol)
    if (isFinite(maxVol)) {
      this.volScale.setRange(0, maxVol * 1.1);
      this.volScale.rebuildMarks();
    }

    // HEADLESS v2.1.0+: pane scale based on the FIRST active pane-type indicator.
    // Uses def.getRange(values, settings) if provided, else auto-range from values.
    let paneId = null;
    for (const id of this.activeIndicators) {
      const state = this.indicatorStates.get(id);
      if (state && state.def && state.def.type === 'pane' && state.visible !== false) {
        paneId = id;
        break;
      }
    }
    if (paneId) {
      const state = this.indicatorStates.get(paneId);
      const values = this.indCache[paneId];
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
      } else {
        pMin = 0; pMax = 100;
      }
      if (!isFinite(pMin)) { pMin = -1; pMax = 1; }
      if (pMin === pMax) { pMin -= 1; pMax += 1; }
      const pad = (pMax - pMin) * 0.1;
      this.paneScale = new PriceScale({scaleMargins: {top: 0.18, bottom: 0.1}, base: 100});
      this.paneScale.setHeight(this.paneBottom - this.paneTop);
      this.paneScale.setRange(pMin - pad, pMax + pad);
      this.paneScale.setFormatter(new PriceFormatter(100, 1));
      this.paneScale.rebuildMarks();
    } else {
      this.paneScale = null;
    }
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
        this.indCache[id] = state.def.calculate(candles, state.settings);
      } catch (e) {
        if (BADI_DEBUG) console.error('[BadiCharts] Indicator calculate error (' + id + '):', e);
        this.indCache[id] = null;
      }
    }
  }

  // Build the helpers object passed to each indicator's render() function.
  // Contains coordinate-conversion functions and current chart geometry.
  _indicatorHelpers(firstIdx, lastIdx) {
    const self = this;
    return {
      firstIdx: firstIdx,
      lastIdx:  lastIdx,
      indexToX: function (i) { return self.indexToX(i); },
      priceToY: function (p) { return self.priceToY(p); },
      volToY:   function (v) { return self.volToY(v); },
      paneToY:  function (v) {
        return self.paneTop + (self.paneScale ? self.paneScale.logicalToCoordinate(v, 0) : 0);
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
      optimalCandlestickWidth: optimalCandlestickWidth
    };
  }

  /* --------------------------- Drawing Tools ----------------------------- */
  startDrawing(x, y) {
    const idx = this.xToIndex(x);
    const price = this.yToPrice(y);
    const tool = this.activeTool;
    if (tool === 'hline') {
      this.drawings.push({type:'hline', price, color: this.theme.drawing, id: Date.now()});
      this.activeTool = 'cursor';
      this.showToast('Horizontal line added');
      this.autoScale();
      return;
    }
    if (tool === 'vline') {
      this.drawings.push({type:'vline', index: idx, color: this.theme.drawing, id: Date.now()});
      this.activeTool = 'cursor';
      this.showToast('Vertical line added');
      return;
    }
    if (tool === 'text') {
      // For text, we use a prompt-like approach via toast; in real app use input.
      // Here we'll add a text drawing with a default label the user can change.
      const txt = 'Text ' + (this.drawings.length + 1);
      this.drawings.push({type:'text', i: idx, p: price, text: txt, color: this.theme.drawing, id: Date.now()});
      this.activeTool = 'cursor';
      this.showToast('Text added (double-click to edit)');
      return;
    }
    // Tools that use single drag (i1,p1) → (i2,p2)
    if (tool === 'trend' || tool === 'ray' || tool === 'channel' || tool === 'arrow' ||
        tool === 'rect' || tool === 'band' || tool === 'fib') {
      this.currentDrawing = {
        type: tool, i1: idx, p1: price, i2: idx, p2: price,
        color: this.theme.drawingActive, id: Date.now()
      };
      return;
    }
    // Brush / Polygon: multi-point paths
    if (tool === 'brush' || tool === 'poly') {
      this.currentDrawing = {
        type: tool,
        points: [{i: idx, p: price, x, y}],
        color: this.theme.drawingActive, id: Date.now(),
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
          color: ds.color || this.theme.drawingActive,
          lineWidth: ds.lineWidth || 1.5,
          id: Date.now()
        };
      }
      if (newDrawing) {
        // Ensure required fields
        newDrawing.type = newDrawing.type || tool;
        newDrawing.id = newDrawing.id || Date.now();
        newDrawing.color = newDrawing.color || (customTool.defaultStyle && customTool.defaultStyle.color) || this.theme.drawingActive;
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
    this.currentDrawing.color = this.theme.drawing;
    // For polygon: mark as closed if 3+ vertices
    if (this.currentDrawing.type === 'poly' && this.currentDrawing.points.length >= 3) {
      this.currentDrawing.closed = true;
    }
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
      this.activeTool = item.value;
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
    const savedTheme = THEME;
    THEME = this.theme;
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
      this.drawDrawings();
      this.drawDrawingPanel();  // Floating properties panel for selected drawing
      this.drawPriceAxis();
      this.drawTimeAxis();
      this.drawCurrentPriceLine();  // After axes so the price label sits ON TOP
      this.drawCrosshair();
      this.drawLegend();
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
    }
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
    ctx.strokeStyle = this.theme.grid;
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
    // Time tick marks for vertical grid lines (including future area)
    const timeMarks = this.getTimeMarks();
    for (const m of timeMarks) {
      const x = this.indexToX(m.index);
      if (x < this.chartLeft || x > this.chartRight) continue;
      ctx.beginPath();
      ctx.moveTo(Math.floor(x) + 0.5, this.chartTop);
      ctx.lineTo(Math.floor(x) + 0.5, this.chartBottom);
      ctx.stroke();
    }
    // Pane separator
    if (this.layout.paneH > 0) {
      ctx.strokeStyle = this.theme.toolbarBorder;
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

    // v2.2.0+: When very zoomed out (barSpacing < 4 OR body width <= 1 bitmap px),
    // draw each candle as a single crisp vertical line from high to low —
    // no separate body. This is exactly what Lightweight Charts does at small
    // barSpacing and eliminates the "blurry" anti-aliased look caused by
    // overlapping sub-pixel-wide bodies + wicks.
    const drawAsLine = this.barSpacing < 4 || bodyWidthBmp <= 1;

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
      const color = isBull ? this.theme.bull : this.theme.bear;
      const yOpen = this.priceToY(c.open);
      const yClose = this.priceToY(c.close);
      const yHigh = this.priceToY(c.high);
      const yLow = this.priceToY(c.low);

      // Snap center to integer bitmap pixel for crisp wick
      const wickXBmp = Math.round(x * dpr);
      const wickX = wickXBmp / dpr;

      ctx.fillStyle = color;

      if (drawAsLine) {
        // ── LWC-style thin mode: single vertical line from high to low ──
        // Use a crisp 1-bitmap-pixel-wide filled rectangle.
        const lineLeft = wickX - wickWidth / 2;
        const lineTop = Math.floor(yHigh * dpr) / dpr;
        const lineBot = Math.ceil(yLow * dpr) / dpr;
        const lineH = Math.max(1 / dpr, lineBot - lineTop);
        ctx.fillRect(lineLeft, lineTop, wickWidth, lineH);
      } else {
        // ── Normal mode: wick + body ──
        const wickLeft = wickX - wickWidth / 2;
        // Draw wick as a filled rectangle (LWC-style) for pixel-perfect crispness
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
    const helpers = this._indicatorHelpers(firstIdx, lastIdx);
    for (const id of volIndicators) {
      const state = this.indicatorStates.get(id);
      if (typeof state.def.render !== 'function') continue;
      try {
        state.def.render(ctx, this.indCache[id], helpers, state.settings, state);
      } catch (e) {
        if (BADI_DEBUG) console.error('[BadiCharts] Volume indicator render error (' + id + '):', e);
      }
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
    const ctx = this.ctx;
    const firstIdx = Math.max(0, Math.floor(this.xToIndex(this.chartLeft)));
    const lastIdx = Math.min(this.sim.candles.length - 1, Math.ceil(this.xToIndex(this.chartRight)));

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.chartLeft, this.priceTop, this.chartRight - this.chartLeft, this.priceBottom - this.priceTop);
    ctx.clip();

    const helpers = this._indicatorHelpers(firstIdx, lastIdx);

    for (const id of this.activeIndicators) {
      const state = this.indicatorStates.get(id);
      if (!state || !state.def) continue;
      if (state.def.type !== 'overlay') continue;
      if (state.visible === false) continue;
      if (typeof state.def.render !== 'function') continue;
      try {
        state.def.render(ctx, this.indCache[id], helpers, state.settings, state);
      } catch (e) {
        if (BADI_DEBUG) console.error('[BadiCharts] Overlay indicator render error (' + id + '):', e);
      }
    }

    ctx.restore();
  }

  /* --------------------------- Pane (custom pane indicators) ------------- */
  // Renders all active pane-type custom indicators. Each indicator's
  // render(ctx, values, helpers, settings, state) is called inside a clip
  // to the pane area. Pane scaling is set up in autoScale() based on the first
  // active pane indicator's getRange() (or auto-range from values).
  drawPane() {
    if (this.layout.paneH === 0 || !this.paneScale) return;
    const ctx = this.ctx;
    const top = this.paneTop, bot = this.paneBottom, left = this.paneLeft, right = this.paneRight;
    const firstIdx = Math.max(0, Math.floor(this.xToIndex(this.chartLeft)));
    const lastIdx = Math.min(this.sim.candles.length - 1, Math.ceil(this.xToIndex(this.chartRight)));

    // Grid (use pane scale marks)
    ctx.strokeStyle = this.theme.grid;
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

    // Clip to pane area for indicator drawings
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bot - top);
    ctx.clip();

    const helpers = this._indicatorHelpers(firstIdx, lastIdx);

    // Render each active pane indicator
    for (const id of this.activeIndicators) {
      const state = this.indicatorStates.get(id);
      if (!state || !state.def) continue;
      if (state.def.type !== 'pane') continue;
      if (state.visible === false) continue;
      if (typeof state.def.render !== 'function') continue;
      try {
        state.def.render(ctx, this.indCache[id], helpers, state.settings, state);
      } catch (e) {
        if (BADI_DEBUG) console.error('[BadiCharts] Pane indicator render error (' + id + '):', e);
      }
    }

    ctx.restore();

    // Indicator labels inside the pane — stacked vertically like the main legend.
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'top';
    const paneIdx = this.crosshairIndex !== null ?
      clamp(Math.round(this.crosshairIndex), 0, this.sim.candles.length - 1) :
      this.sim.candles.length - 1;
    let labelY = top + 4;
    for (const id of this.activeIndicators) {
      const state = this.indicatorStates.get(id);
      if (!state || !state.def || state.def.type !== 'pane') continue;
      const val = this._getIndicatorValueAt(id, paneIdx);
      this._drawIndicatorLine(left + 6, labelY, id, state.def, state, val);
      labelY += 22;
    }

    // Right axis labels (price scale of the pane)
    ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = this.theme.textDim; ctx.textAlign = 'left';
    for (const m of pmarks) ctx.fillText(m.label, right + 4, top + m.coord - 5);
  }

  /* --------------------------- Drawings ---------------------------------- */
  drawDrawings() {
    const ctx = this.ctx;
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
        case 'ray': {
          // Ray: starts at (i1,p1) and extends through (i2,p2) to the right edge
          const x1 = this.indexToX(d.i1);
          const x2 = this.indexToX(d.i2);
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
          const x1 = this.indexToX(d.i1);
          const x2 = this.indexToX(d.i2);
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
          ctx.fillStyle = color + '15';
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
          const x1 = this.indexToX(d.i1);
          const x2 = this.indexToX(d.i2);
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
          ctx.fillStyle = color + '25';
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
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(this.chartLeft, Math.floor(y) + 0.5);
          ctx.lineTo(this.chartRight, Math.floor(y) + 0.5);
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
          const x = this.indexToX(d.index);
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          // v2.2.0+: clip vline to chartTop..chartBottom only (not into pane/time axis)
          ctx.moveTo(Math.floor(x) + 0.5, this.chartTop);
          ctx.lineTo(Math.floor(x) + 0.5, this.chartBottom);
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
        case 'poly': {
          if (!d.points || d.points.length < 2) break;
          ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          for (let i = 0; i < d.points.length; i++) {
            const p = d.points[i];
            const x = this.indexToX(p.i);
            const y = this.priceToY(p.p);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          if (d.closed) {
            ctx.closePath();
            ctx.fillStyle = color + '20';
            ctx.fill();
          }
          ctx.stroke();
          // Vertex dots
          for (const p of d.points) {
            const x = this.indexToX(p.i);
            const y = this.priceToY(p.p);
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
          }
          break;
        }
        case 'text': {
          const x = this.indexToX(d.i);
          const y = this.priceToY(d.p);
          ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
          // Background box for readability
          const tw = ctx.measureText(d.text).width + 8;
          ctx.fillStyle = color + '30';
          ctx.fillRect(x - 2, y - 16, tw, 18);
          ctx.fillStyle = color;
          ctx.fillText(d.text, x + 2, y - 2);
          // Anchor dot
          ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
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
          ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
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
            const p = d.points[i];
            const x = this.indexToX(p.i);
            const y = this.priceToY(p.p);
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
            try {
              customTool.onDraw(ctx, d, helpers);
            } catch (e) {
              if (BADI_DEBUG) console.error('[BadiCharts] Custom tool onDraw error (' + d.type + '):', e);
            }
          }
          break;
        }
      }
      if (needsClip) ctx.restore();
    };
    for (const d of this.drawings) drawOne(d);
    if (this.currentDrawing) drawOne(this.currentDrawing, true);
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
            copy.id = Date.now();
            if (copy.i1 !== undefined) copy.i1 += 5;
            if (copy.i2 !== undefined) copy.i2 += 5;
            if (copy.points) copy.points = copy.points.map(function (p) { return { i: p.i + 5, p: p.p, x: p.x, y: p.y }; });
            this.drawings.push(copy);
            this.selectedDrawing = copy;
            this.showToast('Drawing duplicated');
            break;
        }
        return true;
      }
    }
    return false;
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
        const x1 = this.indexToX(d.i1), x2 = this.indexToX(d.i2);
        const y1 = this.priceToY(d.p1), y2 = this.priceToY(d.p2);
        return this._distToSeg(x, y, x1, y1, x2, y2) < tol;
      }
      case 'channel': {
        // Test both the main line and the parallel line
        const x1 = this.indexToX(d.i1), x2 = this.indexToX(d.i2);
        const y1 = this.priceToY(d.p1), y2 = this.priceToY(d.p2);
        const offsetPrice = d.p2 - d.p1;
        const y1b = this.priceToY(d.p1 + offsetPrice);
        const y2b = this.priceToY(d.p2 + offsetPrice);
        return this._distToSeg(x, y, x1, y1, x2, y2) < tol
            || this._distToSeg(x, y, x1, y1b, x2, y2b) < tol;
      }
      case 'band':
      case 'hline': {
        const y1 = this.priceToY(d.type === 'hline' ? d.price : d.p1);
        const y2 = d.type === 'hline' ? y1 : this.priceToY(d.p2);
        const yTop = Math.min(y1, y2), yBot = Math.max(y1, y2);
        return ((Math.abs(y - yTop) < tol || Math.abs(y - yBot) < tol) ||
                (y >= yTop && y <= yBot)) && x >= this.chartLeft && x <= this.chartRight;
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
      case 'brush':
      case 'poly': {
        if (!d.points || d.points.length < 2) return false;
        for (let i = 1; i < d.points.length; i++) {
          const p1 = d.points[i-1], p2 = d.points[i];
          const x1 = this.indexToX(p1.i), y1 = this.priceToY(p1.p);
          const x2 = this.indexToX(p2.i), y2 = this.priceToY(p2.p);
          if (this._distToSeg(x, y, x1, y1, x2, y2) < tol) return true;
        }
        return false;
      }
      case 'text': {
        const x1 = this.indexToX(d.i), y1 = this.priceToY(d.p);
        ctx.font = '12px -apple-system, Segoe UI, Roboto, sans-serif';
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
    const isBull = last.close >= last.open;
    const color = isBull ? this.theme.currentPriceBull : this.theme.currentPriceBear;
    // Dashed line across the chart (stops at chartRight)
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(this.chartLeft, Math.floor(y) + 0.5);
    ctx.lineTo(this.chartRight, Math.floor(y) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
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

  /* --------------------------- Price Axis -------------------------------- */
  drawPriceAxis() {
    const ctx = this.ctx;
    // v2.4.0+: Use dedicated axis colors (axisBg, axisBorder, axisText)
    // Fill the entire right column (price axis + corner with time axis) with axisBg
    const axisTop = this.chartTop;
    const axisBottom = (this.layout.paneBottom || this.chartBottom) + this.layout.timeAxisH;
    ctx.fillStyle = this.theme.axisBg;
    ctx.fillRect(this.chartRight + 1, axisTop, this.W - this.chartRight - 1, axisBottom - axisTop);
    ctx.strokeStyle = this.theme.axisBorder;
    ctx.beginPath();
    ctx.moveTo(this.chartRight + 0.5, this.chartTop);
    ctx.lineTo(this.chartRight + 0.5, this.chartBottom);
    ctx.stroke();

    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = this.theme.axisText;
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

  drawTimeAxis() {
    const ctx = this.ctx;
    const axisTop = this.layout.paneBottom || this.chartBottom;
    // v2.4.0+: Use dedicated axis colors (axisBg, axisBorder, axisText)
    ctx.fillStyle = this.theme.axisBg;
    ctx.fillRect(0, axisTop, this.chartRight + 1, this.layout.timeAxisH);
    ctx.strokeStyle = this.theme.axisBorder;
    ctx.beginPath();
    ctx.moveTo(0, axisTop + 0.5);
    ctx.lineTo(this.chartRight, axisTop + 0.5);
    ctx.stroke();

    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = this.theme.axisText;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const marks = this.getTimeMarks();
    // LWC-style collision detection: skip labels that would overlap previous one.
    let prevRightEdge = -Infinity;
    for (const m of marks) {
      const x = this.indexToX(m.index);
      if (x < this.chartLeft || x > this.chartRight) continue;
      // Use the time stored in the mark (works for past, present, and future)
      const label = formatTickMark(m.time, m.weight, this.timeframe.label);
      const labelW = label.length * 6 + 8;
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
    // v2.3.1: On mobile/touch devices, don't show the crosshair (mouse axes) at all.
    if (this._isMobile) return;
    if (!this.mouseInside || this.crosshairIndex === null) return;
    if (this.activeTool !== 'cursor') return;
    if (!this.inChartArea(this.mouseX, this.mouseY) &&
        !this.inPriceAxis(this.mouseX, this.mouseY)) return;
    const ctx = this.ctx;
    const idx = Math.round(this.crosshairIndex);
    // Allow crosshair in future area (idx >= candles.length) and past area (idx < 0)
    const x = this.indexToX(idx);
    const y = this.mouseY;

    ctx.strokeStyle = this.theme.crosshair;
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

    // Time label on axis — use _timeAtIndex for future/past support
    const t = this._timeAtIndex(idx);
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
    ctx.fillStyle = this.theme.crosshairLabel;
    ctx.fillRect(x - tw / 2, (this.layout.paneBottom || this.chartBottom) + 2, tw, this.layout.timeAxisH - 4);
    ctx.fillStyle = this.theme.textBright;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(timeStr, x, (this.layout.paneBottom || this.chartBottom) + this.layout.timeAxisH / 2);

    // v2.3.1: Price label ON the price axis (chartRight + 1) — the axis is
    // connected to the chart and the crosshair price label sits on it.
    if (this.mouseX < this.chartRight && this.mouseY >= this.chartTop && this.mouseY <= this.chartBottom) {
      const price = this.yToPrice(y);
      const priceStr = this.priceScale.formatLogical(price);
      const pw = ctx.measureText(priceStr).width + 14;
      ctx.fillStyle = this.theme.crosshairLabel;
      ctx.fillRect(this.chartRight + 1, Math.floor(y) - 9, pw, 18);
      ctx.fillStyle = this.theme.textBright;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(priceStr, this.chartRight + 1 + pw / 2, Math.floor(y));
      ctx.textAlign = 'left';
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
    const changePct = (change / c.open) * 100;
    const changeTxt = (change >= 0 ? '+' : '') + this.priceScale.formatLogical(Math.abs(change)) +
                      ' (' + (change >= 0 ? '+' : '') + changePct.toFixed(2) + '%)';
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
  _drawIndicatorLine(x, y, id, meta, state, val) {
    const ctx = this.ctx;
    const isActive = this.activeIndicatorCard === id;
    const isVisible = state.visible !== false;
    const color = meta.color;
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const labelTxt = meta.label + ':';
    const labelW = ctx.measureText(labelTxt).width;
    const valTxt = val || '';
    const valW = ctx.measureText(valTxt).width;
    // Background when active (subtle highlight)
    const allIcons = state.icons.concat(state.customIcons.map(c => c.id));
    const iconSize = 16;   // bigger icons for easier clicking
    const iconGap = 4;
    const padX = 6;
    const cardH = 22;      // taller card for better readability
    const centerY = y + cardH / 2;
    let iconsW = 0;
    if (isActive) iconsW = allIcons.length * (iconSize + iconGap);
    const lineW = padX + labelW + 6 + valW + (isActive ? iconsW + 8 : 0) + padX;
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
    // Icons (only when active)
    if (isActive) {
      let ix = x + padX + 10 + labelW + 6 + valW + 8;
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

    if (!values || idx < 0 || idx >= values.length) return '—';
    const v = values[idx];
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
    const cardW = padX + labelW + 4 + valW + padX + (isActive ? iconsW + 4 : 0);
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
    // Icons (only when active)
    if (isActive) {
      let ix = x + padX + labelW + 4 + valW + 4;
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
      // Default icons drawn as simple SVG-like paths
      switch (iconId) {
        case 'hide': {
          // Eye icon — open eye when visible, closed eye when hidden
          if (state && state.visible !== false) {
            // Open eye
            ctx.beginPath();
            ctx.arc(cx, cy, 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(cx, cy, 4.5, 2.5, 0, 0, Math.PI * 2);
            ctx.stroke();
          } else {
            // Closed eye (eye with line through)
            ctx.beginPath();
            ctx.ellipse(cx, cy, 4.5, 2.5, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - 4, cy - 3);
            ctx.lineTo(cx + 4, cy + 3);
            ctx.stroke();
          }
          break;
        }
        case 'edit': {
          // Pencil icon
          ctx.beginPath();
          ctx.moveTo(cx - 3, cy + 3);
          ctx.lineTo(cx + 2, cy - 2);
          ctx.lineTo(cx + 4, cy);
          ctx.lineTo(cx - 1, cy + 5);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - 3, cy + 3);
          ctx.lineTo(cx - 4, cy + 4);
          ctx.lineTo(cx - 1, cy + 5);
          ctx.stroke();
          break;
        }
        case 'settings': {
          // Gear icon (simplified: circle + 4 small ticks)
          ctx.beginPath();
          ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
          ctx.stroke();
          for (let a = 0; a < 4; a++) {
            const ang = a * Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(ang) * 3.5, cy + Math.sin(ang) * 3.5);
            ctx.lineTo(cx + Math.cos(ang) * 5, cy + Math.sin(ang) * 5);
            ctx.stroke();
          }
          break;
        }
        case 'delete': {
          // X icon
          ctx.beginPath();
          ctx.moveTo(cx - 3, cy - 3);
          ctx.lineTo(cx + 3, cy + 3);
          ctx.moveTo(cx + 3, cy - 3);
          ctx.lineTo(cx - 3, cy + 3);
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
    const fields = [];
    const s = state.settings;
    if (s.period !== undefined) fields.push({key: 'period', label: 'Period', type: 'number', value: s.period});
    if (s.mult !== undefined) fields.push({key: 'mult', label: 'Std Dev Mult', type: 'number', value: s.mult});
    if (s.fast !== undefined) fields.push({key: 'fast', label: 'Fast', type: 'number', value: s.fast});
    if (s.slow !== undefined) fields.push({key: 'slow', label: 'Slow', type: 'number', value: s.slow});
    if (s.signal !== undefined) fields.push({key: 'signal', label: 'Signal', type: 'number', value: s.signal});
    if (s.bins !== undefined) fields.push({key: 'bins', label: 'Bins', type: 'number', value: s.bins});
    if (s.color !== undefined) fields.push({key: 'color', label: 'Color', type: 'color', value: s.color});
    // Allow user to override fields via onSettings callback returning custom fields
    // (handled by user — here we just provide defaults)
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
      // Compact status bar: only Bid, 24h High, 24h Vol
      draw('B', this.priceScale.formatLogical(last.close), this.theme.bear);
      const last24 = this.sim.candles.slice(-24);
      draw('H', this.priceScale.formatLogical(last24.reduce((m, c) => Math.max(m, c.high), 0)));
      draw('Vol', this._fmtVol(last24.reduce((s, c) => s + c.volume, 0)));
    } else {
      draw('Bid', this.priceScale.formatLogical(last.close - 0.5), this.theme.bear);
      draw('Ask', this.priceScale.formatLogical(last.close + 0.5), this.theme.bull);
      draw('Spread', this.priceScale.formatLogical(0.5 * 2));
      const last24 = this.sim.candles.slice(-24);
      draw('24h High', this.priceScale.formatLogical(last24.reduce((m, c) => Math.max(m, c.high), 0)));
      draw('24h Low', this.priceScale.formatLogical(last24.reduce((m, c) => Math.min(m, c.low), Infinity)));
      draw('24h Vol', this._fmtVol(last24.reduce((s, c) => s + c.volume, 0)));
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = this.theme.textDim;
    if (isMobile) {
      const toolShort = TOOL_SHORTCUTS[this.activeTool] || '↖';
      ctx.fillText(toolShort, this.W - 6, y + this.layout.statusH / 2);
    } else {
      const toolTxt = 'Tool: ' + DRAW_TOOLS.find(t => t.id === this.activeTool).label;
      ctx.fillText(toolTxt, this.W - 10, y + this.layout.statusH / 2);
      if (this.drawings.length > 0) {
        ctx.fillStyle = this.theme.accent;
        ctx.fillText(this.drawings.length + ' drawings', this.W - 10 - ctx.measureText(toolTxt).width - 16, y + this.layout.statusH / 2);
      }
    }
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
  start() {
    const loop = (now) => {
      this.rafId = requestAnimationFrame(loop);
      // Pause when tab is hidden
      if (document.hidden) return;
      // Apply momentum scrolling (inertia) — runs every frame regardless of throttle
      this._applyMomentum(now);
      // Throttle on mobile
      if (this._renderThrottleMs > 0) {
        if (now - this._lastRenderTime < this._renderThrottleMs) return;
      }
      this._lastRenderTime = now;
      this.render(now);
    };
    this.rafId = requestAnimationFrame(loop);
  }
  // v2.4.0+: Apply momentum scrolling. Called every frame from the render loop.
  // Moves the chart by velocity * deltaTime, then applies friction. Stops when
  // velocity falls below threshold or the user starts a new interaction.
  _applyMomentum(now) {
    if (!this._momentum) return;
    const m = this._momentum;
    const dt = now - m.lastTime;
    if (dt <= 0) return;
    // Convert px/ms to bars/ms and apply to rightOffset
    const barsPerMs = m.velocity / this.barSpacing;
    this.rightOffset -= barsPerMs * dt;
    this.constrainRightOffset();
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
