import { describe, expect, it } from 'vitest';
import { BAR_SECONDS, BAR_START, BEAT_SECONDS } from '../gigMaths';
import { lyricsTimeline } from '../../../utils/lyrics';
import { buildPlaceholderAtlas, bendJoint, poseFor, skeletonFor } from './placeholderAtlas';
import {
    cameraAt,
    createPerformance,
    layerTransform,
    REFERENCE_FOCUS,
    referenceZoom,
    showAt,
    SHOTS,
    stepPerformance,
} from './director';

// A canvas stand-in that swallows every drawing call, so the stand-in atlas can be built in jsdom
function fakeCanvas(width, height) {
    const ctx = new Proxy({}, {
        get: (target, key) => (key in target ? target[key] : () => {}),
        set: (target, key, value) => {
            target[key] = value;
            return true;
        },
    });
    return { width, height, getContext: () => ctx };
}

const { atlas } = buildPlaceholderAtlas({ createCanvas: fakeCanvas });
const flatAnalysis = (intensity, drops = []) => ({
    intensity: new Float32Array(30 * 300).fill(intensity),
    loudness: new Float32Array(30 * 300).fill(0.5),
    beats: [],
    drops,
});

describe('placeholder atlas', () => {
    it('has the same structure as a real atlas', () => {
        expect(atlas.version).toBe(1);
        for (const name of ['Idle', 'Groove', 'Sing', 'Hype']) {
            expect(atlas.clips[name].frames).toHaveLength(20);
            expect(atlas.clips[name].loop).toBe(true);
        }
        expect(atlas.clips.DropJump.frames).toHaveLength(16);
        expect(atlas.clips.DropJump.duration).toBe(1.3);
        expect(Object.keys(atlas.mouths).sort()).toEqual(['closed', 'open', 'round', 'small', 'wide']);
        expect(atlas.blink).not.toBeNull();
        expect(atlas.figure.headSize).toBe(74);
    });

    it('dips on every beat and leaves the ground in the jump', () => {
        const onBeat = skeletonFor(poseFor('Groove', 0, 20));
        const offBeat = skeletonFor(poseFor('Groove', 2, 20));
        expect(onBeat.hips[1]).toBeGreaterThan(offBeat.hips[1]);
        const apex = skeletonFor(poseFor('DropJump', 7, 16));
        expect(apex.feet[0][1]).toBeLessThan(atlas.origin[1] - 40);
    });

    it('bends limbs to reach their target', () => {
        const knee = bendJoint([0, 0], [0, 80], 49, 49, 1);
        expect(Math.hypot(knee[0], knee[1])).toBeCloseTo(49, 1);
        expect(Math.hypot(knee[0], knee[1] - 80)).toBeCloseTo(49, 1);
    });
});

describe('stepPerformance', () => {
    const firstLine = lyricsTimeline[0].words[0].start;

    it('idles before the vocals and holds the drawing for the bar phase', () => {
        const state = createPerformance(() => 0.5);
        const time = BAR_START + (BAR_SECONDS * 0.52);
        const result = stepPerformance(state, { time, dt: 1 / 60, playing: true, analysis: flatAnalysis(0.6), vocals: null, atlas });
        expect(time).toBeLessThan(firstLine);
        expect(result.dance).toBe('Idle');
        expect(result.index).toBe(10);
        expect(result.frame).toBe(atlas.clips.Idle.frames[10]);
    });

    it('only cuts to a new dance on a beat', () => {
        const state = createPerformance(() => 0.5);
        const quiet = flatAnalysis(0.6);
        const loud = flatAnalysis(0.95);
        const beatStart = BAR_START + (BEAT_SECONDS * 400);
        stepPerformance(state, { time: beatStart + 0.05, dt: 1 / 60, playing: true, analysis: quiet, vocals: null, atlas });
        const before = state.clip;
        // Still inside the same beat: keeps dancing what it was
        stepPerformance(state, { time: beatStart + 0.1, dt: 1 / 60, playing: true, analysis: loud, vocals: null, atlas });
        expect(state.clip).toBe(before);
        stepPerformance(state, { time: beatStart + BEAT_SECONDS + 0.01, dt: 1 / 60, playing: true, analysis: loud, vocals: null, atlas });
        expect(state.clip).toBe('Hype');
    });

    it('jumps on a drop, then goes back to the loop', () => {
        const state = createPerformance(() => 0.5);
        const analysis = flatAnalysis(0.6, [100]);
        const during = stepPerformance(state, { time: 100.65, dt: 1 / 60, playing: true, analysis, vocals: null, atlas });
        expect(during.clip.name).toBe('DropJump');
        expect(during.index).toBe(8);
        const after = stepPerformance(state, { time: 101.4, dt: 1 / 60, playing: true, analysis, vocals: null, atlas });
        expect(after.clip.name).not.toBe('DropJump');
    });

    it('blinks every few seconds, but not while paused', () => {
        const state = createPerformance(() => 0);
        const step = (playing, dt) => stepPerformance(state, { time: 5, dt, playing, analysis: null, vocals: null, atlas });
        step(false, 5);
        expect(step(false, 0.016).blink).toBe(false);
        step(true, 2.0);
        expect(step(true, 0.05).blink).toBe(true);
        expect(step(true, 0.2).blink).toBe(false);
    });

    it('keeps the mouth shut while paused', () => {
        const state = createPerformance(() => 0.5);
        const result = stepPerformance(state, { time: firstLine + 0.05, dt: 1 / 60, playing: false, analysis: null, vocals: null, atlas });
        expect(result.mouth).toBeNull();
    });
});

describe('showAt', () => {
    it('picks lighting by section', () => {
        expect(showAt(flatAnalysis(0.9), 20, Infinity).section).toBe('chorus');
        expect(showAt(flatAnalysis(0.6), 20, Infinity).section).toBe('verse');
        expect(showAt(flatAnalysis(0.6), 20, 0.2).section).toBe('drop');
        expect(showAt(null, 20, Infinity).colours).toHaveLength(3);
    });
});

describe('cameraAt', () => {
    const base = { head: [0, -150], headSize: 50, pulse: { beat: 0, bar: 0 }, drops: [] };

    it('fits a wide shot on desktop and keeps him in frame on a phone', () => {
        const desk = cameraAt({ ...base, time: 1, width: 1280, height: 720, reduceMotion: false });
        expect(desk.shot).toBe('wide');
        expect(desk.zoom).toBeCloseTo(720 / 640, 1);
        const phone = cameraAt({ ...base, time: 1, width: 390, height: 844, reduceMotion: false });
        // 300 world units across, so the whole stage centre fits a narrow screen
        expect(390 / phone.zoom).toBeGreaterThan(280);
    });

    it('cuts every 8 bars and on drops', () => {
        const shot = (time, drops = []) => cameraAt({ ...base, drops, time, width: 1280, height: 720, reduceMotion: false }).shot;
        expect(shot(1)).toBe(SHOTS[0].name);
        expect(shot(1 + (8 * BAR_SECONDS))).toBe(SHOTS[1].name);
        expect(shot(30, [29])).not.toBe(shot(28.9, [29]));
    });

    it('frames close-ups on his head', () => {
        const close = cameraAt({ ...base, time: 0.5 + (8 * BAR_SECONDS * 2), width: 1280, height: 720, reduceMotion: false });
        expect(close.shot).toBe('close');
        expect(close.panel).toBe(true);
        expect(Math.abs(close.y - base.head[1])).toBeLessThan(base.headSize);
        expect(720 / close.zoom).toBeLessThan(base.headSize * 3);
    });

    it('holds one steady shot with reduced motion', () => {
        const a = cameraAt({ ...base, time: 10, width: 1280, height: 720, reduceMotion: true, drops: [9], pulse: { beat: 1, bar: 1 } });
        const b = cameraAt({ ...base, time: 60, width: 1280, height: 720, reduceMotion: true, drops: [9, 59], pulse: { beat: 1, bar: 1 } });
        expect(a.shot).toBe('steady');
        expect(b.shot).toBe('steady');
        expect(a.tilt).toBe(0);
    });

    it('lines every layer up in the reference shot and spreads them when pushing in', () => {
        const zoom = referenceZoom(1280, 720);
        const reference = { x: REFERENCE_FOCUS[0], y: REFERENCE_FOCUS[1], zoom };
        expect(layerTransform(reference, 0.5, 1280, 720, zoom)).toEqual(layerTransform(reference, 1.3, 1280, 720, zoom));
        const closer = { x: 0, y: -150, zoom: zoom * 3 };
        expect(layerTransform(closer, 0.5, 1280, 720, zoom)[0]).toBeLessThan(layerTransform(closer, 1, 1280, 720, zoom)[0]);
    });
});
