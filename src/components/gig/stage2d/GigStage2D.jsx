import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { loadAnalysis } from '../../../utils/spectrum';
import { loadVocals } from '../../../utils/singing';
import { loadAtlas } from './atlas';
import { buildPlaceholderAtlas } from './placeholderAtlas';
import { cameraAt, createPerformance, PERFORMER_HEIGHT, referenceZoom, showAt, stepPerformance } from './director';
import { createStageArt } from './scene';

export const ATLAS_URL = `${import.meta.env.BASE_URL}gig/character/atlas.json`;
// Frames to keep drawing after a pause, so his mouth closes and the camera settles before the loop idles
const SETTLE_FRAMES = 40;

// The real sprite atlas, or the drawn-in-code stand-in if it's missing or broken
async function loadCharacter(atlasUrl) {
    try {
        return await loadAtlas(atlasUrl);
    } catch {
        return buildPlaceholderAtlas();
    }
}

/*
  The full-screen 2D gig: a flat, hand-inked Gorillaz-style stage drawn with canvas 2D, where a
  cartoon of me performs Feel Good Inc. Lazy-loaded by GigMode. Everything animates from
  `getPlaybackTime()`, read once per frame, so the show stays locked to the audio and freezes in
  place when it's paused.
*/
export default function GigStage2D({ getPlaybackTime, isPlaying, atlasUrl = ATLAS_URL, onError, onReady }) {
    const canvasRef = useRef(null);
    const isPlayingRef = useRef(isPlaying);
    const getPlaybackTimeRef = useRef(getPlaybackTime);
    const onReadyRef = useRef(onReady);
    const onErrorRef = useRef(onError);

    useEffect(() => {
        isPlayingRef.current = isPlaying;
        getPlaybackTimeRef.current = getPlaybackTime;
        onReadyRef.current = onReady;
        onErrorRef.current = onError;
    }, [getPlaybackTime, isPlaying, onError, onReady]);

    useEffect(() => {
        const canvas = canvasRef.current;
        let ctx = null;
        try {
            ctx = canvas?.getContext?.('2d') ?? null;
        } catch {
            ctx = null;
        }
        if (!ctx) {
            onErrorRef.current?.(new Error('Canvas 2D is unavailable'));
            return undefined;
        }
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
        const art = createStageArt({ reduceMotion });
        const act = createPerformance();

        let disposed = false;
        let dirty = true;
        let character = null;
        let announce = false;
        let analysis = null;
        let vocals = null;

        loadAnalysis().then((result) => {
            analysis = result;
            dirty = true;
        }).catch(() => {});
        loadVocals().then((result) => {
            vocals = result;
            dirty = true;
        }).catch(() => {});
        loadCharacter(atlasUrl).then((result) => {
            if (disposed) return;
            character = result;
            art.setCharacter(result);
            announce = true;
            dirty = true;
        }).catch((error) => onErrorRef.current?.(error));

        const view = { width: 1, height: 1, dpr: 1, time: 0, referenceZoom: 1 };
        const resize = () => {
            const width = canvas.clientWidth || window.innerWidth;
            const height = canvas.clientHeight || window.innerHeight;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            Object.assign(view, { width, height, dpr, referenceZoom: referenceZoom(width, height) });
            dirty = true;
        };
        resize();
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
        observer?.observe(canvas);
        window.addEventListener('resize', resize);

        // The head the cameras follow, eased so close-ups don't jerk with every drawing (they're on twos)
        let head = null;
        let frameId;
        let last = performance.now();
        let lastTime = -1;
        let stillFrames = 0;

        const loop = () => {
            frameId = requestAnimationFrame(loop);
            const now = performance.now();
            const dt = Math.min(0.1, (now - last) / 1000);
            last = now;
            const time = getPlaybackTimeRef.current?.() ?? 0;
            const playing = isPlayingRef.current;

            // Paused and settled: nothing on stage can move, so skip drawing until something changes
            stillFrames = !playing && time === lastTime ? stillFrames + 1 : 0;
            lastTime = time;
            if (stillFrames > SETTLE_FRAMES && !dirty && !announce) return;
            dirty = false;

            view.time = time;
            let perf = null;
            let headSize = PERFORMER_HEIGHT * 0.3;
            let target = [0, -PERFORMER_HEIGHT * 0.85];
            if (character) {
                perf = stepPerformance(act, { time, dt, playing, analysis, vocals, atlas: character.atlas });
                const { origin, figure } = character.atlas;
                const scale = PERFORMER_HEIGHT / figure.height;
                target = [(perf.frame.head[0] - origin[0]) * scale, (perf.frame.head[1] - origin[1]) * scale];
                headSize = figure.headSize * scale;
            }
            if (!head) head = [...target];
            const follow = 1 - Math.exp(-dt * 7);
            head[0] += (target[0] - head[0]) * follow;
            head[1] += (target[1] - head[1]) * follow;

            const show = showAt(analysis, time, perf?.sinceDrop ?? Infinity);
            const camera = cameraAt({
                time,
                drops: analysis?.drops ?? [],
                width: view.width,
                height: view.height,
                head,
                headSize,
                pulse: show.pulse,
                reduceMotion,
            });
            art.draw(ctx, { view, camera, show, perf, analysis });

            if (announce) {
                announce = false;
                onReadyRef.current?.(character.source);
            }
        };
        loop();

        return () => {
            disposed = true;
            cancelAnimationFrame(frameId);
            observer?.disconnect();
            window.removeEventListener('resize', resize);
            // Release the canvas's backing store straight away rather than waiting for GC
            canvas.width = 0;
            canvas.height = 0;
        };
    }, [atlasUrl]);

    return <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" aria-hidden="true" />;
}

GigStage2D.propTypes = {
    getPlaybackTime: PropTypes.func.isRequired,
    isPlaying: PropTypes.bool.isRequired,
    atlasUrl: PropTypes.string,
    onError: PropTypes.func,
    onReady: PropTypes.func
};
