import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

// How far through a word we are, 0-1, given its start and the next word's start (or the line end)
function wordProgress(time, start, end) {
    if (time <= start) return 0;
    if (time >= end) return 1;
    return (time - start) / (end - start);
}

export default function KaraokeLine({ line, getPlaybackTime }) {
    const wordRefs = useRef([]);

    useEffect(() => {
        if (!line.words.length || !getPlaybackTime) return undefined;

        let frameId;
        const update = () => {
            const time = getPlaybackTime();
            line.words.forEach((word, index) => {
                const next = line.words[index + 1]?.start ?? line.end ?? word.start + 0.5;
                const element = wordRefs.current[index];
                if (element) {
                    // Updated directly on the element so the fill runs every frame without re-rendering
                    const progress = wordProgress(time, word.start, next);
                    element.style.setProperty('--word-progress', `${progress * 100}%`);
                    element.classList.toggle('is-singing', progress > 0 && progress < 1);
                }
            });
            frameId = requestAnimationFrame(update);
        };
        update();

        return () => cancelAnimationFrame(frameId);
    }, [line, getPlaybackTime]);

    if (!line.words.length) return line.text;

    return (
        <span className="karaoke-line" aria-label={line.text}>
            {line.words.map((word, index) => (
                <span key={`${word.start}-${index}`} aria-hidden="true">
                    <span
                        ref={(element) => { wordRefs.current[index] = element; }}
                        className="karaoke-word"
                        data-text={word.text}
                    >
                        {word.text}
                    </span>
                    {index < line.words.length - 1 ? ' ' : null}
                </span>
            ))}
        </span>
    );
}

KaraokeLine.propTypes = {
    line: PropTypes.shape({
        text: PropTypes.string.isRequired,
        end: PropTypes.number,
        words: PropTypes.arrayOf(PropTypes.shape({
            text: PropTypes.string.isRequired,
            start: PropTypes.number.isRequired
        })).isRequired
    }).isRequired,
    getPlaybackTime: PropTypes.func
};
