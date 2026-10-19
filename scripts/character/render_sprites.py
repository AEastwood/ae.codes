"""Draws the rigged cartoon of Adam as a flat 2D (Jamie Hewlett / Gorillaz) sprite sheet for the canvas gig.

The 3D rig from build_character.py is only the puppet: every frame is rendered as flat cel colour (one hard shadow
tone, no lighting falloff) with Grease Pencil Line Art inking from a fixed orthographic 3/4 camera, on twos.

  1. render   blender --background --factory-startup --python scripts/character/render_sprites.py -- [--work DIR] [--test]
  2. pack     python scripts/character/render_sprites.py --pack [--work DIR] [--verify DIR]

Step 1 runs step 2 itself when a system `python` with Pillow is on PATH (Blender's Python has no Pillow).
--test renders two frames per clip into the work dir only; --look renders three stills for tuning the ink;
--verify DIR writes contact sheets and heads close-ups rebuilt from atlas.json + pages, with a patch-fit score.

Output contract (public/gig/character/, the canvas renderer depends on it):
  atlas.json  frameSize, origin (floor point between the feet), headHeight, pages, clips (Idle/Groove/Sing/Hype: 20
              frames per bar, DropJump: 16 frames over 1.3 s), mouths (closed/small/open/round/wide) and blink patches.
  Frame       rect on a page drawn at offset in frame space; mouth/eyes = [x, y, rotDeg, scale] where the patch anchor
              goes, rotDeg clockwise on screen (canvas ctx.rotate), head = head centre.
  atlas-N.webp  texture pages (<= 4096 px).
"""
import json, math, os, sys, tempfile

try:
    import bpy
except ImportError:
    bpy = None

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]


def arg(name, default=None):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


WORK = arg('--work', os.path.join(tempfile.gettempdir(), 'ae-gig-sprites'))
OUT = os.path.join(ROOT, 'public', 'gig', 'character')
TEST = '--test' in ARGS
LOOK = '--look' in ARGS          # just the closed-mouth reference and two poses, for tuning the ink

BPM = 139.1025
BAR = 240 / BPM
CLIPS = [('Idle', BAR, 20, True), ('Groove', BAR, 20, True), ('Sing', BAR, 20, True), ('Hype', BAR, 20, True),
         ('DropJump', 1.3, 16, False)]
MOUTHS = {'closed': {}, 'small': {'mouthOpen': 0.4}, 'open': {'mouthOpen': 1.0},
          'round': {'mouthOpen': 0.7, 'mouthRound': 1.0}, 'wide': {'mouthOpen': 0.6, 'mouthWide': 1.0}}

PPM = 490            # pixels per metre: ~900 px tall standing, head ~150 px
YAW = 20             # camera swings this far round to his left (+X): a front-ish 3/4 like the Hewlett band shots
TILT = 3             # degrees looking down; ortho keeps the drawing flat whatever the angle
MARGIN = 0.07        # metres of empty frame around the union of every pose (room for the ink)
LIGHT = (0.55, 0.70, 0.45)   # camera space (right, up, toward viewer): shadow falls on the narrow far side
INK_OUTER = 0.0085   # Line Art stroke radius (m) for the silhouette ...
INK_INNER = 0.0040   # ... and the inner contours, creases and material borders
INNER = os.environ.get('INK_TYPES', 'contour,crease,material,intersection').split(',')
NO_SHADOW = {'EyeWhite', 'Pupil', 'Mouth', 'Teeth', 'Tongue', 'Ink', 'Outline', 'ShirtLogo'}


# ---------------------------------------------------------------------------------------------------------------
# Blender side: build the puppet, shade it flat, ink it, render every drawing
# ---------------------------------------------------------------------------------------------------------------
def build_puppet():
    """Runs build_character.py's main() in a namespace (exporting a throwaway GLB) and hands back that namespace."""
    src = open(os.path.join(HERE, 'build_character.py'), encoding='utf-8').read()
    src = src[:src.rstrip().rfind('main()')]           # drop the trailing call so we drive it
    argv = sys.argv
    sys.argv = [argv[0], '--', '--out', os.path.join(WORK, '_puppet.glb')]
    ns = {'__file__': os.path.join(HERE, 'build_character.py'), '__name__': 'build_character'}
    exec(compile(src, 'build_character.py', 'exec'), ns)
    ns['main']()
    sys.argv = argv
    return ns


def cel_material(m, L):
    """Base colour (or its painted texture) and one hard shadow tone, emitted so nothing else shades it."""
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    base_rgb = tuple(bsdf.inputs['Base Color'].default_value)
    image = next((n.image for n in nt.nodes if n.type == 'TEX_IMAGE'), None)
    nt.nodes.clear()
    N = nt.nodes.new
    out = N('ShaderNodeOutputMaterial')
    em = N('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    if image:
        tex = N('ShaderNodeTexImage')
        tex.image = image
        base = tex.outputs['Color']
    else:
        rgb = N('ShaderNodeRGB')
        rgb.outputs[0].default_value = base_rgb
        base = rgb.outputs[0]
    if m.name in NO_SHADOW:
        nt.links.new(base, em.inputs['Color'])
        return
    # head parts carry their rest normal, so the face's shadow shape is drawn once and rides with the head
    # (that is how a drawn head behaves, and it keeps the mouth/blink patches matching every frame)
    geo = N('ShaderNodeNewGeometry')
    rest = N('ShaderNodeAttribute')
    rest.attribute_name = 'restN'
    has = N('ShaderNodeVectorMath')
    has.operation = 'LENGTH'
    nt.links.new(rest.outputs['Vector'], has.inputs[0])
    pick = N('ShaderNodeMix')
    pick.data_type = 'VECTOR'
    nt.links.new(has.outputs['Value'], pick.inputs['Factor'])
    nt.links.new(geo.outputs['Normal'], pick.inputs[4])
    nt.links.new(rest.outputs['Vector'], pick.inputs[5])
    dot = N('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    nt.links.new(pick.outputs[1], dot.inputs[0])
    dot.inputs[1].default_value = L
    step = N('ShaderNodeMath')
    step.operation = 'GREATER_THAN'
    nt.links.new(dot.outputs['Value'], step.inputs[0])
    step.inputs[1].default_value = 0.08
    # the shadow tone: darker and cooler, with a fine paper grain fixed to the frame like a printed cel
    shade = N('ShaderNodeMix')
    shade.data_type = 'RGBA'
    shade.blend_type = 'MULTIPLY'
    shade.inputs['Factor'].default_value = 1.0
    nt.links.new(base, shade.inputs[6])
    shade.inputs[7].default_value = (0.50, 0.56, 0.74, 1)
    coord = N('ShaderNodeTexCoord')
    noise = N('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 900.0
    noise.inputs['Detail'].default_value = 0.0
    nt.links.new(coord.outputs['Window'], noise.inputs['Vector'])
    grain = N('ShaderNodeMapRange')
    nt.links.new(noise.outputs['Fac'], grain.inputs['Value'])
    grain.inputs['To Min'].default_value = 0.90
    grain.inputs['To Max'].default_value = 1.08
    gmul = N('ShaderNodeMix')
    gmul.data_type = 'RGBA'
    gmul.blend_type = 'MULTIPLY'
    gmul.inputs['Factor'].default_value = 1.0
    nt.links.new(shade.outputs[2], gmul.inputs[6])
    nt.links.new(grain.outputs['Result'], gmul.inputs[7])
    mix = N('ShaderNodeMix')
    mix.data_type = 'RGBA'
    nt.links.new(step.outputs['Value'], mix.inputs['Factor'])
    nt.links.new(gmul.outputs[2], mix.inputs[6])
    nt.links.new(base, mix.inputs[7])
    nt.links.new(mix.outputs[2], em.inputs['Color'])


def add_rest_normals(ob, head_only):
    """restN = the rest-pose normal for vertices fully on the head bone (zero elsewhere, which means 'use world')."""
    me = ob.data
    vg = ob.vertex_groups.get('head')
    hw = [0.0] * len(me.vertices)
    if vg:
        for v in me.vertices:
            for g in v.groups:
                if g.group == vg.index:
                    hw[v.index] = g.weight
    vals = []
    for v in me.vertices:
        on = (not head_only) or hw[v.index] > 0.99
        vals += list(v.normal) if on else [0.0, 0.0, 0.0]
    at = me.attributes.get('restN') or me.attributes.new('restN', 'FLOAT_VECTOR', 'POINT')
    at.data.foreach_set('vector', vals)


def ink(collection, cam):
    """Line Art: a heavy silhouette and lighter inner lines, tapered and jittered so they read as brush inking."""
    gp = bpy.data.grease_pencils.new('Ink')
    ob = bpy.data.objects.new('Ink', gp)
    bpy.context.scene.collection.objects.link(ob)
    mat = bpy.data.materials.new('InkLine')
    bpy.data.materials.create_gpencil_data(mat)
    mat.grease_pencil.color = (0.006, 0.010, 0.010, 1)
    gp.materials.append(mat)
    for name in ('Outer', 'Inner'):
        gp.layers.new(name)
    ob.show_in_front = True
    for name, radius in (('Outer', INK_OUTER), ('Inner', INK_INNER)):
        la = ob.modifiers.new(name, 'LINEART')
        la.source_type = 'COLLECTION'
        la.source_collection = collection
        la.target_layer = name
        la.target_material = mat
        la.radius = radius
        inner = name == 'Inner'
        la.use_contour = (not inner) or 'contour' in INNER
        la.silhouette_filtering = 'GROUP'
        la.use_crease = inner and 'crease' in INNER
        la.use_material = inner and 'material' in INNER
        la.use_intersection = inner and 'intersection' in INNER
        la.use_invert_silhouette = name == 'Inner'
        la.use_loose = False
        la.crease_threshold = math.radians(118)
        la.smooth_tolerance = 0.05
        la.chaining_image_threshold = 0.004
        la.use_cache = False
        la.use_material_mask_bits[0] = True
    sm = ob.modifiers.new('Smooth', 'GREASE_PENCIL_SMOOTH')
    sm.factor = 0.6
    sm.step = 2
    th = ob.modifiers.new('Taper', 'GREASE_PENCIL_THICKNESS')
    th.use_custom_curve = True
    cv = th.custom_curve
    pts = cv.curves[0].points
    pts[0].location = (0.0, 0.4)
    pts[1].location = (1.0, 0.4)
    pts.new(0.15, 1.0)
    pts.new(0.85, 1.0)
    cv.update()
    nz = ob.modifiers.new('Wobble', 'GREASE_PENCIL_NOISE')
    nz.factor = float(os.environ.get('INK_WOBBLE', 0.05))
    nz.factor_thickness = 0.55
    nz.factor_strength = 0.0
    nz.noise_scale = 0.35
    nz.use_random = True
    nz.step = 30           # a new wobble per drawing, like re-inked cels, but held while a drawing holds
    nz.seed = 7
    return ob


def setup_camera(sc, ns, rig, meshes, actions):
    """One fixed ortho camera, framed on the union of every pose so all frames share one frame size."""
    import numpy as np
    from mathutils import Vector as V, Matrix as M
    R = (M.Rotation(math.radians(YAW), 3, 'Z') @ M.Rotation(math.radians(90 - TILT), 3, 'X')).to_3x3()
    Rt = R.transposed()
    lo, hi = V((1e9, 1e9)), V((-1e9, -1e9))
    dg = bpy.context.evaluated_depsgraph_get()
    for name, dur, n, _ in CLIPS:
        rig.animation_data.action = actions[name]
        for i in range(n):
            set_time(sc, dur * i / n)
            for ob in meshes:
                ev = ob.evaluated_get(dg)
                me = ev.to_mesh()
                co = np.empty(len(me.vertices) * 3, np.float32)
                me.vertices.foreach_get('co', co)
                c = co.reshape(-1, 3) @ (np.array(Rt) @ np.array(ev.matrix_world.to_3x3())).T
                c += np.array(Rt @ ev.matrix_world.translation)
                lo.x, lo.y = min(lo.x, c[:, 0].min()), min(lo.y, c[:, 1].min())
                hi.x, hi.y = max(hi.x, c[:, 0].max()), max(hi.y, c[:, 1].max())
                ev.to_mesh_clear()
    lo -= V((MARGIN, MARGIN))
    hi += V((MARGIN, MARGIN))
    W, H = int(math.ceil((hi.x - lo.x) * PPM)), int(math.ceil((hi.y - lo.y) * PPM))
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    cam_data = bpy.data.cameras.new('Cam')
    cam_data.type = 'ORTHO'
    cam_data.ortho_scale = max(W, H) / PPM
    cam_data.sensor_fit = 'AUTO'
    cam_data.clip_start, cam_data.clip_end = 0.1, 40
    cam = bpy.data.objects.new('Cam', cam_data)
    sc.collection.objects.link(cam)
    cam.matrix_world = M.Translation(R @ V((cx, cy, 15))) @ R.to_4x4()
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
    x0, y1 = cx - W / 2 / PPM, cy + H / 2 / PPM

    def project(p):
        c = Rt @ p
        return ((c.x - x0) * PPM, (y1 - c.y) * PPM)
    return cam, R, W, H, project


def set_time(sc, t):
    f = t * 60          # the clips are keyed at 60 fps
    sc.frame_set(int(math.floor(f + 1e-6)), subframe=max(0.0, f - math.floor(f + 1e-6)))


def render(sc, path):
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def blender_main():
    from mathutils import Vector as V
    os.makedirs(WORK, exist_ok=True)
    ns = build_puppet()
    sc = bpy.context.scene
    rig, body, head = bpy.data.objects['Rig'], bpy.data.objects['Body'], bpy.data.objects['Head']
    for nm in ('BodyInk', 'HeadInk'):
        bpy.data.objects.remove(bpy.data.objects[nm])   # the inverted hulls are replaced by Line Art
    actions = {a.name: a for a in bpy.data.actions}

    char = bpy.data.collections.new('Character')
    sc.collection.children.link(char)
    for ob in (body, head):
        char.objects.link(ob)
        sc.collection.objects.unlink(ob)
    # the model's own painted lines (Ink tubes) are already drawings: split them off and keep them out of the
    # Line Art so they are not outlined twice
    for ob in (head, body):
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='DESELECT')
        ob.active_material_index = ob.data.materials.find('Ink')
        bpy.ops.object.material_slot_select()
        bpy.ops.mesh.separate(type='SELECTED')
        bpy.ops.object.mode_set(mode='OBJECT')
    for ob in char.objects:
        if ob not in (head, body):
            ob.lineart.usage = 'EXCLUDE'
    # lids, eyeballs and stubble all poke through the face skin: intersection lines there are scribble, not drawing
    head.lineart.usage = 'NO_INTERSECTION'
    add_rest_normals(head, head_only=True)
    add_rest_normals(body, head_only=True)

    rig.animation_data.action = None
    cam, R, W, H, project = setup_camera(sc, ns, rig, (body, head), actions)
    L = (R @ V(LIGHT)).normalized()
    for m in bpy.data.materials:
        if m.node_tree and m.node_tree.nodes.get('Principled BSDF'):
            cel_material(m, L)
    inkob = ink(char, cam)

    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.film_transparent = True
    sc.render.filter_size = 1.0
    sc.eevee.taa_render_samples = 16
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.look = 'None'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    world = bpy.data.worlds.new('W')
    world.color = (0, 0, 0)
    sc.world = world
    keys = head.data.shape_keys.key_blocks

    def set_keys(vals):
        for kb in keys[1:]:
            kb.value = vals.get(kb.name, 0.0)

    # head-local anchor points (rest = world, since the mesh is built in place): mouth on the lip line, eyes' midpoint
    HC = ns['HC']
    mouth = V(ns['MOUTH_WORLD'])
    surf = ns['Surf'](*ns['build_head_skin'](*ns['HEAD_RES']))
    eyes = ns['eye_frames'](surf)
    eye_mid = (eyes['L']['c'] + eyes['R']['c']) / 2 + HC
    hb = rig.data.bones['head']

    def head_matrix():
        return rig.matrix_world @ rig.pose.bones['head'].matrix @ hb.matrix_local.inverted()

    def anchor(hm, p, ref=None):
        """Screen position of a head-local point plus the in-plane rotation/scale of the head around it."""
        x, y = project(hm @ p)
        d = 0.04
        ax = [a - b for a, b in zip(project(hm @ (p + V((d, 0, 0)))), (x, y))]
        az = [a - b for a, b in zip(project(hm @ (p + V((0, 0, d)))), (x, y))]
        if ref is None:
            return [x, y, 0.0, 1.0], (ax, az)
        (rx, rz) = ref
        # T maps the reference basis onto this frame's; its polar part is the patch rotation, sqrt|det| the scale
        det0 = rx[0] * rz[1] - rz[0] * rx[1]
        inv = [[rz[1] / det0, -rz[0] / det0], [-rx[1] / det0, rx[0] / det0]]
        T = [[ax[0] * inv[0][0] + az[0] * inv[1][0], ax[0] * inv[0][1] + az[0] * inv[1][1]],
             [ax[1] * inv[0][0] + az[1] * inv[1][0], ax[1] * inv[0][1] + az[1] * inv[1][1]]]
        rot = math.degrees(math.atan2(T[1][0] - T[0][1], T[0][0] + T[1][1]))
        scale = math.sqrt(abs(T[0][0] * T[1][1] - T[0][1] * T[1][0]))
        return [round(x, 2), round(y, 2), round(rot, 2), round(scale, 4)], None

    back = (R @ V((0, 0, 1))).normalized()
    # Body faces that ride the head (cap, ears, eyes, hair) never count as covering the face; the mic and hands do
    hvg = body.vertex_groups['head'].index
    on_head = [any(g.group == hvg and g.weight > 0.99 for g in v.groups) for v in body.data.vertices]
    body_head_face = [all(on_head[i] for i in pl.vertices) for pl in body.data.polygons]

    def occluded(hm, p, rx, rz):
        """Rays from the camera onto a grid over the patch's footprint on the face: anything hit well in front
        of the face plane is covering it."""
        dg = bpy.context.evaluated_depsgraph_get()
        hits = n = 0
        for i in range(-3, 4):
            for j in range(-2, 3):
                q = hm @ (p + V((rx * i / 3, 0, rz * j / 2)))
                ok, loc, _, face, ob, _ = sc.ray_cast(dg, q + back * 3, -back)
                n += 1
                if ok and ob.original.name == 'Body' and not body_head_face[face]:
                    hits += (loc - q).dot(back) > 0.02
        return hits / n > 0.1

    # --- reference pose for the patches: Idle's downbeat, the head's typical slouch, so most frames need only a
    # small turn of the patch
    rig.animation_data.action = actions['Idle']
    set_time(sc, 0.0)
    bpy.context.view_layer.update()
    hm0 = head_matrix()
    mouth0, mref = anchor(hm0, mouth)
    eyes0, eref = anchor(hm0, eye_mid)
    # head height in frame px from the rest head (skin + the cap/ears weighted to the head bone)
    ys = []
    for ob in (head, body):
        vg = ob.vertex_groups.get('head')
        for v in ob.data.vertices:
            if any(g.group == vg.index and g.weight > 0.99 for g in v.groups):
                ys.append(project(ob.matrix_world @ v.co)[1])
    head_h = max(ys) - min(ys)

    meta = {'frameSize': [W, H], 'origin': [round(c, 2) for c in project(V((0, 0, 0)))], 'headHeight': round(head_h, 1),
            'clips': {}, 'patches': {}}
    pdir = os.path.join(WORK, 'patches')
    os.makedirs(pdir, exist_ok=True)
    for name, vals in list(MOUTHS.items())[:1 if LOOK else 9] + ([] if LOOK else [('blink', {'blink': 1.0})]):
        set_keys(vals)
        bpy.context.view_layer.update()
        path = os.path.join(pdir, name + '.png')
        render(sc, path)
        if not LOOK:
            # the same drawing without ink: the patch masks come from what the fills change (line chaining, and
            # with it the wobble, shifts all over the body whenever the mouth changes)
            inkob.hide_render = True
            render(sc, os.path.join(pdir, name + '_fill.png'))
            inkob.hide_render = False
        meta['patches'][name] = {'file': path, 'anchor': (eyes0 if name == 'blink' else mouth0)[:2]}
    set_keys({})

    if LOOK:
        for name, t in (('Idle', 0.0), ('Hype', 0.3)):
            rig.animation_data.action = actions[name]
            set_time(sc, t)
            render(sc, os.path.join(WORK, f'look_{name}.png'))
        return
    fdir = os.path.join(WORK, 'frames')
    os.makedirs(fdir, exist_ok=True)
    for name, dur, n, loop in CLIPS:
        rig.animation_data.action = actions[name]
        frames = []
        for i in range(n):
            if TEST and i % (n // 2):
                continue
            set_time(sc, dur * i / n)
            hm = head_matrix()
            path = os.path.join(fdir, f'{name}_{i:02d}.png')
            render(sc, path)
            mo, ey = anchor(hm, mouth, mref)[0], anchor(hm, eye_mid, eref)[0]
            # the mic (or a hand) in front of the face: a patch would be pasted over it, so scale 0 = don't draw
            if occluded(hm, mouth, 0.045, 0.028):
                mo[3] = 0.0
            if occluded(hm, eye_mid, 0.065, 0.022):
                ey[3] = 0.0
            frames.append({'file': path, 'mouth': mo, 'eyes': ey,
                           'head': [round(c, 2) for c in project(hm @ HC)]})
        meta['clips'][name] = {'loop': loop, 'duration': round(dur, 6), 'frames': frames}
        print(f'[sprites] {name}: {len(frames)} frames')
    json.dump(meta, open(os.path.join(WORK, 'meta.json'), 'w'), indent=1)
    print(f'[sprites] rendered {W}x{H} into {WORK}')
    import subprocess, shutil
    py = shutil.which('python') or shutil.which('python3')
    if py and not TEST:          # test renders never overwrite the shipped atlas
        subprocess.run([py, os.path.abspath(__file__), '--pack', '--work', WORK] + (['--verify', arg('--verify')] if arg('--verify') else []))


# ---------------------------------------------------------------------------------------------------------------
# Pack side (system Python + Pillow): trim, cut the overlay patches, shelf-pack pages, write atlas.json
# ---------------------------------------------------------------------------------------------------------------
PAGE = 4096
PAD = 2


def patch_masks(fills, anchors, head_h):
    """Patches cover only what the face keys change in the fills (grown to take in their ink, soft-edged over
    identical flat colour, and kept near their anchor), so no unrelated line is pasted over a frame."""
    import numpy as np
    from PIL import Image, ImageFilter
    a = {k: np.asarray(v, dtype=np.int16) for k, v in fills.items()}
    h, w = a['closed'].shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]

    def diff(k):
        return (np.abs(a[k] - a['closed']).max(-1) > 10)
    mouth = np.zeros((h, w), bool)
    for k in MOUTHS:
        if k != 'closed':
            mouth |= diff(k)
    # the open eyes (cream whites + pupils) must vanish under the blink even where the lid diff misses a sliver
    c = a['closed'][..., :3]
    eye = (np.abs(c - np.array([227, 211, 154])).max(-1) < 40) | (c.max(-1) < 12)
    blink = diff('blink') | eye
    out = {}
    # ellipses (rx, ry, dx, dy as fractions of the head height) keep each patch off the jaw line (near side, on the left in this 3/4), neck and nose
    for name, m, grow, (rx, ry, dx, dy) in (('mouth', mouth, 13, (0.19, 0.095, 0.02, 0.012)),
                                            ('blink', blink, 11, (0.30, 0.10, 0.0, 0.0))):
        ax, ay = anchors[name]
        im = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(grow))
        # clipped after growing: the jaw line sits close under the mouth once the head nods
        m = (np.asarray(im) > 0) & (((xx - ax - dx * head_h) / (rx * head_h)) ** 2 + ((yy - ay - dy * head_h) / (ry * head_h)) ** 2 < 1)
        im = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
        out[name] = np.asarray(im).astype(np.float32) / 255
    return out


def inked_edge(im):
    """Every edge against the background is the outer ink line: grow the silhouette by 2 px in solid ink and
    paint the anti-aliased rim ink too (the GP-over-transparent-film composite leaves a pale halo there)."""
    import numpy as np
    from PIL import Image, ImageFilter
    im = im.convert('RGBA')
    a = np.asarray(im).copy()
    grown = np.asarray(im.getchannel('A').filter(ImageFilter.MaxFilter(5)))
    rim = a[..., 3] < 250
    a[rim, :3] = INK_RGB
    a[..., 3] = np.maximum(a[..., 3], grown)
    return Image.fromarray(a)


INK_RGB = (6, 13, 13)


def shelf_pack(sizes):
    """Tallest-first shelves; returns [(page, x, y)] and each page's used height."""
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i][1])
    place = [None] * len(sizes)
    pages = []          # [shelf_y, shelf_h, cursor_x, used_h]
    for i in order:
        w, h = sizes[i][0] + PAD, sizes[i][1] + PAD
        for p, pg in enumerate(pages):
            if pg[2] + w <= PAGE and pg[0] + h <= PAGE and h <= pg[1]:
                place[i] = (p, pg[2], pg[0])
                pg[2] += w
                break
            if pg[0] + pg[1] + h <= PAGE:
                pg[0], pg[1], pg[2] = pg[0] + pg[1], h, 0
                place[i] = (p, 0, pg[0])
                pg[2] = w
                break
        else:
            pages.append([0, h, w])
            place[i] = (len(pages) - 1, 0, 0)
    return place, [pg[0] + pg[1] for pg in pages]


def pack_main():
    import numpy as np
    from PIL import Image
    meta = json.load(open(os.path.join(WORK, 'meta.json')))
    os.makedirs(OUT, exist_ok=True)
    items = []          # (key, image)

    for name, clip in meta['clips'].items():
        for i, f in enumerate(clip['frames']):
            im = inked_edge(Image.open(f['file']))
            bb = im.getchannel('A').point(lambda v: 255 if v > 2 else 0).getbbox()
            f['_offset'] = [bb[0], bb[1]]
            items.append(((name, i), im.crop(bb)))

    imgs = {k: inked_edge(Image.open(p['file'])) for k, p in meta['patches'].items()}
    fills = {k: Image.open(p['file'][:-4] + '_fill.png').convert('RGBA') for k, p in meta['patches'].items()}
    P = meta['patches']
    masks = patch_masks(fills, {'mouth': P['closed']['anchor'], 'blink': P['blink']['anchor']}, meta['headHeight'])
    patches = {}
    for k, p in meta['patches'].items():
        mk = masks['blink' if k == 'blink' else 'mouth']
        rgba = np.asarray(imgs[k]).astype(np.float32)
        rgba[..., 3] *= mk
        im = Image.fromarray(rgba.round().clip(0, 255).astype(np.uint8))
        bb = im.getchannel('A').point(lambda v: 255 if v > 2 else 0).getbbox()
        patches[k] = {'anchor': [round(p['anchor'][0] - bb[0], 2), round(p['anchor'][1] - bb[1], 2)]}
        items.append((('patch', k), im.crop(bb)))

    place, heights = shelf_pack([im.size for _, im in items])
    pages = [Image.new('RGBA', (PAGE, h), (0, 0, 0, 0)) for h in heights]
    rects = {}
    for (key, im), (p, x, y) in zip(items, place):
        pages[p].paste(im, (x, y))
        rects[key] = (p, [x, y, im.size[0], im.size[1]])

    def save_pages(lossless, q):
        names, total = [], 0
        for p, pg in enumerate(pages):
            fn = f'atlas-{p}.webp'
            pg.save(os.path.join(OUT, fn), 'WEBP', lossless=lossless, quality=q, method=6, exact=False)
            names.append(fn)
            total += os.path.getsize(os.path.join(OUT, fn))
        return names, total
    for f in os.listdir(OUT):
        if f.startswith('atlas-') and f.endswith('.webp'):
            os.remove(os.path.join(OUT, f))
    names, total = save_pages(True, 100)
    if total > 4e6:
        names, total = save_pages(False, 90)

    atlas = {'version': 1, 'fps': 12, 'bpm': BPM, 'frameSize': meta['frameSize'], 'origin': meta['origin'],
             'headHeight': meta['headHeight'], 'pages': names, 'clips': {}, 'mouths': {}, 'blink': None}
    for name, clip in meta['clips'].items():
        frames = []
        for i, f in enumerate(clip['frames']):
            p, r = rects[(name, i)]
            frames.append({'page': p, 'rect': r, 'offset': f['_offset'], 'mouth': f['mouth'], 'eyes': f['eyes'],
                           'head': f['head']})
        c = {'loop': clip['loop']}
        c.update({'bars': 1} if clip['loop'] else {'duration': clip['duration']})
        c['frames'] = frames
        atlas['clips'][name] = c
    for k, pt in patches.items():
        p, r = rects[('patch', k)]
        entry = {'page': p, 'rect': r, 'anchor': pt['anchor']}
        if k == 'blink':
            atlas['blink'] = entry
        else:
            atlas['mouths'][k] = entry
    with open(os.path.join(OUT, 'atlas.json'), 'w') as fh:
        json.dump(atlas, fh, separators=(',', ':'))
    print(f'[sprites] {len(pages)} pages {[pg.size for pg in pages]}, {total / 1e6:.2f} MB -> {OUT}')
    if arg('--verify'):
        verify(arg('--verify'))


# ---------------------------------------------------------------------------------------------------------------
# Verification: rebuild frames from atlas.json + pages only, overlay the patches, and score their fit
# ---------------------------------------------------------------------------------------------------------------
def verify(outdir):
    import numpy as np
    from PIL import Image, ImageDraw
    os.makedirs(outdir, exist_ok=True)
    A = json.load(open(os.path.join(OUT, 'atlas.json')))
    pages = [Image.open(os.path.join(OUT, p)).convert('RGBA') for p in A['pages']]
    W, H = A['frameSize']

    def cut(e):
        x, y, w, h = e['rect']
        return pages[e['page']].crop((x, y, x + w, y + h))

    def overlay(img, patch, at):
        """Canvas semantics: translate to the anchor, rotate (clockwise deg), scale, draw the patch at -anchor."""
        x, y, rot, s = at
        if s <= 0:
            return img          # covered (mic in front): the renderer skips it too
        im = cut(patch)
        ax, ay = patch['anchor']
        big = Image.new('RGBA', (im.size[0] * 3, im.size[1] * 3))
        big.paste(im, (im.size[0], im.size[1]))
        cx, cy = im.size[0] + ax, im.size[1] + ay
        # PIL's affine maps output -> input: inverse of translate(x,y) . rotate . scale . translate(-c)
        r = math.radians(rot)
        c, sn = math.cos(r) / s, math.sin(r) / s
        a, b, d, e = c, sn, -sn, c
        m = (a, b, cx - a * x - b * y, d, e, cy - d * x - e * y)
        layer = big.transform(img.size, Image.AFFINE, m, resample=Image.BICUBIC)
        return Image.alpha_composite(img, layer)

    def frame(f):
        img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        img.paste(cut(f), tuple(f['offset']))
        return img

    bg = (226, 222, 210, 255)
    report = []
    for name, clip in A['clips'].items():
        tiles, heads, errs = [], [], []
        for i, f in enumerate(clip['frames']):
            base = frame(f)
            # fit score: pasting the closed mouth over the closed-mouth frame should change (almost) nothing
            test = overlay(base, A['mouths']['closed'], f['mouth'])
            x, y = f['mouth'][:2]
            box = (int(x - 40), int(y - 30), int(x + 40), int(y + 30))
            dif = np.abs(np.asarray(test.crop(box), np.int16) - np.asarray(base.crop(box), np.int16))[..., :3]
            if f['mouth'][3] > 0:
                errs.append(float(dif.mean()))
            shown = overlay(base, A['mouths']['open' if i % 2 == 0 else 'wide'], f['mouth'])
            if i % 5 == 2:
                shown = overlay(shown, A['blink'], f['eyes'])
            card = Image.new('RGBA', (W, H), bg)
            card = Image.alpha_composite(card, shown)
            dr = ImageDraw.Draw(card)
            ox, oy = A['origin']
            dr.line((ox - 30, oy, ox + 30, oy), fill=(200, 40, 40, 255), width=2)
            tiles.append(card)
            hx, hy = f['head']
            hh = A['headHeight']
            hc = card.crop((int(hx - hh), int(hy - hh), int(hx + hh), int(hy + hh)))
            heads.append(hc)
        hidden = sum(1 for f in clip['frames'] if f['mouth'][3] == 0)
        errs = errs or [0.0]
        report.append(f'{name}: closed-patch fit error mean {np.mean(errs):.2f} max {np.max(errs):.2f}, '
                      f'mouth hidden on {hidden}/{len(clip["frames"])} frames')
        cols = 10 if len(tiles) >= 16 else len(tiles)
        sheet(tiles, cols, 0.42, os.path.join(outdir, f'sheet_{name}.png'))
        sheet(heads, cols, 1.0, os.path.join(outdir, f'heads_{name}.png'))
    # the patches themselves
    ps = [cut(p) for p in list(A['mouths'].values()) + [A['blink']]]
    sheet([Image.alpha_composite(Image.new('RGBA', p.size, bg), p) for p in ps], len(ps), 3.0,
          os.path.join(outdir, 'patches.png'))
    open(os.path.join(outdir, 'fit.txt'), 'w').write('\n'.join(report) + '\n')
    print('\n'.join(report))


def sheet(tiles, cols, scale, path):
    from PIL import Image
    w = max(t.size[0] for t in tiles)
    h = max(t.size[1] for t in tiles)
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new('RGBA', (w * cols, h * rows), (255, 255, 255, 255))
    for i, t in enumerate(tiles):
        out.paste(t, ((i % cols) * w, (i // cols) * h))
    if scale != 1.0:
        out = out.resize((int(out.size[0] * scale), int(out.size[1] * scale)), 3)
    out.convert('RGB').save(path)


if bpy is not None:
    blender_main()
elif '--pack' in ARGS:
    pack_main()
elif '--verify' in ARGS:
    verify(arg('--verify'))
