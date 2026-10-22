"""Synthesises the TV's little sound effects (no samples, no licences needed).
Run: python3 tools/sfx/make_sfx.py  -> server/assets/sfx/*.mp3"""
import os, subprocess, wave
import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'server', 'assets', 'sfx')


def t(sec):
    return np.linspace(0, sec, int(SR * sec), endpoint=False)


def env(n, attack=0.005, release=None, curve=6.0):
    x = np.linspace(0, 1, n)
    a = np.clip(x / max(attack * SR / n, 1e-6), 0, 1)
    d = np.exp(-curve * x) if release is None else np.clip((1 - x) / release, 0, 1)
    return a * d


def bell(freq, sec, curve=5.0, bright=0.5):
    tt = t(sec)
    s = np.sin(2 * np.pi * freq * tt) + bright * 0.5 * np.sin(2 * np.pi * freq * 2.76 * tt) * np.exp(-tt * 8) + bright * 0.25 * np.sin(2 * np.pi * freq * 5.4 * tt) * np.exp(-tt * 14)
    return s * env(len(tt), curve=curve)


def place(buf, snd, at):
    i = int(at * SR)
    end = min(len(buf), i + len(snd))
    buf[i:end] += snd[: end - i]


def save(name, x, gain=0.6):
    x = x / (np.max(np.abs(x)) + 1e-9) * gain
    # soft fade out to avoid clicks
    f = min(len(x), int(0.02 * SR))
    x[-f:] *= np.linspace(1, 0, f)
    pcm = (x * 32767).astype(np.int16)
    wav = os.path.join(OUT, name + '.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '96k', os.path.join(OUT, name + '.mp3')], check=True)
    os.remove(wav)
    print('sfx', name)


os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)
C5 = 523.25
semis = lambda n: C5 * 2 ** (n / 12)

# Sparkle: a rising glockenspiel arpeggio with a shimmer tail (hero reveal).
buf = np.zeros(int(SR * 2.0))
for k, n in enumerate([0, 4, 7, 12, 16, 19, 24]):
    place(buf, bell(semis(n), 1.2, curve=4.5, bright=0.8) * (0.6 + k * 0.06), 0.07 * k)
sh = t(1.4)
shimmer = sum(np.sin(2 * np.pi * semis(24 + d) * sh + rng.random() * 6) for d in (0, 0.13, -0.11)) * np.exp(-sh * 3) * 0.12
place(buf, shimmer * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * sh)), 0.45)
save('sparkle', buf, 0.55)

# Pop: a round bubble pop (selecting a button).
tt = t(0.14)
f = 900 * np.exp(-tt * 18) + 260
pop = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(tt), attack=0.002, curve=22)
save('pop', pop, 0.5)

# Whoosh: filtered noise sweeping past (page turn).
tt = t(0.55)
noise = rng.standard_normal(len(tt))
out = np.zeros_like(noise)
y = 0.0
for i, v in enumerate(noise):
    a = 0.02 + 0.25 * np.sin(np.pi * i / len(noise)) ** 2  # opening and closing low-pass
    y += a * (v - y)
    out[i] = y
whoosh = out * np.sin(np.pi * np.linspace(0, 1, len(tt))) ** 1.5
save('whoosh', whoosh, 0.32)

# Chime: two friendly notes (the TV heard you).
buf = np.zeros(int(SR * 1.0))
place(buf, bell(semis(7), 0.8, curve=5, bright=0.6), 0)
place(buf, bell(semis(12), 0.9, curve=4.5, bright=0.6), 0.11)
save('chime', buf, 0.45)

# Question: a curious up-down-up "hmm?" on bells.
buf = np.zeros(int(SR * 1.2))
for k, n in enumerate([4, 0, 9]):
    place(buf, bell(semis(n), 0.7, curve=5.5, bright=0.5), 0.13 * k)
save('question', buf, 0.42)

# Tada: a warm major-chord fanfare (the end).
buf = np.zeros(int(SR * 2.4))
for k, n in enumerate([0, 4, 7]):
    place(buf, bell(semis(n - 12), 0.35, curve=8, bright=0.4) * 0.8, 0.09 * k)
tt = t(1.9)
chord = sum(np.sin(2 * np.pi * semis(n - 12) * tt) + 0.35 * np.sin(2 * np.pi * semis(n) * tt) for n in (0, 4, 7, 12))
chord *= np.clip(tt / 0.04, 0, 1) * np.exp(-tt * 1.6) * (1 + 0.05 * np.sin(2 * np.pi * 5.5 * tt))
place(buf, chord * 0.5, 0.32)
for k, n in enumerate([24, 28, 31]):
    place(buf, bell(semis(n), 0.9, curve=4, bright=0.9) * 0.35, 0.4 + 0.08 * k)
save('tada', buf, 0.55)

# Boing: a springy hop (mini-game while waiting).
tt = t(0.38)
f = 220 + 520 * (1 - np.exp(-tt * 9)) * (1 + 0.08 * np.sin(2 * np.pi * 26 * tt))
boing = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(len(tt), attack=0.004, curve=7)
save('boing', boing, 0.45)
