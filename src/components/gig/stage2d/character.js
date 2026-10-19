/*
  Drawing the sprite: a body frame from the atlas with the mouth patch and blink patch laid over it.
  Everything is drawn in the frame's own pixel space (origin at his feet is atlas.origin), so callers
  set up one transform and the same code draws him on stage, in the giant screen's live feed, as a
  flat silhouette for his rim light and as the black cut-out in the drop's impact frame.
*/

const DEGREES = Math.PI / 180;

// A patch at a frame point [x, y, degrees clockwise, scale], its anchor on the point
function drawPatch(ctx, images, patch, [x, y, rotation, scale]) {
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation * DEGREES);
    if (scale !== 1) ctx.scale(scale, scale);
    const [sx, sy, sw, sh] = patch.rect;
    ctx.drawImage(images[patch.page], sx, sy, sw, sh, -patch.anchor[0], -patch.anchor[1], sw, sh);
    ctx.restore();
}

/*
  Which patches a frame actually needs. A scale of 0 marks drawings where the mic is in front of his
  face, so nothing is drawn there; a missing patch falls back to the open mouth.
*/
function patchesFor(character, frame, mouth, blink) {
    const { atlas } = character;
    const mouthPatch = mouth && frame.mouth[3] > 0 ? atlas.mouths[mouth] ?? atlas.mouths.open : null;
    const blinkPatch = blink && frame.eyes[3] > 0 ? atlas.blink : null;
    return { mouthPatch, blinkPatch };
}

function makeComposer(character) {
    const [width, height] = character.atlas.frameSize;
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d');
    let key = null;
    return function compose(frame, mouthPatch, blinkPatch) {
        const next = `${frame.page}:${frame.rect}:${mouthPatch?.rect}:${blinkPatch?.rect}`;
        if (next === key) return canvas;
        key = next;
        const { images } = character;
        const [sx, sy, sw, sh] = frame.rect;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(images[frame.page], sx, sy, sw, sh, frame.offset[0], frame.offset[1], sw, sh);
        // Patches only land where the body is, so they can never spill over his jaw line
        ctx.globalCompositeOperation = 'source-atop';
        if (mouthPatch) drawPatch(ctx, images, mouthPatch, frame.mouth);
        if (blinkPatch) drawPatch(ctx, images, blinkPatch, frame.eyes);
        ctx.globalCompositeOperation = 'source-over';
        return canvas;
    };
}

// One frame-sized compositing canvas per character, made on first use
const composers = new WeakMap();

/*
  The body drawing, then the mouth for the sung shape (none means the body's own closed mouth), then
  the blink. With patches, they're composited onto a frame-sized copy clipped to the body first; that
  copy is cached, so a held drawing costs one blit a frame.
*/
export function drawCharacter(ctx, character, frame, mouth = null, blink = false) {
    const { mouthPatch, blinkPatch } = patchesFor(character, frame, mouth, blink);
    if (!mouthPatch && !blinkPatch) {
        const [sx, sy, sw, sh] = frame.rect;
        ctx.drawImage(character.images[frame.page], sx, sy, sw, sh, frame.offset[0], frame.offset[1], sw, sh);
        return;
    }
    let compose = composers.get(character);
    if (!compose) {
        compose = makeComposer(character);
        composers.set(character, compose);
    }
    ctx.drawImage(compose(frame, mouthPatch, blinkPatch), 0, 0);
}

function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = Math.max(1, Math.ceil(height));
    return canvas;
}

/*
  A flat single-colour cut-out of the current drawing, frame-sized, for the coloured rim light behind
  him and the impact frame. It's only redrawn when the drawing or colour changes (at most 12 times a
  second), so drawing it every frame is just a blit.
*/
export function createSilhouette(character) {
    const [width, height] = character.atlas.frameSize;
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d');
    let lastFrame = null;
    let lastColour = null;

    return function silhouette(frame, colour) {
        if (frame === lastFrame && colour === lastColour) return canvas;
        lastFrame = frame;
        lastColour = colour;
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, width, height);
        drawCharacter(ctx, character, frame);
        ctx.globalCompositeOperation = 'source-in';
        ctx.fillStyle = colour;
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
        return canvas;
    };
}

/*
  The camera operator's close-up for the giant screen: his head and shoulders, cropped round the
  frame's head point and drawn small, ready to be read back and turned into LED dots.
  `size` is [w, h] in pixels; the crop is `span` head heights tall.
*/
export function createHeadFeed(character, [width, height], span = 2.1) {
    const canvas = makeCanvas(width, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { headSize } = character.atlas.figure;

    function draw(frame, mouth, blink, sway = 0) {
        const scale = height / (headSize * span);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        // His face sits a little above centre, the way a camera op frames a singer
        const [hx, hy] = frame.head;
        ctx.setTransform(scale, 0, 0, scale, (width / 2) - ((hx + sway) * scale), (height * 0.36) - (hy * scale));
        ctx.imageSmoothingEnabled = true;
        drawCharacter(ctx, character, frame, mouth, blink);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        return ctx.getImageData(0, 0, width, height);
    }

    return { canvas, draw };
}
