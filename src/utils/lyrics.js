import feelGoodIncLyrics from '../assets/music/feel-good-inc.lrc?raw';

const toSeconds = (minutes, seconds) => (Number(minutes) * 60) + Number(seconds);

// Parses LRC, including enhanced LRC word timings: [mm:ss.xx]<mm:ss.xx>word <mm:ss.xx>word <mm:ss.xx>
export function parseLrc(content) {
    return content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
            const match = line.match(/^\[(\d{2}):(\d{2}(?:\.\d{1,2})?)\](.*)$/);
            if (!match) return [];

            const time = toSeconds(match[1], match[2]);
            const body = match[3];
            if (!Number.isFinite(time)) return [];

            const stamps = [...body.matchAll(/<(\d{2}):(\d{2}(?:\.\d{1,2})?)>([^<]*)/g)];
            const words = stamps
                .filter((stamp) => stamp[3].trim())
                .map((stamp) => ({ text: stamp[3].trim(), start: toSeconds(stamp[1], stamp[2]) }));
            const text = stamps.length ? words.map((word) => word.text).join(' ') : body.trim();
            if (!text) return [];

            // A trailing timestamp with no word marks when the line finishes
            const lastStamp = stamps[stamps.length - 1];
            const end = lastStamp && !lastStamp[3].trim() ? toSeconds(lastStamp[1], lastStamp[2]) : null;

            return [{ text, time, words, end }];
        })
        .sort((a, b) => a.time - b.time);
}

export const lyricsTimeline = parseLrc(feelGoodIncLyrics);
