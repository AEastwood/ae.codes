import { useEffect, useRef } from 'react';
import { useMusicPlayer } from '../hooks/useMusicPlayer';
import { intensityAt, loadAnalysis, loudnessAt, pulseAt, recentBeats } from '../utils/spectrum';

// The picture's colours spread out from the photo on play and pull back into it on pause
const REVEAL_MS = 1100;
const HIDE_MS = 800;
const DOT_SPACING = 22;
const DOT_RADIUS = DOT_SPACING * 0.42;
// How fast the rings travel outward from the photo, in pixels per second
const RIPPLE_SPEED = 650;
// Shockwaves fired by the kicks and drops: speed in px/s, ring thickness, and how long one lasts
const SHOCK_SPEED = 900;
const SHOCK_WIDTH = 34;
const SHOCK_LIFE = 2.2;
const DROP_FLASH_SECONDS = 1.2;
const MUSIC_VARS = ['--music-beat', '--music-bar', '--music-intensity'];

function setMusicVars(beat, bar, intensity) {
    const style = document.documentElement.style;
    style.setProperty(MUSIC_VARS[0], beat.toFixed(3));
    style.setProperty(MUSIC_VARS[1], bar.toFixed(3));
    style.setProperty(MUSIC_VARS[2], intensity.toFixed(3));
}

const easeOut = (p) => 1 - (1 - p) ** 3;

// A colour wash built from the Gorillaz artwork's own palette: navy sky, teal skin, yellow tent, green grass
function paintPalette(ctx, width, height, centre) {
    const base = ctx.createLinearGradient(0, 0, width * 0.4, height);
    base.addColorStop(0, '#173a4d');
    base.addColorStop(0.55, '#1f6068');
    base.addColorStop(1, '#2c4f14');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, width, height);

    const radial = (x, y, r, colour) => {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, colour);
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    };
    const size = Math.max(width, height);
    radial(width * 0.92, height * 0.08, size * 0.55, 'rgba(216, 183, 31, 0.45)');
    radial(width * 0.08, height * 0.95, size * 0.5, 'rgba(67, 105, 16, 0.55)');
    radial(centre.x, centre.y, size * 0.45, 'rgba(39, 117, 126, 0.7)');
}

// Rings travelling outward from the photo right now: one per strong kick, a bigger one per drop
function activeShockwaves(analysis, time) {
    const waves = [];
    for (const beat of recentBeats(analysis, time, SHOCK_LIFE)) {
        if (beat.strength < 0.3) continue;
        const age = time - beat.time;
        waves.push({
            radius: age * SHOCK_SPEED,
            width: SHOCK_WIDTH,
            amp: beat.strength * (beat.downbeat ? 1.2 : 0.65) * (1 - age / SHOCK_LIFE),
        });
    }
    for (const start of analysis.drops) {
        const age = time - start;
        if (age < 0 || age > SHOCK_LIFE * 1.5) continue;
        waves.push({ radius: age * SHOCK_SPEED * 1.3, width: SHOCK_WIDTH * 1.6, amp: 1.4 * (1 - age / (SHOCK_LIFE * 1.5)) });
    }
    return waves;
}

export default function AnimatedBackground() {
    const canvasRef = useRef(null);
    const analysisRef = useRef(null);
    const { isPlaying, getPlaybackTime } = useMusicPlayer();
    const isPlayingRef = useRef(isPlaying);
    const getPlaybackTimeRef = useRef(getPlaybackTime);
    const reduceMotion = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    useEffect(() => {
        isPlayingRef.current = isPlaying;
        getPlaybackTimeRef.current = getPlaybackTime;

        // Load the spectrum the first time music plays
        if (isPlaying && !analysisRef.current) {
            analysisRef.current = 'loading';
            loadAnalysis()
                .then((analysis) => {
                    analysisRef.current = analysis;
                })
                .catch(() => {
                    analysisRef.current = null;
                });
        }
    }, [isPlaying, getPlaybackTime]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext?.('2d');
        if (!ctx) return undefined;

        let width = 0;
        let height = 0;
        let frameId;
        const palette = document.createElement('canvas');
        const paletteCtx = palette.getContext('2d');
        let paletteCentre = null;
        // The reveal circle: how far it had spread when play/pause last flipped, and when that was
        const reveal = { playing: false, from: 0, at: 0 };

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            palette.width = width * dpr;
            palette.height = height * dpr;
            paletteCentre = null;
        };

        // Ripples start from behind the profile photo, falling back to the middle of the screen
        const rippleCentre = () => {
            const photo = document.querySelector('.profile-picture')?.getBoundingClientRect();
            return photo && photo.width
                ? { x: photo.left + photo.width / 2, y: photo.top + photo.height / 2 }
                : { x: width / 2, y: height / 2 };
        };

        // Distance from the photo to the furthest corner, so the colours cover the whole screen
        const fullRadius = (centre) => Math.hypot(Math.max(centre.x, width - centre.x), Math.max(centre.y, height - centre.y));

        const revealRadius = (now, centre) => {
            const full = fullRadius(centre);
            if (reduceMotion) return reveal.playing ? full : 0;
            if (reveal.playing) {
                return reveal.from + ((full - reveal.from) * easeOut(Math.min(1, (now - reveal.at) / REVEAL_MS)));
            }
            return reveal.from * (1 - easeOut(Math.min(1, (now - reveal.at) / HIDE_MS)));
        };

        // Returns whether anything is still on screen
        const draw = (now) => {
            const centre = rippleCentre();
            const spread = revealRadius(now, centre);
            const spreading = spread < fullRadius(centre);
            ctx.clearRect(0, 0, width, height);
            if (spread <= 0) return false;

            // Repaint the colour wash only when the photo moves or the window resizes
            if (!paletteCentre || Math.abs(paletteCentre.x - centre.x) > 4 || Math.abs(paletteCentre.y - centre.y) > 4) {
                const dpr = palette.width / width;
                paletteCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
                paintPalette(paletteCtx, width, height, centre);
                paletteCentre = centre;
            }

            // Everything sits inside the circle spreading out from the photo
            ctx.save();
            ctx.beginPath();
            ctx.arc(centre.x, centre.y, spread, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(palette, 0, 0, width, height);

            const analysis = analysisRef.current;
            if (analysis?.loudness && !reduceMotion) drawMusic(analysis, centre, spread, spreading);
            ctx.restore();

            // A bright rim on the edge of the colours while they spread or pull back
            if (spreading && !reduceMotion) {
                ctx.strokeStyle = 'rgba(240, 214, 90, 0.55)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(centre.x, centre.y, spread, 0, Math.PI * 2);
                ctx.stroke();
            }
            return true;
        };

        const drawMusic = (analysis, centre, spread, spreading) => {
            const time = getPlaybackTimeRef.current();
            const pulse = pulseAt(analysis, time);
            const intensity = intensityAt(analysis, time);
            const waves = activeShockwaves(analysis, time);
            // The pulse leading the colours out when play is pressed
            if (spreading && reveal.playing) waves.push({ radius: spread - SHOCK_WIDTH, width: SHOCK_WIDTH * 1.6, amp: 1.6 });
            // Shared with the CSS so the portrait, name and icons punch on the same beats
            if (reveal.playing) setMusicVars(pulse.beat, pulse.bar, intensity);

            // A glow behind the photo that swells with the chorus and kicks with every beat
            const glowRadius = 200 + (300 * intensity) + (160 * pulse.beat);
            const glow = ctx.createRadialGradient(centre.x, centre.y, 0, centre.x, centre.y, glowRadius);
            glow.addColorStop(0, `rgba(140, 255, 205, ${(0.12 + 0.16 * intensity + 0.22 * pulse.beat).toFixed(3)})`);
            glow.addColorStop(1, 'rgba(140, 255, 205, 0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, width, height);

            const dots = new Path2D();
            const lit = new Path2D();

            for (let y = DOT_SPACING / 2; y < height; y += DOT_SPACING) {
                // Offset every other row like a real halftone screen
                const rowOffset = (Math.round(y / DOT_SPACING) % 2) * (DOT_SPACING / 2);
                for (let x = DOT_SPACING / 2 + rowOffset; x < width; x += DOT_SPACING) {
                    // Further from the photo = further back in the song, so loud moments ripple outward
                    const dx = x - centre.x;
                    const dy = y - centre.y;
                    const dist = Math.hypot(dx, dy) || 1;
                    if (dist > spread + DOT_SPACING) continue;
                    const level = loudnessAt(analysis.loudness, time - dist / RIPPLE_SPEED);

                    // Shockwaves swell the dots they pass and shove them outward
                    let shock = 0;
                    for (const wave of waves) {
                        const offset = (dist - wave.radius) / wave.width;
                        if (offset > -3 && offset < 3) shock += Math.exp(-offset * offset) * wave.amp;
                    }
                    const falloff = shock / (1 + dist / 900);
                    const push = falloff * 12;
                    const px = x + (dx / dist) * push;
                    const py = y + (dy / dist) * push;
                    const radius = Math.min(DOT_RADIUS * 1.1, DOT_RADIUS * (0.08 + 0.92 * level ** 2.5) + DOT_RADIUS * 0.7 * falloff);

                    const path = falloff > 0.25 ? lit : dots;
                    path.moveTo(px + radius, py);
                    path.arc(px, py, radius, 0, Math.PI * 2);
                }
            }

            ctx.fillStyle = 'rgba(6, 13, 13, 0.2)';
            ctx.fill(dots);
            ctx.fillStyle = 'rgba(240, 214, 90, 0.34)';
            ctx.fill(lit);

            // A quick white flash when the drums drop in
            const sinceDrop = time - (analysis.drops.findLast((drop) => drop <= time) ?? -Infinity);
            if (sinceDrop < DROP_FLASH_SECONDS) {
                ctx.fillStyle = `rgba(255, 255, 255, ${(0.22 * (1 - sinceDrop / DROP_FLASH_SECONDS) ** 2).toFixed(3)})`;
                ctx.fillRect(0, 0, width, height);
            }
        };

        let visible = false;
        const loop = () => {
            const now = performance.now();
            if (isPlayingRef.current !== reveal.playing) {
                // Start the new direction from wherever the circle is now, so quick toggles don't jump
                reveal.from = revealRadius(now, rippleCentre());
                reveal.playing = isPlayingRef.current;
                reveal.at = now;
            }

            // Idle once the colours have pulled back in and the old gradient shows again
            if (reveal.playing || visible) visible = draw(now);
            // Paused: let the portrait and name settle rather than freeze mid-punch
            if (!reveal.playing) setMusicVars(0, 0, 0);
            frameId = requestAnimationFrame(loop);
        };

        resize();
        window.addEventListener('resize', resize);
        loop();

        return () => {
            cancelAnimationFrame(frameId);
            window.removeEventListener('resize', resize);
            MUSIC_VARS.forEach((name) => document.documentElement.style.removeProperty(name));
        };
    }, [reduceMotion]);

    return (
        <canvas
            ref={canvasRef}
            className={`animated-background ${isPlaying ? 'is-active' : ''}`}
            aria-hidden="true"
        />
    );
}
