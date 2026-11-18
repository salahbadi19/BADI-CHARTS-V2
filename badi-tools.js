/* =============================================================================
 * badi-tools.js — BADI-CHARTS-V2 Drawing Tools Library v1.0.0
 *
 * 50+ professional drawing tools for the BADI-CHARTS-V2 charting library
 * (chart-webgl.js). Provides Lines, Fibonacci, Shapes, Gann, Elliott Wave,
 * Text, Prediction, and Measurement tool categories — each with full
 * onStart / onUpdate / onDraw / onHitTest / settings / onApplySettings hooks,
 * a Shift-to-snap OHLC system, and a floating settings panel overlay.
 *
 * Usage:
 *   <canvas id="chart"></canvas>
 *   <script src="chart-webgl.js"></script>
 *   <script src="badi-tools.js"></script>
 *   <script>
 *     const chart = new BadiCharts(document.getElementById('chart'), {...});
 *     BadiTools.attach(chart);          // registers all 51 tools
 *     chart.setTool('trend');           // activate the Trend Line tool
 *     // Shift + drag → snaps to nearest OHLC of the candle under the cursor
 *     // Click a finished drawing → select it → BadiTools.openSettings(chart, d)
 *   </script>
 *
 * Each drawing stores chart coordinates (index + price) as the source of
 * truth and recomputes canvas pixel positions every frame via
 * helpers.indexToX / helpers.priceToY — so drawings survive pan/zoom/resize.
 *
 * Requirements: chart-webgl.js loaded first (provides BadiCharts + the
 * addDrawingTool / setTool / drawings / selectedDrawing / invalidate /
 * showToast API surface this library builds on).
 * ========================================================================== */
(function () {
'use strict';

var VERSION = '1.0.0';

/* =========================================================================
 * 1. UTILITIES
 * ========================================================================= */

/** Euclidean distance between two points. */
function dist(x1, y1, x2, y2) {
  var dx = x2 - x1, dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Perpendicular distance from point (px,py) to segment (x1,y1)-(x2,y2). */
function distToSegment(px, py, x1, y1, x2, y2) {
  var dx = x2 - x1, dy = y2 - y1;
  var len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
  var t = ((px - x1) * dx + (py - y1) * dy) / len2;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  var cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy));
}

/** Clamp a value into [min, max]. */
function clamp(v, mn, mx) {
  if (mn !== undefined && v < mn) return mn;
  if (mx !== undefined && v > mx) return mx;
  return v;
}

/** Format a price for on-canvas labels (adaptive precision). */
function formatPrice(p) {
  if (p == null || !isFinite(p)) return '—';
  var abs = Math.abs(p);
  if (abs >= 1000) return p.toFixed(2);
  if (abs >= 1)    return p.toFixed(4);
  if (abs >= 0.01) return p.toFixed(6);
  return p.toFixed(8);
}

/** Snap an angle (radians) to the nearest of N divisions over 180°. */
function snapAngle(angle, steps) {
  var step = Math.PI / steps;
  return Math.round(angle / step) * step;
}

/** Linear interpolation. */
function lerp(a, b, t) { return a + (b - a) * t; }

/** Convert #rrggbb / #rgb + alpha to an rgba() string. */
function hexToRgba(hex, alpha) {
  if (!hex || typeof hex !== 'string') return 'rgba(41,98,255,' + alpha + ')';
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return 'rgba(41,98,255,' + alpha + ')';
  var r = parseInt(h.substr(0, 2), 16) || 0;
  var g = parseInt(h.substr(2, 2), 16) || 0;
  var b = parseInt(h.substr(4, 2), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

/* =========================================================================
 * 2. DRAWING HELPERS (shared by all tool renderers)
 * ========================================================================= */

/** Apply color / lineWidth / lineStyle / opacity from a drawing onto a ctx. */
function applyStroke(ctx, d) {
  ctx.globalAlpha = (d.opacity != null) ? d.opacity : 1;
  ctx.strokeStyle = d.color || '#2962ff';
  ctx.lineWidth = d.lineWidth || 1.5;
  var ls = d.lineStyle;
  if (ls === 'dashed')      ctx.setLineDash([6, 4]);
  else if (ls === 'dotted') ctx.setLineDash([2, 3]);
  else                      ctx.setLineDash([]);
}

/** Draw a filled endpoint dot. */
function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r || 3, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Extend a line segment to the chart edges (for ray / extended-line tools).
 * Returns {x1,y1,x2,y2} with the requested sides pushed to chartLeft/Right.
 */
function extendEndpoints(x1, y1, x2, y2, left, right, chartLeft, chartRight) {
  var dx = x2 - x1, dy = y2 - y1;
  var nx1 = x1, ny1 = y1, nx2 = x2, ny2 = y2;
  if (left) {
    if (Math.abs(dx) > 1e-6) {
      var tl = (chartLeft - x1) / dx;
      nx1 = chartLeft; ny1 = y1 + dy * tl;
    }
  }
  if (right) {
    if (Math.abs(dx) > 1e-6) {
      var tr = (chartRight - x1) / dx;
      nx2 = chartRight; ny2 = y1 + dy * tr;
    }
  }
  return { x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
}

/** Fill a small rounded-rect price label (right-edge pill). */
function drawPriceLabel(ctx, xRight, y, text, color, theme) {
  ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  var tw = ctx.measureText(text).width + 8;
  var lx = xRight - tw - 2;
  ctx.fillStyle = color;
  if (ctx.roundRect) {
    ctx.beginPath(); ctx.roundRect(lx, Math.floor(y) - 7, tw, 14, 3); ctx.fill();
  } else {
    ctx.fillRect(lx, Math.floor(y) - 7, tw, 14);
  }
  ctx.fillStyle = (theme && theme.bg) || '#1e222d';
  ctx.fillText(text, xRight - 4, Math.floor(y));
  ctx.textAlign = 'left';
}

/** Apply each setting's default onto a drawing object (only if missing). */
function applyDefaults(d, settings) {
  if (!settings) return;
  for (var i = 0; i < settings.length; i++) {
    var s = settings[i];
    if (d[s.key] === undefined && s.default !== undefined) {
      d[s.key] = s.default;
    }
  }
}

/* =========================================================================
 * 3. SHARED SETTING-SET BUILDERS
 * ========================================================================= */

/** Common stroke settings: color + width + style + opacity. */
function baseSettings(def) {
  def = def || {};
  return [
    { key: 'color',      label: 'Color',      type: 'color',  default: def.color || '#2962ff' },
    { key: 'lineWidth',  label: 'Width',      type: 'number', default: def.lineWidth || 1.5, min: 0.5, max: 10, step: 0.5 },
    { key: 'lineStyle',  label: 'Style',      type: 'select', default: def.lineStyle || 'solid', options: ['solid', 'dashed', 'dotted'] },
    { key: 'opacity',    label: 'Opacity',    type: 'number', default: def.opacity != null ? def.opacity : 1, min: 0, max: 1, step: 0.05 }
  ];
}

/** Extend-left / extend-right toggles (for line-style tools). */
function extendSettings() {
  return [
    { key: 'extendLeft',  label: 'Extend Left',  type: 'boolean', default: false },
    { key: 'extendRight', label: 'Extend Right', type: 'boolean', default: false }
  ];
}

/** Fill color + fill opacity (for shape tools). */
function fillSettings(def) {
  def = def || {};
  return [
    { key: 'fillColor',    label: 'Fill Color',    type: 'color',  default: def.fillColor || '#2962ff' },
    { key: 'fillOpacity',  label: 'Fill Opacity',  type: 'number', default: def.fillOpacity != null ? def.fillOpacity : 0.15, min: 0, max: 1, step: 0.05 }
  ];
}

/** Text content + font size settings (for text/note/label tools). */
function textSettings(def) {
  def = def || {};
  return [
    { key: 'text',     label: 'Text',     type: 'text',   default: def.text || 'Note' },
    { key: 'fontSize', label: 'Font Size',type: 'number', default: def.fontSize || 12, min: 8, max: 48, step: 1 }
  ];
}

/* =========================================================================
 * 4. DRAWING-OBJECT INITIALIZERS
 * ========================================================================= */

/** Build a 2-point drawing object from a start ctx. */
function twoPointInit(ctx, type, settings) {
  var d = {
    type: type,
    id: Date.now(),
    i1: ctx.idx, p1: ctx.price, i2: ctx.idx, p2: ctx.price,
    x1: ctx.x, y1: ctx.y, x2: ctx.x, y2: ctx.y
  };
  applyDefaults(d, settings);
  return d;
}

/** Build a 1-point (index + price) drawing object from a start ctx. */
function onePointInit(ctx, type, settings) {
  var d = {
    type: type,
    id: Date.now(),
    i: ctx.idx, p: ctx.price,
    x: ctx.x, y: ctx.y
  };
  applyDefaults(d, settings);
  return d;
}

/** Build a price-only drawing object (horizontal line). */
function priceInit(ctx, type, settings) {
  var d = {
    type: type,
    id: Date.now(),
    price: ctx.price
  };
  applyDefaults(d, settings);
  return d;
}

/** Build an index-only drawing object (vertical line). */
function indexInit(ctx, type, settings) {
  var d = {
    type: type,
    id: Date.now(),
    index: ctx.idx
  };
  applyDefaults(d, settings);
  return d;
}

/* =========================================================================
 * 5. SHIFT-TO-SNAP SYSTEM
 * ========================================================================= */

var SNAP_RANGE_PX = 14;        // max px distance from an OHLC level to snap
var snapMomentary = false;     // true while Shift is held
var attachedCharts = [];       // charts registered via BadiTools.attach()

/** Is snapping active (persistent OR momentary Shift)? */
function isSnapOn(chart) {
  return snapMomentary || !!(chart && chart._badiSnapEnabled);
}

/**
 * Snap a ctx to the nearest of {open, high, low, close} of the candle at
 * round(xToIndex(x)). Returns a new ctx object (or the original if no snap).
 */
function snapPoint(ctx, chart) {
  if (!isSnapOn(chart)) return ctx;
  if (!chart || !chart.sim || !chart.sim.candles) return ctx;
  if (typeof chart.xToIndex !== 'function' || typeof chart.priceToY !== 'function') return ctx;
  var ri;
  try { ri = Math.round(chart.xToIndex(ctx.x)); }
  catch (e) { return ctx; }
  if (ri < 0 || ri >= chart.sim.candles.length) return ctx;
  var c = chart.sim.candles[ri];
  if (!c) return ctx;
  var cands = [
    { y: chart.priceToY(c.open),  price: c.open  },
    { y: chart.priceToY(c.high),  price: c.high  },
    { y: chart.priceToY(c.low),   price: c.low   },
    { y: chart.priceToY(c.close), price: c.close }
  ];
  var best = cands[0], bd = Math.abs(ctx.y - cands[0].y);
  for (var i = 1; i < cands.length; i++) {
    var dd = Math.abs(ctx.y - cands[i].y);
    if (dd < bd) { bd = dd; best = cands[i]; }
  }
  if (bd > SNAP_RANGE_PX) return ctx;
  return { x: ctx.x, y: best.y, idx: ri, price: best.price, snapped: true };
}

/** Wire Shift keydown/keyup → snapMomentary + chart._badiToolsSync flag. */
function setupSnapListener() {
  if (typeof document === 'undefined') return;
  var lastState = false;
  function setSnap(state) {
    if (state === lastState) return;
    lastState = state;
    snapMomentary = state;
    for (var i = 0; i < attachedCharts.length; i++) {
      try { attachedCharts[i]._badiToolsSnap = state; } catch (e) {}
    }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      setSnap(true);
    }
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      setSnap(false);
    }
  });
  // Also reset on blur (e.g. alt-tab while Shift held)
  window.addEventListener('blur', function () { setSnap(false); });
}

/* =========================================================================
 * 6. GENERIC TOOL-FACTORIES
 *
 * Each factory is `function (chart) → tool-object`. The chart reference is
 * captured in the closure so onUpdate / onStart can reach chart.xToIndex /
 * chart.priceToY / chart.drawings (for snap + eraser). BadiTools.attach(chart)
 * invokes every factory with that chart.
 * ========================================================================= */

/**
 * Build a 2-point tool. `meta` carries id/label/icon/category/defaultStyle/
 * settings (+ optional onFinish). `drawFn(ctx, d, h)` renders; `hitFn(d,x,y,h)`
 * hit-tests.
 */
function makeTwoPointTool(meta, drawFn, hitFn) {
  return function (chart) {
    return {
      id: meta.id,
      label: meta.label,
      icon: meta.icon,
      category: meta.category,
      defaultStyle: meta.defaultStyle,
      settings: meta.settings,
      onStart: function (ctx) {
        var d = twoPointInit(ctx, meta.id, meta.settings);
        if (meta.postStart) meta.postStart(d, ctx);
        return d;
      },
      onUpdate: function (d, ctx) {
        var sp = snapPoint(ctx, chart);
        d.i2 = sp.idx; d.p2 = sp.price; d.x2 = sp.x; d.y2 = sp.y;
        if (meta.postUpdate) meta.postUpdate(d, sp);
      },
      onDraw: drawFn,
      onHitTest: hitFn,
      onFinish: meta.onFinish,
      onApplySettings: function (d, settings) { if (settings) Object.assign(d, settings); }
    };
  };
}

/** Build a 1-point (index + price) tool. */
function makeOnePointTool(meta, drawFn, hitFn) {
  return function (chart) {
    return {
      id: meta.id,
      label: meta.label,
      icon: meta.icon,
      category: meta.category,
      defaultStyle: meta.defaultStyle,
      settings: meta.settings,
      onStart: function (ctx) {
        var d = onePointInit(ctx, meta.id, meta.settings);
        if (meta.postStart) meta.postStart(d, ctx);
        return d;
      },
      onUpdate: function (d, ctx) {
        var sp = snapPoint(ctx, chart);
        d.i = sp.idx; d.p = sp.price; d.x = sp.x; d.y = sp.y;
        if (meta.postUpdate) meta.postUpdate(d, sp);
      },
      onDraw: drawFn,
      onHitTest: hitFn,
      onFinish: meta.onFinish,
      onApplySettings: function (d, settings) { if (settings) Object.assign(d, settings); }
    };
  };
}

/** Hit-test a 2-point line segment with tolerance. */
function hitLine(d, x, y, h) {
  var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
  var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
  return distToSegment(x, y, x1, y1, x2, y2) < 6;
}

/** Hit-test an axis-aligned rectangle defined by 2 points. */
function hitRect(d, x, y, h) {
  var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
  var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
  var xl = Math.min(x1, x2), xr = Math.max(x1, x2);
  var yt = Math.min(y1, y2), yb = Math.max(y1, y2);
  return x >= xl - 4 && x <= xr + 4 && y >= yt - 4 && y <= yb + 4;
}

/* =========================================================================
 * 7. TOOL DEFINITIONS — LINES (8)
 * ========================================================================= */

/* 1. Trend Line -------------------------------------------------------- */
var trendTool = makeTwoPointTool(
  {
    id: 'trend',
    label: 'Trend Line',
    icon: '╱',
    category: 'Lines',
    defaultStyle: { color: '#2962ff', lineWidth: 1.5, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings().concat(extendSettings())
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    ctx.save();
    applyStroke(ctx, d);
    var ex = extendEndpoints(x1, y1, x2, y2, d.extendLeft, d.extendRight, h.chartLeft, h.chartRight);
    ctx.beginPath();
    ctx.moveTo(ex.x1, ex.y1);
    ctx.lineTo(ex.x2, ex.y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    if (!d.extendLeft)  dot(ctx, x1, y1, 3);
    if (!d.extendRight) dot(ctx, x2, y2, 3);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    // hit-test against the (possibly extended) infinite line, tolerance 6
    var dx = x2 - x1, dy = y2 - y1;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return dist(x, y, x1, y1) < 6;
    var t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    // restrict to segment unless extended
    if (!d.extendLeft && t < 0) t = 0;
    if (!d.extendRight && t > 1) t = 1;
    var cx = x1 + t * dx, cy = y1 + t * dy;
    return dist(x, y, cx, cy) < 6;
  }
);

/* 2. Horizontal Line --------------------------------------------------- */
var hlineTool = makeOnePointTool(
  {
    id: 'hline',
    label: 'Horizontal Line',
    icon: '─',
    category: 'Lines',
    defaultStyle: { color: '#2962ff', lineWidth: 1.5, lineStyle: 'dashed', opacity: 1 },
    settings: baseSettings({ lineStyle: 'dashed' })
  },
  function (ctx, d, h) {
    var y = h.priceToY(d.p);
    ctx.save();
    applyStroke(ctx, d);
    ctx.beginPath();
    ctx.moveTo(h.chartLeft, y);
    ctx.lineTo(h.chartRight, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    drawPriceLabel(ctx, h.chartRight, y, formatPrice(d.p), d.color || '#2962ff', h.THEME);
    ctx.restore();
  },
  function (d, x, y, h) {
    var yy = h.priceToY(d.p);
    return Math.abs(y - yy) < 6 && x >= h.chartLeft - 4 && x <= h.chartRight + 30;
  }
);

/* 3. Vertical Line ----------------------------------------------------- */
var vlineTool = makeOnePointTool(
  {
    id: 'vline',
    label: 'Vertical Line',
    icon: '│',
    category: 'Lines',
    defaultStyle: { color: '#2962ff', lineWidth: 1.5, lineStyle: 'dashed', opacity: 1 },
    settings: baseSettings({ lineStyle: 'dashed' })
  },
  function (ctx, d, h) {
    var x = h.indexToX(d.i);
    ctx.save();
    applyStroke(ctx, d);
    ctx.beginPath();
    ctx.moveTo(x, h.chartTop);
    ctx.lineTo(x, h.chartBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },
  function (d, x, y, h) {
    var xx = h.indexToX(d.i);
    return Math.abs(x - xx) < 6 && y >= h.chartTop - 4 && y <= h.chartBottom + 4;
  }
);

/* 4. Ray --------------------------------------------------------------- */
var rayTool = makeTwoPointTool(
  {
    id: 'ray',
    label: 'Ray',
    icon: '→',
    category: 'Lines',
    defaultStyle: { color: '#2962ff', lineWidth: 1.5, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings()
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    ctx.save();
    applyStroke(ctx, d);
    var dx = x2 - x1, dy = y2 - y1;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    if (Math.abs(dx) < 1e-6) {
      ctx.lineTo(x2, h.chartBottom);
    } else {
      var t = (h.chartRight - x1) / dx;
      ctx.lineTo(h.chartRight, y1 + dy * t);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    dot(ctx, x1, y1, 3);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var dx = x2 - x1, dy = y2 - y1;
    if (Math.abs(dx) < 1e-6) return Math.abs(x - x1) < 6 && y >= y1;
    var t = (x - x1) / dx;
    if (t < 0) return dist(x, y, x1, y1) < 6;
    var cy = y1 + dy * t;
    return Math.abs(y - cy) < 6;
  }
);

/* 5. Extended Line (both directions) ----------------------------------- */
var extendedTool = makeTwoPointTool(
  {
    id: 'extended',
    label: 'Extended Line',
    icon: '↔',
    category: 'Lines',
    defaultStyle: { color: '#2962ff', lineWidth: 1.5, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings()
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    ctx.save();
    applyStroke(ctx, d);
    var ex = extendEndpoints(x1, y1, x2, y2, true, true, h.chartLeft, h.chartRight);
    ctx.beginPath();
    ctx.moveTo(ex.x1, ex.y1);
    ctx.lineTo(ex.x2, ex.y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    dot(ctx, x1, y1, 3);
    dot(ctx, x2, y2, 3);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var dx = x2 - x1, dy = y2 - y1;
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return dist(x, y, x1, y1) < 6;
    var t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy);
    var cx = x1 + t * dx, cy = y1 + t * dy;
    return dist(x, y, cx, cy) < 6;
  }
);

/* 6. Parallel Channel (3 derived points) ------------------------------- */
var channelTool = makeTwoPointTool(
  {
    id: 'channel',
    label: 'Parallel Channel',
    icon: '╫',
    category: 'Lines',
    defaultStyle: { color: '#2962ff', lineWidth: 1.5, lineStyle: 'solid', opacity: 1, fillColor: '#2962ff', fillOpacity: 0.08 },
    settings: baseSettings().concat(fillSettings())
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    // Channel width = vertical distance between p1 and p2 (the user drags
    // the channel's height by separating p1/p2). Parallel line is offset
    // by the same dy applied to both endpoints.
    var offY = y2 - y1;
    var y1b = y1 + offY, y2b = y2 + offY;
    ctx.save();
    // Fill between
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.08);
    ctx.fillStyle = d.fillColor || d.color || '#2962ff';
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineTo(x2, y2b); ctx.lineTo(x1, y1b); ctx.closePath();
    ctx.fill();
    // Main line
    applyStroke(ctx, d);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.stroke();
    // Parallel line (dashed)
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, y1b); ctx.lineTo(x2, y2b);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    dot(ctx, x1, y1, 3); dot(ctx, x2, y2, 3);
    dot(ctx, x1, y1b, 3); dot(ctx, x2, y2b, 3);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var offY = y2 - y1;
    return distToSegment(x, y, x1, y1, x2, y2) < 6 ||
           distToSegment(x, y, x1, y1 + offY, x2, y2 + offY) < 6;
  }
);

/* 7. Arrow Line -------------------------------------------------------- */
var arrowLineTool = makeTwoPointTool(
  {
    id: 'arrow-line',
    label: 'Arrow Line',
    icon: '→',
    category: 'Lines',
    defaultStyle: { color: '#2962ff', lineWidth: 1.5, lineStyle: 'solid', opacity: 1, arrowSize: 12 },
    settings: baseSettings().concat([
      { key: 'arrowSize', label: 'Arrow Size', type: 'number', default: 12, min: 4, max: 30, step: 1 }
    ])
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    ctx.save();
    applyStroke(ctx, d);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Arrowhead at (x2,y2)
    var ang = Math.atan2(y2 - y1, x2 - x1);
    var hl = d.arrowSize || 12;
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1);
    ctx.fillStyle = d.color || '#2962ff';
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hl * Math.cos(ang - Math.PI / 6), y2 - hl * Math.sin(ang - Math.PI / 6));
    ctx.lineTo(x2 - hl * Math.cos(ang + Math.PI / 6), y2 - hl * Math.sin(ang + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    dot(ctx, x1, y1, 3);
    ctx.restore();
  },
  hitLine
);

/* 8. Freehand Brush (uses built-in 'brush' type for vertex-adding) ----- */
var brushTool = function (chart) {
  return {
    id: 'brush',
    label: 'Freehand Brush',
    icon: '〜',
    category: 'Lines',
    defaultStyle: { color: '#2962ff', lineWidth: 2, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings({ lineWidth: 2 }),
    onStart: function (ctx) {
      var d = {
        type: 'brush',
        id: Date.now(),
        points: [{ i: ctx.idx, p: ctx.price, x: ctx.x, y: ctx.y }]
      };
      applyDefaults(d, baseSettings({ lineWidth: 2 }));
      return d;
    },
    onUpdate: function (d, ctx) {
      var sp = snapPoint(ctx, chart);
      var pts = d.points;
      var last = pts.length ? pts[pts.length - 1] : null;
      if (!last || dist(sp.x, sp.y, last.x, last.y) > 1.5) {
        pts.push({ i: sp.idx, p: sp.price, x: sp.x, y: sp.y });
      } else if (last) {
        last.i = sp.idx; last.p = sp.price; last.x = sp.x; last.y = sp.y;
      }
    },
    onDraw: function (ctx, d, h) {
      if (!d.points || d.points.length < 1) return;
      ctx.save();
      applyStroke(ctx, d);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var i = 0; i < d.points.length; i++) {
        var pt = d.points[i];
        var x = h.indexToX(pt.i), y = h.priceToY(pt.p);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    },
    onHitTest: function (d, x, y, h) {
      if (!d.points || d.points.length < 1) return false;
      for (var i = 0; i < d.points.length - 1; i++) {
        var x1 = h.indexToX(d.points[i].i),     y1 = h.priceToY(d.points[i].p);
        var x2 = h.indexToX(d.points[i + 1].i), y2 = h.priceToY(d.points[i + 1].p);
        if (distToSegment(x, y, x1, y1, x2, y2) < 6) return true;
      }
      return false;
    },
    onApplySettings: function (d, settings) { if (settings) Object.assign(d, settings); }
  };
};

/* =========================================================================
 * 8. TOOL DEFINITIONS — FIBONACCI (7)
 * ========================================================================= */

var FIB_RETRACEMENT_LEVELS  = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.618];
var FIB_EXTENSION_LEVELS    = [0, 0.618, 1, 1.618, 2.618];
var FIB_FAN_LEVELS           = [0.382, 0.5, 0.618, 1];
var FIB_COLORS               = ['#787b86', '#ef5350', '#ff9800', '#26a69a', '#2962ff', '#9c27b0', '#ef5350', '#26a69a'];

function fibLevelSettings() {
  return baseSettings({ lineStyle: 'dashed' });
}

function drawFibLevels(ctx, d, h, levels, colors, labelFmt) {
  var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
  var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
  var xL = Math.min(x1, x2), xR = Math.max(x1, x2);
  ctx.save();
  ctx.font = '10px -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  for (var i = 0; i < levels.length; i++) {
    var lv = levels[i];
    var y = y1 + (y2 - y1) * lv;
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1);
    ctx.strokeStyle = colors[i % colors.length];
    ctx.lineWidth = d.lineWidth || 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(xL, y);
    ctx.lineTo(xR, y);
    ctx.stroke();
    ctx.setLineDash([]);
    var price = d.p1 + (d.p2 - d.p1) * lv;
    var txt = labelFmt(lv, price);
    var tw = ctx.measureText(txt).width + 6;
    var lx = Math.min(xR, h.chartRight) - tw - 2;
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(lx, Math.floor(y) - 7, tw, 14);
    ctx.fillStyle = (h.THEME && h.THEME.bg) || '#1e222d';
    ctx.fillText(txt, Math.min(xR, h.chartRight) - 4, Math.floor(y));
  }
  ctx.textAlign = 'left';
  ctx.setLineDash([]);
  ctx.restore();
}

/* 9. Fib Retracement --------------------------------------------------- */
var fibRetracementTool = makeTwoPointTool(
  {
    id: 'fib-retracement',
    label: 'Fib Retracement',
    icon: 'F',
    category: 'Fibonacci',
    defaultStyle: { color: '#787b86', lineWidth: 1, lineStyle: 'dashed', opacity: 1 },
    settings: fibLevelSettings()
  },
  function (ctx, d, h) {
    drawFibLevels(ctx, d, h, FIB_RETRACEMENT_LEVELS, FIB_COLORS,
      function (lv, p) { return (lv * 100).toFixed(1) + '% ' + formatPrice(p); });
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var xL = Math.min(x1, x2), xR = Math.max(x1, x2);
    if (x < xL - 4 || x > xR + 4) return false;
    for (var i = 0; i < FIB_RETRACEMENT_LEVELS.length; i++) {
      var yy = y1 + (y2 - y1) * FIB_RETRACEMENT_LEVELS[i];
      if (Math.abs(y - yy) < 6) return true;
    }
    return false;
  }
);

/* 10. Fib Extension ---------------------------------------------------- */
var fibExtensionTool = makeTwoPointTool(
  {
    id: 'fib-extension',
    label: 'Fib Extension',
    icon: 'F↑',
    category: 'Fibonacci',
    defaultStyle: { color: '#9c27b0', lineWidth: 1, lineStyle: 'dashed', opacity: 1 },
    settings: fibLevelSettings()
  },
  function (ctx, d, h) {
    drawFibLevels(ctx, d, h, FIB_EXTENSION_LEVELS, FIB_COLORS,
      function (lv, p) { return 'Ext ' + (lv * 100).toFixed(1) + '% ' + formatPrice(p); });
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    if (x < Math.min(x1, x2) - 4 || x > Math.max(x1, x2) + 4) return false;
    for (var i = 0; i < FIB_EXTENSION_LEVELS.length; i++) {
      var yy = y1 + (y2 - y1) * FIB_EXTENSION_LEVELS[i];
      if (Math.abs(y - yy) < 6) return true;
    }
    return false;
  }
);

/* 11. Fib Fan ---------------------------------------------------------- */
var fibFanTool = makeTwoPointTool(
  {
    id: 'fib-fan',
    label: 'Fib Fan',
    icon: 'F╱',
    category: 'Fibonacci',
    defaultStyle: { color: '#26a69a', lineWidth: 1, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings()
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var dx = x2 - x1, dy = y2 - y1;
    ctx.save();
    applyStroke(ctx, d);
    for (var i = 0; i < FIB_FAN_LEVELS.length; i++) {
      var lv = FIB_FAN_LEVELS[i];
      // fan line from (x1,y1) at fraction lv of the trend slope
      var ex = x1 + dx, ey = y1 + dy * lv;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      // extend to chart right
      if (Math.abs(ex - x1) > 1e-6) {
        var t = (h.chartRight - x1) / (ex - x1);
        ctx.lineTo(h.chartRight, y1 + (ey - y1) * t);
      } else {
        ctx.lineTo(x1, h.chartBottom);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    dot(ctx, x1, y1, 3);
    dot(ctx, x2, y2, 3);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var dx = x2 - x1, dy = y2 - y1;
    for (var i = 0; i < FIB_FAN_LEVELS.length; i++) {
      var ex = x1 + dx, ey = y1 + dy * FIB_FAN_LEVELS[i];
      if (Math.abs(ex - x1) > 1e-6) {
        var t = (h.chartRight - x1) / (ex - x1);
        var cyEnd = y1 + (ey - y1) * t;
        if (distToSegment(x, y, x1, y1, h.chartRight, cyEnd) < 6) return true;
      }
    }
    return false;
  }
);

/* 12. Fib Arc ---------------------------------------------------------- */
var fibArcTool = makeTwoPointTool(
  {
    id: 'fib-arc',
    label: 'Fib Arc',
    icon: 'F◐',
    category: 'Fibonacci',
    defaultStyle: { color: '#ff9800', lineWidth: 1, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings()
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var r = dist(x1, y1, x2, y2);
    ctx.save();
    applyStroke(ctx, d);
    for (var i = 0; i < FIB_RETRACEMENT_LEVELS.length; i++) {
      var rr = r * FIB_RETRACEMENT_LEVELS[i];
      if (rr < 1) continue;
      ctx.beginPath();
      ctx.arc(x1, y1, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    dot(ctx, x1, y1, 3);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var r0 = dist(x1, y1, x2, y2);
    var dr = dist(x, y, x1, y1);
    for (var i = 0; i < FIB_RETRACEMENT_LEVELS.length; i++) {
      var rr = r0 * FIB_RETRACEMENT_LEVELS[i];
      if (Math.abs(dr - rr) < 6) return true;
    }
    return false;
  }
);

/* 13. Fib Time Zone ---------------------------------------------------- */
var fibTimezoneTool = makeTwoPointTool(
  {
    id: 'fib-timezone',
    label: 'Fib Time Zone',
    icon: 'F│',
    category: 'Fibonacci',
    defaultStyle: { color: '#9c27b0', lineWidth: 1, lineStyle: 'dashed', opacity: 1 },
    settings: baseSettings({ lineStyle: 'dashed' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var step = Math.abs(x2 - x1);
    if (step < 1) step = 1;
    ctx.save();
    applyStroke(ctx, d);
    ctx.font = '10px sans-serif';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    for (var i = 1; i <= 8; i++) {
      var xv = x1 + step * FIB_RETRACEMENT_LEVELS[i % FIB_RETRACEMENT_LEVELS.length] * (i <= 7 ? 1 : 1.618);
      // simpler: vertical lines at fib multiples of the base span
      xv = x1 + step * (i <= 7 ? FIB_RETRACEMENT_LEVELS[i] : 1.618);
      if (xv < h.chartLeft || xv > h.chartRight) continue;
      ctx.beginPath();
      ctx.moveTo(xv, h.chartTop);
      ctx.lineTo(xv, h.chartBottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var step = Math.abs(x2 - x1) || 1;
    for (var i = 1; i <= 8; i++) {
      var xv = x1 + step * (i <= 7 ? FIB_RETRACEMENT_LEVELS[i] : 1.618);
      if (Math.abs(x - xv) < 6) return true;
    }
    return false;
  }
);

/* 14. Fib Speed Resistance --------------------------------------------- */
var fibSpeedTool = makeTwoPointTool(
  {
    id: 'fib-speed',
    label: 'Fib Speed Resistance',
    icon: 'F»',
    category: 'Fibonacci',
    defaultStyle: { color: '#ef5350', lineWidth: 1, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings()
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var dx = x2 - x1, dy = y2 - y1;
    var speeds = [0.25, 0.333, 0.5, 0.666, 0.75];
    ctx.save();
    applyStroke(ctx, d);
    for (var i = 0; i < speeds.length; i++) {
      var s = speeds[i];
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      if (Math.abs(dx) > 1e-6) {
        var t = (h.chartRight - x1) / dx;
        ctx.lineTo(h.chartRight, y1 + dy * s * t);
      } else {
        ctx.lineTo(x1, h.chartBottom);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    dot(ctx, x1, y1, 3);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var dx = x2 - x1, dy = y2 - y1;
    var speeds = [0.25, 0.333, 0.5, 0.666, 0.75];
    for (var i = 0; i < speeds.length; i++) {
      if (Math.abs(dx) > 1e-6) {
        var t = (h.chartRight - x1) / dx;
        var cyEnd = y1 + dy * speeds[i] * t;
        if (distToSegment(x, y, x1, y1, h.chartRight, cyEnd) < 6) return true;
      }
    }
    return false;
  }
);

/* 15. Fib Circle ------------------------------------------------------- */
var fibCircleTool = makeTwoPointTool(
  {
    id: 'fib-circle',
    label: 'Fib Circle',
    icon: 'F◯',
    category: 'Fibonacci',
    defaultStyle: { color: '#2962ff', lineWidth: 1, lineStyle: 'solid', opacity: 1, fillColor: '#2962ff', fillOpacity: 0.06 },
    settings: baseSettings().concat(fillSettings())
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var r = dist(x1, y1, x2, y2);
    ctx.save();
    applyStroke(ctx, d);
    for (var i = 0; i < FIB_RETRACEMENT_LEVELS.length; i++) {
      var rr = r * FIB_RETRACEMENT_LEVELS[i];
      if (rr < 1) continue;
      if (i === 0) {
        ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.06);
        ctx.fillStyle = d.fillColor || d.color || '#2962ff';
        ctx.beginPath(); ctx.arc(x1, y1, rr, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = (d.opacity != null ? d.opacity : 1);
      }
      ctx.beginPath();
      ctx.arc(x1, y1, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var r0 = dist(x1, y1, x2, y2);
    var dr = dist(x, y, x1, y1);
    for (var i = 0; i < FIB_RETRACEMENT_LEVELS.length; i++) {
      var rr = r0 * FIB_RETRACEMENT_LEVELS[i];
      if (Math.abs(dr - rr) < 6) return true;
    }
    return false;
  }
);

/* =========================================================================
 * 9. TOOL DEFINITIONS — SHAPES (8)
 * ========================================================================= */

/* 16. Rectangle -------------------------------------------------------- */
var rectangleTool = makeTwoPointTool(
  {
    id: 'rectangle',
    label: 'Rectangle',
    icon: '▭',
    category: 'Shapes',
    defaultStyle: { color: '#2962ff', lineWidth: 1.5, lineStyle: 'solid', opacity: 1, fillColor: '#2962ff', fillOpacity: 0.15 },
    settings: baseSettings().concat(fillSettings())
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var xl = Math.min(x1, x2), xr = Math.max(x1, x2);
    var yt = Math.min(y1, y2), yb = Math.max(y1, y2);
    ctx.save();
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.15);
    ctx.fillStyle = d.fillColor || d.color || '#2962ff';
    ctx.fillRect(xl, yt, xr - xl, yb - yt);
    applyStroke(ctx, d);
    ctx.strokeRect(xl, yt, xr - xl, yb - yt);
    ctx.setLineDash([]);
    ctx.restore();
  },
  hitRect
);

/* 17. Circle ----------------------------------------------------------- */
var circleTool = makeTwoPointTool(
  {
    id: 'circle',
    label: 'Circle',
    icon: '○',
    category: 'Shapes',
    defaultStyle: { color: '#2962ff', lineWidth: 1.5, lineStyle: 'solid', opacity: 1, fillColor: '#2962ff', fillOpacity: 0.12 },
    settings: baseSettings().concat(fillSettings())
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var r = dist(x1, y1, x2, y2);
    ctx.save();
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.12);
    ctx.fillStyle = d.fillColor || d.color || '#2962ff';
    ctx.beginPath(); ctx.arc(x1, y1, r, 0, Math.PI * 2); ctx.fill();
    applyStroke(ctx, d);
    ctx.beginPath(); ctx.arc(x1, y1, r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var r = dist(x1, y1, x2, y2);
    return Math.abs(dist(x, y, x1, y1) - r) < 6;
  }
);

/* 18. Ellipse (bounding box) ------------------------------------------- */
var ellipseTool = makeTwoPointTool(
  {
    id: 'ellipse',
    label: 'Ellipse',
    icon: '⬭',
    category: 'Shapes',
    defaultStyle: { color: '#2962ff', lineWidth: 1.5, lineStyle: 'solid', opacity: 1, fillColor: '#2962ff', fillOpacity: 0.12 },
    settings: baseSettings().concat(fillSettings())
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    var rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    if (rx < 0.5 || ry < 0.5) return;
    ctx.save();
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.12);
    ctx.fillStyle = d.fillColor || d.color || '#2962ff';
    ctx.beginPath();
    if (ctx.ellipse) {
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    } else {
      // manual ellipse via scale+arc
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx / ry, 1);
      ctx.arc(0, 0, ry, 0, Math.PI * 2);
      ctx.restore();
    }
    ctx.fill();
    applyStroke(ctx, d);
    ctx.beginPath();
    if (ctx.ellipse) {
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    } else {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx / ry, 1);
      ctx.arc(0, 0, ry, 0, Math.PI * 2);
      ctx.restore();
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    var rx = Math.abs(x2 - x1) / 2 || 1, ry = Math.abs(y2 - y1) / 2 || 1;
    var nx = (x - cx) / rx, ny = (y - cy) / ry;
    return Math.abs(nx * nx + ny * ny - 1) < 0.25;
  }
);

/* 19. Triangle (3 derived points from 2-click bounding box) ------------ */
var triangleTool = makeTwoPointTool(
  {
    id: 'triangle',
    label: 'Triangle',
    icon: '△',
    category: 'Shapes',
    defaultStyle: { color: '#2962ff', lineWidth: 1.5, lineStyle: 'solid', opacity: 1, fillColor: '#2962ff', fillOpacity: 0.15 },
    settings: baseSettings().concat(fillSettings())
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var cx = (x1 + x2) / 2;
    var top = Math.min(y1, y2), bot = Math.max(y1, y2);
    ctx.save();
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.15);
    ctx.fillStyle = d.fillColor || d.color || '#2962ff';
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(Math.min(x1, x2), bot);
    ctx.lineTo(Math.max(x1, x2), bot);
    ctx.closePath();
    ctx.fill();
    applyStroke(ctx, d);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var cx = (x1 + x2) / 2;
    var top = Math.min(y1, y2), bot = Math.max(y1, y2);
    return distToSegment(x, y, cx, top, Math.min(x1, x2), bot) < 6 ||
           distToSegment(x, y, Math.min(x1, x2), bot, Math.max(x1, x2), bot) < 6 ||
           distToSegment(x, y, Math.max(x1, x2), bot, cx, top) < 6;
  }
);

/* 20. Polygon (uses built-in 'poly' multi-click vertex-adding) --------- */
var polygonTool = function (chart) {
  return {
    id: 'polygon',
    label: 'Polygon',
    icon: '⬠',
    category: 'Shapes',
    defaultStyle: { color: '#2962ff', lineWidth: 1.5, lineStyle: 'solid', opacity: 1, fillColor: '#2962ff', fillOpacity: 0.13 },
    settings: baseSettings().concat(fillSettings()),
    onStart: function (ctx) {
      // type 'poly' so the chart's built-in vertex-adding / dbl-click-finish
      // kicks in (the chart checks currentDrawing.type === 'poly').
      var d = {
        type: 'poly',
        id: Date.now(),
        points: [{ i: ctx.idx, p: ctx.price, x: ctx.x, y: ctx.y }],
        closed: false
      };
      applyDefaults(d, baseSettings().concat(fillSettings()));
      return d;
    },
    onUpdate: function (d, ctx) {
      var sp = snapPoint(ctx, chart);
      var pts = d.points;
      if (pts.length > 0) {
        var last = pts[pts.length - 1];
        last.i = sp.idx; last.p = sp.price; last.x = sp.x; last.y = sp.y;
      }
    },
    // The chart's built-in 'poly' renderer draws this; we still provide an
    // onDraw for completeness (used if a chart ever routes to the custom tool).
    onDraw: function (ctx, d, h) {
      if (!d.points || d.points.length < 2) return;
      ctx.save();
      applyStroke(ctx, d);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (var i = 0; i < d.points.length; i++) {
        var x = h.indexToX(d.points[i].i), y = h.priceToY(d.points[i].p);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      if (d.closed) {
        ctx.closePath();
        ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.13);
        ctx.fillStyle = d.fillColor || d.color || '#2962ff';
        ctx.fill();
      }
      ctx.globalAlpha = (d.opacity != null ? d.opacity : 1);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    },
    onHitTest: function (d, x, y, h) {
      if (!d.points || d.points.length < 2) return false;
      for (var i = 0; i < d.points.length; i++) {
        var a = d.points[i], b = d.points[(i + 1) % d.points.length];
        if (!d.closed && i === d.points.length - 1) break;
        var ax = h.indexToX(a.i), ay = h.priceToY(a.p);
        var bx = h.indexToX(b.i), by = h.priceToY(b.p);
        if (distToSegment(x, y, ax, ay, bx, by) < 6) return true;
      }
      return false;
    },
    onApplySettings: function (d, settings) { if (settings) Object.assign(d, settings); }
  };
};

/* 21. Highlight Cloud (semi-transparent rectangle) --------------------- */
var cloudTool = makeTwoPointTool(
  {
    id: 'cloud',
    label: 'Highlight Cloud',
    icon: '▓',
    category: 'Shapes',
    defaultStyle: { color: '#2962ff', lineWidth: 0, lineStyle: 'solid', opacity: 1, fillColor: '#2962ff', fillOpacity: 0.2 },
    settings: baseSettings().concat(fillSettings())
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var xl = Math.min(x1, x2), xr = Math.max(x1, x2);
    var yt = Math.min(y1, y2), yb = Math.max(y1, y2);
    ctx.save();
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.2);
    ctx.fillStyle = d.fillColor || d.color || '#2962ff';
    ctx.fillRect(xl, yt, xr - xl, yb - yt);
    if ((d.lineWidth || 0) > 0) {
      applyStroke(ctx, d);
      ctx.strokeRect(xl, yt, xr - xl, yb - yt);
      ctx.setLineDash([]);
    }
    ctx.restore();
  },
  hitRect
);

/* 22. Arrow Shape (filled arrow) --------------------------------------- */
var arrowShapeTool = makeTwoPointTool(
  {
    id: 'arrow-shape',
    label: 'Arrow Shape',
    icon: '➤',
    category: 'Shapes',
    defaultStyle: { color: '#2962ff', lineWidth: 1, lineStyle: 'solid', opacity: 1, fillColor: '#2962ff', fillOpacity: 0.85 },
    settings: baseSettings().concat(fillSettings())
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var ang = Math.atan2(y2 - y1, x2 - x1);
    var len = dist(x1, y1, x2, y2);
    var headW = clamp(len * 0.3, 8, 30);
    var headL = clamp(len * 0.2, 8, 24);
    var bodyW = headW * 0.4;
    // shaft polygon
    ctx.save();
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.85);
    ctx.fillStyle = d.fillColor || d.color || '#2962ff';
    ctx.beginPath();
    var cos = Math.cos(ang), sin = Math.sin(ang);
    // tip
    ctx.moveTo(x2, y2);
    // head wing 1
    ctx.lineTo(x2 - headL * cos + headW / 2 * sin, y2 - headL * sin - headW / 2 * cos);
    // head-to-shaft corner 1
    ctx.lineTo(x2 - headL * cos + bodyW / 2 * sin, y2 - headL * sin - bodyW / 2 * cos);
    // shaft back corner 1
    ctx.lineTo(x1 + bodyW / 2 * sin, y1 - bodyW / 2 * cos);
    // shaft back corner 2
    ctx.lineTo(x1 - bodyW / 2 * sin, y1 + bodyW / 2 * cos);
    // head-to-shaft corner 2
    ctx.lineTo(x2 - headL * cos - bodyW / 2 * sin, y2 - headL * sin + bodyW / 2 * cos);
    // head wing 2
    ctx.lineTo(x2 - headL * cos - headW / 2 * sin, y2 - headL * sin + headW / 2 * cos);
    ctx.closePath();
    ctx.fill();
    applyStroke(ctx, d);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },
  hitLine
);

/* 23. Heart (fun shape) ------------------------------------------------ */
var heartTool = makeTwoPointTool(
  {
    id: 'heart',
    label: 'Heart',
    icon: '♥',
    category: 'Shapes',
    defaultStyle: { color: '#e91e63', lineWidth: 1, lineStyle: 'solid', opacity: 1, fillColor: '#e91e63', fillOpacity: 0.5 },
    settings: baseSettings({ color: '#e91e63' }).concat(fillSettings({ fillColor: '#e91e63', fillOpacity: 0.5 }))
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    var w = Math.abs(x2 - x1), hh = Math.abs(y2 - y1);
    var s = Math.min(w, hh) / 16 || 1;
    ctx.save();
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.5);
    ctx.fillStyle = d.fillColor || d.color || '#e91e63';
    ctx.beginPath();
    // parametric heart curve (t from 0..2π), scaled to bounding box
    for (var t = 0; t <= Math.PI * 2 + 0.01; t += 0.05) {
      var px = 16 * Math.pow(Math.sin(t), 3);
      var py = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      var X = cx + px * s * (w / Math.max(hh, 1)) * 0.5;
      var Y = cy - py * s * 0.5;
      if (t === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
    }
    ctx.closePath();
    ctx.fill();
    applyStroke(ctx, d);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    return x >= Math.min(x1, x2) - 4 && x <= Math.max(x1, x2) + 4 &&
           y >= Math.min(y1, y2) - 4 && y <= Math.max(y1, y2) + 4;
  }
);

/* =========================================================================
 * 10. TOOL DEFINITIONS — GANN (5)
 * ========================================================================= */

var GANN_ANGLES = [
  { ratio: 1, label: '1x1' },
  { ratio: 0.5, label: '2x1' },
  { ratio: 0.333, label: '3x1' },
  { ratio: 0.25, label: '4x1' },
  { ratio: 0.125, label: '8x1' },
  { ratio: 2, label: '1x2' },
  { ratio: 3, label: '1x3' },
  { ratio: 4, label: '1x4' },
  { ratio: 8, label: '1x8' }
];

/* 24. Gann Fan (1 point, 9 lines at Gann angles) ----------------------- */
var gannFanTool = makeOnePointTool(
  {
    id: 'gann-fan',
    label: 'Gann Fan',
    icon: 'G╱',
    category: 'Gann',
    defaultStyle: { color: '#ff9800', lineWidth: 1, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings({ color: '#ff9800' })
  },
  function (ctx, d, h) {
    var x0 = h.indexToX(d.i), y0 = h.priceToY(d.p);
    var pxPerBar = h.barSpacing || 8;
    // price units per pixel (approx via helpers: invert priceToY slope)
    var yA = h.priceToY(d.p + 1), yB = h.priceToY(d.p);
    var pxPerPrice = Math.abs(yA - yB) || 1;
    // slope in px per px: ratio = price-units per bar → px/bar ÷ px/price
    ctx.save();
    applyStroke(ctx, d);
    for (var i = 0; i < GANN_ANGLES.length; i++) {
      var g = GANN_ANGLES[i];
      // angle below horizontal-right: slope_y_px_per_x_px = ratio * pxPerPrice / pxPerBar
      var slope = g.ratio * pxPerPrice / pxPerBar;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      // extend right to chartRight
      var dx = h.chartRight - x0;
      var dy = slope * dx;
      ctx.lineTo(h.chartRight, y0 + dy);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    dot(ctx, x0, y0, 3);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x0 = h.indexToX(d.i), y0 = h.priceToY(d.p);
    var pxPerBar = h.barSpacing || 8;
    var yA = h.priceToY(d.p + 1), yB = h.priceToY(d.p);
    var pxPerPrice = Math.abs(yA - yB) || 1;
    for (var i = 0; i < GANN_ANGLES.length; i++) {
      var slope = GANN_ANGLES[i].ratio * pxPerPrice / pxPerBar;
      var dx = h.chartRight - x0;
      var dy = slope * dx;
      if (distToSegment(x, y, x0, y0, h.chartRight, y0 + dy) < 6) return true;
    }
    return false;
  }
);

/* 25. Gann Box (2 points, square box with Gann angles inside) ---------- */
var gannBoxTool = makeTwoPointTool(
  {
    id: 'gann-box',
    label: 'Gann Box',
    icon: 'G□',
    category: 'Gann',
    defaultStyle: { color: '#ff9800', lineWidth: 1, lineStyle: 'solid', opacity: 1, fillColor: '#ff9800', fillOpacity: 0.05 },
    settings: baseSettings({ color: '#ff9800' }).concat(fillSettings({ fillColor: '#ff9800', fillOpacity: 0.05 }))
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var xl = Math.min(x1, x2), xr = Math.max(x1, x2);
    var yt = Math.min(y1, y2), yb = Math.max(y1, y2);
    var w = xr - xl, hh = yb - yt;
    ctx.save();
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.05);
    ctx.fillStyle = d.fillColor || d.color || '#ff9800';
    ctx.fillRect(xl, yt, w, hh);
    applyStroke(ctx, d);
    ctx.strokeRect(xl, yt, w, hh);
    // 1x1 diagonal
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(xl, yt); ctx.lineTo(xr, yb);
    ctx.moveTo(xl, yb); ctx.lineTo(xr, yt);
    ctx.stroke();
    ctx.setLineDash([]);
    // subdivisions at 1/3
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    for (var i = 1; i < 3; i++) {
      ctx.moveTo(xl + w * i / 3, yt); ctx.lineTo(xl + w * i / 3, yb);
      ctx.moveTo(xl, yt + hh * i / 3); ctx.lineTo(xr, yt + hh * i / 3);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },
  hitRect
);

/* 26. Gann Grid (45° diagonal grid) ------------------------------------ */
var gannGridTool = makeTwoPointTool(
  {
    id: 'gann-grid',
    label: 'Gann Grid',
    icon: 'G▦',
    category: 'Gann',
    defaultStyle: { color: '#ff9800', lineWidth: 1, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings({ color: '#ff9800' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var span = Math.abs(x2 - x1) || 1;
    var cell = clamp(span / 8, 6, 60);
    ctx.save();
    applyStroke(ctx, d);
    ctx.setLineDash([2, 3]);
    // diagonal 45° lines rising and falling, tiled from the anchor
    for (var off = -span; off <= span * 2; off += cell) {
      ctx.beginPath();
      ctx.moveTo(x1 + off, h.chartTop);
      ctx.lineTo(x1 + off + (h.chartBottom - h.chartTop), h.chartBottom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1 + off, h.chartBottom);
      ctx.lineTo(x1 + off + (h.chartBottom - h.chartTop), h.chartTop);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    dot(ctx, x1, y1, 3);
    ctx.restore();
  },
  function (d, x, y, h) {
    // hit-test: within 6px of any diagonal line through the anchor
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    // nearest 45° line passing near (x,y): |(x-x1) - (y-y1)| mod cell
    var d1 = Math.abs((x - x1) - (y - y1));
    var d2 = Math.abs((x - x1) + (y - y1));
    return Math.min(d1 % 8, d2 % 8) < 6;
  }
);

/* 27. Gann Square of 9 (1 point, spiral) ------------------------------- */
var gannSquareTool = makeOnePointTool(
  {
    id: 'gann-square',
    label: 'Gann Square of 9',
    icon: 'G⟳',
    category: 'Gann',
    defaultStyle: { color: '#ff9800', lineWidth: 1, lineStyle: 'solid', opacity: 1, rings: 4 },
    settings: baseSettings({ color: '#ff9800' }).concat([
      { key: 'rings', label: 'Rings', type: 'number', default: 4, min: 1, max: 12, step: 1 }
    ])
  },
  function (ctx, d, h) {
    var x0 = h.indexToX(d.i), y0 = h.priceToY(d.p);
    var rings = d.rings || 4;
    var cell = clamp(h.barSpacing * 2, 8, 40);
    ctx.save();
    applyStroke(ctx, d);
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // concentric squares + radial spokes + numbers around the spiral
    for (var r = 1; r <= rings; r++) {
      var half = r * cell;
      ctx.beginPath();
      ctx.rect(x0 - half, y0 - half, half * 2, half * 2);
      ctx.stroke();
    }
    // spokes (cross + diagonals)
    ctx.setLineDash([2, 2]);
    var maxHalf = rings * cell;
    ctx.beginPath();
    ctx.moveTo(x0 - maxHalf, y0); ctx.lineTo(x0 + maxHalf, y0);
    ctx.moveTo(x0, y0 - maxHalf); ctx.lineTo(x0, y0 + maxHalf);
    ctx.moveTo(x0 - maxHalf, y0 - maxHalf); ctx.lineTo(x0 + maxHalf, y0 + maxHalf);
    ctx.moveTo(x0 - maxHalf, y0 + maxHalf); ctx.lineTo(x0 + maxHalf, y0 - maxHalf);
    ctx.stroke();
    ctx.setLineDash([]);
    // center label "1"
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1);
    ctx.fillStyle = d.color || '#ff9800';
    ctx.fillText('1', x0, y0);
    // ring numbers at top-right corner of each ring
    for (var rr = 1; rr <= rings; rr++) {
      var half2 = rr * cell;
      var num = ((2 * rr + 1) * (2 * rr + 1));
      ctx.fillText(String(num), x0 + half2 - 6, y0 - half2 + 6);
    }
    ctx.restore();
  },
  function (d, x, y, h) {
    var x0 = h.indexToX(d.i), y0 = h.priceToY(d.p);
    var rings = d.rings || 4;
    var cell = clamp(h.barSpacing * 2, 8, 40);
    var maxHalf = rings * cell;
    return x >= x0 - maxHalf - 4 && x <= x0 + maxHalf + 4 &&
           y >= y0 - maxHalf - 4 && y <= y0 + maxHalf + 4;
  }
);

/* 28. Gann Hexagon (1 point, hexagonal pattern) ------------------------ */
var gannHexagonTool = makeOnePointTool(
  {
    id: 'gann-hexagon',
    label: 'Gann Hexagon',
    icon: 'G⬡',
    category: 'Gann',
    defaultStyle: { color: '#ff9800', lineWidth: 1, lineStyle: 'solid', opacity: 1, rings: 3 },
    settings: baseSettings({ color: '#ff9800' }).concat([
      { key: 'rings', label: 'Rings', type: 'number', default: 3, min: 1, max: 8, step: 1 }
    ])
  },
  function (ctx, d, h) {
    var x0 = h.indexToX(d.i), y0 = h.priceToY(d.p);
    var rings = d.rings || 3;
    var size = clamp(h.barSpacing * 3, 14, 60);
    ctx.save();
    applyStroke(ctx, d);
    function hex(cx, cy, r) {
      ctx.beginPath();
      for (var k = 0; k < 6; k++) {
        var a = Math.PI / 6 + k * Math.PI / 3;
        var X = cx + r * Math.cos(a), Y = cy + r * Math.sin(a);
        if (k === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    // center hex
    hex(x0, y0, size);
    // ring neighbors (flat-top axial coords)
    var dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    for (var ring = 1; ring <= rings; ring++) {
      // walk around the ring
      var q = dirs[4][0] * ring, r2 = dirs[4][1] * ring;
      for (var s = 0; s < 6; s++) {
        for (var step = 0; step < ring; step++) {
          var cx = x0 + size * 1.5 * q;
          var cy = y0 + size * Math.sqrt(3) * (r2 + q / 2);
          hex(cx, cy, size);
          q += dirs[s][0]; r2 += dirs[s][1];
        }
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    dot(ctx, x0, y0, 3);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x0 = h.indexToX(d.i), y0 = h.priceToY(d.p);
    var rings = d.rings || 3;
    var size = clamp(h.barSpacing * 3, 14, 60);
    return dist(x, y, x0, y0) < size * (rings + 1) * 1.5 + 6;
  }
);

/* =========================================================================
 * 11. TOOL DEFINITIONS — ELLIOTT WAVE (4)
 *
 * Each tool is a 2-click tool; the intermediate wave points are derived
 * along the user's start→end drag with zigzag offsets, then labeled.
 * ========================================================================= */

function elliottLabel(ctx, x, y, txt, color) {
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var w = ctx.measureText(txt).width + 6;
  ctx.fillStyle = color;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x - w / 2, y - 7, w, 14, 3); ctx.fill(); }
  else ctx.fillRect(x - w / 2, y - 7, w, 14);
  ctx.fillStyle = '#1e222d';
  ctx.fillText(txt, x, y);
  ctx.textAlign = 'left';
}

/* 29. Elliott Wave (5 points 1-2-3-4-5) -------------------------------- */
var elliottWaveTool = makeTwoPointTool(
  {
    id: 'elliott-wave',
    label: 'Elliott Wave',
    icon: 'E〜',
    category: 'Elliott',
    defaultStyle: { color: '#26a69a', lineWidth: 1.5, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings({ color: '#26a69a' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    // 5 derived wave points (zigzag): 1, 2 (38.2% retrace), 3 (extends), 4 (61.8% retrace), 5
    var pts = [
      { x: x1, y: y1 },
      { x: lerp(x1, x2, 0.25), y: lerp(y1, y2, 0.382) },
      { x: lerp(x1, x2, 0.55), y: y2 },
      { x: lerp(x1, x2, 0.75), y: lerp(y1, y2, 0.618) },
      { x: x2, y: lerp(y1, y2, 0.764) + (y2 - y1) * 0.236 }
    ];
    var labels = ['1', '2', '3', '4', '5'];
    ctx.save();
    applyStroke(ctx, d);
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y); else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (var j = 0; j < pts.length; j++) {
      dot(ctx, pts[j].x, pts[j].y, 3);
      elliottLabel(ctx, pts[j].x, pts[j].y - 14, labels[j], d.color || '#26a69a');
    }
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var pts = [
      { x: x1, y: y1 },
      { x: lerp(x1, x2, 0.25), y: lerp(y1, y2, 0.382) },
      { x: lerp(x1, x2, 0.55), y: y2 },
      { x: lerp(x1, x2, 0.75), y: lerp(y1, y2, 0.618) },
      { x: x2, y: lerp(y1, y2, 0.764) + (y2 - y1) * 0.236 }
    ];
    for (var i = 0; i < pts.length - 1; i++) {
      if (distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < 6) return true;
    }
    return false;
  }
);

/* 30. Elliott Correction (3 points A-B-C) ------------------------------ */
var elliottCorrectionTool = makeTwoPointTool(
  {
    id: 'elliott-correction',
    label: 'Elliott Correction',
    icon: 'E ABC',
    category: 'Elliott',
    defaultStyle: { color: '#ef5350', lineWidth: 1.5, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings({ color: '#ef5350' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var A = { x: x1, y: y1 };
    var B = { x: x2, y: y2 };
    var C = { x: x2 + (x2 - x1) * 0.618, y: lerp(y1, y2, 0.382) };
    var labels = ['A', 'B', 'C'];
    var pts = [A, B, C];
    ctx.save();
    applyStroke(ctx, d);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (var i = 0; i < pts.length; i++) {
      dot(ctx, pts[i].x, pts[i].y, 3);
      elliottLabel(ctx, pts[i].x, pts[i].y - 14, labels[i], d.color || '#ef5350');
    }
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var A = { x: x1, y: y1 }, B = { x: x2, y: y2 };
    var C = { x: x2 + (x2 - x1) * 0.618, y: lerp(y1, y2, 0.382) };
    return distToSegment(x, y, A.x, A.y, B.x, B.y) < 6 ||
           distToSegment(x, y, B.x, B.y, C.x, C.y) < 6;
  }
);

/* 31. Elliott Triangle (5 points contracting) -------------------------- */
var elliottTriangleTool = makeTwoPointTool(
  {
    id: 'elliott-triangle',
    label: 'Elliott Triangle',
    icon: 'E△',
    category: 'Elliott',
    defaultStyle: { color: '#9c27b0', lineWidth: 1.5, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings({ color: '#9c27b0' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var span = x2 - x1, amp = Math.abs(y2 - y1);
    // contracting: amplitude halves each leg
    var pts = [
      { x: x1, y: y1 },
      { x: x1 + span * 0.2, y: y1 - amp * 0.5 },
      { x: x1 + span * 0.4, y: y1 + amp * 0.25 },
      { x: x1 + span * 0.65, y: y1 - amp * 0.125 },
      { x: x2, y: y1 + amp * 0.0625 }
    ];
    var labels = ['A', 'B', 'C', 'D', 'E'];
    ctx.save();
    applyStroke(ctx, d);
    ctx.beginPath();
    for (var i = 0; i < pts.length; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y); else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (var j = 0; j < pts.length; j++) {
      dot(ctx, pts[j].x, pts[j].y, 3);
      elliottLabel(ctx, pts[j].x, pts[j].y - 14, labels[j], d.color || '#9c27b0');
    }
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var span = x2 - x1, amp = Math.abs(y2 - y1);
    var pts = [
      { x: x1, y: y1 },
      { x: x1 + span * 0.2, y: y1 - amp * 0.5 },
      { x: x1 + span * 0.4, y: y1 + amp * 0.25 },
      { x: x1 + span * 0.65, y: y1 - amp * 0.125 },
      { x: x2, y: y1 + amp * 0.0625 }
    ];
    for (var i = 0; i < pts.length - 1; i++) {
      if (distToSegment(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) < 6) return true;
    }
    return false;
  }
);

/* 32. Elliott Flat (3 points A-B-C, flat correction) ------------------- */
var elliottFlatTool = makeTwoPointTool(
  {
    id: 'elliott-flat',
    label: 'Elliott Flat',
    icon: 'E—',
    category: 'Elliott',
    defaultStyle: { color: '#ff9800', lineWidth: 1.5, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings({ color: '#ff9800' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    // flat: A and B near-equal, C slightly beyond B
    var A = { x: x1, y: y1 };
    var B = { x: lerp(x1, x2, 0.5), y: y2 };
    var C = { x: x2, y: lerp(y1, y2, 1.1) };
    var pts = [A, B, C];
    var labels = ['A', 'B', 'C'];
    ctx.save();
    applyStroke(ctx, d);
    ctx.beginPath();
    ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (var i = 0; i < pts.length; i++) {
      dot(ctx, pts[i].x, pts[i].y, 3);
      elliottLabel(ctx, pts[i].x, pts[i].y - 14, labels[i], d.color || '#ff9800');
    }
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var A = { x: x1, y: y1 }, B = { x: lerp(x1, x2, 0.5), y: y2 }, C = { x: x2, y: lerp(y1, y2, 1.1) };
    return distToSegment(x, y, A.x, A.y, B.x, B.y) < 6 ||
           distToSegment(x, y, B.x, B.y, C.x, C.y) < 6;
  }
);

/* =========================================================================
 * 12. TOOL DEFINITIONS — TEXT (4)
 * ========================================================================= */

/* 33. Text ------------------------------------------------------------- */
var textTool = function (chart) {
  return {
    id: 'text',
    label: 'Text',
    icon: 'T',
    category: 'Text',
    defaultStyle: { color: '#d1d4dc', lineWidth: 1, lineStyle: 'solid', opacity: 1, text: 'Text', fontSize: 12 },
    settings: baseSettings({ color: '#d1d4dc' }).concat(textSettings()),
    onStart: function (ctx) {
      var d = onePointInit(ctx, 'text', baseSettings({ color: '#d1d4dc' }).concat(textSettings()));
      return d;
    },
    onUpdate: function (d, ctx) {
      var sp = snapPoint(ctx, chart);
      d.i = sp.idx; d.p = sp.price; d.x = sp.x; d.y = sp.y;
    },
    onFinish: function (d) {
      // prompt for text on placement
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        try {
          var t = window.prompt('Text:', d.text || 'Text');
          if (t != null) d.text = t;
        } catch (e) {}
      }
    },
    onDraw: function (ctx, d, h) {
      var x = h.indexToX(d.i), y = h.priceToY(d.p);
      ctx.save();
      ctx.globalAlpha = (d.opacity != null ? d.opacity : 1);
      ctx.font = (d.fontSize || 12) + 'px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      var txt = d.text || '';
      var tw = ctx.measureText(txt).width + 8;
      ctx.fillStyle = hexToRgba(d.color || '#d1d4dc', 0.18);
      ctx.fillRect(x - 2, y - (d.fontSize || 12) - 4, tw, (d.fontSize || 12) + 6);
      ctx.fillStyle = d.color || '#d1d4dc';
      ctx.fillText(txt, x + 2, y - 2);
      ctx.globalAlpha = 1;
      dot(ctx, x, y, 2.5);
      ctx.restore();
    },
    onHitTest: function (d, x, y, h) {
      var xx = h.indexToX(d.i), yy = h.priceToY(d.p);
      var fs = d.fontSize || 12;
      return x >= xx - 4 && x <= xx + 120 && y >= yy - fs - 6 && y <= yy + 4;
    },
    onApplySettings: function (d, settings) { if (settings) Object.assign(d, settings); }
  };
};

/* 34. Note (text on colored background box) ---------------------------- */
var noteTool = function (chart) {
  return {
    id: 'note',
    label: 'Note',
    icon: '📝',
    category: 'Text',
    defaultStyle: { color: '#1e222d', lineWidth: 1, lineStyle: 'solid', opacity: 1, text: 'Note', fontSize: 12, fillColor: '#ff9800', fillOpacity: 0.9 },
    settings: baseSettings({ color: '#1e222d' }).concat(textSettings(), fillSettings({ fillColor: '#ff9800', fillOpacity: 0.9 })),
    onStart: function (ctx) {
      return onePointInit(ctx, 'note', baseSettings({ color: '#1e222d' }).concat(textSettings(), fillSettings({ fillColor: '#ff9800', fillOpacity: 0.9 })));
    },
    onUpdate: function (d, ctx) {
      var sp = snapPoint(ctx, chart);
      d.i = sp.idx; d.p = sp.price; d.x = sp.x; d.y = sp.y;
    },
    onFinish: function (d) {
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        try {
          var t = window.prompt('Note:', d.text || 'Note');
          if (t != null) d.text = t;
        } catch (e) {}
      }
    },
    onDraw: function (ctx, d, h) {
      var x = h.indexToX(d.i), y = h.priceToY(d.p);
      ctx.save();
      ctx.font = (d.fontSize || 12) + 'px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      var txt = d.text || '';
      var tw = ctx.measureText(txt).width + 12;
      var th = (d.fontSize || 12) + 8;
      ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.9);
      ctx.fillStyle = d.fillColor || '#ff9800';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, tw, th, 4); ctx.fill(); }
      else ctx.fillRect(x, y, tw, th);
      ctx.globalAlpha = (d.opacity != null ? d.opacity : 1);
      ctx.fillStyle = d.color || '#1e222d';
      ctx.fillText(txt, x + 6, y + 4);
      // anchor line + dot
      ctx.strokeStyle = d.fillColor || '#ff9800';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, h.chartBottom); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      dot(ctx, x, y, 2.5);
      ctx.restore();
    },
    onHitTest: function (d, x, y, h) {
      var xx = h.indexToX(d.i), yy = h.priceToY(d.p);
      return x >= xx - 4 && x <= xx + 160 && y >= yy - 4 && y <= yy + 24;
    },
    onApplySettings: function (d, settings) { if (settings) Object.assign(d, settings); }
  };
};

/* 35. Label (text anchored to candle with leader line) ---------------- */
var labelTool = function (chart) {
  return {
    id: 'label',
    label: 'Label',
    icon: '🏷',
    category: 'Text',
    defaultStyle: { color: '#2962ff', lineWidth: 1, lineStyle: 'solid', opacity: 1, text: 'Label', fontSize: 11, fillColor: '#1e222d', fillOpacity: 0.95 },
    settings: baseSettings({ color: '#2962ff' }).concat(textSettings(), fillSettings({ fillColor: '#1e222d', fillOpacity: 0.95 })),
    onStart: function (ctx) {
      return onePointInit(ctx, 'label', baseSettings({ color: '#2962ff' }).concat(textSettings(), fillSettings({ fillColor: '#1e222d', fillOpacity: 0.95 })));
    },
    onUpdate: function (d, ctx) {
      var sp = snapPoint(ctx, chart);
      d.i = sp.idx; d.p = sp.price; d.x = sp.x; d.y = sp.y;
    },
    onFinish: function (d) {
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        try {
          var t = window.prompt('Label:', d.text || 'Label');
          if (t != null) d.text = t;
        } catch (e) {}
      }
    },
    onDraw: function (ctx, d, h) {
      var x = h.indexToX(d.i), y = h.priceToY(d.p);
      // Label box floats above the anchor with a leader line
      var bx = x + 12, by = y - 30;
      ctx.save();
      ctx.font = (d.fontSize || 11) + 'px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      var txt = d.text || '';
      var tw = ctx.measureText(txt).width + 12;
      var th = (d.fontSize || 11) + 8;
      ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.95);
      ctx.fillStyle = d.fillColor || '#1e222d';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, tw, th, 4); ctx.fill(); }
      else ctx.fillRect(bx, by, tw, th);
      // border
      ctx.globalAlpha = (d.opacity != null ? d.opacity : 1);
      ctx.strokeStyle = d.color || '#2962ff';
      ctx.lineWidth = 1;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, tw, th, 4); ctx.stroke(); }
      else ctx.strokeRect(bx, by, tw, th);
      // leader line
      ctx.setLineDash([3, 2]);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by + th); ctx.stroke();
      ctx.setLineDash([]);
      // text
      ctx.fillStyle = d.color || '#2962ff';
      ctx.fillText(txt, bx + 6, by + 4);
      ctx.globalAlpha = 1;
      dot(ctx, x, y, 3);
      ctx.restore();
    },
    onHitTest: function (d, x, y, h) {
      var xx = h.indexToX(d.i), yy = h.priceToY(d.p);
      return x >= xx - 4 && x <= xx + 160 && y >= yy - 40 && y <= yy + 8;
    },
    onApplySettings: function (d, settings) { if (settings) Object.assign(d, settings); }
  };
};

/* 36. Comment (text box with arrow pointing to a candle) -------------- */
var commentTool = function (chart) {
  return {
    id: 'comment',
    label: 'Comment',
    icon: '💬',
    category: 'Text',
    defaultStyle: { color: '#d1d4dc', lineWidth: 1, lineStyle: 'solid', opacity: 1, text: 'Comment', fontSize: 11, fillColor: '#2a2e39', fillOpacity: 0.95 },
    settings: baseSettings({ color: '#d1d4dc' }).concat(textSettings(), fillSettings({ fillColor: '#2a2e39', fillOpacity: 0.95 })),
    onStart: function (ctx) {
      return twoPointInit(ctx, 'comment', baseSettings({ color: '#d1d4dc' }).concat(textSettings(), fillSettings({ fillColor: '#2a2e39', fillOpacity: 0.95 })));
    },
    onUpdate: function (d, ctx) {
      var sp = snapPoint(ctx, chart);
      d.i2 = sp.idx; d.p2 = sp.price; d.x2 = sp.x; d.y2 = sp.y;
    },
    onFinish: function (d) {
      if (typeof window !== 'undefined' && typeof window.prompt === 'function') {
        try {
          var t = window.prompt('Comment:', d.text || 'Comment');
          if (t != null) d.text = t;
        } catch (e) {}
      }
    },
    onDraw: function (ctx, d, h) {
      var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
      var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
      // Box at (x1,y1) — the text box; arrow points to (x2,y2) — the candle
      ctx.save();
      ctx.font = (d.fontSize || 11) + 'px -apple-system, Segoe UI, Roboto, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      var txt = d.text || '';
      var tw = ctx.measureText(txt).width + 14;
      var th = (d.fontSize || 11) + 10;
      var bx = x1, by = y1 - th / 2;
      // box
      ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.95);
      ctx.fillStyle = d.fillColor || '#2a2e39';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, tw, th, 4); ctx.fill(); }
      else ctx.fillRect(bx, by, tw, th);
      // border
      ctx.globalAlpha = (d.opacity != null ? d.opacity : 1);
      ctx.strokeStyle = d.color || '#d1d4dc';
      ctx.lineWidth = 1;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, tw, th, 4); ctx.stroke(); }
      else ctx.strokeRect(bx, by, tw, th);
      // arrow from box-right to (x2,y2)
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(bx + tw, by + th / 2);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      // arrowhead
      var ang = Math.atan2(y2 - (by + th / 2), x2 - (bx + tw));
      var hl = 8;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - hl * Math.cos(ang - Math.PI / 6), y2 - hl * Math.sin(ang - Math.PI / 6));
      ctx.lineTo(x2 - hl * Math.cos(ang + Math.PI / 6), y2 - hl * Math.sin(ang + Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = d.color || '#d1d4dc';
      ctx.fill();
      // text
      ctx.fillStyle = d.color || '#d1d4dc';
      ctx.fillText(txt, bx + 7, by + 5);
      ctx.globalAlpha = 1;
      dot(ctx, x2, y2, 3);
      ctx.restore();
    },
    onHitTest: function (d, x, y, h) {
      var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
      var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
      return x >= x1 - 4 && x <= x1 + 160 && y >= y1 - 16 && y <= y1 + 16 ||
             distToSegment(x, y, x1 + 120, y1, x2, y2) < 6;
    },
    onApplySettings: function (d, settings) { if (settings) Object.assign(d, settings); }
  };
};

/* =========================================================================
 * 13. TOOL DEFINITIONS — PREDICTION (5)
 * ========================================================================= */

/* 37. Andrews Pitchfork (3 derived points) ----------------------------- */
var pitchforkTool = makeTwoPointTool(
  {
    id: 'pitchfork',
    label: 'Andrews Pitchfork',
    icon: 'P╱╲',
    category: 'Prediction',
    defaultStyle: { color: '#2962ff', lineWidth: 1, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings()
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    // P0 = (i1,p1) handle; P1 = midpoint; P2 = (i2,p2)
    var P0 = { x: x1, y: y1 };
    var P1 = { x: (x1 + x2) / 2, y: y1 };  // derived peak at mid-index, handle's price
    var P2 = { x: x2, y: y2 };
    var midX = (P1.x + P2.x) / 2, midY = (P1.y + P2.y) / 2;
    // median line: P0 → midpoint(P1,P2), extended to chartRight
    var mdx = midX - P0.x, mdy = midY - P0.y;
    ctx.save();
    applyStroke(ctx, d);
    // median
    ctx.beginPath();
    ctx.moveTo(P0.x, P0.y);
    if (Math.abs(mdx) > 1e-6) {
      var t = (h.chartRight - P0.x) / mdx;
      ctx.lineTo(h.chartRight, P0.y + mdy * t);
    } else ctx.lineTo(P0.x, h.chartBottom);
    ctx.stroke();
    // upper tine (from P1, parallel to median)
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(P1.x, P1.y);
    if (Math.abs(mdx) > 1e-6) {
      var t2 = (h.chartRight - P1.x) / mdx;
      ctx.lineTo(h.chartRight, P1.y + mdy * t2);
    } else ctx.lineTo(P1.x, h.chartBottom);
    ctx.stroke();
    // lower tine (from P2)
    ctx.beginPath();
    ctx.moveTo(P2.x, P2.y);
    if (Math.abs(mdx) > 1e-6) {
      var t3 = (h.chartRight - P2.x) / mdx;
      ctx.lineTo(h.chartRight, P2.y + mdy * t3);
    } else ctx.lineTo(P2.x, h.chartBottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    dot(ctx, P0.x, P0.y, 3); dot(ctx, P1.x, P1.y, 3); dot(ctx, P2.x, P2.y, 3);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var P0 = { x: x1, y: y1 }, P1 = { x: (x1 + x2) / 2, y: y1 }, P2 = { x: x2, y: y2 };
    var midX = (P1.x + P2.x) / 2, midY = (P1.y + P2.y) / 2;
    var mdx = midX - P0.x, mdy = midY - P0.y;
    if (Math.abs(mdx) > 1e-6) {
      var t = (h.chartRight - P0.x) / mdx;
      if (distToSegment(x, y, P0.x, P0.y, h.chartRight, P0.y + mdy * t) < 6) return true;
      var t2 = (h.chartRight - P1.x) / mdx;
      if (distToSegment(x, y, P1.x, P1.y, h.chartRight, P1.y + mdy * t2) < 6) return true;
      var t3 = (h.chartRight - P2.x) / mdx;
      if (distToSegment(x, y, P2.x, P2.y, h.chartRight, P2.y + mdy * t3) < 6) return true;
    }
    return false;
  }
);

/* 38. Schiff Pitchfork (modified origin) ------------------------------- */
var schiffPitchforkTool = makeTwoPointTool(
  {
    id: 'schiff-pitchfork',
    label: 'Schiff Pitchfork',
    icon: 'SP╱╲',
    category: 'Prediction',
    defaultStyle: { color: '#26a69a', lineWidth: 1, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings({ color: '#26a69a' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var P0 = { x: x1, y: y1 };
    var P1 = { x: (x1 + x2) / 2, y: y1 };
    var P2 = { x: x2, y: y2 };
    // Schiff: origin is midpoint of P0 and P1
    var S0 = { x: (P0.x + P1.x) / 2, y: (P0.y + P1.y) / 2 };
    var midX = (P1.x + P2.x) / 2, midY = (P1.y + P2.y) / 2;
    var mdx = midX - S0.x, mdy = midY - S0.y;
    ctx.save();
    applyStroke(ctx, d);
    function tine(fromX, fromY) {
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      if (Math.abs(mdx) > 1e-6) {
        var t = (h.chartRight - fromX) / mdx;
        ctx.lineTo(h.chartRight, fromY + mdy * t);
      } else ctx.lineTo(fromX, h.chartBottom);
      ctx.stroke();
    }
    tine(S0.x, S0.y);
    ctx.setLineDash([4, 3]);
    tine(P1.x, P1.y);
    tine(P2.x, P2.y);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    dot(ctx, P0.x, P0.y, 3); dot(ctx, P1.x, P1.y, 3); dot(ctx, P2.x, P2.y, 3);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var P0 = { x: x1, y: y1 }, P1 = { x: (x1 + x2) / 2, y: y1 }, P2 = { x: x2, y: y2 };
    var S0 = { x: (P0.x + P1.x) / 2, y: (P0.y + P1.y) / 2 };
    var midX = (P1.x + P2.x) / 2, midY = (P1.y + P2.y) / 2;
    var mdx = midX - S0.x, mdy = midY - S0.y;
    if (Math.abs(mdx) > 1e-6) {
      var t = (h.chartRight - S0.x) / mdx;
      if (distToSegment(x, y, S0.x, S0.y, h.chartRight, S0.y + mdy * t) < 6) return true;
    }
    return false;
  }
);

/* 39. Cycle Lines (vertical lines at cycle intervals) ------------------ */
var cycleLinesTool = makeTwoPointTool(
  {
    id: 'cycle-lines',
    label: 'Cycle Lines',
    icon: '⊙│',
    category: 'Prediction',
    defaultStyle: { color: '#9c27b0', lineWidth: 1, lineStyle: 'dashed', opacity: 1 },
    settings: baseSettings({ color: '#9c27b0', lineStyle: 'dashed' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var step = Math.abs(x2 - x1);
    if (step < 2) step = 2;
    ctx.save();
    applyStroke(ctx, d);
    var count = Math.floor((h.chartRight - Math.min(x1, x2)) / step) + 1;
    for (var i = 0; i <= count; i++) {
      var xv = Math.min(x1, x2) + step * i;
      if (xv < h.chartLeft - 2 || xv > h.chartRight + 2) continue;
      ctx.beginPath();
      ctx.moveTo(xv, h.chartTop);
      ctx.lineTo(xv, h.chartBottom);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var step = Math.abs(x2 - x1) || 2;
    var base = Math.min(x1, x2);
    var rel = x - base;
    var idx = Math.round(rel / step);
    var xv = base + step * idx;
    return Math.abs(x - xv) < 6 && y >= h.chartTop - 4 && y <= h.chartBottom + 4;
  }
);

/* 40. Head & Shoulders (5 derived points) ------------------------------ */
var headShouldersTool = makeTwoPointTool(
  {
    id: 'head-shoulders',
    label: 'Head & Shoulders',
    icon: 'H&S',
    category: 'Prediction',
    defaultStyle: { color: '#ef5350', lineWidth: 1.5, lineStyle: 'solid', opacity: 1, fillColor: '#ef5350', fillOpacity: 0.1 },
    settings: baseSettings({ color: '#ef5350' }).concat(fillSettings({ fillColor: '#ef5350', fillOpacity: 0.1 }))
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    // Neckline = (i1,p1)→(i2,p2). Peaks derived above the neckline.
    var span = x2 - x1;
    var neck = function (xx) { return y1 + (y2 - y1) * ((xx - x1) / (span || 1)); };
    var amp = Math.abs(y2 - y1) + 40;
    var LS = { x: x1 + span * 0.15, y: neck(x1 + span * 0.15) - amp * 0.6 };
    var HD = { x: x1 + span * 0.5,  y: neck(x1 + span * 0.5)  - amp * 1.0 };
    var RS = { x: x1 + span * 0.85, y: neck(x1 + span * 0.85) - amp * 0.6 };
    var labels = ['LS', 'H', 'RS'];
    var peaks = [LS, HD, RS];
    ctx.save();
    // neckline
    applyStroke(ctx, d);
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    // peak outline
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(LS.x, LS.y); ctx.lineTo(HD.x, HD.y); ctx.lineTo(RS.x, RS.y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    // fill
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.1);
    ctx.fillStyle = d.fillColor || d.color || '#ef5350';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(LS.x, LS.y); ctx.lineTo(HD.x, HD.y); ctx.lineTo(RS.x, RS.y);
    ctx.lineTo(x2, y2); ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    for (var i = 0; i < peaks.length; i++) {
      dot(ctx, peaks[i].x, peaks[i].y, 3);
      elliottLabel(ctx, peaks[i].x, peaks[i].y - 14, labels[i], d.color || '#ef5350');
    }
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    return distToSegment(x, y, x1, y1, x2, y2) < 6 ||
           (x >= Math.min(x1, x2) - 4 && x <= Math.max(x1, x2) + 4 &&
            y >= Math.min(y1, y2) - 80 - 4 && y <= Math.max(y1, y2) + 4);
  }
);

/* 41. Triangle Pattern (4 points, marks triangle breakout) ------------- */
var trianglePatternTool = makeTwoPointTool(
  {
    id: 'triangle-pattern',
    label: 'Triangle Pattern',
    icon: 'TP△',
    category: 'Prediction',
    defaultStyle: { color: '#ff9800', lineWidth: 1.5, lineStyle: 'solid', opacity: 1, fillColor: '#ff9800', fillOpacity: 0.1 },
    settings: baseSettings({ color: '#ff9800' }).concat(fillSettings({ fillColor: '#ff9800', fillOpacity: 0.1 }))
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var xl = Math.min(x1, x2), xr = Math.max(x1, x2);
    // contracting triangle: apex at right, base at left
    var top1 = { x: xl, y: Math.min(y1, y2) };
    var bot1 = { x: xl, y: Math.max(y1, y2) };
    var apex = { x: xr, y: (y1 + y2) / 2 };
    ctx.save();
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.1);
    ctx.fillStyle = d.fillColor || d.color || '#ff9800';
    ctx.beginPath();
    ctx.moveTo(top1.x, top1.y); ctx.lineTo(apex.x, apex.y);
    ctx.lineTo(bot1.x, bot1.y); ctx.closePath();
    ctx.fill();
    applyStroke(ctx, d);
    ctx.beginPath();
    ctx.moveTo(top1.x, top1.y); ctx.lineTo(apex.x, apex.y);
    ctx.lineTo(bot1.x, bot1.y); ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    // base line
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(top1.x, top1.y); ctx.lineTo(bot1.x, bot1.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    elliottLabel(ctx, apex.x, apex.y - 12, 'A', d.color || '#ff9800');
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var xl = Math.min(x1, x2), xr = Math.max(x1, x2);
    var top1 = { x: xl, y: Math.min(y1, y2) };
    var bot1 = { x: xl, y: Math.max(y1, y2) };
    var apex = { x: xr, y: (y1 + y2) / 2 };
    return distToSegment(x, y, top1.x, top1.y, apex.x, apex.y) < 6 ||
           distToSegment(x, y, bot1.x, bot1.y, apex.x, apex.y) < 6 ||
           distToSegment(x, y, top1.x, top1.y, bot1.x, bot1.y) < 6;
  }
);

/* =========================================================================
 * 14. TOOL DEFINITIONS — MEASUREMENT (4)
 * ========================================================================= */

function measureLabel(ctx, x, y, text, color) {
  ctx.font = 'bold 11px -apple-system, Segoe UI, Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var w = ctx.measureText(text).width + 10;
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x - w / 2, y - 9, w, 18, 4); ctx.fill(); }
  else ctx.fillRect(x - w / 2, y - 9, w, 18);
  ctx.fillStyle = '#1e222d';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

/* 42. Ruler (distance + price + time) ---------------------------------- */
var rulerTool = makeTwoPointTool(
  {
    id: 'ruler',
    label: 'Ruler',
    icon: '📏',
    category: 'Measurement',
    defaultStyle: { color: '#d1d4dc', lineWidth: 1.5, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings({ color: '#d1d4dc' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var pxDist = dist(x1, y1, x2, y2);
    var priceDiff = d.p2 - d.p1;
    var bars = Math.round(d.i2 - d.i1);
    ctx.save();
    applyStroke(ctx, d);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    // end dots
    ctx.globalAlpha = 1;
    dot(ctx, x1, y1, 3); dot(ctx, x2, y2, 3);
    // label at midpoint
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.fillStyle = d.color || '#d1d4dc';
    var txt = pxDist.toFixed(0) + 'px  Δ' + formatPrice(priceDiff) + '  ' + bars + ' bars';
    measureLabel(ctx, mx, my - 14, txt, d.color || '#d1d4dc');
    ctx.restore();
  },
  hitLine
);

/* 43. Price Measure ---------------------------------------------------- */
var priceMeasureTool = makeTwoPointTool(
  {
    id: 'price-measure',
    label: 'Price Measure',
    icon: 'Δ₽',
    category: 'Measurement',
    defaultStyle: { color: '#2962ff', lineWidth: 1, lineStyle: 'dashed', opacity: 1 },
    settings: baseSettings({ color: '#2962ff', lineStyle: 'dashed' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var yt = Math.min(y1, y2), yb = Math.max(y1, y2);
    var priceDiff = d.p2 - d.p1;
    ctx.save();
    applyStroke(ctx, d);
    // vertical measure at the midpoint x
    var mx = (x1 + x2) / 2;
    ctx.beginPath();
    ctx.moveTo(mx, yt); ctx.lineTo(mx, yb);
    ctx.stroke();
    // little horizontal ticks
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(mx - 6, yt); ctx.lineTo(mx + 6, yt);
    ctx.moveTo(mx - 6, yb); ctx.lineTo(mx + 6, yb);
    ctx.stroke();
    // labels
    ctx.fillStyle = d.color || '#2962ff';
    measureLabel(ctx, mx, (yt + yb) / 2, 'Δ ' + formatPrice(priceDiff), d.color || '#2962ff');
    drawPriceLabel(ctx, h.chartRight, y1, formatPrice(d.p1), d.color || '#2962ff', h.THEME);
    drawPriceLabel(ctx, h.chartRight, y2, formatPrice(d.p2), d.color || '#2962ff', h.THEME);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var mx = (x1 + x2) / 2;
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    return Math.abs(x - mx) < 8 && y >= Math.min(y1, y2) - 4 && y <= Math.max(y1, y2) + 4;
  }
);

/* 44. Time Measure ----------------------------------------------------- */
var timeMeasureTool = makeTwoPointTool(
  {
    id: 'time-measure',
    label: 'Time Measure',
    icon: 'Δt',
    category: 'Measurement',
    defaultStyle: { color: '#9c27b0', lineWidth: 1, lineStyle: 'dashed', opacity: 1 },
    settings: baseSettings({ color: '#9c27b0', lineStyle: 'dashed' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var xl = Math.min(x1, x2), xr = Math.max(x1, x2);
    var bars = Math.round(d.i2 - d.i1);
    var my = (y1 + y2) / 2;
    ctx.save();
    applyStroke(ctx, d);
    ctx.beginPath();
    ctx.moveTo(xl, my); ctx.lineTo(xr, my);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(xl, my - 6); ctx.lineTo(xl, my + 6);
    ctx.moveTo(xr, my - 6); ctx.lineTo(xr, my + 6);
    ctx.stroke();
    ctx.fillStyle = d.color || '#9c27b0';
    measureLabel(ctx, (xl + xr) / 2, my - 14, bars + ' bars', d.color || '#9c27b0');
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var my = (y1 + y2) / 2;
    return Math.abs(y - my) < 8 && x >= Math.min(x1, x2) - 4 && x <= Math.max(x1, x2) + 4;
  }
);

/* 45. Percentage Measure ----------------------------------------------- */
var percentMeasureTool = makeTwoPointTool(
  {
    id: 'percent-measure',
    label: 'Percentage Measure',
    icon: 'Δ%',
    category: 'Measurement',
    defaultStyle: { color: '#26a69a', lineWidth: 1.5, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings({ color: '#26a69a' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var pct = (d.p1 !== 0) ? ((d.p2 - d.p1) / Math.abs(d.p1)) * 100 : 0;
    ctx.save();
    applyStroke(ctx, d);
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    dot(ctx, x1, y1, 3); dot(ctx, x2, y2, 3);
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.fillStyle = d.color || '#26a69a';
    var sign = pct >= 0 ? '+' : '';
    measureLabel(ctx, mx, my - 14, sign + pct.toFixed(2) + '%', d.color || '#26a69a');
    ctx.restore();
  },
  hitLine
);

/* =========================================================================
 * 15. TOOL DEFINITIONS — ADDITIONAL (6)
 * ========================================================================= */

/* 46. Quadrant Lines (4 equal sections) -------------------------------- */
var quadrantTool = makeTwoPointTool(
  {
    id: 'quadrant',
    label: 'Quadrant Lines',
    icon: 'Q┃',
    category: 'Measurement',
    defaultStyle: { color: '#787b86', lineWidth: 1, lineStyle: 'dashed', opacity: 1 },
    settings: baseSettings({ color: '#787b86', lineStyle: 'dashed' })
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    var xl = Math.min(x1, x2), xr = Math.max(x1, x2);
    ctx.save();
    applyStroke(ctx, d);
    for (var i = 0; i <= 4; i++) {
      var y = y1 + (y2 - y1) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(xl, y); ctx.lineTo(xr, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), x2 = h.indexToX(d.i2);
    var y1 = h.priceToY(d.p1), y2 = h.priceToY(d.p2);
    if (x < Math.min(x1, x2) - 4 || x > Math.max(x1, x2) + 4) return false;
    for (var i = 0; i <= 4; i++) {
      var yy = y1 + (y2 - y1) * (i / 4);
      if (Math.abs(y - yy) < 6) return true;
    }
    return false;
  }
);

/* 47. Time Cycle (1 point, vertical lines at cycle intervals) --------- */
var timeCycleTool = makeOnePointTool(
  {
    id: 'time-cycle',
    label: 'Time Cycle',
    icon: 'TC│',
    category: 'Prediction',
    defaultStyle: { color: '#9c27b0', lineWidth: 1, lineStyle: 'dashed', opacity: 1, cycle: 20 },
    settings: baseSettings({ color: '#9c27b0', lineStyle: 'dashed' }).concat([
      { key: 'cycle', label: 'Cycle (bars)', type: 'number', default: 20, min: 2, max: 500, step: 1 }
    ])
  },
  function (ctx, d, h) {
    var x0 = h.indexToX(d.i);
    var cycle = d.cycle || 20;
    var pxPerBar = h.barSpacing || 8;
    var step = cycle * pxPerBar;
    if (step < 2) step = 2;
    ctx.save();
    applyStroke(ctx, d);
    for (var off = 0; off + x0 < h.chartRight + step; off += step) {
      var xv = x0 + off;
      if (xv < h.chartLeft - 2) continue;
      ctx.beginPath();
      ctx.moveTo(xv, h.chartTop); ctx.lineTo(xv, h.chartBottom);
      ctx.stroke();
      if (off === 0) { ctx.globalAlpha = 1; dot(ctx, xv, h.chartTop + 10, 3); }
    }
    ctx.setLineDash([]);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x0 = h.indexToX(d.i);
    var cycle = d.cycle || 20;
    var step = cycle * (h.barSpacing || 8) || 2;
    var rel = x - x0;
    var idx = Math.round(rel / step);
    var xv = x0 + step * idx;
    return Math.abs(x - xv) < 6 && y >= h.chartTop - 4 && y <= h.chartBottom + 4;
  }
);

/* 48. Up Arrow (green marker) ------------------------------------------ */
function arrowMarkerDraw(color) {
  return function (ctx, d, h) {
    var x = h.indexToX(d.i), y = h.priceToY(d.p);
    var size = d.size || 16;
    var dir = d.direction || 'up';
    ctx.save();
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1);
    ctx.fillStyle = d.color || color;
    ctx.strokeStyle = d.color || color;
    ctx.lineWidth = d.lineWidth || 1.5;
    ctx.beginPath();
    if (dir === 'up') {
      ctx.moveTo(x, y - size);
      ctx.lineTo(x - size * 0.6, y + size * 0.4);
      ctx.lineTo(x - size * 0.25, y + size * 0.4);
      ctx.lineTo(x - size * 0.25, y + size);
      ctx.lineTo(x + size * 0.25, y + size);
      ctx.lineTo(x + size * 0.25, y + size * 0.4);
      ctx.lineTo(x + size * 0.6, y + size * 0.4);
    } else {
      ctx.moveTo(x, y + size);
      ctx.lineTo(x - size * 0.6, y - size * 0.4);
      ctx.lineTo(x - size * 0.25, y - size * 0.4);
      ctx.lineTo(x - size * 0.25, y - size);
      ctx.lineTo(x + size * 0.25, y - size);
      ctx.lineTo(x + size * 0.25, y - size * 0.4);
      ctx.lineTo(x + size * 0.6, y - size * 0.4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  };
}
function arrowMarkerHit(d, x, y, h) {
  var xx = h.indexToX(d.i), yy = h.priceToY(d.p);
  var size = d.size || 16;
  return Math.abs(x - xx) < size + 4 && Math.abs(y - yy) < size + 4;
}

var arrowUpTool = makeOnePointTool(
  {
    id: 'arrow-up',
    label: 'Up Arrow',
    icon: '▲',
    category: 'Lines',
    defaultStyle: { color: '#26a69a', lineWidth: 1.5, lineStyle: 'solid', opacity: 1, size: 16, direction: 'up' },
    settings: baseSettings({ color: '#26a69a' }).concat([
      { key: 'size', label: 'Size', type: 'number', default: 16, min: 6, max: 60, step: 1 }
    ])
  },
  arrowMarkerDraw('#26a69a'),
  arrowMarkerHit
);

/* 49. Down Arrow (red marker) ------------------------------------------ */
var arrowDownTool = makeOnePointTool(
  {
    id: 'arrow-down',
    label: 'Down Arrow',
    icon: '▼',
    category: 'Lines',
    defaultStyle: { color: '#ef5350', lineWidth: 1.5, lineStyle: 'solid', opacity: 1, size: 16, direction: 'down' },
    settings: baseSettings({ color: '#ef5350' }).concat([
      { key: 'size', label: 'Size', type: 'number', default: 16, min: 6, max: 60, step: 1 }
    ])
  },
  arrowMarkerDraw('#ef5350'),
  arrowMarkerHit
);

/* 50. Flag (2 points, flag shape) -------------------------------------- */
var flagTool = makeTwoPointTool(
  {
    id: 'flag',
    label: 'Flag',
    icon: '⚑',
    category: 'Shapes',
    defaultStyle: { color: '#ef5350', lineWidth: 1, lineStyle: 'solid', opacity: 1, fillColor: '#ef5350', fillOpacity: 0.6 },
    settings: baseSettings({ color: '#ef5350' }).concat(fillSettings({ fillColor: '#ef5350', fillOpacity: 0.6 }))
  },
  function (ctx, d, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    var w = Math.abs(x2 - x1), hh = Math.abs(y2 - y1);
    if (w < 2) w = 2;
    if (hh < 2) hh = 20;
    var px = x1, py = y1;
    ctx.save();
    applyStroke(ctx, d);
    // flagpole
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py - hh);
    ctx.stroke();
    // flag body (triangle pointing right)
    ctx.globalAlpha = (d.opacity != null ? d.opacity : 1) * (d.fillOpacity != null ? d.fillOpacity : 0.6);
    ctx.fillStyle = d.fillColor || d.color || '#ef5350';
    ctx.beginPath();
    ctx.moveTo(px, py - hh);
    ctx.lineTo(px + w, py - hh + hh * 0.3);
    ctx.lineTo(px, py - hh + hh * 0.6);
    ctx.closePath();
    ctx.fill();
    applyStroke(ctx, d);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },
  function (d, x, y, h) {
    var x1 = h.indexToX(d.i1), y1 = h.priceToY(d.p1);
    var x2 = h.indexToX(d.i2), y2 = h.priceToY(d.p2);
    return distToSegment(x, y, x1, y1, x1, y1 - Math.abs(y2 - y1)) < 6 ||
           (x >= Math.min(x1, x2) - 4 && x <= Math.max(x1, x2) + 4 &&
            y >= Math.min(y1, y2) - Math.abs(y2 - y1) - 4 && y <= Math.max(y1, y2) + 4);
  }
);

/* 51. Eraser (click on a drawing to delete it) ------------------------- */
var eraserTool = function (chart) {
  return {
    id: 'eraser',
    label: 'Eraser',
    icon: '✕',
    category: 'Lines',
    defaultStyle: { color: '#ef5350', lineWidth: 1, lineStyle: 'solid', opacity: 1 },
    settings: baseSettings({ color: '#ef5350' }),
    // onStart is called when the user clicks with the eraser active.
    // We iterate the chart's drawings, hit-test each, and remove the topmost.
    // NOTE: chart-webgl.js has a built-in 'eraser' that already deletes the
    // hovered drawing on click; this custom onStart is a fallback that also
    // works if the built-in path is bypassed.
    onStart: function (c) {
      if (!chart) return null;
      var helpers = (typeof chart._drawingHelpers === 'function') ? chart._drawingHelpers() : null;
      var removed = false;
      for (var i = chart.drawings.length - 1; i >= 0; i--) {
        var d = chart.drawings[i];
        // try the custom tool's onHitTest first
        var t = chart._customTools && chart._customTools[d.type];
        var hit = false;
        if (t && typeof t.onHitTest === 'function' && helpers) {
          try { hit = !!t.onHitTest(d, c.x, c.y, helpers); } catch (e) { hit = false; }
        }
        // fallback: distance to any stored x/y endpoints
        if (!hit) {
          var xs = [d.x1, d.x2, d.x], ys = [d.y1, d.y2, d.y];
          for (var k = 0; k < xs.length; k++) {
            if (xs[k] != null && ys[k] != null && dist(c.x, c.y, xs[k], ys[k]) < 12) { hit = true; break; }
          }
        }
        if (hit) {
          chart.drawings.splice(i, 1);
          if (chart.selectedDrawing === d) chart.selectedDrawing = null;
          if (chart.hoverDrawing === d) chart.hoverDrawing = null;
          removed = true;
          break;
        }
      }
      if (removed) {
        try { chart.showToast('Drawing deleted'); } catch (e) {}
        try { chart.invalidate(); } catch (e) {}
      }
      return null;  // never create a drawing for the eraser
    },
    onUpdate: function () {},
    onDraw: function () {},
    onHitTest: function () { return false; },
    onApplySettings: function () {}
  };
};

/* =========================================================================
 * 16. TOOL REGISTRY
 *
 * TOOL_FACTORIES is the ordered list of every tool factory. The order here
 * defines the order returned by BadiTools.getTools() (for UI toolbars).
 * ========================================================================= */
var TOOL_FACTORIES = [
  /* Lines (8) */
  trendTool, hlineTool, vlineTool, rayTool, extendedTool, channelTool, arrowLineTool, brushTool,
  /* Fibonacci (7) */
  fibRetracementTool, fibExtensionTool, fibFanTool, fibArcTool, fibTimezoneTool, fibSpeedTool, fibCircleTool,
  /* Shapes (8) */
  rectangleTool, circleTool, ellipseTool, triangleTool, polygonTool, cloudTool, arrowShapeTool, heartTool,
  /* Gann (5) */
  gannFanTool, gannBoxTool, gannGridTool, gannSquareTool, gannHexagonTool,
  /* Elliott (4) */
  elliottWaveTool, elliottCorrectionTool, elliottTriangleTool, elliottFlatTool,
  /* Text (4) */
  textTool, noteTool, labelTool, commentTool,
  /* Prediction (5) */
  pitchforkTool, schiffPitchforkTool, cycleLinesTool, headShouldersTool, trianglePatternTool,
  /* Measurement (4) */
  rulerTool, priceMeasureTool, timeMeasureTool, percentMeasureTool,
  /* Additional (6) */
  quadrantTool, timeCycleTool, arrowUpTool, arrowDownTool, flagTool, eraserTool
];

/* Build a metadata-only snapshot of a tool (no closures needed). */
function snapshotTool(tool) {
  return {
    id: tool.id,
    label: tool.label,
    icon: tool.icon,
    category: tool.category,
    defaultStyle: tool.defaultStyle,
    settings: tool.settings
  };
}

/** Cached metadata (built once). Calling a factory with `null` is safe: the
 *  hooks close over null but are never invoked during UI metadata reads. */
var TOOLS_METADATA = null;
function getMetadata() {
  if (TOOLS_METADATA) return TOOLS_METADATA;
  TOOLS_METADATA = [];
  for (var i = 0; i < TOOL_FACTORIES.length; i++) {
    try { TOOLS_METADATA.push(snapshotTool(TOOL_FACTORIES[i](null))); }
    catch (e) { /* skip broken factory */ }
  }
  return TOOLS_METADATA;
}

/* =========================================================================
 * 17. SETTINGS PANEL (floating HTML overlay)
 * ========================================================================= */

/** Find the tool definition registered on a chart for a given drawing. */
function findToolForDrawing(chart, drawing) {
  if (!chart || !drawing) return null;
  // 1. exact match by drawing.type in the chart's registered custom tools
  if (chart._customTools && chart._customTools[drawing.type]) {
    return chart._customTools[drawing.type];
  }
  // 2. fall back to the BadiTools registry by id == drawing.type
  var meta = getMetadata();
  for (var i = 0; i < meta.length; i++) {
    if (meta[i].id === drawing.type) return meta[i];
  }
  return null;
}

/** Remove any existing settings panel owned by this chart. */
function closeSettingsPanel(chart) {
  if (!chart) return;
  var panel = chart._badiSettingsPanel;
  if (panel && panel.parentNode) {
    try { panel.parentNode.removeChild(panel); } catch (e) {}
  }
  chart._badiSettingsPanel = null;
}

/** Inject the panel's CSS <style> once (idempotent). */
function ensurePanelStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('badi-tools-panel-css')) return;
  var st = document.createElement('style');
  st.id = 'badi-tools-panel-css';
  st.textContent = [
    '.badi-tools-settings{position:absolute;z-index:1000;min-width:240px;max-width:300px;',
    'background:#1e222d;border:1px solid #2a2e39;border-radius:8px;',
    'box-shadow:0 8px 32px rgba(0,0,0,0.45);color:#d1d4dc;font:12px -apple-system,Segoe UI,Roboto,sans-serif;',
    'padding:0;user-select:none;}',
    '.badi-tools-settings .bts-head{display:flex;align-items:center;justify-content:space-between;',
    'padding:8px 10px;background:#2a2e39;border-radius:8px 8px 0 0;border-bottom:1px solid #2a2e39;',
    'font-weight:600;font-size:12px;}',
    '.badi-tools-settings .bts-close{cursor:pointer;color:#787b86;font-size:16px;line-height:1;',
    'padding:0 4px;border:0;background:transparent;}',
    '.badi-tools-settings .bts-close:hover{color:#ef5350;}',
    '.badi-tools-settings .bts-body{padding:8px 10px;max-height:380px;overflow-y:auto;}',
    '.badi-tools-settings .bts-row{display:flex;align-items:center;justify-content:space-between;',
    'padding:4px 0;gap:8px;}',
    '.badi-tools-settings .bts-row label{flex:0 0 auto;color:#9ca3af;font-size:11px;}',
    '.badi-tools-settings .bts-row input[type=color]{width:32px;height:22px;border:1px solid #2a2e39;',
    'border-radius:3px;background:transparent;padding:0;cursor:pointer;}',
    '.badi-tools-settings .bts-row input[type=number]{width:70px;background:#15171c;border:1px solid #2a2e39;',
    'border-radius:3px;color:#d1d4dc;padding:3px 5px;font-size:11px;}',
    '.badi-tools-settings .bts-row input[type=text]{flex:1 1 auto;min-width:90px;background:#15171c;',
    'border:1px solid #2a2e39;border-radius:3px;color:#d1d4dc;padding:3px 5px;font-size:11px;}',
    '.badi-tools-settings .bts-row select{background:#15171c;border:1px solid #2a2e39;border-radius:3px;',
    'color:#d1d4dc;padding:2px 4px;font-size:11px;}',
    '.badi-tools-settings .bts-row input[type=checkbox]{width:16px;height:16px;cursor:pointer;}',
    '.badi-tools-settings .bts-actions{display:flex;gap:6px;padding:8px 10px;border-top:1px solid #2a2e39;}',
    '.badi-tools-settings .bts-btn{flex:1;padding:6px 8px;border-radius:4px;border:1px solid #2a2e39;',
    'background:#2962ff;color:#fff;font-size:11px;font-weight:600;cursor:pointer;text-align:center;}',
    '.badi-tools-settings .bts-btn:hover{filter:brightness(1.1);}',
    '.badi-tools-settings .bts-btn.bts-cancel{background:#2a2e39;color:#d1d4dc;}'
  ].join('');
  (document.head || document.body).appendChild(st);
}

/**
 * Open a floating settings panel for a drawing.
 * @param {BadiCharts} chart
 * @param {object} drawing  the drawing object to edit
 */
function openSettingsPanel(chart, drawing) {
  if (typeof document === 'undefined') return;
  if (!chart || !drawing) return;
  var tool = findToolForDrawing(chart, drawing);
  if (!tool) {
    try { chart.showToast('No settings for ' + drawing.type); } catch (e) {}
    return;
  }
  var settings = tool.settings;
  if (!settings || settings.length === 0) {
    try { chart.showToast('No editable settings'); } catch (e) {}
    return;
  }
  closeSettingsPanel(chart);
  ensurePanelStyles();

  var panel = document.createElement('div');
  panel.className = 'badi-tools-settings';

  // Head
  var head = document.createElement('div');
  head.className = 'bts-head';
  var title = document.createElement('span');
  title.textContent = (tool.label || tool.id || drawing.type) + ' Settings';
  head.appendChild(title);
  var closeBtn = document.createElement('button');
  closeBtn.className = 'bts-close';
  closeBtn.type = 'button';
  closeBtn.innerHTML = '&times;';
  closeBtn.title = 'Close';
  closeBtn.onclick = function () { closeSettingsPanel(chart); };
  head.appendChild(closeBtn);
  panel.appendChild(head);

  // Body (fields)
  var body = document.createElement('div');
  body.className = 'bts-body';
  var inputs = {};
  for (var i = 0; i < settings.length; i++) {
    var s = settings[i];
    var row = document.createElement('div');
    row.className = 'bts-row';
    var lbl = document.createElement('label');
    lbl.textContent = s.label || s.key;
    lbl.htmlFor = 'bts-' + s.key;
    row.appendChild(lbl);

    var val = drawing[s.key];
    if (val === undefined) val = s.default;

    var el;
    if (s.type === 'color') {
      el = document.createElement('input');
      el.type = 'color';
      el.value = normalizeColor(val);
    } else if (s.type === 'number') {
      el = document.createElement('input');
      el.type = 'number';
      el.value = val;
      if (s.min !== undefined) el.min = s.min;
      if (s.max !== undefined) el.max = s.max;
      if (s.step !== undefined) el.step = s.step;
    } else if (s.type === 'select') {
      el = document.createElement('select');
      var opts = s.options || [];
      for (var o = 0; o < opts.length; o++) {
        var op = document.createElement('option');
        op.value = opts[o]; op.textContent = opts[o];
        if (opts[o] === val) op.selected = true;
        el.appendChild(op);
      }
    } else if (s.type === 'boolean') {
      el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = !!val;
    } else { // text + fallback
      el = document.createElement('input');
      el.type = 'text';
      el.value = (val == null) ? '' : String(val);
    }
    el.id = 'bts-' + s.key;
    inputs[s.key] = el;
    row.appendChild(el);
    body.appendChild(row);
  }
  panel.appendChild(body);

  // Actions
  var actions = document.createElement('div');
  actions.className = 'bts-actions';
  var applyBtn = document.createElement('button');
  applyBtn.className = 'bts-btn';
  applyBtn.type = 'button';
  applyBtn.textContent = 'Apply';
  applyBtn.onclick = function () {
    var values = {};
    for (var j = 0; j < settings.length; j++) {
      var key = settings[j].key;
      var inp = inputs[key];
      if (!inp) continue;
      if (settings[j].type === 'boolean') {
        values[key] = !!inp.checked;
      } else if (settings[j].type === 'number') {
        var num = parseFloat(inp.value);
        if (!isFinite(num)) num = settings[j].default;
        if (settings[j].min !== undefined && num < settings[j].min) num = settings[j].min;
        if (settings[j].max !== undefined && num > settings[j].max) num = settings[j].max;
        values[key] = num;
      } else if (settings[j].type === 'select') {
        values[key] = inp.value;
      } else if (settings[j].type === 'color') {
        values[key] = inp.value;
      } else {
        values[key] = inp.value;
      }
    }
    try {
      if (typeof tool.onApplySettings === 'function') {
        tool.onApplySettings(drawing, values);
      } else {
        Object.assign(drawing, values);
      }
      chart.invalidate();
      chart.showToast('Settings applied');
    } catch (e) {
      try { chart.showToast('Apply failed: ' + (e && e.message)); } catch (e2) {}
    }
  };
  actions.appendChild(applyBtn);
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'bts-btn bts-cancel';
  cancelBtn.type = 'button';
  cancelBtn.textContent = 'Close';
  cancelBtn.onclick = function () { closeSettingsPanel(chart); };
  actions.appendChild(cancelBtn);
  panel.appendChild(actions);

  // Position: top-right of the chart canvas
  var rect;
  try { rect = chart.canvas.getBoundingClientRect(); } catch (e) { rect = null; }
  if (rect) {
    panel.style.position = 'absolute';
    var left = rect.right - 280;
    if (left < rect.left + 8) left = rect.left + 8;
    panel.style.left = left + 'px';
    panel.style.top  = (rect.top + 12) + 'px';
  } else {
    panel.style.position = 'fixed';
    panel.style.right = '16px';
    panel.style.top = '16px';
  }
  // Append to body (avoid being clipped by chart container overflow:hidden)
  document.body.appendChild(panel);
  chart._badiSettingsPanel = panel;

  // Close on Escape
  panel._escHandler = function (e) {
    if (e.key === 'Escape') closeSettingsPanel(chart);
  };
  document.addEventListener('keydown', panel._escHandler);
}

/** Normalize any color-ish value to #rrggbb for <input type=color>. */
function normalizeColor(v) {
  if (typeof v !== 'string') return '#2962ff';
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return '#' + v[1] + v[1] + v[2] + v[2] + v[3] + v[3];
  }
  // named / rgba() fallback
  return '#2962ff';
}

/* =========================================================================
 * 18. PUBLIC API
 * ========================================================================= */

var BadiTools = {
  VERSION: VERSION,

  /**
   * Register ALL tools with a chart instance.
   * @param {BadiCharts} chart
   * @param {object} [opts]  optional: { categories?: string[], exclude?: string[] }
   */
  attach: function (chart, opts) {
    if (!chart || typeof chart.addDrawingTool !== 'function') {
      console.error('[BadiTools] attach: invalid chart (no addDrawingTool)');
      return BadiTools;
    }
    opts = opts || {};
    var include = opts.categories;     // optional category filter
    var exclude = opts.exclude || {};  // optional id blacklist (object/map)
    var factories = (include && include.length) ? TOOL_FACTORIES.filter(function (f) {
      // we can't read category without invoking the factory; invoke with null
      var t = f(null);
      return include.indexOf(t.category) >= 0;
    }) : TOOL_FACTORIES;
    for (var i = 0; i < factories.length; i++) {
      var t = factories[i](null);
      if (exclude[t.id]) continue;
      try { chart.addDrawingTool(factories[i](chart)); }
      catch (e) { console.error('[BadiTools] attach: failed for ' + t.id, e); }
    }
    // track for Shift-snap flag propagation + cleanup
    if (attachedCharts.indexOf(chart) < 0) attachedCharts.push(chart);
    try {
      if (typeof chart.invalidate === 'function') chart.invalidate();
    } catch (e) {}
    return BadiTools;
  },

  /**
   * Register a SINGLE tool with a chart.
   * @param {BadiCharts} chart
   * @param {string} toolId
   */
  register: function (chart, toolId) {
    if (!chart || typeof chart.addDrawingTool !== 'function') {
      console.error('[BadiTools] register: invalid chart');
      return BadiTools;
    }
    for (var i = 0; i < TOOL_FACTORIES.length; i++) {
      var t = TOOL_FACTORIES[i](null);
      if (t.id === toolId) {
        try { chart.addDrawingTool(TOOL_FACTORIES[i](chart)); }
        catch (e) { console.error('[BadiTools] register: failed for ' + toolId, e); }
        if (attachedCharts.indexOf(chart) < 0) attachedCharts.push(chart);
        return BadiTools;
      }
    }
    console.warn('[BadiTools] register: unknown tool id "' + toolId + '"');
    return BadiTools;
  },

  /**
   * Return tool definitions for building a UI toolbar.
   * @param {string} [category]  optional filter; omit for all tools
   * @returns {Array<{id,label,icon,category,defaultStyle,settings}>}
   */
  getTools: function (category) {
    var meta = getMetadata();
    if (!category) return meta.slice();
    return meta.filter(function (t) { return t.category === category; });
  },

  /** Return the list of unique categories (in definition order). */
  getCategories: function () {
    var meta = getMetadata();
    var out = [];
    for (var i = 0; i < meta.length; i++) {
      if (out.indexOf(meta[i].category) < 0) out.push(meta[i].category);
    }
    return out;
  },

  /**
   * Open the floating settings panel for a drawing.
   * @param {BadiCharts} chart
   * @param {object} drawing
   */
  openSettings: function (chart, drawing) {
    openSettingsPanel(chart, drawing);
    return BadiTools;
  },

  /** Close any open settings panel on this chart. */
  closeSettings: function (chart) {
    closeSettingsPanel(chart);
    return BadiTools;
  },

  /**
   * Enable / disable persistent OHLC snapping for a chart.
   * @param {BadiCharts} chart
   * @param {boolean} enabled
   */
  setSnap: function (chart, enabled) {
    if (!chart) return BadiTools;
    chart._badiSnapEnabled = !!enabled;
    chart._badiToolsSnap = !!enabled;
    return BadiTools;
  },

  /** Is snapping currently active (persistent OR momentary Shift)? */
  isSnapActive: function (chart) {
    return isSnapOn(chart);
  },

  /** Get a tool definition by id (metadata only). */
  getTool: function (id) {
    var meta = getMetadata();
    for (var i = 0; i < meta.length; i++) {
      if (meta[i].id === id) return meta[i];
    }
    return null;
  },

  /** Total number of tools registered. */
  count: function () { return TOOL_FACTORIES.length; }
};

/* =========================================================================
 * 19. INIT + EXPORT
 * ========================================================================= */

// Wire the Shift-to-snap listener once.
setupSnapListener();

// Export for both browser and CommonJS
if (typeof window !== 'undefined') {
  window.BadiTools = BadiTools;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BadiTools;
}

})();
