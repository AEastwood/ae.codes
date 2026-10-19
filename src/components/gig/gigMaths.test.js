import { describe, expect, it } from 'vitest';
import { BPM, DOWNBEAT, FIRST_BEAT } from '../../utils/spectrum';
import {
    BAR_SECONDS,
    BAR_START,
    barPosition,
    blinkAmount,
    chooseClip,
    clipBars,
    fitFov,
    lastDrop,
    loopTime,
    mouthMorphs,
    nextBlinkDelay,
    oneShotWeight,
    sectionAt,
    shotAt,
    stepWeights,
    vocalsNear,
} from './gigMaths';

describe('bar maths', () => {
    it('starts bars on the grid downbeat at 139.1025 BPM', () => {
        expect(BAR_SECONDS).toBeCloseTo((60 / BPM) * 4, 6);
        expect(BAR_SECONDS).toBeCloseTo(1.72537, 4);
        expect(BAR_START).toBeCloseTo(FIRST_BEAT + DOWNBEAT * (60 / BPM), 6);
        expect(barPosition(BAR_START)).toEqual({ bar: 0, phase: 0 });
    });

    it('keeps counting through the song and before the first downbeat', () => {
        const mid = barPosition(BAR_START + 10.5 * BAR_SECONDS);
        expect(mid.bar).toBe(10);
        expect(mid.phase).toBeCloseTo(0.5);

        const early = barPosition(0);
        expect(early.bar).toBe(-1);
        expect(early.phase).toBeGreaterThan(0);
        expect(early.phase).toBeLessThan(1);
    });

    it('scrubs a one bar loop so its downbeat lands on every bar', () => {
        expect(loopTime(BAR_START + 3 * BAR_SECONDS + 0.01, BAR_SECONDS)).toBeCloseTo(0.01);
        expect(loopTime(BAR_START + 3.25 * BAR_SECONDS, BAR_SECONDS)).toBeCloseTo(BAR_SECONDS / 4);
        expect(loopTime(0, BAR_SECONDS)).toBeGreaterThanOrEqual(0);
        expect(loopTime(0, BAR_SECONDS)).toBeLessThan(BAR_SECONDS);
    });

    it('alternates the halves of a two bar loop by bar number', () => {
        const duration = BAR_SECONDS * 2;
        expect(clipBars(duration)).toBe(2);
        expect(loopTime(BAR_START + 4.5 * BAR_SECONDS, duration)).toBeCloseTo(duration * 0.25);
        expect(loopTime(BAR_START + 5.5 * BAR_SECONDS, duration)).toBeCloseTo(duration * 0.75);
        // Bar -1 is the second half of the loop, not a negative time
        expect(loopTime(BAR_START - 0.5 * BAR_SECONDS, duration)).toBeCloseTo(duration * 0.75);
    });

    it('treats a slightly-off export length as whole bars', () => {
        expect(clipBars(BAR_SECONDS * 1.02)).toBe(1);
        expect(clipBars(0.2)).toBe(1);
        expect(loopTime(5, 0)).toBe(0);
    });
});

describe('chooseClip', () => {
    it('idles before the vocals and in quiet stretches', () => {
        expect(chooseClip({ singing: false, intensity: 0.95, beforeVocals: true })).toBe('Idle');
        expect(chooseClip({ singing: false, intensity: 0.2, beforeVocals: false })).toBe('Idle');
    });

    it('sings while there are vocals, going wild only in the biggest moments', () => {
        expect(chooseClip({ singing: true, intensity: 0.6, beforeVocals: false })).toBe('Sing');
        expect(chooseClip({ singing: true, intensity: 0.95, beforeVocals: false })).toBe('Hype');
    });

    it('hypes loud instrumental parts and grooves through the rest', () => {
        expect(chooseClip({ singing: false, intensity: 0.85, beforeVocals: false })).toBe('Hype');
        expect(chooseClip({ singing: false, intensity: 0.6, beforeVocals: false })).toBe('Groove');
    });
});

describe('vocalsNear', () => {
    const timeline = [
        { time: 10, end: 12, words: [{ text: 'shake', start: 10 }, { text: 'it', start: 11 }] },
        { time: 20, end: null, words: [{ text: 'windmill', start: 20 }] },
    ];

    it('covers a line with a little lead in and hang time', () => {
        expect(vocalsNear(9.7, timeline)).toBe(true);
        expect(vocalsNear(12.5, timeline)).toBe(true);
        expect(vocalsNear(9, timeline)).toBe(false);
        expect(vocalsNear(15, timeline)).toBe(false);
    });

    it('falls back to the last word when a line has no end mark', () => {
        expect(vocalsNear(21, timeline)).toBe(true);
        expect(vocalsNear(22, timeline)).toBe(false);
    });
});

describe('stepWeights', () => {
    it('crossfades over the fade time and always sums to one', () => {
        const weights = { Idle: 1, Groove: 0, Sing: 0 };
        stepWeights(weights, 'Groove', 0.15, 0.3);
        expect(weights.Idle).toBeCloseTo(0.5);
        expect(weights.Groove).toBeCloseTo(0.5);
        stepWeights(weights, 'Groove', 0.3, 0.3);
        expect(weights).toEqual({ Idle: 0, Groove: 1, Sing: 0 });
    });

    it('jumps straight to the active clip from nothing', () => {
        const weights = { Idle: 0, Groove: 0 };
        stepWeights(weights, 'Groove', 0, 0.3);
        expect(weights.Groove).toBe(1);
    });
});

describe('drops and one-shots', () => {
    const drops = [11.07, 23.58, 50.76];

    it('finds the latest drop that has happened', () => {
        expect(lastDrop(5, drops)).toEqual({ time: null, age: Infinity });
        expect(lastDrop(24, drops).time).toBe(23.58);
        expect(lastDrop(24, drops).age).toBeCloseTo(0.42);
    });

    it('fades the drop jump in, holds it, and fades it back out', () => {
        expect(oneShotWeight(-0.1, 1.3)).toBe(0);
        expect(oneShotWeight(0.05, 1.3, 0.1, 0.3)).toBeCloseTo(0.5);
        expect(oneShotWeight(0.6, 1.3, 0.1, 0.3)).toBe(1);
        expect(oneShotWeight(1.15, 1.3, 0.1, 0.3)).toBeCloseTo(0.5);
        expect(oneShotWeight(1.3, 1.3)).toBe(0);
        expect(oneShotWeight(Infinity, 1.3)).toBe(0);
    });

    it('cuts to a new shot on each drop and every 8 bars after it', () => {
        const before = shotAt(5, drops);
        const atDrop = shotAt(50.89, drops);
        const later = shotAt(50.76 + 8 * BAR_SECONDS + 0.1, drops);
        expect(atDrop.index).not.toBe(before.index);
        expect(atDrop.fromDrop).toBe(true);
        expect(atDrop.age).toBeCloseTo(0.13);
        expect(later.index).toBe(atDrop.index + 1);
        expect(later.fromDrop).toBe(false);
    });
});

describe('mouthMorphs', () => {
    it('opens with the vowel height and leaves a hum shut', () => {
        expect(mouthMorphs({ open: 0, width: 0.8, height: 0.3 })).toEqual({ mouthOpen: 0, mouthRound: 0, mouthWide: 0 });
        expect(mouthMorphs({ open: 1, width: 1, height: 1 })).toEqual({ mouthOpen: 1, mouthRound: 0, mouthWide: 0 });
        expect(mouthMorphs({ open: 1, width: 1.15, height: 0.5 }).mouthOpen).toBeCloseTo(0.5);
    });

    it('rounds "oo" sounds and stretches "ee" sounds as far as the mouth is open', () => {
        expect(mouthMorphs({ open: 1, width: 0.6, height: 1 }).mouthRound).toBeCloseTo(1);
        expect(mouthMorphs({ open: 0.5, width: 0.6, height: 1 }).mouthRound).toBeCloseTo(0.5);
        expect(mouthMorphs({ open: 1, width: 1.15, height: 0.5 }).mouthWide).toBeCloseTo(1);
        expect(mouthMorphs({ open: 1, width: 1.15, height: 0.5 }).mouthRound).toBe(0);
    });
});

describe('blinks, moods and framing', () => {
    it('blinks every 2-5 seconds for about 120ms', () => {
        expect(nextBlinkDelay(() => 0)).toBe(2);
        expect(nextBlinkDelay(() => 1)).toBe(5);
        expect(blinkAmount(0.06)).toBeCloseTo(1);
        expect(blinkAmount(0.2)).toBe(0);
        expect(blinkAmount(Infinity)).toBe(0);
    });

    it('picks the lighting mood from the intensity, whiting out right after a drop', () => {
        expect(sectionAt(0.9, 0.2)).toBe('drop');
        expect(sectionAt(0.9, 5)).toBe('chorus');
        expect(sectionAt(0.6, Infinity)).toBe('verse');
        expect(sectionAt(0.2, Infinity)).toBe('quiet');
    });

    it('widens the lens on narrow screens so he stays in frame', () => {
        expect(fitFov(16 / 9, 32, 1.2, 8)).toBe(32);
        const portrait = fitFov(390 / 844, 32, 1.2, 8);
        expect(portrait).toBeGreaterThan(32);
        const halfWidth = Math.tan((portrait * Math.PI) / 360) * 8 * (390 / 844);
        expect(halfWidth).toBeCloseTo(1.2);
        expect(fitFov(0.1, 32, 5, 1)).toBe(72);
    });
});
