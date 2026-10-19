import { parseAtlas } from './atlas';
import { BPM } from '../../../utils/spectrum';

/*
  A stand-in character, drawn in code, used until public/gig/character/atlas.json exists (or if it
  fails to load). It builds exactly what a real atlas holds: pages of body drawings for each loop
  (20 a bar) and the drop jump (16), five mouth patches and a blink patch, plus the atlas.json data
  pointing into them, then runs it through the same parser. So the real art drops in with no code
  changes. The figure is flat colour with bold ink lines: cap, mustard tee, jeans, white trainers.
*/

const CELL = [200, 320];
const ORIGIN = [100, 308];
const HEAD_HEIGHT = 74;
const COLUMNS = 10;
const LOOP_FRAMES = 20;
const DROP_FRAMES = 16;
const DROP_SECONDS = 1.3;
const INK_WIDTH = 3;
const MOUTH_CELL = [48, 36];
const BLINK_CELL = [64, 28];

const COLOURS = {
    ink: '#060d0d',
    skin: '#ecd2ae',
    skinShade: '#c99d78',
    hair: '#11171a',
    cap: '#11171a',
    capShade: '#27323a',
    logo: '#d8b71f',
    shirt: '#d8b71f',
    shirtShade: '#b0901a',
    jeans: '#1d3346',
    jeansShade: '#142636',
    shoe: '#f3efdf',
    eye: '#f3efdf',
    mouth: '#2a0d18',
    tongue: '#c8504a',
    teeth: '#f3efdf',
    mic: '#1b1f22',
    grille: '#a9b4b4',
};

// The skeleton's rest lengths in frame pixels, for a figure 232px from feet to the top of the head
const BODY = {
    hipY: ORIGIN[1] - 96,
    thigh: 49,
    shin: 49,
    torso: 52,
    neck: 9,
    shoulder: 22,
    hip: 13,
    upperArm: 36,
    foreArm: 34,
    feet: 15,
};

const TAU = Math.PI * 2;
const bounceOf = (beatPhase) => 0.5 + (0.5 * Math.cos(TAU * beatPhase));

/*
  The pose for drawing `index` of `count` in a clip: how far the body dips, sways and leans, where
  each arm points (angles from hanging straight down, positive towards the viewer's right) and how
  the head nods and tilts. Loops get their bounce from the beat phase, so each beat lands on a dip.
*/
export function poseFor(clip, index, count) {
    const p = index / count;
    const beat = (p * 4) % 1;
    const bounce = bounceOf(beat);
    const two = Math.sin(TAU * p * 2);
    const pose = {
        dip: 0, sway: 0, lean: 0, air: 0, tuck: 0,
        armL: [0.18, 0.25], armR: [-0.25, -1.6], micToMouth: false,
        nod: 0, tilt: 0,
    };

    switch (clip) {
        case 'Idle':
            pose.dip = 3 * bounce * bounce;
            pose.sway = Math.sin(TAU * p) * 2;
            pose.tilt = 0.05 * Math.sin(TAU * p);
            pose.nod = 2 * bounce;
            break;
        case 'Groove':
            pose.dip = 8 * bounce;
            pose.sway = two * 7;
            pose.lean = 0.07 * two;
            pose.armL = [0.35 + (0.3 * two), 0.9 + (0.3 * bounce)];
            pose.armR = [-0.35 + (0.15 * two), -1.9];
            pose.tilt = -0.09 * two;
            pose.nod = 4 * bounce;
            break;
        case 'Sing':
            pose.dip = 5 * bounce;
            pose.sway = two * 3;
            pose.lean = -0.04 + (0.03 * two);
            pose.armL = [1.35 + (0.3 * Math.sin(TAU * p * 2 + 0.6)), 0.45 + (0.2 * bounce)];
            pose.micToMouth = true;
            pose.tilt = -0.07 + (0.06 * two);
            pose.nod = 2.5 * bounce;
            break;
        case 'Hype':
            pose.dip = 11 * bounce;
            pose.sway = two * 5;
            pose.lean = 0.05 * two;
            pose.armL = [2.75 + (0.25 * bounce), -0.5 * bounce];
            pose.armR = [-1.9 - (0.25 * bounce), -0.7];
            pose.tilt = 0.12 * two;
            pose.nod = 8 * bounce;
            break;
        case 'DropJump': {
            // Crouch, spring, hang in the air with knees tucked and arms flung up, land low, recover
            const crouch = p < 0.18 ? p / 0.18 : 0;
            const flight = p >= 0.18 && p < 0.68 ? (p - 0.18) / 0.5 : -1;
            const land = p >= 0.68 ? (p - 0.68) / 0.32 : -1;
            if (crouch) pose.dip = 24 * Math.sin((crouch * Math.PI) / 2);
            if (flight >= 0) {
                pose.air = 78 * Math.sin(flight * Math.PI);
                pose.tuck = 30 * Math.sin(flight * Math.PI);
                pose.armL = [2.5, -0.2];
                pose.armR = [-2.5, 0.2];
                pose.nod = -4;
                pose.tilt = -0.08;
            } else {
                pose.armL = [0.9, 0.6];
                pose.armR = [-0.9, -0.6];
            }
            if (land >= 0) {
                pose.dip = 26 * (1 - land) * (1 - land);
                pose.armL = [1.3 - land, 0.5];
                pose.armR = [-1.3 + land, -0.5];
                pose.nod = 6 * (1 - land);
            }
            break;
        }
        default:
            break;
    }
    return pose;
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const along = (angle, length) => [Math.sin(angle) * length, Math.cos(angle) * length];
const rotate = ([x, y], angle) => [(x * Math.cos(angle)) - (y * Math.sin(angle)), (x * Math.sin(angle)) + (y * Math.cos(angle))];

// The middle joint of a two-bone limb reaching from `start` to `end`, bending towards `side` (+1 / -1)
export function bendJoint(start, end, first, second, side) {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const reach = Math.min(first + second - 0.01, Math.max(Math.abs(first - second) + 0.01, Math.hypot(dx, dy)));
    const along1 = ((first * first) - (second * second) + (reach * reach)) / (2 * reach);
    const lift = Math.sqrt(Math.max(0, (first * first) - (along1 * along1)));
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length;
    const uy = dy / length;
    return [start[0] + (ux * along1) - (uy * lift * side), start[1] + (uy * along1) + (ux * lift * side)];
}

/*
  Joint positions in frame pixels for a pose: feet planted (unless he's in the air), hips dipping
  between them, the chest leaning, and the head on top. Also where his face is, for the patches.
*/
export function skeletonFor(pose) {
    const lift = pose.air;
    const hips = [ORIGIN[0] + pose.sway, BODY.hipY + pose.dip - lift];
    const footY = ORIGIN[1] - lift + pose.tuck - (pose.tuck * 0.2);
    const feet = [
        [ORIGIN[0] - BODY.feet + (pose.sway * 0.2), Math.min(ORIGIN[1], footY - pose.tuck)],
        [ORIGIN[0] + BODY.feet + (pose.sway * 0.2), Math.min(ORIGIN[1], footY - pose.tuck)],
    ];
    const hipL = [hips[0] - BODY.hip, hips[1]];
    const hipR = [hips[0] + BODY.hip, hips[1]];
    // Knees bow outwards, so a dip reads from the front
    const knees = [
        bendJoint(hipL, feet[0], BODY.thigh, BODY.shin, 1),
        bendJoint(hipR, feet[1], BODY.thigh, BODY.shin, -1),
    ];

    const chest = add(hips, along(Math.PI + pose.lean, BODY.torso));
    const shoulders = [
        add(chest, rotate([-BODY.shoulder, 0], pose.lean)),
        add(chest, rotate([BODY.shoulder, 0], pose.lean)),
    ];
    const neck = add(chest, along(Math.PI + (pose.lean * 1.4), BODY.neck));
    const head = add(neck, rotate([0, -(HEAD_HEIGHT / 2) + pose.nod * 0.6], pose.tilt * 0.5));
    head[1] += pose.nod * 0.4;
    const tilt = pose.tilt + (pose.lean * 0.6);
    const mouth = add(head, rotate([0, 22], tilt));
    const eyes = add(head, rotate([0, -2], tilt));

    // Viewer's left arm (his right hand) holds the mic; when singing it reaches up to his mouth
    const handR = pose.micToMouth
        ? add(mouth, [-14, 18])
        : add(add(shoulders[0], along(pose.armR[0], BODY.upperArm)), along(pose.armR[0] + pose.armR[1], BODY.foreArm));
    const elbowR = pose.micToMouth
        ? bendJoint(shoulders[0], handR, BODY.upperArm, BODY.foreArm, 1)
        : add(shoulders[0], along(pose.armR[0], BODY.upperArm));
    const elbowL = add(shoulders[1], along(pose.armL[0], BODY.upperArm));
    const handL = add(elbowL, along(pose.armL[0] + pose.armL[1], BODY.foreArm));

    return { hips, hipL, hipR, feet, knees, chest, shoulders, neck, head, tilt, mouth, eyes, elbows: [elbowR, elbowL], hands: [handR, handL], mic: pose.micToMouth };
}

function inked(ctx, fill, width = INK_WIDTH) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = width;
    ctx.strokeStyle = COLOURS.ink;
    ctx.stroke();
}

// A limb as a thick round-capped stroke with an ink edge: ink first, a bit wider, then the colour
function limb(ctx, points, width, colour) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.strokeStyle = COLOURS.ink;
    ctx.lineWidth = width + (INK_WIDTH * 2);
    ctx.stroke();
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke();
}

function drawShoe(ctx, [x, y], side) {
    ctx.beginPath();
    ctx.ellipse(x + (side * 7), y - 5, 13, 7, side * 0.15, 0, TAU);
    inked(ctx, COLOURS.shoe);
    ctx.beginPath();
    ctx.moveTo(x + (side * 7) - 12, y - 1);
    ctx.lineTo(x + (side * 7) + 12, y - 1);
    ctx.lineWidth = 2.5;
    ctx.stroke();
}

function drawMic(ctx, hand, elbow) {
    const angle = Math.atan2(hand[1] - elbow[1], hand[0] - elbow[0]);
    ctx.save();
    ctx.translate(...hand);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.rect(-4, -4, 20, 8);
    inked(ctx, COLOURS.mic, 2.5);
    ctx.beginPath();
    ctx.arc(20, 0, 7, 0, TAU);
    inked(ctx, COLOURS.grille, 2.5);
    ctx.restore();
}

function drawHand(ctx, [x, y]) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, TAU);
    inked(ctx, COLOURS.skin, 2.5);
}

// The head, at its centre and tilt: ears, face with a flat cel shadow, hair, cap, eyes, nose, closed mouth
function drawHead(ctx, [x, y], tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 31, 6, 7, 10, 0, 0, TAU);
        inked(ctx, COLOURS.skin);
    }
    const face = () => {
        ctx.beginPath();
        ctx.moveTo(-31, -10);
        ctx.bezierCurveTo(-32, 18, -20, 37, 0, 38);
        ctx.bezierCurveTo(20, 37, 32, 18, 31, -10);
        ctx.bezierCurveTo(30, -34, -30, -34, -31, -10);
        ctx.closePath();
    };
    face();
    ctx.fillStyle = COLOURS.skin;
    ctx.fill();
    ctx.save();
    face();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(30, 8, 16, 40, 0.15, 0, TAU);
    ctx.fillStyle = COLOURS.skinShade;
    ctx.fill();
    ctx.restore();
    face();
    ctx.lineWidth = INK_WIDTH;
    ctx.strokeStyle = COLOURS.ink;
    ctx.stroke();

    // Spiky hair poking out under the cap
    ctx.beginPath();
    ctx.moveTo(-33, -14);
    ctx.lineTo(-38, 0);
    ctx.lineTo(-29, -6);
    ctx.lineTo(-31, 6);
    ctx.lineTo(-24, -10);
    ctx.moveTo(33, -14);
    ctx.lineTo(39, -1);
    ctx.lineTo(29, -7);
    ctx.lineTo(30, 5);
    ctx.lineTo(24, -10);
    ctx.fillStyle = COLOURS.hair;
    ctx.fill();

    // Cap: a dome and a brim turned a little to one side
    ctx.beginPath();
    ctx.moveTo(-34, -12);
    ctx.bezierCurveTo(-34, -46, 34, -46, 34, -12);
    ctx.closePath();
    inked(ctx, COLOURS.cap);
    ctx.beginPath();
    ctx.moveTo(4, -40);
    ctx.bezierCurveTo(20, -38, 30, -28, 32, -14);
    ctx.lineTo(24, -14);
    ctx.bezierCurveTo(22, -26, 14, -34, 4, -40);
    ctx.fillStyle = COLOURS.capShade;
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8, -12, 40, 7, -0.04, 0, TAU);
    inked(ctx, COLOURS.cap);
    ctx.beginPath();
    ctx.arc(0, -28, 5, 0, TAU);
    ctx.fillStyle = COLOURS.logo;
    ctx.fill();

    // Eyes: big whites with small pupils and a heavy lid, under thick brows
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 13, -2, 9, 8, 0, 0, TAU);
        inked(ctx, COLOURS.eye, 2.5);
        ctx.beginPath();
        ctx.arc((side * 13) + 1.5, -0.5, 3.5, 0, TAU);
        ctx.fillStyle = COLOURS.ink;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(side * 13, -2, 9.5, 8.5, 0, Math.PI * 1.08, Math.PI * 1.92);
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo((side * 5), -14);
        ctx.quadraticCurveTo(side * 14, -19, side * 23, -14);
        ctx.lineWidth = 4;
        ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(1, 6);
    ctx.quadraticCurveTo(6, 13, 1, 15);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9, 22);
    ctx.quadraticCurveTo(0, 25, 9, 21);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
}

// One body drawing, in frame pixels with the origin at his feet
export function drawFigure(ctx, bones) {
    const { feet, knees, hipL, hipR, hips, shoulders, chest, neck, head, tilt, elbows, hands } = bones;

    for (const [index, side] of [[0, -1], [1, 1]]) {
        const hip = index === 0 ? hipL : hipR;
        limb(ctx, [hip, knees[index], [feet[index][0], feet[index][1] - 8]], 15, COLOURS.jeans);
        drawShoe(ctx, feet[index], side);
    }

    // Torso: a tee over the hips, with a flat shadow down one side and a logo
    const torso = () => {
        ctx.beginPath();
        ctx.moveTo(shoulders[0][0] - 3, shoulders[0][1] - 2);
        ctx.lineTo(shoulders[1][0] + 3, shoulders[1][1] - 2);
        ctx.lineTo(hips[0] + 19, hips[1] + 6);
        ctx.lineTo(hips[0] - 19, hips[1] + 6);
        ctx.closePath();
    };
    limb(ctx, [neck, chest], 10, COLOURS.skin);
    torso();
    ctx.fillStyle = COLOURS.shirt;
    ctx.fill();
    ctx.save();
    torso();
    ctx.clip();
    ctx.beginPath();
    ctx.moveTo(chest[0] + 10, chest[1] - 10);
    ctx.lineTo(chest[0] + 40, chest[1] - 10);
    ctx.lineTo(hips[0] + 30, hips[1] + 10);
    ctx.lineTo(hips[0] + 8, hips[1] + 10);
    ctx.fillStyle = COLOURS.shirtShade;
    ctx.fill();
    ctx.restore();
    torso();
    ctx.lineWidth = INK_WIDTH;
    ctx.strokeStyle = COLOURS.ink;
    ctx.stroke();
    // A lightning bolt on the chest
    const [cx, cy] = [(chest[0] + hips[0]) / 2, (chest[1] + hips[1]) / 2 - 4];
    ctx.beginPath();
    ctx.moveTo(cx + 3, cy - 12);
    ctx.lineTo(cx - 6, cy + 2);
    ctx.lineTo(cx, cy + 2);
    ctx.lineTo(cx - 3, cy + 13);
    ctx.lineTo(cx + 7, cy - 2);
    ctx.lineTo(cx + 1, cy - 2);
    ctx.closePath();
    inked(ctx, COLOURS.ink, 1);

    // Arms: a sleeve then a bare forearm, mic in the near hand
    for (const index of [0, 1]) {
        const sleeveEnd = [
            shoulders[index][0] + ((elbows[index][0] - shoulders[index][0]) * 0.55),
            shoulders[index][1] + ((elbows[index][1] - shoulders[index][1]) * 0.55),
        ];
        limb(ctx, [shoulders[index], elbows[index], hands[index]], 9, COLOURS.skin);
        limb(ctx, [shoulders[index], sleeveEnd], 15, COLOURS.shirt);
        drawHand(ctx, hands[index]);
    }
    drawMic(ctx, hands[0], elbows[0]);
    drawHead(ctx, head, tilt);
}

// The mouth shapes, each drawn round its centre over a patch of skin that hides the body's closed mouth
function drawMouth(ctx, name) {
    ctx.beginPath();
    ctx.ellipse(0, 1, 15, 10, 0, 0, TAU);
    ctx.fillStyle = COLOURS.skin;
    ctx.fill();
    ctx.strokeStyle = COLOURS.ink;
    ctx.fillStyle = COLOURS.mouth;
    if (name === 'closed') {
        ctx.beginPath();
        ctx.moveTo(-9, 0);
        ctx.quadraticCurveTo(0, 3, 9, -1);
        ctx.lineWidth = 2.5;
        ctx.stroke();
        return;
    }
    const [rx, ry] = { small: [7, 4], open: [10, 8.5], round: [6, 8], wide: [13, 5.5] }[name];
    const shape = () => {
        ctx.beginPath();
        ctx.ellipse(0, 1, rx, ry, 0, 0, TAU);
    };
    shape();
    ctx.fill();
    ctx.save();
    shape();
    ctx.clip();
    ctx.fillStyle = COLOURS.teeth;
    ctx.fillRect(-rx, 1 - ry, rx * 2, ry * 0.55);
    if (ry > 6) {
        ctx.beginPath();
        ctx.ellipse(0, 1 + ry, rx * 0.7, ry * 0.6, 0, 0, TAU);
        ctx.fillStyle = COLOURS.tongue;
        ctx.fill();
    }
    ctx.restore();
    shape();
    ctx.lineWidth = 2.5;
    ctx.stroke();
}

// Closed eyelids over both eyes, drawn round the point between them
function drawBlink(ctx) {
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(side * 13, 0, 11.5, 10.5, 0, 0, TAU);
        ctx.fillStyle = COLOURS.skin;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo((side * 13) - 9, 0);
        ctx.quadraticCurveTo(side * 13, 5, (side * 13) + 9, 0);
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = COLOURS.ink;
        ctx.lineCap = 'round';
        ctx.stroke();
    }
}

function defaultCreateCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

const round1 = (value) => Math.round(value * 10) / 10;

/*
  Draws every drawing onto two pages (the four loops on one, the jump and the patches on the other)
  and returns the parsed atlas with those canvases as its page images.
*/
export function buildPlaceholderAtlas({ createCanvas = defaultCreateCanvas } = {}) {
    const loopRows = Math.ceil((LOOP_FRAMES * 4) / COLUMNS);
    const dropRows = Math.ceil(DROP_FRAMES / COLUMNS);
    const patchY = dropRows * CELL[1];
    const pages = [
        createCanvas(COLUMNS * CELL[0], loopRows * CELL[1]),
        createCanvas(COLUMNS * CELL[0], patchY + Math.max(MOUTH_CELL[1], BLINK_CELL[1])),
    ];
    const contexts = pages.map((page) => page.getContext('2d'));
    if (contexts.some((ctx) => !ctx)) throw new Error('Canvas 2D is unavailable');

    const clips = {};
    const drawClip = (name, count, page, first, extra) => {
        const frames = [];
        for (let i = 0; i < count; i++) {
            const cell = first + i;
            const x = (cell % COLUMNS) * CELL[0];
            const y = Math.floor(cell / COLUMNS) * CELL[1];
            const bones = skeletonFor(poseFor(name, i, count));
            const ctx = contexts[page];
            ctx.save();
            ctx.translate(x, y);
            drawFigure(ctx, bones);
            ctx.restore();
            const tilt = round1((bones.tilt * 180) / Math.PI);
            frames.push({
                page,
                rect: [x, y, CELL[0], CELL[1]],
                offset: [0, 0],
                mouth: [round1(bones.mouth[0]), round1(bones.mouth[1]), tilt, 1],
                eyes: [round1(bones.eyes[0]), round1(bones.eyes[1]), tilt, 1],
                head: [round1(bones.head[0]), round1(bones.head[1])],
            });
        }
        clips[name] = { ...extra, frames };
    };
    ['Idle', 'Groove', 'Sing', 'Hype'].forEach((name, index) => drawClip(name, LOOP_FRAMES, 0, index * LOOP_FRAMES, { loop: true, bars: 1 }));
    drawClip('DropJump', DROP_FRAMES, 1, 0, { loop: false, duration: DROP_SECONDS });

    const patches = contexts[1];
    const mouths = {};
    ['closed', 'small', 'open', 'round', 'wide'].forEach((name, index) => {
        const x = index * MOUTH_CELL[0];
        patches.save();
        patches.translate(x + (MOUTH_CELL[0] / 2), patchY + (MOUTH_CELL[1] / 2));
        drawMouth(patches, name);
        patches.restore();
        mouths[name] = { page: 1, rect: [x, patchY, ...MOUTH_CELL], anchor: [MOUTH_CELL[0] / 2, MOUTH_CELL[1] / 2] };
    });
    const blinkX = 5 * MOUTH_CELL[0];
    patches.save();
    patches.translate(blinkX + (BLINK_CELL[0] / 2), patchY + (BLINK_CELL[1] / 2));
    drawBlink(patches);
    patches.restore();

    const json = {
        version: 1,
        fps: 12,
        bpm: BPM,
        frameSize: CELL,
        origin: ORIGIN,
        headHeight: HEAD_HEIGHT,
        pages: ['placeholder-0', 'placeholder-1'],
        clips,
        mouths,
        blink: { page: 1, rect: [blinkX, patchY, ...BLINK_CELL], anchor: [BLINK_CELL[0] / 2, BLINK_CELL[1] / 2] },
    };
    return { atlas: parseAtlas(json), images: pages, source: 'placeholder', json };
}
