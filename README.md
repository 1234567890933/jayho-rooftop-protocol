# The Jayho Chronicles · **Rooftop Protocol**

A five-act, motion-controlled birthday **game** — not a video. It has no fixed runtime, no autoplay, no timeline you sit and watch. You shake the phone to sprint through a Kolkata lane, tilt it to keep a box from falling on the stairs, trace a fuse with your finger, hold your breath over a pressure gauge, and then draw his name in the sky with your thumb.

Everything in it is a rule you can win or lose.

**Payload: ~155 MB standard, ~400 MB max.** The max profile bakes the plates at
2731 px and the music at 2.4× length. The APK is built by GitHub Actions and
published as a Release, so the download is a single permanent URL.

---

## 1. What you actually do

| Act | Scene | Mechanic | Fails how |
| --- | --- | --- | --- |
| **I · The Run** | Beliaghata lane, 6:42 pm | **Shake** to sprint, **tap** to jump potholes, dogs and cycles. Grab sparks. Touch mode: **hold** to sprint. | Hitting an obstacle costs grip and speed. At zero grip the tribe catches the box — you never restart the act. |
| **II · The Climb** | Basu Villa staircase | **Tilt** left/right to keep the box level while it climbs. Mossy steps kick it. Touch mode: **drag**. | Three slips and you are put back one step with the box re-centred. |
| **III · The Setup** | The terrace, dusk | **Trace** the fuse with your finger (stray and it snaps), then **tap** the spark in the green window of a sweeping dial. | Straying shortens the fuse. Four misses and the dial slows and widens — the game will not let you get stuck. |
| **IV · The Launch** | The terrace, night | **Hold** to build pressure, **release** in the gold band, then **tap** at the shell's apex. | Undercharge fizzles, overcharge misfires. Both are recoverable in two seconds. |
| **V · The Sky** | Above the city | **Draw** J-A-Y-H-O. Embers follow your finger; each finished letter ignites in gold. | Nothing. This one you cannot lose. |

Score comes from distance, sparks, steps, timing precision and letter strokes. The finale reports points, time on the roof and near misses.

### Controls, honestly

Motion needs **HTTPS**, a **user gesture** (iOS 13+ asks explicitly) and a device that has the sensor. Any of those can refuse. So:

- `Begin the Mission` requests permission, then waits 1.4 s to see whether events actually arrive.
- If they do, `input.mode = 'motion'` and the HUD prompts read *SHAKE* / *TILT*.
- If they do not, the game switches to `input.mode = 'touch'` and the prompts read *HOLD* / *DRAG*. **Every act is fully playable this way.** Nothing is gated behind a sensor.
- Desktop: **Space** is the action key, **← →** tilt, mouse drags work everywhere.

---

## 1b. The aim engine (gyro)

The phone is the controller. `js/gyro.js` is a small aim engine, and it is the
difference between "a web page that reads the accelerometer" and controls that
feel like a mobile shooter:

- **Calibration.** Whatever angle you hold the phone at when an act starts
  becomes the centre of the world. Recalibrate any time from **Controls**.
- **Dead zone.** 3° of hand tremor is ignored, then the response is rescaled past
  the edge so there is no jump at the boundary.
- **Critically damped spring.** Each axis runs through a spring with
  `k = c²/4`, so it settles without overshoot and never oscillates. Raw sensor
  noise at 60 Hz becomes smooth motion.
- **Response curve.** 1.35 power: fine control near the centre for aiming, fast
  at the edges for big turns.
- **Hard clamp.** A dropped phone cannot spin the camera.
- **Parallax look.** The camera offset is applied per layer, with nearer layers
  sliding further than far ones — the street gains real depth when you tilt.
- **Settings** — sensitivity 0.2×–3×, invert-Y, haptics, recalibrate — persisted
  in `localStorage`.

Act II's balance input runs through the same dead zone and smoothing, which is
why the box no longer shivers when your hand is still.

---

## 1c. The Android APK

`RooftopProtocol.apk` (154 MB) is included. It is a WebView shell around the
exact same web build — no second codebase, no drift between the two formats.

- **Package** `in.jayho.rooftop` · version 1.1 · minSdk 23 (Android 6) · targetSdk 34
- **Install:** copy the APK to the phone, tap it, allow "install from this source".
  It is signed with a debug key, which is what Android needs for sideloading.
- **Why it is not `file://`:** the game is served to the WebView from
  `https://appassets.androidplatform.net` by intercepting requests in
  `MainActivity.java`. A `file://` origin is opaque — no `localStorage`, no
  `fetch`, no sensor APIs, no audio streaming. The https origin means the
  JavaScript is byte-identical to the web build and motion controls work.
- **Sensors:** the accelerometer/gyroscope are declared `required="false"`, so
  the APK installs on a phone without them and falls back to touch.
- **Rebuild it yourself:** `android/tools/build_apk.sh` (needs JDK 17 and
  Android build-tools 34; it uses aapt2 → javac → d8 → zipalign → apksigner,
  no Gradle). Or push to GitHub: `.github/workflows/android.yml` bakes the
  assets, installs the SDK on the runner, builds the APK and publishes it as a
  **GitHub Release** — that release URL is the one-tap download link.

**Two asset profiles.** The repository stores generators, not gigabytes, so
`tools/make_assets.sh standard` bakes ~155 MB and `tools/make_assets.sh max`
bakes ~400 MB (plates at 2731 px, music at 2.4x length). The CI workflow takes
the profile as a manual input.

> A 154 MB APK is fine to sideload, but it is over Google Play's 100 MB base
> limit. For Play you would ship an AAB with a Play Asset Delivery pack — the
> same assets, split. Not needed for sending a link or a file to friends.

---

## 2. Run it

```bash
# from the project root
python3 -m http.server 8080
# → http://localhost:8080
```

Use a server, not `file://`. Two reasons: the effects are fetched with `fetch()` (blocked on `file://` in Chrome), and motion sensors require a secure context. On `http://localhost` Chrome treats the origin as secure, so tilt works there too.

**Requirements:** Canvas 2D + Web Audio + Pointer Events. Chrome 70+, Safari 13+, Firefox 68+. No frameworks, no build step, no npm.

---

## 3. Deploy

`.github/workflows/deploy.yml` is a standard Pages pipeline:

1. Push the folder as the root of `main`.
2. **Settings → Pages → Source: GitHub Actions**.
3. Push again. It publishes to `https://<you>.github.io/<repo>/`.

Keep `index.html` paths relative (they are), so the project-subpath URL works. All asset URLs are relative to `index.html`.

> The repo is ~154 MB. GitHub Pages serves that fine (the limit is 1 GB), but the **first** visit to each act downloads that act's plates: ~10–13 MB. Subsequent visits come from the HTTP cache.

---

## 3b. What changed in 1.1

**Bugs found and fixed**

| Symptom | Cause | Fix |
| --- | --- | --- |
| The title screen sometimes never appeared; the first tap did nothing | `visibility` was in the `.screen` transition list, so the discrete transition could stall at `hidden` on a busy compositor | visibility now flips instantly on show, and after the fade on hide |
| The Begin button was dead for the first ~400 ms | state flipped to `title` before the boot overlay had gone | DOM first, state last, plus `pointer-events:none` on the outgoing overlay |
| No particles anywhere | `Particles.clear()` reset `freeTop` to 0 without refilling it, so every `emit` returned null | `freeTop` restored to capacity |
| Speed, distance and everything downstream became `NaN` | `U.smooth` used `Math.pow(1 - rate, …)`; a rate above 1 makes that `NaN` | exponential smoothing: `1 - Math.exp(-rate·dt)` |
| A stray tap snapped the fuse in Act III | any pointer-down away from the path counted as a break | only a hand that was already tracing can snap it |
| Act II was unplayable on touch | the tilt input read a per-move delta, so holding still meant zero input | a virtual joystick anchored where the finger landed |
| A finished act cascaded through every remaining chapter in one second | the act stayed live while its successor was loading | `state='loading'` guard + load token |
| Memory climbed to 110 MB | the title group's bitmaps were never released | every other chapter is freed before the next loads |
| Climbers and runners walked off the frame | fixed world positions | positions lerped inside the visible band |
| The shockwave read as a brown donut; the "bucket" in the night foreground read as a grey box | ring sprite too large / decorative silhouette too light | ring shrunk, bucket removed |

**Added**

- **Two new parallax layers per scene** — an additive atmosphere plate (light
  shafts, haze, floating dust) and a foreground silhouette that passes in front
  of play. Five layers deep per scene now.
- **Six new audio beds** — three act scores (`climb`, `launch`, `sky`) and three
  ambience loops (city, wind, crowd) mixed under the music.
- **Painted act cards** behind each ACT I–V title, one plate per act.
- **Haptics** — a short vibration on impacts, slips and the launch (skipped on
  the low thermal tier so it does not fight the governor).
- **Pause/resume** on `visibilitychange`, wired to the Android lifecycle hooks
  (`__androidPause`, `__androidResume`, `__androidBack`).
- **Best score** kept in `localStorage` and shown on the title screen.
- **Per-act music** — the score changes as the story moves, instead of one bed.

---

## 4. Structure

```
jayho-rooftop-protocol/
├── .github/workflows/deploy.yml
├── index.html                 shell, HUD, screens
├── css/style.css              design system (transform/opacity only)
├── js/
│   ├── util.js                math, easing, PRNG, path projection
│   ├── thermal.js             the performance governor
│   ├── assets.js              per-chapter loading + down-scaling + release
│   ├── audio.js               streamed music + Web Audio effects
│   ├── input.js               touch · keyboard · shake · tilt (+ fallback)
│   ├── particles.js           one pooled system, 1200 slots
│   ├── world.js               parallax stage, flashes, camera shake
│   ├── hud.js                 every DOM write in the game
│   ├── acts.js                the five acts
│   └── main.js                bootstrap, loop, act router
├── assets/
│   ├── art/                   24 plates (5 scenes x 5 layers + 5 cards) + 4 textures
│   └── audio/                 6 music beds + 3 ambience loops + 12 effects
├── android/                   the APK shell (manifest, WebView activity, build script)
│   ├── AndroidManifest.xml
│   ├── src/in/jayho/rooftop/MainActivity.java
│   └── tools/build_apk.sh     aapt2 → javac → d8 → zipalign → apksigner
├── .github/workflows/
│   ├── deploy.yml             web → GitHub Pages
│   └── android.yml            web + shell → signed APK artifact
└── tools/                     the generators that made every asset
```

---

## 5. The art

Every plate is **painted by a program**, not downloaded. `tools/gen_scenes.py` builds five scenes as three parallax layers each:

| Scene | Layers | Content |
| --- | --- | --- |
| `lane` | far / mid / near | twilight sky, facades with shutters, awnings, AC units, neon signs, "MONDAL STORES", a chai stall, tangled wires, an Ambassador, wet asphalt with lamp reflections |
| `stairs` | far / mid | lit apartment windows, green shutters with washing, the mossy staircase, potted money plants, "BASU VILLA" |
| `dusk` | far / mid / near | godhuli sky, rooftop tanks and antennae, a truss bridge, terrace tiles and a brick parapet |
| `night` | far / mid / near | stars and a moon, a lit city with a bridge, the parapet at night |
| `sky` | far / mid / near | dense starfield with nebula wash — the canvas for Act V |

Far layers are opaque; mid and near are RGBA so occlusion is real, not faked with blending. Everything loops seamlessly in X (elements crossing an edge are stamped three times), so a layer can scroll forever.

Regenerate any scene:

```bash
python3 tools/gen_scenes.py lane      # or stairs | dusk | night | sky | textures
```

---

## 6. The score

`tools/gen_audio.py` synthesises all of it from oscillators and noise — no samples, no licensing:

- **`music_lane.wav`** (45 s) — tabla groove at 98 BPM, plucked arpeggio, warm bass, a distant tram bell.
- **`music_rooftop.wav`** (48 s) — pulsing bass, an accelerating heartbeat, a ticking fuse, a riser.
- **`music_finale.wav`** (34 s) — D major, dhol-ish groove, bell cascade.
- **`music_climb.wav`** (40 s) — a slow pulse and a plucked motif that keeps slipping.
- **`music_launch.wav`** (45 s) — driving 4/4, snare rolls, a rising sweep.
- **`music_sky.wav`** (50 s) — weightless pads and bells, wide reverb.
- **`amb_city` / `amb_wind` / `amb_crowd`** — traffic and tram bells, rooftop wind, friends murmuring.
- **12 effects** — footstep, thud, tape rip, fuse sizzle, lighter click, whistle, detonation, chime, crowd, sparkle, slip, tap.

Music streams through `<audio>`; effects are decoded into Web Audio buffers. That split matters: `decodeAudioData` on a 45 s stereo WAV would allocate ~16 MB of float32 per track and block the main thread. Streaming costs nothing.

```bash
python3 tools/gen_audio.py music   # or sfx
```

---

## 7. Why it is this heavy (and why that is still careful)

You asked for about 150 MB, and the size is not padding: 24 painted plates at 2048 × 2731, five act cards, six full-length 44.1 kHz stereo music beds and three ambience loops.

What matters is that **size on disk is not size in memory or on screen**:

- Plates are **down-scaled once at load** to 1440 × 1920. A 2048 × 2731 plate costs 22 MB decoded; at 1440 it costs 11 MB and is still sharper than a 390 CSS px screen at DPR 3.
- Each act loads **only its own three plates**, and the previous act's bitmaps are released before the next three are allocated. Peak decoded art is ~34 MB, measured.
- The next act is not prefetched — on a phone, holding two chapters of art is how you get an out-of-memory kill.
- Music streams; it is never fully decoded.
- `tools/` regenerates every asset, so nothing here is a mystery binary.

---

## 8. Thermal control

A phone running this on a rooftop in November will warm up. `js/thermal.js` measures a rolling 60-frame window and moves a three-step ladder:

| Tier | Trigger | What changes |
| --- | --- | --- |
| 2 · full | default | every layer, DPR up to 2, full particle budget, grain on |
| 1 · warm | avg > 18.5 ms | DPR 1.5, particles ×0.65, film grain off |
| 0 · low | avg > 24 ms | DPR 1, 30 fps cap, particles ×0.35, smoke off |

It drops fast (3 s hysteresis) and recovers slowly (12 s), so it never oscillates. Battery below 18 % while unplugged forces tier 1 immediately. A dot in the top-right corner shows the current tier, and `html.tier-low` disables the heaviest CSS layers.

Everything else is already cheap by construction: one `requestAnimationFrame` for the whole game, one pooled particle system with zero allocation in the loop, no `backdrop-filter`, no large `filter: blur()`, and only `transform`/`opacity` in CSS.

---

## 9. Accessibility

- `prefers-reduced-motion` collapses the CSS animations; the game stays playable.
- Full keyboard path: Space (action/sprint/hold), ← → (tilt), Enter (confirm).
- HUD values are mirrored in text; the prompt strip always names the required input for the current mode.
- Portrait-locked by design; landscape shows a rotate hint instead of a broken layout.
- Tap targets ≥ 44 px; the game never requires two simultaneous touches.

---

## 10. Customising for someone else

1. **Name** — `index.html`: `.boot-title`, `.title-h`, `.finale-h`, and `data-text` if you add chromatic layers. Act V letters are in `js/acts.js` → `LETTERS` (swap `J A Y H O` for any five letters; each letter is a list of strokes in a 0..1 box).
2. **Dialogue** — the `toast(...)` calls in `js/acts.js`. All the Hinglish lines from the original storyboard live there.
3. **Difficulty** — Act I: `GOAL`, `speed` target; Act II: `STEPS`, the `angVel` gain; Act III: `tolerance`; Act IV: `SWEET`; Act V: `tol`.
4. **Palette** — `css/style.css` `:root`, and the `rgb` strings in `js/particles.js`.
5. **Scenes** — `js/world.js` → `SCENES` (parallax factors per layer).

---

## 11. Debugging

```js
__game.state                    // boot | title | playing | loading | finale
__game.startAct(3)              // jump straight to Act IV
__game.act.pressure = 0.66      // poke the current act
__game.thermal.tier             // 2 full · 1 warm · 0 low
__game.assets.memoryMB()        // decoded art, in MB
__game.particles.live           // live particles
```

---

*Rooftop Protocol — for Jayho. Five acts, one fuse, and a lane full of people who would do it again tomorrow.*
