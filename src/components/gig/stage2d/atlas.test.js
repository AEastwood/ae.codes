import { describe, expect, it, vi } from 'vitest';
import { BAR_SECONDS, BAR_START } from '../gigMaths';
import {
    dropFrameIndex,
    framePointOnPage,
    loadAtlas,
    loopClip,
    loopFrameIndex,
    measureFigure,
    mouthPatchFor,
    pageUrl,
    parseAtlas,
} from './atlas';

const frame = (x = 0, extra = {}) => ({
    page: 0,
    rect: [x, 0, 100, 200],
    offset: [10, 20],
    mouth: [50, 60, 2, 1],
    eyes: [50, 40, 2, 1],
    head: [50, 45],
    ...extra,
});
const patch = { page: 0, rect: [0, 300, 20, 10], anchor: [10, 5] };
const frames = (count) => Array.from({ length: count }, (_, i) => frame(i * 100));

function sampleAtlas(overrides = {}) {
    return {
        version: 1,
        fps: 12,
        bpm: 139.1025,
        frameSize: [120, 240],
        origin: [60, 230],
        headHeight: 40,
        pages: ['atlas-0.webp'],
        clips: {
            Idle: { loop: true, bars: 1, frames: frames(20) },
            Groove: { loop: true, bars: 2, frames: frames(20) },
            DropJump: { loop: false, duration: 1.3, frames: frames(16) },
        },
        mouths: { closed: patch, small: patch, open: patch, round: patch, wide: patch },
        blink: patch,
        ...overrides,
    };
}

describe('parseAtlas', () => {
    it('normalises a valid atlas', () => {
        const atlas = parseAtlas(sampleAtlas());
        expect(atlas.clips.Idle.loop).toBe(true);
        expect(atlas.clips.Groove.bars).toBe(2);
        expect(atlas.clips.DropJump.loop).toBe(false);
        expect(atlas.clips.DropJump.duration).toBe(1.3);
        expect(atlas.clips.Idle.frames[0].offset).toEqual([10, 20]);
        expect(atlas.mouths.wide.anchor).toEqual([10, 5]);
        expect(atlas.blink.rect).toEqual([0, 300, 20, 10]);
    });

    it('rejects broken atlases', () => {
        expect(() => parseAtlas(null)).toThrow();
        expect(() => parseAtlas(sampleAtlas({ version: 2 }))).toThrow(/version/);
        expect(() => parseAtlas(sampleAtlas({ pages: [] }))).toThrow(/pages/);
        expect(() => parseAtlas(sampleAtlas({ clips: { Idle: { frames: [] } } }))).toThrow(/no frames/);
        expect(() => parseAtlas(sampleAtlas({ clips: { DropJump: { frames: frames(2) } } }))).toThrow(/at least one/);
        expect(() => parseAtlas(sampleAtlas({ clips: { Idle: { frames: [frame(0, { page: 3 })] } } }))).toThrow(/missing page/);
        expect(() => parseAtlas(sampleAtlas({ clips: { Idle: { frames: [{ page: 0 }] } } }))).toThrow(/rect/);
    });

    it('fills in missing offsets, face points, durations and patch anchors', () => {
        const atlas = parseAtlas(sampleAtlas({
            clips: {
                Idle: { frames: [{ page: 0, rect: [0, 0, 10, 10] }] },
                DropJump: { loop: false, frames: frames(6) },
            },
            mouths: { open: { page: 0, rect: [0, 0, 30, 20] } },
            blink: undefined,
        }));
        const idle = atlas.clips.Idle.frames[0];
        expect(idle.offset).toEqual([0, 0]);
        expect(idle.head).toHaveLength(2);
        expect(idle.mouth).toHaveLength(4);
        expect(idle.mouth[1]).toBeGreaterThan(idle.head[1]);
        expect(atlas.clips.DropJump.duration).toBeCloseTo(6 / 12);
        expect(atlas.mouths.open.anchor).toEqual([15, 10]);
        expect(atlas.blink).toBeNull();
    });
});

describe('measureFigure', () => {
    it('reads headHeight as the size of his head', () => {
        const figure = measureFigure(parseAtlas(sampleAtlas()));
        expect(figure.headSize).toBe(40);
        // Feet at 230, head centre at 45, plus half a head on top
        expect(figure.height).toBeCloseTo(185 + 20);
    });

    it('treats a headHeight as big as the figure as the whole height', () => {
        const figure = measureFigure(parseAtlas(sampleAtlas({ headHeight: 200 })));
        expect(figure.height).toBe(200);
        expect(figure.headSize).toBe(40);
    });
});

describe('frame picking', () => {
    const atlas = parseAtlas(sampleAtlas());

    it('picks loop drawings straight from the bar phase', () => {
        const idle = atlas.clips.Idle;
        expect(loopFrameIndex(idle, BAR_START)).toBe(0);
        expect(loopFrameIndex(idle, BAR_START + (BAR_SECONDS * 0.52))).toBe(10);
        expect(loopFrameIndex(idle, BAR_START + (BAR_SECONDS * 0.999))).toBe(19);
        expect(loopFrameIndex(idle, BAR_START + (BAR_SECONDS * 3.27))).toBe(5);
        // Before the first downbeat it keeps counting backwards
        expect(loopFrameIndex(idle, BAR_START - (BAR_SECONDS * 0.23))).toBe(15);
    });

    it('spreads a two-bar loop across two bars', () => {
        const groove = atlas.clips.Groove;
        expect(loopFrameIndex(groove, BAR_START + (BAR_SECONDS * 0.52))).toBe(5);
        expect(loopFrameIndex(groove, BAR_START + (BAR_SECONDS * 1.52))).toBe(15);
        expect(loopFrameIndex(groove, BAR_START + (BAR_SECONDS * 2.52))).toBe(5);
    });

    it('plays the drop jump by time since the drop', () => {
        const jump = atlas.clips.DropJump;
        expect(dropFrameIndex(jump, -0.1)).toBe(-1);
        expect(dropFrameIndex(jump, 0)).toBe(0);
        expect(dropFrameIndex(jump, 0.65)).toBe(8);
        expect(dropFrameIndex(jump, 1.299)).toBe(15);
        expect(dropFrameIndex(jump, 1.3)).toBe(-1);
        expect(dropFrameIndex(jump, Infinity)).toBe(-1);
    });

    it('falls back to another loop when a dance is missing', () => {
        expect(loopClip(atlas, 'Sing').name).toBe('Groove');
        expect(loopClip(atlas, 'Idle').name).toBe('Idle');
    });

    it('maps frame points onto the page', () => {
        const idle = atlas.clips.Idle.frames[2];
        expect(framePointOnPage(idle, [10, 20])).toEqual([200, 0]);
    });
});

describe('mouthPatchFor', () => {
    it('picks the patch from the sung shape', () => {
        expect(mouthPatchFor({ open: 0, width: 1 })).toBeNull();
        expect(mouthPatchFor({ open: 0.11, width: 1 })).toBeNull();
        expect(mouthPatchFor({ open: 0.2, width: 0.6 })).toBe('small');
        expect(mouthPatchFor({ open: 0.8, width: 0.6 })).toBe('round');
        expect(mouthPatchFor({ open: 0.8, width: 1.15 })).toBe('wide');
        expect(mouthPatchFor({ open: 0.8, width: 1 })).toBe('open');
        expect(mouthPatchFor({ open: NaN, width: 1 })).toBeNull();
    });
});

describe('loadAtlas', () => {
    it('resolves pages relative to the atlas file', () => {
        expect(pageUrl('/gig/character/atlas.json', 'atlas-0.webp', 'https://ae.codes/')).toBe('https://ae.codes/gig/character/atlas-0.webp');
    });

    it('fetches the json and every page', async () => {
        const loadImage = vi.fn(async (url) => ({ url }));
        const result = await loadAtlas('/gig/character/atlas.json', {
            fetchJson: async () => sampleAtlas({ pages: ['a.webp', 'b.webp'] }),
            loadImage,
            base: 'https://ae.codes/',
        });
        expect(result.source).toBe('atlas');
        expect(result.images.map((image) => image.url)).toEqual([
            'https://ae.codes/gig/character/a.webp',
            'https://ae.codes/gig/character/b.webp',
        ]);
    });

    it('rejects when the atlas is missing so the stand-in can take over', async () => {
        await expect(loadAtlas('/nope.json', { fetchJson: async () => { throw new Error('404'); } })).rejects.toThrow('404');
    });
});
