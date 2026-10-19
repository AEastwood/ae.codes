import { drawCharacter, createSilhouette } from './character';
import { createScreen, SCREEN_SIZE } from './screen';
import { IMPACT_SECONDS, layerTransform, PANEL_SECONDS, PERFORMER_HEIGHT } from './director';

/*
  The 2D gig, painted layer by layer like an animation cel stack: sky and haze, the giant LED screen
  and the lighting truss, speaker stacks and the backline, him on the stage, then the crowd in
  front, with comic-book flourishes and paper grain over the top. Each layer sits at its own
  parallax depth so camera moves feel like a multiplane camera rather than a 3D one. All shapes are
  flat fills with bold ink lines that "boil" (re-jitter) six times a second, on twos.
*/

const INK = '#060d0d';
const TAU = Math.PI * 2;
// Parallax depths: 1 is his plane; the screen and truss are far back, the crowd is right in front
const DEPTH = { sky: 0.35, back: 0.72, mid: 0.88, stage: 1, crowd: 1.16 };
// How often the hand-drawn lines re-jitter, and by how many screen pixels
const BOIL_FPS = 6;
const BOIL_PIXELS = 1.3;
// The giant screen, in world units (his feet at 0, him 175 tall)
const SCREEN_RECT = [-300, -480, 600, 600 * (SCREEN_SIZE[1] / SCREEN_SIZE[0])];
const TRUSS = { left: -480, right: 480, top: -566, bottom: -534 };
const FIXTURES = [-390, -260, -130, 0, 130, 260, 390];
const SPEAKER_X = 372;
// How long the halftone burst behind him lasts after a drop
const BURST_SECONDS = 1.4;
const STROBE_SECONDS = 0.6;

const rgba = (rgb, alpha) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha.toFixed(3)})`;
const ease = (p) => 1 - ((1 - p) ** 3);
const bounce = (phase) => (1 - phase) ** 2;

// A repeatable noise value in -1..1 for a boil step and an index, so each drawing holds until the next step
export function wobble(step, index) {
    let h = Math.imul(step + 0x9e3779b9, 374761393) ^ Math.imul(index + 1, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2) - 1;
}

// Seeded random for laying out the crowd once
function seeded(seed) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    return canvas;
}

// Speckled paper texture, tiled over the whole frame
function buildGrain(random) {
    const size = 160;
    const grain = makeCanvas(size, size);
    const ctx = grain.getContext('2d');
    const image = ctx.createImageData(size, size);
    for (let i = 0; i < image.data.length; i += 4) {
        const value = 128 + ((random() - 0.5) * 110);
        image.data[i] = value;
        image.data[i + 1] = value;
        image.data[i + 2] = value * 0.94;
        image.data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    return grain;
}

/*
  One crowd member as a Path2D silhouette, hands down or up, with a few hairstyles so the line of
  heads isn't uniform. Drawn round their feet-of-frame point, about 40 units wide.
*/
function personPath(style, up) {
    const path = new Path2D();
    path.arc(0, -62, 14, 0, TAU);
    // Shoulders and body, running off the bottom of the screen
    path.moveTo(-24, 120);
    path.lineTo(-25, -30);
    path.quadraticCurveTo(-24, -44, -8, -46);
    path.lineTo(8, -46);
    path.quadraticCurveTo(24, -44, 25, -30);
    path.lineTo(24, 120);
    path.closePath();
    if (style === 1) {
        // Cap with a brim
        path.moveTo(-15, -66);
        path.lineTo(22, -68);
        path.lineTo(22, -63);
        path.lineTo(-15, -61);
        path.closePath();
    } else if (style === 2) {
        // Hair bun
        path.moveTo(9, -78);
        path.arc(4, -78, 7, 0, TAU);
    } else if (style === 3) {
        // Big curly hair
        path.moveTo(20, -64);
        path.arc(0, -64, 20, 0, TAU);
    }
    if (up) {
        // Both arms up in a V, hands open
        for (const side of [-1, 1]) {
            path.moveTo(side * 16, -40);
            path.lineTo(side * 26, -42);
            path.lineTo(side * 40, -100);
            path.lineTo(side * 30, -103);
            path.closePath();
            path.moveTo((side * 36) + 8, -105);
            path.arc(side * 36, -105, 8, 0, TAU);
        }
    }
    return path;
}

// Two rows of fans across the front of the stage, laid out once
function buildCrowd() {
    const random = seeded(23);
    const styles = [0, 1, 2, 3];
    const shapes = styles.map((style) => ({ down: personPath(style, false), up: personPath(style, true) }));
    const people = [];
    const row = (y, scale, spacing, colour, count) => {
        for (let i = 0; i < count; i++) {
            people.push({
                x: (-((count - 1) * spacing) / 2) + (i * spacing) + ((random() - 0.5) * spacing * 0.5),
                y: y + ((random() - 0.5) * 8),
                scale: scale * (0.9 + (random() * 0.2)),
                shape: shapes[Math.floor(random() * shapes.length)],
                colour,
                // How keen they are: the keenest put their hands up first
                eager: random(),
                lag: random() * 0.12,
                phone: random() < 0.22,
            });
        }
    };
    row(52, 0.85, 36, '#0b1b22', 48);
    row(84, 1.12, 50, '#020505', 34);
    return people;
}

export function createStageArt({ reduceMotion, random = Math.random }) {
    const grain = buildGrain(random);
    const crowd = buildCrowd();
    let grainPattern = null;
    let character = null;
    let silhouette = null;
    let screen = createScreen({ character: null, reduceMotion });

    function setCharacter(next) {
        character = next;
        silhouette = createSilhouette(next);
        screen = createScreen({ character: next, reduceMotion });
    }

    // Puts the context into a layer's world space and returns its zoom (CSS pixels per world unit)
    function enterLayer(ctx, view, camera, depth) {
        const { width, height, dpr } = view;
        const [zoom, x, y] = layerTransform(camera, depth, width, height, view.referenceZoom);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (camera.tilt) {
            ctx.translate(width / 2, height / 2);
            ctx.rotate(camera.tilt);
            ctx.translate(-width / 2, -height / 2);
        }
        ctx.translate(x, y);
        ctx.scale(zoom, zoom);
        return zoom;
    }

    // A polyline with every vertex nudged by the boil, so outlines shimmer like redrawn pencil
    function inkPath(points, step, amp, seed, close = true) {
        const path = new Path2D();
        for (let i = 0; i < points.length; i += 2) {
            const x = points[i] + (wobble(step, seed + i) * amp);
            const y = points[i + 1] + (wobble(step, seed + i + 1) * amp);
            if (i === 0) path.moveTo(x, y);
            else path.lineTo(x, y);
        }
        if (close) path.closePath();
        return path;
    }

    const rectPoints = (x, y, w, h) => [x, y, x + w, y, x + w, y + h, x, y + h];

    function drawSky(ctx, view, show) {
        const { width, height, dpr } = view;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const sky = ctx.createLinearGradient(0, 0, 0, height);
        sky.addColorStop(0, '#060d0d');
        sky.addColorStop(0.45, '#0c2430');
        sky.addColorStop(1, '#173a4d');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, width, height);
        // Smoke lit from above in the section's colour, thicker when the band is going for it
        const [main] = show.colours;
        const haze = ctx.createRadialGradient(width / 2, 0, 0, width / 2, 0, Math.max(width, height) * 0.8);
        haze.addColorStop(0, rgba(main, 0.2 + (0.25 * show.intensity)));
        haze.addColorStop(1, rgba(main, 0));
        ctx.fillStyle = haze;
        ctx.fillRect(0, 0, width, height);
    }

    // Light beams: flat translucent wedges from a point, added on top of whatever's behind
    function beam(ctx, x, y, angle, spread, length, colour, alpha) {
        const ax = x + (Math.sin(angle - spread) * length);
        const ay = y + (Math.cos(angle - spread) * length);
        const bx = x + (Math.sin(angle + spread) * length);
        const by = y + (Math.cos(angle + spread) * length);
        const fade = ctx.createLinearGradient(x, y, (ax + bx) / 2, (ay + by) / 2);
        fade.addColorStop(0, rgba(colour, alpha));
        fade.addColorStop(0.7, rgba(colour, alpha * 0.35));
        fade.addColorStop(1, rgba(colour, 0));
        ctx.fillStyle = fade;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.closePath();
        ctx.fill();
    }

    // Where the beams point: swinging side to side on every beat (every bar when it's quiet)
    function sweep(show, index, time) {
        if (reduceMotion) return Math.sin((time * 0.15) + index) * 0.15;
        const slow = show.section === 'quiet' || show.section === 'verse';
        const beats = show.beat + show.beatPhase;
        const span = slow ? 4 : 1;
        const swing = Math.floor(beats / span);
        const phase = (beats / span) - swing;
        const from = (swing + index) % 2 ? 1 : -1;
        const p = phase * phase * (3 - (2 * phase));
        return from * (1 - (2 * p)) * (slow ? 0.28 : 0.42);
    }

    function drawBack(ctx, view, camera, show, screenCanvas, step) {
        const zoom = enterLayer(ctx, view, camera, DEPTH.back);
        const amp = BOIL_PIXELS / zoom;
        const line = 3 / zoom;
        const [main, second] = show.colours;
        const [sx, sy, sw, sh] = SCREEN_RECT;

        // A soft spill of light round the screen, then its black frame and the picture itself
        ctx.fillStyle = rgba(show.colours[2], 0.12 + (0.1 * show.pulse.beat));
        ctx.fillRect(sx - 40, sy - 30, sw + 80, sh + 60);
        const frame = inkPath(rectPoints(sx - 12, sy - 12, sw + 24, sh + 24), step, amp, 10);
        ctx.fillStyle = INK;
        ctx.fill(frame);
        ctx.drawImage(screenCanvas, sx, sy, sw, sh);
        ctx.lineWidth = line;
        ctx.strokeStyle = INK;
        ctx.stroke(frame);

        // The lighting truss: two chords with zig-zag lacing, and towers either side
        const truss = new Path2D();
        const { left, right, top, bottom } = TRUSS;
        const lace = (x1, y1, x2, y2, segments, seed) => {
            const points = [];
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const along = [x1 + ((x2 - x1) * t), y1 + ((y2 - y1) * t)];
                points.push(...along);
            }
            return inkPath(points, step, amp, seed, false);
        };
        truss.addPath(lace(left, top, right, top, 16, 40));
        truss.addPath(lace(left, bottom, right, bottom, 16, 80));
        const zig = [];
        for (let x = left, i = 0; x <= right; x += 30, i++) zig.push(x, i % 2 ? bottom : top);
        truss.addPath(inkPath(zig, step, amp, 120, false));
        for (const side of [-1, 1]) {
            const x = side > 0 ? right : left - 28;
            truss.addPath(inkPath(rectPoints(x, top, 28, -top), step, amp, 300 + side * 20));
            const tower = [];
            for (let y = top, i = 0; y <= 0; y += 28, i++) tower.push(x + (i % 2 ? 28 : 0), y);
            truss.addPath(inkPath(tower, step, amp, 400 + side * 50, false));
        }
        ctx.lineWidth = 4 / zoom;
        ctx.strokeStyle = INK;
        ctx.lineJoin = 'round';
        ctx.stroke(truss);

        // Fixtures hanging under the truss, and the beams they throw down through the smoke
        const lit = show.section === 'quiet' ? 0.18 : 0.26 + (0.2 * show.intensity) + (0.18 * show.pulse.beat);
        ctx.globalCompositeOperation = 'lighter';
        FIXTURES.forEach((x, index) => {
            const angle = sweep(show, index, view.time) * (index % 2 ? -1 : 1);
            beam(ctx, x, bottom + 18, angle, 0.07, 720, index % 2 ? second : main, lit);
        });
        ctx.globalCompositeOperation = 'source-over';
        FIXTURES.forEach((x, index) => {
            const can = inkPath([x - 10, bottom, x + 10, bottom, x + 13, bottom + 20, x - 13, bottom + 20], step, amp, 600 + index * 10);
            ctx.fillStyle = '#0d1a1f';
            ctx.fill(can);
            ctx.lineWidth = line;
            ctx.stroke(can);
            ctx.beginPath();
            ctx.ellipse(x, bottom + 20, 11, 4, 0, 0, TAU);
            ctx.fillStyle = rgba(index % 2 ? second : main, 0.95);
            ctx.fill();
        });
    }

    function drawMid(ctx, view, camera, show, step) {
        const zoom = enterLayer(ctx, view, camera, DEPTH.mid);
        const amp = BOIL_PIXELS / zoom;
        const [, second] = show.colours;
        const edge = 'rgba(54, 141, 130, 0.75)';

        // Up-lights on the floor behind him, fanning up through the smoke
        ctx.globalCompositeOperation = 'lighter';
        [-250, -130, 130, 250].forEach((x, index) => {
            const angle = Math.PI + (sweep(show, index + 3, view.time) * 0.6) + (x < 0 ? 0.18 : -0.18);
            beam(ctx, x, -36, angle, 0.06, 560, second, show.section === 'quiet' ? 0.1 : 0.16 + (0.14 * show.pulse.beat));
        });
        ctx.globalCompositeOperation = 'source-over';

        // Backline: a drum riser and amps, flat dark shapes picked out with a teal edge
        const riser = inkPath(rectPoints(-230, -86, 460, 46), step, amp, 700);
        ctx.fillStyle = '#0b1820';
        ctx.fill(riser);
        ctx.lineWidth = 2.5 / zoom;
        ctx.strokeStyle = edge;
        ctx.stroke(riser);
        for (const x of [-200, 140]) {
            const amp1 = inkPath(rectPoints(x, -140, 60, 54), step, amp, 720 + x);
            ctx.fillStyle = '#0a1418';
            ctx.fill(amp1);
            ctx.stroke(amp1);
            ctx.fillStyle = 'rgba(216, 183, 31, 0.8)';
            ctx.fillRect(x + 6, -134, 48, 6);
        }

        // Speaker stacks either side, the cones kicking out on every beat
        const kick = reduceMotion ? 0 : show.pulse.beat;
        for (const side of [-1, 1]) {
            const x = side * SPEAKER_X;
            for (let box = 0; box < 3; box++) {
                const y = -(box + 1) * 80;
                const cabinet = inkPath(rectPoints(x - 52, y, 104, 78), step, amp, 800 + (side * 30) + box);
                ctx.fillStyle = '#081114';
                ctx.fill(cabinet);
                ctx.lineWidth = 2.5 / zoom;
                ctx.strokeStyle = edge;
                ctx.stroke(cabinet);
                for (const cone of [-24, 24]) {
                    const cx = x + cone;
                    const cy = y + 39;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 20 + (kick * 3), 0, TAU);
                    ctx.fillStyle = '#132228';
                    ctx.fill();
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(cx, cy, 7 + (kick * 4), 0, TAU);
                    ctx.fillStyle = rgba(show.colours[0], 0.35 + (0.5 * kick));
                    ctx.fill();
                }
            }
        }
    }

    // The frame-space -> world transform for him: feet at the origin, PERFORMER_HEIGHT tall
    const performerScale = () => PERFORMER_HEIGHT / character.atlas.figure.height;

    function drawPerformer(ctx, view, camera, show, perf, step, { flat = null } = {}) {
        const zoom = enterLayer(ctx, view, camera, DEPTH.stage);
        if (!character || !perf) return zoom;
        const scale = performerScale();
        const [ox, oy] = character.atlas.origin;
        const rim = show.colours[2];

        // A pool of light on the floor and his shadow in it, shrinking as he leaves the ground
        const idleHead = character.atlas.clips.Idle?.frames[0].head[1] ?? perf.frame.head[1];
        const lift = Math.max(0, (idleHead - perf.frame.head[1]) * scale);
        const shadow = Math.max(0.35, 1 - (lift / 90));
        if (!flat) {
            ctx.globalCompositeOperation = 'lighter';
            const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, 120);
            pool.addColorStop(0, rgba(rim, 0.28));
            pool.addColorStop(1, rgba(rim, 0));
            ctx.fillStyle = pool;
            ctx.beginPath();
            ctx.ellipse(0, 0, 140, 26, 0, 0, TAU);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            ctx.beginPath();
            ctx.ellipse(0, 2, 48 * shadow, 9 * shadow, 0, 0, TAU);
            ctx.fillStyle = 'rgba(2, 6, 8, 0.6)';
            ctx.fill();
        }

        ctx.save();
        ctx.scale(scale, scale);
        ctx.translate(-ox, -oy);
        const pixel = 1 / (zoom * scale);
        if (flat) {
            ctx.drawImage(silhouette(perf.frame, flat), 0, 0);
        } else {
            // Backlight: a flat coloured outline all the way round him, a few pixels thick
            const outline = silhouette(perf.frame, rgba(rim, 1));
            const thickness = (3 + (2 * show.pulse.beat)) * pixel;
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * TAU;
                ctx.drawImage(outline, Math.cos(angle) * thickness, (Math.sin(angle) * thickness) - (thickness * 0.6));
            }
            drawCharacter(ctx, character, perf.frame, perf.mouth, perf.blink);
        }
        ctx.restore();
        return zoom;
    }

    function drawStageFloor(ctx, view, camera, show, step) {
        const zoom = enterLayer(ctx, view, camera, DEPTH.stage);
        const amp = BOIL_PIXELS / zoom;
        const deck = inkPath([-900, -44, 900, -44, 900, 14, -900, 14], step, amp, 900);
        ctx.fillStyle = '#0e2630';
        ctx.fill(deck);
        ctx.lineWidth = 3 / zoom;
        ctx.strokeStyle = INK;
        ctx.stroke(deck);
        // Plank lines across the deck
        ctx.lineWidth = 1.5 / zoom;
        ctx.strokeStyle = 'rgba(6, 13, 13, 0.6)';
        for (const y of [-30, -14]) ctx.stroke(inkPath([-900, y, 900, y], step, amp, 920 + y, false));
        const lip = inkPath([-900, 14, 900, 14, 900, 60, -900, 60], step, amp, 960);
        ctx.fillStyle = INK;
        ctx.fill(lip);
        ctx.fillStyle = rgba(show.colours[0], 0.85);
        ctx.fillRect(-900, 18, 1800, 4);
    }

    // Monitor wedges at the lip of the stage, in front of his feet
    function drawMonitors(ctx, view, camera, step) {
        const zoom = enterLayer(ctx, view, camera, DEPTH.stage);
        const amp = BOIL_PIXELS / zoom;
        for (const x of [-118, 118]) {
            const wedge = inkPath([x - 34, 20, x + 34, 20, x + 26, -4, x - 22, -14], step, amp, 1000 + x);
            ctx.fillStyle = '#0a1418';
            ctx.fill(wedge);
            ctx.lineWidth = 2.5 / zoom;
            ctx.strokeStyle = 'rgba(54, 141, 130, 0.75)';
            ctx.stroke(wedge);
        }
    }

    function drawCrowd(ctx, view, camera, show) {
        const zoom = enterLayer(ctx, view, camera, DEPTH.crowd);
        const party = show.section === 'chorus' || show.section === 'drop';
        const threshold = party ? 0.2 + (0.45 * show.intensity) : 0.08;
        const glow = rgba([140, 255, 205], 0.9);
        for (const person of crowd) {
            const phase = (show.beatPhase + 1 - person.lag) % 1;
            const hop = reduceMotion ? 0 : bounce(phase) * (party ? 9 : 4) * (0.5 + show.intensity);
            const up = person.eager < threshold;
            ctx.save();
            ctx.translate(person.x, person.y - hop);
            ctx.scale(person.scale, person.scale);
            ctx.fillStyle = person.colour;
            ctx.fill(up ? person.shape.up : person.shape.down);
            if (up && person.phone) {
                ctx.fillStyle = glow;
                ctx.fillRect(32, -126, 7, 11);
            }
            ctx.restore();
        }
        return zoom;
    }

    // A ring of halftone dots bursting out from behind him when the drums drop
    function drawBurst(ctx, view, camera, show, sinceDrop) {
        if (!(sinceDrop < BURST_SECONDS)) return;
        enterLayer(ctx, view, camera, DEPTH.stage);
        const p = sinceDrop / BURST_SECONDS;
        const fade = (1 - p) ** 1.5;
        const dots = new Path2D();
        for (let ring = 0; ring < 4; ring++) {
            const radius = 50 + (ease(p) * 420) - (ring * 40);
            if (radius <= 0) continue;
            const count = Math.floor(radius / 9);
            const size = Math.max(0.5, (5 - ring) * 1.6 * fade);
            for (let i = 0; i < count; i++) {
                const angle = ((i + (ring * 0.5)) / count) * TAU;
                const x = Math.cos(angle) * radius;
                const y = -100 + (Math.sin(angle) * radius * 0.85);
                dots.moveTo(x + size, y);
                dots.arc(x, y, size, 0, TAU);
            }
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rgba([240, 214, 90], 0.8 * fade);
        ctx.fill(dots);
        ctx.globalCompositeOperation = 'source-over';
    }

    // Manga focus lines rushing in towards him from the edges of the frame
    function drawFocusLines(ctx, view, centre, colour, alpha, step) {
        const { width, height, dpr } = view;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const reach = Math.hypot(width, height);
        const inner = Math.min(width, height) * 0.36;
        ctx.fillStyle = colour.replace('ALPHA', alpha.toFixed(3));
        ctx.beginPath();
        for (let i = 0; i < 64; i++) {
            const angle = ((i + (wobble(step, i) * 0.4)) / 64) * TAU;
            const start = inner * (1 + (Math.abs(wobble(step, i + 100)) * 0.6));
            const spread = 0.008 + (Math.abs(wobble(step, i + 200)) * 0.012);
            ctx.moveTo(centre[0] + (Math.cos(angle) * start), centre[1] + (Math.sin(angle) * start));
            ctx.lineTo(centre[0] + (Math.cos(angle - spread) * reach), centre[1] + (Math.sin(angle - spread) * reach));
            ctx.lineTo(centre[0] + (Math.cos(angle + spread) * reach), centre[1] + (Math.sin(angle + spread) * reach));
            ctx.closePath();
        }
        ctx.fill();
    }

    // Where a world point on his plane lands on screen
    function toScreen(view, camera, [x, y]) {
        const [zoom, tx, ty] = layerTransform(camera, DEPTH.stage, view.width, view.height, view.referenceZoom);
        let sx = tx + (x * zoom);
        let sy = ty + (y * zoom);
        if (camera.tilt) {
            const cx = view.width / 2;
            const cy = view.height / 2;
            const cos = Math.cos(camera.tilt);
            const sin = Math.sin(camera.tilt);
            [sx, sy] = [cx + ((sx - cx) * cos) - ((sy - cy) * sin), cy + ((sx - cx) * sin) + ((sy - cy) * cos)];
        }
        return [sx, sy];
    }

    function drawScene(ctx, view, camera, show, perf, step, screenCanvas) {
        drawSky(ctx, view, show);
        drawBack(ctx, view, camera, show, screenCanvas, step);
        drawMid(ctx, view, camera, show, step);
        // The further the camera pushes in, the more the set falls back into shadow, so he pops
        const closeness = Math.min(1, Math.max(0, ((camera.zoom / view.referenceZoom) - 1.6) / 3));
        if (closeness > 0) {
            ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
            ctx.fillStyle = `rgba(6, 13, 13, ${(0.5 * closeness).toFixed(3)})`;
            ctx.fillRect(0, 0, view.width, view.height);
        }
        drawStageFloor(ctx, view, camera, show, step);
        drawBurst(ctx, view, camera, show, perf?.sinceDrop ?? Infinity);
        drawPerformer(ctx, view, camera, show, perf, step);
        drawMonitors(ctx, view, camera, step);
        drawCrowd(ctx, view, camera, show);
    }

    /*
      The comic panel that slams in after a drop: a slice of the frame turned into a pop-art close-up
      of him on yellow with a red halftone burst and speed lines, cut off by a thick black gutter.
    */
    function drawDropPanel(ctx, view, camera, show, perf, step, age) {
        const { width, height, dpr } = view;
        const slide = ease(Math.min(1, age / 0.12));
        const portrait = height > width;
        const polygon = portrait
            ? [[0, 0], [width, 0], [width, height * 0.3], [0, height * 0.42]]
            : [[0, 0], [width * 0.44, 0], [width * 0.32, height], [0, height]];
        const shift = portrait ? [0, -(1 - slide) * height * 0.45] : [-(1 - slide) * width * 0.45, 0];
        const points = polygon.map(([x, y]) => [x + shift[0], y + shift[1]]);
        const centre = portrait ? [width * 0.5, height * 0.2 + shift[1]] : [width * 0.2 + shift[0], height * 0.48];

        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.beginPath();
        points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.save();
        ctx.clip();
        ctx.fillStyle = '#d8b71f';
        ctx.fillRect(0, 0, width, height);
        // Red halftone dots getting bigger away from him
        const dots = new Path2D();
        const spacing = 14;
        for (let y = 0; y < height; y += spacing) {
            const offset = (Math.round(y / spacing) % 2) * (spacing / 2);
            for (let x = offset; x < width; x += spacing) {
                const r = Math.min(spacing * 0.48, (Math.hypot(x - centre[0], y - centre[1]) / 520) * spacing * 0.6);
                if (r < 0.6) continue;
                dots.moveTo(x + r, y);
                dots.arc(x, y, r, 0, TAU);
            }
        }
        ctx.fillStyle = '#d2452f';
        ctx.fill(dots);
        drawFocusLines(ctx, view, centre, 'rgba(255, 250, 235, ALPHA)', 0.9, step);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Him close up, framed on his head and shoulders, inside the panel
        if (character && perf) {
            const scale = performerScale();
            const head = [(perf.frame.head[0] - character.atlas.origin[0]) * scale, (perf.frame.head[1] - character.atlas.origin[1]) * scale];
            const headSize = character.atlas.figure.headSize * scale;
            const zoom = (Math.min(width, height) * (portrait ? 0.5 : 0.62)) / (headSize * 1.9);
            const close = { x: 0, y: 0, zoom, tilt: 0.06 };
            // Solve for the camera that puts his head at the panel's centre
            close.x = head[0] - ((centre[0] - (width / 2)) / zoom);
            close.y = head[1] + (headSize * 0.7) - ((centre[1] - (height / 2)) / zoom);
            const local = { ...view, referenceZoom: zoom };
            drawPerformer(ctx, local, close, show, { ...perf }, step);
        }
        ctx.restore();
        // The gutter: thick ink with a white keyline
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.beginPath();
        ctx.moveTo(...points[1]);
        ctx.lineTo(...points[2]);
        ctx.lineCap = 'butt';
        ctx.lineWidth = 16;
        ctx.strokeStyle = '#f3efdf';
        ctx.stroke();
        ctx.lineWidth = 9;
        ctx.strokeStyle = INK;
        ctx.stroke();
        ctx.restore();
    }

    // A comic panel border round close-ups, with a caption box in the corner
    function drawPanelFrame(ctx, view, label) {
        const { width, height, dpr } = view;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const inset = Math.max(10, Math.min(width, height) * 0.025);
        ctx.lineWidth = inset * 2;
        ctx.strokeStyle = '#f3efdf';
        ctx.strokeRect(0, 0, width, height);
        ctx.lineWidth = 6;
        ctx.strokeStyle = INK;
        ctx.strokeRect(inset, inset, width - (inset * 2), height - (inset * 2));
        const size = Math.max(13, Math.min(22, width * 0.022));
        ctx.font = `900 ${size}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
        const text = label.toUpperCase();
        const boxWidth = ctx.measureText(text).width + (size * 1.2);
        const boxHeight = size * 1.9;
        const top = inset + (height > width ? 64 : 3);
        ctx.fillStyle = '#d8b71f';
        ctx.fillRect(inset + 3, top, boxWidth, boxHeight);
        ctx.lineWidth = 3;
        ctx.strokeRect(inset + 3, top, boxWidth, boxHeight);
        ctx.fillStyle = INK;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, inset + 3 + (size * 0.6), top + (boxHeight / 2) + 1);
    }

    function drawFinish(ctx, view, step) {
        const { width, height, dpr } = view;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Vignette, then paper grain that shifts with the boil
        const vignette = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.hypot(width, height) * 0.62);
        vignette.addColorStop(0, 'rgba(2, 6, 8, 0)');
        vignette.addColorStop(1, 'rgba(2, 6, 8, 0.55)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
        grainPattern = grainPattern ?? ctx.createPattern(grain, 'repeat');
        if (grainPattern) {
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.globalAlpha = 0.16;
            const shift = reduceMotion ? 0 : (step % 4) * 41;
            ctx.translate(shift, shift * 0.6);
            ctx.fillStyle = grainPattern;
            ctx.fillRect(-shift, -shift, width + 200, height + 200);
            ctx.restore();
        }
    }

    /*
      Paints one frame. `view` is the viewport ({ width, height, dpr, time, referenceZoom }), `camera`
      the director's camera, `show` the music state and `perf` the performer's drawing for this moment.
    */
    function draw(ctx, { view, camera, show, perf, analysis }) {
        const step = reduceMotion ? 0 : Math.floor(view.time * BOIL_FPS);
        const screenCanvas = screen.update({ time: view.time, analysis, show, perf });
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        const sinceDrop = perf?.sinceDrop ?? Infinity;

        // The impact frame: one drawing of him as a black cut-out on white, focus lines slamming in
        if (!reduceMotion && sinceDrop < IMPACT_SECONDS && character && perf) {
            ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
            ctx.fillStyle = '#f3efdf';
            ctx.fillRect(0, 0, view.width, view.height);
            const centre = toScreen(view, camera, [0, -100]);
            drawFocusLines(ctx, view, centre, 'rgba(6, 13, 13, ALPHA)', 1, step);
            drawPerformer(ctx, view, camera, show, perf, step, { flat: INK });
            drawFinish(ctx, view, step);
            return;
        }

        drawScene(ctx, view, camera, show, perf, step, screenCanvas);

        if (!reduceMotion && sinceDrop < STROBE_SECONDS) {
            const centre = toScreen(view, camera, [0, -100]);
            drawFocusLines(ctx, view, centre, 'rgba(243, 239, 223, ALPHA)', 0.5 * (1 - (sinceDrop / STROBE_SECONDS)), step);
            // White strobe, flashing on twos and dying away
            if (Math.floor(sinceDrop * 12) % 2 === 0) {
                ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
                ctx.fillStyle = `rgba(255, 255, 255, ${(0.55 * (1 - (sinceDrop / STROBE_SECONDS))).toFixed(3)})`;
                ctx.fillRect(0, 0, view.width, view.height);
            }
        }
        if (!reduceMotion && sinceDrop >= IMPACT_SECONDS && sinceDrop < PANEL_SECONDS) {
            drawDropPanel(ctx, view, camera, show, perf, step, sinceDrop - IMPACT_SECONDS);
        }
        if (camera.panel) drawPanelFrame(ctx, view, 'Feel Good Inc.');
        drawFinish(ctx, view, step);
    }

    return { draw, setCharacter };
}
