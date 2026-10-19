import * as THREE from 'three';
import { BAR_SECONDS, fitFov, shotAt } from './gigMaths';

/*
  Shots the director cuts between, all from out in the crowd. Positions are for a 1.8-unit performer
  and scale with the real model's height; `look` names a point measured on the model at load time
  (its head bone and bounding box), so a re-proportioned character still lands in frame. Each shot
  also has a lens, how far it drifts round him, and how much stage either side must stay in frame
  (so phones in portrait still see all of him).
*/
const SHOTS = [
    { position: [0, 1.3, 8.4], look: 'chest', fov: 32, orbit: 0.16, halfWidth: 1.2 },
    { position: [-2.7, 0.95, 7.4], look: 'upper', fov: 27, orbit: 0.1, halfWidth: 0.95 },
    { position: [2.9, 2.5, 7.8], look: 'body', fov: 28, orbit: 0.1, halfWidth: 1 },
    { position: [0.7, 1.45, 7.2], look: 'face', fov: 13, orbit: 0.06, halfWidth: 0.42 },
    { position: [-1.1, 3, 9.8], look: 'low', fov: 36, orbit: 0.14, halfWidth: 1.6 },
];
export const DEFAULT_FRAME = { height: 1.8, headY: 1.71, chestY: 1.35 };
const REFERENCE_HEIGHT = 1.8;

// Named points on the performer, in world units
function lookHeight(name, frame) {
    switch (name) {
        case 'face': return frame.headY - frame.height * 0.08;
        case 'upper': return (frame.chestY + frame.headY) / 2 - frame.height * 0.05;
        case 'body': return frame.height * 0.69;
        case 'low': return frame.height * 0.64;
        default: return frame.chestY + frame.height * 0.03;
    }
}

const smooth = (p) => p * p * (3 - 2 * p);

export function createCameraRig(camera, { reduceMotion }) {
    const look = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const spherical = new THREE.Spherical();

    function update({ time, analysis, pulse, frame = DEFAULT_FRAME }) {
        // Reduced motion: one steady wide shot, drifting very slowly, no cuts or shake
        const shot = reduceMotion ? { index: 0, age: time, fromDrop: false } : shotAt(time, analysis?.drops ?? []);
        const preset = SHOTS[shot.index % SHOTS.length];

        const scale = frame.height / REFERENCE_HEIGHT;
        look.set(0, lookHeight(preset.look, frame), 0);
        offset.set(preset.position[0] * scale, preset.position[1] * scale, preset.position[2] * scale).sub(look);
        spherical.setFromVector3(offset);

        const drift = reduceMotion ? 0.04 : 0.11;
        spherical.theta += Math.sin(shot.age * drift) * preset.orbit;
        spherical.phi += Math.sin(shot.age * drift * 0.7) * 0.04;
        // A slow dolly in over the shot, and a quick push in straight after a drop's cut
        spherical.radius *= 1 - 0.07 * smooth(Math.min(1, shot.age / (8 * BAR_SECONDS)));
        if (shot.fromDrop) spherical.radius *= 1 + 0.28 * Math.exp(-shot.age * 2.2);

        camera.position.setFromSpherical(spherical).add(look);

        // A small jolt on the hardest downbeats
        if (!reduceMotion && pulse.bar > 0.35) {
            const shake = 0.03 * pulse.bar * (preset.fov / 32);
            camera.position.x += Math.sin(time * 61) * shake;
            camera.position.y += Math.sin(time * 47 + 1.3) * shake;
        }
        camera.lookAt(look);

        const fov = fitFov(camera.aspect, preset.fov, preset.halfWidth * scale, spherical.radius);
        if (Math.abs(fov - camera.fov) > 0.01) {
            camera.fov = fov;
            camera.updateProjectionMatrix();
        }
    }

    return { update };
}
