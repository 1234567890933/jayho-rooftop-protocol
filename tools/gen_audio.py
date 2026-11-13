"""
gen_audio.py — synthesises the entire soundtrack of ROOFTOP PROTOCOL.

usage: python3 gen_audio.py music | sfx

Everything is generated from oscillators and noise: no samples, no licensing,
no codec dependency. Output is 44.1 kHz / 16-bit stereo WAV so the browser can
stream it with an <audio> element (a decoded 45 s buffer would cost ~16 MB of
RAM; streaming costs nothing).
"""
import os
import sys
import wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets", "audio")


# ------------------------------------------------------------------ utilities
def t_axis(dur):
    return np.arange(int(dur * SR), dtype=np.float32) / SR


def env_ad(dur, attack=0.01, decay=6.0):
    t = t_axis(dur)
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-decay * t)


def env_adsr(dur, a=0.02, d=0.15, s=0.6, r=0.4):
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    e = np.ones(n, dtype=np.float32) * s
    na = max(1, int(a * SR)); nd = max(1, int(d * SR)); nr = max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na)
    if na + nd < n:
        e[na:na + nd] = np.linspace(1, s, nd)
    if nr < n:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def sine(freq, dur, detune=0.0):
    t = t_axis(dur)
    return np.sin(2 * np.pi * (freq + detune) * t).astype(np.float32)


def saw(freq, dur, harmonics=7, tilt=1.0):
    t = t_axis(dur)
    out = np.zeros_like(t)
    for h in range(1, harmonics + 1):
        out += np.sin(2 * np.pi * freq * h * t) / (h ** tilt)
    return (out / np.max(np.abs(out) + 1e-9)).astype(np.float32)


def pluck(freq, dur, bright=0.65, decay=5.5, harmonics=9):
    """Additive Karplus-ish pluck: harmonic stack with per-harmonic decay."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for h in range(1, harmonics + 1):
        amp = (bright ** (h - 1)) / h
        out += amp * np.sin(2 * np.pi * freq * h * t) * np.exp(-decay * (1 + 0.5 * h) * t)
    return (out / (np.max(np.abs(out)) + 1e-9)).astype(np.float32)


def noise(dur, seed=0):
    rng = np.random.default_rng(seed)
    return rng.standard_normal(int(dur * SR)).astype(np.float32)


def lowpass(x, cutoff):
    """One-pole lowpass; cheap and good enough for percussive shaping."""
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = a * acc + (1 - a) * x[i]
        y[i] = acc
    return y


def lp_fast(x, cutoff):
    """Vectorised approximation via cumulative smoothing (block filter)."""
    k = max(1, int(SR / (2 * np.pi * cutoff)))
    if k <= 1:
        return x
    c = np.cumsum(np.pad(x, (k, 0), mode="edge"))
    return ((c[k:] - c[:-k]) / k).astype(np.float32)


def hp_fast(x, cutoff):
    return (x - lp_fast(x, cutoff)).astype(np.float32)


def bandpass(x, lo, hi):
    return lp_fast(hp_fast(x, lo), hi)


def spectral_shape(x, lp=11000.0, hp=32.0, order=2):
    """Zero-phase shelf/rolloff in the frequency domain — the master tone."""
    n = len(x)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    f = np.maximum(f, 1e-6)
    hi_cut = 1.0 / np.sqrt(1.0 + (f / lp) ** (2 * order))
    lo_cut = 1.0 / np.sqrt(1.0 + (hp / f) ** (2 * order))
    return np.fft.irfft(X * hi_cut * lo_cut, n).astype(np.float32)


def kick(dur=0.42, f0=150.0, f1=48.0, decay=9.0):
    t = t_axis(dur)
    f = f1 + (f0 - f1) * np.exp(-28 * t)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR)
    click = noise(dur, 1) * np.exp(-120 * t) * 0.35
    return ((body * np.exp(-decay * t)) + click).astype(np.float32)


def snare(dur=0.28, seed=2):
    t = t_axis(dur)
    n = bandpass(noise(dur, seed), 900, 7000) * np.exp(-26 * t)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-34 * t) * 0.5
    return ((n * 0.9 + tone) / 1.6).astype(np.float32)


def hat(dur=0.09, seed=3, open_=False):
    t = t_axis(dur)
    n = hp_fast(noise(dur, seed), 6500)
    return (n * np.exp(-(14 if open_ else 60) * t)).astype(np.float32)


def tabla(dur=0.30, f0=210.0, seed=4):
    t = t_axis(dur)
    f = f0 * (1 + 0.35 * np.exp(-30 * t))
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-13 * t)
    slap = bandpass(noise(dur, seed), 400, 3200) * np.exp(-70 * t) * 0.5
    return (body + slap).astype(np.float32)


def tom(dur=0.4, f0=110.0, seed=5):
    t = t_axis(dur)
    f = f0 * (1 + 0.5 * np.exp(-18 * t))
    return (np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-9 * t)).astype(np.float32)


def pad(freqs, dur, attack=1.2, release=1.6, detune=0.35, gain=1.0):
    t = t_axis(dur)
    out = np.zeros_like(t)
    for i, f in enumerate(freqs):
        for k in (-1, 0, 1):
            out += np.sin(2 * np.pi * (f + k * detune) * t + i * 0.7) * 0.33
    e = env_adsr(dur, a=attack, d=0.4, s=0.75, r=release)
    out = out * e / (len(freqs) + 1e-9)
    return (out * gain).astype(np.float32)


# ------------------------------------------------------------------- mixing
class Mix:
    def __init__(self, dur):
        self.buf = np.zeros((int(dur * SR) + SR, 2), np.float32)
        self.n = int(dur * SR)

    def add(self, at, sig, gain=1.0, pan=0.0):
        i = int(at * SR)
        if i >= self.n or i < 0:
            return
        m = min(len(sig), self.n - i)
        if m <= 0:
            return
        # constant-power pan
        a = (pan + 1) * np.pi / 4
        self.buf[i:i + m, 0] += sig[:m] * gain * np.cos(a)
        self.buf[i:i + m, 1] += sig[:m] * gain * np.sin(a)

    def reverb(self, wet=0.22, dur=1.4, seed=9):
        rng = np.random.default_rng(seed)
        ir_n = int(dur * SR)
        t = np.arange(ir_n, dtype=np.float32) / SR
        ir = rng.standard_normal(ir_n).astype(np.float32) * np.exp(-3.2 * t)
        ir[:200] *= np.linspace(0, 1, 200)
        ir /= np.max(np.abs(ir)) + 1e-9
        n = len(self.buf) + ir_n
        fft_n = 1 << (n - 1).bit_length()
        for ch in range(2):
            src = np.fft.rfft(self.buf[:, ch], fft_n)
            fil = np.fft.rfft(ir, fft_n)
            wet_sig = np.fft.irfft(src * fil, fft_n)[:len(self.buf)]
            self.buf[:, ch] += wet_sig.astype(np.float32) * wet

    def master(self, peak=0.92, fade_in=0.02, fade_out=0.8):
        b = self.buf[:self.n]
        # tame the fizz: one-pole lowpass at 11 kHz and a rumble cut at 30 Hz
        b = np.stack([spectral_shape(b[:, ch]) for ch in range(2)], axis=1)
        # gentle bus compression: soft clip
        b = np.tanh(b * 1.15) * 0.92
        pk = np.max(np.abs(b)) + 1e-9
        b = b / pk * peak
        fi = int(fade_in * SR)
        if fi > 0:
            b[:fi] *= np.linspace(0, 1, fi)[:, None]
        fo = int(fade_out * SR)
        if fo > 0:
            b[-fo:] *= np.linspace(1, 0, fo)[:, None]
        return b


def write_wav(path, stereo, sr=SR):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = np.clip(stereo, -1, 1)
    pcm = (data * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    return os.path.getsize(path)


# --------------------------------------------------------------- note tables
def n(name):
    """'A3' -> Hz."""
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6,
             "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    p = name[:-1]
    octv = int(name[-1])
    midi = 12 * (octv + 1) + names[p]
    return 440.0 * 2 ** ((midi - 69) / 12)


# =============================================================== TRACK: LANE
def track_lane(dur=45.0, bpm=98):
    """Kolkata twilight sprint: tabla groove, plucked arpeggio, warm bass."""
    beat = 60.0 / bpm
    m = Mix(dur)
    rng = np.random.default_rng(11)

    # D minor-ish, pentatonic-friendly
    root = n("D2")
    scale = [n(x) for x in ("D3", "F3", "G3", "A3", "C4", "D4", "F4", "G4", "A4")]
    chords = [("D3", "F3", "A3"), ("A#2", "D3", "F3"), ("C3", "F3", "A3"), ("G2", "A#2", "D3")]

    # pad bed, one chord per 2 bars
    bar = beat * 4
    i = 0
    while i * 2 * bar < dur:
        ch = chords[i % len(chords)]
        m.add(i * 2 * bar, pad([n(c) for c in ch], 2 * bar + 1.2, attack=0.9, release=1.6), 0.16, pan=-0.1)
        i += 1

    # bass: root on 1 and the "and" of 3
    i = 0
    while i * bar < dur:
        b0 = i * bar
        m.add(b0, pluck(root * (1 if i % 2 == 0 else 1.5), beat * 0.9, bright=0.4, decay=4.0, harmonics=5), 0.34)
        m.add(b0 + beat * 2.5, pluck(root * 1.5, beat * 0.6, bright=0.35, decay=6.0, harmonics=4), 0.22)
        i += 1

    # tabla pattern (16ths)
    i = 0
    while i * bar < dur:
        b0 = i * bar
        for s in range(16):
            tt = b0 + s * beat / 4
            if tt > dur:
                break
            if s in (0, 6, 10):
                m.add(tt, tabla(0.30, 200.0, seed=s + i), 0.30, pan=0.12)
            elif s in (4, 12):
                m.add(tt, tabla(0.22, 330.0, seed=s + 40 + i), 0.20, pan=-0.14)
            elif s in (3, 7, 11, 15):
                m.add(tt, hat(0.07, seed=s + i * 3), 0.12, pan=0.3)
        m.add(b0, kick(0.45, 150, 46, 8.5), 0.40)
        m.add(b0 + beat * 2, kick(0.40, 140, 50, 9.5), 0.30)
        i += 1

    # plucked arpeggio that answers the pad
    i = 0
    while i * 4 * bar < dur:
        b0 = i * 4 * bar
        for s in range(32):
            tt = b0 + s * beat / 2
            if tt > dur:
                break
            if rng.random() < 0.55:
                f = scale[int(rng.integers(0, len(scale)))]
                m.add(tt, pluck(f, beat * 0.9, bright=0.55, decay=5.0), 0.13, pan=float(rng.uniform(-0.5, 0.5)))
        i += 1

    # distant tram bell accents
    for tt in (bar * 3, bar * 11, bar * 19, bar * 27):
        if tt < dur:
            for k, g in ((1180, 0.10), (1770, 0.06), (2360, 0.03)):
                m.add(tt, sine(k, 1.4) * np.exp(-2.2 * t_axis(1.4)), g, pan=-0.4)

    m.reverb(0.26, 1.5, 21)
    return m.master(0.80, 0.02, 1.2)


# ============================================================ TRACK: ROOFTOP
def track_rooftop(dur=48.0, bpm=84):
    """The fuse is lit: pulsing bass, heartbeat, rising tension, no resolution."""
    beat = 60.0 / bpm
    m = Mix(dur)
    bar = beat * 4

    # low pulsing drone
    i = 0
    while i * bar < dur:
        b0 = i * bar
        for k in range(4):
            f = n("D2") if i % 2 == 0 else n("A#1")
            m.add(b0 + k * beat, saw(f, beat * 0.95, harmonics=5, tilt=1.4) * env_ad(beat * 0.95, 0.01, 5.0), 0.24)
        i += 1

    # heartbeat: double thump every 2 beats, accelerating across the track
    tt = 0.0
    while tt < dur:
        prog = tt / dur
        gap = 1.05 - 0.45 * prog
        m.add(tt, kick(0.5, 90, 38, 6.0), 0.42)
        m.add(tt + 0.17, kick(0.4, 80, 34, 7.5), 0.26)
        tt += gap

    # ticking clock (the fuse burning)
    tt = 0.0
    while tt < dur:
        m.add(tt, bandpass(noise(0.05, 7), 2200, 7000) * np.exp(-90 * t_axis(0.05)), 0.055, pan=0.45)
        tt += beat / 2

    # string-ish swell that rises in pitch and volume
    i = 0
    while i * 4 * bar < dur:
        b0 = i * 4 * bar
        prog = min(1.0, b0 / dur)
        base = n("D3") * (1 + 0.12 * prog)
        m.add(b0, pad([base, base * 1.5, base * 2.0], 4 * bar, attack=2.4, release=2.0), 0.10 + 0.16 * prog, pan=0.0)
        i += 1

    # riser at the very end (leads into the launch act)
    m.add(dur - 6.0, bandpass(noise(6.0, 12), 300, 5000) * np.linspace(0, 1, int(6.0 * SR)) ** 2.2, 0.22)

    m.reverb(0.30, 1.8, 31)
    return m.master(0.78, 0.02, 1.4)


# ============================================================= TRACK: FINALE
def track_finale(dur=34.0, bpm=112):
    """The sky writes his name: major, bright, celebratory."""
    beat = 60.0 / bpm
    m = Mix(dur)
    rng = np.random.default_rng(41)
    bar = beat * 4

    # I - V - vi - IV in D major
    chords = [("D3", "F#3", "A3", "D4"), ("A2", "C#3", "E3", "A3"),
              ("B2", "D3", "F#3", "B3"), ("G2", "B2", "D3", "G3")]
    i = 0
    while i * bar < dur:
        ch = chords[i % 4]
        m.add(i * bar, pad([n(c) for c in ch], bar + 0.8, attack=0.25, release=0.9), 0.18, pan=-0.08)
        m.add(i * bar, pluck(n(ch[0]) / 2, beat * 1.8, bright=0.45, decay=3.2, harmonics=6), 0.26)
        i += 1

    # dhol-ish groove
    i = 0
    while i * bar < dur:
        b0 = i * bar
        m.add(b0, kick(0.45, 160, 50, 8.0), 0.40)
        m.add(b0 + beat * 2, kick(0.42, 150, 48, 8.5), 0.32)
        m.add(b0 + beat * 1, snare(0.26, seed=i + 3), 0.24)
        m.add(b0 + beat * 3, snare(0.26, seed=i + 9), 0.26)
        for s in range(8):
            m.add(b0 + s * beat / 2, hat(0.07, seed=s + i * 5, open_=(s % 4 == 3)), 0.10, pan=0.25)
        for s in (2, 6):
            m.add(b0 + s * beat / 2, tom(0.34, 130, seed=s + i), 0.16, pan=-0.2)
        i += 1

    # bright arpeggio + bells
    scale = [n(x) for x in ("D4", "E4", "F#4", "A4", "B4", "D5", "E5", "F#5", "A5")]
    i = 0
    while i * 2 * bar < dur:
        b0 = i * 2 * bar
        for s in range(16):
            tt = b0 + s * beat / 2
            if tt > dur:
                break
            f = scale[(s + i) % len(scale)]
            m.add(tt, pluck(f, beat, bright=0.7, decay=4.2), 0.11, pan=float(rng.uniform(-0.6, 0.6)))
        i += 1

    # opening chime cascade
    for k, f in enumerate((n("D5"), n("F#5"), n("A5"), n("D6"))):
        m.add(0.15 + k * 0.13, sine(f, 1.8) * np.exp(-2.4 * t_axis(1.8)), 0.16, pan=0.2 - k * 0.12)

    m.reverb(0.28, 1.6, 43)
    return m.master(0.82, 0.02, 1.6)



# ============================================================ TRACK: CLIMB
def track_climb(dur=40.0, bpm=92):
    """Stairs: a slow pulse, a plucked motif that keeps slipping, no drums."""
    beat = 60.0 / bpm
    m = Mix(dur)
    bar = beat * 4

    i = 0
    while i * bar < dur:
        b0 = i * bar
        # heartbeat-ish pulse
        for k in (0, 2.5):
            m.add(b0 + k * beat, kick(0.5, 95, 40, 7.0), 0.30)
        # low fifth drone
        m.add(b0, pad([n("A2"), n("E3")], bar, attack=0.8, release=1.2), 0.14, pan=-0.05)
        i += 1

    # plucked motif, syncopated, a little unstable
    motif = ["A3", "C4", "E4", "D4", "A3", "G3", "E4", "C4"]
    i = 0
    while i * 2 * bar < dur:
        b0 = i * 2 * bar
        for k, nm in enumerate(motif):
            t = b0 + k * beat * 0.75
            if t < dur:
                m.add(t, pluck(n(nm), beat * 1.1, bright=0.6, decay=4.4), 0.13, pan=0.2 if k % 2 else -0.2)
        i += 1

    # metal railing creaks
    rng = np.random.default_rng(77)
    t = 1.0
    while t < dur:
        if rng.random() < 0.5:
            f = 620 + rng.random() * 500
            m.add(t, sine(f, 0.5) * np.exp(-9 * t_axis(0.5)), 0.03, pan=-0.4)
        t += rng.uniform(1.6, 3.4)

    m.reverb(0.32, 1.9, 61)
    return m.master(0.76, 0.02, 1.4)


# =========================================================== TRACK: LAUNCH
def track_launch(dur=45.0, bpm=126):
    """Pressure building: driving bass, snare rolls, a rising filter."""
    beat = 60.0 / bpm
    m = Mix(dur)
    bar = beat * 4
    rng = np.random.default_rng(83)

    i = 0
    while i * bar < dur:
        b0 = i * bar
        for k in range(4):
            m.add(b0 + k * beat, kick(0.4, 170, 46, 9.0), 0.36)
        for k in (1, 3):
            m.add(b0 + k * beat, snare(0.24, seed=i * 3 + k), 0.22)
        for k in range(8):
            m.add(b0 + k * beat / 2, hat(0.06, seed=k + i * 5), 0.09, pan=0.3)
        # bass line: 8ths, climbing
        for k in range(8):
            f = n("D2") if k % 2 == 0 else n("A#1")
            m.add(b0 + k * beat / 2, saw(f, beat * 0.45, harmonics=5, tilt=1.5) * env_ad(beat * 0.45, 0.005, 7.0),
                  0.20, pan=0.0)
        i += 1

    # snare roll into each 8-bar boundary
    i = 1
    while i * 8 * bar < dur:
        b0 = i * 8 * bar - bar
        for k in range(16):
            m.add(b0 + k * bar / 16, snare(0.16, seed=k + i * 7), 0.06 + 0.12 * (k / 16), pan=0.1)
        i += 1

    # rising sweep over the whole track
    t = t_axis(dur)
    sweep = bandpass(noise(dur, 84), 300, 9000) * (t / dur) ** 2 * 0.10
    m.add(0, sweep, 1.0)

    m.reverb(0.22, 1.3, 71)
    return m.master(0.82, 0.02, 1.2)


# ============================================================== TRACK: SKY
def track_sky(dur=50.0, bpm=70):
    """Wide, weightless: slow pads, bells, nothing to hold on to."""
    beat = 60.0 / bpm
    m = Mix(dur)
    bar = beat * 4

    chords = [("D3", "A3", "F#4"), ("B2", "F#3", "D4"), ("G2", "D3", "B3"), ("A2", "E3", "C#4")]
    i = 0
    while i * 2 * bar < dur:
        ch = chords[i % 4]
        m.add(i * 2 * bar, pad([n(c) for c in ch], 2 * bar + 2.0, attack=2.6, release=2.4), 0.16, pan=0.0)
        i += 1

    # bells at random, wide intervals
    rng = np.random.default_rng(91)
    scale = [n(x) for x in ("D5", "F#5", "A5", "D6", "E6", "F#6")]
    t = 0.6
    while t < dur:
        f = scale[int(rng.integers(0, len(scale)))]
        m.add(t, sine(f, 2.4) * np.exp(-2.0 * t_axis(2.4)), 0.09, pan=float(rng.uniform(-0.8, 0.8)))
        t += rng.uniform(0.9, 2.2)

    # sub swell
    m.add(0, pad([n("D2")], dur, attack=6.0, release=6.0), 0.10)

    m.reverb(0.42, 2.6, 93)
    return m.master(0.72, 0.4, 2.0)


# =============================================================== AMBIENCE
def amb_city(dur=35.0):
    """Kolkata street bed: traffic rumble, a horn or two, distant voices."""
    m = Mix(dur)
    rng = np.random.default_rng(101)

    rumble = bandpass(noise(dur, 102), 40, 320) * 0.55
    m.add(0, rumble, 0.30)

    t = 1.2
    while t < dur:
        # auto horn
        f = 380 + rng.random() * 220
        h = (np.sin(2 * np.pi * f * t_axis(0.5)) + 0.4 * np.sin(2 * np.pi * f * 2 * t_axis(0.5)))
        m.add(t, h * np.exp(-6 * t_axis(0.5)), 0.05, pan=float(rng.uniform(-0.8, 0.8)))
        t += rng.uniform(1.8, 4.5)

    t = 3.0
    while t < dur:
        # tram bell
        for k, g in ((1180, 0.05), (1770, 0.03)):
            m.add(t, sine(k, 1.6) * np.exp(-2.4 * t_axis(1.6)), g, pan=-0.3)
        t += rng.uniform(9, 16)

    m.reverb(0.30, 2.0, 111)
    return m.master(0.55, 0.6, 2.0)


def amb_wind(dur=35.0):
    """Rooftop wind: filtered noise with a slow, breathing filter."""
    m = Mix(dur)
    base = noise(dur, 121)
    body = bandpass(base, 180, 1400) * 0.5
    t = t_axis(dur)
    mod = 0.55 + 0.45 * np.sin(2 * np.pi * 0.08 * t) * np.sin(2 * np.pi * 0.031 * t)
    m.add(0, body * mod, 0.42)
    m.add(0, bandpass(base, 1400, 5200) * mod * 0.35, 0.10)
    m.reverb(0.34, 2.4, 131)
    return m.master(0.52, 0.8, 2.0)


def amb_crowd(dur=30.0):
    """Friends on a roof: murmur, laughter shapes, no intelligible words."""
    m = Mix(dur)
    rng = np.random.default_rng(141)
    bed = bandpass(noise(dur, 142), 300, 2600)
    t = t_axis(dur)
    mod = 0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 0.7 * t) * np.sin(2 * np.pi * 0.23 * t))
    m.add(0, bed * mod, 0.26)
    t0 = 0.8
    while t0 < dur:
        burst = bandpass(noise(1.1, int(t0 * 10) % 999), 500, 3200) * np.exp(-2.6 * t_axis(1.1))
        m.add(t0, burst, 0.10, pan=float(rng.uniform(-0.7, 0.7)))
        t0 += rng.uniform(1.4, 3.2)
    m.reverb(0.36, 2.2, 151)
    return m.master(0.50, 0.6, 2.0)


# ======================================================================= SFX
def sfx():
    sizes = {}
    os.makedirs(OUT, exist_ok=True)

    def mono_stereo(sig, pan=0.0):
        a = (pan + 1) * np.pi / 4
        return np.stack([sig * np.cos(a), sig * np.sin(a)], axis=1)

    def save(name, sig, pan=0.0):
        sizes[name] = write_wav(f"{OUT}/{name}", mono_stereo(np.clip(sig, -1, 1), pan))

    # footstep on wet concrete
    s = bandpass(noise(0.13, 51), 180, 2400) * np.exp(-38 * t_axis(0.13))
    s += kick(0.13, 120, 60, 26) * 0.5
    save("sfx_step.wav", s / 1.4, pan=0.1)

    # box landing / heavy thud
    s = kick(0.55, 110, 38, 7.0) * 0.9 + bandpass(noise(0.55, 52), 120, 1600) * np.exp(-14 * t_axis(0.55)) * 0.4
    save("sfx_thud.wav", s / 1.5)

    # packing tape rip
    t = t_axis(0.5)
    rip = bandpass(noise(0.5, 53), 1200, 8000) * (0.4 + 0.6 * np.abs(np.sin(2 * np.pi * 28 * t)))
    save("sfx_tape.wav", rip * np.exp(-4 * t) * 0.7, pan=-0.2)

    # fuse sizzle
    t = t_axis(1.6)
    sz = bandpass(noise(1.6, 54), 2200, 11000) * (0.55 + 0.45 * np.abs(np.sin(2 * np.pi * 13 * t)))
    sz *= np.clip(t / 0.08, 0, 1) * np.exp(-1.1 * t)
    save("sfx_fuse.wav", sz * 0.6, pan=0.15)

    # lighter click
    s = hp_fast(noise(0.06, 55), 3000) * np.exp(-90 * t_axis(0.06))
    s += sine(2400, 0.06) * np.exp(-60 * t_axis(0.06)) * 0.4
    save("sfx_click.wav", s * 0.8)

    # rocket whistle
    t = t_axis(1.5)
    f = 380 + 1500 * (t / 1.5) ** 1.6
    wh = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.6
    wh += bandpass(noise(1.5, 56), 1200, 6000) * 0.25
    save("sfx_whistle.wav", wh * np.clip(t / 0.15, 0, 1) * np.exp(-0.5 * t) * 0.55, pan=-0.1)

    # detonation
    t = t_axis(2.2)
    bm = kick(2.2, 120, 30, 3.2) * 0.9
    bm += bandpass(noise(2.2, 57), 60, 3000) * np.exp(-3.4 * t) * 0.55
    bm += bandpass(noise(2.2, 58), 3000, 12000) * np.exp(-9.0 * t) * 0.25
    save("sfx_boom.wav", bm * 0.85)

    # magical chime
    t = t_axis(2.0)
    ch = np.zeros_like(t)
    for k, f in enumerate((880, 1320, 1760, 2640, 3520)):
        ch += np.sin(2 * np.pi * f * t) * np.exp(-(2.2 + k * 0.6) * t) * (0.5 / (k + 1))
    save("sfx_chime.wav", ch * 0.6, pan=0.1)

    # crowd cheer
    t = t_axis(2.6)
    cr = bandpass(noise(2.6, 59), 400, 3200)
    mod = 0.55 + 0.45 * np.sin(2 * np.pi * 3.2 * t) * np.sin(2 * np.pi * 0.7 * t)
    cr = cr * mod * np.clip(t / 0.25, 0, 1) * np.exp(-1.0 * t)
    for k in range(6):
        cr += np.sin(2 * np.pi * (700 + k * 130) * t) * 0.03 * np.exp(-2.0 * t)
    save("sfx_crowd.wav", cr * 0.5)

    # sparkle
    t = t_axis(0.7)
    sp = hp_fast(noise(0.7, 60), 5000) * np.exp(-9 * t)
    save("sfx_sparkle.wav", sp * 0.4, pan=-0.3)

    # soft failure / slip
    t = t_axis(0.45)
    fl = np.sin(2 * np.pi * (240 - 120 * t / 0.45) * t) * np.exp(-6 * t)
    save("sfx_slip.wav", fl * 0.35)

    # ui tap
    t = t_axis(0.12)
    ui = np.sin(2 * np.pi * 780 * t) * np.exp(-40 * t)
    save("sfx_tap.wav", ui * 0.35)

    return sizes


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "sfx"
    # MUSIC_LEN scales every bed: 1.0 compact profile, 2.4 full length
    L = float(os.environ.get("MUSIC_LEN", "1"))
    def d(x):
        return x * L
    if which == "music":
        out = {}
        out["music_lane.wav"] = write_wav(f"{OUT}/music_lane.wav", track_lane(d(45.0)))
        out["music_rooftop.wav"] = write_wav(f"{OUT}/music_rooftop.wav", track_rooftop(d(48.0)))
        out["music_finale.wav"] = write_wav(f"{OUT}/music_finale.wav", track_finale(d(34.0)))
    elif which == "extra":
        out = {}
        out["music_climb.wav"] = write_wav(f"{OUT}/music_climb.wav", track_climb(d(40.0)))
        out["music_launch.wav"] = write_wav(f"{OUT}/music_launch.wav", track_launch(d(45.0)))
        out["music_sky.wav"] = write_wav(f"{OUT}/music_sky.wav", track_sky(d(50.0)))
        out["amb_city.wav"] = write_wav(f"{OUT}/amb_city.wav", amb_city(d(35.0)))
        out["amb_wind.wav"] = write_wav(f"{OUT}/amb_wind.wav", amb_wind(d(35.0)))
        out["amb_crowd.wav"] = write_wav(f"{OUT}/amb_crowd.wav", amb_crowd(d(30.0)))
    else:
        out = sfx()
    total = 0
    for k, v in out.items():
        print(f"  {k:24s} {v/1e6:6.2f} MB")
        total += v
    print(f"  -- {which} total: {total/1e6:.2f} MB")
