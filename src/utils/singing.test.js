import { describe, expect, it } from 'vitest';
import { buildSyllables, mouthAt } from './singing';

const timeline = buildSyllables([
    {
        time: 10,
        end: 11.5,
        words: [
            { text: 'shake', start: 10 },
            { text: 'go', start: 10.5 },
            { text: 'feels', start: 11 }
        ]
    }
]);

describe('mouthAt', () => {
    it('keeps the mouth closed between lyrics', () => {
        expect(mouthAt(5, null, timeline).open).toBe(0);
        expect(mouthAt(20, null, timeline).open).toBe(0);
    });

    it('opens fully in the middle of a syllable', () => {
        expect(mouthAt(10.25, null, timeline).open).toBeCloseTo(1);
    });

    it('shapes the mouth by vowel', () => {
        expect(mouthAt(10.25, null, timeline).width).toBe(1); // "a" in shake: wide open
        expect(mouthAt(10.75, null, timeline).width).toBeLessThan(1); // "o" in go: rounded
        expect(mouthAt(11.25, null, timeline).height).toBeLessThan(1); // "ee" in feels: flat
    });

    it('follows the vocal track when it is loaded', () => {
        // 60fps: silent until 10.2s, loud singing after
        const vocals = new Uint8Array(1200);
        vocals.fill(255, 612);
        expect(mouthAt(10.1, vocals, timeline).open).toBe(0);
        expect(mouthAt(10.25, vocals, timeline).open).toBe(1);
        expect(mouthAt(10.25, vocals, timeline).width).toBe(1); // still shaped by "shake"
    });

    it('stays shut for loud sound away from the lyrics', () => {
        const vocals = new Uint8Array(1200).fill(255);
        expect(mouthAt(5, vocals, timeline).open).toBe(0);
        expect(mouthAt(19, vocals, timeline).open).toBe(0);
    });
});
