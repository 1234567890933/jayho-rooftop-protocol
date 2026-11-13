/* ============================================================================
   particles.js — one pooled particle system for the whole game.
   ----------------------------------------------------------------------------
   1200 slots, allocated once, never garbage collected. Emitters are the only
   allocation-free way in. Every emitter respects `thermal.particleScale`, so a
   hot phone automatically gets a quieter sky instead of a slideshow.
   ========================================================================= */
(function (G) {
  'use strict';

  var U = G.U;

  function Particles(capacity) {
    this.cap = capacity || 1200;
    this.pool = new Array(this.cap);
    for (var i = 0; i < this.cap; i++) {
      this.pool[i] = {
        x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0,
        life: 0, max: 1, size: 1, endSize: 0,
        drag: 1, grav: 0, spin: 0, rot: 0,
        a: 1, rgb: '255,201,107', kind: 0, active: false, idx: i
      };
    }
    this.freeTop = this.cap;
    this.free = new Int32Array(this.cap);
    for (var k = 0; k < this.cap; k++) this.free[k] = this.cap - 1 - k;
    this.live = 0;

    /* sprites: one per colour family, forged once */
    this.sprites = {
      gold: U.makeGlowSprite(64, '255,201,107'),
      goldHot: U.makeGlowSprite(64, '255,231,168'),
      cyan: U.makeGlowSprite(64, '34,225,255'),
      magenta: U.makeGlowSprite(64, '255,79,216'),
      ember: U.makeGlowSprite(64, '255,107,53'),
      white: U.makeGlowSprite(64, '234,242,255'),
      mint: U.makeGlowSprite(64, '80,240,190')
    };
    /* Wind field: a coarse grid baked once (on Android by the C++ noise
       function) and bilinearly sampled per particle. No trig in the loop. */
    this.field = null;
    this.fieldN = 0;

    this.rings = {
      gold: U.makeRingSprite(128, '255,201,107'),
      cyan: U.makeRingSprite(128, '34,225,255'),
      white: U.makeRingSprite(128, '255,255,255')
    };
  }

  Particles.prototype._get = function () {
    if (this.freeTop === 0) return null;
    var p = this.pool[this.free[--this.freeTop]];
    p.active = true;
    this.live++;
    return p;
  };

  Particles.prototype._put = function (p) {
    if (!p.active) return;
    p.active = false;
    this.live--;
    this.free[this.freeTop++] = p.idx;
  };

  Particles.prototype.clear = function () {
    for (var i = 0; i < this.cap; i++) this.pool[i].active = false;
    this.freeTop = 0;
    for (var k = 0; k < this.cap; k++) this.free[k] = this.cap - 1 - k;
    this.freeTop = this.cap;      /* the free list is full again — not empty */
    this.live = 0;
  };

  /* --------------------------------------------------------------- emitters */
  Particles.prototype.burst = function (x, y, opts) {
    opts = opts || {};
    var scale = opts.scale == null ? 1 : opts.scale;
    var count = Math.round((opts.count || 40) * scale);
    var speed = opts.speed || 300;
    var life = opts.life || 1.1;
    var size = opts.size || 5;
    var spread = opts.spread == null ? 1 : opts.spread;
    var kind = opts.kind || 0;
    var rgb = opts.rgb || '255,201,107';

    for (var i = 0; i < count; i++) {
      var p = this._get();
      if (!p) return;
      var ang = (i / count) * Math.PI * 2 + U.rand(-0.08, 0.08);
      var v = speed * (1 - spread * 0.5 + Math.random() * spread * 0.55);
      p.x = p.px = x; p.y = p.py = y;
      p.vx = Math.cos(ang) * v;
      p.vy = Math.sin(ang) * v;
      p.life = 0;
      p.max = life * U.rand(0.65, 1.2);
      p.size = size * U.rand(0.6, 1.4);
      p.endSize = p.size * 0.15;
      p.drag = opts.drag == null ? 0.985 : opts.drag;
      p.grav = opts.grav == null ? 120 : opts.grav;
      p.a = 1;
      p.rgb = rgb;
      p.kind = kind;
      p.spin = U.rand(-4, 4);
      p.rot = 0;
    }
  };

  Particles.prototype.emit = function (x, y, vx, vy, opts) {
    opts = opts || {};
    var p = this._get();
    if (!p) return;
    p.x = p.px = x; p.y = p.py = y;
    p.vx = vx; p.vy = vy;
    p.life = 0;
    p.max = opts.life || 0.8;
    p.size = opts.size || 3;
    p.endSize = opts.endSize == null ? p.size * 0.2 : opts.endSize;
    p.drag = opts.drag == null ? 0.97 : opts.drag;
    p.grav = opts.grav || 0;
    p.a = opts.a == null ? 1 : opts.a;
    p.rgb = opts.rgb || '255,201,107';
    p.kind = opts.kind || 1;
    p.spin = opts.spin || 0;
    p.rot = 0;
  };

  Particles.prototype.trail = function (x, y, dirX, dirY, opts) {
    opts = opts || {};
    var n = Math.round((opts.count || 2) * (opts.scale || 1));
    for (var i = 0; i < n; i++) {
      var spread = opts.spread == null ? 0.7 : opts.spread;
      var ang = Math.atan2(dirY, dirX) + U.rand(-spread, spread);
      var v = (opts.speed || 90) * U.rand(0.3, 1);
      this.emit(x + U.rand(-4, 4), y + U.rand(-4, 4),
        Math.cos(ang) * v, Math.sin(ang) * v, {
          life: (opts.life || 0.7) * U.rand(0.6, 1.2),
          size: (opts.size || 4) * U.rand(0.6, 1.3),
          drag: opts.drag || 0.95,
          grav: opts.grav || 0,
          rgb: opts.rgb || '255,201,107',
          kind: 1,
          a: opts.a == null ? 0.9 : opts.a
        });
    }
  };

  Particles.prototype.ring = function (x, y, opts) {
    opts = opts || {};
    var p = this._get();
    if (!p) return;
    p.x = p.px = x; p.y = p.py = y;
    p.vx = 0; p.vy = 0;
    p.life = 0;
    p.max = opts.life || 0.8;
    p.size = opts.size || 40;
    p.endSize = opts.endSize || 420;
    p.drag = 1; p.grav = 0;
    p.a = opts.a == null ? 0.9 : opts.a;
    p.rgb = opts.rgb || '255,201,107';
    p.kind = 3;
    p.spin = 0; p.rot = 0;
  };

  /* ---------------------------------------------------------------- update */
  /* Install a field: Float32Array of n*n*2 (vx, vy in -1..1) */
  Particles.prototype.setField = function (arr, n) {
    this.field = arr;
    this.fieldN = n;
  };

  /* Bilinear sample, clamped at the edges */
  Particles.prototype._wind = function (x, y, out) {
    var n = this.fieldN, f = this.field;
    var gx = (x / 1080) * (n - 1);
    var gy = (y / 1920) * (n - 1);
    var x0 = gx | 0, y0 = gy | 0;
    var fx = gx - x0, fy = gy - y0;
    var x1 = x0 + 1 < n ? x0 + 1 : x0;
    var y1 = y0 + 1 < n ? y0 + 1 : y0;
    var i00 = (y0 * n + x0) * 2, i10 = (y0 * n + x1) * 2;
    var i01 = (y1 * n + x0) * 2, i11 = (y1 * n + x1) * 2;
    out[0] = (f[i00] * (1 - fx) + f[i10] * fx) * (1 - fy) + (f[i01] * (1 - fx) + f[i11] * fx) * fy;
    out[1] = (f[i00 + 1] * (1 - fx) + f[i10 + 1] * fx) * (1 - fy) + (f[i01 + 1] * (1 - fx) + f[i11 + 1] * fx) * fy;
    return out;
  };

  var _windOut = [0, 0];

  Particles.prototype.update = function (dt, w, h) {
    var pool = this.pool;
    for (var i = 0; i < this.cap; i++) {
      var p = pool[i];
      if (!p.active) continue;

      p.px = p.x; p.py = p.y;
      p.vy += p.grav * dt;

      /* light particles ride the field; heavy sparks ignore it */
      if (this.field && p.kind !== 3) {
        this._wind(p.x, p.y, _windOut);
        var strength = p.kind === 2 ? 26 : 14;
        p.vx += _windOut[0] * strength * dt;
        p.vy += _windOut[1] * strength * dt;
      }
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life += dt;

      if (p.life >= p.max) { this._put(p); continue; }

      var k = p.life / p.max;
      p.a = k < 0.1 ? k / 0.1 : 1 - U.ease.outQuad(k);
      if (p.kind === 3) p.size = U.lerp(p.size, p.endSize, Math.min(1, dt * 6));
      else p.size = U.lerp(p.size, p.endSize, Math.min(1, dt * 2.2));

      /* cull anything that leaves the world by a wide margin */
      if (p.y > h + 260 || p.x < -400 || p.x > w + 400) this._put(p);
    }
  };

  /* ----------------------------------------------------------------- draw */
  Particles.prototype.draw = function (ctx) {
    var pool = this.pool;
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < this.cap; i++) {
      var p = pool[i];
      if (!p.active) continue;

      if (p.kind === 3) {
        var ring = this.rings[p.rgb === '34,225,255' ? 'cyan' : (p.rgb === '255,255,255' ? 'white' : 'gold')];
        ctx.globalAlpha = p.a * 0.42;
        ctx.drawImage(ring, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        continue;
      }

      var spr = this.sprites.gold;
      if (p.rgb === '34,225,255') spr = this.sprites.cyan;
      else if (p.rgb === '255,79,216') spr = this.sprites.magenta;
      else if (p.rgb === '255,107,53') spr = this.sprites.ember;
      else if (p.rgb === '234,242,255') spr = this.sprites.white;
      else if (p.rgb === '80,240,190') spr = this.sprites.mint;
      else if (p.rgb === '255,231,168') spr = this.sprites.goldHot;

      var s = p.size * 4.2;
      ctx.globalAlpha = p.a;
      ctx.drawImage(spr, p.x - s / 2, p.y - s / 2, s, s);

      /* fast sparks get a speed line */
      if (p.kind === 0) {
        var dx = p.x - p.px, dy = p.y - p.py;
        if (dx * dx + dy * dy > 26) {
          ctx.strokeStyle = 'rgba(' + p.rgb + ',' + (p.a * 0.5).toFixed(3) + ')';
          ctx.lineWidth = Math.max(1, p.size * 0.35);
          ctx.beginPath();
          ctx.moveTo(p.px, p.py);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };

  G.Particles = Particles;
})(window);
