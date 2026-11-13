/* ============================================================================
   input.js — one input surface, three sources: touch, keyboard, motion.
   ----------------------------------------------------------------------------
   MOTION, HONESTLY
   Device motion needs HTTPS, a user gesture (iOS 13+ asks explicitly) and a
   device that has the sensor. Any of those can say no. So the game never
   *requires* motion: `requestMotion()` resolves true or false, and every act
   has a first-class touch path. `mode` tells the HUD which prompts to show.

   Shake is measured as jerk (delta of acceleration including gravity), because
   a phone being shaken and a phone being walked with produce very different
   deltas and we only want the first.
   ========================================================================= */
(function (G) {
  'use strict';

  function Input(canvas) {
    this.canvas = canvas;
    this.handlers = {};

    /* screen → world transform, set by main.js each resize */
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;

    this.ptr = {
      x: 0, y: 0, down: false, downX: 0, downY: 0, downT: 0,
      moved: 0, lastX: 0, lastY: 0, dragX: 0, dragY: 0, id: null
    };

    this.keys = {};

    /* motion state */
    this.mode = 'touch';
    this.motionGranted = false;
    this.motionSeen = false;
    this.raw = { a: { x: 0, y: 0, z: 0 }, g: 0, b: 0, gamma: 0, beta: 0 };
    this._lastA = null;
    this.tilt = { x: 0, y: 0 };
    this.shake = 0;          /* 0..1 smoothed energy */
    this.shakePulse = 0;     /* decayed count of discrete shakes */

    this.bind();
  }

  /* ---------------------------------------------------------------- events */
  Input.prototype.on = function (evt, fn) {
    (this.handlers[evt] || (this.handlers[evt] = [])).push(fn);
    return this;
  };

  Input.prototype.emit = function (evt, data) {
    var list = this.handlers[evt];
    if (!list) return;
    for (var i = 0; i < list.length; i++) list[i](data);
  };

  /* ------------------------------------------------------------- transform */
  Input.prototype.setTransform = function (scale, ox, oy) {
    this.scale = scale; this.ox = ox; this.oy = oy;
  };

  Input.prototype.world = function (cx, cy) {
    return { x: (cx - this.ox) / this.scale, y: (cy - this.oy) / this.scale };
  };

  /* --------------------------------------------------------------- pointer */
  Input.prototype.bind = function () {
    var self = this;
    var el = this.canvas;

    function down(e) {
      var t = e.changedTouches ? e.changedTouches[0] : e;
      var w = self.world(t.clientX, t.clientY);
      var p = self.ptr;
      p.down = true;
      p.id = t.identifier == null ? 'mouse' : t.identifier;
      p.x = p.downX = p.lastX = w.x;
      p.y = p.downY = p.lastY = w.y;
      p.downT = performance.now();
      p.moved = 0;
      p.dragX = 0; p.dragY = 0;
      self.emit('down', { x: w.x, y: w.y });
    }

    function move(e) {
      var t = e.changedTouches ? e.changedTouches[0] : e;
      var w = self.world(t.clientX, t.clientY);
      var p = self.ptr;
      p.dragX = w.x - p.x;
      p.dragY = w.y - p.y;
      p.x = w.x; p.y = w.y;
      p.moved += Math.abs(p.dragX) + Math.abs(p.dragY);
      self.emit('move', { x: w.x, y: w.y, dx: p.dragX, dy: p.dragY, down: p.down });
      if (p.down && e.cancelable) e.preventDefault();
    }

    function up(e) {
      var t = e.changedTouches ? e.changedTouches[0] : e;
      var w = self.world(t.clientX, t.clientY);
      var p = self.ptr;
      if (!p.down) return;
      var dt = performance.now() - p.downT;
      p.down = false;
      var isTap = dt < 260 && p.moved < 26;
      self.emit('up', { x: w.x, y: w.y, dt: dt, tap: isTap });
      if (isTap) self.emit('tap', { x: w.x, y: w.y });
    }

    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up, { passive: true });
    el.addEventListener('touchcancel', up, { passive: true });

    el.addEventListener('mousedown', down);
    window.addEventListener('mousemove', function (e) {
      if (!self.ptr.down) return;
      move(e);
    });
    window.addEventListener('mouseup', up);

    /* keyboard: space = sprint / action, arrows = tilt, enter = confirm */
    window.addEventListener('keydown', function (e) {
      if (e.repeat) return;
      self.keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); self.emit('action', {}); }
      if (e.code === 'Enter') self.emit('confirm', {});
    });
    window.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
      if (e.code === 'Space') self.emit('actionEnd', {});
    });
  };

  /* ---------------------------------------------------------------- motion */
  Input.prototype.requestMotion = function () {
    var self = this;
    var DM = G.DeviceMotionEvent;
    var DO = G.DeviceOrientationEvent;

    var ask = function (Ctor) {
      if (Ctor && typeof Ctor.requestPermission === 'function') {
        return Ctor.requestPermission().catch(function () { return 'denied'; });
      }
      return Promise.resolve('granted');
    };

    return Promise.all([ask(DM), ask(DO)]).then(function (res) {
      var granted = res[0] === 'granted';
      if (!granted) {
        self.mode = 'touch';
        return false;
      }
      self.attachMotion();
      /* give the sensor 1.4s to prove it exists */
      return new Promise(function (resolve) {
        setTimeout(function () {
          if (self.motionSeen) {
            self.mode = 'motion';
            self.motionGranted = true;
            resolve(true);
          } else {
            self.mode = 'touch';
            resolve(false);
          }
        }, 1400);
      });
    }).catch(function () {
      self.mode = 'touch';
      return false;
    });
  };

  Input.prototype.attachMotion = function () {
    var self = this;
    if (this._motionAttached) return;
    this._motionAttached = true;

    window.addEventListener('devicemotion', function (e) {
      self.motionSeen = true;
      var a = e.accelerationIncludingGravity || e.acceleration;
      if (!a || a.x == null) return;

      var cur = { x: a.x, y: a.y, z: a.z };
      if (self._lastA) {
        var d = Math.abs(cur.x - self._lastA.x) + Math.abs(cur.y - self._lastA.y) + Math.abs(cur.z - self._lastA.z);
        /* jerk above ~14 m/s² is a deliberate shake, not a walk */
        if (d > 14) {
          self.shake = Math.min(1, self.shake + d / 220);
          self.shakePulse = Math.min(6, self.shakePulse + 1);
        }
      }
      self._lastA = cur;
      self.raw.a = cur;
    }, { passive: true });

    window.addEventListener('deviceorientation', function (e) {
      self.motionSeen = true;
      if (e.gamma == null) return;
      self.raw.gamma = e.gamma;
      self.raw.beta = e.beta;

      /* Dead zone + exponential smoothing, in that order. Raw sensor data at
         60 Hz is noisy and a hand is never still; without both of these the
         box in Act II shivers on its own and the input reads as lag. */
      self.tilt.x = self._shapeTilt(e.gamma / 34);
      self.tilt.y = self._shapeTilt(((e.beta || 45) - 45) / 34);
    }, { passive: true });
  };

  /* 8% dead zone, rescaled past the edge, then a 4-frame moving average */
  Input.prototype._shapeTilt = function (v) {
    v = Math.max(-1, Math.min(1, v));
    var dz = 0.08;
    var a = Math.abs(v);
    v = a < dz ? 0 : (v > 0 ? 1 : -1) * (a - dz) / (1 - dz);
    this._tiltEma = this._tiltEma === undefined ? v : this._tiltEma + (v - this._tiltEma) * 0.25;
    return this._tiltEma;
  };

  /* Called every frame by the loop with dt in seconds */
  Input.prototype.update = function (dt) {
    /* energy decays fast: a shake is an impulse, not a state */
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.shakePulse = Math.max(0, this.shakePulse - dt * 8);

    /* keyboard tilt fallback so the whole game is playable on a laptop */
    if (this.keys.ArrowLeft) this.tilt.x = Math.max(-1, this.tilt.x - dt * 3.2);
    if (this.keys.ArrowRight) this.tilt.x = Math.min(1, this.tilt.x + dt * 3.2);
  };

  /* Is the "primary action" being held right now? (pointer or space) */
  Input.prototype.holding = function () {
    return this.ptr.down || !!this.keys.Space;
  };

  /* Sprint input for Act I: shake energy or a held press */
  Input.prototype.sprint = function () {
    if (this.mode === 'motion') return Math.min(1, this.shake * 1.6);
    return this.holding() ? 1 : 0;
  };

  G.Input = Input;
})(window);
