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
        expect(mouthAt(5, timeline).open).toBe(0);
        expect(mouthAt(20, timeline).open).toBe(0);
    });

    it('opens fully in the middle of a syllable', () => {
        expect(mouthAt(10.25, timeline).open).toBeCloseTo(1);
    });

    it('shapes the mouth by vowel', () => {
        expect(mouthAt(10.25, timeline).width).toBe(1); // "a" in shake: wide open
        expect(mouthAt(10.75, timeline).width).toBeLessThan(1); // "o" in go: rounded
        expect(mouthAt(11.25, timeline).height).toBeLessThan(1); // "ee" in feels: flat
    });
});
