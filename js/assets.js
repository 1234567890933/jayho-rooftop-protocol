/* ============================================================================
   assets.js — progressive asset loading.
   ----------------------------------------------------------------------------
   The repo carries ~56 MB of art. Loading all of it up front would be a crime
   on a phone, so the game loads by *chapter*: the title needs one plate, each
   act needs its own three, and the next act is prefetched while you play the
   current one. Decoded bitmaps for acts you have left are released.

   Every image is decoded off the main thread (img.decode()) where supported,
   so a 5 MB plate never stalls the frame loop.
   ========================================================================= */
(function (G) {
  'use strict';

  var ART = 'assets/art/';

  var MANIFEST = {
    title: ['title_bg', 'night_far', 'night_atmo'],
    /* each act carries its own painted title plate so the card is never blank */
    lane: ['lane_far', 'lane_mid', 'lane_atmo', 'lane_near', 'lane_fg', 'card_1'],
    stairs: ['stairs_far', 'stairs_mid', 'stairs_atmo', 'stairs_fg', 'card_2'],
    dusk: ['dusk_far', 'dusk_mid', 'dusk_atmo', 'dusk_near', 'dusk_fg', 'card_3'],
    night: ['night_far', 'night_mid', 'night_atmo', 'night_near', 'night_fg', 'card_4'],
    sky: ['sky_far', 'sky_mid', 'sky_atmo', 'sky_near', 'sky_fg', 'card_5']
  };

  var TEX = ['tex_glow', 'tex_smoke', 'tex_grain'];

  function Assets() {
    this.images = {};
    this.pending = {};
    this.groupsLoaded = {};
    this.failed = [];
  }

  Assets.MANIFEST = MANIFEST;

  Assets.prototype.path = function (key) { return ART + key + '.png'; };

  /* Load one image; resolves with the HTMLImageElement */
  Assets.prototype.image = function (key) {
    var self = this;
    if (this.images[key]) return Promise.resolve(this.images[key]);
    if (this.pending[key]) return this.pending[key];

    var p = new Promise(function (resolve) {
      var img = new Image();
      img.decoding = 'async';
      img.onload = function () {
        var finish = function () {
          /* Down-scale the plate once, at load, to the largest size the
             renderer can actually use. A 2048x2731 PNG costs 22 MB decoded;
             at 1440x1920 it costs 11 MB, draws faster, and is still sharper
             than any phone screen can show (390 CSS px at DPR 3 = 1170). */
          /* per-role budget: atmosphere plates are blur, so they cost almost
             nothing at 900px; foreground silhouettes at 1200; real plates 1440 */
          var targetW = 1440;
          if (/_atmo$/.test(key)) targetW = 900;
          else if (/_fg$/.test(key)) targetW = 1200;
          else if (/^card_/.test(key) || key === 'title_bg') targetW = 1080;
          var scale = Math.min(1, targetW / img.naturalWidth);
          var cw = Math.max(1, Math.round(img.naturalWidth * scale));
          var chh = Math.max(1, Math.round(img.naturalHeight * scale));
          var c = document.createElement('canvas');
          c.width = cw;
          c.height = chh;
          var g2 = c.getContext('2d');
          g2.imageSmoothingEnabled = true;
          g2.imageSmoothingQuality = 'high';
          g2.drawImage(img, 0, 0, cw, chh);
          /* keep the same shape the renderer expects from an <img> */
          c.naturalWidth = cw;
          c.naturalHeight = chh;

          self.images[key] = c;
          delete self.pending[key];
          resolve(c);
        };
        if (img.decode) img.decode().then(finish).catch(finish);
        else finish();
      };
      img.onerror = function () {
        self.failed.push(key);
        delete self.pending[key];
        if (G.console) console.warn('[assets] missing plate:', key);
        resolve(null);                       /* never reject: the game must run */
      };
      img.src = self.path(key);
    });

    this.pending[key] = p;
    return p;
  };

  /* Load a named group. onProgress(done, total) */
  Assets.prototype.group = function (name, onProgress) {
    var self = this;
    var keys = MANIFEST[name] || [];
    if (!keys.length) return Promise.resolve([]);
    if (this.groupsLoaded[name]) {
      if (onProgress) onProgress(keys.length, keys.length);
      return Promise.resolve(keys);
    }

    var done = 0;
    var total = keys.length;
    if (onProgress) onProgress(0, total);

    return Promise.all(keys.map(function (k) {
      return self.image(k).then(function (img) {
        done++;
        if (onProgress) onProgress(done, total);
        return img;
      });
    })).then(function () {
      self.groupsLoaded[name] = true;
      return keys;
    });
  };

  /* The three tiny textures the renderer needs on frame one */
  Assets.prototype.textures = function (onProgress) {
    var self = this;
    var done = 0;
    if (onProgress) onProgress(0, TEX.length);
    return Promise.all(TEX.map(function (k) {
      return self.image(k).then(function (img) {
        done++;
        if (onProgress) onProgress(done, TEX.length);
        return img;
      });
    }));
  };

  Assets.prototype.get = function (key) { return this.images[key] || null; };

  /* Free a group's decoded bitmaps. The browser keeps the HTTP cache, so a
     re-entry costs a decode but not a download. */
  Assets.prototype.release = function (name) {
    var keys = MANIFEST[name] || [];
    for (var i = 0; i < keys.length; i++) {
      var img = this.images[keys[i]];
      if (img) {
        /* plates are canvases now: zeroing the bitmap is what actually frees
           the memory. Setting .src on a canvas does nothing at all. */
        try { img.width = 0; img.height = 0; } catch (e) { /* ignore */ }
        delete this.images[keys[i]];
      }
    }
    delete this.groupsLoaded[name];
  };

  /* Free every group except the one being loaded. Holding two chapters of
     1440px plates is ~110 MB of decoded bitmaps; one chapter is ~55 MB. */
  Assets.prototype.releaseAllExcept = function (keep) {
    var names = [];
    for (var g in this.groupsLoaded) if (g !== keep) names.push(g);
    for (var i = 0; i < names.length; i++) this.release(names[i]);
  };

  /* Rough count of decoded pixels — surfaced in the debug overlay */
  Assets.prototype.memoryMB = function () {
    var bytes = 0;
    for (var k in this.images) {
      var img = this.images[k];
      if (img && img.naturalWidth) bytes += img.naturalWidth * img.naturalHeight * 4;
    }
    return bytes / 1048576;
  };

  G.Assets = Assets;
})(window);
