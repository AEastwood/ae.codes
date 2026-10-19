import { clonePage } from './clonePage';
import {
    CLOSE,
    closePose,
    curtainGeometry,
    halfTransform,
    OPEN,
    openPose,
    sampleSequence
} from './curtainMaths';

// Longest the closed curtains wait for the stage to start drawing before opening on the loader anyway
const MAX_HOLD_MS = 1400;
// Turning back halfway (closing a gig that's still opening, or the reverse) runs a little quicker
const REVERSE_RATE = 1.4;
// After an opening is turned back, the flat copies dissolve into the real page over this long
const SETTLE_MS = 160;
// How far each half reaches past its screen edge, under the fold's sideways pull
const MARGIN = 40;
// While the closed curtains wait for the stage they stir a little, as if there's a draught behind them
const BREATHE_MS = 2600;
// Dust motes drifting through the light in the gap
const DUST_COUNT = 22;
// Height of the pleat strips, tiled down the screen (one pixel tall gets rasterised blurry once composited)
const STRIP_HEIGHT = 16;

let sequence = 0;
// The last viewport's pleat strips, so opening the gig again doesn't redraw them
let pleatCache = null;

function element(className, parent, tag = 'div') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    parent?.appendChild(node);
    return node;
}

/*
  One pleat profile across the whole screen, drawn into three strips: the displacement map
  that bends the page sideways into folds, and the shadow and sheen that light those same folds.
  The pleats wander a little in width so the fabric doesn't look machine-made.
*/
function paintPleats(geometry) {
    const key = `${geometry.width}:${geometry.pleat}`;
    if (pleatCache?.key === key) return pleatCache.pleats;
    const width = Math.max(1, Math.round(geometry.width));
    const phase = (x) => ((2 * Math.PI * x) / geometry.pleat) + (0.6 * Math.sin((2 * Math.PI * x) / (geometry.pleat * 2.3)));
    const offsets = new Float32Array(width);
    const slopes = new Float32Array(width);
    let steepest = 0;
    for (let x = 0; x < width; x++) {
        offsets[x] = Math.sin(phase(x + 0.5));
        // Where the offset grows, more page is squeezed into less screen: the fabric is turning away, so darker
        slopes[x] = Math.cos(phase(x + 0.5)) * (phase(x + 1) - phase(x));
        steepest = Math.max(steepest, Math.abs(slopes[x]));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = STRIP_HEIGHT;
    const ctx = canvas.getContext('2d');
    const strip = (pixel) => {
        const image = ctx.createImageData(width, STRIP_HEIGHT);
        for (let x = 0; x < width; x++) {
            const value = pixel(x);
            for (let y = 0; y < STRIP_HEIGHT; y++) image.data.set(value, ((y * width) + x) * 4);
        }
        ctx.putImageData(image, 0, 0);
        return canvas.toDataURL();
    };
    // -1 where the fabric faces the light, 1 where it turns furthest away
    const turn = (x) => slopes[x] / (steepest || 1);
    const pleats = {
        map: strip((x) => [Math.round(128 + (127 * offsets[x])), 128, 128, 255]),
        shade: strip((x) => [24, 2, 8, Math.round(255 * 0.92 * ((0.5 + (0.5 * turn(x))) ** 1.6))]),
        sheen: strip((x) => [255, 200, 190, Math.round(255 * 0.42 * (Math.max(0, -turn(x)) ** 3))])
    };
    pleatCache = { key, pleats };
    return pleats;
}

// The SVG filter that bends one half's copy of the page along the pleat map
function foldFilter(defs, id, fabric, geometry, mapUrl) {
    const ns = 'http://www.w3.org/2000/svg';
    const filter = document.createElementNS(ns, 'filter');
    const attrs = (node, values) => Object.entries(values).forEach(([key, value]) => node.setAttribute(key, String(value)));
    attrs(filter, {
        id,
        x: 0,
        y: 0,
        width: fabric.width,
        height: geometry.height,
        filterUnits: 'userSpaceOnUse',
        primitiveUnits: 'userSpaceOnUse',
        'color-interpolation-filters': 'sRGB'
    });
    const image = document.createElementNS(ns, 'feImage');
    attrs(image, { href: mapUrl, x: -fabric.left, y: 0, width: geometry.width, height: geometry.height, preserveAspectRatio: 'none', result: 'pleats' });
    const displace = document.createElementNS(ns, 'feDisplacementMap');
    attrs(displace, { in: 'SourceGraphic', in2: 'pleats', scale: 0, xChannelSelector: 'R', yChannelSelector: 'G' });
    filter.append(image, displace);
    defs.appendChild(filter);
    return displace;
}

/*
  Builds one curtain: a copy of the page clipped to its half, with the fold filter, a velvet dye,
  pleat shading, a dark inner edge and a gold fringe on the hem. `side` is 'left' or 'right'.
*/
function buildHalf({ side, root, defs, copy, geometry, margin, pleats, id }) {
    const { width, height, reach, depth } = geometry;
    const left = side === 'left' ? -margin : width - reach;
    const half = element(`curtain-half is-${side}`, root);
    Object.assign(half.style, {
        left: `${left}px`,
        width: `${reach + margin}px`,
        transformOrigin: `${side === 'left' ? margin : reach}px 0`
    });

    const cloth = element('curtain-cloth', half);
    cloth.style.transformOrigin = `${side === 'left' ? margin : reach}px 0`;
    // The fabric reaches a fold's depth past the inner edge so the bent page never pulls in empty space there
    const fabric = side === 'left'
        ? { left: 0, width: reach + depth }
        : { left: width - reach - depth, width: reach + depth };
    const fabricNode = element('curtain-fabric', cloth);
    Object.assign(fabricNode.style, {
        left: `${fabric.left - left}px`,
        width: `${fabric.width}px`,
        height: `${height}px`
    });
    // The copy sits in a full-screen box so its fixed-position canvas lines up with the real one
    const screen = element('curtain-screen', fabricNode);
    Object.assign(screen.style, { left: `${-fabric.left}px`, width: `${width}px`, height: `${height}px` });
    screen.appendChild(copy);
    const displace = foldFilter(defs, `${id}-${side}`, fabric, geometry, pleats.map);

    // Shading strips are drawn in screen space, so line them up with the screen from inside this half
    const strip = (className, url) => {
        const node = element(className, cloth);
        node.style.backgroundImage = `url(${url})`;
        node.style.backgroundSize = `${width}px ${STRIP_HEIGHT}px`;
        node.style.backgroundPosition = `${-left}px 0`;
        return node;
    };
    const tint = element('curtain-tint', cloth);
    const shade = strip('curtain-shade', pleats.shade);
    const sheen = strip('curtain-sheen', pleats.sheen);
    const edge = element('curtain-edge', cloth);
    const fringe = element('curtain-fringe', cloth);
    const shadow = element(`curtain-shadow is-${side}`, root);
    root.insertBefore(shadow, root.querySelector('.curtain-half'));

    return { side, half, cloth, fabric: fabricNode, filterId: `${id}-${side}`, displace, tint, shade, sheen, edge, fringe, shadow };
}

// Every layer's keyframes for a sequence, sampled from the same poses so they all stay in step
function keyframesFor(frames, geometry) {
    const shadowWidth = 80;
    const pick = (values) => frames.map((frame) => ({ offset: frame.offset, ...values(frame) }));
    const shear = (frame) => (Math.atan(frame.lag / geometry.height) * 180) / Math.PI;
    return {
        left: pick((frame) => ({ transform: halfTransform(frame, geometry, 'left'), opacity: 1 - frame.pose.fade })),
        right: pick((frame) => ({ transform: halfTransform(frame, geometry, 'right'), opacity: 1 - frame.pose.fade })),
        shadowLeft: pick((frame) => ({
            transform: `translateX(${frame.edge.toFixed(2)}px) skewX(${(-shear(frame)).toFixed(3)}deg)`,
            opacity: frame.pose.fold * (1 - frame.pose.exit)
        })),
        shadowRight: pick((frame) => ({
            transform: `translateX(${(geometry.width - frame.edge - shadowWidth).toFixed(2)}px) skewX(${shear(frame).toFixed(3)}deg)`,
            opacity: frame.pose.fold * (1 - frame.pose.exit)
        })),
        tint: pick((frame) => ({ opacity: (0.6 * frame.pose.fold) + (0.3 * frame.pose.gather) })),
        shade: pick((frame) => ({ opacity: frame.pose.fold * (0.75 + (0.25 * frame.pose.gather)) })),
        sheen: pick((frame) => ({ opacity: frame.pose.fold })),
        edge: pick((frame) => ({ opacity: frame.pose.fold })),
        fringe: pick((frame) => ({ transform: `translateY(${((1 - frame.pose.fold) * 110).toFixed(2)}%)` })),
        light: pick((frame) => ({ opacity: frame.pose.light }))
    };
}

function scatterDust(light, geometry) {
    const motes = [];
    for (let index = 0; index < DUST_COUNT; index++) {
        const mote = element('curtain-dust', light, 'span');
        const x = (geometry.width / 2) + ((Math.random() - 0.5) * geometry.width * 0.34);
        const y = Math.random() * geometry.height * 0.9;
        const size = 1.5 + (Math.random() * 2.5);
        Object.assign(mote.style, { left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` });
        motes.push(mote.animate([
            { transform: 'translate(0, 0)', opacity: 0 },
            { opacity: 0.4 + (Math.random() * 0.5), offset: 0.3 },
            { transform: `translate(${((Math.random() - 0.5) * 60).toFixed(1)}px, ${(-20 - (Math.random() * 60)).toFixed(1)}px)`, opacity: 0 }
        ], { duration: 1800 + (Math.random() * 1800), delay: -Math.random() * 1500, iterations: Infinity, easing: 'ease-in-out' }));
    }
    return motes;
}

/*
  Runs the curtains between the page and the gig.
  - 'open': the page turns into curtains that part to reveal the gig (already mounted underneath).
  - 'close': curtains swing in over the gig, meet, and settle back into the page.
  `toward('gig' | 'page')` turns a running transition around. `onFolded` fires once an opening has
  turned the page into curtains (the moment to start the stage's heavy setup, which would otherwise
  stall the fold), `onCovered` when heading for the page and the gig is fully hidden (so it can
  unmount), and `onFinish(end)` once the curtains are gone, with `end` being 'gig' or 'page'.
*/
export function playCurtains({ source, direction, isStageReady, onFolded, onCovered, onFinish }) {
    const id = `curtain-folds-${++sequence}`;
    const geometry = curtainGeometry(window.innerWidth, window.innerHeight);
    const timeline = direction === 'open' ? OPEN : CLOSE;
    const poseAt = direction === 'open' ? openPose : closePose;
    const frames = sampleSequence(poseAt, timeline.duration, geometry);
    const margin = MARGIN;
    const pleats = paintPleats(geometry);

    const root = element('curtains');
    root.setAttribute('aria-hidden', 'true');
    root.inert = true;
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    defs.setAttribute('class', 'curtain-defs');
    defs.setAttribute('width', '0');
    defs.setAttribute('height', '0');
    root.appendChild(defs);
    const light = element('curtain-light', root);

    const copies = clonePage(source, 2);
    const halves = ['right', 'left'].map((side, index) => buildHalf({
        side,
        root,
        defs,
        copy: copies.roots[index],
        geometry,
        margin,
        pleats,
        id
    }));
    const [right, left] = halves;

    // Start exactly where the first keyframe will, so the first painted frame is already right
    const keyframes = keyframesFor(frames, geometry);
    const layers = [
        [left.half, keyframes.left],
        [right.half, keyframes.right],
        [left.shadow, keyframes.shadowLeft],
        [right.shadow, keyframes.shadowRight],
        [light, keyframes.light],
        ...halves.flatMap((half) => [
            [half.tint, keyframes.tint],
            [half.shade, keyframes.shade],
            [half.sheen, keyframes.sheen],
            [half.edge, keyframes.edge],
            [half.fringe, keyframes.fringe]
        ])
    ];
    layers.forEach(([node, frameList]) => {
        const first = { ...frameList[0] };
        delete first.offset;
        Object.assign(node.style, first);
    });

    document.body.appendChild(root);
    copies.pin();

    const animations = layers.map(([node, frameList]) => node.animate(frameList, {
        duration: timeline.duration,
        easing: 'linear',
        fill: 'both'
    }));
    const dust = scatterDust(light, geometry);
    const master = animations[0];

    let heading = direction === 'open' ? 'gig' : 'page';
    let frameId = 0;
    let ticks = 0;
    let holding = false;
    let holdStarted = 0;
    let gatePassed = direction !== 'open';
    let folded = direction !== 'open';
    let breathing = [];
    let coveredFired = false;
    let done = false;
    let foldScale = -1;

    // The displacement filter only runs while the page is actually bent, and only changes while folding
    const applyFold = (fold) => {
        const scale = Math.round(fold * geometry.depth * 10) / 10;
        if (scale === foldScale) return;
        foldScale = scale;
        halves.forEach((half) => {
            half.displace.setAttribute('scale', String(scale));
            half.fabric.style.filter = scale > 0 ? `url(#${half.filterId})` : 'none';
        });
    };

    const setRate = (rate) => {
        animations.forEach((animation) => {
            if (animation.updatePlaybackRate) animation.updatePlaybackRate(rate);
            else animation.playbackRate = rate;
            animation.play();
        });
    };

    const cleanup = () => {
        cancelAnimationFrame(frameId);
        window.removeEventListener('resize', handleResize);
        animations.forEach((animation) => animation.cancel());
        [...dust, ...breathing].forEach((animation) => animation.cancel());
        root.remove();
    };

    const finish = (end) => {
        if (done) return;
        done = true;
        cancelAnimationFrame(frameId);
        if (end === 'page' && direction === 'open') {
            // Turned back before the curtains parted: the flat copies fade into the live page underneath
            copies.holdMusic(false);
            const settle = root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: SETTLE_MS, easing: 'ease-out', fill: 'forwards' });
            const step = () => {
                copies.sync();
                frameId = requestAnimationFrame(step);
            };
            step();
            settle.onfinish = () => {
                cleanup();
                onFinish?.(end);
            };
            return;
        }
        cleanup();
        onFinish?.(end);
    };

    const tick = () => {
        frameId = requestAnimationFrame(tick);
        // The first tick runs straight away; by the second the pinned styles have been drawn once,
        // so letting go of them now starts the copies' transitions from where the page's were
        if (++ticks === 2) copies.release();
        const time = master.currentTime ?? 0;
        const pose = poseAt(time);
        applyFold(pose.fold);

        // While the curtains hang flat they're cheap to redraw, so the copies follow the live page
        const flat = pose.gather === 0 && pose.exit === 0;
        copies.holdMusic(!flat);
        if (flat) copies.sync();

        // Opening: wait with the curtains closed until the stage is drawing behind them
        if (!gatePassed && heading === 'gig' && time >= OPEN.gate) {
            if (!folded) {
                folded = true;
                onFolded?.();
            }
            const ready = isStageReady?.() ?? true;
            if (!holding && !ready) {
                holding = true;
                holdStarted = performance.now();
                animations.forEach((animation) => {
                    animation.pause();
                    animation.currentTime = OPEN.gate;
                });
                // On the compositor, so the curtains keep stirring even while the stage blocks the main thread
                breathing = halves.map(({ cloth, side }) => cloth.animate([
                    { transform: 'none' },
                    { transform: `skewX(${side === 'left' ? 0.5 : -0.5}deg) scaleX(0.994)`, offset: 0.5 },
                    { transform: 'none' }
                ], { duration: BREATHE_MS, iterations: Infinity, easing: 'ease-in-out' }));
            }
            if (ready || performance.now() - holdStarted > MAX_HOLD_MS) {
                gatePassed = true;
                if (holding) {
                    holding = false;
                    animations.forEach((animation) => animation.play());
                    // Let the stirring finish its sway and come to rest rather than stop dead
                    breathing.forEach((animation) => {
                        const iteration = animation.effect.getComputedTiming().currentIteration ?? 0;
                        animation.effect.updateTiming({ iterations: iteration + 1 });
                    });
                }
            }
        }

        const covered = direction === 'open' ? time <= OPEN.gather[0] : time >= CLOSE.covered;
        if (heading === 'page' && covered && !coveredFired) {
            coveredFired = true;
            onCovered?.();
        }

        if (master.playState === 'finished') {
            const forward = (master.playbackRate ?? 1) > 0;
            finish(forward === (direction === 'open') ? 'gig' : 'page');
        }
    };

    // A resize mid-transition would leave the copies misaligned, so jump straight to the end
    function handleResize() {
        animations.forEach((animation) => animation.finish());
    }
    window.addEventListener('resize', handleResize);
    tick();

    return {
        toward(target) {
            if (done || target === heading) return;
            heading = target;
            holding = false;
            if (target === 'gig') coveredFired = false;
            const forward = (direction === 'open') === (target === 'gig');
            setRate(forward ? 1 : -REVERSE_RATE);
        },
        cancel() {
            if (done) return;
            done = true;
            cleanup();
        }
    };
}
