import { lyricsTimeline } from './lyrics';

// Longest a single word holds the mouth open, so long gaps between words close it
const MAX_WORD_SECONDS = 0.9;

// Mouth shape for each vowel sound: width and height multipliers
const SHAPES = {
    round: { width: 0.6, height: 1 },
    open: { width: 1, height: 1 },
    flat: { width: 1.15, height: 0.5 },
    hum: { width: 0.8, height: 0.3 },
};

function shapeFor(vowels) {
    if (!vowels) return SHAPES.hum;
    if (/a/.test(vowels)) return SHAPES.open;
    if (/[ou]/.test(vowels)) return SHAPES.round;
    return SHAPES.flat;
}

// Split every timed word into syllables (one per vowel group), each with its own mouth shape
function buildSyllables(timeline) {
    const syllables = [];

    for (const line of timeline) {
        line.words.forEach((word, index) => {
            const next = line.words[index + 1]?.start ?? line.end ?? word.start + 0.5;
            const duration = Math.min(next - word.start, MAX_WORD_SECONDS);
            const letters = word.text.toLowerCase().replace(/[^a-z]/g, '');
            const vowels = letters.match(/[aeiouy]+/g) ?? [''];
            // A trailing silent "e" (shake, like, make) isn't its own syllable
            if (vowels.length > 1 && /[^aeiouy]e$/.test(letters)) vowels.pop();
            const length = duration / vowels.length;

            vowels.forEach((group, i) => {
                const start = word.start + (i * length);
                syllables.push({ start, end: start + length, shape: shapeFor(group) });
            });
        });
    }

    return syllables.sort((a, b) => a.start - b.start);
}

const syllables = buildSyllables(lyricsTimeline);

export const VOCALS_URL = `${import.meta.env.BASE_URL}data/feel-good-inc-vocals.bin`;
// Loudness of the separated vocal track, 60 frames a second, one byte per frame (scripts/audio/vocals.py)
export const VOCALS_FPS = 60;
// Mouths shape a sound slightly before you hear it, so lead the audio a touch
const LEAD_SECONDS = 0.03;
// How far from a sung syllable its vowel still shapes the mouth (backing vocals, ad-libs)
const SHAPE_REACH = 0.25;

// The syllable being sung at `time`: the last one to start, or the next one if it's about to
function syllableAt(time, timeline) {
    let low = 0;
    let high = timeline.length - 1;
    let found = -1;

    // Binary search for the last syllable starting at or before `time`
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (timeline[mid].start <= time) {
            found = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    const current = timeline[found];
    const next = timeline[found + 1];
    if (current && time < current.end + SHAPE_REACH) return current;
    if (next && next.start - time < SHAPE_REACH) return next;
    return null;
}

function vocalLevel(vocals, time) {
    const position = time * VOCALS_FPS;
    const frame = Math.floor(position);
    if (frame < 0 || frame >= vocals.length - 1) return 0;
    const frac = position - frame;
    return ((vocals[frame] * (1 - frac)) + (vocals[frame + 1] * frac)) / 255;
}

/*
  Mouth openness (0-1) and shape at a point in the song. With the vocal track loaded the mouth opens
  exactly as loud as the singing; the lyrics only pick its shape. Without it, it falls back to
  opening once per syllable from the lyric timings.
*/
export function mouthAt(time, vocals = null, timeline = syllables) {
    const syllable = syllableAt(time, timeline);

    if (vocals) {
        // Only sing where there are lyrics, so instruments left in the vocal track can't move the mouth
        if (!syllable) return { open: 0, ...SHAPES.hum };
        const level = vocalLevel(vocals, time + LEAD_SECONDS);
        // Ease in so quiet bleed stays shut and loud notes open fully
        const open = Math.min(1, Math.max(0, (level - 0.25) / 0.6)) ** 0.8;
        return { open, ...(syllable?.shape ?? SHAPES.open) };
    }

    if (!syllable || time < syllable.start || time >= syllable.end) return { open: 0, ...SHAPES.hum };
    const phase = (time - syllable.start) / (syllable.end - syllable.start);
    return { open: Math.sin(Math.PI * phase) ** 0.6, ...syllable.shape };
}

let vocalsPromise = null;

export function loadVocals() {
    if (!vocalsPromise) {
        vocalsPromise = fetch(VOCALS_URL)
            .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(response.status)))
            .then((buffer) => new Uint8Array(buffer))
            .catch((error) => {
                vocalsPromise = null;
                throw error;
            });
    }
    return vocalsPromise;
}

export { buildSyllables };
