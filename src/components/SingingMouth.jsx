import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { mouthAt } from '../utils/singing';
import { loadLoudness, loudnessAt } from '../utils/spectrum';

// Where the mouth sits in the 460x460 Gorillaz artwork
const MOUTH = { x: 170, y: 199, angle: -8 };
const INK = '#10202a';
const SKIN = '#368d82';

/*
  Lip-synced cartoon mouth drawn over the Gorillaz artwork, plus a fake-3D tilt and bounce
  applied to `tiltRef` (the portrait card). Everything updates per frame through refs, without re-rendering.
*/
export default function SingingMouth({ active, getPlaybackTime, tiltRef }) {
    const patchRef = useRef(null);
    const mouthRef = useRef(null);
    const lipsRef = useRef(null);
    const teethRef = useRef(null);
    const tongueRef = useRef(null);
    const sheenRef = useRef(null);
    const activeRef = useRef(active);
    const loudnessRef = useRef(null);

    useEffect(() => {
        activeRef.current = active;
        if (active && !loudnessRef.current) {
            loadLoudness().then((loudness) => {
                loudnessRef.current = loudness;
            }).catch(() => {});
        }
    }, [active]);

    useEffect(() => {
        if (!getPlaybackTime) return undefined;
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const state = { open: 0, width: 0.8, height: 0.3, bounce: 0, presence: 0 };
        let frameId;

        const update = () => {
            const playing = activeRef.current;
            const time = getPlaybackTime();
            const target = playing ? mouthAt(time) : { open: 0, width: 0.8, height: 0.3 };

            // Snap open quickly, close a little slower, so it reads as singing rather than flapping
            state.open += (target.open - state.open) * (target.open > state.open ? 0.6 : 0.35);
            state.width += (target.width - state.width) * 0.3;
            state.height += (target.height - state.height) * 0.3;
            state.presence += ((playing ? 1 : 0) - state.presence) * 0.05;

            const loudness = loudnessRef.current;
            const level = playing && loudness ? loudnessAt(loudness, time) : 0;
            state.bounce += (level ** 2 - state.bounce) * 0.4;

            const open = state.open * state.height;
            const rx = 6 + (5 * state.width);
            const ry = Math.max(0.6, 11 * open);
            const visible = open > 0.03;

            patchRef.current?.setAttribute('opacity', String(Math.min(1, open * 4)));
            mouthRef.current?.setAttribute('opacity', visible ? '1' : '0');
            lipsRef.current?.setAttribute('rx', rx.toFixed(2));
            lipsRef.current?.setAttribute('ry', ry.toFixed(2));
            teethRef.current?.setAttribute('y', (MOUTH.y - ry).toFixed(2));
            teethRef.current?.setAttribute('height', (ry * 0.35).toFixed(2));
            tongueRef.current?.setAttribute('cy', (MOUTH.y + (ry * 0.7)).toFixed(2));
            tongueRef.current?.setAttribute('ry', (ry * 0.45).toFixed(2));

            // Fake 3D: a slow sway in perspective, kicked by the music's loudness
            if (tiltRef?.current && !reduceMotion) {
                const t = performance.now() / 1000;
                const p = state.presence;
                const rotateY = Math.sin(t * 0.9) * 9 * p;
                const rotateX = ((Math.cos(t * 0.7) * 4) - (state.bounce * 8)) * p;
                const lift = state.bounce * 8 * p;
                const scale = 1 + (state.bounce * 0.05 * p);
                tiltRef.current.style.transform = `perspective(700px) rotateY(${rotateY.toFixed(2)}deg) rotateX(${rotateX.toFixed(2)}deg) translateY(${(-lift).toFixed(2)}px) scale(${scale.toFixed(3)})`;
                if (sheenRef.current) {
                    sheenRef.current.style.opacity = String(0.35 * p);
                    sheenRef.current.style.backgroundPosition = `${50 + (rotateY * 6)}% 0`;
                }
            }

            frameId = requestAnimationFrame(update);
        };
        update();

        return () => cancelAnimationFrame(frameId);
    }, [getPlaybackTime, tiltRef]);

    return (
        <>
            <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox="0 0 460 460"
                preserveAspectRatio="none"
                aria-hidden="true"
            >
                <defs>
                    <radialGradient id="singing-skin">
                        <stop offset="0%" stopColor={SKIN} />
                        <stop offset="70%" stopColor={SKIN} />
                        <stop offset="100%" stopColor={SKIN} stopOpacity="0" />
                    </radialGradient>
                </defs>

                {/* Skin patch hides the drawn lips while the mouth is open */}
                <ellipse ref={patchRef} cx={MOUTH.x + 1} cy={MOUTH.y} rx="17" ry="11" fill="url(#singing-skin)" opacity="0" />

                <g ref={mouthRef} opacity="0" transform={`rotate(${MOUTH.angle} ${MOUTH.x} ${MOUTH.y})`}>
                    <ellipse ref={lipsRef} cx={MOUTH.x} cy={MOUTH.y} rx="9" ry="1" fill="#2a0d18" stroke={INK} strokeWidth="2.4" />
                    <rect ref={teethRef} x={MOUTH.x - 6} y={MOUTH.y} width="12" height="0" rx="1.5" fill="#f4f1e6" />
                    <ellipse ref={tongueRef} cx={MOUTH.x} cy={MOUTH.y} rx="5" ry="0" fill="#c4506a" />
                    {/* Straw stays tucked in the corner of the mouth */}
                    <path d="M 178 198 L 196 226" stroke={INK} strokeWidth="6.5" strokeLinecap="round" />
                    <path d="M 178 198 L 196 226" stroke="#f0902a" strokeWidth="3.5" strokeLinecap="round" />
                </g>
            </svg>
            <div ref={sheenRef} className="singing-sheen absolute inset-0 pointer-events-none" aria-hidden="true" />
        </>
    );
}

SingingMouth.propTypes = {
    active: PropTypes.bool.isRequired,
    getPlaybackTime: PropTypes.func,
    tiltRef: PropTypes.shape({ current: PropTypes.any })
};
