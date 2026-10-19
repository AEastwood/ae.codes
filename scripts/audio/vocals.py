"""
Vocal loudness envelope for the singing portrait's lip-sync.

Separate the vocals first (Demucs), then run on the vocal stem:
    python -m demucs --two-stems=vocals -n htdemucs_ft feel-good-inc.mp3
    python vocals.py separated/htdemucs_ft/feel-good-inc/vocals.wav public/data/feel-good-inc-vocals.bin

Output: one byte per frame at 60 frames a second, 0 = silent, 255 = loudest singing.
"""
import subprocess
import sys

import numpy as np
from scipy.signal import butter, sosfiltfilt

src, out = sys.argv[1], sys.argv[2]
SR = 16000
FPS = 60
HOP = SR // FPS

raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', src, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                     capture_output=True, check=True).stdout
y = np.frombuffer(raw, dtype=np.float32)

# Keep the voice band so breaths, separation artefacts and bass bleed don't move the mouth
y = sosfiltfilt(butter(4, [200, 4000], btype='bandpass', fs=SR, output='sos'), y)

frames = len(y) // HOP
rms = np.sqrt(np.mean(y[:frames * HOP].reshape(frames, HOP) ** 2, axis=1) + 1e-12)
db = 20 * np.log10(rms)

# Map a window below the loud singing level to 0-1: anything 22dB under it counts as a closed mouth
top = np.percentile(db, 98)
level = np.clip((db - (top - 22)) / 22, 0, 1)

np.round(level * 255).astype(np.uint8).tofile(out)
print('frames', frames, 'seconds', frames / FPS, 'open frames', round(float((level > 0.3).mean()), 3))
