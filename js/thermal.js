/* ============================================================================
   thermal.js — the governor.
   ----------------------------------------------------------------------------
   A phone in a pocket, at a rooftop party, running a particle game, will get
   hot. Heat means throttled clocks, which means dropped frames, which means a
   game that feels broken. So we measure continuously and give the renderer a
   budget to spend instead of letting it beg for frames.

   Ladder (3 tiers):
     tier 2 · full      — every layer, 60 fps target, full particle cap
     tier 1 · warm      — fewer particles, no smoke, DPR capped at 1.5
     tier 0 · low       — 30 fps target, minimal particles, DPR 1, no grain

   Inputs: rolling frame time, session length, battery level (if exposed),
   page visibility. All hysteresis is deliberate: we drop fast, recover slowly,
   so the game never oscillates between tiers.
   ========================================================================= */
(function (G) {
  'use strict';

  function Thermal(opts) {
    opts = opts || {};
    this.samples = 60;
    this.frameTimes = new Float32Array(this.samples);
    this.head = 0;
    this.filled = 0;

    this.tier = 2;
    this.avgFrame = 16.7;
    this.sessionStart = performance.now();
    this.lastShift = 0;
    this.hidden = false;

    this.fpsCap = 0;               /* 0 = uncapped */
    this.dprCap = 2;
    this.particleScale = 1;
    this.smokeOn = true;
    this.grainOn = true;

    this.battery = null;
    this.onTier = opts.onTier || null;

    this.monitorBattery();
    this.bindVisibility();
  }

  Thermal.prototype.bindVisibility = function () {
    var self = this;
    document.addEventListener('visibilitychange', function () {
      self.hidden = document.hidden;
      if (!document.hidden) {
        /* returning from background: assume the device heated up a little */
        self.frameTimes.fill(0);
        self.head = 0;
        self.filled = 0;
      }
    }, { passive: true });
  };

  Thermal.prototype.monitorBattery = function () {
    var self = this;
    if (!navigator.getBattery) return;
    navigator.getBattery().then(function (b) {
      self.battery = b;
      function apply() {
        if (!b.charging && b.level < 0.18 && self.tier === 2) self.setTier(1, 'low battery');
      }
      b.addEventListener('levelchange', apply);
      b.addEventListener('chargingchange', apply);
      apply();
    }).catch(function () { /* not available */ });
  };

  /* Called once per rendered frame with the raw frame delta in ms */
  Thermal.prototype.sample = function (ms) {
    if (ms <= 0 || ms > 400) return;             /* ignore tab-switch spikes */
    this.frameTimes[this.head] = ms;
    this.head = (this.head + 1) % this.samples;
    if (this.filled < this.samples) this.filled++;

    if (this.filled < 30) return;

    var sum = 0;
    for (var i = 0; i < this.filled; i++) sum += this.frameTimes[i];
    this.avgFrame = sum / this.filled;

    var now = performance.now();
    if (now - this.lastShift < 3000) return;     /* hysteresis window */

    if (this.avgFrame > 24 && this.tier > 0) {
      this.setTier(this.tier - 1, 'slow frames (' + this.avgFrame.toFixed(1) + 'ms)');
    } else if (this.avgFrame > 18.5 && this.tier === 2) {
      this.setTier(1, 'warm (' + this.avgFrame.toFixed(1) + 'ms)');
    } else if (this.avgFrame < 14.5 && this.tier < 2 && now - this.lastShift > 12000) {
      this.setTier(this.tier + 1, 'cooling down');
    }
  };

  Thermal.prototype.setTier = function (t, reason) {
    t = Math.max(0, Math.min(2, t));
    if (t === this.tier) return;
    this.tier = t;
    this.lastShift = performance.now();

    if (t === 2) {
      this.fpsCap = 0; this.dprCap = 2; this.particleScale = 1; this.smokeOn = true; this.grainOn = true;
    } else if (t === 1) {
      this.fpsCap = 0; this.dprCap = 1.5; this.particleScale = 0.65; this.smokeOn = true; this.grainOn = false;
    } else {
      this.fpsCap = 30; this.dprCap = 1; this.particleScale = 0.35; this.smokeOn = false; this.grainOn = false;
    }

    document.documentElement.classList.toggle('tier-low', t === 0);
    if (this.onTier) this.onTier(t, reason);
  };

  Thermal.prototype.sessionMinutes = function () {
    return (performance.now() - this.sessionStart) / 60000;
  };

  /* Should the loop skip this frame to hold the fps cap? */
  Thermal.prototype.shouldSkip = function (nowMs, lastMs) {
    if (!this.fpsCap) return false;
    return (nowMs - lastMs) < (1000 / this.fpsCap) - 1.5;
  };

  G.Thermal = Thermal;
})(window);
