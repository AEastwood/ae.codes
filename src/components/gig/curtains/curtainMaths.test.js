import { describe, expect, it } from 'vitest';
import {
    CLOSE,
    closePose,
    curtainGeometry,
    edgeAt,
    halfTransform,
    OPEN,
    openPose,
    project,
    sampleSequence,
    span,
    squareToQuad
} from './curtainMaths';

const identity = 'matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)';

function numbers(transform) {
    return transform.slice(9, -1).split(',').map(Number);
}

// Where a column-major matrix3d sends a point on the z = 0 plane
function apply(transform, x, y) {
    const m = numbers(transform);
    const w = (m[3] * x) + (m[7] * y) + m[15];
    return [((m[0] * x) + (m[4] * y) + m[12]) / w, ((m[1] * x) + (m[5] * y) + m[13]) / w];
}

describe('curtain timeline', () => {
    it('measures progress through a window', () => {
        expect(span(-10, [0, 100])).toBe(0);
        expect(span(50, [0, 100])).toBe(0.5);
        expect(span(500, [0, 100])).toBe(1);
    });

    it('opens from the flat page to fully off screen', () => {
        expect(openPose(0)).toMatchObject({ fold: 0, gather: 0, exit: 0, light: 0, fade: 0 });
        expect(openPose(OPEN.fold[1])).toMatchObject({ fold: 1, gather: 0 });
        expect(openPose(OPEN.duration)).toMatchObject({ fold: 1, gather: 1, exit: 1, light: 0 });
    });

    it('holds still at the gate while the stage gets ready', () => {
        expect(openPose(OPEN.gate)).toEqual(openPose(OPEN.fold[1]));
        expect(openPose(OPEN.gate).gather).toBe(0);
    });

    it('closes from off screen back to the flat page', () => {
        expect(closePose(0)).toMatchObject({ fold: 1, gather: 1, exit: 1, fade: 0 });
        expect(closePose(CLOSE.covered)).toMatchObject({ gather: 0, exit: 0 });
        expect(closePose(CLOSE.duration)).toMatchObject({ fold: 0, gather: 0, exit: 0, fade: 1, swing: 0 });
    });

    it('lights the gap only while the curtains are apart', () => {
        expect(openPose(OPEN.gather[0]).light).toBe(0);
        expect(openPose((OPEN.gather[0] + OPEN.gather[1]) / 2).light).toBeGreaterThan(0.2);
    });
});

describe('curtain geometry', () => {
    it('keeps the pleats under the fold-over limit', () => {
        [[390, 844], [1280, 720], [2560, 1440]].forEach(([width, height]) => {
            const geometry = curtainGeometry(width, height);
            expect(geometry.depth).toBeLessThan(geometry.pleat / Math.PI);
            expect(geometry.reach).toBeGreaterThan(width / 2);
            expect(geometry.minScale).toBeGreaterThan(0);
            expect(geometry.minScale).toBeLessThan(0.3);
        });
    });

    it('gathers each curtain to a drape at the side', () => {
        const geometry = curtainGeometry(1280, 720);
        expect(edgeAt({ gather: 0, exit: 0 }, geometry).edge).toBe(geometry.reach);
        expect(edgeAt({ gather: 1, exit: 0 }, geometry).edge).toBeCloseTo(geometry.drape);
        expect(edgeAt({ gather: 1, exit: 1 }, geometry).edge).toBeLessThan(0);
    });
});

describe('curtain motion', () => {
    it('maps the unit square onto any quad', () => {
        const corners = [[10, 5], [210, 0], [260, 400], [0, 390]];
        const map = squareToQuad(corners);
        [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], index) => {
            const [x, y] = project(map, u, v);
            expect(x).toBeCloseTo(corners[index][0]);
            expect(y).toBeCloseTo(corners[index][1]);
        });
    });

    it('starts and finishes exactly on the page, with the hems at rest', () => {
        const geometry = curtainGeometry(1280, 720);
        const opening = sampleSequence(openPose, OPEN.duration, geometry);
        const closing = sampleSequence(closePose, CLOSE.duration, geometry);
        expect(opening[0].lag).toBe(0);
        expect(closing.at(-1).lag).toBe(0);
        expect(halfTransform(opening[0], geometry, 'left')).toBe(identity);
        expect(halfTransform(closing.at(-1), geometry, 'right')).toBe(identity);
        expect(opening.at(-1).offset).toBe(1);
    });

    it('lets the hem trail behind the top rail while the curtains move', () => {
        const geometry = curtainGeometry(1280, 720);
        const opening = sampleSequence(openPose, OPEN.duration, geometry);
        const middle = opening.find((frame) => frame.time >= (OPEN.gather[0] + OPEN.gather[1]) / 2);
        // Opening pulls the edge outward, so the hem trails towards the middle
        expect(middle.lag).toBeGreaterThan(5);
    });

    it('keeps each outer edge hung at the side while the inner edge swings', () => {
        const geometry = curtainGeometry(1280, 720);
        const frame = { scale: 0.4, shift: 0, lag: 60 };
        const left = halfTransform(frame, geometry, 'left');
        expect(apply(left, 0, 0)[0]).toBeCloseTo(0);
        expect(apply(left, 0, geometry.height)[0]).toBeCloseTo(0);
        expect(apply(left, geometry.reach, 0)[0]).toBeCloseTo(0.4 * geometry.reach);
        expect(apply(left, geometry.reach, geometry.height)[0]).toBeCloseTo((0.4 * geometry.reach) + 60);

        const right = halfTransform(frame, geometry, 'right');
        expect(apply(right, 0, geometry.height)[0]).toBeCloseTo(0);
        expect(apply(right, -geometry.reach, geometry.height)[0]).toBeCloseTo((-0.4 * geometry.reach) - 60);
    });
});
