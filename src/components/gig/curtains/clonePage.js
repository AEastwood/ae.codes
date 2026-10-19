/*
  Static copies of the live page for the curtains to be made of. `cloneNode` gets the markup but not
  the moment: canvases come out blank, CSS animations restart and transitions jump to their end. So
  after the copies are in the document, anything that looks different from the original is pinned
  to the original's current value, canvases are redrawn from the real ones, and `sync()` keeps the
  bits the page animates per frame (canvases, inline styles, the SVG mouth) matching while that's
  cheap to do.
*/

// Properties that transitions and animations on the page move, compared between the original and the copies
const PINNED = [
    'opacity',
    'visibility',
    'transform',
    'translate',
    'scale',
    'rotate',
    'filter',
    'box-shadow',
    'background-position',
    'background-color',
    'color'
];

// The --music-* beat variables, held still on the copies while they move so the folds aren't redrawn every beat
const MUSIC_VARS = ['--music-beat', '--music-bar', '--music-intensity'];

function elementsOf(root) {
    return [root, ...root.querySelectorAll('*')];
}

function copyCanvas(from, to) {
    if (!from.width || !from.height) return;
    try {
        const ctx = to.getContext('2d');
        ctx.clearRect(0, 0, to.width, to.height);
        ctx.drawImage(from, 0, 0);
    } catch {
        // A canvas we can't read (WebGL without a kept buffer, or tainted) just stays blank
    }
}

function copyAttributes(from, to) {
    for (const { name, value } of from.attributes) {
        if (name !== 'id' && to.getAttribute(name) !== value) to.setAttribute(name, value);
    }
}

/*
  Clones `source` `count` times. Each copy in `roots` is styled to sit exactly over the original
  inside a screen-sized box. The copies are decorative: hidden from assistive tech, inert and click-through.
*/
export function clonePage(source, count) {
    const rect = source.getBoundingClientRect();
    const originals = elementsOf(source);
    // Where the copy sits in its host: exactly over the original
    const placement = `position: absolute; left: ${rect.left}px; top: ${rect.top}px; width: ${rect.width}px; height: ${rect.height}px; margin: 0; pointer-events: none`;
    const copies = Array.from({ length: count }, () => {
        const copy = source.cloneNode(true);
        copy.setAttribute('aria-hidden', 'true');
        copy.inert = true;
        copy.classList.add('curtain-copy');
        return { root: copy, elements: elementsOf(copy) };
    });

    copies.forEach(({ root, elements }) => {
        root.setAttribute('style', [source.getAttribute('style'), placement].filter(Boolean).join(';'));
        elements.forEach((element, index) => {
            if (index > 0) element.removeAttribute('id');
            if (element instanceof HTMLImageElement) {
                element.loading = 'eager';
                element.decoding = 'sync';
            }
        });
    });

    // Inline styles that `pin()` adds on top of the copied ones, kept for the life of the copy
    const held = new Map();
    const transient = [];
    const rootStyles = getComputedStyle(document.documentElement);
    const musicStyle = MUSIC_VARS.map((name) => `${name}: ${rootStyles.getPropertyValue(name).trim() || '0'}`).join(';');
    let holdingMusic = false;

    // The copy's inline style: the original's, plus whatever is pinned, plus placement and held beat for the root
    const styleFor = (index) => {
        const parts = [originals[index].getAttribute('style') ?? ''];
        if (held.has(index)) parts.push(held.get(index));
        if (index === 0) parts.push(placement, holdingMusic ? musicStyle : '');
        return parts.filter(Boolean).join(';');
    };

    const setStyle = (index, style) => {
        copies.forEach(({ elements }) => {
            const element = elements[index];
            if (style) element.setAttribute('style', style);
            else element.removeAttribute('style');
        });
    };

    /*
      Call once the copies are in the document. Freezes running CSS animations on the copies at the
      original's current frame, and starts transitions from where the original's are, released on the
      next frame so they carry on rather than jumping to the end.
    */
    const pin = () => {
        const reference = copies[0]?.elements;
        if (!reference) return;
        holdingMusic = true;
        originals.forEach((original, index) => {
            if (!original.isConnected) return;
            const live = getComputedStyle(original);
            const copied = getComputedStyle(reference[index]);
            const animated = original.getAnimations?.().some((animation) => animation.animationName) ?? false;
            const differences = PINNED
                .filter((property) => live.getPropertyValue(property) !== copied.getPropertyValue(property))
                .map((property) => `${property}: ${live.getPropertyValue(property)}`);
            if (animated) {
                held.set(index, [...differences, 'animation: none'].join(';'));
            } else if (differences.length) {
                transient.push(index);
                setStyle(index, `${styleFor(index)};${differences.join(';')};transition-delay: 0s`);
            }
        });
        held.forEach((_, index) => setStyle(index, styleFor(index)));
        if (!held.has(0) && !transient.includes(0)) setStyle(0, styleFor(0));
        draw();
    };

    // Lets pinned transitions carry on from where they were pinned
    const release = () => {
        transient.splice(0).forEach((index) => setStyle(index, styleFor(index)));
    };

    const holdMusic = (hold) => {
        if (holdingMusic === hold) return;
        holdingMusic = hold;
        setStyle(0, styleFor(0));
    };

    const canvases = originals
        .map((original, index) => (original instanceof HTMLCanvasElement ? index : -1))
        .filter((index) => index >= 0);
    const draw = () => {
        canvases.forEach((index) => {
            copies.forEach(({ elements }) => copyCanvas(originals[index], elements[index]));
        });
    };

    const inline = originals
        .map((original, index) => (original.hasAttribute('style') || original instanceof SVGElement ? index : -1))
        .filter((index) => index >= 0);
    const lastStyles = new Map();

    // Per frame while the copies are flat: match the live page's canvases, inline styles and SVG shapes
    const sync = () => {
        draw();
        inline.forEach((index) => {
            const original = originals[index];
            if (!original.isConnected) return;
            if (original instanceof SVGElement) {
                copies.forEach(({ elements }) => copyAttributes(original, elements[index]));
                return;
            }
            const style = styleFor(index);
            if (lastStyles.get(index) === style) return;
            lastStyles.set(index, style);
            setStyle(index, style);
        });
    };

    return {
        roots: copies.map(({ root }) => root),
        pin,
        release,
        sync,
        holdMusic
    };
}
