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

// Mouth openness (0-1) and shape at a point in the song
export function mouthAt(time, timeline = syllables) {
    let low = 0;
    let high = timeline.length - 1;
    let found = null;

    // Binary search for the last syllable starting at or before `time`
    while (low <= high) {
        const mid = (low + high) >> 1;
        if (timeline[mid].start <= time) {
            found = timeline[mid];
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (!found || time >= found.end) return { open: 0, ...SHAPES.hum };

    // Each syllable opens and closes the mouth once
    const phase = (time - found.start) / (found.end - found.start);
    return { open: Math.sin(Math.PI * phase) ** 0.6, ...found.shape };
}

export { buildSyllables };
