import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import * as THREE from 'three';
import { loadAnalysis } from '../../utils/spectrum';
import { loadVocals } from '../../utils/singing';
import { createCameraRig, DEFAULT_FRAME } from './cameraRig';
import { createPerformer, LIVE_LAYER, loadPerformerAsset, MODEL_URL } from './performer';
import { createStage } from './stage';
import { createGradientMap, disposeObject, setOutlineWidth } from './toon';

// Frames to keep drawing after a pause, so eased colours and crossfades settle before the loop idles
const SETTLE_FRAMES = 60;
// Ink line thickness on screen, in CSS pixels, however near or far the camera is
const OUTLINE_PIXELS = 3;
// The giant screen's live feed: a small 16:9 render, since the screen shows it as coarse LEDs anyway
const LIVE_SIZE = [384, 216];
const LIVE_OUTLINE_PIXELS = 1.6;

// World units one pixel covers at `distance` in front of a perspective camera `pixels` tall
function worldPerPixel(camera, distance, pixels) {
    return (2 * distance * Math.tan((camera.fov * Math.PI) / 360)) / Math.max(1, pixels);
}

/*
  The full-screen three.js gig. Lazy-loaded by GigMode so three.js stays out of the main bundle.
  Everything animates from `getPlaybackTime()`, read once per frame, so the show stays locked to
  the audio and freezes in place when it's paused.
*/
export default function GigStage({ getPlaybackTime, isPlaying, modelUrl = MODEL_URL, onError, onReady }) {
    const containerRef = useRef(null);
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
        const container = containerRef.current;
        if (!container) return undefined;
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        } catch (error) {
            onErrorRef.current?.(error);
            return undefined;
        }
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.domElement.className = 'block w-full h-full';
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#060d0d');
        scene.fog = new THREE.Fog('#081419', 9, 26);
        const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
        const gradientMap = createGradientMap();
        const background = scene.background;

        // A camera operator filming him for the giant screen: it only sees the performer's layer
        const liveTarget = new THREE.WebGLRenderTarget(...LIVE_SIZE);
        const liveCamera = new THREE.PerspectiveCamera(26, LIVE_SIZE[0] / LIVE_SIZE[1], 0.1, 20);
        liveCamera.layers.set(LIVE_LAYER);
        const liveFocus = new THREE.Vector3(0, DEFAULT_FRAME.headY, 0);
        const headPosition = new THREE.Vector3();
        const chest = new THREE.Vector3();

        const stage = createStage({ gradientMap, reduceMotion, liveTexture: liveTarget.texture });
        scene.add(stage.group);
        const rig = createCameraRig(camera, { reduceMotion });

        let disposed = false;
        let dirty = true;
        let performer = null;
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
        loadPerformerAsset(modelUrl).then((asset) => {
            if (disposed) {
                disposeObject(asset.scene);
                return;
            }
            performer = createPerformer(asset, gradientMap);
            scene.add(performer.object);
            announce = true;
        }).catch((error) => onErrorRef.current?.(error));

        const resize = () => {
            const width = container.clientWidth || window.innerWidth;
            const height = container.clientHeight || window.innerHeight;
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
            dirty = true;
        };
        resize();
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
        observer?.observe(container);
        window.addEventListener('resize', resize);

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

            const show = stage.update({ time, dt, analysis, live: Boolean(performer) });
            performer?.update({ time, dt, playing, analysis, vocals });
            const frame = performer?.frame ?? DEFAULT_FRAME;
            rig.update({ time, analysis, pulse: show.pulse, frame });

            if (performer) {
                // Follow his head (head and shoulders in shot), easing so the feed doesn't jitter with every nod
                if (frame.headBone) frame.headBone.getWorldPosition(headPosition);
                else headPosition.set(0, frame.headY, 0);
                // The head bone sits at the base of the skull; aim a little above it so his face lands in
                // the lower-middle of the screen, the part the crowd cameras can see
                headPosition.y += frame.height * 0.08;
                liveFocus.lerp(headPosition, 1 - Math.exp(-dt * 6));
                const sway = reduceMotion ? 0 : Math.sin(time * 0.4) * 0.1 * frame.height;
                liveCamera.position.set(liveFocus.x + sway, liveFocus.y + frame.height * 0.02, liveFocus.z + frame.height * 1.1);
                liveCamera.lookAt(liveFocus.x, liveFocus.y + frame.height * 0.05, liveFocus.z);

                setOutlineWidth(performer.outlineMaterials, LIVE_OUTLINE_PIXELS * worldPerPixel(liveCamera, liveCamera.position.distanceTo(liveFocus), LIVE_SIZE[1]));
                scene.background = null;
                renderer.setRenderTarget(liveTarget);
                renderer.setClearColor(0x000000, 0);
                renderer.clear();
                renderer.render(scene, liveCamera);
                renderer.setRenderTarget(null);
                renderer.setClearColor(0x000000, 1);
                scene.background = background;

                // Bold ink a constant few pixels thick in the main view
                chest.set(0, frame.chestY, 0);
                setOutlineWidth(performer.outlineMaterials, OUTLINE_PIXELS * worldPerPixel(camera, camera.position.distanceTo(chest), container.clientHeight || window.innerHeight));
            }
            renderer.render(scene, camera);

            if (announce) {
                announce = false;
                onReadyRef.current?.(performer.source);
            }
        };
        loop();

        return () => {
            disposed = true;
            cancelAnimationFrame(frameId);
            observer?.disconnect();
            window.removeEventListener('resize', resize);
            performer?.dispose();
            stage.dispose();
            disposeObject(scene);
            gradientMap.dispose();
            liveTarget.dispose();
            renderer.dispose();
            renderer.forceContextLoss?.();
            renderer.domElement.remove();
        };
    }, [modelUrl]);

    return <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />;
}

GigStage.propTypes = {
    getPlaybackTime: PropTypes.func.isRequired,
    isPlaying: PropTypes.bool.isRequired,
    modelUrl: PropTypes.string,
    onError: PropTypes.func,
    onReady: PropTypes.func
};
