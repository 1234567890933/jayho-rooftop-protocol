/* ============================================================================
   hud.js — every DOM write in the game funnels through here.
   ----------------------------------------------------------------------------
   The canvas owns the world; the HUD owns the numbers. Keeping them apart means
   a HUD update never dirties the render loop, and the render loop never touches
   layout. All writes are guarded by a value check so we never set style twice
   for the same number.
   ========================================================================= */
(function (G) {
  'use strict';

  function HUD() {
    this.el = {
      hud: document.getElementById('hud'),
      act: document.getElementById('hud-act'),
      name: document.getElementById('hud-name'),
      score: document.getElementById('hud-score'),
      main: document.getElementById('bar-main'),
      mainLabel: document.getElementById('bar-main-label'),
      sub: document.getElementById('bar-sub'),
      subLabel: document.getElementById('bar-sub-label'),
      pips: document.getElementById('hud-pips'),
      prompt: document.getElementById('prompt'),
      promptKey: document.getElementById('prompt-key'),
      promptText: document.getElementById('prompt-text'),
      card: document.getElementById('actcard'),
      cardKicker: document.getElementById('actcard-kicker'),
      cardTitle: document.getElementById('actcard-title'),
      cardSub: document.getElementById('actcard-sub'),
      toast: document.getElementById('toast')
    };
    this._last = { score: -1, main: -1, sub: -1, prompt: '', pips: -1 };
    this._cardTimer = 0;
    this._toastTimer = 0;
  }

  HUD.prototype.show = function (on) {
    this.el.hud.classList.toggle('is-on', !!on);
  };

  HUD.prototype.setAct = function (num, name) {
    this.el.act.textContent = 'ACT ' + ['', 'I', 'II', 'III', 'IV', 'V'][num];
    this.el.name.textContent = name;
  };

  HUD.prototype.setScore = function (v) {
    v = Math.round(v);
    if (v === this._last.score) return;
    this._last.score = v;
    this.el.score.textContent = v;
  };

  HUD.prototype.setMain = function (label, pct) {
    if (label && label !== this.el.mainLabel.textContent) this.el.mainLabel.textContent = label;
    var p = Math.round(Math.max(0, Math.min(1, pct)) * 1000) / 10;
    if (p === this._last.main) return;
    this._last.main = p;
    this.el.main.style.width = p + '%';
  };

  HUD.prototype.setSub = function (label, pct) {
    if (label && label !== this.el.subLabel.textContent) this.el.subLabel.textContent = label;
    var p = Math.round(Math.max(0, Math.min(1, pct)) * 1000) / 10;
    if (p === this._last.sub) return;
    this._last.sub = p;
    this.el.sub.style.width = p + '%';
  };

  HUD.prototype.setPips = function (on, total) {
    if (on === this._last.pips) return;
    this._last.pips = on;
    var html = '';
    for (var i = 0; i < total; i++) html += '<span class="pip' + (i < on ? ' on' : '') + '"></span>';
    this.el.pips.innerHTML = html;
  };

  HUD.prototype.prompt = function (key, text) {
    var sig = key + '|' + text;
    if (sig === this._last.prompt) return;
    this._last.prompt = sig;
    this.el.promptKey.textContent = key;
    this.el.promptText.textContent = text;
    this.el.prompt.classList.add('is-on');
  };

  HUD.prototype.hidePrompt = function () {
    this._last.prompt = '';
    this.el.prompt.classList.remove('is-on');
  };

  HUD.prototype.actCard = function (num, title, sub, ms) {
    var e = this.el;
    /* painted plate behind the words — one per act, loaded with the act */
    e.card.style.backgroundImage = 'url("assets/art/card_' + num + '.png")';
    e.cardKicker.textContent = 'ACT ' + ['', 'I', 'II', 'III', 'IV', 'V'][num];
    e.cardTitle.textContent = title;
    e.cardSub.textContent = sub;
    e.card.classList.add('is-on');
    clearTimeout(this._cardTimer);
    this._cardTimer = setTimeout(function () {
      e.card.classList.remove('is-on');
    }, ms || 2100);
  };

  HUD.prototype.toast = function (msg, ms) {
    var e = this.el;
    e.toast.textContent = msg;
    e.toast.classList.add('is-on');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(function () {
      e.toast.classList.remove('is-on');
    }, ms || 2400);
  };

  HUD.prototype.reset = function () {
    this._last = { score: -1, main: -1, sub: -1, prompt: '', pips: -1 };
    this.setMain('DISTANCE', 0);
    this.setSub('GRIP', 1);
    this.setPips(0, 5);
  };

  G.HUD = HUD;
})(window);
