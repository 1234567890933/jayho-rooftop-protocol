/* ============================================================================
   main.js — bootstrap, the loop, and the act router.
   ----------------------------------------------------------------------------
   One requestAnimationFrame drives everything: thermal sampling, world, act,
   particles. The DOM is never read inside the loop.
   ========================================================================= */
(function (G) {
  'use strict';

  var U = G.U;
  var W = 1080, H = 1920;

  var ACT_ORDER = [
    { id: 1, key: 'lane', cls: 'Act1' },
    { id: 2, key: 'stairs', cls: 'Act2' },
    { id: 3, key: 'dusk', cls: 'Act3' },
    { id: 4, key: 'night', cls: 'Act4' },
    { id: 5, key: 'sky', cls: 'Act5' }
  ];


  var CREST_SVG =
    '<svg viewBox="0 0 64 64" role="img" aria-label="Rooftop Protocol crest">' +
      '<defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0%" stop-color="currentColor"/>' +
        '<stop offset="55%" stop-color="#22E1FF"/>' +
        '<stop offset="100%" stop-color="currentColor"/></linearGradient></defs>' +
      '<path d="M32 3.5 56 17.2v29.6L32 60.5 8 46.8V17.2z" fill="none" stroke="url(#cg)" stroke-width="1.7" opacity="0.92"/>' +
      '<ellipse cx="32" cy="32" rx="21" ry="8.4" fill="none" stroke="currentColor" stroke-width="1.1" opacity="0.5" transform="rotate(-28 32 32)"/>' +
      '<circle cx="50.4" cy="22.6" r="2.1" fill="currentColor"/>' +
      '<circle cx="32" cy="32" r="14.2" fill="none" stroke="#22E1FF" stroke-width="1" opacity="0.45"/>' +
      '<path d="M37.6 22.4v13.9c0 3.6-2.6 5.9-6.1 5.9-3.2 0-5.5-1.9-5.9-4.9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M30.4 22.4h10.2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M32 2v4M32 58v4M2 32h4M58 32h4" stroke="#22E1FF" stroke-width="1.3" stroke-linecap="round" opacity="0.75"/>' +
    '</svg>';

  function injectCrest() {
    var nodes = document.querySelectorAll('[data-crest]');
    for (var i = 0; i < nodes.length; i++) nodes[i].innerHTML = CREST_SVG;
  }

  function Game() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.dpr = 1;
    this.cw = 1;
    this.ch = 1;
    this.viewScale = 1;
    this.ox = 0;
    this.oy = 0;

    this.state = 'boot';
    this.actIndex = -1;
    this.act = null;
    this.score = 0;
    this.stats = { slips: 0, start: 0, score: 0 };

    this.lastTs = 0;
    this.lastRenderTs = 0;
    this.running = false;
    this.rafId = 0;

    /* systems */
    this.thermal = new G.Thermal({
      onTier: function (t, why) {
        var el = document.getElementById('fx-thermal');
        if (!el) return;
        el.classList.add('is-on');
        el.classList.toggle('warm', t === 1);
        el.classList.toggle('hot', t === 0);
        el.title = 'Performance tier ' + t + ' — ' + why;
        if (G.console) console.info('[thermal] tier', t, '-', why);
      }
    });
    this.assets = new G.Assets();
    this.audio = new G.AudioEngine({ volume: 0.9 });
    this.particles = new G.Particles(1200);
    this.world = new G.World(this.assets, this.particles);
    this.hud = new G.HUD();
    this.input = new G.Input(this.canvas);
    this.gyro = new G.GyroAim({
      rangeX: 104, rangeY: 62,
      stiffness: 260,
      deadzone: 0.030,
      maxAngle: 0.42
    });

    /* preferences survive a reload; the aim engine reads them on boot */
    var prefs = U.store.get('prefs', {});
    this.prefs = {
      gyro: prefs.gyro !== false,
      sensitivity: typeof prefs.sensitivity === 'number' ? prefs.sensitivity : 1,
      invertY: !!prefs.invertY,
      haptics: prefs.haptics !== false
    };
    this.gyro.enabled = this.prefs.gyro;
    this.gyro.setSensitivity(this.prefs.sensitivity);
    this.gyro.setInvertY(this.prefs.invertY);

    this.ctxBundle = {
      W: W, H: H,
      input: this.input,
      world: this.world,
      particles: this.particles,
      audio: this.audio,
      thermal: this.thermal,
      hud: this.hud,
      stats: this.stats,
      haptics: this.haptics.bind(this),
      gyro: this.gyro,
      addScore: this.addScore.bind(this)
    };

    this.bindUI();
    this.bindResize();
    this.bindPlatform();
    this.bindSettings();
  }

  /* -------------------------------------------------------------- haptics */
  Game.prototype.haptics = function (pattern) {
    if (!navigator.vibrate || !this.prefs.haptics) return;
    if (this.thermal && this.thermal.tier === 0) return;   /* spare the motor on a hot phone */
    try { navigator.vibrate(pattern); } catch (e) { /* unsupported */ }
  };

  /* ------------------------------------------------------------- lifecycle */
  Game.prototype.addScore = function (n) {
    this.score += n;
    this.stats.score = Math.round(this.score);
    this.hud.setScore(this.score);
  };

  Game.prototype.bindResize = function () {
    var self = this;
    this.resize();
    window.addEventListener('resize', function () { self.resize(); }, { passive: true });
    window.addEventListener('orientationchange', function () {
      setTimeout(function () { self.resize(); }, 240);
    }, { passive: true });
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(function () { self.resize(); });
      this._ro.observe(this.canvas);
    }
  };

  Game.prototype.resize = function () {
    var dpr = Math.min(window.devicePixelRatio || 1, this.thermal.dprCap);
    var cw = this.canvas.clientWidth || window.innerWidth;
    var chh = this.canvas.clientHeight || window.innerHeight;

    if (cw === this.cw && chh === this.ch && dpr === this.dpr) return;

    this.cw = cw; this.ch = chh; this.dpr = dpr;
    this.canvas.width = Math.round(cw * dpr);
    this.canvas.height = Math.round(chh * dpr);

    /* cover-fit the 1080x1920 world */
    this.viewScale = Math.max(cw / W, chh / H);
    this.ox = (cw - W * this.viewScale) / 2;
    this.oy = (chh - H * this.viewScale) / 2;

    this.input.setTransform(this.viewScale, this.ox, this.oy);
  };

  /* ------------------------------------------------------------------ boot */
  Game.prototype.boot = function () {
    var self = this;
    var fill = document.getElementById('boot-fill');
    var status = document.getElementById('boot-status');

    var setP = function (p) { if (fill) fill.style.width = (p * 100).toFixed(0) + '%'; };

    status.textContent = 'painting the city…';
    this.assets.textures(function (d, t) { setP(d / t * 0.35); })
      .then(function () {
        status.textContent = 'hanging the night sky…';
        return self.assets.group('title', function (d, t) {
          setP(0.35 + (d / t) * 0.55);
        });
      })
      .then(function () {
        setP(1);
        status.textContent = 'ready';
        self.world.setScene('title', { instant: true });
        self.startLoop();
        setTimeout(function () { self.showTitle(); }, 420);
      })
      .catch(function () {
        /* even if a plate is missing, the game must open */
        self.world.setScene('title', { instant: true });
        self.startLoop();
        self.showTitle();
      });
  };

  Game.prototype.showTitle = function () {
    /* DOM first, state last. Flipping state before the boot overlay is gone
       left a ~400 ms window where a tap landed on the fading overlay and was
       swallowed — the first click of the session. */
    var boot = document.getElementById('boot');
    boot.classList.add('is-hidden');
    boot.style.pointerEvents = 'none';
    document.getElementById('title').classList.remove('is-hidden');
    document.body.classList.remove('boot-locked');
    this.state = 'title';

    var foot = document.getElementById('title-foot');
    if (foot) {
      foot.textContent = this.input.mode === 'motion'
        ? 'Motion controls active · shake to run'
        : 'Touch controls · best in portrait';
    }
  };

  /* ------------------------------------------------------------------- UI */
  Game.prototype.bindUI = function () {
    var self = this;

    var begin = document.getElementById('btn-begin');
    var howto = document.getElementById('btn-howto');
    var howtoClose = document.getElementById('btn-howto-close');
    var sound = document.getElementById('btn-sound');
    var again = document.getElementById('btn-again');
    var share = document.getElementById('btn-share');

    if (begin) begin.addEventListener('click', function () { self.begin(); });

    if (howto) howto.addEventListener('click', function () {
      document.getElementById('howto').classList.remove('is-hidden');
    });
    if (howtoClose) howtoClose.addEventListener('click', function () {
      document.getElementById('howto').classList.add('is-hidden');
    });

    if (sound) sound.addEventListener('click', function () {
      if (!self.audio.ready) self.audio.init();
      var muted = self.audio.toggleMute();
      sound.setAttribute('aria-pressed', muted ? 'true' : 'false');
      document.getElementById('sound-label').textContent = muted ? 'Sound off' : 'Sound on';
      if (!muted) self.audio.play('tap', { gain: 0.5 });
    });

    if (again) again.addEventListener('click', function () { self.restart(); });
    if (share) share.addEventListener('click', function () { self.share(); });

    /* audio unlock on the very first gesture anywhere */
    var unlock = function () {
      if (!self.audio.ready) self.audio.init();
      document.removeEventListener('pointerdown', unlock);
    };
    document.addEventListener('pointerdown', unlock, { passive: true });
  };

  Game.prototype.begin = function () {
    var self = this;
    if (this.state === 'playing') return;

    /* the gesture that unlocks everything */
    this.audio.init();
    this.audio.startAmbience();
    this.audio.ambience('city', 0.16);
    this.audio.play('tap', { gain: 0.5 });
    /* warm the effects that the first few seconds of play will need, so no
       jump or thud is silent while its buffer is still being decoded */
    this.audio.loadSfx(['step', 'thud', 'click', 'sparkle', 'slip', 'boom', 'chime', 'whistle', 'fuse']);

    document.getElementById('title').classList.add('is-hidden');
    this.hud.show(true);
    this.score = 0;
    this.stats.slips = 0;
    this.stats.start = performance.now();

    /* motion permission must ride on this gesture (iOS) */
    var motionPromise = this.input.requestMotion();
    motionPromise.then(function (ok) {
      if (ok) {
        self.gyro.enabled = self.prefs.gyro;
        self.gyro.calibrate();
        self.hud.toast('Motion controls on — shake to sprint.', 2600);
        document.getElementById('title-foot').textContent = 'Motion controls active';
      } else {
        self.hud.toast('Touch controls — motion unavailable here.', 2200);
      }
      if (self.act && self.act.promptFor) self.act.promptFor(self.ctxBundle);
    });

    this.startAct(0);
  };

  /* ------------------------------------------------ platform glue & pausing */
  Game.prototype.savePrefs = function () {
    U.store.set('prefs', this.prefs);
  };

  Game.prototype.applyPrefs = function () {
    this.gyro.enabled = this.prefs.gyro;
    this.gyro.setSensitivity(this.prefs.sensitivity);
    this.gyro.setInvertY(this.prefs.invertY);
    this.savePrefs();
  };

  Game.prototype.bindSettings = function () {
    var self = this;
    var sheet = document.getElementById('settings');
    var gyroBox = document.getElementById('set-gyro');
    var sens = document.getElementById('set-sens');
    var sensVal = document.getElementById('sens-val');
    var invert = document.getElementById('set-invert');
    var hapt = document.getElementById('set-haptics');
    var status = document.getElementById('gyro-status');

    if (gyroBox) gyroBox.checked = this.prefs.gyro;
    if (sens) sens.value = this.prefs.sensitivity;
    if (sensVal) sensVal.textContent = Number(this.prefs.sensitivity).toFixed(1);
    if (invert) invert.checked = this.prefs.invertY;
    if (hapt) hapt.checked = this.prefs.haptics;

    var open = function () {
      sheet.classList.remove('is-hidden');
      self.refreshGyroStatus();
    };
    var close = function () { sheet.classList.add('is-hidden'); };

    var btn = document.getElementById('btn-settings');
    if (btn) btn.addEventListener('click', open);
    var closeBtn = document.getElementById('btn-settings-close');
    if (closeBtn) closeBtn.addEventListener('click', close);

    if (gyroBox) gyroBox.addEventListener('change', function () {
      self.prefs.gyro = gyroBox.checked;
      self.applyPrefs();
      if (gyroBox.checked) self.gyro.calibrate();
      self.refreshGyroStatus();
    });

    if (sens) sens.addEventListener('input', function () {
      self.prefs.sensitivity = parseFloat(sens.value);
      if (sensVal) sensVal.textContent = self.prefs.sensitivity.toFixed(1);
      self.applyPrefs();
    });

    if (invert) invert.addEventListener('change', function () {
      self.prefs.invertY = invert.checked;
      self.applyPrefs();
    });

    if (hapt) hapt.addEventListener('change', function () {
      self.prefs.haptics = hapt.checked;
      self.savePrefs();
      if (self.prefs.haptics) self.haptics(20);
    });

    var recal = document.getElementById('btn-recal');
    if (recal) recal.addEventListener('click', function () {
      self.gyro.calibrate();
      self.refreshGyroStatus();
      if (status) status.textContent = 'Calibrating — hold still for a second…';
    });

    /* live readout so the player can see the sensor is actually alive */
    this._statusTimer = setInterval(function () {
      if (!sheet.classList.contains('is-hidden')) self.refreshGyroStatus();
    }, 500);
  };

  Game.prototype.refreshGyroStatus = function () {
    var el = document.getElementById('gyro-status');
    if (!el) return;
    var st = this.gyro.status();
    if (!this.gyro.enabled) {
      el.textContent = 'Gyro look is off. Touch controls still work everywhere.';
    } else if (!st.available) {
      el.textContent = 'No motion sensor detected — using touch controls.';
    } else if (!st.calibrated) {
      el.textContent = 'Calibrating — hold still for a second…';
    } else {
      el.textContent = 'Sensor live · yaw ' + st.yaw + ' · pitch ' + st.pitch;
    }
  };

  Game.prototype.bindPlatform = function () {
    var self = this;

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) self.pause();
      else self.resume();
    }, { passive: true });

    /* Android shell hooks (harmless in a browser) */
    window.__androidPause = function () { self.pause(); };
    window.__androidResume = function () { self.resume(); };
    window.__androidBack = function () {
      if (self.state === 'playing') { self.pause(); self.hud.toast('Paused — tap to continue', 4000); return true; }
      return false;
    };

    /* tap anywhere while paused resumes */
    var resumeTap = function () {
      if (self._paused) { self.resume(); }
    };
    document.addEventListener('pointerdown', resumeTap, { passive: true });

    /* best score on the title screen */
    var best = U.store.get('best', 0);
    var foot = document.getElementById('title-foot');
    if (foot && best > 0) foot.textContent = 'Best run · ' + Math.round(best) + ' points';
  };

  Game.prototype.pause = function () {
    if (this._paused) return;
    this._paused = true;
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.audio.suspend();
  };

  Game.prototype.resume = function () {
    if (!this._paused) return;
    this._paused = false;
    this.lastTs = 0;
    this.lastRenderTs = 0;
    this.audio.resume();
    this.startLoop();
  };

  /* -------------------------------------------------------------- act flow */
  Game.prototype.startAct = function (index) {
    var self = this;
    if (index >= ACT_ORDER.length) return this.finish();

    var def = ACT_ORDER[index];
    this.actIndex = index;
    var token = (this._loadToken = (this._loadToken || 0) + 1);
    /* lock the loop out of the outgoing act *before* the async load starts,
       otherwise a finished act keeps reporting done and cascades through every
       remaining chapter in a single second */
    this.state = 'loading';

    var boot = document.getElementById('boot');
    var fill = document.getElementById('boot-fill');
    var status = document.getElementById('boot-status');
    var kicker = boot.querySelector('.boot-kicker');
    var title = boot.querySelector('.boot-title');

    boot.classList.remove('is-hidden');
    if (kicker) kicker.textContent = 'ACT ' + ['', 'I', 'II', 'III', 'IV', 'V'][def.id];
    if (title) title.innerHTML = 'Loading<span class="grad">…</span>';
    if (fill) fill.style.width = '0%';
    if (status) status.textContent = 'loading ' + def.key;

    /* free EVERY other chapter before allocating this one — the title group
       alone holds three plates and used to be leaked forever */
    this.assets.releaseAllExcept(def.key);
    this._loadedGroup = def.key;

    this.assets.group(def.key, function (d, t) {
      if (fill) fill.style.width = ((d / t) * 100).toFixed(0) + '%';
    }).then(function () {
      if (token !== self._loadToken) return;    /* a newer load won the race */
      boot.classList.add('is-hidden');

      if (self.act && self.act.exit) self.act.exit(self.ctxBundle);
      self.particles.clear();

      var Cls = G.Acts[def.cls];
      self.act = new Cls();
      self.state = 'playing';
      self.act.enter(self.ctxBundle);

      /* score and street bed follow the act */
      if (self.act.music) self.audio.music(self.act.music);
      if (self.act.amb) self.audio.ambience(self.act.amb, self.act.amb === 'city' ? 0.18 : 0.15);

      self.hud.show(true);
      self.hud.setScore(self.score);
      if (!self.running) self.startLoop();
    });
  };

  Game.prototype.nextAct = function () {
    if (this.state !== 'playing') return;     /* re-entry guard */
    this.addScore(250);                       /* act clear bonus */
    this.startAct(this.actIndex + 1);
  };

  Game.prototype.finish = function () {
    this.state = 'finale';
    this.hud.show(false);
    /* keep the victory track running under the card, just further back */
    this.audio.duck(0.45, 1.8);
    if (this.audio.currentAmb) this.audio.fadeTo(this.audio.currentAmb, 0, 1.6);
    this.audio.play('crowd', { gain: 0.6 });

    var secs = (performance.now() - this.stats.start) / 1000;
    document.getElementById('stat-score').textContent = Math.round(this.score);
    document.getElementById('stat-time').textContent = U.fmtTime(secs);
    document.getElementById('stat-slip').textContent = this.stats.slips;
    document.getElementById('finale').classList.remove('is-hidden');

    U.store.set('best', Math.max(this.score, U.store.get('best', 0)));
  };

  Game.prototype.restart = function () {
    document.getElementById('finale').classList.add('is-hidden');
    this.particles.clear();
    this.score = 0;
    this.stats.slips = 0;
    this.stats.start = performance.now();
    this.hud.reset();
    this.startAct(0);
  };

  Game.prototype.share = function () {
    var payload = {
      title: 'The Jayho Chronicles · Rooftop Protocol',
      text: 'A five-act rooftop mission that gets the sky to say "Happy Birthday Jayho".',
      url: location.href
    };
    if (navigator.share) {
      navigator.share(payload).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload.url).then(function () {
        document.getElementById('btn-share').textContent = 'Link copied';
      }).catch(function () {});
      return;
    }
    document.getElementById('btn-share').textContent = 'Copy the URL';
  };

  /* ------------------------------------------------------------------ loop */
  Game.prototype.startLoop = function () {
    if (this.running) return;
    this.running = true;
    this.lastTs = 0;
    var self = this;
    var frame = function (ts) {
      if (!self.running) return;
      self.rafId = requestAnimationFrame(frame);

      if (!self.lastTs) self.lastTs = ts;
      var rawMs = ts - self.lastTs;
      self.lastTs = ts;

      self.thermal.sample(rawMs);

      /* fps cap for the low tier: skip the render, keep the clock honest */
      if (self.thermal.fpsCap && self.lastRenderTs &&
          (ts - self.lastRenderTs) < (1000 / self.thermal.fpsCap) - 1.5) {
        return;
      }
      self.lastRenderTs = ts;

      var dt = Math.min(rawMs / 1000, 1 / 20);
      self.tick(dt, ts);
    };
    this.rafId = requestAnimationFrame(frame);
  };

  Game.prototype.tick = function (dt, ts) {
    var b = this.ctxBundle;

    this.input.update(dt);

    /* the aim engine runs off the same orientation stream as the acts, so
       looking around and tilting to balance never disagree */
    if (this.input.mode === 'motion') {
      this.gyro.feed(this.input.raw.gamma, this.input.raw.beta);
    }
    this.gyro.update(dt);
    this.world.look = this.gyro.look();

    this.world.update(dt, this.thermal);

    if (this.state === 'playing' && this.act) {
      this.act.update(dt, b);
      if (this.act.done) {
        this.act.done = false;
        if (this.act.exit) this.act.exit(b);
        this.nextAct();
        return;
      }
    }

    this.particles.update(dt, W, H);
    this.render();
    void ts;
  };

  Game.prototype.render = function () {
    var g = this.ctx;
    var dpr = this.dpr;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#05070C';
    g.fillRect(0, 0, this.cw, this.ch);

    g.save();
    g.translate(this.ox, this.oy);
    g.scale(this.viewScale, this.viewScale);

    /* camera shake moves the world, not the HUD */
    g.translate(this.world.shakeX, this.world.shakeY);

    this.world.render(g);

    if (this.act && this.state !== 'boot' && this.state !== 'finale') {
      this.act.render(g, this.ctxBundle);
    }

    this.particles.draw(g);

    g.restore();
  };

  /* ------------------------------------------------------------------ boot */
  function launch() {
    injectCrest();
    var game = new Game();
    G.__game = game;                     /* debug handle */
    game.boot();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', launch, { once: true });
  } else {
    launch();
  }
})(window);
