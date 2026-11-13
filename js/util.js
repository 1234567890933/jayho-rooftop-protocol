/* ============================================================================
   util.js — small, dependency-free helpers shared by every module.
   ========================================================================= */
(function (G) {
  'use strict';

  var U = {};

  /* ------------------------------------------------------------------ math */
  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.inv = function (a, b, v) { return b === a ? 0 : U.clamp((v - a) / (b - a), 0, 1); };
  /* Frame-rate independent exponential smoothing.
     NOTE: the obvious `Math.pow(1 - rate, dt*60)` returns NaN for rate > 1,
     which silently poisons everything downstream. exp() cannot. */
  U.smooth = function (a, b, rate, dt) {
    return a + (b - a) * (1 - Math.exp(-Math.max(0, rate) * dt));
  };
  U.dist = function (x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); };
  U.angleDiff = function (a, b) {
    var d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  U.rand = function (a, b) { return a + Math.random() * (b - a); };
  U.randInt = function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); };
  U.pick = function (arr) { return arr[(Math.random() * arr.length) | 0]; };
  U.chance = function (p) { return Math.random() < p; };

  /* Deterministic PRNG (mulberry32) so a replay of the same act feels fair */
  U.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* ---------------------------------------------------------------- easing */
  U.ease = {
    outQuad: function (t) { return t * (2 - t); },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    outQuart: function (t) { return 1 - Math.pow(1 - t, 4); },
    outExpo: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    inOutCubic: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    backOut: function (t) { var c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
  };

  /* ---------------------------------------------------------------- colour */
  U.rgba = function (r, g, b, a) { return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; };

  U.mixHex = function (h1, h2, t) {
    var a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    var r = Math.round(U.lerp((a >> 16) & 255, (b >> 16) & 255, t));
    var g = Math.round(U.lerp((a >> 8) & 255, (b >> 8) & 255, t));
    var bl = Math.round(U.lerp(a & 255, b & 255, t));
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  };

  /* ------------------------------------------------------------------ time */
  U.fmtTime = function (sec) {
    var s = Math.max(0, Math.floor(sec));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  };

  /* --------------------------------------------------------------- storage */
  U.store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('jayho.' + k); return v == null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem('jayho.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ }
    }
  };

  /* ---------------------------------------------------------------- canvas */
  U.roundRect = function (ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  };

  /* A soft radial blob drawn with a cached sprite (no per-frame gradients) */
  U.makeGlowSprite = function (size, rgb) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var r = size / 2;
    var grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(' + rgb + ',1)');
    grad.addColorStop(.25, 'rgba(' + rgb + ',.55)');
    grad.addColorStop(.6, 'rgba(' + rgb + ',.12)');
    grad.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  };

  U.makeRingSprite = function (size, rgb) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var r = size / 2 - 4;
    g.strokeStyle = 'rgba(' + rgb + ',1)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    g.stroke();
    return c;
  };

  /* Text with an outer glow — used for in-world labels */
  U.glowText = function (ctx, text, x, y, size, color, glow, font) {
    ctx.save();
    ctx.font = '700 ' + size + 'px ' + (font || 'Space Grotesk, sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = size * 0.7;
    }
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  /* -------------------------------------------------------------- polyline */
  U.polyLength = function (pts) {
    var L = 0;
    for (var i = 1; i < pts.length; i++) L += U.dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    return L;
  };

  /* Project a point onto a polyline; returns {t, d, x, y} with t in 0..1 */
  U.projectOnPath = function (pts, px, py) {
    var total = U.polyLength(pts);
    var best = { t: 0, d: 1e9, x: pts[0][0], y: pts[0][1] };
    var acc = 0;
    for (var i = 1; i < pts.length; i++) {
      var ax = pts[i - 1][0], ay = pts[i - 1][1];
      var bx = pts[i][0], by = pts[i][1];
      var vx = bx - ax, vy = by - ay;
      var len2 = vx * vx + vy * vy || 1;
      var t = U.clamp(((px - ax) * vx + (py - ay) * vy) / len2, 0, 1);
      var qx = ax + vx * t, qy = ay + vy * t;
      var d = U.dist(px, py, qx, qy);
      if (d < best.d) {
        var segLen = Math.sqrt(len2);
        best = { t: total > 0 ? (acc + segLen * t) / total : 0, d: d, x: qx, y: qy };
      }
      acc += Math.sqrt(len2);
    }
    return best;
  };

  U.pointAt = function (pts, t) {
    var total = U.polyLength(pts);
    var target = U.clamp(t, 0, 1) * total;
    var acc = 0;
    for (var i = 1; i < pts.length; i++) {
      var seg = U.dist(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      if (acc + seg >= target) {
        var k = seg > 0 ? (target - acc) / seg : 0;
        return [U.lerp(pts[i - 1][0], pts[i][0], k), U.lerp(pts[i - 1][1], pts[i][1], k)];
      }
      acc += seg;
    }
    return [pts[pts.length - 1][0], pts[pts.length - 1][1]];
  };

  /* ------------------------------------------------------------------ misc */
  U.isTouchDevice = function () {
    return ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  };

  U.isIOS = function () {
    return /iP(hone|ad|od)/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  };

  G.U = U;
})(window);
