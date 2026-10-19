import { loudnessAt } from '../../../utils/spectrum';
import { createHeadFeed } from './character';

/*
  The giant LED screen behind the band, drawn into its own small canvas a couple of dozen times a
  second and then blitted onto the set. It shows the site's halftone dots pulsing with the music,
  the Feel Good Inc. windmill island floating under a big moon, and a live close-up of him rendered
  as chunky LED dots, the way the real Gorillaz shows put the band's faces up on the big screen.
*/

export const SCREEN_SIZE = [640, 440];
const DOT_SPACING = 16;
const DOT_RADIUS = DOT_SPACING * 0.42;
const RIPPLE_SPEED = 420;
// The live feed: a tiny render of his head, each pixel becoming one LED dot this many screen pixels wide
const FEED_SIZE = [96, 80];
const FEED_CELL = 4.2;
// How many times a second the screen redraws: LED walls refresh in visible steps anyway
const SCREEN_FPS = 24;

const TAU = Math.PI * 2;

function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

// A dark grid between the LEDs, laid over everything so the screen reads as a wall of lights
function buildMesh(width, height) {
    const mesh = makeCanvas(width, height);
    const ctx = mesh.getContext('2d');
    ctx.fillStyle = 'rgba(2, 6, 8, 0.3)';
    for (let x = 0; x < width; x += 4) ctx.fillRect(x, 0, 1, height);
    for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 1);
    return mesh;
}

// The floating island from the Feel Good Inc. video, with its windmill, as a flat silhouette
function drawIsland(ctx, x, y, scale, time, colour, grass) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    // Rock hanging under the island, tapering to a point
    ctx.beginPath();
    ctx.moveTo(-90, 0);
    ctx.bezierCurveTo(-70, 30, -40, 40, -20, 80);
    ctx.lineTo(0, 120);
    ctx.lineTo(18, 76);
    ctx.bezierCurveTo(40, 40, 72, 28, 92, 0);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, 94, 12, 0, 0, TAU);
    ctx.fillStyle = grass;
    ctx.fill();
    // The windmill: a tapering tower, a cap and four sails turning slowly
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(-8, -82);
    ctx.lineTo(8, -82);
    ctx.lineTo(14, 0);
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-12, -80);
    ctx.lineTo(0, -96);
    ctx.lineTo(12, -80);
    ctx.fill();
    ctx.translate(0, -84);
    ctx.rotate(time * 0.7);
    for (let i = 0; i < 4; i++) {
        ctx.rotate(TAU / 4);
        ctx.fillRect(-3, 0, 6, 62);
        ctx.fillRect(3, 14, 10, 46);
    }
    ctx.restore();
}

// Quantise a colour to 3 bits a channel so the LED dots batch into a few dozen fills
const bucketOf = (r, g, b) => ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
const bucketColour = (key) => {
    const r = ((key >> 6) & 7) * 36 + 18;
    const g = ((key >> 3) & 7) * 36 + 18;
    const b = (key & 7) * 36 + 18;
    // LEDs: push everything brighter, so the face glows rather than looking printed
    return `rgb(${Math.min(255, (r * 1.3) + 20) | 0}, ${Math.min(255, (g * 1.3) + 20) | 0}, ${Math.min(255, (b * 1.3) + 24) | 0})`;
};

export function createScreen({ character, reduceMotion }) {
    const [width, height] = SCREEN_SIZE;
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const mesh = buildMesh(width, height);
    const feed = character ? createHeadFeed(character, FEED_SIZE, 2.9) : null;
    const backing = makeCanvas(...FEED_SIZE);
    const backingCtx = backing.getContext('2d');
    let lastStep = null;

    // His close-up as LED dots: each feed pixel becomes a dot sized by how bright it is
    function drawFeed(frame, mouth, blink, sway, accent) {
        const image = feed.draw(frame, mouth, blink, sway);
        const { data } = image;
        const [fw, fh] = FEED_SIZE;
        const left = (width - (fw * FEED_CELL)) / 2;
        const top = height - (fh * FEED_CELL);
        const paths = new Map();

        // A glow behind his head, in the section's colour
        const glow = ctx.createRadialGradient(width / 2, top + (fh * FEED_CELL * 0.4), 10, width / 2, top + (fh * FEED_CELL * 0.4), fw * FEED_CELL * 0.6);
        glow.addColorStop(0, `rgba(${accent}, 0.45)`);
        glow.addColorStop(1, `rgba(${accent}, 0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);

        for (let y = 0; y < fh; y++) {
            for (let x = 0; x < fw; x++) {
                const i = ((y * fw) + x) * 4;
                const alpha = data[i + 3];
                if (alpha < 90) continue;
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const light = ((r * 0.3) + (g * 0.55) + (b * 0.15)) / 255;
                // Ink stays as dark LEDs, so the line work still reads at this size
                const radius = FEED_CELL * (light < 0.1 ? 0.22 : 0.32 + (0.22 * Math.sqrt(light)));
                const key = light < 0.1 ? -1 : bucketOf(r, g, b);
                let path = paths.get(key);
                if (!path) {
                    path = new Path2D();
                    paths.set(key, path);
                }
                const cx = left + ((x + 0.5) * FEED_CELL);
                const cy = top + ((y + 0.5) * FEED_CELL);
                path.moveTo(cx + radius, cy);
                path.arc(cx, cy, radius, 0, TAU);
            }
        }
        // A dark backing in his shape, so the dots behind him don't show through the gaps in his face
        backingCtx.globalCompositeOperation = 'copy';
        backingCtx.drawImage(feed.canvas, 0, 0);
        backingCtx.globalCompositeOperation = 'source-in';
        backingCtx.fillStyle = '#04090b';
        backingCtx.fillRect(0, 0, fw, fh);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(backing, left, top, fw * FEED_CELL, fh * FEED_CELL);
        for (const [key, path] of paths) {
            ctx.fillStyle = key === -1 ? 'rgba(20, 30, 34, 1)' : bucketColour(key);
            ctx.fill(path);
        }
    }

    /*
      Redraws the screen if the clock has moved on a step. `show` is the set's music state, `perf`
      what the performer is doing. Returns the canvas to draw.
    */
    function update({ time, analysis, show, perf, force = false }) {
        const step = Math.floor(time * SCREEN_FPS);
        if (step === lastStep && !force) return canvas;
        lastStep = step;
        const accent = show.colours[2].join(', ');
        const chorus = show.section === 'chorus' || show.section === 'drop';

        ctx.globalCompositeOperation = 'source-over';
        const sky = ctx.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, chorus ? '#2a1e3a' : '#0d2a3a');
        sky.addColorStop(1, chorus ? '#5a2a22' : '#173a4d');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height);

        // The site's halftone dots, rippling out from the middle with the loudness
        const centreX = width / 2;
        const centreY = height * 0.55;
        const dots = new Path2D();
        for (let y = DOT_SPACING / 2; y < height; y += DOT_SPACING) {
            const rowOffset = (Math.round(y / DOT_SPACING) % 2) * (DOT_SPACING / 2);
            for (let x = DOT_SPACING / 2 + rowOffset; x < width; x += DOT_SPACING) {
                const dist = Math.hypot(x - centreX, y - centreY);
                const level = analysis ? loudnessAt(analysis.loudness, time - (dist / RIPPLE_SPEED)) : 0.4;
                const radius = DOT_RADIUS * (0.12 + (0.88 * (level ** 2)));
                dots.moveTo(x + radius, y);
                dots.arc(x, y, radius, 0, TAU);
            }
        }
        ctx.fillStyle = chorus ? 'rgba(240, 214, 90, 0.42)' : 'rgba(140, 255, 205, 0.32)';
        ctx.fill(dots);

        // The moon, with halftone shading down one side
        const moonX = width * 0.82;
        const moonY = height * 0.2;
        ctx.beginPath();
        ctx.arc(moonX, moonY, 54, 0, TAU);
        ctx.fillStyle = '#f0d65a';
        ctx.fill();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = 'rgba(216, 150, 31, 0.9)';
        for (let y = moonY - 54; y < moonY + 54; y += 7) {
            for (let x = moonX - 54; x < moonX + 54; x += 7) {
                const r = Math.max(0, ((x - moonX + 20) / 74) * 3.4);
                if (r <= 0.3) continue;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, TAU);
                ctx.fill();
            }
        }
        ctx.restore();

        drawIsland(ctx, width * 0.16, height * 0.52, 0.85, reduceMotion ? 0 : time, '#071318', '#436910');
        drawIsland(ctx, width * 0.9, height * 0.72, 0.4, reduceMotion ? 1 : time * 1.2 + 1, 'rgba(7, 19, 24, 0.8)', '#2c4f14');

        if (feed && perf) {
            const sway = reduceMotion ? 0 : Math.sin(time * 0.4) * 6;
            drawFeed(perf.frame, perf.mouth, perf.blink, sway, accent);
        }

        // A glitch on the hardest kicks: a few rows of the picture jump sideways
        if (!reduceMotion && show.pulse.beat > 0.55) {
            const rows = 3;
            for (let i = 0; i < rows; i++) {
                const y = ((step * 97 + i * 151) % height);
                const h = 6 + ((step * 13 + i * 7) % 18);
                const shift = (((step + i) % 2) ? 1 : -1) * (10 + 26 * show.pulse.beat);
                ctx.drawImage(canvas, 0, y, width, h, shift, y, width, h);
            }
        }

        ctx.drawImage(mesh, 0, 0);
        return canvas;
    }

    return { canvas, update };
}
