import subprocess, sys
import numpy as np

src, out = sys.argv[1], sys.argv[2]
SR, FPS, BANDS, NFFT = 22050, 30, 32, 2048
raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', src, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                     capture_output=True, check=True).stdout
y = np.frombuffer(raw, dtype=np.float32)

# Frame i is centred on i / FPS seconds
hop = SR / FPS
frames = int(len(y) / hop)
pad = np.concatenate([np.zeros(NFFT // 2, np.float32), y, np.zeros(NFFT, np.float32)])
window = np.hanning(NFFT).astype(np.float32)
freqs = np.fft.rfftfreq(NFFT, 1 / SR)
edges = np.geomspace(40, 11000, BANDS + 1)
band_of = np.digitize(freqs, edges) - 1

power = np.zeros((frames, BANDS), np.float32)
for i in range(frames):
    start = int(round(i * hop))
    spec = np.abs(np.fft.rfft(pad[start:start + NFFT] * window)) ** 2
    for b in range(BANDS):
        sel = band_of == b
        power[i, b] = spec[sel].mean() if sel.any() else 0

db = 10 * np.log10(power + 1e-10)
# Normalise each band to its own range so treble is as lively as bass
lo = np.percentile(db, 10, axis=0)
hi = np.percentile(db, 99.5, axis=0)
norm = np.clip((db - lo) / (hi - lo), 0, 1) ** 1.6
data = np.round(norm * 255).astype(np.uint8)
data.tofile(out)
print('frames', frames, 'bands', BANDS, 'bytes', data.size, 'mean', norm.mean().round(3),
      'empty bands', [b for b in range(BANDS) if not (band_of == b).any()])
