import { BPM, DOWNBEAT, FIRST_BEAT } from '../../utils/spectrum';

/*
  The gig's timing and choreography decisions, kept free of three.js so they can be tested in jsdom
  and shared with the overlay without pulling the renderer into the main bundle.
*/

export const BEAT_SECONDS = 60 / BPM;
export const BAR_SECONDS = BEAT_SECONDS * 4;
// The beat grid's first beat isn't a downbeat: bars start on beat `DOWNBEAT` of the grid
export const BAR_START = FIRST_BEAT + (DOWNBEAT * BEAT_SECONDS);

export const LOOP_CLIPS = ['Idle', 'Groove', 'Sing', 'Hype'];
export const DROP_CLIP = 'DropJump';
// Intensity (0-1) above which the band is going full tilt
export const HYPE_INTENSITY = 0.82;
// Intensity above which a sung part counts as a big chorus moment rather than a verse
const HYPE_WHILE_SINGING = 0.9;
const QUIET_INTENSITY = 0.4;
// How long a crossfade between dance loops takes, in seconds
export const CROSSFADE_SECONDS = 0.3;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

// Which bar of the song `time` falls in (negative before the first downbeat) and how far through it, 0-1
export function barPosition(time) {
    const bars = (time - BAR_START) / BAR_SECONDS;
    const bar = Math.floor(bars);
    return { bar, phase: bars - bar };
}

// Same for beats, so things can punch on every kick
export function beatPosition(time) {
    const beats = (time - FIRST_BEAT) / BEAT_SECONDS;
    const beat = Math.floor(beats);
    return { beat, phase: beats - beat };
}

// How many bars a dance loop spans, from its length (loops are authored as whole bars)
export function clipBars(duration) {
    return Math.max(1, Math.round(duration / BAR_SECONDS));
}

/*
  The time to show a looping clip at so its downbeat lands on the song's downbeat. Multi-bar loops
  use the bar number to pick which of their bars plays, so a 2-bar move alternates bar by bar.
*/
export function loopTime(time, duration) {
    if (!(duration > 0)) return 0;
    const bars = clipBars(duration);
    const { bar, phase } = barPosition(time);
    const barInClip = ((bar % bars) + bars) % bars;
    return ((barInClip + phase) / bars) * duration;
}

// Is a lyric line being sung around `time`? Starts a touch early so he lifts the mic before the first word
export function vocalsNear(time, timeline, lead = 0.45, tail = 0.8) {
    for (const line of timeline) {
        const start = (line.words[0]?.start ?? line.time) - lead;
        if (start > time) return false;
        const lastWord = line.words[line.words.length - 1]?.start ?? line.time;
        const end = (line.end ?? lastWord + 0.6) + tail;
        if (time <= end) return true;
    }
    return false;
}

/*
  Which dance loop fits the moment: waiting for the vocals or a quiet stretch idles, singing holds
  the mic up (going wild if it's a big chorus), loud instrumental parts get the hype loop, and
  everything else grooves.
*/
export function chooseClip({ singing, intensity, beforeVocals }) {
    if (singing) return intensity >= HYPE_WHILE_SINGING ? 'Hype' : 'Sing';
    if (beforeVocals) return 'Idle';
    if (intensity >= HYPE_INTENSITY) return 'Hype';
    if (intensity < QUIET_INTENSITY) return 'Idle';
    return 'Groove';
}

/*
  Moves each loop's weight towards 1 for the active clip and 0 for the rest at a rate that takes
  `fade` seconds end to end, then normalises so the blend always sums to one. Mutates and returns `weights`.
*/
export function stepWeights(weights, active, dt, fade = CROSSFADE_SECONDS) {
    const step = fade > 0 ? dt / fade : 1;
    let total = 0;
    for (const name of Object.keys(weights)) {
        const target = name === active ? 1 : 0;
        const current = weights[name];
        weights[name] = current < target ? Math.min(target, current + step) : Math.max(target, current - step);
        total += weights[name];
    }
    if (total <= 0) {
        if (active in weights) weights[active] = 1;
        return weights;
    }
    for (const name of Object.keys(weights)) weights[name] /= total;
    return weights;
}

// The most recent drop at or before `time`, and how long ago it was
export function lastDrop(time, drops) {
    let found = null;
    for (const drop of drops) {
        if (drop > time) break;
        found = drop;
    }
    return found == null ? { time: null, age: Infinity } : { time: found, age: time - found };
}

// Weight of a one-shot clip `age` seconds after it fired: quick fade in, hold, gentle fade back out
export function oneShotWeight(age, duration, fadeIn = 0.1, fadeOut = 0.3) {
    if (!(age >= 0) || age >= duration) return 0;
    const into = fadeIn > 0 ? age / fadeIn : 1;
    const out = fadeOut > 0 ? (duration - age) / fadeOut : 1;
    return clamp01(Math.min(into, out));
}

/*
  Morph target weights for a mouth shape from `mouthAt`. Openness scales with the vowel's height;
  narrow vowels (oo) round the lips and flat ones (ee) stretch them, both only as far as the mouth is open.
*/
export function mouthMorphs({ open, width, height }) {
    const opened = clamp01(open * (height ?? 1));
    return {
        mouthOpen: opened,
        mouthRound: clamp01((0.8 - width) / 0.2) * clamp01(open),
        mouthWide: clamp01((width - 1.05) / 0.1) * clamp01(open),
    };
}

// Seconds until the next natural blink
export function nextBlinkDelay(random = Math.random) {
    return 2 + (3 * random());
}

// How closed the eyelids are `age` seconds into a ~120ms blink, 0-1
export function blinkAmount(age, length = 0.12) {
    if (!(age >= 0) || age >= length) return 0;
    return Math.sin((age / length) * Math.PI);
}

// The lighting mood: a white-out right after a drop, bright choruses, calm verses, dark quiet bits
export function sectionAt(intensity, sinceDrop) {
    if (sinceDrop < 0.6) return 'drop';
    if (intensity >= 0.78) return 'chorus';
    if (intensity < QUIET_INTENSITY) return 'quiet';
    return 'verse';
}

/*
  Which camera shot is live: a new one on every drop and every 8 bars after it, with how long it's
  been running so the camera can push in from the cut.
*/
export function shotAt(time, drops, barsPerShot = 8) {
    const drop = lastDrop(time, drops);
    const dropIndex = drops.indexOf(drop.time) + 1;
    const since = drop.time == null ? time : drop.age;
    const shotLength = barsPerShot * BAR_SECONDS;
    const extra = Math.max(0, Math.floor(since / shotLength));
    return { index: (dropIndex * 7) + extra, age: since - (extra * shotLength), fromDrop: extra === 0 && drop.time != null };
}

/*
  Vertical field of view that keeps at least `halfWidth` units either side of the subject visible
  at `distance`, so narrow portrait screens still fit the whole performer.
*/
export function fitFov(aspect, baseFov, halfWidth, distance, maxFov = 72) {
    const neededHalf = Math.atan(halfWidth / (aspect * distance));
    const needed = (neededHalf * 2 * 180) / Math.PI;
    return Math.min(maxFov, Math.max(baseFov, needed));
}
