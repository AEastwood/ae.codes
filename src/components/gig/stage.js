import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { intensityAt, loudnessAt, pulseAt, recentBeats } from '../../utils/spectrum';
import { beatPosition, lastDrop, sectionAt } from './gigMaths';
import { LIVE_LAYER } from './performer';
import { addOutlines } from './toon';

/*
  The gig around the performer: a giant halftone LED screen showing a live close-up of him over a
  moon and the floating windmill, truss and lamps, amber beam columns, speaker stacks, coloured haze
  and a silhouetted crowd. Everything is driven from the song clock,
  so pausing freezes the whole room and seeking jumps it to the right moment.
*/

const INK = '#060d0d';
// Loudness history the LED wall ripples outward from, like the page's halftone background
const LEVELS = 48;
const LEVEL_STEP = 1 / 30;
const RIPPLE_SPEED = 7;
const WAVES = 6;
const STROBE_SECONDS = 0.8;

// Lighting moods, eased between as the song moves through its sections
const MOODS = {
    quiet: { dot: '#1f6068', hot: '#8cffcd', top: '#08161e', moon: '#8a7620', glow: 0.25, spots: ['#173a4d', '#27757e', '#173a4d'], beams: ['#27757e', '#173a4d'], beam: 0.35, key: 0.9, hemi: 0.3, led: '#1f6068', haze: '#173a4d', hazeAmount: 0.05, column: '#27757e', columns: 0.08 },
    verse: { dot: '#368d82', hot: '#f0d65a', top: '#0b202b', moon: '#d8b71f', glow: 0.5, spots: ['#368d82', '#f0d65a', '#27757e'], beams: ['#8cffcd', '#27757e'], beam: 0.6, key: 1.2, hemi: 0.35, led: '#368d82', haze: '#27757e', hazeAmount: 0.06, column: '#d8b71f', columns: 0.2 },
    // Choruses go warm like the real shows: orange and red haze, amber columns, mint and red beams
    chorus: { dot: '#f0d65a', hot: '#ffffff', top: '#12303f', moon: '#f5d22c', glow: 0.9, spots: ['#ff8a1e', '#8cffcd', '#e8402a'], beams: ['#f0d65a', '#e8402a'], beam: 1, key: 1.4, hemi: 0.4, led: '#d8b71f', haze: '#ff6a1a', hazeAmount: 0.13, column: '#ff8a1e', columns: 0.55 },
    drop: { dot: '#ffffff', hot: '#ffffff', top: '#1f4a56', moon: '#fff4c0', glow: 1.4, spots: ['#ffffff', '#ffffff', '#ffffff'], beams: ['#ffffff', '#f0d65a'], beam: 0.8, key: 1.5, hemi: 0.6, led: '#ffffff', haze: '#ffd9a0', hazeAmount: 0.1, column: '#ffffff', columns: 0.5 },
};

// Same numbers every load, so the crowd and the haze don't reshuffle
function seededRandom(seed) {
    let value = seed;
    return () => {
        value = (value + 0x6d2b79f5) | 0;
        let t = Math.imul(value ^ (value >>> 15), 1 | value);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const HALFTONE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const HALFTONE_FRAGMENT = /* glsl */ `
#define LEVELS ${LEVELS}
#define WAVES ${WAVES}
uniform vec2 uSize;
uniform vec2 uCentre;
uniform float uSpacing;
uniform float uLevels[LEVELS];
uniform vec4 uWaves[WAVES];
uniform vec3 uBase;
uniform vec3 uTop;
uniform vec3 uDot;
uniform vec3 uHot;
uniform vec3 uMoon;
uniform float uMoonRadius;
uniform float uGlow;
uniform float uFlash;
uniform float uDim;
uniform vec3 uInk;
uniform sampler2D uIsland;
uniform sampler2D uSails;
uniform float uIslandOn;
uniform vec2 uIslandCentre;
uniform float uIslandSize;
uniform vec2 uSailsCentre;
uniform float uSailsSize;
uniform float uSailAngle;
uniform sampler2D uLive;
uniform float uLiveOn;
uniform float uLiveSpacing;
uniform float uLiveGain;
uniform float uGlitch;
uniform float uTime;
varying vec2 vUv;

float levelAt(float dist) {
    float index = clamp(dist / ${RIPPLE_SPEED.toFixed(1)} / ${LEVEL_STEP.toFixed(5)}, 0.0, float(LEVELS - 2));
    int i = int(floor(index));
    return mix(uLevels[i], uLevels[i + 1], fract(index));
}

void main() {
    vec2 p = vUv * uSize;
    vec3 colour = mix(uBase, uTop, smoothstep(0.0, 1.0, vUv.y));

    // Halftone screen with every other row offset, each dot sized by the music reaching it
    float row = floor(p.y / uSpacing);
    float shift = mod(row, 2.0) * 0.5 * uSpacing;
    vec2 q = vec2(p.x + shift, p.y);
    vec2 cell = (floor(q / uSpacing) + 0.5) * uSpacing;
    vec2 cellCentre = vec2(cell.x - shift, cell.y);
    float dist = length(cellCentre - uCentre);
    float level = levelAt(dist);

    float shock = 0.0;
    for (int i = 0; i < WAVES; i++) {
        float offset = (dist - uWaves[i].x) / uWaves[i].y;
        shock += exp(-offset * offset) * uWaves[i].z;
    }
    shock /= 1.0 + dist / 8.0;

    float radius = min(uSpacing * 0.5, uSpacing * 0.46 * (0.14 + 0.86 * level * level) + uSpacing * 0.25 * shock);
    float d = length(q - cell);
    float edge = fwidth(d) * 1.2;
    float dotMask = 1.0 - smoothstep(radius - edge, radius + edge, d);
    vec3 dotColour = mix(uDot, uHot, clamp(shock, 0.0, 1.0));
    colour += dotMask * dotColour * (0.12 + 0.88 * level * level + 0.8 * shock) * uDim;

    // The moon: a flat yellow disc shaded with its own coarser halftone, and a glow around it
    if (uMoonRadius > 0.0) {
        vec2 fromMoon = p - uCentre;
        float m = length(fromMoon);
        float moonEdge = fwidth(m) * 1.5;
        float disc = 1.0 - smoothstep(uMoonRadius - moonEdge, uMoonRadius + moonEdge, m);
        float glow = exp(-max(0.0, m - uMoonRadius) / 0.45) * uGlow;
        colour += uMoon * glow * 0.3;

        float shadeSpacing = uSpacing * 0.8;
        vec2 sq = (fract(fromMoon / shadeSpacing) - 0.5) * shadeSpacing;
        float shadeAmount = clamp(dot(fromMoon / uMoonRadius, vec2(0.62, -0.78)), 0.0, 1.0);
        float shadeDot = 1.0 - smoothstep(shadeSpacing * 0.5 * shadeAmount - edge, shadeSpacing * 0.5 * shadeAmount + edge, length(sq));
        vec3 moon = mix(uMoon, uMoon * 0.55, shadeDot) * (0.75 + 0.35 * uGlow);
        colour = mix(colour, moon, disc);
    }

    // The floating windmill island off to one side, its sails turning
    if (uIslandOn > 0.5) {
        vec2 islandUv = (p - uIslandCentre) / uIslandSize + 0.5;
        if (all(greaterThan(islandUv, vec2(0.0))) && all(lessThan(islandUv, vec2(1.0)))) {
            colour = mix(colour, uInk, texture2D(uIsland, islandUv).a);
        }
        vec2 fromHub = (p - uSailsCentre) / uSailsSize;
        float c = cos(uSailAngle);
        float sn = sin(uSailAngle);
        vec2 sailsUv = vec2(c * fromHub.x - sn * fromHub.y, sn * fromHub.x + c * fromHub.y) + 0.5;
        if (all(greaterThan(sailsUv, vec2(0.0))) && all(lessThan(sailsUv, vec2(1.0)))) {
            colour = mix(colour, uInk, texture2D(uSails, sailsUv).a);
        }
    }

    // The live camera feed, shown as a finer screen of full-colour LEDs over everything else.
    // Strong downbeats tear a few bands of it sideways like a glitching video wall
    if (uLiveOn > 0.0) {
        float band = floor(vUv.y * 28.0);
        float tear = fract(sin(band * 91.7 + floor(uTime * 12.0) * 13.1) * 43758.5);
        float glitch = tear > 0.82 ? (tear - 0.91) * uGlitch * 1.6 : 0.0;
        vec2 lp = vec2(p.x + glitch * uSize.x * 0.1, p.y);
        float liveShift = mod(floor(lp.y / uLiveSpacing), 2.0) * 0.5 * uLiveSpacing;
        vec2 lq = vec2(lp.x + liveShift, lp.y);
        vec2 liveCell = (floor(lq / uLiveSpacing) + 0.5) * uLiveSpacing;
        vec4 live = texture2D(uLive, vec2(liveCell.x - liveShift, liveCell.y) / uSize);
        float presence = clamp(live.a, 0.0, 1.0) * uLiveOn;
        float bright = max(live.r, max(live.g, live.b));
        float liveRadius = uLiveSpacing * 0.5 * (0.62 + 0.38 * smoothstep(0.02, 0.35, bright));
        float liveDistance = length(lq - liveCell);
        float liveEdge = fwidth(liveDistance) * 1.2;
        float liveDot = 1.0 - smoothstep(liveRadius - liveEdge, liveRadius + liveEdge, liveDistance);
        colour = mix(colour, uBase, presence * 0.92);
        colour += liveDot * presence * live.rgb * uLiveGain;
    }

    // Darker towards the edges of the wall, like it's lit from the middle
    vec2 fromMiddle = (vUv - 0.5) * vec2(1.4, 1.0);
    colour *= 1.0 - 0.55 * dot(fromMiddle, fromMiddle) * 2.0;
    colour += uFlash;
    gl_FragColor = vec4(colour, 1.0);
    #include <colorspace_fragment>
}`;

// Stand-in for textures a halftone panel doesn't use
const BLANK = new THREE.DataTexture(new Uint8Array(4), 1, 1);
BLANK.needsUpdate = true;

function createHalftoneMaterial({ size, centre, spacing, moonRadius = 0 }) {
    return new THREE.ShaderMaterial({
        vertexShader: HALFTONE_VERTEX,
        fragmentShader: HALFTONE_FRAGMENT,
        uniforms: {
            uSize: { value: new THREE.Vector2(...size) },
            uCentre: { value: new THREE.Vector2(...centre) },
            uSpacing: { value: spacing },
            uLevels: { value: new Float32Array(LEVELS) },
            uWaves: { value: Array.from({ length: WAVES }, () => new THREE.Vector4(0, 1, 0, 0)) },
            uBase: { value: new THREE.Color(INK) },
            uTop: { value: new THREE.Color('#0d2633') },
            uDot: { value: new THREE.Color('#368d82') },
            uHot: { value: new THREE.Color('#f0d65a') },
            uMoon: { value: new THREE.Color('#d8b71f') },
            uMoonRadius: { value: moonRadius },
            uGlow: { value: 0.5 },
            uFlash: { value: 0 },
            uDim: { value: 1 },
            uInk: { value: new THREE.Color(INK) },
            uIsland: { value: BLANK },
            uSails: { value: BLANK },
            uIslandOn: { value: 0 },
            uIslandCentre: { value: new THREE.Vector2() },
            uIslandSize: { value: 1 },
            uSailsCentre: { value: new THREE.Vector2() },
            uSailsSize: { value: 1 },
            uSailAngle: { value: 0 },
            uLive: { value: BLANK },
            uLiveOn: { value: 0 },
            uLiveSpacing: { value: spacing * 0.5 },
            uLiveGain: { value: 1.8 },
            uGlitch: { value: 0 },
            uTime: { value: 0 },
        },
    });
}

// Light beams: a hollow cone glowing brightest at the lamp and towards its middle, added onto the scene
const BEAM_VERTEX = /* glsl */ `
varying float vAlong;
varying float vFacing;
void main() {
    vAlong = uv.y;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vec3 viewNormal = normalize(normalMatrix * normal);
    vFacing = abs(dot(viewNormal, normalize(-viewPosition.xyz)));
    gl_Position = projectionMatrix * viewPosition;
}`;

const BEAM_FRAGMENT = /* glsl */ `
uniform vec3 uColour;
uniform float uStrength;
varying float vAlong;
varying float vFacing;
void main() {
    float alpha = pow(vAlong, 1.6) * pow(vFacing, 2.0) * uStrength;
    gl_FragColor = vec4(uColour * alpha, 1.0);
    #include <colorspace_fragment>
}`;

function createBeam(radius, length) {
    const geometry = new THREE.ConeGeometry(radius, length, 36, 1, true);
    // Apex at the origin pointing down +Z, so lookAt aims it
    geometry.translate(0, -length / 2, 0);
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.ShaderMaterial({
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        uniforms: { uColour: { value: new THREE.Color('#ffffff') }, uStrength: { value: 0.5 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 5;
    return mesh;
}

function canvasTexture(size, draw) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    draw(canvas.getContext('2d'), size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}

// The Feel Good Inc. floating island: a rocky lump with a windmill tower on top
function drawIsland(ctx, s) {
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.moveTo(s * 0.12, s * 0.62);
    ctx.bezierCurveTo(s * 0.2, s * 0.57, s * 0.32, s * 0.6, s * 0.42, s * 0.58);
    ctx.bezierCurveTo(s * 0.55, s * 0.56, s * 0.7, s * 0.6, s * 0.88, s * 0.6);
    ctx.lineTo(s * 0.8, s * 0.7);
    ctx.lineTo(s * 0.7, s * 0.74);
    ctx.lineTo(s * 0.62, s * 0.86);
    ctx.lineTo(s * 0.52, s * 0.82);
    ctx.lineTo(s * 0.46, s * 0.97);
    ctx.lineTo(s * 0.4, s * 0.8);
    ctx.lineTo(s * 0.3, s * 0.76);
    ctx.lineTo(s * 0.22, s * 0.68);
    ctx.closePath();
    ctx.fill();
    // Grass tufts along the top
    for (let i = 0; i < 26; i++) {
        const x = s * (0.14 + i * 0.028);
        ctx.beginPath();
        ctx.moveTo(x, s * 0.6);
        ctx.lineTo(x + s * 0.008, s * (0.565 - (i % 3) * 0.008));
        ctx.lineTo(x + s * 0.02, s * 0.6);
        ctx.fill();
    }
    // Tower, cap and a lit window
    ctx.beginPath();
    ctx.moveTo(s * 0.47, s * 0.59);
    ctx.lineTo(s * 0.5, s * 0.3);
    ctx.lineTo(s * 0.58, s * 0.3);
    ctx.lineTo(s * 0.61, s * 0.59);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(s * 0.48, s * 0.31);
    ctx.lineTo(s * 0.54, s * 0.25);
    ctx.lineTo(s * 0.6, s * 0.31);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f0d65a';
    ctx.fillRect(s * 0.535, s * 0.42, s * 0.018, s * 0.03);
}

function drawSails(ctx, s) {
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = s * 0.012;
    ctx.translate(s / 2, s / 2);
    for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.rotate((i * Math.PI) / 2);
        ctx.fillRect(-s * 0.012, 0, s * 0.024, s * 0.47);
        // Lattice sail on one side of each arm
        ctx.strokeRect(s * 0.012, s * 0.1, s * 0.08, s * 0.36);
        for (let j = 1; j < 7; j++) {
            ctx.beginPath();
            ctx.moveTo(s * 0.012, s * (0.1 + j * 0.052));
            ctx.lineTo(s * 0.092, s * (0.1 + j * 0.052));
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.03, 0, Math.PI * 2);
    ctx.fill();
}

function drawHaze(ctx, s) {
    const random = seededRandom(7);
    for (let i = 0; i < 40; i++) {
        const x = s * (0.1 + random() * 0.8);
        const y = s * (0.3 + random() * 0.4);
        const r = s * (0.08 + random() * 0.18);
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, s, s);
    }
}

function drawSoftDisc(ctx, s) {
    const gradient = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.45)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, s, s);
}

// A box truss: four chords with zig-zag bracing, built along +X from the origin
function trussGeometry(length, size = 0.28, tube = 0.022) {
    const parts = [];
    const half = size / 2;
    const chord = (y, z) => {
        const geometry = new THREE.CylinderGeometry(tube, tube, length, 6);
        geometry.rotateZ(Math.PI / 2);
        geometry.translate(length / 2, y, z);
        parts.push(geometry);
    };
    chord(half, half);
    chord(half, -half);
    chord(-half, half);
    chord(-half, -half);
    const step = size;
    for (let x = 0; x < length - 0.01; x += step) {
        for (const [y1, z1, y2, z2] of [[half, half, -half, half], [half, -half, -half, -half], [half, half, half, -half], [-half, half, -half, -half]]) {
            const from = new THREE.Vector3(x, y1, z1);
            const to = new THREE.Vector3(Math.min(length, x + step), y2, z2);
            const brace = new THREE.CylinderGeometry(tube * 0.6, tube * 0.6, from.distanceTo(to), 4);
            brace.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize()));
            brace.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
            parts.push(brace);
        }
    }
    const merged = mergeGeometries(parts.map((geometry) => geometry.toNonIndexed()));
    parts.forEach((geometry) => geometry.dispose());
    return merged;
}

function toon(colour, gradientMap) {
    return new THREE.MeshToonMaterial({ color: colour, gradientMap });
}

function buildSpeakerStack(gradientMap, flip) {
    const group = new THREE.Group();
    const cabinet = toon('#141c20', gradientMap);
    const coneMaterial = toon('#26323a', gradientMap);
    const capMaterial = toon('#0b1114', gradientMap);
    const woofers = [];
    const boxes = [[1, 0.8, 0.75, 0.4], [1, 0.8, 0.75, 1.2], [0.85, 0.45, 0.65, 1.825]];
    for (const [w, h, d, y] of boxes) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cabinet);
        box.position.y = y;
        group.add(box);
        const count = h > 0.6 ? 2 : 1;
        for (let i = 0; i < count; i++) {
            const radius = h > 0.6 ? 0.2 : 0.14;
            const woofer = new THREE.Group();
            const cone = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.6, 0.06, 24), coneMaterial);
            cone.rotation.x = Math.PI / 2;
            const cap = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.32, 12, 8), capMaterial);
            cap.scale.z = 0.5;
            cap.position.z = 0.03;
            woofer.add(cone, cap);
            woofer.position.set(count === 2 ? (i - 0.5) * 0.46 : 0, y, d / 2 + 0.01);
            group.add(woofer);
            woofers.push(woofer);
        }
    }
    group.rotation.y = flip ? -0.25 : 0.25;
    return { group, woofers };
}

function buildCrowd(count, random) {
    const body = mergeGeometries([
        new THREE.SphereGeometry(0.13, 12, 10).scale(0.9, 1.05, 0.95).translate(0, 1.58, 0),
        new THREE.CapsuleGeometry(0.2, 0.55, 4, 10).scale(1.15, 1, 0.6).translate(0, 1.05, 0),
        new THREE.CylinderGeometry(0.07, 0.08, 0.14, 8).translate(0, 1.42, 0),
    ]);
    const arm = new THREE.CapsuleGeometry(0.034, 0.5, 4, 6).translate(0, -0.28, 0);
    const material = new THREE.MeshBasicMaterial({ color: '#020606', fog: false });
    const bodies = new THREE.InstancedMesh(body, material, count);
    const arms = new THREE.InstancedMesh(arm, material, count * 2);
    const people = [];

    for (let i = 0; i < count; i++) {
        // Rows packed tighter towards the stage barrier
        const row = Math.floor(i / 14);
        people.push({
            x: ((i % 14) - 6.5) * 0.78 + (random() - 0.5) * 0.5 + (row % 2) * 0.39,
            z: 3.05 + row * 0.75 + random() * 0.3,
            scale: 0.92 + random() * 0.18,
            turn: (random() - 0.5) * 0.6,
            phase: random(),
            eager: random(),
            wave: random() * Math.PI * 2,
        });
    }
    return { bodies, arms, people };
}

export function createStage({ gradientMap, reduceMotion, liveTexture = null }) {
    const group = new THREE.Group();
    group.name = 'Stage';
    const random = seededRandom(1984);

    // Lights: soft fill, a warm key for the toon bands, a mint rim from behind, and three truss spots
    const hemi = new THREE.HemisphereLight('#27757e', INK, 0.6);
    const key = new THREE.DirectionalLight('#fff1d0', 1.2);
    key.position.set(2.5, 4, 6);
    const rim = new THREE.DirectionalLight('#8cffcd', 1.4);
    rim.position.set(-1, 3, -5);
    group.add(hemi, key, key.target, rim, rim.target);
    // The screen's live camera only sees him, but he still needs lighting in its shot
    [hemi, key, rim].forEach((light) => light.layers.enable(LIVE_LAYER));
    key.target.position.set(0, 1, 0);
    rim.target.position.set(0, 1, 0);

    const spotPositions = [[-2.6, 3.5, 1.6], [0, 3.7, 1.9], [2.6, 3.5, 1.6]];
    const spots = spotPositions.map((position) => {
        const spot = new THREE.SpotLight('#ffffff', 6, 0, 0.3, 0.6, 1.5);
        spot.position.set(...position);
        spot.target.position.set(0, 0.6, 0);
        spot.layers.enable(LIVE_LAYER);
        group.add(spot, spot.target);
        return spot;
    });

    // Stage deck with a halftone LED front and a glowing lip
    const deck = new THREE.Mesh(new THREE.BoxGeometry(13, 1.2, 6.5), toon('#0b161b', gradientMap));
    deck.position.set(0, -0.6, -1.15);
    group.add(deck);
    const ledFront = new THREE.Mesh(
        new THREE.PlaneGeometry(13, 1.1),
        createHalftoneMaterial({ size: [13, 1.1], centre: [6.5, 0.55], spacing: 0.11 }),
    );
    ledFront.position.set(0, -0.6, 2.105);
    ledFront.material.uniforms.uDim.value = 0.75;
    group.add(ledFront);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(13, 0.05, 0.06), new THREE.MeshBasicMaterial({ color: '#d8b71f' }));
    lip.position.set(0, 0.0, 2.1);
    group.add(lip);
    const pit = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.MeshBasicMaterial({ color: '#030808' }));
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(0, -1.2, 9);
    group.add(pit);

    // A giant LED screen behind him, a 16:9 panel in a black bezel against a black back wall.
    // It shows the live camera feed over the moon (a halo right behind his head) and the windmill island
    const back = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), new THREE.MeshBasicMaterial({ color: '#04090a' }));
    back.position.set(0, 5, -4.7);
    const screenSize = [10, 5.625];
    const screen = new THREE.Mesh(
        new THREE.PlaneGeometry(...screenSize),
        createHalftoneMaterial({ size: screenSize, centre: [5, 3.45], spacing: 0.17, moonRadius: 1.5 }),
    );
    screen.position.set(0, 3.6, -4.3);
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(screenSize[0] + 0.36, screenSize[1] + 0.36, 0.2), toon('#0c1316', gradientMap));
    bezel.position.set(0, 3.6, -4.42);
    group.add(back, bezel, screen);

    const islandTexture = canvasTexture(512, drawIsland);
    const sailsTexture = canvasTexture(512, drawSails);
    const screenUniforms = screen.material.uniforms;
    screenUniforms.uIsland.value = islandTexture;
    screenUniforms.uSails.value = sailsTexture;
    screenUniforms.uIslandOn.value = 1;
    screenUniforms.uIslandCentre.value.set(8.25, 2.6);
    screenUniforms.uIslandSize.value = 3;
    // The hub sits at the top of the tower in the island drawing
    screenUniforms.uSailsCentre.value.set(8.25 + 3 * 0.04, 2.6 + 3 * 0.21);
    screenUniforms.uSailsSize.value = 1.75;
    if (liveTexture) screenUniforms.uLive.value = liveTexture;

    // Truss: a front span over the stage and two towers
    const trussMaterial = toon('#2a3439', gradientMap);
    const span = new THREE.Mesh(trussGeometry(10.4), trussMaterial);
    span.position.set(-5.2, 3.95, 1.75);
    const towers = [-5.2, 5.2].map((x) => {
        const tower = new THREE.Mesh(trussGeometry(3.95), trussMaterial);
        tower.rotation.z = Math.PI / 2;
        tower.position.set(x, 0, 1.75);
        return tower;
    });
    group.add(span, ...towers);

    // Lamp cans hanging off the truss
    const canMaterial = toon('#11181b', gradientMap);
    const lensMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const lenses = [];
    for (const position of spotPositions) {
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.34, 14), canMaterial);
        can.position.set(position[0], position[1], position[2]);
        can.lookAt(0, 0.6, 0);
        can.rotateX(Math.PI / 2);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), lensMaterial.clone());
        lens.position.y = -0.172;
        lens.rotation.x = Math.PI / 2;
        can.add(lens);
        lenses.push(lens);
        group.add(can);
    }

    // Beams: three from the front truss onto him, four from behind the wall raking out over the crowd
    const beams = [];
    spotPositions.forEach((position, index) => {
        const beam = createBeam(0.75, 4.6);
        beam.position.set(...position);
        beams.push({ mesh: beam, from: position, aim: [0, 0, 0.1], front: true, index });
        group.add(beam);
    });
    [-4.2, -1.6, 1.6, 4.2].forEach((x, index) => {
        const beam = createBeam(0.9, 13);
        beam.position.set(x, 5.6, -4.2);
        beams.push({ mesh: beam, from: [x, 5.6, -4.2], aim: [x * 1.4, -1.2, 7], front: false, index });
        group.add(beam);
    });

    // Amber columns pouring down either side of the screen, like the wash at the real shows
    const columns = [-9.4, -8.1, -6.8, -5.7, 5.7, 6.8, 8.1, 9.4].map((x, index) => {
        const beam = createBeam(1, 10.5);
        beam.position.set(x, 8.5, -3.9);
        beam.lookAt(x * 0.92, -1, -2.6);
        group.add(beam);
        return { mesh: beam, index };
    });

    // Speaker stacks either side, plus a monitor wedge at his feet
    const speakers = [-3.75, 3.75].map((x) => {
        const stack = buildSpeakerStack(gradientMap, x > 0);
        stack.group.position.set(x, 0, 0.6);
        group.add(stack.group);
        return stack;
    });
    const wedges = [-0.75, 0.75].map((x) => {
        const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.45), toon('#141c20', gradientMap));
        wedge.position.set(x, 0.14, 1.45);
        wedge.rotation.set(-0.5, x > 0 ? -0.25 : 0.25, 0);
        group.add(wedge);
        return wedge;
    });

    // Ink outlines on the stage pieces, before the glowing bits are added
    const outlineMaterials = [
        ...addOutlines(span, 0.012),
        ...towers.flatMap((tower) => addOutlines(tower, 0.012)),
        ...speakers.flatMap((stack) => addOutlines(stack.group, 0.014)),
        ...wedges.flatMap((wedge) => addOutlines(wedge, 0.012)),
    ];

    // A pool of light and a contact shadow under him
    const discTexture = canvasTexture(128, drawSoftDisc);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: discTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#f0d65a', opacity: 0.35 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.006, 0.2);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), new THREE.MeshBasicMaterial({ map: discTexture, transparent: true, depthWrite: false, color: '#000000', opacity: 0.75 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.01, 0.02);
    group.add(pool, shadow);

    // Haze drifting through the beams
    const hazeTexture = canvasTexture(256, drawHaze);
    const haze = [[-1.8, 1.6, -2.4, 14, 6], [0.5, 1.2, -0.6, 12, 5], [1, 0.4, 1.8, 16, 3.5]].map(([x, y, z, w, h], index) => {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: hazeTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, fog: false }));
        plane.position.set(x, y, z);
        plane.renderOrder = 4;
        group.add(plane);
        return { plane, x, speed: 0.05 + index * 0.03 };
    });

    const crowd = buildCrowd(56, random);
    crowd.bodies.renderOrder = 6;
    crowd.arms.renderOrder = 6;
    group.add(crowd.bodies, crowd.arms);

    // The current, eased version of the mood
    const mood = {
        dot: new THREE.Color(MOODS.verse.dot),
        hot: new THREE.Color(MOODS.verse.hot),
        top: new THREE.Color(MOODS.verse.top),
        moon: new THREE.Color(MOODS.verse.moon),
        haze: new THREE.Color(MOODS.verse.haze),
        column: new THREE.Color(MOODS.verse.column),
        led: new THREE.Color(MOODS.verse.led),
        spots: MOODS.verse.spots.map((colour) => new THREE.Color(colour)),
        beams: MOODS.verse.beams.map((colour) => new THREE.Color(colour)),
        glow: 0.5,
        beam: 0.6,
        key: 1.2,
        hemi: 0.6,
        hazeAmount: 0.06,
        columns: 0.2,
        live: 0,
        hands: 0,
    };
    const scratch = new THREE.Color();
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const aim = new THREE.Vector3();
    const halftones = [screenUniforms, ledFront.material.uniforms];

    function update({ time, dt, analysis, live = false }) {
        const level = analysis ? loudnessAt(analysis.loudness, time) : 0.3;
        const intensity = analysis ? intensityAt(analysis, time) : 0.5;
        const pulse = analysis ? pulseAt(analysis, time) : { beat: 0, bar: 0 };
        const sinceDrop = analysis ? lastDrop(time, analysis.drops).age : Infinity;
        const section = sectionAt(intensity, sinceDrop);
        const target = MOODS[section];
        const ease = 1 - Math.exp(-dt * (section === 'drop' ? 14 : 2.5));
        const { beat, phase: beatPhase } = beatPosition(time);

        mood.dot.lerp(scratch.set(target.dot), ease);
        mood.hot.lerp(scratch.set(target.hot), ease);
        mood.top.lerp(scratch.set(target.top), ease);
        mood.moon.lerp(scratch.set(target.moon), ease);
        mood.led.lerp(scratch.set(target.led), ease);
        mood.haze.lerp(scratch.set(target.haze), ease);
        mood.column.lerp(scratch.set(target.column), ease);
        mood.spots.forEach((colour, i) => colour.lerp(scratch.set(target.spots[i]), ease));
        mood.beams.forEach((colour, i) => colour.lerp(scratch.set(target.beams[i]), ease));
        for (const name of ['glow', 'beam', 'key', 'hemi', 'hazeAmount', 'columns']) mood[name] += (target[name] - mood[name]) * ease;
        mood.live += ((live ? 1 : 0) - mood.live) * (1 - Math.exp(-dt * 3));
        const handsUp = section === 'chorus' || section === 'drop' ? 0.6 : intensity > 0.6 ? 0.2 : 0;
        mood.hands += (handsUp - mood.hands) * (1 - Math.exp(-dt * 1.5));

        // White strobe for a moment after each drop (a single soft flash when motion is reduced)
        let flash = 0;
        if (sinceDrop < STROBE_SECONDS) {
            const fade = (1 - sinceDrop / STROBE_SECONDS) ** 2;
            flash = reduceMotion ? fade * 0.15 : fade * (Math.floor(sinceDrop * 18) % 2 === 0 ? 0.9 : 0.1);
        }

        // LED wall: loudness history rippling out from the moon, rings on the strong kicks
        for (const uniforms of halftones) {
            const levels = uniforms.uLevels.value;
            for (let i = 0; i < LEVELS; i++) levels[i] = analysis ? loudnessAt(analysis.loudness, time - i * LEVEL_STEP) : 0.25;
            const waves = uniforms.uWaves.value;
            const recent = analysis && !reduceMotion ? recentBeats(analysis, time, 2.2).filter((beat) => beat.strength > 0.35).slice(-WAVES) : [];
            waves.forEach((wave, i) => {
                const beat = recent[i];
                if (!beat) {
                    wave.set(0, 1, 0, 0);
                    return;
                }
                const age = time - beat.time;
                wave.set(age * 9, 0.45, beat.strength * (beat.downbeat ? 1.1 : 0.6) * (1 - age / 2.2), 0);
            });
            uniforms.uDot.value.copy(mood.dot);
            uniforms.uHot.value.copy(mood.hot);
            uniforms.uTop.value.copy(mood.top);
            uniforms.uMoon.value.copy(mood.moon);
            uniforms.uGlow.value = mood.glow * (0.8 + 0.5 * pulse.beat);
            uniforms.uFlash.value = flash * 0.07;
        }
        ledFront.material.uniforms.uDot.value.copy(mood.led);
        screenUniforms.uMoonRadius.value = 1.5 * (1 + 0.03 * pulse.bar);
        screenUniforms.uLiveOn.value = mood.live;
        screenUniforms.uGlitch.value = reduceMotion ? 0 : Math.max(0, pulse.bar - 0.3) + flash;
        screenUniforms.uTime.value = time;

        // The windmill turns with the song, kicking forward a little on every beat
        screenUniforms.uSailAngle.value = time * 0.35 + (reduceMotion ? 0 : 0.05 * Math.sin(beatPhase * Math.PI));

        // Columns breathe with the loudness, some flaring red on alternate beats in the choruses
        columns.forEach(({ mesh, index }) => {
            const uniforms = mesh.material.uniforms;
            uniforms.uColour.value.copy(mood.column);
            if (section === 'chorus' && (index + beat) % 3 === 0) uniforms.uColour.value.lerp(scratch.set('#e8402a'), 0.7);
            uniforms.uStrength.value = mood.columns * (0.12 + 0.12 * level + 0.08 * pulse.beat) + flash * 0.03;
        });

        hemi.intensity = mood.hemi + flash * 0.6;
        key.intensity = mood.key * (0.85 + 0.25 * level);
        rim.color.copy(mood.beams[0]);
        rim.intensity = 1 + 0.8 * pulse.beat;
        lip.material.color.copy(mood.led).multiplyScalar(0.7 + 0.6 * pulse.beat);

        // Spots: the side lamps swap colours on every beat in the choruses
        const swap = section === 'chorus' && beat % 2 === 1;
        spots.forEach((spot, i) => {
            const colour = mood.spots[swap ? 2 - i : i];
            spot.color.copy(colour);
            spot.intensity = (i === 1 ? 6 : 4) * (0.6 + 0.3 * mood.beam + 0.4 * pulse.beat) + flash * 4;
            lenses[i].material.color.copy(colour).multiplyScalar(1.2);
        });

        // Beams sway gently in the verses and sweep wide in the choruses
        const sweep = (section === 'chorus' || section === 'drop' ? 1 : 0.25) * (reduceMotion ? 0.3 : 1);
        for (const beam of beams) {
            const t = time * (reduceMotion ? 0.25 : 0.6) + beam.index * 1.7;
            if (beam.front) {
                aim.set(beam.aim[0] + Math.sin(t) * 0.4 * sweep, beam.aim[1], beam.aim[2] + Math.cos(t * 0.8) * 0.3 * sweep);
            } else {
                aim.set(beam.aim[0] + Math.sin(t) * 4 * sweep, beam.aim[1], beam.aim[2] + Math.cos(t * 0.7) * 2 * sweep);
            }
            beam.mesh.lookAt(aim);
            const colour = beam.front ? mood.spots[swap ? 2 - beam.index : beam.index] : mood.beams[beam.index % 2];
            beam.mesh.material.uniforms.uColour.value.copy(colour);
            const back = beam.front ? 0.17 : 0.09 * (0.4 + intensity);
            beam.mesh.material.uniforms.uStrength.value = back * mood.beam * (0.75 + 0.5 * pulse.beat) + flash * 0.04;
        }

        pool.material.color.copy(mood.spots[1]);
        pool.material.opacity = 0.16 + 0.16 * level + flash * 0.2;

        speakers.forEach(({ woofers }) => woofers.forEach((woofer) => {
            woofer.scale.setScalar(1 + (reduceMotion ? 0 : 0.08 * pulse.beat));
        }));

        haze.forEach(({ plane, x, speed }) => {
            plane.position.x = x + Math.sin(time * speed) * 1.2;
            plane.material.color.copy(mood.haze);
            plane.material.opacity = mood.hazeAmount * (0.8 + 0.4 * level);
        });

        // Crowd bobbing on the beat, more of them throwing their hands up as the song lifts
        const bounce = reduceMotion ? 0 : 0.03 + 0.07 * intensity;
        crowd.people.forEach((person, i) => {
            const local = (beatPhase + person.phase * 0.25) % 1;
            const bob = bounce * (1 - Math.abs(Math.sin(Math.PI * local)));
            position.set(person.x, -1.2 + bob, person.z);
            quaternion.setFromEuler(euler.set(0, person.turn, 0));
            scale.setScalar(person.scale);
            matrix.compose(position, quaternion, scale);
            crowd.bodies.setMatrixAt(i, matrix);

            const raised = person.eager < mood.hands ? 1 : 0;
            for (const side of [-1, 1]) {
                const waveAngle = reduceMotion ? 0 : Math.sin(time * 3 + person.wave + side) * 0.25;
                const angle = raised ? side * (2.7 + waveAngle) : side * 0.12;
                position.set(person.x + side * 0.2 * person.scale, -1.2 + bob + 1.32 * person.scale, person.z);
                quaternion.setFromEuler(euler.set(0, person.turn, angle));
                matrix.compose(position, quaternion, scale);
                crowd.arms.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), matrix);
            }
        });
        crowd.bodies.instanceMatrix.needsUpdate = true;
        crowd.arms.instanceMatrix.needsUpdate = true;

        return { section, flash, pulse, intensity, level };
    }

    return {
        group,
        update,
        dispose() {
            outlineMaterials.forEach((material) => material.dispose());
            crowd.bodies.dispose();
            crowd.arms.dispose();
        },
    };
}
