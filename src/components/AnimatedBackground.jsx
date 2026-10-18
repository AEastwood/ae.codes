import { useEffect, useRef } from 'react';
import { useMusicPlayer } from '../hooks/useMusicPlayer';
import { loadLoudness, loudnessAt } from '../utils/spectrum';

const FADE_MS = 1200;
const DOT_SPACING = 22;
const DOT_RADIUS = DOT_SPACING * 0.42;
// How fast the rings travel outward from the photo, in pixels per second
const RIPPLE_SPEED = 650;

export default function AnimatedBackground() {
    const canvasRef = useRef(null);
    const loudnessRef = useRef(null);
    const { isPlaying, getPlaybackTime } = useMusicPlayer();
    const isPlayingRef = useRef(isPlaying);
    const getPlaybackTimeRef = useRef(getPlaybackTime);
    const reduceMotion = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    useEffect(() => {
        isPlayingRef.current = isPlaying;
        getPlaybackTimeRef.current = getPlaybackTime;

        // Load the spectrum the first time music plays
        if (isPlaying && !loudnessRef.current) {
            loudnessRef.current = 'loading';
            loadLoudness()
                .then((loudness) => {
                    loudnessRef.current = loudness;
                })
                .catch(() => {
                    loudnessRef.current = null;
                });
        }
    }, [isPlaying, getPlaybackTime]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext?.('2d');
        if (!ctx || reduceMotion) return undefined;

        let width = 0;
        let height = 0;
        let stoppedAt = 0;
        let frameId;

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        // Ripples start from behind the profile photo, falling back to the middle of the screen
        const rippleCentre = () => {
            const photo = document.querySelector('.profile-picture')?.getBoundingClientRect();
            return photo && photo.width
                ? { x: photo.left + photo.width / 2, y: photo.top + photo.height / 2 }
                : { x: width / 2, y: height / 2 };
        };

        const draw = () => {
            const loudness = loudnessRef.current;
            if (!(loudness instanceof Float32Array)) return;

            const time = getPlaybackTimeRef.current();
            const centre = rippleCentre();

            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = 'rgba(27, 20, 48, 0.14)';
            ctx.beginPath();

            for (let y = DOT_SPACING / 2; y < height; y += DOT_SPACING) {
                // Offset every other row like a real halftone screen
                const rowOffset = (Math.round(y / DOT_SPACING) % 2) * (DOT_SPACING / 2);
                for (let x = DOT_SPACING / 2 + rowOffset; x < width; x += DOT_SPACING) {
                    // Further from the photo = further back in the song, so loud moments ripple outward
                    const dist = Math.hypot(x - centre.x, y - centre.y);
                    const level = loudnessAt(loudness, time - dist / RIPPLE_SPEED);
                    const radius = DOT_RADIUS * (0.08 + 0.92 * level ** 2.5);

                    ctx.moveTo(x + radius, y);
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                }
            }
            ctx.fill();
        };

        const loop = () => {
            const now = performance.now();
            if (isPlayingRef.current) {
                stoppedAt = 0;
            } else if (!stoppedAt) {
                stoppedAt = now;
            }

            // Keep drawing through the fade-out, then idle while the old background shows
            if (!stoppedAt || now - stoppedAt < FADE_MS + 200) draw();
            frameId = requestAnimationFrame(loop);
        };

        resize();
        window.addEventListener('resize', resize);
        loop();

        return () => {
            cancelAnimationFrame(frameId);
            window.removeEventListener('resize', resize);
        };
    }, [reduceMotion]);

    const active = isPlaying && !reduceMotion;

    return (
        <canvas
            ref={canvasRef}
            className={`animated-background ${active ? 'is-active' : ''}`}
            aria-hidden="true"
        />
    );
}
