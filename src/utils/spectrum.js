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

// Beat grid fitted offline to the track (scripts/audio): fixed tempo, first beat, and which beat starts each bar
export const BPM = 139.1025;
export const FIRST_BEAT = 0.2913;
export const DOWNBEAT = 2;

function bassAt(spectrum, frame) {
    let bass = 0;
    for (let b = 0; b < 6; b++) bass += spectrum[frame * SPECTRUM_BANDS + b] / 255;
    return bass / 6;
}

// Every beat on the grid with how hard the kick lands, 0-1
function buildBeats(spectrum, frames) {
    const period = 60 / BPM;
    const beats = [];

    for (let n = 0; FIRST_BEAT + n * period < frames / SPECTRUM_FPS; n++) {
        const time = FIRST_BEAT + n * period;
        const frame = Math.round(time * SPECTRUM_FPS);
        let peak = 0;
        let floor = 1;
        for (let f = frame - 1; f <= frame + 2; f++) peak = Math.max(peak, bassAt(spectrum, Math.min(frames - 1, Math.max(0, f))));
        for (let f = frame - 6; f <= frame - 2; f++) floor = Math.min(floor, bassAt(spectrum, Math.max(0, f)));
        beats.push({ time, strength: peak - floor * 0.5, downbeat: n % 4 === DOWNBEAT });
    }

    const sorted = beats.map((beat) => beat.strength).sort((a, b) => a - b);
    const high = sorted[Math.floor(sorted.length * 0.95)] || 1;
    for (const beat of beats) beat.strength = Math.min(1, beat.strength / high);
    return beats;
}

// How full the track is over the last ~2 seconds (verses low, choruses high), 0-1 per frame
function buildIntensity(spectrum, frames) {
    const window = 2 * SPECTRUM_FPS;
    const energy = new Float32Array(frames);
    const intensity = new Float32Array(frames);
    let total = 0;

    for (let f = 0; f < frames; f++) {
        let all = 0;
        for (let b = 0; b < SPECTRUM_BANDS; b++) all += spectrum[f * SPECTRUM_BANDS + b] / 255;
        energy[f] = all / SPECTRUM_BANDS;
        total += energy[f];
        if (f >= window) total -= energy[f - window];
        intensity[f] = total / Math.min(f + 1, window);
    }

    const sorted = Float32Array.from(intensity).sort();
    const low = sorted[Math.floor(frames * 0.05)];
    const high = sorted[Math.floor(frames * 0.98)];
    for (let f = 0; f < frames; f++) {
        intensity[f] = Math.max(0, Math.min(1, (intensity[f] - low) / (high - low || 1)));
    }
    return { energy, intensity };
}

// Moments the track suddenly gets much fuller (the drums kicking in), snapped to the strongest nearby beat
function buildDrops(energy, beats) {
    const drops = [];
    const before = 2 * SPECTRUM_FPS;
    const after = Math.round(0.6 * SPECTRUM_FPS);

    for (let f = before; f < energy.length - after; f++) {
        let previous = 0;
        let next = 0;
        for (let j = f - before; j < f; j++) previous += energy[j];
        for (let j = f; j < f + after; j++) next += energy[j];
        const jump = (next / after) - (previous / before);
        const time = f / SPECTRUM_FPS;
        if (jump < 0.12 || (drops.length && time - drops[drops.length - 1] < 8)) continue;

        const nearby = beats.filter((beat) => Math.abs(beat.time - time - 0.3) < 0.5);
        const strongest = nearby.reduce((best, beat) => (beat.strength > (best?.strength ?? -1) ? beat : best), null);
        drops.push(strongest ? strongest.time : time);
    }
    return drops;
}

export function analyseSpectrum(spectrum) {
    const frames = Math.floor(spectrum.length / SPECTRUM_BANDS);
    const beats = buildBeats(spectrum, frames);
    const { energy, intensity } = buildIntensity(spectrum, frames);
    return {
        loudness: buildLoudness(spectrum),
        intensity,
        beats,
        drops: buildDrops(energy, beats),
    };
}

export function intensityAt(analysis, time) {
    if (time < 0) return 0;
    return analysis.intensity[Math.min(analysis.intensity.length - 1, Math.floor(time * SPECTRUM_FPS))] ?? 0;
}

// The beats that landed in the last `seconds`, most recent last
export function recentBeats(analysis, time, seconds) {
    const period = 60 / BPM;
    const last = Math.floor((time - FIRST_BEAT) / period);
    const first = Math.max(0, Math.ceil((time - seconds - FIRST_BEAT) / period));
    return analysis.beats.slice(first, Math.max(first, last + 1));
}

// A sharp hit that decays after each beat (`beat`) and after each bar's first beat (`bar`), 0-1
export function pulseAt(analysis, time) {
    const [previous] = recentBeats(analysis, time, 60 / BPM).slice(-1);
    if (!previous) return { beat: 0, bar: 0 };
    const decay = Math.exp(-(time - previous.time) * 9);
    return {
        beat: previous.strength * decay,
        bar: previous.downbeat ? previous.strength * decay : 0,
    };
}

let analysisPromise = null;

// Fetches the spectrum once and shares the analysis between everything that animates to the music
export function loadAnalysis() {
    if (!analysisPromise) {
        analysisPromise = fetch(SPECTRUM_URL)
            .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(response.status)))
            .then((buffer) => analyseSpectrum(new Uint8Array(buffer)))
            .catch((error) => {
                analysisPromise = null;
                throw error;
            });
    }
    return analysisPromise;
}
