/*
  The curtain transition's choreography, as pure functions of time so it can be sampled into
  Web Animations keyframes up front (which then run on the compositor, smooth even while the
  gig's stage is busy setting itself up on the main thread).

  A "pose" describes the curtains at one moment, every value 0-1:
  - fold: how far the page has turned into pleated fabric
  - gather: how far the two halves have drawn apart to the sides
  - exit: how far the gathered drapes have slid off the screen
  - light: the stage light blooming in the gap
  - fade: how far the curtains have dissolved back into the page (closing only)
  - swing: how free the hem is to trail and sway (closing settles it once the curtains meet)
*/

// Opening, in ms: fold in, wait at `gate` until the stage is drawing, part, hang as drapes, slide off
export const OPEN = {
    fold: [0, 450],
    gate: 470,
    gather: [520, 1330],
    exit: [1430, 1700],
    duration: 1700
};

// Closing, in ms: slide in, meet in the middle, relax flat, dissolve into the real page
export const CLOSE = {
    enter: [0, 240],
    gather: [180, 760],
    covered: 800,
    relax: [800, 1070],
    fade: [1070, 1200],
    duration: 1200
};

// Keyframes are sampled at this rate and played back linearly
export const SAMPLE_FPS = 60;

// The bottom hem trails the top rail on a damped spring: natural frequency (Hz), damping, and how much of it shows
const HEM_HZ = 1.25;
const HEM_DAMPING = 0.42;
const HEM_GAIN = 0.6;

export const clamp01 = (value) => Math.min(1, Math.max(0, value));

// 0-1 progress through a [start, end] window of the timeline
export const span = (time, [start, end]) => clamp01((time - start) / (end - start));

export const easeInOutSine = (p) => (1 - Math.cos(Math.PI * p)) / 2;
export const easeInCubic = (p) => p ** 3;
export const easeOutCubic = (p) => 1 - ((1 - p) ** 3);
export const smoothstep = (edge0, edge1, value) => {
    const p = clamp01((value - edge0) / (edge1 - edge0));
    return p * p * (3 - (2 * p));
};

// The light peaks just as the gap opens, then eases off so the stage itself takes over
function lightFor(gather, exit) {
    return smoothstep(0.02, 0.3, gather) * (1 - (0.55 * smoothstep(0.45, 1, gather))) * (1 - exit);
}

export function openPose(time) {
    const fold = easeInOutSine(span(time, OPEN.fold));
    const gather = easeInOutSine(span(time, OPEN.gather));
    const exit = easeInCubic(span(time, OPEN.exit));
    return { fold, gather, exit, light: lightFor(gather, exit), fade: 0, swing: 1 };
}

export function closePose(time) {
    const exit = 1 - easeOutCubic(span(time, CLOSE.enter));
    const gather = 1 - easeInOutSine(span(time, CLOSE.gather));
    const fold = 1 - easeInOutSine(span(time, CLOSE.relax));
    const fade = span(time, CLOSE.fade);
    // The hems come to rest against each other as they meet, so the closed curtains hang square
    const swing = 1 - smoothstep(CLOSE.gather[1] - 80, CLOSE.covered + 40, time);
    return { fold, gather, exit, light: lightFor(gather, exit) * 0.8, fade, swing };
}

/*
  Sizes for a viewport, in CSS pixels. Each half is a little wider than half the screen so the left
  one laps over the right where they meet, like real curtains, and a hem swinging past the middle
  never opens a gap.
*/
export function curtainGeometry(width, height) {
    const half = Math.round(width / 2);
    const overlap = Math.max(4, Math.round(width * 0.006));
    // Pleat width, and how far the displacement bends the page sideways (kept under the fold-over limit, pleat / pi)
    const pleat = Math.round(Math.min(96, Math.max(34, half / 7)));
    const depth = Math.round(((pleat / Math.PI) * 0.78) * 10) / 10;
    // How wide each gathered drape hangs at the side of the stage
    const drape = Math.round(Math.min(110, Math.max(30, width * 0.08)));
    const reach = half + overlap;
    return { width, height, half, overlap, pleat, depth, drape, reach, minScale: drape / reach };
}

// Where the left curtain's inner edge sits along its top rail, in screen pixels
export function edgeAt(pose, geometry) {
    const scale = 1 - (pose.gather * (1 - geometry.minScale));
    const shift = pose.exit * (geometry.drape + 90);
    return { scale, shift, edge: (scale * geometry.reach) - shift };
}

/*
  Samples a whole sequence into frames, integrating the hem's spring along the way. `lag` is how far
  the bottom of the left curtain's inner edge trails its top, positive towards the middle of the screen
  (the right curtain mirrors it).
*/
export function sampleSequence(poseAt, duration, geometry, fps = SAMPLE_FPS) {
    const step = 1000 / fps;
    const count = Math.ceil(duration / step) + 1;
    const omega = 2 * Math.PI * HEM_HZ;
    const substeps = 4;
    const frames = [];
    let previousEdge = edgeAt(poseAt(0), geometry).edge;
    let bottom = previousEdge;
    let velocity = 0;

    for (let index = 0; index < count; index++) {
        const time = Math.min(duration, index * step);
        const pose = poseAt(time);
        const placement = edgeAt(pose, geometry);
        if (index > 0) {
            const dt = (time - frames[index - 1].time) / 1000 / substeps;
            for (let sub = 1; sub <= substeps; sub++) {
                const target = previousEdge + ((placement.edge - previousEdge) * (sub / substeps));
                const accel = (omega * omega * (target - bottom)) - (2 * HEM_DAMPING * omega * velocity);
                velocity += accel * dt;
                bottom += velocity * dt;
            }
        }
        previousEdge = placement.edge;
        const lag = (bottom - placement.edge) * HEM_GAIN * (pose.swing ?? 1);
        frames.push({ time, offset: duration ? time / duration : 1, pose, ...placement, lag });
    }
    return frames;
}

/*
  The 3x3 projective map taking the unit square's corners (0,0), (1,0), (1,1), (0,1) to the quad
  `corners` (Heckbert's square-to-quad). Returned row-major as [a, b, c, d, e, f, g, h, 1], so a
  point (u, v) lands at ((a·u + b·v + c) / w, (d·u + e·v + f) / w) with w = g·u + h·v + 1.
*/
export function squareToQuad(corners) {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = corners;
    const sx = x0 - x1 + x2 - x3;
    const sy = y0 - y1 + y2 - y3;
    if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) {
        return [x1 - x0, x3 - x0, x0, y1 - y0, y3 - y0, y0, 0, 0, 1];
    }
    const dx1 = x1 - x2;
    const dx2 = x3 - x2;
    const dy1 = y1 - y2;
    const dy2 = y3 - y2;
    const det = (dx1 * dy2) - (dx2 * dy1);
    const g = ((sx * dy2) - (dx2 * sy)) / det;
    const h = ((dx1 * sy) - (sx * dy1)) / det;
    return [
        x1 - x0 + (g * x1), x3 - x0 + (h * x3), x0,
        y1 - y0 + (g * y1), y3 - y0 + (h * y3), y0,
        g, h, 1
    ];
}

// Applies a row-major 3x3 projective map to a point
export function project(map, x, y) {
    const w = (map[6] * x) + (map[7] * y) + map[8];
    return [((map[0] * x) + (map[1] * y) + map[2]) / w, ((map[3] * x) + (map[4] * y) + map[5]) / w];
}

/*
  The CSS transform for one half, relative to its transform-origin at the outer screen edge, top.
  The outer edge stays hung from the rail at the side of the screen while the inner edge gathers
  towards it, and the hem's trail is a projective skew of just the inner edge, so the curtain
  swings rather than leaning over as a whole.
*/
export function halfTransform(frame, geometry, side) {
    const { reach, height } = geometry;
    const inner = frame.scale * reach;
    const out = -frame.shift;
    let map;
    if (side === 'left') {
        // Source x runs 0 (outer) to reach (inner)
        map = squareToQuad([[out, 0], [inner - frame.shift, 0], [inner - frame.shift + frame.lag, height], [out, height]]);
        map = [map[0] / reach, map[1] / height, map[2], map[3] / reach, map[4] / height, map[5], map[6] / reach, map[7] / height, map[8]];
    } else {
        // Source x runs -reach (inner) to 0 (outer), mirrored
        map = squareToQuad([[frame.shift - inner, 0], [frame.shift, 0], [frame.shift, height], [frame.shift - inner - frame.lag, height]]);
        // u = x / reach + 1
        map = [
            map[0] / reach, map[1] / height, map[0] + map[2],
            map[3] / reach, map[4] / height, map[3] + map[5],
            map[6] / reach, map[7] / height, map[6] + map[8]
        ];
    }
    const n = map.map((value) => value / map[8]);
    const f = (value) => Number(value.toPrecision(7));
    // Column-major 4x4 with z passed straight through
    return `matrix3d(${[n[0], n[3], 0, n[6], n[1], n[4], 0, n[7], 0, 0, 1, 0, n[2], n[5], 0, n[8]].map(f).join(', ')})`;
}
