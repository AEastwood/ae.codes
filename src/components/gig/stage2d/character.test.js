import { describe, expect, it, vi } from 'vitest';
import { drawCharacter } from './character';

// A context that records what's drawn and with which blend mode
function recorder() {
    const calls = [];
    const ctx = {
        globalCompositeOperation: 'source-over',
        drawImage: (...args) => calls.push({ op: ctx.globalCompositeOperation, source: args[0] }),
        save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, clearRect() {},
    };
    return { ctx, calls };
}

const patch = { page: 0, rect: [0, 0, 10, 10], anchor: [5, 5] };
const character = {
    atlas: { frameSize: [100, 200], mouths: { open: patch, small: patch }, blink: patch },
    images: ['page-0'],
};
const frame = (mouthScale, eyeScale) => ({
    page: 0, rect: [0, 0, 50, 100], offset: [10, 10], mouth: [50, 60, 3, mouthScale], eyes: [50, 40, 3, eyeScale],
});

describe('drawCharacter', () => {
    it('draws just the body when no patch is needed', () => {
        const { ctx, calls } = recorder();
        drawCharacter(ctx, character, frame(1, 1));
        expect(calls).toHaveLength(1);
        expect(calls[0].source).toBe('page-0');
    });

    it('skips patches whose scale is 0 (the mic is in front of his face)', () => {
        const { ctx, calls } = recorder();
        drawCharacter(ctx, character, frame(0, 0), 'open', true);
        expect(calls).toHaveLength(1);
        expect(calls[0].source).toBe('page-0');
    });

    it('clips patches to the body by compositing them source-atop on a copy', () => {
        const offscreen = recorder();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(offscreen.ctx);
        const { ctx, calls } = recorder();
        drawCharacter(ctx, character, frame(1, 0), 'small', true);
        expect(calls).toHaveLength(1);
        expect(calls[0].source).toBeInstanceOf(HTMLCanvasElement);
        expect(offscreen.calls.map((call) => call.op)).toEqual(['source-over', 'source-atop']);
    });
});
