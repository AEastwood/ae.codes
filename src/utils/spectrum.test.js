import { describe, expect, it } from 'vitest';
import { analyseSpectrum, BPM, FIRST_BEAT, pulseAt, SPECTRUM_BANDS, SPECTRUM_FPS } from './spectrum';

// A fake 20s spectrum: quiet for 8s, then loud with a bass kick on every beat of the grid
function fakeSpectrum(seconds = 20) {
    const frames = seconds * SPECTRUM_FPS;
    const spectrum = new Uint8Array(frames * SPECTRUM_BANDS);
    const period = 60 / BPM;

    for (let f = 0; f < frames; f++) {
        const time = f / SPECTRUM_FPS;
        const loud = time >= 8;
        const sinceBeat = (time - FIRST_BEAT) - Math.floor((time - FIRST_BEAT) / period) * period;
        for (let b = 0; b < SPECTRUM_BANDS; b++) {
            const kick = loud && b < 6 && sinceBeat < 0.07 ? 120 : 0;
            spectrum[f * SPECTRUM_BANDS + b] = (loud ? 110 : 10) + kick;
        }
    }
    return spectrum;
}

describe('analyseSpectrum', () => {
    const analysis = analyseSpectrum(fakeSpectrum());

    it('places beats on the fixed tempo grid', () => {
        expect(analysis.beats[0].time).toBeCloseTo(FIRST_BEAT);
        expect(analysis.beats[1].time - analysis.beats[0].time).toBeCloseTo(60 / BPM);
        expect(analysis.beats.filter((beat) => beat.downbeat)).toHaveLength(Math.ceil(analysis.beats.length / 4) - 1);
    });

    it('finds the drop where the track gets loud', () => {
        expect(analysis.drops).toHaveLength(1);
        expect(analysis.drops[0]).toBeGreaterThan(7.4);
        expect(analysis.drops[0]).toBeLessThan(8.6);
    });

    it('punches right on a beat and decays before the next one', () => {
        const beat = analysis.beats.find((b) => b.time > 10);
        expect(pulseAt(analysis, beat.time + 0.01).beat).toBeGreaterThan(0.5);
        expect(pulseAt(analysis, beat.time + 0.4).beat).toBeLessThan(0.05);
        expect(pulseAt(analysis, 0).beat).toBe(0);
    });
});
