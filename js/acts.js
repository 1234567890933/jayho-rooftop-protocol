/* ============================================================================
   acts.js — the five acts of ROOFTOP PROTOCOL.
   ----------------------------------------------------------------------------
   Every act is the same tiny interface:

       enter(ctx)   · one-time setup (scene, music, HUD, prompt)
       update(dt, ctx) · logic; sets this.done when the act is complete
       exit(ctx)    · cleanup
       render(g, ctx)  · draws entities in world space (1080 x 1920)

   Rules that hold across all five:
     · nothing is ever a dead end — a mistake costs points, never the run;
     · motion and touch are always both wired, the HUD prompt follows the mode;
     · every successful action fires a particle event, so the screen is alive.
   ========================================================================= */
(function (G) {
  'use strict';

  var U = G.U;
  var W = 1080, H = 1920;
  var GROUND = 1560;          /* the lane's street line in world units */

  /* ======================================================== shared drawing */
  function shadow(g, x, y, w, a) {
    g.save();
    g.globalAlpha = a == null ? 0.5 : a;
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(x, y, w, w * 0.22, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  /* The runner: a rim-lit silhouette carrying a box that is much too big. */
  function drawRunner(g, x, y, o) {
    o = o || {};
    var s = o.scale || 1;
    var phase = o.phase || 0;
    var jump = o.jump || 0;            /* pixels off the ground */
    var lean = o.lean || 0;
    var boxTilt = o.boxTilt || 0;
    var rim = o.rim || '255,201,107';

    var hipY = y - 150 * s - jump;
    var headY = hipY - 118 * s;

    shadow(g, x, y + 6, 74 * s, 0.45 * (1 - Math.min(1, jump / 420)));

    g.save();
    g.translate(x, 0);

    /* --- legs ------------------------------------------------------------ */
    var stride = Math.sin(phase) * 0.85;
    var stride2 = Math.sin(phase + Math.PI) * 0.85;
    g.strokeStyle = '#05070C';
    g.lineWidth = 22 * s;
    g.lineCap = 'round';

    [[stride, 1], [stride2, 0.85]].forEach(function (pair) {
      var sw = pair[0], a = pair[1];
      var kneeX = sw * 46 * s;
      var kneeY = hipY + 78 * s;
      var footX = sw * 92 * s;
      var footY = y - Math.max(0, Math.sin(phase + (pair[1] === 1 ? 0 : Math.PI))) * 46 * s - jump;
      g.globalAlpha = a;
      g.beginPath();
      g.moveTo(0, hipY);
      g.quadraticCurveTo(kneeX, kneeY, footX, footY);
      g.stroke();
    });
    g.globalAlpha = 1;

    /* --- torso ----------------------------------------------------------- */
    g.fillStyle = '#05070C';
    U.roundRect(g, -46 * s, hipY - 108 * s, 92 * s, 122 * s, 30 * s);
    g.fill();

    /* --- head ------------------------------------------------------------ */
    g.beginPath();
    g.arc(6 * s, headY, 34 * s, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(' + rim + ',.7)';
    g.lineWidth = 2.5 * s;
    g.beginPath();
    g.arc(6 * s, headY, 34 * s, -0.9, 0.5);
    g.stroke();
    /* shoulder line */
    g.strokeStyle = 'rgba(' + rim + ',.35)';
    g.beginPath();
    g.moveTo(-30 * s, hipY - 104 * s);
    g.quadraticCurveTo(0, hipY - 122 * s, 30 * s, hipY - 104 * s);
    g.stroke();

    /* --- arms up, holding the box ---------------------------------------- */
    g.strokeStyle = '#05070C';
    g.lineWidth = 18 * s;
    g.beginPath();
    g.moveTo(-30 * s, hipY - 92 * s);
    g.lineTo(-52 * s, hipY - 176 * s);
    g.moveTo(34 * s, hipY - 92 * s);
    g.lineTo(52 * s, hipY - 176 * s);
    g.stroke();

    /* --- the box --------------------------------------------------------- */
    var bw = 178 * s, bh = 118 * s;
    var bx = -bw / 2 + 4 * s;
    var by = hipY - 176 * s - bh;

    g.save();
    g.translate(0, by + bh / 2);
    g.rotate(boxTilt);
    g.translate(0, -(by + bh / 2));

    g.fillStyle = '#2A1C14';
    U.roundRect(g, bx, by, bw, bh, 8 * s);
    g.fill();

    /* packing tape */
    g.fillStyle = 'rgba(196,168,120,.55)';
    g.fillRect(bx + bw * 0.46, by, bw * 0.08, bh);
    g.fillRect(bx, by + bh * 0.44, bw, bh * 0.07);

    /* rim light along the leading edge */
    g.strokeStyle = 'rgba(' + rim + ',.85)';
    g.lineWidth = 3 * s;
    g.beginPath();
    g.moveTo(bx + bw, by + 6);
    g.lineTo(bx + bw, by + bh - 6);
    g.stroke();

    /* a stencilled arrow so it reads as "this side up" */
    g.strokeStyle = 'rgba(' + rim + ',.35)';
    g.lineWidth = 2.5 * s;
    g.beginPath();
    g.moveTo(bx + bw * 0.16, by + bh * 0.72);
    g.lineTo(bx + bw * 0.16, by + bh * 0.3);
    g.moveTo(bx + bw * 0.10, by + bh * 0.38);
    g.lineTo(bx + bw * 0.16, by + bh * 0.28);
    g.lineTo(bx + bw * 0.22, by + bh * 0.38);
    g.stroke();

    g.restore();

    /* --- rim light on the body ------------------------------------------- */
    g.strokeStyle = 'rgba(' + rim + ',.55)';
    g.lineWidth = 2.5 * s;
    g.beginPath();
    g.moveTo(44 * s, hipY - 104 * s);
    g.lineTo(44 * s, hipY + 2 * s);
    g.stroke();

    /* --- lean ------------------------------------------------------------ */
    void lean;
    g.restore();
  }

  /* A second, faster silhouette: Rahul, always just ahead. */
  function drawGhostRunner(g, x, y, phase) {
    g.save();
    g.globalAlpha = 0.55;
    drawRunner(g, x, y, { phase: phase, scale: 0.86, rim: '34,225,255' });
    g.restore();
  }

  /* ============================================================== ACT I */
  function Act1() {
    this.num = 1;
    this.name = 'The Run';
    this.sub = 'Beliaghata Lane · 6:42 pm';
    this.scene = 'lane';
    this.music = 'lane';
    this.amb = 'city';
    this.done = false;

    this.GOAL = 26000;      /* world px of lane to cover */
    this.dist = 0;
    this.speed = 340;
    this.grip = 3;
    this.sparksGot = 0;
    this.combo = 0;

    this.player = { y: 0, vy: 0, air: false };
    this.obstacles = [];
    this.sparks = [];
    this.nextObstacle = 900;
    this.nextSpark = 500;
    this.gateShown = false;
    this.t = 0;
    this.hurtFlash = 0;
    this.jumpBuffer = 0;
  }

  Act1.prototype.enter = function (ctx) {
    var self = this;
    ctx.world.setScene('lane', { instant: true });
    ctx.hud.setAct(1, 'The Run');
    ctx.hud.actCard(1, 'The Run', this.sub, 2300);
    ctx.hud.reset();
    ctx.hud.setPips(0, 5);
    ctx.audio.music('lane');
    this.promptFor(ctx);

    this._tap = function () {
      if (!self.player.air) {
        self.player.vy = -1180;
        self.player.air = true;
        ctx.audio.play('step', { gain: 0.5, rate: U.rand(1.05, 1.25) });
        ctx.particles.emit(280, GROUND, U.rand(-60, -10), U.rand(-40, 10), {
          life: 0.4, size: 6, rgb: '255,201,107', kind: 1, drag: 0.9, grav: 200
        });
      } else {
        self.jumpBuffer = 0.14;      /* coyote-style buffered double tap */
      }
    };
    ctx.input.on('tap', this._tap);

    this._action = function () { self._tap(); };
    ctx.input.on('action', this._action);
  };

  Act1.prototype.promptFor = function (ctx) {
    if (ctx.input.mode === 'motion') {
      ctx.hud.prompt('SHAKE', 'to sprint · tap to jump');
    } else {
      ctx.hud.prompt('HOLD', 'to sprint · tap to jump');
    }
  };

  Act1.prototype.exit = function (ctx) {
    ctx.input.handlers.tap = (ctx.input.handlers.tap || []).filter(function (f) { return f !== this._tap; }, this);
    ctx.input.handlers.action = (ctx.input.handlers.action || []).filter(function (f) { return f !== this._action; }, this);
  };

  Act1.prototype.spawnObstacle = function () {
    var types = ['pothole', 'dog', 'cycle', 'cone'];
    var type = U.pick(types);
    var spec = {
      pothole: { w: 150, h: 62 },
      dog: { w: 130, h: 96 },
      cycle: { w: 180, h: 140 },
      cone: { w: 90, h: 110 }
    }[type];
    this.obstacles.push({ x: W + 120, type: type, w: spec.w, h: spec.h, hit: false });
  };

  Act1.prototype.update = function (dt, ctx) {
    this.t += dt;
    var p = this.player;

    /* ---- speed: the box is heavy, so acceleration is slow ---------------- */
    var sprint = ctx.input.sprint();
    var target = 320 + sprint * 430;
    var accel = sprint > 0.05 ? 2.4 : 1.4;
    this.speed = U.smooth(this.speed, target, accel, dt);
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.6);

    /* ---- jump physics ---------------------------------------------------- */
    if (p.air) {
      p.vy += 3050 * dt;
      p.y += p.vy * dt;
      if (p.y >= 0) {
        p.y = 0; p.vy = 0; p.air = false;
        ctx.particles.burst(280, GROUND, {
          count: 5, speed: 90, life: 0.3, size: 4, grav: 260,
          rgb: '255,201,107', kind: 1, scale: ctx.thermal.particleScale
        });
        if (this.jumpBuffer > 0) {
          this.jumpBuffer = 0;
          p.vy = -1180; p.air = true;
        }
      }
    }
    if (this.jumpBuffer > 0) this.jumpBuffer -= dt;

    /* ---- world scroll ---------------------------------------------------- */
    var dx = this.speed * dt;
    ctx.world.scrollBy(dx);
    this.dist += dx;
    ctx.addScore(dx * 0.012);

    /* ---- spawning -------------------------------------------------------- */
    this.nextObstacle -= dx;
    if (this.nextObstacle <= 0) {
      this.spawnObstacle();
      this.nextObstacle = U.rand(760, 1180) - this.speed * 0.25;
      this.nextObstacle = Math.max(520, this.nextObstacle);
    }
    this.nextSpark -= dx;
    if (this.nextSpark <= 0) {
      this.sparks.push({ x: W + 60, y: GROUND - U.rand(120, 420), got: false, ph: U.rand(0, 6) });
      this.nextSpark = U.rand(420, 780);
    }

    /* ---- obstacles ------------------------------------------------------- */
    var self = this;
    for (var i = this.obstacles.length - 1; i >= 0; i--) {
      var o = this.obstacles[i];
      o.x -= dx;
      if (o.x < -220) { this.obstacles.splice(i, 1); continue; }

      if (!o.hit && Math.abs(o.x - 300) < (o.w * 0.42 + 52)) {
        var clearance = -p.y;                    /* how high the box is */
        if (clearance < o.h * 0.62) {
          o.hit = true;
          self.hit(o, ctx);
        }
      }
    }

    /* ---- sparks ---------------------------------------------------------- */
    for (var k = this.sparks.length - 1; k >= 0; k--) {
      var s = this.sparks[k];
      s.x -= dx;
      s.ph += dt * 3;
      if (s.x < -80) { this.sparks.splice(k, 1); continue; }
      if (!s.got && Math.abs(s.x - 300) < 96 && Math.abs(s.y - (GROUND - 250 + p.y)) < 240) {
        s.got = true;
        this.sparksGot = Math.min(5, this.sparksGot + 1);
        this.combo++;
        ctx.addScore(40 + this.combo * 6);
        ctx.audio.play('sparkle', { gain: 0.5, rate: U.rand(0.95, 1.15) });
        ctx.particles.burst(s.x, s.y, {
          count: 14, speed: 220, life: 0.7, size: 5, rgb: '255,231,168',
          kind: 0, scale: ctx.thermal.particleScale
        });
        ctx.hud.setPips(this.sparksGot, 5);
        if (this.sparksGot >= 5) ctx.hud.toast('Five sparks. Rahul is impressed, silently.');
        this.sparks.splice(k, 1);
      }
    }

    /* ---- footsteps ------------------------------------------------------- */
    if (!p.air && Math.random() < dt * (this.speed / 120)) {
      ctx.audio.play('step', { gain: 0.16, rate: U.rand(0.9, 1.15), pan: 0.1 });
      ctx.particles.emit(240, GROUND, U.rand(-40, -5), U.rand(-30, -5), {
        life: 0.45, size: 4, rgb: '255,180,110', kind: 1, grav: 160, drag: 0.92, a: 0.5
      });
    }

    /* ---- HUD ------------------------------------------------------------- */
    ctx.hud.setMain('DISTANCE', this.dist / this.GOAL);
    ctx.hud.setSub('GRIP', this.grip / 3);

    /* ---- arrival --------------------------------------------------------- */
    if (!this.gateShown && this.dist > this.GOAL * 0.92) {
      this.gateShown = true;
      ctx.hud.toast('Basu Villa gate — up the stairs, go go go.');
    }
    if (this.dist >= this.GOAL) {
      this.done = true;
    }
  };

  Act1.prototype.hit = function (o, ctx) {
    this.grip = Math.max(0, this.grip - 1);
    this.combo = 0;
    this.speed *= 0.55;
    this.hurtFlash = 1;
    this.dist = Math.max(0, this.dist - 900);
    ctx.world.shake(26);
    if (ctx.haptics) ctx.haptics(28);
    ctx.audio.play('thud', { gain: 0.55 });
    ctx.audio.play('slip', { gain: 0.4 });
    ctx.stats.slips++;
    ctx.particles.burst(o.x, GROUND - 40, {
      count: 18, speed: 260, life: 0.8, size: 6, rgb: '255,107,53',
      kind: 0, grav: 300, scale: ctx.thermal.particleScale
    });
    ctx.hud.toast(U.pick([
      'Amit: "Ruk toh sahi bhai, saans toh lene de!"',
      'The box shifted. Grip lost.',
      'Amit: "Yeh box akele nahi sambhal raha!"'
    ]));

    if (this.grip === 0) {
      /* never a dead end: the tribe catches the box */
      this.grip = 2;
      ctx.hud.toast('Rahul grabbed the corner. Keep moving.');
      ctx.particles.burst(280, GROUND - 200, {
        count: 24, speed: 320, life: 1.0, size: 6, rgb: '34,225,255',
        kind: 0, scale: ctx.thermal.particleScale
      });
    }
  };

  Act1.prototype.render = function (g, ctx) {
    var t = this.t;
    var p = this.player;
    var jump = -p.y;

    /* --- gate at the end -------------------------------------------------- */
    var gateProg = U.clamp((this.dist - this.GOAL * 0.55) / (this.GOAL * 0.45), 0, 1);
    if (gateProg > 0) {
      var gx = W * 0.62 + (1 - gateProg) * 900;
      g.save();
      g.globalAlpha = gateProg;
      g.fillStyle = '#0B0E14';
      g.fillRect(gx, GROUND - 520, 26, 520);
      g.fillRect(gx + 300, GROUND - 520, 26, 520);
      g.fillRect(gx, GROUND - 540, 326, 26);
      g.strokeStyle = 'rgba(255,201,107,.55)';
      g.lineWidth = 3;
      g.strokeRect(gx, GROUND - 540, 326, 540);
      U.glowText(g, 'BASU VILLA', gx + 163, GROUND - 566, 30, 'rgba(255,201,107,.9)', 'rgba(255,201,107,.8)');
      g.restore();
    }

    /* --- obstacles -------------------------------------------------------- */
    for (var i = 0; i < this.obstacles.length; i++) {
      this.drawObstacle(g, this.obstacles[i], t);
    }

    /* --- sparks ----------------------------------------------------------- */
    for (var k = 0; k < this.sparks.length; k++) {
      var s = this.sparks[k];
      var pulse = 0.7 + Math.sin(s.ph) * 0.3;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.9 * pulse;
      var spr = ctx.particles.sprites.goldHot;
      g.drawImage(spr, s.x - 34, s.y - 34, 68, 68);
      g.globalAlpha = 0.6;
      g.drawImage(spr, s.x - 70, s.y - 70, 140, 140);
      g.restore();
    }

    /* --- runners ---------------------------------------------------------- */
    var bob = Math.sin(t * (this.speed / 60)) * 6;
    g.save();
    g.globalAlpha = 0.5;
    drawRunner(g, 812 + Math.sin(t * 1.2) * 14, GROUND + bob * 0.4, {
      phase: t * (this.speed / 52) + 1.4, scale: 0.56, rim: '34,225,255'
    });
    g.restore();
    drawRunner(g, 300, GROUND, {
      phase: t * (this.speed / 52),
      jump: jump,
      scale: 0.72,
      boxTilt: Math.sin(t * 6) * 0.05 + (this.hurtFlash > 0 ? Math.sin(t * 40) * 0.12 * this.hurtFlash : 0),
      rim: this.hurtFlash > 0.3 ? '255,107,53' : '255,201,107'
    });

    /* --- speed lines ------------------------------------------------------ */
    if (this.speed > 480) {
      g.save();
      g.globalAlpha = U.clamp((this.speed - 480) / 300, 0, 0.5);
      g.strokeStyle = 'rgba(255,231,168,.7)';
      for (var l = 0; l < 9; l++) {
        var ly = (l * 173 + (t * 900) % 173) % H;
        var lx = (l * 240 + (t * 1400) % 400) % W;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(lx, ly);
        g.lineTo(lx - 120 - this.speed * 0.1, ly);
        g.stroke();
      }
      g.restore();
    }

    /* --- damage flash ----------------------------------------------------- */
    if (this.hurtFlash > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,107,53,' + (this.hurtFlash * 0.18).toFixed(3) + ')';
      g.fillRect(0, 0, W, H);
      g.restore();
    }
  };

  Act1.prototype.drawObstacle = function (g, o, t) {
    var x = o.x, y = GROUND;
    g.save();
    if (o.type === 'pothole') {
      g.fillStyle = 'rgba(4,5,8,.92)';
      g.beginPath();
      g.ellipse(x, y + 26, o.w / 2, 26, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,201,107,.25)';
      g.lineWidth = 3;
      g.stroke();
    } else if (o.type === 'dog') {
      g.fillStyle = '#07090E';
      g.beginPath();
      g.ellipse(x, y - 34, 62, 30, 0, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(x + 52, y - 56, 22, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(x + 68, y - 66); g.lineTo(x + 84, y - 96); g.lineTo(x + 74, y - 60);
      g.fill();
      g.strokeStyle = 'rgba(255,201,107,.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x + 30, y - 58); g.quadraticCurveTo(x + 40, y - 78, x + 62, y - 74);
      g.stroke();
    } else if (o.type === 'cycle') {
      g.strokeStyle = '#07090E';
      g.lineWidth = 8;
      g.beginPath(); g.arc(x - 50, y - 36, 34, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(x + 54, y - 36, 34, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x - 50, y - 36); g.lineTo(x, y - 116); g.lineTo(x + 54, y - 36);
      g.moveTo(x, y - 116); g.lineTo(x + 10, y - 36);
      g.stroke();
      g.strokeStyle = 'rgba(34,225,255,.4)';
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - 74, y - 36); g.lineTo(x + 78, y - 36); g.stroke();
    } else {
      g.fillStyle = '#FF6B35';
      g.beginPath();
      g.moveTo(x, y - o.h);
      g.lineTo(x + 30, y - 4);
      g.lineTo(x - 30, y - 4);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillRect(x - 18, y - o.h * 0.62, 36, 9);
    }
    g.restore();
    void t;
  };

  /* ============================================================= ACT II */
  function Act2() {
    this.num = 2;
    this.name = 'The Climb';
    this.sub = 'Basu Villa · staircase to the terrace';
    this.scene = 'stairs';
    this.music = 'climb';
    this.amb = 'wind';
    this.done = false;

    this.angle = 0;
    this.angVel = 0;
    this.steps = 0;
    this.STEPS = 12;
    this.stepT = 0;
    this.slips = 0;
    this.disturb = 1.4;
    this.t = 0;
    this.wobble = 0;
    this.flash = 0;
  }

  Act2.prototype.enter = function (ctx) {
    ctx.world.setScene('stairs', { instant: true });
    ctx.hud.setAct(2, 'The Climb');
    ctx.hud.actCard(2, 'The Climb', this.sub, 2300);
    ctx.hud.setPips(0, 3);
    ctx.hud.setMain('STAIRS', 0);
    ctx.hud.setSub('BALANCE', 1);
    ctx.audio.music('rooftop');
    if (ctx.input.mode === 'motion') {
      ctx.hud.prompt('TILT', 'to keep the box level');
    } else {
      ctx.hud.prompt('DRAG', 'left / right to balance');
    }
  };

  Act2.prototype.exit = function () {};

  Act2.prototype.update = function (dt, ctx) {
    this.t += dt;

    /* ---- input → torque -------------------------------------------------- */
    var input = 0;
    if (ctx.input.mode === 'motion') {
      input = ctx.input.tilt.x;
    } else {
      /* touch: a virtual joystick anchored where the finger landed, so the
         input persists while the finger is held still */
      var p = ctx.input.ptr;
      if (p.down) input = U.clamp((p.x - p.downX) / 190, -1, 1);
      input += (ctx.input.keys.ArrowLeft ? -1 : 0) + (ctx.input.keys.ArrowRight ? 1 : 0);
      input = U.clamp(input, -1, 1);
    }

    /* ---- inverted-pendulum-ish dynamics ---------------------------------- */
    this.angVel += (input * 3.1 + this.angle * 1.55) * dt;
    this.angVel *= Math.pow(0.12, dt);          /* damping */
    this.angle += this.angVel * dt;
    this.angle = U.clamp(this.angle, -1.4, 1.4);

    /* ---- mossy steps kick the box around -------------------------------- */
    this.disturb -= dt;
    if (this.disturb <= 0) {
      this.disturb = U.rand(1.5, 2.9) - Math.min(0.8, this.steps * 0.06);
      var kick = U.rand(0.35, 0.95) * (Math.random() < 0.5 ? -1 : 1);
      this.angVel += kick;
      this.wobble = 1;
      ctx.audio.play('slip', { gain: 0.16, rate: U.rand(0.9, 1.2) });
    }
    if (this.wobble > 0) this.wobble = Math.max(0, this.wobble - dt * 2);
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.4);

    /* ---- climbing -------------------------------------------------------- */
    this.stepT += dt * (0.85 + Math.abs(this.angVel) * 0.05);
    if (this.stepT >= 1) {
      this.stepT = 0;
      this.steps++;
      ctx.addScore(50);
      ctx.audio.play('step', { gain: 0.3, rate: U.rand(0.85, 1.05), pan: U.rand(-0.3, 0.3) });
      ctx.particles.emit(540 + U.rand(-90, 90), GROUND - 60, U.rand(-20, 20), U.rand(-60, -20), {
        life: 0.6, size: 5, rgb: '80,240,190', kind: 1, grav: 120, a: 0.5
      });
      if (this.steps >= this.STEPS) this.done = true;
    }

    /* ---- slipping -------------------------------------------------------- */
    if (Math.abs(this.angle) > 0.95) {
      this.slip(ctx);
    }

    /* ---- HUD ------------------------------------------------------------- */
    var balance = 1 - U.clamp(Math.abs(this.angle) / 1.0, 0, 1);
    ctx.hud.setMain('STAIRS', this.steps / this.STEPS);
    ctx.hud.setSub('BALANCE', balance);
    ctx.hud.setPips(Math.min(3, this.slips), 3);

    /* adaptive prompt: if the box is falling, shout about it */
    if (Math.abs(this.angle) > 0.55) {
      ctx.hud.prompt(ctx.input.mode === 'motion' ? 'TILT' : 'DRAG',
        this.angle > 0 ? 'left — it is tipping right!' : 'right — it is tipping left!');
    }
  };

  Act2.prototype.slip = function (ctx) {
    this.slips++;
    this.angle *= -0.45;
    this.angVel *= -0.4;
    this.flash = 1;
    this.steps = Math.max(0, this.steps - 1);
    ctx.world.shake(22);
    if (ctx.haptics) ctx.haptics([14, 30, 14]);
    ctx.audio.play('thud', { gain: 0.4, rate: 1.2 });
    ctx.stats.slips++;
    ctx.particles.burst(560, GROUND - 300, {
      count: 20, speed: 240, life: 0.7, size: 6, rgb: '255,107,53',
      kind: 0, grav: 260, scale: ctx.thermal.particleScale
    });
    ctx.hud.toast('Amit: "Arre baap re, gira hi deta main toh ye box!"');

    if (this.slips >= 3) {
      /* forgiving reset: back one step, balance restored */
      this.slips = 0;
      this.angle = 0;
      this.angVel = 0;
      ctx.hud.toast('You caught it. Breathe. Again.');
      ctx.hud.setPips(0, 3);
    }
  };

  Act2.prototype.render = function (g, ctx) {
    var t = this.t;

    /* The staircase is painted into the mid plate, running from the bottom
       left of the frame to the top right. The climber is placed along that
       exact diagonal so the climb reads as one continuous movement. */
    var prog = (this.steps + this.stepT) / this.STEPS;
    var cx = U.lerp(178, 902, prog);
    var cy = U.lerp(1798, 742, prog);

    drawRunner(g, cx, cy, {
      phase: t * 3.4,
      scale: 0.62,
      jump: Math.abs(Math.sin(this.stepT * Math.PI)) * 20,
      boxTilt: this.angle * 0.55 + Math.sin(t * 8) * this.wobble * 0.08,
      rim: Math.abs(this.angle) > 0.7 ? '255,107,53' : '255,201,107'
    });

    /* ---- bubble level ---------------------------------------------------- */
    var lx = 540, ly = 356, r = 104;
    g.save();
    g.globalAlpha = 0.95;
    g.strokeStyle = 'rgba(255,255,255,.16)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(lx, ly, r, 0, Math.PI * 2);
    g.stroke();

    /* danger arcs */
    g.strokeStyle = 'rgba(255,107,53,.5)';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(lx, ly, r, -Math.PI * 0.5 - 0.62, -Math.PI * 0.5 - 0.34);
    g.stroke();
    g.beginPath();
    g.arc(lx, ly, r, -Math.PI * 0.5 + 0.34, -Math.PI * 0.5 + 0.62);
    g.stroke();

    /* the bubble */
    var bx = lx + Math.sin(this.angle) * r * 0.82;
    var by = ly - Math.cos(this.angle) * r * 0.82 + r * 0.4;
    var danger = Math.abs(this.angle) / 1.0;
    var col = danger > 0.6 ? '255,107,53' : (danger > 0.3 ? '255,201,107' : '80,240,190');
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.9;
    var spr = ctx.particles.sprites.goldHot;
    g.drawImage(spr, bx - 40, by - 40, 80, 80);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(' + col + ',1)';
    g.beginPath();
    g.arc(bx, by, 15, 0, Math.PI * 2);
    g.fill();

    U.glowText(g, (this.steps) + ' / ' + this.STEPS + ' steps', lx, ly + r + 54, 26,
      'rgba(234,242,255,.75)', 'rgba(34,225,255,.5)');
    g.restore();

    if (this.flash > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,107,53,' + (this.flash * 0.16).toFixed(3) + ')';
      g.fillRect(0, 0, W, H);
      g.restore();
    }
  };

  /* ============================================================ ACT III */
  function Act3() {
    this.num = 3;
    this.name = 'The Setup';
    this.sub = 'Terrace · the fuse and the lighter';
    this.scene = 'dusk';
    this.music = 'rooftop';
    this.amb = 'city';
    this.done = false;

    this.phase = 'fuse';         /* fuse → spark → done */
    this.progress = 0;
    this.breaks = 0;
    this.needle = 0;
    this.needleDir = 1;
    this.needleSpeed = 0.9;
    this.tries = 0;
    this.t = 0;
    this.hold = 0;
    this.flash = 0;

    /* the fuse, in world coordinates — a lazy S from the lighter to the box */
    this.path = [
      [252, 1084], [368, 1052], [486, 1092], [604, 1044],
      [716, 1078], [806, 1024], [858, 962]
    ];
    this.tolerance = 96;
  }

  Act3.prototype.enter = function (ctx) {
    ctx.world.setScene('dusk', { instant: true });
    ctx.hud.setAct(3, 'The Setup');
    ctx.hud.actCard(3, 'The Setup', this.sub, 2300);
    ctx.hud.setMain('FUSE', 0);
    ctx.hud.setSub('SPARK', 0);
    ctx.hud.setPips(0, 3);
    ctx.audio.music('rooftop');
    ctx.hud.prompt('TRACE', 'drag along the fuse');
    ctx.audio.play('tape', { gain: 0.4 });

    /* a fast tap can begin and end between two frames, so the spark listens
       for the semantic 'tap' event rather than polling ptr.down */
    var self = this;
    this._tap = function () { self.trySpark(ctx); };
    ctx.input.on('tap', this._tap);
  };

  Act3.prototype.exit = function (ctx) {
    var hs = ctx.input.handlers;
    if (hs.tap) hs.tap = hs.tap.filter(function (f) { return f !== this._tap; }, this);
  };

  Act3.prototype.update = function (dt, ctx) {
    this.t += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2.2);

    if (this.phase === 'fuse') {
      var p = ctx.input.ptr;
      if (p.down) {
        var proj = U.projectOnPath(this.path, p.x, p.y);
        if (proj.d < this.tolerance) {
          if (proj.t > this.progress - 0.03) {
            var gained = proj.t - this.progress;
            if (gained > 0) {
              this.progress = Math.min(1, proj.t);
              ctx.addScore(gained * 60);
              var pt = U.pointAt(this.path, this.progress);
              ctx.particles.emit(pt[0], pt[1], U.rand(-20, 20), U.rand(-40, -10), {
                life: 0.5, size: 5, rgb: '34,225,255', kind: 1, a: 0.8
              });
              if (Math.random() < dt * 12) ctx.audio.play('click', { gain: 0.06 });
            }
          }
        } else if (this.progress > 0.04) {
          /* only a hand that was actually on the fuse can snap it */
          this.breakFuse(ctx);
        }
      }
      ctx.hud.setMain('FUSE', this.progress);
      if (this.progress >= 0.985) {
        this.phase = 'spark';
        ctx.hud.prompt('TAP', 'hit the green window');
        ctx.audio.play('click', { gain: 0.5 });
        ctx.particles.burst(840, 1180, {
          count: 26, speed: 260, life: 0.9, size: 6, rgb: '34,225,255',
          kind: 0, scale: ctx.thermal.particleScale
        });
      }
    } else if (this.phase === 'spark') {
      /* the needle sweeps the dial */
      this.needle += this.needleDir * this.needleSpeed * dt;
      if (this.needle > 1) { this.needle = 1; this.needleDir = -1; }
      if (this.needle < 0) { this.needle = 0; this.needleDir = 1; }

      var inZone = this.needle > 0.56 && this.needle < 0.78;
      ctx.hud.setSub('SPARK', this.needle);
      ctx.hud.prompt(inZone ? 'NOW' : 'WAIT', inZone ? 'tap!' : 'wait for the green');

      void inZone;
    }

    ctx.hud.setPips(Math.min(3, this.breaks), 3);
  };

  Act3.prototype.trySpark = function (ctx) {
    if (this.phase !== 'spark') return;

    var inZone = this.needle > 0.56 && this.needle < 0.78;

    if (inZone) {
      this.phase = 'lit';
      ctx.addScore(220);
      ctx.audio.play('click', { gain: 0.7 });
      ctx.audio.play('fuse', { gain: 0.55 });
      ctx.particles.burst(840, 1180, {
        count: 60, speed: 380, life: 1.2, size: 7, rgb: '255,201,107',
        kind: 0, scale: ctx.thermal.particleScale
      });
      ctx.world.flash(840, 1180, 0.8, '255,201,107');
      ctx.world.shake(12);
      ctx.hud.toast('Kabir: "Badiya hai, safe bach gaya waqt pe. Aag kidhar hai?"');
      var self = this;
      setTimeout(function () { self.done = true; }, 1400);
      return;
    }

    this.tries++;
    this.needleSpeed += 0.18;
    ctx.audio.play('slip', { gain: 0.3 });
    ctx.hud.toast('Missed the window — the wheel slipped.');

    if (this.tries >= 4) {
      /* never stuck: widen the window and slow the needle right down */
      this.needle = 0.67;
      this.needleDir = 1;
      this.needleSpeed = 0.55;
    }
  };

  Act3.prototype.breakFuse = function (ctx) {
    if (this.t - (this._lastBreak || -9) < 0.6) return;
    this._lastBreak = this.t;
    this.breaks++;
    this.progress = Math.max(0, this.progress - 0.16);
    this.flash = 1;
    ctx.audio.play('slip', { gain: 0.35 });
    ctx.world.shake(10);
    ctx.hud.toast('The fuse slipped out of your hand.');
    if (this.breaks >= 3) {
      this.breaks = 0;
      ctx.hud.toast('Rahul: "Fuse bilkul theek hai, bas dhyan se."');
    }
  };

  Act3.prototype.render = function (g, ctx) {
    var t = this.t;

    /* --- the box on the tea-poy ------------------------------------------ */
    g.save();
    g.fillStyle = '#1A120C';
    U.roundRect(g, 700, 900, 260, 180, 10);
    g.fill();
    g.fillStyle = 'rgba(196,168,120,.5)';
    g.fillRect(700 + 118, 900, 20, 180);
    g.fillRect(700, 900 + 78, 260, 14);
    g.strokeStyle = 'rgba(255,201,107,.75)';
    g.lineWidth = 3;
    g.strokeRect(700, 900, 260, 180);
    g.restore();

    /* a pool of darkness so the fuse, the box and the lighter read against
       the sunset instead of dissolving into it */
    g.save();
    var vg = g.createRadialGradient(540, 1010, 40, 540, 1010, 560);
    vg.addColorStop(0, 'rgba(4,6,12,.72)');
    vg.addColorStop(0.6, 'rgba(4,6,12,.34)');
    vg.addColorStop(1, 'rgba(4,6,12,0)');
    g.fillStyle = vg;
    g.fillRect(0, 500, W, 1000);
    g.restore();

    /* --- the fuse --------------------------------------------------------- */
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';

    /* guide: dotted, cyan, obviously a path rather than a scratch */
    g.setLineDash([12, 16]);
    g.strokeStyle = 'rgba(34,225,255,.34)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(this.path[0][0], this.path[0][1]);
    for (var i = 1; i < this.path.length; i++) g.lineTo(this.path[i][0], this.path[i][1]);
    g.stroke();

    /* traced portion */
    if (this.progress > 0) {
      var upto = U.clamp(this.progress, 0.001, 1);
      var pts = this.path;
      var total = U.polyLength(pts);
      var target = upto * total;
      var acc = 0;
      g.strokeStyle = 'rgba(34,225,255,.95)';
      g.lineWidth = 14;
      g.shadowColor = 'rgba(34,225,255,.95)';
      g.shadowBlur = 26;
      g.beginPath();
      g.moveTo(pts[0][0], pts[0][1]);
      for (var k = 1; k < pts.length; k++) {
        var seg = U.dist(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
        if (acc + seg <= target) {
          g.lineTo(pts[k][0], pts[k][1]);
          acc += seg;
        } else {
          var f = seg > 0 ? (target - acc) / seg : 0;
          g.lineTo(U.lerp(pts[k - 1][0], pts[k][0], f), U.lerp(pts[k - 1][1], pts[k][1], f));
          break;
        }
      }
      g.stroke();
      g.shadowBlur = 0;
      g.setLineDash([]);
    }
    g.setLineDash([]);
    g.restore();

    /* --- the lighter ------------------------------------------------------ */
    g.save();
    var lit = this.phase !== 'fuse';
    g.fillStyle = '#14161C';
    U.roundRect(g, 202, 1020, 62, 128, 8);
    g.fill();
    g.fillStyle = 'rgba(255,201,107,.9)';
    g.fillRect(202, 1020, 62, 14);
    if (lit) {
      g.globalCompositeOperation = 'lighter';
      var flick = 0.7 + Math.sin(t * 22) * 0.3;
      var spr = ctx.particles.sprites.goldHot;
      g.globalAlpha = 0.85 * flick;
      g.drawImage(spr, 233 - 60, 990 - 60, 120, 120);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();

    /* --- the spark dial --------------------------------------------------- */
    if (this.phase === 'spark') {
      var cx = 540, cy = 760, r = 168;
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.14)';
      g.lineWidth = 22;
      g.beginPath();
      g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5);
      g.stroke();

      /* green window */
      var a0 = Math.PI * 0.75 + Math.PI * 1.5 * 0.56;
      var a1 = Math.PI * 0.75 + Math.PI * 1.5 * 0.78;
      g.strokeStyle = 'rgba(80,240,190,.85)';
      g.lineWidth = 22;
      g.beginPath();
      g.arc(cx, cy, r, a0, a1);
      g.stroke();

      /* needle */
      var ang = Math.PI * 0.75 + Math.PI * 1.5 * this.needle;
      g.strokeStyle = 'rgba(255,231,168,1)';
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(ang) * (r - 18), cy + Math.sin(ang) * (r - 18));
      g.stroke();

      g.fillStyle = 'rgba(255,231,168,.95)';
      g.beginPath();
      g.arc(cx, cy, 12, 0, Math.PI * 2);
      g.fill();

      U.glowText(g, 'STRIKE', cx, cy + r + 64, 26, 'rgba(234,242,255,.7)', 'rgba(34,225,255,.5)');
      g.restore();
    }

    if (this.flash > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,107,53,' + (this.flash * 0.14).toFixed(3) + ')';
      g.fillRect(0, 0, W, H);
      g.restore();
    }
  };

  /* ============================================================= ACT IV */
  function Act4() {
    this.num = 4;
    this.name = 'The Launch';
    this.sub = 'Terrace · 7:05 pm · everything at stake';
    this.scene = 'night';
    this.music = 'launch';
    this.amb = 'wind';
    this.done = false;

    this.phase = 'charge';
    this.pressure = 0;
    this.charging = false;
    this.fizzles = 0;
    this.shellT = -1;
    this.apexHit = false;
    this.t = 0;
    this.flash = 0;
    this.SWEET = [0.58, 0.78];
  }

  Act4.prototype.enter = function (ctx) {
    ctx.world.setScene('night', { instant: true });
    ctx.hud.setAct(4, 'The Launch');
    ctx.hud.actCard(4, 'The Launch', this.sub, 2400);
    ctx.hud.setMain('PRESSURE', 0);
    ctx.hud.setSub('SHELL', 0);
    ctx.hud.setPips(0, 2);
    ctx.audio.music('rooftop');
    ctx.hud.prompt('HOLD', 'build pressure, release in the gold');
    ctx.audio.play('click', { gain: 0.5 });

    var self = this;
    this._down = function () { self.charging = true; };
    this._up = function () {
      if (!self.charging) return;
      self.charging = false;
      if (self.phase === 'charge') self.release(ctx);
    };
    ctx.input.on('down', this._down);
    ctx.input.on('up', this._up);
    this._tap = function () {
      if (self.phase === 'rise') self.tapApex(ctx);
    };
    ctx.input.on('tap', this._tap);
    ctx.input.on('action', function () { self.charging = true; });
    ctx.input.on('actionEnd', function () {
      if (self.charging) { self.charging = false; if (self.phase === 'charge') self.release(ctx); }
    });
  };

  Act4.prototype.exit = function (ctx) {
    var hs = ctx.input.handlers;
    ['down', 'up', 'tap', 'action', 'actionEnd'].forEach(function (k) {
      if (hs[k]) hs[k] = hs[k].filter(function (f) {
        return f !== this._down && f !== this._up && f !== this._tap;
      }, this);
    }, this);
  };

  Act4.prototype.release = function (ctx) {
    var p = this.pressure;
    if (p < 0.2) {
      ctx.hud.toast('Nothing. You have to actually hold it.');
      return;
    }
    if (p >= this.SWEET[0] && p <= this.SWEET[1]) {
      this.phase = 'rise';
      this.shellT = 0;
      ctx.addScore(400);
      ctx.audio.play('whistle', { gain: 0.6 });
      ctx.audio.play('boom', { gain: 0.35, rate: 1.3 });
      ctx.world.flash(540, 1500, 0.7, '255,201,107');
      ctx.world.shake(18);
      ctx.particles.burst(540, 1480, {
        count: 60, speed: 420, life: 1.2, size: 8, rgb: '255,201,107',
        kind: 0, grav: 300, scale: ctx.thermal.particleScale
      });
      ctx.hud.prompt('TAP', 'at the very top');
      ctx.hud.setSub('SHELL', 0.01);
    } else if (p > this.SWEET[1]) {
      this.fizzles++;
      this.pressure = 0;
      ctx.audio.play('slip', { gain: 0.4 });
      ctx.world.shake(26);
      ctx.hud.toast('Overpressure — the shell misfired. Again, softer.');
      ctx.particles.burst(540, 1480, {
        count: 26, speed: 200, life: 0.8, size: 7, rgb: '255,107,53',
        kind: 0, grav: 420, scale: ctx.thermal.particleScale
      });
    } else {
      this.fizzles++;
      this.pressure = 0;
      ctx.audio.play('slip', { gain: 0.3, rate: 1.3 });
      ctx.hud.toast('Undercharged. The shell just coughed.');
    }
  };

  Act4.prototype.tapApex = function (ctx) {
    if (this.apexHit) return;
    var t = this.shellT;                     /* 0..1 */
    var perfect = t > 0.72 && t < 0.9;
    this.apexHit = true;
    this.phase = 'bloom';
    this.bloomT = 0;

    ctx.addScore(perfect ? 600 : 260);
    ctx.audio.play('boom', { gain: 0.85 });
    ctx.world.flash(540, 520, perfect ? 1.5 : 1.0, '255,231,168');
    ctx.world.shake(perfect ? 34 : 20);
    if (ctx.haptics) ctx.haptics(perfect ? [30, 50, 90] : 40);
    ctx.particles.burst(540, 520, {
      count: perfect ? 90 : 50, speed: 520, life: 1.6, size: 9,
      rgb: '255,231,168', kind: 0, grav: 90, scale: ctx.thermal.particleScale
    });
    ctx.particles.ring(540, 520, { size: 40, endSize: 560, life: 0.85, rgb: '255,231,168' });
    ctx.hud.toast(perfect ? 'Kabir: "Dekh! Upar padh kya likha hai!"' : 'Boom — a little early, still beautiful.');
    var self = this;
    setTimeout(function () { self.done = true; }, 1500);
  };

  Act4.prototype.update = function (dt, ctx) {
    this.t += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2);

    if (this.phase === 'charge') {
      if (this.charging) {
        this.pressure = Math.min(1.08, this.pressure + dt * 0.62);
        ctx.particles.emit(540 + U.rand(-40, 40), 1500, U.rand(-30, 30), U.rand(-90, -30), {
          life: 0.5, size: 4, rgb: '255,201,107', kind: 1, a: 0.5
        });
        if (Math.random() < dt * 6) ctx.audio.play('click', { gain: 0.05, rate: 2 });
      } else if (this.pressure > 0 && this.pressure < 0.2) {
        this.pressure = Math.max(0, this.pressure - dt * 0.4);
      }
      ctx.hud.setMain('PRESSURE', this.pressure);
      var inSweet = this.pressure >= this.SWEET[0] && this.pressure <= this.SWEET[1];
      if (inSweet) ctx.hud.prompt('RELEASE', 'now — let it go!');
      else if (this.pressure > this.SWEET[1]) ctx.hud.prompt('TOO HOT', 'release before it blows');
      else ctx.hud.prompt('HOLD', 'build pressure');
    } else if (this.phase === 'rise') {
      this.shellT += dt / 1.55;
      ctx.hud.setSub('SHELL', this.shellT);
      var y = 1480 - this.shellT * 1000;
      ctx.particles.trail(540, y, 0, -1, {
        count: 3, speed: 130, life: 0.7, size: 6, rgb: '255,201,107',
        grav: 120, spread: 0.5, scale: ctx.thermal.particleScale
      });
      if (this.shellT >= 0.92 && !this.apexHit) {
        ctx.hud.prompt('NOW', 'tap at the apex!');
      }
      if (this.shellT >= 1.12) {
        /* missed the apex entirely — still explodes, just lower */
        this.tapApex(ctx);
      }
    } else if (this.phase === 'bloom') {
      this.bloomT += dt;
      if (this.bloomT > 0.5 && this.bloomT < 1.2 && Math.random() < dt * 8) {
        ctx.particles.burst(540 + U.rand(-160, 160), 520 + U.rand(-160, 160), {
          count: 10, speed: 260, life: 1.1, size: 6,
          rgb: U.pick(['255,201,107', '34,225,255', '255,79,216', '80,240,190']),
          kind: 0, scale: ctx.thermal.particleScale
        });
      }
    }
    ctx.hud.setPips(Math.min(2, this.fizzles), 2);
  };

  Act4.prototype.render = function (g, ctx) {
    var t = this.t;

    /* --- the crate and the mortar tube ------------------------------------ */
    if (this.phase === 'charge' || this.phase === 'rise') {
      g.save();
      /* crate */
      g.fillStyle = '#1E150E';
      U.roundRect(g, 448, 1478, 184, 96, 6);
      g.fill();
      g.strokeStyle = 'rgba(255,201,107,.55)';
      g.lineWidth = 2.5;
      g.strokeRect(448, 1478, 184, 96);
      /* slats */
      g.strokeStyle = 'rgba(255,201,107,.22)';
      g.lineWidth = 2;
      for (var sl = 1; sl < 4; sl++) {
        g.beginPath();
        g.moveTo(448, 1478 + sl * 24);
        g.lineTo(632, 1478 + sl * 24);
        g.stroke();
      }
      /* tube: a cylinder mouth catching the city light */
      g.fillStyle = '#0A0C12';
      U.roundRect(g, 508, 1420, 64, 62, 4);
      g.fill();
      g.strokeStyle = 'rgba(34,225,255,.35)';
      g.lineWidth = 2;
      g.strokeRect(508, 1420, 64, 62);
      g.fillStyle = '#05070C';
      g.beginPath();
      g.ellipse(540, 1420, 32, 11, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,201,107,.6)';
      g.beginPath();
      g.ellipse(540, 1420, 32, 11, 0, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }

    /* --- pressure gauge --------------------------------------------------- */
    if (this.phase === 'charge') {
      var gx = 540, gy = 700, r = 190;
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.14)';
      g.lineWidth = 26;
      g.beginPath();
      g.arc(gx, gy, r, Math.PI * 0.8, Math.PI * 2.2);
      g.stroke();

      var s0 = Math.PI * 0.8 + Math.PI * 1.4 * this.SWEET[0];
      var s1 = Math.PI * 0.8 + Math.PI * 1.4 * this.SWEET[1];
      g.strokeStyle = 'rgba(255,201,107,.9)';
      g.lineWidth = 26;
      g.beginPath();
      g.arc(gx, gy, r, s0, s1);
      g.stroke();

      if (this.pressure > 0) {
        g.strokeStyle = this.pressure > this.SWEET[1] ? 'rgba(255,107,53,1)' : 'rgba(34,225,255,1)';
        g.lineWidth = 12;
        g.beginPath();
        g.arc(gx, gy, r, Math.PI * 0.8, Math.PI * 0.8 + Math.PI * 1.4 * Math.min(1, this.pressure));
        g.stroke();
      }
      U.glowText(g, 'PRESSURE', gx, gy + r + 96, 22, 'rgba(234,242,255,.55)', 'rgba(34,225,255,.35)');
      if (this.pressure > 0) {
        U.glowText(g, Math.round(this.pressure * 100) + '%', gx, gy + 6, 46,
          this.pressure > this.SWEET[1] ? 'rgba(255,107,53,1)' : 'rgba(255,231,168,.95)',
          'rgba(255,201,107,.6)');
      }
      g.restore();
    }

    /* --- the shell -------------------------------------------------------- */
    if (this.phase === 'rise') {
      var y = 1480 - this.shellT * 1000;
      g.save();
      g.globalCompositeOperation = 'lighter';
      var spr = ctx.particles.sprites.goldHot;
      g.globalAlpha = 0.95;
      g.drawImage(spr, 540 - 50, y - 50, 100, 100);
      g.globalAlpha = 0.5;
      g.drawImage(spr, 540 - 120, y - 120, 240, 240);
      g.restore();

      /* apex band */
      g.save();
      g.strokeStyle = 'rgba(80,240,190,' + (0.35 + Math.sin(t * 12) * 0.2) + ')';
      g.lineWidth = 4;
      g.setLineDash([16, 14]);
      g.beginPath();
      g.moveTo(240, 480);
      g.lineTo(840, 480);
      g.stroke();
      g.restore();
    }

    if (this.flash > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,231,168,' + (this.flash * 0.2).toFixed(3) + ')';
      g.fillRect(0, 0, W, H);
      g.restore();
    }
  };

  /* ============================================================== ACT V */
  var LETTERS = [
    {
      ch: 'J',
      strokes: [
        [[0.86, 0.10], [0.54, 0.10]],
        [[0.70, 0.10], [0.70, 0.66], [0.63, 0.86], [0.42, 0.92], [0.22, 0.78]]
      ]
    },
    {
      ch: 'A',
      strokes: [
        [[0.10, 0.92], [0.50, 0.08]],
        [[0.50, 0.08], [0.90, 0.92]],
        [[0.26, 0.60], [0.74, 0.60]]
      ]
    },
    {
      ch: 'Y',
      strokes: [
        [[0.12, 0.08], [0.50, 0.50]],
        [[0.88, 0.08], [0.50, 0.50]],
        [[0.50, 0.50], [0.50, 0.94]]
      ]
    },
    {
      ch: 'H',
      strokes: [
        [[0.16, 0.08], [0.16, 0.94]],
        [[0.84, 0.08], [0.84, 0.94]],
        [[0.16, 0.52], [0.84, 0.52]]
      ]
    },
    {
      ch: 'O',
      strokes: [circleStroke()]
    }
  ];

  function circleStroke() {
    var pts = [];
    for (var i = 0; i <= 24; i++) {
      var a = -Math.PI / 2 + (i / 24) * Math.PI * 2;
      pts.push([0.5 + Math.cos(a) * 0.38, 0.5 + Math.sin(a) * 0.46]);
    }
    return pts;
  }

  function Act5() {
    this.num = 5;
    this.name = 'The Sky';
    this.sub = 'Above the city · write it in fire';
    this.scene = 'sky';
    this.music = 'sky';
    this.amb = 'crowd';
    this.done = false;

    this.letter = 0;
    this.stroke = 0;
    this.progress = 0;
    this.ignited = [];
    this.t = 0;
    this.tol = 0.085;
    this.lastPt = null;
    this.flash = 0;
    this.finaleT = -1;

    /* geometry: five letters across the sky */
    this.LW = 150;
    this.LH = 250;
    this.GAP = 22;
    this.baseX = (W - (5 * this.LW + 4 * this.GAP)) / 2;
    this.baseY = 620;
  }

  Act5.prototype.enter = function (ctx) {
    ctx.world.setScene('sky', { instant: true });
    ctx.hud.setAct(5, 'The Sky');
    ctx.hud.actCard(5, 'The Sky', this.sub, 2400);
    ctx.hud.setMain('LETTERS', 0);
    ctx.hud.setSub('EMBER', 0);
    ctx.hud.setPips(0, 5);
    ctx.audio.music('finale');
    ctx.hud.prompt('DRAW', 'trace each letter, embers will follow');
    ctx.audio.play('chime', { gain: 0.4 });
  };

  Act5.prototype.exit = function () {};

  Act5.prototype.letterRect = function (i) {
    return {
      x: this.baseX + i * (this.LW + this.GAP),
      y: this.baseY,
      w: this.LW,
      h: this.LH
    };
  };

  Act5.prototype.toWorld = function (i, pt) {
    var r = this.letterRect(i);
    return [r.x + pt[0] * r.w, r.y + pt[1] * r.h];
  };

  Act5.prototype.currentStroke = function () {
    var L = LETTERS[this.letter];
    if (!L) return null;
    var s = L.strokes[this.stroke];
    if (!s) return null;
    return s.map(this.toWorld.bind(this, this.letter));
  };

  Act5.prototype.update = function (dt, ctx) {
    this.t += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 2);

    if (this.finaleT >= 0) {
      this.finaleT += dt;
      if (this.finaleT < 2.4 && Math.random() < dt * 14) {
        ctx.particles.burst(U.rand(120, W - 120), U.rand(200, 900), {
          count: 8, speed: 220, life: 1.2, size: 6,
          rgb: U.pick(['255,201,107', '34,225,255', '255,79,216', '80,240,190', '255,231,168']),
          kind: 0, scale: ctx.thermal.particleScale
        });
      }
      if (this.finaleT > 0.4 && Math.random() < dt * 4) {
        ctx.audio.play('boom', { gain: 0.35, rate: U.rand(0.9, 1.3) });
      }
      /* let the sky message breathe before the card takes over */
      if (this.finaleT > 5.4 && !this.done) this.done = true;
      return;
    }

    var path = this.currentStroke();
    if (!path) return;

    var p = ctx.input.ptr;
    if (p.down) {
      var proj = U.projectOnPath(path, p.x, p.y);
      var tolPx = this.tol * this.LH * 1.5;

      if (proj.d < tolPx && proj.t > this.progress - 0.06) {
        if (proj.t > this.progress) {
          this.progress = Math.min(1, proj.t);
          var pt = U.pointAt(path, this.progress);
          ctx.particles.emit(pt[0], pt[1], U.rand(-16, 16), U.rand(-30, -6), {
            life: 0.75, size: 7, rgb: '255,201,107', kind: 1, a: 0.9, drag: 0.96
          });
          if (Math.random() < dt * 10) ctx.audio.play('sparkle', { gain: 0.05, rate: U.rand(1.1, 1.5) });
          ctx.addScore(dt * 120);
        }
        ctx.hud.setSub('EMBER', this.progress);
      }

      if (this.progress >= 0.97) this.finishStroke(ctx);
    }
  };

  Act5.prototype.finishStroke = function (ctx) {
    var L = LETTERS[this.letter];
    this.progress = 0;
    this.stroke++;
    ctx.audio.play('chime', { gain: 0.3, rate: 1.2 });

    if (this.stroke >= L.strokes.length) {
      /* letter complete */
      this.ignited.push(this.letter);
      ctx.addScore(500);
      var r = this.letterRect(this.letter);
      ctx.particles.burst(r.x + r.w / 2, r.y + r.h / 2, {
        count: 44, speed: 340, life: 1.3, size: 8, rgb: '255,231,168',
        kind: 0, scale: ctx.thermal.particleScale
      });
      ctx.particles.ring(r.x + r.w / 2, r.y + r.h / 2, {
        size: 30, endSize: 210, life: 0.55, rgb: '255,201,107'
      });
      ctx.world.flash(r.x + r.w / 2, r.y + r.h / 2, 0.55, '255,231,168');
      ctx.audio.play('boom', { gain: 0.3, rate: 1.4 });
      ctx.hud.setPips(this.ignited.length, 5);
      ctx.hud.setMain('LETTERS', this.ignited.length / 5);

      this.letter++;
      this.stroke = 0;
      this.progress = 0;

      if (this.letter >= LETTERS.length) {
        this.startFinale(ctx);
      }
    }
  };

  Act5.prototype.startFinale = function (ctx) {
    this.finaleT = 0;
    ctx.hud.hidePrompt();
    ctx.hud.toast('Kabir: "Dekh! Upar padh kya likha hai!"', 3200);
    ctx.audio.music('finale', { fade: 2.4 });
    if (ctx.haptics) ctx.haptics([24, 40, 24]);
    ctx.audio.play('crowd', { gain: 0.5 });
    ctx.audio.play('boom', { gain: 0.6 });
    ctx.world.flash(W / 2, 700, 1.6, '255,231,168');
    ctx.world.shake(24);
    for (var i = 0; i < 4; i++) {
      ctx.particles.burst(U.rand(200, W - 200), U.rand(260, 700), {
        count: 34, speed: 420, life: 1.6, size: 8,
        rgb: U.pick(['255,201,107', '34,225,255', '255,79,216', '80,240,190']),
        kind: 0, scale: ctx.thermal.particleScale
      });
    }
  };

  Act5.prototype.render = function (g, ctx) {
    var t = this.t;

    /* --- letters ---------------------------------------------------------- */
    for (var i = 0; i < LETTERS.length; i++) {
      var L = LETTERS[i];
      var rect = this.letterRect(i);
      var ignited = this.ignited.indexOf(i) !== -1;

      for (var s = 0; s < L.strokes.length; s++) {
        var pts = L.strokes[s].map(this.toWorld.bind(this, i));
        var isCurrent = (i === this.letter && s === this.stroke && this.finaleT < 0);

        g.save();
        g.lineCap = 'round';
        g.lineJoin = 'round';

        if (ignited) {
          /* burnt into the sky */
          g.strokeStyle = 'rgba(255,231,168,.95)';
          g.lineWidth = 12;
          g.shadowColor = 'rgba(255,201,107,.95)';
          g.shadowBlur = 34;
        } else {
          g.strokeStyle = isCurrent ? 'rgba(180,240,255,.55)' : 'rgba(255,255,255,.22)';
          g.lineWidth = isCurrent ? 10 : 8;
          g.setLineDash([10, 12]);
        }

        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (var k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
        g.stroke();

        /* the traced part of the current stroke burns behind the finger */
        if (isCurrent && this.progress > 0.01) {
          g.setLineDash([]);
          g.strokeStyle = 'rgba(255,231,168,.9)';
          g.lineWidth = 11;
          g.shadowColor = 'rgba(255,201,107,.9)';
          g.shadowBlur = 28;
          g.beginPath();
          g.moveTo(pts[0][0], pts[0][1]);
          var total = U.polyLength(pts);
          var target = total * this.progress;
          var acc = 0;
          for (var j = 1; j < pts.length; j++) {
            var seg = U.dist(pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1]);
            if (acc + seg <= target) {
              g.lineTo(pts[j][0], pts[j][1]);
              acc += seg;
            } else {
              var f = seg > 0 ? (target - acc) / seg : 0;
              g.lineTo(U.lerp(pts[j - 1][0], pts[j][0], f), U.lerp(pts[j - 1][1], pts[j][1], f));
              break;
            }
          }
          g.stroke();
        }
        g.restore();
      }

      /* a hint ring around the letter you are meant to draw */
      if (i === this.letter && this.finaleT < 0) {
        g.save();
        g.strokeStyle = 'rgba(34,225,255,' + (0.25 + Math.sin(t * 4) * 0.12) + ')';
        g.lineWidth = 2;
        g.setLineDash([6, 10]);
        U.roundRect(g, rect.x - 16, rect.y - 16, rect.w + 32, rect.h + 32, 22);
        g.stroke();
        g.restore();
      }
    }

    /* --- the message ------------------------------------------------------ */
    if (this.finaleT >= 0) {
      var a = U.clamp(this.finaleT / 0.8, 0, 1);
      g.save();
      g.globalAlpha = a;
      var scale = U.lerp(0.9, 1, U.ease.outExpo(a));
      g.translate(W / 2, 300);
      g.scale(scale, scale);
      g.globalCompositeOperation = 'lighter';
      U.glowText(g, 'HAPPY BIRTHDAY', 0, 0, 74, 'rgba(255,214,140,1)', 'rgba(255,150,60,1)');
      U.glowText(g, 'JAYHO', 0, 104, 108, 'rgba(255,255,255,1)', 'rgba(255,190,90,1)');
      g.globalCompositeOperation = 'source-over';
      g.restore();

    }

    if (this.flash > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = 'rgba(255,231,168,' + (this.flash * 0.15).toFixed(3) + ')';
      g.fillRect(0, 0, W, H);
      g.restore();
    }
  };

  G.Acts = {
    Act1: Act1, Act2: Act2, Act3: Act3, Act4: Act4, Act5: Act5,
    LETTERS: LETTERS,
    GROUND: GROUND,
    W: W, H: H
  };
})(window);
