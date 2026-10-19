import { BAR_SECONDS, barPosition } from '../gigMaths';

/*
  The character sprite atlas: hand-drawn body frames for each dance loop and the drop jump, plus
  mouth and blink patches drawn over the top. Everything here is plain data and maths (no canvas),
  so the parser and frame picking are tested in jsdom and the drawing code only ever sees a
  normalised atlas, whether it came from public/gig/character/atlas.json or the built-in stand-in.
*/

export const ATLAS_VERSION = 1;
export const LOOP_NAMES = ['Idle', 'Groove', 'Sing', 'Hype'];
export const DROP_NAME = 'DropJump';
export const MOUTH_NAMES = ['closed', 'small', 'open', 'round', 'wide'];

// Mouth openness below which the body's own closed mouth shows, and below which it's only slightly open
export const MOUTH_SHUT = 0.12;
export const MOUTH_SMALL = 0.45;
// Vowel widths (from mouthAt) that count as a rounded "oo" or a stretched "ee"
export const MOUTH_ROUND_WIDTH = 0.8;
export const MOUTH_WIDE_WIDTH = 1.05;

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isTuple = (value, length) => Array.isArray(value) && value.length === length && value.every(isNumber);

function fail(message) {
    throw new Error(`Invalid gig atlas: ${message}`);
}

function parseFrame(frame, where, origin, pages) {
    if (!frame || !isTuple(frame.rect, 4)) fail(`${where} needs a rect [x, y, w, h]`);
    if (!Number.isInteger(frame.page) || frame.page < 0 || frame.page >= pages) fail(`${where} points at a missing page`);
    const offset = isTuple(frame.offset, 2) ? frame.offset : [0, 0];
    // Missing face points fall back to somewhere sensible rather than failing the whole atlas
    const head = isTuple(frame.head, 2) ? frame.head : null;
    const mouth = isTuple(frame.mouth, 4) ? frame.mouth : null;
    const eyes = isTuple(frame.eyes, 4) ? frame.eyes : null;
    return { page: frame.page, rect: frame.rect, offset, head, mouth, eyes, origin };
}

function parsePatch(patch, where, pages) {
    if (!patch || !isTuple(patch.rect, 4)) fail(`${where} needs a rect [x, y, w, h]`);
    if (!Number.isInteger(patch.page) || patch.page < 0 || patch.page >= pages) fail(`${where} points at a missing page`);
    const anchor = isTuple(patch.anchor, 2) ? patch.anchor : [patch.rect[2] / 2, patch.rect[3] / 2];
    return { page: patch.page, rect: patch.rect, anchor };
}

/*
  How big he is in frame pixels: feet (the origin) to the top of his head, and the size of his head,
  which the cameras frame close-ups by. `headHeight` is the head's own height; if an atlas gives
  something much bigger it must be the whole figure's height, so the head is taken as a fifth of it.
*/
export function measureFigure(atlas) {
    const [, originY] = atlas.origin;
    const reference = atlas.clips.Idle?.frames[0] ?? Object.values(atlas.clips)[0].frames[0];
    const headY = reference.head ? reference.head[1] : originY - (atlas.frameSize[1] * 0.75);
    const toHead = Math.max(1, originY - headY);
    let headSize = atlas.headHeight;
    let height;
    if (!(headSize > 0)) {
        headSize = toHead * 0.3;
        height = toHead + (headSize / 2);
    } else if (headSize > toHead * 0.6) {
        height = headSize;
        headSize = height * 0.2;
    } else {
        height = toHead + (headSize / 2);
    }
    return { height, headSize };
}

// Fills in the face points a frame left out, from the reference pose's proportions
function fillFacePoints(frame, figure) {
    const [ox, oy] = frame.origin;
    const head = frame.head ?? [ox, oy - figure.height + (figure.headSize / 2)];
    return {
        ...frame,
        head,
        mouth: frame.mouth ?? [head[0], head[1] + (figure.headSize * 0.28), 0, 1],
        eyes: frame.eyes ?? [head[0], head[1] - (figure.headSize * 0.05), 0, 1],
    };
}

/*
  Checks an atlas.json and returns it normalised: every clip has frames, every frame has an offset
  and face points, loop clips know how many bars they span, the drop knows its length, and the
  figure's height and head size are measured once for the cameras. Throws on anything unusable.
*/
export function parseAtlas(json) {
    if (!json || typeof json !== 'object') fail('not an object');
    if (json.version !== ATLAS_VERSION) fail(`unsupported version ${json.version}`);
    if (!isTuple(json.frameSize, 2) || json.frameSize[0] <= 0 || json.frameSize[1] <= 0) fail('frameSize must be [w, h]');
    if (!isTuple(json.origin, 2)) fail('origin must be [x, y]');
    if (!Array.isArray(json.pages) || !json.pages.length || !json.pages.every((page) => typeof page === 'string')) fail('pages must list image files');
    if (!json.clips || typeof json.clips !== 'object') fail('no clips');
    const pages = json.pages.length;
    const fps = isNumber(json.fps) && json.fps > 0 ? json.fps : 12;

    const clips = {};
    for (const [name, clip] of Object.entries(json.clips)) {
        if (!Array.isArray(clip?.frames) || !clip.frames.length) fail(`clip ${name} has no frames`);
        const frames = clip.frames.map((frame, index) => parseFrame(frame, `${name} frame ${index}`, json.origin, pages));
        const loop = clip.loop !== false && name !== DROP_NAME;
        clips[name] = {
            name,
            loop,
            bars: loop ? Math.max(1, Math.round(isNumber(clip.bars) ? clip.bars : 1)) : 0,
            duration: isNumber(clip.duration) && clip.duration > 0 ? clip.duration : frames.length / fps,
            frames,
        };
    }
    if (!LOOP_NAMES.some((name) => clips[name])) fail(`needs at least one of ${LOOP_NAMES.join(', ')}`);

    const mouths = {};
    for (const [name, patch] of Object.entries(json.mouths ?? {})) mouths[name] = parsePatch(patch, `mouth ${name}`, pages);
    const blink = json.blink ? parsePatch(json.blink, 'blink', pages) : null;

    const atlas = {
        version: json.version,
        fps,
        bpm: isNumber(json.bpm) ? json.bpm : null,
        frameSize: json.frameSize,
        origin: json.origin,
        headHeight: isNumber(json.headHeight) ? json.headHeight : 0,
        pages: json.pages,
        clips,
        mouths,
        blink,
    };
    atlas.figure = measureFigure(atlas);
    for (const clip of Object.values(clips)) clip.frames = clip.frames.map((frame) => fillFacePoints(frame, atlas.figure));
    return atlas;
}

// A page's URL: page paths in atlas.json are relative to the atlas file itself
export function pageUrl(atlasUrl, page, base = globalThis.location?.href ?? 'http://localhost/') {
    return new URL(page, new URL(atlasUrl, base)).href;
}

// The loop clip to show for a dance name, falling back to whichever loops the atlas has
export function loopClip(atlas, name) {
    return atlas.clips[name] ?? atlas.clips.Groove ?? atlas.clips[LOOP_NAMES.find((loop) => atlas.clips[loop])];
}

/*
  Which drawing of a loop to hold at `time`: the frame is picked straight from the bar phase so the
  moves land on the song's beats. Loops are drawn on twos, so frames are never blended. A clip that
  spans several bars uses the bar number to pick which of its bars is playing.
*/
export function loopFrameIndex(clip, time) {
    const count = clip.frames.length;
    const bars = clip.bars || 1;
    const { bar, phase } = barPosition(time);
    const barInClip = ((bar % bars) + bars) % bars;
    return Math.min(count - 1, Math.floor(((barInClip + phase) / bars) * count));
}

// The drop jump's drawing `age` seconds after the drop, or -1 once it's finished (or before it starts)
export function dropFrameIndex(clip, age) {
    if (!(age >= 0) || age >= clip.duration) return -1;
    return Math.min(clip.frames.length - 1, Math.floor((age / clip.duration) * clip.frames.length));
}

/*
  Which mouth patch a sung shape needs: nothing (the body's own closed mouth) when it's shut,
  "small" when it's only slightly open, otherwise round for oo, wide for ee and open for everything else.
*/
export function mouthPatchFor({ open, width }) {
    if (!(open >= MOUTH_SHUT)) return null;
    if (open < MOUTH_SMALL) return 'small';
    if (width < MOUTH_ROUND_WIDTH) return 'round';
    if (width > MOUTH_WIDE_WIDTH) return 'wide';
    return 'open';
}

// A frame-space point's position on its atlas page
export function framePointOnPage(frame, [x, y]) {
    return [frame.rect[0] + x - frame.offset[0], frame.rect[1] + y - frame.offset[1]];
}

// How long a loop takes at the song's tempo, for anything that wants to know without the bar maths
export const loopSeconds = (clip) => (clip.bars || 1) * BAR_SECONDS;

async function defaultFetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Gig atlas ${response.status}`);
    return response.json();
}

function defaultLoadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Gig atlas page failed: ${url}`));
        image.src = url;
    });
}

/*
  Fetches and parses atlas.json, then loads its pages. `fetchJson` and `loadImage` can be swapped
  for tests. Rejects if anything is missing, so the caller can fall back to the stand-in character.
*/
export async function loadAtlas(atlasUrl, { fetchJson = defaultFetchJson, loadImage = defaultLoadImage, base } = {}) {
    const atlas = parseAtlas(await fetchJson(atlasUrl));
    const images = await Promise.all(atlas.pages.map((page) => loadImage(pageUrl(atlasUrl, page, base))));
    return { atlas, images, source: 'atlas' };
}
