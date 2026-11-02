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
const VERSION = '1.0.0';

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
// Timeframes and symbols are now USER-PROVIDED via the chart constructor options.
// The chart library itself is data-source-agnostic.

const INDICATOR_LIST = [
  {id:'ma20',   label:'MA 20',       type:'overlay',  color:THEME.ma1},
  {id:'ma50',   label:'MA 50',       type:'overlay',  color:THEME.ma2},
  {id:'ma200',  label:'MA 200',      type:'overlay',  color:THEME.ma3},
  {id:'ema20',  label:'EMA 20',      type:'overlay',  color:THEME.ma1},
  {id:'ema50',  label:'EMA 50',      type:'overlay',  color:THEME.ma2},
  {id:'bb',     label:'Bollinger',   type:'overlay',  color:THEME.bollingerMid},
  {id:'volsma', label:'Vol SMA 20',  type:'volume',   color:THEME.ma2},
  {id:'rsi',    label:'RSI 14',      type:'pane',     color:THEME.rsi},
  {id:'macd',   label:'MACD',        type:'pane',     color:THEME.macd},
  {id:'vprof',  label:'Volume Profile', type:'overlay', color:THEME.ma1}
];

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
  setData(candles) {
    if (!Array.isArray(candles)) throw new Error('setData: expected array of candles');
    // Sort by time ascending and dedupe
    const map = new Map();
    for (const c of candles) {
      if (!c || typeof c.time !== 'number') continue;
      map.set(c.time, c);
    }
    this.candles = Array.from(map.values()).sort((a, b) => a.time - b.time);
  }
  // Append or update a single candle (real-time tick)
  update(candle) {
    if (!candle || typeof candle.time !== 'number') return;
    const last = this.candles[this.candles.length - 1];
    if (!last || candle.time > last.time) {
      this.candles.push(candle);
      if (this.candles.length > 50000) this.candles.shift();
    } else if (last && candle.time === last.time) {
      this.candles[this.candles.length - 1] = candle;
    }
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

    // User-provided state (no fake data)
    this.symbol = opts.symbol || {label: 'SYMBOL', priceScale: 100, decimals: 2};
    this.timeframe = opts.timeframe || {label: '1H', ms: 60 * 60 * 1000};
    this.sim = new DataLayer();
    this.sim.setTimeframeMs(this.timeframe.ms);
    this._autoTick = false; // disabled by default; user controls updates

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

    // Indicators — empty by default, user adds via addIndicator()
    this.activeIndicators = new Set(opts.indicators || []);
    this.indCache = {};
    // Per-indicator state: { visible, settings, customIcons, onSettings, onEdit }
    // Each active indicator gets a state entry on addIndicator().
    this.indicatorStates = new Map();
    // Initialize states for indicators passed in constructor options
    for (const id of this.activeIndicators) {
      this.indicatorStates.set(id, this._defaultIndicatorState(id));
    }
    // Active indicator card (which card's icons are currently shown expanded)
    this.activeIndicatorCard = null;
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
  setSymbol(sym) {
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
  setTimeframe(tf) {
    this.timeframe = tf;
    this.sim.setTimeframeMs(tf.ms);
    this.drawings = [];
    this.computeTimeWeights();
    this.computeIndicators();
    this.resetView();
  }
  // Default state for an indicator (visible, default settings, default icons)
  _defaultIndicatorState(id) {
    const meta = INDICATOR_LIST.find(i => i.id === id);
    const defaults = {
      ma20:  {period: 20,  color: THEME.ma1},
      ma50:  {period: 50,  color: THEME.ma2},
      ma200: {period: 200, color: THEME.ma3},
      ema20: {period: 20,  color: THEME.ma1},
      ema50: {period: 50,  color: THEME.ma2},
      bb:    {period: 20,  mult: 2, color: THEME.bollingerMid},
      volsma:{period: 20,  color: THEME.ma2},
      rsi:   {period: 14,  color: THEME.rsi},
      macd:  {fast: 12, slow: 26, signal: 9, color: THEME.macd},
      vprof: {bins: 24, color: THEME.ma1}
    };
    return {
      visible: true,
      settings: defaults[id] || {},
      // Default 4 icons (TradingView-style): hide/show, edit, settings, delete
      icons: ['hide', 'edit', 'settings', 'delete'],
      // Custom icons added by user (array of {id, label, icon, onClick})
      customIcons: [],
      // Callbacks
      onSettings: null,  // function(settings) — called when settings change
      onEdit: null       // function() — called when edit/code button clicked
    };
  }
  // Add an indicator by id with optional config
  // config: { settings, icons, customIcons, onSettings, onEdit }
  addIndicator(id, config) {
    config = config || {};
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
    this.drawings.push(drawing);
  }
  // Clear all drawings
  clearDrawings() { this.drawings = []; }
  // Set the active drawing tool by id
  setTool(toolId) { this.activeTool = toolId; }
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
    // Responsive layout: smaller dimensions on mobile (width < 600px)
    const isMobile = this.W < 600;
    if (isMobile) {
      this.layout.toolbarH = 40;
      this.layout.statusH = 22;
      this.layout.priceAxisW = 56;
      this.layout.timeAxisH = 24;
      this.layout.volumeH = 50;
      this.layout.gap = 4;
    } else {
      this.layout.toolbarH = 44;
      this.layout.statusH = 26;
      this.layout.priceAxisW = 64;
      this.layout.timeAxisH = 28;
      this.layout.volumeH = 64;
      this.layout.gap = 8;
    }

    const paneTop = this.layout.toolbarH;
    const bottomStart = this.H - this.layout.statusH - this.layout.timeAxisH;
    const hasPane = this.activeIndicators.has('rsi') || this.activeIndicators.has('macd');
    this.layout.paneH = hasPane ? (isMobile ? 80 : 100) : 0;

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
        this.crosshairIndex = clamp(idx, 0, this.sim.candles.length - 1);
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
      if (this.inChartArea(x, y)) {
        const idx = this.xToIndex(x);
        this.crosshairIndex = clamp(idx, 0, this.sim.candles.length - 1);
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
    if (this.isDragging) {
      this.isDragging = false;
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
    if (tool === 'text') {
      // For text, we use a prompt-like approach via toast; in real app use input.
      // Here we'll add a text drawing with a default label the user can change.
      const txt = 'Text ' + (this.drawings.length + 1);
      this.drawings.push({type:'text', i: idx, p: price, text: txt, color: THEME.drawing, id: Date.now()});
      this.activeTool = 'cursor';
      this.showToast('Text added (double-click to edit)');
      return;
    }
    // Tools that use single drag (i1,p1) → (i2,p2)
    if (tool === 'trend' || tool === 'ray' || tool === 'channel' || tool === 'arrow' ||
        tool === 'rect' || tool === 'band' || tool === 'fib') {
      this.currentDrawing = {
        type: tool, i1: idx, p1: price, i2: idx, p2: price,
        color: THEME.drawingActive, id: Date.now()
      };
      return;
    }
    // Brush / Polygon: multi-point paths
    if (tool === 'brush' || tool === 'poly') {
      this.currentDrawing = {
        type: tool,
        points: [{i: idx, p: price, x, y}],
        color: THEME.drawingActive, id: Date.now(),
        closed: false
      };
      return;
    }
  }
  updateCurrentDrawing(x, y) {
    if (!this.currentDrawing) return;
    const idx = this.xToIndex(x);
    const price = this.yToPrice(y);
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
    this.currentDrawing.color = THEME.drawing;
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
  render(now) {
    if (!now) now = performance.now();
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
    this.drawPriceAxis();
    this.drawTimeAxis();
    this.drawCurrentPriceLine();  // After axes so the price label sits ON TOP
    this.drawCrosshair();
    this.drawLegend();
    this.drawSettingsCard();      // Settings popup (drawn last so it overlays everything)
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
    if (this.activeIndicators.has('volsma') && this.isIndicatorVisible('volsma') && this.indCache.volsma) {
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

  /* --------------------------- Volume Profile ---------------------------- */
  // Example of a custom indicator drawing on the chart (overlay).
  // Computes volume distribution by price level over visible candles,
  // then draws horizontal bars from the right side of the chart going left.
  drawVolumeProfile() {
    if (!this.activeIndicators.has('vprof') || !this.isIndicatorVisible('vprof')) return;
    const ctx = this.ctx;
    const firstIdx = Math.max(0, Math.floor(this.xToIndex(this.chartLeft)));
    const lastIdx = Math.min(this.sim.candles.length - 1, Math.ceil(this.xToIndex(this.chartRight)));
    if (firstIdx >= lastIdx) return;
    const prof = Indicators.volumeProfile(this.sim.candles, firstIdx, lastIdx, 24);
    if (!prof) return;
    // Clip to price chart area
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.chartLeft, this.priceTop, this.chartRight - this.chartLeft, this.priceBottom - this.priceTop);
    ctx.clip();
    const maxW = (this.chartRight - this.chartLeft) * 0.30; // bars take up to 30% of chart width from right
    const binH = (prof.maxP - prof.minP) / prof.bins.length;
    for (let i = 0; i < prof.bins.length; i++) {
      const b = prof.bins[i];
      const y = this.priceToY(b.priceHigh);
      const yLow = this.priceToY(b.priceLow);
      const w = (b.volume / prof.maxVol) * maxW;
      const x = this.chartRight - w;
      const barH = Math.max(1, yLow - y);
      // Color: green for up-volume, red for down-volume
      const upRatio = b.upVol / Math.max(1, b.volume);
      const color = upRatio >= 0.5 ? 'rgba(38,166,154,0.55)' : 'rgba(239,83,80,0.55)';
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, barH);
      // Highlight POC (Point of Control) — the bin with highest volume
      if (i === prof.pocIdx) {
        ctx.strokeStyle = '#ffb74d';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, w, barH);
      }
    }
    // Draw POC line across the chart
    const pocY = this.priceToY(prof.pocPrice);
    ctx.strokeStyle = 'rgba(255,183,77,0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(this.chartLeft, Math.floor(pocY) + 0.5);
    ctx.lineTo(this.chartRight, Math.floor(pocY) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    // Draw VWAP line
    const vwapY = this.priceToY(prof.vwap);
    ctx.strokeStyle = 'rgba(156,39,176,0.9)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(this.chartLeft, Math.floor(vwapY) + 0.5);
    ctx.lineTo(this.chartRight, Math.floor(vwapY) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    // Labels (drawn after restore so visible on price axis)
    ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // POC label
    const pocTxt = 'POC ' + this.priceScale.formatLogical(prof.pocPrice);
    const pw = ctx.measureText(pocTxt).width + 8;
    ctx.fillStyle = '#ffb74d';
    ctx.fillRect(this.chartRight + 1, Math.floor(pocY) - 7, pw, 14);
    ctx.fillStyle = THEME.bg;
    ctx.fillText(pocTxt, this.chartRight + 5, Math.floor(pocY));
    // VWAP label
    const vwapTxt = 'VWAP ' + this.priceScale.formatLogical(prof.vwap);
    const vw = ctx.measureText(vwapTxt).width + 8;
    ctx.fillStyle = '#9c27b0';
    ctx.fillRect(this.chartRight + 1, Math.floor(vwapY) - 7, vw, 14);
    ctx.fillStyle = THEME.bg;
    ctx.fillText(vwapTxt, this.chartRight + 5, Math.floor(vwapY));
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
    if (this.activeIndicators.has('ma20') && this.isIndicatorVisible('ma20'))  drawLine(this.indCache.ma20,  THEME.ma1);
    if (this.activeIndicators.has('ma50') && this.isIndicatorVisible('ma50'))  drawLine(this.indCache.ma50,  THEME.ma2);
    if (this.activeIndicators.has('ma200') && this.isIndicatorVisible('ma200')) drawLine(this.indCache.ma200, THEME.ma3);
    if (this.activeIndicators.has('ema20') && this.isIndicatorVisible('ema20')) drawLine(this.indCache.ema20, THEME.ma1, 1.6);
    if (this.activeIndicators.has('ema50') && this.isIndicatorVisible('ema50')) drawLine(this.indCache.ema50, THEME.ma2, 1.6);
    if (this.activeIndicators.has('bb') && this.isIndicatorVisible('bb') && this.indCache.bb) {
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

    if (this.activeIndicators.has('rsi') && this.isIndicatorVisible('rsi') && this.indCache.rsi) {
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
    } else if (this.activeIndicators.has('macd') && this.isIndicatorVisible('macd') && this.indCache.macd) {
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

    // Indicator cards for the pane (TradingView-style, with icons)
    // Reuse the same _drawIndicatorCard system as the main legend.
    ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'top';
    const paneIdx = this.crosshairIndex !== null ?
      clamp(Math.round(this.crosshairIndex), 0, this.sim.candles.length - 1) :
      this.sim.candles.length - 1;
    let pcx = left + 6;
    const pcy = top + 4;
    // RSI card
    if (this.activeIndicators.has('rsi')) {
      const state = this.indicatorStates.get('rsi') || {visible: true, settings: {}, icons: ['hide','edit','settings','delete'], customIcons: []};
      const meta = INDICATOR_LIST.find(i => i.id === 'rsi');
      if (meta) {
        const val = this._getIndicatorValueAt('rsi', paneIdx);
        const cardW = this._drawIndicatorCard(pcx, pcy, 'rsi', meta, state, val);
        pcx += cardW + 8;
      }
    }
    // MACD card
    if (this.activeIndicators.has('macd')) {
      const state = this.indicatorStates.get('macd') || {visible: true, settings: {}, icons: ['hide','edit','settings','delete'], customIcons: []};
      const meta = INDICATOR_LIST.find(i => i.id === 'macd');
      if (meta) {
        const val = this._getIndicatorValueAt('macd', paneIdx);
        const cardW = this._drawIndicatorCard(pcx, pcy, 'macd', meta, state, val);
        pcx += cardW + 8;
      }
    }
    // Right axis labels (price scale of the pane)
    ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
    for (const m of pmarks) ctx.fillText(m.label, right + 4, top + m.coord - 5);
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
          // Band/Zone: shaded horizontal zone between p1 and p2, spanning full width
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
          // Labels on price axis
          ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          const t1 = this.priceScale.formatLogical(d.p1);
          const t2 = this.priceScale.formatLogical(d.p2);
          const tw1 = ctx.measureText(t1).width + 8;
          const tw2 = ctx.measureText(t2).width + 8;
          ctx.fillStyle = color;
          ctx.fillRect(this.chartRight + 1, Math.floor(y1) - 7, tw1, 14);
          ctx.fillRect(this.chartRight + 1, Math.floor(y2) - 7, tw2, 14);
          ctx.fillStyle = THEME.bg;
          ctx.fillText(t1, this.chartRight + 5, Math.floor(y1));
          ctx.fillText(t2, this.chartRight + 5, Math.floor(y2));
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
    const color = isBull ? THEME.currentPriceBull : THEME.currentPriceBear;
    // Dashed line across the chart
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(this.chartLeft, Math.floor(y) + 0.5);
    ctx.lineTo(this.chartRight, Math.floor(y) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    // Price label on the price axis (drawn ON TOP of axis labels, like LWC)
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
    ctx.fillStyle = THEME.textBright;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, labelX + tw / 2, clampedY + 9);
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
    const isMobile = this.W < 600;
    // If no data, just show the symbol/timeframe label
    if (this.sim.candles.length === 0) {
      ctx.font = 'bold ' + (isMobile ? '11px' : '12px') + ' -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = THEME.textBright;
      ctx.textBaseline = 'top'; ctx.textAlign = 'left';
      const symTxt = this.symbol.label + ' · ' + this.timeframe.label;
      ctx.fillText(symTxt, this.chartLeft + 6, this.chartTop + 6);
      return;
    }
    const idx = this.crosshairIndex !== null ?
      clamp(Math.round(this.crosshairIndex), 0, this.sim.candles.length - 1) :
      this.sim.candles.length - 1;
    const c = this.sim.candles[idx];
    if (!c) return;
    ctx.font = (isMobile ? '11px' : '12px') + ' -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    let x = this.chartLeft + 6;
    const y = this.chartTop + 6;
    ctx.fillStyle = THEME.textBright;
    ctx.font = 'bold ' + (isMobile ? '11px' : '12px') + ' -apple-system, Segoe UI, Roboto, sans-serif';
    const symTxt = this.symbol.label + ' · ' + this.timeframe.label;
    ctx.fillText(symTxt, x, y);
    x += ctx.measureText(symTxt).width + (isMobile ? 8 : 12);
    ctx.font = (isMobile ? '11px' : '12px') + ' -apple-system, Segoe UI, Roboto, sans-serif';
    const isBull = c.close >= c.open;
    // On mobile: show only Close + Change. On desktop: full OHLC.
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
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(p.label, x, y);
      x += ctx.measureText(p.label).width + 4;
      ctx.fillStyle = isBull ? THEME.bull : THEME.bear;
      ctx.fillText(p.value, x, y);
      x += ctx.measureText(p.value).width + gap;
    }
    const change = c.close - c.open;
    const changePct = (change / c.open) * 100;
    const changeTxt = (change >= 0 ? '+' : '') + this.priceScale.formatLogical(Math.abs(change)) +
                      ' (' + (change >= 0 ? '+' : '') + changePct.toFixed(2) + '%)';
    ctx.fillStyle = isBull ? THEME.bull : THEME.bear;
    ctx.fillText(changeTxt, x, y);

    // Indicator cards (second line) — TradingView-style with icons
    if (isMobile) return;
    // NOTE: _iconHits is reset once per frame in render(), not here,
    // so pane cards (drawn in drawPane) are preserved.
    let cx = this.chartLeft + 6;
    const cy = y + 18;
    // Only show overlay/volume indicators in the main legend.
    // Pane indicators (rsi, macd) are shown in their own pane via drawPane().
    const activeIds = Array.from(this.activeIndicators).filter(id => id !== 'rsi' && id !== 'macd');
    for (const id of activeIds) {
      const state = this.indicatorStates.get(id) || {visible: true, settings: {}, icons: ['hide','edit','settings','delete'], customIcons: []};
      const meta = INDICATOR_LIST.find(i => i.id === id);
      if (!meta) continue;
      // Get current value for this indicator at idx
      const val = this._getIndicatorValueAt(id, idx);
      const cardW = this._drawIndicatorCard(cx, cy, id, meta, state, val);
      cx += cardW + 8;
      if (cx > this.chartRight - 100) break; // stop if no room
    }
  }

  // Get formatted value for an indicator at a given candle index
  _getIndicatorValueAt(id, idx) {
    if (id === 'ma20' && this.indCache.ma20 && this.indCache.ma20[idx] !== null)
      return this.priceScale.formatLogical(this.indCache.ma20[idx]);
    if (id === 'ma50' && this.indCache.ma50 && this.indCache.ma50[idx] !== null)
      return this.priceScale.formatLogical(this.indCache.ma50[idx]);
    if (id === 'ma200' && this.indCache.ma200 && this.indCache.ma200[idx] !== null)
      return this.priceScale.formatLogical(this.indCache.ma200[idx]);
    if (id === 'ema20' && this.indCache.ema20 && this.indCache.ema20[idx] !== null)
      return this.priceScale.formatLogical(this.indCache.ema20[idx]);
    if (id === 'ema50' && this.indCache.ema50 && this.indCache.ema50[idx] !== null)
      return this.priceScale.formatLogical(this.indCache.ema50[idx]);
    if (id === 'bb' && this.indCache.bb && this.indCache.bb.mid && this.indCache.bb.mid[idx] !== null)
      return this.priceScale.formatLogical(this.indCache.bb.mid[idx]);
    if (id === 'volsma' && this.indCache.volsma && this.indCache.volsma[idx] !== null)
      return this._fmtVol(this.indCache.volsma[idx]);
    if (id === 'rsi' && this.indCache.rsi && this.indCache.rsi[idx] !== null)
      return this.indCache.rsi[idx].toFixed(2);
    if (id === 'macd' && this.indCache.macd && this.indCache.macd.macd && this.indCache.macd.macd[idx] !== null)
      return this.indCache.macd.macd[idx].toFixed(3);
    if (id === 'vprof') return 'VP';
    return '—';
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
    // Background (subtle, only when active)
    if (isActive) {
      ctx.fillStyle = 'rgba(42,46,57,0.6)';
      this._roundRect(x, y - 2, cardW, cardH + 2, 3);
      ctx.fill();
    }
    // Label (colored)
    ctx.fillStyle = isVisible ? color : THEME.textDim;
    ctx.fillText(labelTxt, x + padX, y);
    // Value
    ctx.fillStyle = isVisible ? THEME.text : THEME.textDim;
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
    ctx.strokeStyle = isHover ? THEME.textBright : THEME.textDim;
    ctx.fillStyle = isHover ? THEME.textBright : THEME.textDim;
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
    // Build default fields based on indicator type
    const meta = INDICATOR_LIST.find(i => i.id === id);
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
      title: meta ? meta.label : id,
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
    ctx.fillStyle = THEME.panelBg;
    this._roundRect(sc.x, sc.y, sc.w, sc.h, 6);
    ctx.fill();
    ctx.strokeStyle = THEME.toolbarBorder;
    ctx.lineWidth = 1;
    this._roundRect(sc.x + 0.5, sc.y + 0.5, sc.w - 1, sc.h - 1, 6);
    ctx.stroke();
    // Title bar
    ctx.fillStyle = THEME.toolbarBg;
    this._roundRect(sc.x, sc.y, sc.w, 28, 6);
    // Only round top corners — redraw bottom of title bar as straight
    ctx.fillRect(sc.x, sc.y + 20, sc.w, 8);
    ctx.fill();
    ctx.font = 'bold 12px -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.fillStyle = THEME.textBright;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(sc.title + ' Settings', sc.x + 10, sc.y + 14);
    // Close button (X)
    ctx.strokeStyle = THEME.textDim;
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
      ctx.fillStyle = THEME.text;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(f.label, sc.x + 10, fy + 8);
      // Input box
      const ix = sc.x + 90, iy = fy, iw = sc.w - 100, ih = 20;
      ctx.fillStyle = THEME.bg;
      this._roundRect(ix, iy, iw, ih, 3);
      ctx.fill();
      ctx.strokeStyle = THEME.toolbarBorder;
      this._roundRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1, 3);
      ctx.stroke();
      // Value text
      ctx.fillStyle = THEME.textBright;
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
    ctx.fillStyle = THEME.buttonBg;
    this._roundRect(sc.x + 10, btnY, 80, 24, 3);
    ctx.fill();
    ctx.strokeStyle = THEME.toolbarBorder;
    this._roundRect(sc.x + 10.5, btnY + 0.5, 79, 23, 3);
    ctx.stroke();
    ctx.fillStyle = THEME.text;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Cancel', sc.x + 50, btnY + 12);
    // Save
    ctx.fillStyle = THEME.accent;
    this._roundRect(sc.x + sc.w - 90, btnY, 80, 24, 3);
    ctx.fill();
    ctx.fillStyle = THEME.textBright;
    ctx.fillText('Save', sc.x + sc.w - 50, btnY + 12);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }

  /* --------------------------- Toolbar ----------------------------------- */
  drawToolbar() {
    const ctx = this.ctx;
    const isMobile = this.W < 600;
    let x = isMobile ? 4 : 8;
    const y = isMobile ? 5 : 7;
    const h = isMobile ? 30 : 30;
    const gap = isMobile ? 3 : 6;

    if (isMobile) {
      // Mobile: compact. Symbol + TF shown as static label (no dropdown).
      // Buttons: Indicators, Tool, Reset.
      const label = this.symbol.label + ' · ' + this.timeframe.label;
      ctx.font = 'bold 11px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = THEME.textBright;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(label, x, y + h / 2);
      x += ctx.measureText(label).width + gap + 4;
      x = this.drawButton({id:'ind', action:'indicator', x, y, w:36, h, label:'Ind', icon:'plus'});
      x += gap;
      const toolShort = TOOL_SHORTCUTS[this.activeTool] || '↖';
      x = this.drawButton({id:'tool', action:'tool', x, y, w:38, h, label:toolShort, icon:'caret'});
      x += gap;
      x = this.drawButton({id:'reset', action:'reset', x, y, w:36, h, label:'Rst', icon:null});
      // Right side: LIVE only
      const rightX = this.W - 4;
      ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = THEME.bull;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      ctx.fillText('● LIVE', rightX, y + h / 2);
    } else {
      // Desktop: Symbol + TF shown as static label (no dropdown).
      // Buttons: Indicators, Tool, Reset, Settings.
      const label = this.symbol.label + ' · ' + this.timeframe.label;
      ctx.font = 'bold 12px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.fillStyle = THEME.textBright;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillText(label, x, y + h / 2);
      x += ctx.measureText(label).width + gap + 8;
      x = this.drawButton({id:'ind', action:'indicator', x, y, w:110, h, label:'Indicators', icon:'plus'});
      x += gap;
      const toolLabel = DRAW_TOOLS.find(t => t.id === this.activeTool).label;
      x = this.drawButton({id:'tool', action:'tool', x, y, w:130, h, label:toolLabel, icon:'caret'});
      x += gap;
      x = this.drawButton({id:'reset', action:'reset', x, y, w:60, h, label:'Reset', icon:null});
      x += gap;
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
    const isMobile = this.W < 600;
    const y = this.H - this.layout.statusH;
    const last = this.sim.candles[this.sim.candles.length - 1];
    if (!last) return;
    ctx.font = (isMobile ? '10px' : '11px') + ' -apple-system, Segoe UI, Roboto, sans-serif';
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let x = isMobile ? 6 : 10;
    const gap = isMobile ? 10 : 16;
    const draw = (label, value, color) => {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(label, x, y + this.layout.statusH / 2);
      x += ctx.measureText(label).width + 4;
      ctx.fillStyle = color || THEME.text;
      ctx.fillText(value, x, y + this.layout.statusH / 2);
      x += ctx.measureText(value).width + gap;
    };
    if (isMobile) {
      // Compact status bar: only Bid, 24h High, 24h Vol
      draw('B', this.priceScale.formatLogical(last.close), THEME.bear);
      const last24 = this.sim.candles.slice(-24);
      draw('H', this.priceScale.formatLogical(last24.reduce((m, c) => Math.max(m, c.high), 0)));
      draw('Vol', this._fmtVol(last24.reduce((s, c) => s + c.volume, 0)));
    } else {
      draw('Bid', this.priceScale.formatLogical(last.close - 0.5), THEME.bear);
      draw('Ask', this.priceScale.formatLogical(last.close + 0.5), THEME.bull);
      draw('Spread', this.priceScale.formatLogical(0.5 * 2));
      const last24 = this.sim.candles.slice(-24);
      draw('24h High', this.priceScale.formatLogical(last24.reduce((m, c) => Math.max(m, c.high), 0)));
      draw('24h Low', this.priceScale.formatLogical(last24.reduce((m, c) => Math.min(m, c.low), Infinity)));
      draw('24h Vol', this._fmtVol(last24.reduce((s, c) => s + c.volume, 0)));
    }
    ctx.textAlign = 'right';
    ctx.fillStyle = THEME.textDim;
    if (isMobile) {
      const toolShort = TOOL_SHORTCUTS[this.activeTool] || '↖';
      ctx.fillText(toolShort, this.W - 6, y + this.layout.statusH / 2);
    } else {
      const toolTxt = 'Tool: ' + DRAW_TOOLS.find(t => t.id === this.activeTool).label;
      ctx.fillText(toolTxt, this.W - 10, y + this.layout.statusH / 2);
      if (this.drawings.length > 0) {
        ctx.fillStyle = THEME.accent;
        ctx.fillText(this.drawings.length + ' drawings', this.W - 10 - ctx.measureText(toolTxt).width - 16, y + this.layout.statusH / 2);
      }
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
