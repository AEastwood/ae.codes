import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { lyricsTimeline } from '../../utils/lyrics';
import { mouthAt } from '../../utils/singing';
import { intensityAt } from '../../utils/spectrum';
import {
    beatPosition,
    blinkAmount,
    chooseClip,
    DROP_CLIP,
    lastDrop,
    LOOP_CLIPS,
    loopTime,
    mouthMorphs,
    nextBlinkDelay,
    oneShotWeight,
    stepWeights,
    vocalsNear,
} from './gigMaths';
import { addOutlines, toonify } from './toon';
import { buildPlaceholderCharacter } from './placeholderCharacter';

export const MODEL_URL = `${import.meta.env.BASE_URL}models/adam-gorillaz.glb`;
const MORPHS = ['mouthOpen', 'mouthRound', 'mouthWide', 'blink'];
const TARGET_HEIGHT = 1.8;
const OUTLINE_WIDTH = 0.011;
// The layer the giant screen's live camera sees: just him, so the screen never films itself
export const LIVE_LAYER = 1;
// Ahead of this, he's waiting in the wings for the first line
const FIRST_LYRIC = lyricsTimeline[0]?.words[0]?.start ?? lyricsTimeline[0]?.time ?? 0;
const CLOSED_MOUTH = { open: 0, width: 0.8, height: 0.3 };

// Loads the real model, or builds the stand-in if it's missing or broken
export async function loadPerformerAsset(url = MODEL_URL) {
    try {
        const gltf = await new GLTFLoader().loadAsync(url);
        return { scene: gltf.scene, animations: gltf.animations, source: 'model' };
    } catch {
        return { ...buildPlaceholderCharacter(), source: 'placeholder' };
    }
}

// Scales the model to ~1.8 units if it was exported at some other scale, feet on the floor, centred
function normalise(scene) {
    const holder = new THREE.Group();
    holder.name = 'Performer';
    holder.add(scene);
    holder.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    if (size.y > 0 && (size.y < TARGET_HEIGHT * 0.6 || size.y > TARGET_HEIGHT * 1.6)) {
        scene.scale.multiplyScalar(TARGET_HEIGHT / size.y);
        holder.updateMatrixWorld(true);
        box.setFromObject(scene);
    }
    const centre = box.getCenter(new THREE.Vector3());
    scene.position.x -= centre.x;
    scene.position.z -= centre.z;
    scene.position.y -= box.min.y;
    holder.updateMatrixWorld(true);
    return { holder, height: box.max.y - box.min.y };
}

/*
  Where to point cameras, measured from the model itself so a re-proportioned character still frames:
  the head bone's rest height if there is one, otherwise a fraction of the bounding box.
*/
function measureFrame(holder, height) {
    let head = null;
    holder.traverse((object) => {
        if (!head && object.isBone && /head/i.test(object.name) && !/top|end|tip/i.test(object.name)) head = object;
    });
    const headY = head ? head.getWorldPosition(new THREE.Vector3()).y + height * 0.05 : height * 0.9;
    return { height, headY, chestY: headY - height * 0.2, headBone: head };
}

// Every [mesh, index] pair for each morph name, wherever the exporter put them
function findMorphs(root) {
    const found = Object.fromEntries(MORPHS.map((name) => [name, []]));
    root.traverse((object) => {
        const dictionary = object.morphTargetDictionary;
        if (!object.isMesh || !dictionary || object.userData.isOutline) return;
        for (const name of MORPHS) {
            const key = Object.keys(dictionary).find((entry) => entry === name)
                ?? Object.keys(dictionary).find((entry) => entry.toLowerCase() === name.toLowerCase());
            if (key != null) found[name].push([object, dictionary[key]]);
        }
    });
    return found;
}

/*
  Turns a loaded character into a beat-locked performer. Every frame `update` picks the dance loop
  for the moment, scrubs each loop to the song's bar position so the moves land exactly on the beat,
  fires the drop jump, and drives the mouth and blinks from the vocals.
*/
export function createPerformer(asset, gradientMap) {
    const { holder, height } = normalise(asset.scene);
    toonify(holder, gradientMap);
    const outlineMaterials = addOutlines(holder, OUTLINE_WIDTH);
    const morphs = findMorphs(holder);
    const frame = measureFrame(holder, height);
    holder.traverse((object) => object.layers.enable(LIVE_LAYER));

    const mixer = new THREE.AnimationMixer(asset.scene);
    const clips = Object.fromEntries(asset.animations.map((clip) => [clip.name, clip]));
    const fallback = clips.Groove ?? clips.Idle ?? asset.animations[0];
    const loops = {};
    for (const name of LOOP_CLIPS) {
        const clip = clips[name] ?? fallback;
        if (!clip) continue;
        const action = mixer.clipAction(clip);
        // Time is set by hand every frame, so the mixer never advances it
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
        action.setEffectiveWeight(0);
        loops[name] = { action, duration: clip.duration };
    }
    let drop = null;
    if (clips[DROP_CLIP]) {
        const action = mixer.clipAction(clips[DROP_CLIP]);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
        action.setEffectiveWeight(0);
        drop = { action, duration: clips[DROP_CLIP].duration };
    }

    const weights = Object.fromEntries(Object.keys(loops).map((name) => [name, 0]));
    const state = {
        clip: null,
        beat: null,
        mouth: { ...CLOSED_MOUTH },
        blinkIn: nextBlinkDelay(),
        blinkAge: Infinity,
        // A model with no clips at all still bobs to the beat
        bob: asset.animations.length === 0,
    };
    const restY = asset.scene.position.y;

    const setMorph = (name, value) => {
        for (const [mesh, index] of morphs[name]) mesh.morphTargetInfluences[index] = value;
    };

    function update({ time, dt, playing, analysis, vocals }) {
        const intensity = analysis ? intensityAt(analysis, time) : 0.5;
        const singing = vocalsNear(time, lyricsTimeline);
        const wanted = chooseClip({ singing, intensity, beforeVocals: time < FIRST_LYRIC - 0.45 });

        // Only switch dance on a beat, so a new move always starts in step
        const { beat, phase } = beatPosition(time);
        if (state.clip == null || (beat !== state.beat && wanted !== state.clip)) state.clip = wanted;
        state.beat = beat;
        stepWeights(weights, loops[state.clip] ? state.clip : Object.keys(loops)[0], dt);

        const sinceDrop = analysis ? lastDrop(time, analysis.drops).age : Infinity;
        const dropWeight = drop ? oneShotWeight(sinceDrop, drop.duration, 0.08, 0.35) : 0;
        if (drop) {
            drop.action.time = dropWeight > 0 ? Math.min(drop.duration - 1e-3, sinceDrop) : 0;
            drop.action.setEffectiveWeight(dropWeight);
        }
        for (const [name, loop] of Object.entries(loops)) {
            loop.action.time = loopTime(time, loop.duration);
            loop.action.setEffectiveWeight(weights[name] * (1 - dropWeight));
        }
        mixer.update(0);
        if (state.bob) asset.scene.position.y = restY - (0.04 * ((1 + Math.cos(phase * Math.PI * 2)) / 2));

        // Snap open almost instantly, close a little slower, so it reads as singing rather than flapping
        const target = playing ? mouthAt(time, vocals) : CLOSED_MOUTH;
        const mouth = state.mouth;
        const step = Math.min(1, dt * 60);
        mouth.open += (target.open - mouth.open) * Math.min(1, (target.open > mouth.open ? 0.75 : 0.45) * step);
        mouth.width += (target.width - mouth.width) * Math.min(1, 0.3 * step);
        mouth.height += (target.height - mouth.height) * Math.min(1, 0.3 * step);
        const shape = mouthMorphs(mouth);
        setMorph('mouthOpen', shape.mouthOpen);
        setMorph('mouthRound', shape.mouthRound);
        setMorph('mouthWide', shape.mouthWide);

        // Blinks run on the wall clock, paused along with the music so a frozen frame stays frozen
        if (playing) {
            state.blinkIn -= dt;
            state.blinkAge += dt;
            if (state.blinkIn <= 0) {
                state.blinkAge = 0;
                state.blinkIn = nextBlinkDelay();
            }
        }
        setMorph('blink', blinkAmount(state.blinkAge));

        return { clip: state.clip, dropWeight, intensity, singing };
    }

    return {
        object: holder,
        frame,
        outlineMaterials,
        source: asset.source,
        update,
        dispose() {
            mixer.stopAllAction();
            mixer.uncacheRoot(asset.scene);
            outlineMaterials.forEach((material) => material.dispose());
        },
    };
}
