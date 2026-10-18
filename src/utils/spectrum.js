export const SPECTRUM_URL = `${import.meta.env.BASE_URL}data/feel-good-inc-spectrum.bin`;
// Pre-analysed spectrum: 30 frames a second, 32 log-spaced bands (40Hz-11kHz), one byte per band
export const SPECTRUM_FPS = 30;
export const SPECTRUM_BANDS = 32;

// Collapse each spectrum frame into one loudness value, weighted towards the bass so kicks read clearly
function buildLoudness(spectrum) {
    const frames = Math.floor(spectrum.length / SPECTRUM_BANDS);
    const loudness = new Float32Array(frames);

    for (let f = 0; f < frames; f++) {
        let bass = 0;
        let all = 0;
        for (let b = 0; b < SPECTRUM_BANDS; b++) {
            const value = spectrum[f * SPECTRUM_BANDS + b] / 255;
            all += value;
            if (b < 8) bass += value;
        }
        loudness[f] = (bass / 8) * 0.6 + (all / SPECTRUM_BANDS) * 0.4;
    }

    // Smooth over ~0.15s so each beat reads as one solid swell rather than flickering
    const smoothed = new Float32Array(frames);
    const kernel = [0.02, 0.05, 0.09, 0.14, 0.17, 0.18, 0.15, 0.1, 0.06, 0.03, 0.01];
    for (let f = 0; f < frames; f++) {
        for (let k = 0; k < kernel.length; k++) {
            const source = Math.max(0, Math.min(frames - 1, f + k - 5));
            smoothed[f] += loudness[source] * kernel[k];
        }
    }
    loudness.set(smoothed);

    // Stretch to the song's own range so quiet and loud moments are clearly different
    const sorted = Float32Array.from(loudness).sort();
    const low = sorted[Math.floor(frames * 0.05)];
    const high = sorted[Math.floor(frames * 0.99)];
    for (let f = 0; f < frames; f++) {
        loudness[f] = Math.max(0, Math.min(1, (loudness[f] - low) / (high - low)));
    }

    return loudness;
}

export function loudnessAt(loudness, time) {
    if (time < 0) return 0;
    const position = time * SPECTRUM_FPS;
    const frame = Math.floor(position);
    if (frame >= loudness.length - 1) return 0;
    const frac = position - frame;
    return loudness[frame] * (1 - frac) + loudness[frame + 1] * frac;
}

let loudnessPromise = null;

// Fetches the spectrum once and shares the loudness curve between everything that animates to the music
export function loadLoudness() {
    if (!loudnessPromise) {
        loudnessPromise = fetch(SPECTRUM_URL)
            .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(response.status)))
            .then((buffer) => buildLoudness(new Uint8Array(buffer)))
            .catch((error) => {
                loudnessPromise = null;
                throw error;
            });
    }
    return loudnessPromise;
}
