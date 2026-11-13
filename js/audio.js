/* ============================================================================
   audio.js — music by <audio> (streamed), effects by Web Audio (decoded).
   ----------------------------------------------------------------------------
   WHY THE SPLIT
   The three music beds are 6–8 MB WAVs. decodeAudioData would expand 45 s of
   stereo to ~16 MB of float32 RAM *each* and block the main thread doing it.
   An <audio> element streams from disk/cache with a tiny memory footprint and
   the browser's own mixer. Effects are short, need sample-accurate triggering
   and pitch variation, so those go through Web Audio buffers.

   All audio starts suspended until a real gesture, which is what every mobile
   browser requires.
   ========================================================================= */
(function (G) {
  'use strict';

  var MUSIC = {
    lane: 'assets/audio/music_lane.wav',
    climb: 'assets/audio/music_climb.wav',
    rooftop: 'assets/audio/music_rooftop.wav',
    launch: 'assets/audio/music_launch.wav',
    sky: 'assets/audio/music_sky.wav',
    finale: 'assets/audio/music_finale.wav'
  };

  /* city / wind / crowd beds, mixed well under the score */
  var AMB = {
    city: 'assets/audio/amb_city.wav',
    wind: 'assets/audio/amb_wind.wav',
    crowd: 'assets/audio/amb_crowd.wav'
  };

  var SFX = {
    step: 'assets/audio/sfx_step.wav',
    thud: 'assets/audio/sfx_thud.wav',
    tape: 'assets/audio/sfx_tape.wav',
    fuse: 'assets/audio/sfx_fuse.wav',
    click: 'assets/audio/sfx_click.wav',
    whistle: 'assets/audio/sfx_whistle.wav',
    boom: 'assets/audio/sfx_boom.wav',
    chime: 'assets/audio/sfx_chime.wav',
    crowd: 'assets/audio/sfx_crowd.wav',
    sparkle: 'assets/audio/sfx_sparkle.wav',
    slip: 'assets/audio/sfx_slip.wav',
    tap: 'assets/audio/sfx_tap.wav'
  };

  function AudioEngine(opts) {
    opts = opts || {};
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.buffers = {};
    this.musicEls = {};
    this.ambEls = {};
    this.currentAmb = null;
    this.current = null;
    this.muted = false;
    this.volume = opts.volume == null ? 0.9 : opts.volume;
    this.musicVolume = 0.55;
    this.ready = false;
    this.loadingSfx = {};
  }

  AudioEngine.MUSIC = MUSIC;
  AudioEngine.SFX = SFX;

  /* --------------------------------------------------------------- unlock */
  AudioEngine.prototype.init = function () {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    var AC = G.AudioContext || G.webkitAudioContext;
    if (!AC) return false;

    try { this.ctx = new AC(); } catch (e) { return false; }

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.85;
    this.sfxBus.connect(this.master);

    this.ready = true;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  };

  /* ---------------------------------------------------------------- music */
  AudioEngine.prototype.music = function (name, opts) {
    opts = opts || {};
    if (!MUSIC[name]) return null;

    var el = this.musicEls[name];
    if (!el) {
      el = new Audio();
      el.src = MUSIC[name];
      el.loop = opts.loop !== false;
      el.preload = 'auto';
      el.volume = 0;
      el.crossOrigin = 'anonymous';
      this.musicEls[name] = el;
    }

    if (this.current && this.current !== el) this.fadeOut(this.current, 1.1);

    this.current = el;
    if (opts.loop === false) el.loop = false;

    var target = this.muted ? 0 : this.musicVolume;
    var p = el.play();
    if (p && p.catch) p.catch(function () { /* blocked until a gesture */ });
    this.fadeTo(el, target, opts.fade == null ? 1.4 : opts.fade);
    return el;
  };

  /* ------------------------------------------------------------- ambience */
  AudioEngine.prototype.ambience = function (name, level) {
    if (!AMB[name]) return null;
    var el = this.ambEls[name];
    if (!el) {
      el = new Audio();
      el.src = AMB[name];
      el.loop = true;
      el.preload = 'auto';
      el.volume = 0;
      this.ambEls[name] = el;
    }
    if (this.currentAmb && this.currentAmb !== el) this.fadeTo(this.currentAmb, 0, 1.6);
    this.currentAmb = el;
    var target = this.muted ? 0 : (level == null ? 0.22 : level);
    var pr = el.play();
    if (pr && pr.catch) pr.catch(function () {});
    this.fadeTo(el, target, 2.0);
    return el;
  };

  AudioEngine.prototype.fadeTo = function (el, target, seconds) {
    if (!el) return;
    clearInterval(el._fade);
    var start = el.volume;
    var t0 = performance.now();
    var dur = Math.max(0.05, seconds) * 1000;
    el._fade = setInterval(function () {
      var k = Math.min(1, (performance.now() - t0) / dur);
      el.volume = Math.max(0, Math.min(1, start + (target - start) * k));
      if (k >= 1) clearInterval(el._fade);
    }, 40);
  };

  AudioEngine.prototype.fadeOut = function (el, seconds) {
    if (!el) return;
    this.fadeTo(el, 0, seconds);
    setTimeout(function () {
      try { el.pause(); } catch (e) { /* noop */ }
    }, seconds * 1000 + 120);
  };

  AudioEngine.prototype.stopMusic = function (seconds) {
    if (this.current) this.fadeOut(this.current, seconds || 1);
    this.current = null;
  };

  /* ------------------------------------------------------------------ sfx */
  AudioEngine.prototype.loadSfx = function (names) {
    var self = this;
    if (!this.ready) return Promise.resolve();
    return Promise.all(names.map(function (n) {
      if (self.buffers[n] || self.loadingSfx[n]) return self.loadingSfx[n] || Promise.resolve();
      var url = SFX[n];
      if (!url) return Promise.resolve();
      var p = fetch(url)
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (buf) { return self.ctx.decodeAudioData(buf); })
        .then(function (decoded) {
          self.buffers[n] = decoded;
          delete self.loadingSfx[n];
        })
        .catch(function () { delete self.loadingSfx[n]; });
      self.loadingSfx[n] = p;
      return p;
    }));
  };

  AudioEngine.prototype.play = function (name, opts) {
    if (!this.ready || this.muted) return;
    var buf = this.buffers[name];
    if (!buf) { this.loadSfx([name]); return; }

    opts = opts || {};
    var src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate == null ? 1 : opts.rate;

    var g = this.ctx.createGain();
    g.gain.value = opts.gain == null ? 0.7 : opts.gain;

    if (opts.pan && this.ctx.createStereoPanner) {
      var p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      src.connect(g);
      g.connect(p);
      p.connect(this.sfxBus);
    } else {
      src.connect(g);
      g.connect(this.sfxBus);
    }

    src.start(0, opts.offset || 0);
    return src;
  };

  /* ------------------------------------------------------------ ambience
     A tiny procedural layer under everything: the city hum. Two detuned
     oscillators through a lowpass, gain tied to the thermal tier. */
  AudioEngine.prototype.startAmbience = function () {
    if (!this.ready || this.amb) return;
    var ctx = this.ctx;
    var now = ctx.currentTime;

    this.amb = ctx.createGain();
    this.amb.gain.setValueAtTime(0, now);
    this.amb.gain.linearRampToValueAtTime(0.045, now + 3);

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 320;

    var a = ctx.createOscillator(); a.type = 'sine'; a.frequency.value = 58;
    var b = ctx.createOscillator(); b.type = 'triangle'; b.frequency.value = 87.5; b.detune.value = 6;

    a.connect(lp); b.connect(lp);
    lp.connect(this.amb);
    this.amb.connect(this.master);
    a.start(now); b.start(now);
    this.ambNodes = [a, b];
  };

  AudioEngine.prototype.duck = function (amount, seconds) {
    if (!this.ready || !this.current) return;
    var el = this.current;
    var target = this.muted ? 0 : this.musicVolume * (1 - amount);
    this.fadeTo(el, target, seconds || 0.6);
  };

  AudioEngine.prototype.unduck = function (seconds) {
    if (!this.ready || !this.current) return;
    this.fadeTo(this.current, this.muted ? 0 : this.musicVolume, seconds || 0.8);
  };

  /* ----------------------------------------------------------------- mute */
  AudioEngine.prototype.setMuted = function (m) {
    this.muted = !!m;
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
    for (var k in this.musicEls) {
      var el = this.musicEls[k];
      if (this.muted) el.volume = 0;
      else if (el === this.current) el.volume = this.musicVolume;
    }
    for (var a in this.ambEls) {
      var am = this.ambEls[a];
      if (this.muted) am.volume = 0;
      else if (am === this.currentAmb) am.volume = 0.22;
    }
    return this.muted;
  };

  AudioEngine.prototype.toggleMute = function () { return this.setMuted(!this.muted); };

  AudioEngine.prototype.suspend = function () {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    if (this.current) { try { this.current.pause(); } catch (e) {} }
    if (this.currentAmb) { try { this.currentAmb.pause(); } catch (e) {} }
  };

  AudioEngine.prototype.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    if (this.current) { var p = this.current.play(); if (p && p.catch) p.catch(function () {}); }
    if (this.currentAmb) { var q = this.currentAmb.play(); if (q && q.catch) q.catch(function () {}); }
  };

  G.AudioEngine = AudioEngine;
})(window);
