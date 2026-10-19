import { lyricsTimeline } from '../../../utils/lyrics';
import { mouthAt } from '../../../utils/singing';
import { intensityAt, pulseAt } from '../../../utils/spectrum';
import {
    BAR_SECONDS,
    beatPosition,
    blinkAmount,
    chooseClip,
    lastDrop,
    nextBlinkDelay,
    sectionAt,
    shotAt,
    vocalsNear,
} from '../gigMaths';
import { DROP_NAME, dropFrameIndex, loopClip, loopFrameIndex, mouthPatchFor } from './atlas';

/*
  The 2D gig's decisions, free of any drawing so they're testable: which drawing of which dance he's
  holding, which mouth and whether he's blinking, the lighting section, and where the camera is.
  The stage calls these once per frame with the playback time and draws whatever they say.
*/

// Ahead of this, he's waiting for the first line
const FIRST_LYRIC = lyricsTimeline[0]?.words[0]?.start ?? lyricsTimeline[0]?.time ?? 0;
const CLOSED_MOUTH = { open: 0, width: 0.8, height: 0.3 };
// How long the drop's impact frame holds: one drawing at 12fps
export const IMPACT_SECONDS = 1 / 12;
// How long the comic-panel split stays up after a drop
export const PANEL_SECONDS = 0.75;
// The world: he stands at x=0 with his feet on y=0 (y down, like the canvas) and is this tall
export const PERFORMER_HEIGHT = 175;

export function createPerformance(random = Math.random) {
    return {
        clip: null,
        beat: null,
        mouth: { ...CLOSED_MOUTH },
        blinkIn: nextBlinkDelay(random),
        blinkAge: Infinity,
        random,
    };
}

/*
  Advances the performance to `time` and returns what to draw. Dance loops only cut on a beat so a
  new move always starts in step; in 2D a crossfade would double the drawing, so it's a hard cut.
  The drop jump takes over for its length from each drop, timed by how long ago the drop landed.
*/
export function stepPerformance(state, { time, dt, playing, analysis, vocals, atlas }) {
    const intensity = analysis ? intensityAt(analysis, time) : 0.5;
    const singing = vocalsNear(time, lyricsTimeline);
    const wanted = chooseClip({ singing, intensity, beforeVocals: time < FIRST_LYRIC - 0.45 });

    const { beat } = beatPosition(time);
    if (state.clip == null || (beat !== state.beat && wanted !== state.clip)) state.clip = wanted;
    state.beat = beat;

    const drop = analysis ? lastDrop(time, analysis.drops) : { time: null, age: Infinity };
    const jump = atlas.clips[DROP_NAME];
    const jumpIndex = jump ? dropFrameIndex(jump, drop.age) : -1;
    let clip;
    let index;
    if (jumpIndex >= 0) {
        clip = jump;
        index = jumpIndex;
    } else {
        clip = loopClip(atlas, state.clip);
        index = loopFrameIndex(clip, time);
    }

    // Snap open almost instantly, close a little slower, so it reads as singing rather than flapping
    const target = playing ? mouthAt(time, vocals) : CLOSED_MOUTH;
    const mouth = state.mouth;
    const step = Math.min(1, dt * 60);
    mouth.open += (target.open - mouth.open) * Math.min(1, (target.open > mouth.open ? 0.75 : 0.45) * step);
    mouth.width += (target.width - mouth.width) * Math.min(1, 0.3 * step);
    mouth.height += (target.height - mouth.height) * Math.min(1, 0.3 * step);

    // Blinks run on the wall clock, paused along with the music so a frozen frame stays frozen
    if (playing) {
        state.blinkIn -= dt;
        state.blinkAge += dt;
        if (state.blinkIn <= 0) {
            state.blinkAge = 0;
            state.blinkIn = nextBlinkDelay(state.random);
        }
    }

    return {
        dance: state.clip,
        clip,
        index,
        frame: clip.frames[index],
        mouth: mouthPatchFor(mouth),
        blink: blinkAmount(state.blinkAge) > 0.25,
        intensity,
        singing,
        sinceDrop: drop.age,
        dropTime: drop.time,
    };
}

// Lighting palettes per section: [main beam, second beam, rim light] colours as rgb triples
export const SECTION_COLOURS = {
    quiet: [[23, 58, 77], [39, 117, 126], [54, 141, 130]],
    verse: [[39, 117, 126], [54, 141, 130], [140, 255, 205]],
    chorus: [[240, 214, 90], [240, 128, 40], [230, 60, 50]],
    drop: [[255, 255, 255], [240, 214, 90], [255, 255, 255]],
};

// The music's state at `time` for the set: section, beat pulses and where the beat is
export function showAt(analysis, time, sinceDrop) {
    const intensity = analysis ? intensityAt(analysis, time) : 0.5;
    const pulse = analysis ? pulseAt(analysis, time) : { beat: 0, bar: 0 };
    const { beat, phase } = beatPosition(time);
    const section = sectionAt(intensity, sinceDrop);
    return { intensity, pulse, beat, beatPhase: phase, section, colours: SECTION_COLOURS[section] };
}

/*
  The shots the director cuts between. `look` is what's centred (the whole stage, his body, or his
  head), `size` how much is in frame (world units of height, or head heights for close-ups) and
  `width` how much must stay in frame side to side, so portrait phones still get all of him.
  `panel` frames the shot as a tilted comic panel.
*/
export const SHOTS = [
    { name: 'wide', look: 'stage', size: 640, width: 300, drift: 18 },
    { name: 'medium', look: 'body', size: 270, width: 190, drift: 10 },
    { name: 'close', look: 'head', size: 2.3, width: 1.7, drift: 0.15, panel: true },
    { name: 'screen', look: 'screen', size: 470, width: 260, drift: 14 },
    { name: 'low', look: 'low', size: 380, width: 230, drift: 12 },
];
// Reduced motion keeps one steady shot that shows the screen and all of him
export const STEADY_SHOT = { name: 'steady', look: 'stage', size: 560, width: 280, drift: 6 };

const smooth = (p) => p * p * (3 - 2 * p);

/*
  Where the camera is at `time`: a focus point in world units and a zoom (screen pixels per world
  unit) for a `width` x `height` viewport. Cuts come from shotAt (every 8 bars and on each drop);
  within a shot the camera pushes slowly in and drifts sideways, punches in after a drop's cut, and
  kicks a touch on the hardest downbeats. `head` is his head's world position, `headSize` its height.
*/
export function cameraAt({ time, drops, width, height, head, headSize, pulse, reduceMotion }) {
    const shot = reduceMotion ? { index: -1, age: time, fromDrop: false } : shotAt(time, drops);
    let pick = shot.index % SHOTS.length;
    // A drop always cuts to something new, even if the shot rotation happens to land on the same one
    if (!reduceMotion && shot.fromDrop && pick === shotAt(time - shot.age - 1e-3, drops).index % SHOTS.length) {
        pick = (pick + 1) % SHOTS.length;
    }
    const preset = reduceMotion ? STEADY_SHOT : SHOTS[pick];
    const unit = preset.look === 'head' ? headSize : 1;

    let x = 0;
    let y;
    switch (preset.look) {
        case 'head':
            x = head[0];
            y = head[1] + (headSize * 0.42);
            break;
        case 'body': y = -PERFORMER_HEIGHT * 0.52; break;
        case 'screen': y = -265; break;
        case 'low': y = -185; x = -40; break;
        default: y = -250;
    }

    // Fit the shot's height, unless the screen is so narrow that its width wouldn't fit
    let zoom = Math.min(height / (preset.size * unit), width / (preset.width * unit));
    const push = smooth(Math.min(1, shot.age / (8 * BAR_SECONDS)));
    zoom *= 1 + ((reduceMotion ? 0.04 : 0.09) * push);
    if (shot.fromDrop) zoom *= 1 - (0.22 * Math.exp(-shot.age * 2.4));
    x += Math.sin(shot.age * (reduceMotion ? 0.05 : 0.13)) * preset.drift * unit;

    let tilt = preset.panel ? -0.035 : 0;
    if (!reduceMotion && pulse.bar > 0.35) {
        zoom *= 1 + (0.035 * pulse.bar);
        const shake = (3 * pulse.bar) / zoom;
        x += Math.sin(time * 61) * shake;
        y += Math.sin((time * 47) + 1.3) * shake;
        tilt += Math.sin(time * 37) * 0.004 * pulse.bar;
    }
    return { x, y, zoom, tilt, shot: preset.name, panel: Boolean(preset.panel), index: shot.index, age: shot.age };
}

/*
  The camera transform for a layer at parallax `depth` (1 is his plane, under 1 is further back,
  over 1 is the crowd in front): further layers move and zoom less, which gives a flat multiplane
  look. Every layer lines up as laid out in the reference wide shot (centred on REFERENCE_FOCUS at
  `referenceZoom`) and drifts apart from it as the camera moves in. Returns [scale, x, y] in CSS pixels.
*/
export const REFERENCE_FOCUS = [0, -250];

export function layerTransform(camera, depth, width, height, referenceZoom) {
    const zoom = referenceZoom * ((camera.zoom / referenceZoom) ** depth);
    const x = REFERENCE_FOCUS[0] + ((camera.x - REFERENCE_FOCUS[0]) * depth);
    const y = REFERENCE_FOCUS[1] + ((camera.y - REFERENCE_FOCUS[1]) * depth);
    return [zoom, (width / 2) - (x * zoom), (height / 2) - (y * zoom)];
}

// The zoom the reference wide shot has on a `width` x `height` viewport, which parallax is measured from
export function referenceZoom(width, height) {
    return Math.min(height / SHOTS[0].size, width / SHOTS[0].width);
}
