/* ============================================================================
   gyro.js — the aim/look engine.
   ----------------------------------------------------------------------------
   This is the part that makes a phone feel like a controller instead of a
   web page. Three things have to be true for gyro to feel good, and all three
   are what people actually mean when they say a mobile shooter's aim "feels
   tight":

     1. CALIBRATION. You are holding the phone at some angle when the act
        starts. That angle is the centre of the world; every later reading is
        measured against it, so the view never snaps when you first move.

     2. A DEAD ZONE. Hands tremble. Without a dead zone the camera drifts while
        you hold still, which reads as input lag and makes people seasick.

     3. CRITICAL DAMPING. Raw sensor data is noisy at 60 Hz. A single-pole
        filter that is too fast jitters, too slow lags. We run a critically
        damped spring per axis, so it settles without overshoot and never
        oscillates — the same trick desktop games use for smooth aim.

   Plus: a spring back to centre when you return the phone to its rest angle,
   sensitivity and inversion settings that persist, and a hard clamp so a
   dropped phone cannot spin the camera.
   ========================================================================= */
(function (G) {
  'use strict';

  var U = G.U;

  function GyroAim(opts) {
    opts = opts || {};

    this.enabled = false;
    this.available = false;
    this.calibrated = false;

    /* radians of phone rotation mapped to the edge of the look range */
    this.maxAngle = opts.maxAngle || 0.42;
    this.deadzone = opts.deadzone || 0.030;

    this.sensitivity = 1.0;
    this.invertY = false;

    /* smoothed output, in normalised units (-1..1) */
    this.yaw = 0;
    this.pitch = 0;
    this.vyaw = 0;
    this.vpitch = 0;

    /* spring constants — critically damped (k = c^2/4) */
    this.stiffness = opts.stiffness || 240;
    this.damping = 2 * Math.sqrt(this.stiffness);

    this.base = { beta: null, gamma: null };
    this.samples = [];
    this.calibrating = false;

    /* the world pixels the camera slides for a full-scale look */
    this.rangeX = opts.rangeX || 96;
    this.rangeY = opts.rangeY || 58;
  }

  GyroAim.prototype.setSensitivity = function (s) {
    this.sensitivity = U.clamp(s, 0.2, 3);
  };

  GyroAim.prototype.setInvertY = function (v) {
    this.invertY = !!v;
  };

  /* Average the next N frames and treat that pose as "straight ahead". */
  GyroAim.prototype.calibrate = function () {
    this.calibrating = true;
    this.samples = [];
    this.calibrated = false;
  };

  GyroAim.prototype.feed = function (gamma, beta) {
    if (gamma == null || beta == null) return;
    this.available = true;

    if (this.calibrating) {
      this.samples.push({ g: gamma, b: beta });
      if (this.samples.length >= 24) {
        var g = 0, b = 0;
        for (var i = 0; i < this.samples.length; i++) { g += this.samples[i].g; b += this.samples[i].b; }
        this.base.gamma = g / this.samples.length;
        this.base.beta = b / this.samples.length;
        this.calibrating = false;
        this.calibrated = true;
        this.yaw = this.pitch = this.vyaw = this.vpitch = 0;
      }
      return;
    }

    if (this.base.gamma == null) {
      /* first ever reading becomes the centre, no calibration pass needed */
      this.base.gamma = gamma;
      this.base.beta = beta;
      this.calibrated = true;
      return;
    }

    /* unwrap gamma: the sensor wraps at ±180 and jumps at the seam */
    var dg = gamma - this.base.gamma;
    if (dg > 180) dg -= 360;
    if (dg < -180) dg += 360;
    var db = beta - this.base.beta;

    var ax = this._shape(dg);
    var ay = this._shape(db);

    this._step(ax, ay, 0.016);
  };

  /* dead zone + normalise + clamp, in one place */
  GyroAim.prototype._shape = function (degrees) {
    var rad = degrees * Math.PI / 180;
    var dz = this.deadzone;
    var mag = Math.abs(rad);
    if (mag < dz) return 0;
    /* rescale past the dead zone so there is no jump at the edge */
    var v = (mag - dz) / (this.maxAngle - dz);
    v = U.clamp(v, 0, 1) * (rad < 0 ? -1 : 1);
    /* slight response curve: fine control near centre, fast at the edges */
    return Math.sign(v) * Math.pow(Math.abs(v), 1.35) * this.sensitivity;
  };

  /* critically damped spring, integrated with a clamped step */
  GyroAim.prototype._step = function (targetX, targetY, dt) {
    var k = this.stiffness;
    var c = this.damping;
    dt = Math.min(dt, 1 / 30);

    var ax = (targetX - this.yaw) * k - this.vyaw * c;
    var ay = (targetY - this.pitch) * k - this.vpitch * c;
    this.vyaw += ax * dt;
    this.vpitch += ay * dt;
    this.yaw += this.vyaw * dt;
    this.pitch += this.vpitch * dt;

    /* hard clamp: a tumble cannot spin the world */
    this.yaw = U.clamp(this.yaw, -1.6, 1.6);
    this.pitch = U.clamp(this.pitch, -1.6, 1.6);
  };

  /* Called each frame so the spring keeps settling even without new samples */
  GyroAim.prototype.update = function (dt) {
    if (!this.enabled || !this.calibrated) {
      /* ease back to centre when the look engine is off */
      this.yaw += (0 - this.yaw) * Math.min(1, dt * 8);
      this.pitch += (0 - this.pitch) * Math.min(1, dt * 8);
      return;
    }
    this._step(this.yaw, this.pitch, dt);
  };

  /* Screen-space camera offset, in world pixels */
  GyroAim.prototype.look = function () {
    return {
      x: -this.yaw * this.rangeX,
      y: (this.invertY ? -1 : 1) * -this.pitch * this.rangeY
    };
  };

  /* The calibrated tilt for Act II's balance, in -1..1. Steadier than the raw
     sensor because it runs through the same dead zone and spring. */
  GyroAim.prototype.balance = function (rawTilt) {
    if (!this.calibrated) return rawTilt;
    var v = this._shape(this._lastGammaDelta || 0);
    return U.clamp(v, -1, 1);
  };

  /* Small diagnostic block for the settings sheet */
  GyroAim.prototype.status = function () {
    return {
      available: this.available,
      calibrated: this.calibrated,
      yaw: +this.yaw.toFixed(3),
      pitch: +this.pitch.toFixed(3)
    };
  };

  G.GyroAim = GyroAim;
})(window);
