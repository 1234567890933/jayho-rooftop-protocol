/* ============================================================================
   world.js — the parallax stage.
   ----------------------------------------------------------------------------
   Three painted plates per scene, drawn as cover-fit tiles so the layer can
   scroll forever in X. Parallax factors are hand-tuned per scene: the lane is
   fast and shallow (you are running), the terrace is slow and tall (you are
   standing still and looking up).

   The renderer also owns: camera shake, explosion flashes, scene cross-fade,
   ambient dust and ground fog. Acts draw their own entities on top.
   ========================================================================= */
(function (G) {
  'use strict';

  var U = G.U;

  var SCENES = {
    title: {
      group: 'title',
      layers: [
        { k: 'night_far', p: 0.04, y: 0.0 },
        { k: 'night_atmo', p: 0.06, y: 0.0, blend: 'lighter' }
      ],
      tint: 'rgba(6,10,20,0.35)',
      fog: 'rgba(40,70,120,0.10)',
      drift: 8
    },
    lane: {
      group: 'lane',
      layers: [
        { k: 'lane_far', p: 0.05, y: 0.00 },
        { k: 'lane_mid', p: 0.22, y: 0.00 },
        { k: 'lane_atmo', p: 0.26, y: 0.00, blend: 'lighter' },
        { k: 'lane_near', p: 0.55, y: 0.00 },
        { k: 'lane_fg', p: 0.92, y: 0.00 }
      ],
      tint: 'rgba(28,10,26,0.18)',
      fog: 'rgba(255,170,110,0.07)',
      drift: 0
    },
    stairs: {
      group: 'stairs',
      layers: [
        { k: 'stairs_far', p: 0.05, y: 0.0 },
        { k: 'stairs_mid', p: 0.22, y: 0.0 },
        { k: 'stairs_atmo', p: 0.28, y: 0.0, blend: 'lighter' },
        { k: 'stairs_fg', p: 0.85, y: 0.0 }
      ],
      tint: 'rgba(14,10,26,0.22)',
      fog: 'rgba(120,140,200,0.06)',
      drift: 0
    },
    dusk: {
      group: 'dusk',
      layers: [
        { k: 'dusk_far', p: 0.04, y: 0.0 },
        { k: 'dusk_mid', p: 0.18, y: 0.0 },
        { k: 'dusk_atmo', p: 0.24, y: 0.0, blend: 'lighter' },
        { k: 'dusk_near', p: 0.44, y: 0.0 },
        { k: 'dusk_fg', p: 0.80, y: 0.0 }
      ],
      tint: 'rgba(60,20,40,0.16)',
      fog: 'rgba(255,150,90,0.08)',
      drift: 2
    },
    night: {
      group: 'night',
      layers: [
        { k: 'night_far', p: 0.03, y: 0.0 },
        { k: 'night_mid', p: 0.16, y: 0.0 },
        { k: 'night_atmo', p: 0.22, y: 0.0, blend: 'lighter' },
        { k: 'night_near', p: 0.42, y: 0.0 },
        { k: 'night_fg', p: 0.78, y: 0.0 }
      ],
      tint: 'rgba(6,12,28,0.26)',
      fog: 'rgba(80,120,200,0.07)',
      drift: 1.5
    },
    sky: {
      group: 'sky',
      layers: [
        { k: 'sky_far', p: 0.02, y: 0.0 },
        { k: 'sky_mid', p: 0.10, y: 0.0 },
        { k: 'sky_atmo', p: 0.14, y: 0.0, blend: 'lighter' },
        { k: 'sky_near', p: 0.26, y: 0.0 },
        { k: 'sky_fg', p: 0.60, y: 0.0 }
      ],
      tint: 'rgba(4,6,14,0.20)',
      fog: 'rgba(90,70,160,0.06)',
      drift: 1
    }
  };

  function World(assets, particles) {
    this.assets = assets;
    this.particles = particles;
    this.name = null;
    this.scene = null;
    this.scroll = 0;
    this.auto = 0;
    this.time = 0;

    this.fade = 0;              /* 0..1 veil during a scene change */
    this.fadeDir = 0;

    this.shakeAmt = 0;
    this.shakeX = 0;
    this.shakeY = 0;

    this.flashes = [];
    this.dustTimer = 0;

    this.W = 1080;
    this.H = 1920;

    /* gyro look offset in world pixels; nearer layers slide further, which is
       what sells the depth when you tilt the phone */
    this.look = { x: 0, y: 0 };
  }

  World.SCENES = SCENES;

  World.prototype.setScene = function (name, opts) {
    opts = opts || {};
    if (!SCENES[name]) return;
    this.name = name;
    this.scene = SCENES[name];
    if (opts.instant) {
      this.scroll = 0;
      this.auto = 0;
      this.fade = 0;
    } else {
      this.fade = 1;
      this.fadeDir = -1;
    }
  };

  World.prototype.scrollBy = function (dx) {
    this.scroll += dx;
    /* keep the number small so float precision never drifts */
    var period = 1440;
    if (this.scroll > period) this.scroll -= period;
    if (this.scroll < -period) this.scroll += period;
  };

  World.prototype.shake = function (amount) {
    this.shakeAmt = Math.min(60, this.shakeAmt + amount);
  };

  World.prototype.flash = function (x, y, power, rgb) {
    this.flashes.push({
      x: x, y: y, p: power || 1, rgb: rgb || '255,201,107', life: 0, max: 0.55
    });
    if (this.flashes.length > 8) this.flashes.shift();
  };

  World.prototype.update = function (dt, thermal) {
    this.time += dt;
    this._lowTier = !!(thermal && thermal.tier === 0);

    if (this.scene && this.scene.drift) this.scrollBy(this.scene.drift * dt);

    /* camera shake decays exponentially */
    if (this.shakeAmt > 0.2) {
      this.shakeX = U.rand(-1, 1) * this.shakeAmt;
      this.shakeY = U.rand(-1, 1) * this.shakeAmt;
      this.shakeAmt *= Math.pow(0.0016, dt);
    } else {
      this.shakeAmt = 0;
      this.shakeX *= 0.9;
      this.shakeY *= 0.9;
    }

    /* flashes */
    for (var i = this.flashes.length - 1; i >= 0; i--) {
      var f = this.flashes[i];
      f.life += dt;
      if (f.life >= f.max) this.flashes.splice(i, 1);
    }

    /* ambient dust — the "nothing is ever still" rule */
    if (this.particles && !(thermal && thermal.tier === 0)) {
      this.dustTimer += dt;
      var every = 0.10 / (thermal ? thermal.particleScale : 1);
      while (this.dustTimer > every) {
        this.dustTimer -= every;
        this.particles.emit(
          U.rand(-40, this.W + 40), U.rand(this.H * 0.35, this.H + 60),
          U.rand(-14, 14), U.rand(-30, -8), {
            life: U.rand(3.2, 7), size: U.rand(1.4, 3.4), endSize: 0.6,
            drag: 0.999, grav: -2, a: U.rand(0.12, 0.36),
            rgb: U.chance(0.55) ? '255,201,107' : '34,225,255', kind: 2
          });
      }
    }

    if (this.fade > 0 && this.fadeDir < 0) {
      this.fade = Math.max(0, this.fade - dt * 1.6);
    }
  };

  /* ---------------------------------------------------------------- render */
  World.prototype._tile = function (ctx, img, x, y, w, h) {
    /* draw across the viewport, wrapping on a fixed period */
    var start = x % w;
    if (start > 0) start -= w;
    for (var px = start; px < this.W; px += w) {
      ctx.drawImage(img, px, y, w, h);
    }
  };

  World.prototype.render = function (ctx) {
    var W = this.W, H = this.H;
    if (!this.scene) {
      ctx.fillStyle = '#05070C';
      ctx.fillRect(0, 0, W, H);
      return;
    }

    /* base fill so a missing plate never shows white */
    ctx.fillStyle = this.name === 'dusk' ? '#2A1030' : '#05070C';
    ctx.fillRect(0, 0, W, H);

    var layers = this.scene.layers;
    for (var i = 0; i < layers.length; i++) {
      var L = layers[i];
      var img = this.assets.get(L.k);
      if (!img || !img.naturalWidth) continue;

      /* cover-fit: plate is 2048x2731 (0.75), world is 1080x1920 (0.5625) */
      var h = H * 1.02;
      var w = h * (img.naturalWidth / img.naturalHeight);
      var depth = L.p + 0.16;
      var x = -(w - W) / 2 - this.scroll * L.p + this.look.x * depth;
      var y = -H * 0.01 + L.y * H + this.look.y * depth;

      /* atmosphere plates are additive: they add light, they never occlude.
         On the low thermal tier they are the first thing to go — a full-screen
         additive composite is the most expensive draw in the frame. */
      if (L.blend === 'lighter') {
        if (this._lowTier) continue;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;      /* half strength: it is seasoning, not soup */
      }
      this._tile(ctx, img, x, y, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    /* mood tint + ground fog */
    if (this.scene.tint) {
      ctx.fillStyle = this.scene.tint;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.scene.fog) {
      var g = ctx.createLinearGradient(0, H * 0.55, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, this.scene.fog);
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.55, W, H * 0.45);
    }

    /* explosion flashes (additive) */
    if (this.flashes.length) {
      ctx.globalCompositeOperation = 'lighter';
      for (var k = 0; k < this.flashes.length; k++) {
        var f = this.flashes[k];
        var a = (1 - f.life / f.max) * f.p;
        var r = 520 * f.p;
        var grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        grad.addColorStop(0, 'rgba(' + f.rgb + ',' + (a * 0.85).toFixed(3) + ')');
        grad.addColorStop(0.35, 'rgba(' + f.rgb + ',' + (a * 0.3).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(' + f.rgb + ',0)');
        ctx.fillStyle = grad;
        ctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    /* scene-change veil */
    if (this.fade > 0.001) {
      ctx.fillStyle = 'rgba(4,6,10,' + this.fade.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
  };

  G.World = World;
})(window);
