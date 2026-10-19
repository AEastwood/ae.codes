import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BAR_SECONDS } from './gigMaths';

/*
  A stand-in performer built from primitives, used until (or if) the real model fails to load.
  It follows the same contract as public/models/adam-gorillaz.glb: a skinned figure ~1.8 units tall,
  feet at y=0 facing +Z, mic in the right hand, morphs mouthOpen/mouthRound/mouthWide/blink and
  the Idle/Groove/Sing/Hype (one bar each) and DropJump clips.
*/

const COLOURS = {
    skin: '#368d82',
    skinShade: '#27757e',
    stubble: '#1f4f4a',
    cap: '#11171a',
    shirt: '#151b1e',
    logo: '#d8b71f',
    jeans: '#1d3346',
    shoe: '#e9e4d4',
    sole: '#11171a',
    eye: '#f3efdf',
    pupil: '#060d0d',
    mouth: '#2a0d18',
    mic: '#1b1f22',
    grille: '#a9b4b4',
};

// Bone name, parent, rest position in world space. Left is +X since he faces +Z
const BONES = [
    ['Hips', null, [0, 0.95, 0]],
    ['Spine', 'Hips', [0, 1.08, 0]],
    ['Chest', 'Spine', [0, 1.28, 0]],
    ['Neck', 'Chest', [0, 1.47, 0]],
    ['Head', 'Neck', [0, 1.55, 0]],
    ['UpperArmL', 'Chest', [0.21, 1.42, 0]],
    ['ForeArmL', 'UpperArmL', [0.23, 1.14, 0]],
    ['HandL', 'ForeArmL', [0.24, 0.9, 0]],
    ['UpperArmR', 'Chest', [-0.21, 1.42, 0]],
    ['ForeArmR', 'UpperArmR', [-0.23, 1.14, 0]],
    ['HandR', 'ForeArmR', [-0.24, 0.9, 0]],
    ['UpperLegL', 'Hips', [0.1, 0.92, 0]],
    ['LowerLegL', 'UpperLegL', [0.1, 0.5, 0]],
    ['FootL', 'LowerLegL', [0.1, 0.09, 0]],
    ['UpperLegR', 'Hips', [-0.1, 0.92, 0]],
    ['LowerLegR', 'UpperLegR', [-0.1, 0.5, 0]],
    ['FootR', 'LowerLegR', [-0.1, 0.09, 0]],
];
const BONE_INDEX = Object.fromEntries(BONES.map(([name], index) => [name, index]));

function buildSkeleton() {
    const bones = [];
    const byName = {};
    for (const [name, parent, position] of BONES) {
        const bone = new THREE.Bone();
        bone.name = name;
        const world = new THREE.Vector3(...position);
        if (parent) {
            const parentWorld = new THREE.Vector3(...BONES[BONE_INDEX[parent]][2]);
            bone.position.copy(world.sub(parentWorld));
            byName[parent].add(bone);
        } else {
            bone.position.copy(world);
        }
        bones.push(bone);
        byName[name] = bone;
    }
    return { bones, byName };
}

/*
  Body parts as [geometry, bone, colour, tag]. Each part moves rigidly with one bone, and is placed
  in rest-pose world space. Tags mark the parts the face morphs need to find again after merging.
*/
function buildParts() {
    const parts = [];
    const add = (geometry, bone, colour, transform = {}, tag = null) => {
        const { position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1] } = transform;
        const matrix = new THREE.Matrix4().compose(
            new THREE.Vector3(...position),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
            new THREE.Vector3(...scale),
        );
        geometry.applyMatrix4(matrix);
        parts.push({ geometry, bone, colour, tag });
    };
    const limb = (radius, from, to) => new THREE.CapsuleGeometry(radius, Math.max(0.01, Math.hypot(from[0] - to[0], from[1] - to[1]) - radius), 4, 10);
    const mid = (a, b) => a.map((value, i) => (value + b[i]) / 2);

    // Head: a long Gorillaz-style face, backwards cap, sleepy eyes and stubble
    add(new THREE.SphereGeometry(0.15, 28, 20), 'Head', COLOURS.skin, { position: [0, 1.69, 0.01], scale: [0.95, 1.18, 1] });
    add(new THREE.SphereGeometry(0.152, 24, 14, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), 'Head', COLOURS.stubble, { position: [0, 1.7, 0.012], scale: [0.96, 1.2, 1.02] });
    add(new THREE.SphereGeometry(0.156, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), 'Head', COLOURS.cap, { position: [0, 1.72, -0.005], scale: [1, 1.1, 1.04], rotation: [-0.25, 0, 0] });
    add(new THREE.CylinderGeometry(0.1, 0.11, 0.015, 20, 1, false, 0, Math.PI), 'Head', COLOURS.cap, { position: [0, 1.79, -0.14], rotation: [-0.35, Math.PI / 2, 0], scale: [1, 1, 0.8] });
    add(new THREE.CapsuleGeometry(0.018, 0.05, 4, 8), 'Head', COLOURS.skinShade, { position: [0, 1.66, 0.155], rotation: [1.25, 0, 0] });
    add(new THREE.SphereGeometry(0.02, 10, 8), 'Head', COLOURS.skin, { position: [0.14, 1.68, 0.0], scale: [0.6, 1.4, 1] });
    add(new THREE.SphereGeometry(0.02, 10, 8), 'Head', COLOURS.skin, { position: [-0.14, 1.68, 0.0], scale: [0.6, 1.4, 1] });

    for (const side of [1, -1]) {
        add(new THREE.SphereGeometry(0.042, 16, 12), 'Head', COLOURS.eye, { position: [0.058 * side, 1.715, 0.118], scale: [1, 1.1, 0.55] }, 'eye');
        add(new THREE.SphereGeometry(0.011, 8, 6), 'Head', COLOURS.pupil, { position: [0.052 * side, 1.708, 0.141] }, 'eye');
        // Heavy half-closed lids over the top of each eye, which the blink morph swings shut
        add(new THREE.SphereGeometry(0.046, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), 'Head', COLOURS.skin, { position: [0.058 * side, 1.715, 0.118], scale: [1.04, 1.14, 0.62], rotation: [0.55, 0, 0] }, `lid${side}`);
    }
    add(new THREE.SphereGeometry(0.036, 16, 10), 'Head', COLOURS.mouth, { position: [0, 1.6, 0.134], scale: [1, 0.22, 0.45] }, 'mouth');

    add(limb(0.045, [0, 1.47], [0, 1.58]), 'Neck', COLOURS.skin, { position: [0, 1.52, 0] });

    // Torso: black tee with a yellow print, jeans
    add(new THREE.CapsuleGeometry(0.16, 0.26, 6, 14), 'Chest', COLOURS.shirt, { position: [0, 1.3, 0], scale: [1.08, 1, 0.68] });
    add(new THREE.CapsuleGeometry(0.15, 0.12, 6, 14), 'Spine', COLOURS.shirt, { position: [0, 1.08, 0], scale: [1, 1, 0.66] });
    add(new THREE.CircleGeometry(0.075, 5), 'Chest', COLOURS.logo, { position: [0.0, 1.3, 0.113], rotation: [0, 0, 0.3], scale: [1, 0.85, 1] });
    add(new THREE.CapsuleGeometry(0.15, 0.06, 6, 14), 'Hips', COLOURS.jeans, { position: [0, 0.93, 0], scale: [1.02, 1, 0.68] });

    for (const [side, suffix] of [[1, 'L'], [-1, 'R']]) {
        const shoulder = [0.21 * side, 1.42];
        const elbow = [0.23 * side, 1.14];
        const wrist = [0.24 * side, 0.9];
        add(limb(0.052, shoulder, elbow), `UpperArm${suffix}`, COLOURS.skin, { position: [...mid(shoulder, elbow), 0] });
        add(new THREE.CylinderGeometry(0.068, 0.062, 0.13, 14), `UpperArm${suffix}`, COLOURS.shirt, { position: [0.215 * side, 1.37, 0] });
        add(limb(0.045, elbow, wrist), `ForeArm${suffix}`, COLOURS.skin, { position: [...mid(elbow, wrist), 0] });
        add(new THREE.SphereGeometry(0.055, 14, 10), `Hand${suffix}`, COLOURS.skin, { position: [0.245 * side, 0.85, 0.01], scale: [0.8, 1.05, 0.9] });

        const hip = [0.1 * side, 0.92];
        const knee = [0.1 * side, 0.5];
        const ankle = [0.1 * side, 0.09];
        add(limb(0.072, hip, knee), `UpperLeg${suffix}`, COLOURS.jeans, { position: [...mid(hip, knee), 0] });
        add(limb(0.062, knee, ankle), `LowerLeg${suffix}`, COLOURS.jeans, { position: [...mid(knee, ankle), 0] });
        add(new THREE.CapsuleGeometry(0.06, 0.14, 4, 10), `Foot${suffix}`, COLOURS.shoe, { position: [0.1 * side, 0.06, 0.06], rotation: [Math.PI / 2, 0, 0], scale: [1.05, 1, 0.85] });
        add(new THREE.BoxGeometry(0.13, 0.025, 0.28), `Foot${suffix}`, COLOURS.sole, { position: [0.1 * side, 0.012, 0.06] });
    }

    // The mic, gripped in the right fist with its head poking out past the fingers
    add(new THREE.CylinderGeometry(0.018, 0.012, 0.17, 12), 'HandR', COLOURS.mic, { position: [-0.245, 0.81, 0.02] });
    add(new THREE.SphereGeometry(0.034, 14, 10), 'HandR', COLOURS.grille, { position: [-0.245, 0.715, 0.02] });

    return parts;
}

// Morph deltas for one tagged part: `fn` maps a rest position to its fully-morphed position
function morphDeltas(ranges, positions, tag, fn, target) {
    const vertex = new THREE.Vector3();
    for (const range of ranges.filter((r) => r.tag === tag)) {
        for (let i = range.start; i < range.end; i++) {
            vertex.fromBufferAttribute(positions, i);
            const moved = fn(vertex.clone(), range.centre);
            target.setXYZ(i, moved.x - vertex.x, moved.y - vertex.y, moved.z - vertex.z);
        }
    }
}

function buildGeometry() {
    const parts = buildParts();
    const ranges = [];
    let offset = 0;

    const prepared = parts.map((part) => {
        let geometry = part.geometry;
        if (!geometry.index) geometry = geometry.toIndexed?.() ?? geometry;
        const count = geometry.attributes.position.count;
        const colour = new THREE.Color(part.colour);
        const colours = new Float32Array(count * 3);
        const skinIndex = new Uint16Array(count * 4);
        const skinWeight = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
            colours.set([colour.r, colour.g, colour.b], i * 3);
            skinIndex[i * 4] = BONE_INDEX[part.bone];
            skinWeight[i * 4] = 1;
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
        geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
        if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));

        geometry.computeBoundingBox();
        const centre = geometry.boundingBox.getCenter(new THREE.Vector3());
        ranges.push({ tag: part.tag, start: offset, end: offset + count, centre });
        offset += count;
        return geometry;
    });

    const geometry = mergeGeometries(prepared, false);
    prepared.forEach((part) => part.dispose());

    const positions = geometry.attributes.position;
    const morph = (name) => {
        const attribute = new THREE.Float32BufferAttribute(new Float32Array(positions.count * 3), 3);
        attribute.name = name;
        return attribute;
    };
    const mouthOpen = morph('mouthOpen');
    const mouthRound = morph('mouthRound');
    const mouthWide = morph('mouthWide');
    const blink = morph('blink');

    const scaleAbout = (sx, sy, sz) => (v, c) => v.sub(c).multiply(new THREE.Vector3(sx, sy, sz)).add(c);
    morphDeltas(ranges, positions, 'mouth', (v, c) => scaleAbout(1.05, 4.2, 1.1)(v, c).add(new THREE.Vector3(0, -0.012, 0.004)), mouthOpen);
    morphDeltas(ranges, positions, 'mouth', scaleAbout(0.55, 1.6, 1.2), mouthRound);
    morphDeltas(ranges, positions, 'mouth', scaleAbout(1.45, 0.8, 1), mouthWide);
    // Blink swings each lid down over its eye
    for (const side of [1, -1]) {
        const eyeCentre = new THREE.Vector3(0.058 * side, 1.715, 0.118);
        const swing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.0);
        morphDeltas(ranges, positions, `lid${side}`, (v) => v.sub(eyeCentre).applyQuaternion(swing).add(eyeCentre), blink);
    }

    geometry.morphAttributes.position = [mouthOpen, mouthRound, mouthWide, blink];
    geometry.morphTargetsRelative = true;
    return geometry;
}

/*
  Dance clips, sampled from pose functions. Each pose function gets the phase through the clip
  (0-1) and returns local bone rotations (Euler XYZ, radians) plus an optional hips offset.
*/
const SAMPLES_PER_BAR = 48;

function sampleClip(name, duration, samples, pose, loop = true) {
    const times = [];
    const values = {};
    const hips = [];
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();

    for (let i = 0; i <= samples; i++) {
        const phase = i / samples;
        times.push(phase * duration);
        const frame = pose(loop ? phase % 1 : phase);
        for (const [bone] of BONES) {
            const rotation = frame[bone] ?? [0, 0, 0];
            quaternion.setFromEuler(euler.set(rotation[0], rotation[1], rotation[2]));
            (values[bone] ??= []).push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        }
        const [x, y, z] = frame.hips ?? [0, 0, 0];
        hips.push(x, BONES[0][2][1] + y, z);
    }

    const tracks = BONES.map(([bone]) => new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values[bone]));
    tracks.push(new THREE.VectorKeyframeTrack('Hips.position', times, hips));
    return new THREE.AnimationClip(name, duration, tracks);
}

const TAU = Math.PI * 2;
// 1 on each beat falling to 0 half way between: the bounce of a knee dip
const dipAt = (phase) => (1 + Math.cos(TAU * phase * 4)) / 2;
const sharpDip = (phase) => dipAt(phase) ** 3;

// Right arm with the mic up at the mouth
const MIC_UP = { UpperArmR: [-1.05, 0.15, 0.38], ForeArmR: [-1.6, 0, 0.3], HandR: [-0.25, 0, 0.1] };
// Right arm holding the mic loosely at chest height
const MIC_DOWN = { UpperArmR: [-0.25, 0, -0.08], ForeArmR: [-1.0, 0, 0.12], HandR: [0, 0, 0] };

const legs = (dip, depth) => ({
    UpperLegL: [-0.35 * dip * depth, 0, 0.03],
    LowerLegL: [0.7 * dip * depth, 0, 0],
    FootL: [-0.35 * dip * depth, 0, 0],
    UpperLegR: [-0.35 * dip * depth, 0, -0.03],
    LowerLegR: [0.7 * dip * depth, 0, 0],
    FootR: [-0.35 * dip * depth, 0, 0],
});

const POSES = {
    // Waiting for his cue: weight shifting, a little nod, mic at his side
    Idle: (p) => {
        const sway = Math.sin(TAU * p);
        const dip = dipAt(p);
        return {
            hips: [sway * 0.015, -0.012 * dip, 0],
            Hips: [0, sway * 0.06, sway * 0.025],
            Spine: [0.04, 0, -sway * 0.02],
            Chest: [0.02, -sway * 0.04, 0],
            Head: [0.06 + 0.05 * dip, sway * 0.08, 0],
            UpperArmL: [0.05, 0, 0.1 + sway * 0.03],
            ForeArmL: [-0.25, 0, 0],
            UpperArmR: [-0.05, 0, -0.1],
            ForeArmR: [-0.45, 0, 0],
            ...legs(dip, 0.25),
        };
    },
    // Head nodding, knees bouncing on every beat, shoulders rolling
    Groove: (p) => {
        const dip = sharpDip(p);
        const sway = Math.sin(TAU * p * 2);
        return {
            hips: [sway * 0.03, -0.045 * dip, 0],
            Hips: [0, sway * 0.12, sway * 0.04],
            Spine: [0.1 * dip, 0, -sway * 0.05],
            Chest: [0.05, -sway * 0.12, 0],
            Head: [0.22 * dip - 0.05, sway * 0.1, 0],
            UpperArmL: [-0.2 - 0.25 * Math.max(0, sway), 0, 0.25],
            ForeArmL: [-1.1 + 0.25 * dip, 0, 0],
            ...MIC_DOWN,
            ...legs(dip, 1),
        };
    },
    // Mic up, eyes on the crowd, free hand working the words
    Sing: (p) => {
        const dip = dipAt(p);
        const sway = Math.sin(TAU * p);
        const reach = (1 + Math.sin(TAU * p * 2 - 0.6)) / 2;
        return {
            hips: [sway * 0.02, -0.03 * dip, 0],
            Hips: [0, sway * 0.1, sway * 0.03],
            Spine: [-0.04, 0, -sway * 0.04],
            Chest: [-0.05, -sway * 0.08 - 0.1, 0],
            Neck: [-0.08, 0, 0],
            Head: [-0.04 + 0.08 * dip, 0.05 + sway * 0.06, -0.06],
            UpperArmL: [-0.6 - 0.5 * reach, 0, 0.4 + 0.35 * reach],
            ForeArmL: [-0.9 + 0.5 * reach, 0, 0],
            HandL: [0, 0, 0.2],
            ...MIC_UP,
            ...legs(dip, 0.55),
        };
    },
    // Full tilt: hopping, head banging, fist punching the air on every beat
    Hype: (p) => {
        const dip = sharpDip(p);
        const hop = Math.abs(Math.sin(TAU * p * 2));
        const punch = Math.max(0, Math.cos(TAU * p * 4));
        return {
            hips: [0, 0.05 * hop - 0.06 * dip, 0],
            Hips: [0, Math.sin(TAU * p) * 0.15, 0],
            Spine: [0.16 * dip, 0, 0],
            Chest: [0.08 * dip - 0.06, 0, 0],
            Head: [0.35 * dip - 0.12, 0, 0],
            UpperArmL: [-2.3 - 0.4 * punch, 0, 0.45],
            ForeArmL: [-0.6 + 0.5 * punch, 0, 0],
            HandL: [0, 0, 0],
            ...MIC_UP,
            ...legs(dip, 1.2),
        };
    },
};

// The drop: crouch, launch with both arms up, land and spring back up
function dropPose(p) {
    const crouch = p < 0.2 ? Math.sin((p / 0.2) * Math.PI * 0.5) : p < 0.3 ? 1 - ((p - 0.2) / 0.1) : p > 0.62 && p < 0.85 ? Math.sin(((p - 0.62) / 0.23) * Math.PI) * 0.8 : 0;
    const air = p > 0.28 && p < 0.66 ? Math.sin(((p - 0.28) / 0.38) * Math.PI) : 0;
    const arms = Math.min(1, Math.max(0, p < 0.25 ? 0 : p < 0.35 ? (p - 0.25) / 0.1 : p > 0.8 ? 1 - ((p - 0.8) / 0.2) : 1));
    return {
        hips: [0, (0.42 * air) - (0.2 * crouch), 0],
        Spine: [0.35 * crouch - 0.15 * air, 0, 0],
        Chest: [0.1 * crouch, 0, 0],
        Head: [0.3 * crouch - 0.25 * air, 0, 0],
        UpperArmL: [-0.3 - 2.4 * arms, 0, 0.3 + 0.2 * arms],
        ForeArmL: [-0.8 + 0.6 * arms, 0, 0],
        UpperArmR: [-0.3 - 2.4 * arms, 0, -0.3 - 0.2 * arms],
        ForeArmR: [-0.8 + 0.6 * arms, 0, 0],
        UpperLegL: [-0.9 * crouch - 0.6 * air, 0, 0.08],
        LowerLegL: [1.6 * crouch + 1.1 * air, 0, 0],
        FootL: [-0.7 * crouch, 0, 0],
        UpperLegR: [-0.9 * crouch - 0.3 * air, 0, -0.08],
        LowerLegR: [1.6 * crouch + 0.6 * air, 0, 0],
        FootR: [-0.7 * crouch, 0, 0],
    };
}

export function buildPlaceholderCharacter() {
    const { bones, byName } = buildSkeleton();
    const geometry = buildGeometry();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.name = 'PlaceholderBody';
    mesh.add(byName.Hips);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones));

    const scene = new THREE.Group();
    scene.name = 'PlaceholderPerformer';
    scene.add(mesh);

    const animations = Object.entries(POSES).map(([name, pose]) => sampleClip(name, BAR_SECONDS, SAMPLES_PER_BAR, pose));
    animations.push(sampleClip('DropJump', 1.3, 52, dropPose, false));
    return { scene, animations };
}
