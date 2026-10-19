"""Builds the Gorillaz-style (Jamie Hewlett) cartoon of Adam for the three.js gig scene and exports a GLB.

Everything is generated from code: meshes, rig, face shape keys and beat-locked dance clips.

  blender --background --factory-startup --python scripts/character/build_character.py -- [--preview DIR] [--out FILE]

Output contract (the stage depends on these names):
  meshes   Body (static shapes), Head (morph targets: mouthOpen, mouthRound, mouthWide, blink)
  bones    root > hips > spine > chest > neck > head, shoulder/upperarm/forearm/hand _L/_R, thigh/shin/foot _L/_R
  clips    Idle, Groove, Sing, Hype (exactly one bar at 139.1025 BPM, hits on every beat), DropJump (one-shot 1.3 s)
"""
import bpy, math, os, sys
from mathutils import Vector as V, Matrix as M, Euler
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = ARGS[ARGS.index('--out') + 1] if '--out' in ARGS else os.path.join(ROOT, 'public', 'models', 'adam-gorillaz.glb')
PREVIEW = ARGS[ARGS.index('--preview') + 1] if '--preview' in ARGS else None

BPM = 139.1025
BEAT = 60 / BPM
BAR = 4 * BEAT
FPS = 60
DROP_LEN = 1.3

# ---------------------------------------------------------------------------------------------------------------
# Palette (sRGB hex, sampled from the portrait) -> flat Principled materials
# ---------------------------------------------------------------------------------------------------------------
PALETTE = {
    'Skin': '#368d82', 'EyeLid': '#2c7d74', 'Stubble': '#1a4a46', 'Hair': '#2a211c',
    'Cap': '#0d1112', 'CapBand': '#46b5ad', 'CapBrim': '#b4602c',
    'EyeWhite': '#e3d39a', 'Pupil': '#050909', 'Mouth': '#24090f', 'Teeth': '#f1ead4', 'Tongue': '#c0505e',
    'Outline': '#060d0d', 'Ink': '#060d0d', 'Shirt': '#121617', 'ShirtLogo': '#d8b71f', 'Trousers': '#2b3424',
    'Shoes': '#e2dccb', 'ShoeSole': '#9c978a', 'ShoeTrim': '#173a4d', 'Wristband': '#5c9416', 'Mic': '#1b1f22',
    'MicGrille': '#a7afb0',
}


def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


def make_materials(face_tex):
    mats = {}
    for name, hexc in list(PALETTE.items()) + [('Face', PALETTE['Skin'])]:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = lin(hexc)
        if name == 'Face':
            # the face's stubble/sideburn zones are a small painted texture so their edges are soft and stippled
            tex = m.node_tree.nodes.new('ShaderNodeTexImage')
            tex.image = face_tex
            m.node_tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 1.0
        bsdf.inputs['Metallic'].default_value = 0.0
        m.diffuse_color = lin(hexc)          # Workbench previews read the viewport colour
        m.use_backface_culling = True         # exported as single-sided, which the inverted-hull outlines rely on
        mats[name] = m
    return mats


# ---------------------------------------------------------------------------------------------------------------
# Small maths helpers
# ---------------------------------------------------------------------------------------------------------------
def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def smooth(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)


def gauss(x):
    return math.exp(-x * x)


def spow(x, e):
    return math.copysign(abs(x) ** e, x)


def lerp(a, b, t):
    return a + (b - a) * t


def frame3(f, th, keep_th=False):
    """Orthonormal 3x3 with columns (f', th', f' x th') - used for hand orientation. keep_th keeps the thumb axis
    (the mic axis for the singing hand) exact and bends the finger direction instead."""
    f, th = V(f).normalized(), V(th).normalized()
    if keep_th:
        f = (f - th * f.dot(th)).normalized()
    else:
        th = (th - f * th.dot(f)).normalized()
    m = M((f, th, f.cross(th)))
    m.transpose()
    return m


# ---------------------------------------------------------------------------------------------------------------
# Mesh primitives (pure python lists so every vertex can carry weights, tags and shape-key info)
# ---------------------------------------------------------------------------------------------------------------
def sphere(fn, seg=24, rings=16):
    """UV sphere through fn(theta, phi) -> point; theta 0 at the +pole. Faces wind outward."""
    verts = [fn(0.0, 0.0)]
    for i in range(1, rings):
        for j in range(seg):
            verts.append(fn(math.pi * i / rings, 2 * math.pi * j / seg))
    verts.append(fn(math.pi, 0.0))
    faces, last = [], len(verts) - 1
    ring = lambda i, j: 1 + (i - 1) * seg + j % seg
    for j in range(seg):
        faces.append((0, ring(1, j), ring(1, j + 1)))
        faces.append((last, ring(rings - 1, j + 1), ring(rings - 1, j)))
    for i in range(1, rings - 1):
        for j in range(seg):
            faces.append((ring(i, j), ring(i + 1, j), ring(i + 1, j + 1), ring(i, j + 1)))
    return verts, faces


def blob(center, radii, rot=None, e=1.0, seg=20, rings=14, deform=None):
    """Super-ellipsoid (e<1 is boxier); deform(local) may reshape before placing."""
    rot = rot or M.Identity(3)
    c = V(center)

    def fn(th, ph):
        st, ct, sp, cp = math.sin(th), math.cos(th), math.sin(ph), math.cos(ph)
        p = V((radii[0] * spow(st, e) * spow(cp, e), radii[1] * spow(st, e) * spow(sp, e), radii[2] * spow(ct, e)))
        if deform:
            p = deform(p)
        return c + rot @ p
    return sphere(fn, seg, rings)


def cap(center, radius, axis, ang, seg=28, rings=10, ref=None):
    """Spherical cap around axis spanning polar angle ang (radians)."""
    axis = V(axis).normalized()
    ref = V(ref or (1, 0, 0))
    e1 = (ref - axis * ref.dot(axis)).normalized()
    e2 = axis.cross(e1)
    c = V(center)
    verts = [c + axis * radius]
    for i in range(1, rings + 1):
        a = ang * i / rings
        for j in range(seg):
            b = 2 * math.pi * j / seg
            verts.append(c + (axis * math.cos(a) + (e1 * math.cos(b) + e2 * math.sin(b)) * math.sin(a)) * radius)
    faces = []
    ring = lambda i, j: 1 + (i - 1) * seg + j % seg
    for j in range(seg):
        faces.append((0, ring(1, j), ring(1, j + 1)))
    for i in range(1, rings):
        for j in range(seg):
            faces.append((ring(i, j), ring(i + 1, j), ring(i + 1, j + 1), ring(i, j + 1)))
    return verts, faces


def catmull(pts, per=4):
    """Densify a polyline (points or tuples of floats) with a Catmull-Rom spline through every point."""
    if len(pts) < 3:
        per = max(per, 1)
    out = []
    n = len(pts)
    for i in range(n - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n - 1)]
        for k in range(per):
            s = k / per
            out.append(tuple(0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s * s + (-a + 3 * b - 3 * c + d) * s ** 3)
                             for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(tuple(pts[-1]))
    return out


def tube(path, radii, sides=12, up=(1, 0, 0), start='dome', end='dome', per=3, dome=4, ripple=None):
    """Swept tube along a smooth path. radii: per-point float or (rx, ry). Ends: 'dome' | 'flat' | None.
    ripple(s, angle) -> radius scale lets cloth tubes carry folds (s runs 0..1 along the path)."""
    rr = [(r, r) if isinstance(r, (int, float)) else tuple(r) for r in radii]
    dense = catmull([tuple(p) + r for p, r in zip(path, rr)], per)
    pts = [V(d[:3]) for d in dense]
    rad = [(max(d[3], 1e-4), max(d[4], 1e-4)) for d in dense]
    n = len(pts)
    tans = [(pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(n)]
    upv = V(up)
    if abs(upv.dot(tans[0])) > 0.95:
        upv = V((0, 0, 1)) if abs(tans[0].z) < 0.9 else V((0, 1, 0))
    nrm = (upv - tans[0] * upv.dot(tans[0])).normalized()
    rings_c, rings_r, frames = [], [], []
    for i in range(n):
        if i:
            nrm = tans[i - 1].rotation_difference(tans[i]) @ nrm
            nrm = (nrm - tans[i] * nrm.dot(tans[i])).normalized()
        frames.append((nrm.copy(), tans[i].cross(nrm)))
        rings_c.append(pts[i])
        rings_r.append(rad[i])
    # dome rings extend past the ends so fingers and limbs finish rounded
    pre, post = [], []
    if start == 'dome':
        for k in range(dome - 1, 0, -1):
            a = math.pi / 2 * k / dome
            pre.append((pts[0] - tans[0] * rad[0][0] * math.sin(a) * 0.9, (rad[0][0] * math.cos(a), rad[0][1] * math.cos(a)), frames[0]))
    if end == 'dome':
        for k in range(1, dome):
            a = math.pi / 2 * k / dome
            post.append((pts[-1] + tans[-1] * rad[-1][0] * math.sin(a) * 0.9, (rad[-1][0] * math.cos(a), rad[-1][1] * math.cos(a)), frames[-1]))
    ss = [0.0] * len(pre) + [i / max(1, n - 1) for i in range(n)] + [1.0] * len(post)
    allr = pre + list(zip(rings_c, rings_r, frames)) + post
    verts, faces = [], []
    for (c, (rx, ry), (fn_, fb)), sv in zip(allr, ss):
        for j in range(sides):
            a = 2 * math.pi * j / sides
            k = ripple(sv, a) if ripple else 1.0
            verts.append(c + fn_ * (rx * math.cos(a) * k) + fb * (ry * math.sin(a) * k))
    R = len(allr)
    for i in range(R - 1):
        for j in range(sides):
            a, b = i * sides + j, i * sides + (j + 1) % sides
            faces.append((a + sides, a, b, b + sides))
    if start:
        tip = pts[0] - tans[0] * rad[0][0] * 0.9 if start == 'dome' else pts[0]
        verts.append(tip)
        ci = len(verts) - 1
        for j in range(sides):
            faces.append((ci, (j + 1) % sides, j))
    if end:
        tip = pts[-1] + tans[-1] * rad[-1][0] * 0.9 if end == 'dome' else pts[-1]
        verts.append(tip)
        ci = len(verts) - 1
        base = (R - 1) * sides
        for j in range(sides):
            faces.append((ci, base + j, base + (j + 1) % sides))
    return verts, faces


def vertex_normals(verts, faces):
    ns = [V((0, 0, 0)) for _ in verts]
    for f in faces:
        for k in range(1, len(f) - 1):
            n = (verts[f[k]] - verts[f[0]]).cross(verts[f[k + 1]] - verts[f[0]])
            for i in (f[0], f[k], f[k + 1]):
                ns[i] += n
    return [n.normalized() if n.length > 1e-12 else V((0, 0, 1)) for n in ns]


INK = 1.7    # preview outline thickness multiplier (the hull never ships in the GLB)


class Builder:
    """Accumulates parts into one mesh, remembering per-vertex bone weights, tags and shape-key metadata."""

    def __init__(self):
        self.verts, self.faces, self.fmat, self.weights, self.tags, self.info, self.fuv = [], [], [], [], [], [], []

    def add(self, geo, mat, weight, tag='', hull=0.0, info=None, hull_geo=None, uv=None):
        verts, faces = geo
        base = len(self.verts)
        wf = weight if callable(weight) else (lambda p, b=weight: {b: 1.0})
        self.verts += [V(v) for v in verts]
        self.faces += [tuple(base + i for i in f) for f in faces]
        self.fmat += [mat[k] if isinstance(mat, list) else mat for k in range(len(faces))]
        self.fuv += uv if uv else [None] * len(faces)
        self.weights += [wf(V(v)) for v in verts]
        self.tags += [tag] * len(verts)
        self.info += list(info) if info else [None] * len(verts)
        if hull:
            # Inverted hull: pushed-out, flipped copy rendered single-sided = drawn ink outline that animates with the mesh
            hv, hf = hull_geo or (verts, faces)
            ns = vertex_normals([V(v) for v in hv], hf)
            b2 = len(self.verts)
            self.verts += [V(v) + n * hull * INK for v, n in zip(hv, ns)]
            self.faces += [tuple(b2 + i for i in reversed(f)) for f in hf]
            self.fmat += ['Outline'] * len(hf)
            self.fuv += [None] * len(hf)
            self.weights += [wf(V(v)) for v in hv]
            self.tags += [tag + '#hull'] * len(hv)
            self.info += list(info) if (info and not hull_geo) else [None] * len(hv)
        return base


# ---------------------------------------------------------------------------------------------------------------
# Skeleton (Blender space: Z up, character faces -Y; .L side is +X). Lanky Gorillaz proportions, ~1.8 tall.
# ---------------------------------------------------------------------------------------------------------------
J = {
    'hip': V((0, 0, 1.00)), 'spine': V((0, 0, 1.10)), 'chest': V((0, 0, 1.24)), 'neck': V((0, 0.005, 1.425)),
    'head': V((0, -0.008, 1.535)), 'top': V((0, -0.02, 1.83)),
}
SIDE = {'L': 1, 'R': -1}


def sj(side, x, y, z):
    return V((x * SIDE[side], y, z))


def side_joints(s):
    return {
        'clav': sj(s, 0.03, 0.0, 1.425), 'shoulder': sj(s, 0.150, 0.0, 1.415), 'elbow': sj(s, 0.175, 0.016, 1.10),
        'wrist': sj(s, 0.195, 0.0, 0.80), 'hand': sj(s, 0.200, -0.004, 0.66),
        'thigh': sj(s, 0.085, 0.0, 1.00), 'knee': sj(s, 0.085, -0.008, 0.555), 'ankle': sj(s, 0.085, 0.0, 0.105),
        'toe': sj(s, 0.085, -0.24, 0.04),
    }


BALL_Y = -0.17          # ball of the (huge) trainer, on the floor
SJ = {s: side_joints(s) for s in SIDE}


def bone_table():
    t = [('root', V((0, 0, 0)), V((0, 0, 0.2)), None), ('hips', J['hip'], J['spine'], 'root'),
         ('spine', J['spine'], J['chest'], 'hips'), ('chest', J['chest'], J['neck'], 'spine'),
         ('neck', J['neck'], J['head'], 'chest'), ('head', J['head'], J['top'], 'neck')]
    for s in SIDE:
        q = SJ[s]
        t += [(f'shoulder_{s}', q['clav'], q['shoulder'], 'chest'), (f'upperarm_{s}', q['shoulder'], q['elbow'], f'shoulder_{s}'),
              (f'forearm_{s}', q['elbow'], q['wrist'], f'upperarm_{s}'), (f'hand_{s}', q['wrist'], q['hand'], f'forearm_{s}'),
              (f'thigh_{s}', q['thigh'], q['knee'], 'hips'), (f'shin_{s}', q['knee'], q['ankle'], f'thigh_{s}'),
              (f'foot_{s}', q['ankle'], q['toe'], f'shin_{s}')]
    return t


BONES = bone_table()


def chain(points, bones, blend):
    """Weights blending along a polyline of joints: bones[i] owns segment i, blended across each joint."""
    pts = [V(p) for p in points]
    seg_len = [(pts[i + 1] - pts[i]).length for i in range(len(pts) - 1)]
    acc = [0.0]
    for l in seg_len:
        acc.append(acc[-1] + l)

    def fn(p):
        best, bs = 1e9, 0.0
        for i in range(len(pts) - 1):
            a, b = pts[i], pts[i + 1]
            d = b - a
            t = clamp((p - a).dot(d) / d.length_squared)
            dist = (a + d * t - p).length
            if dist < best:
                best, bs = dist, acc[i] + t * seg_len[i]
        w = {}
        prev = 1.0
        for i in range(len(bones)):
            nxt = smooth(acc[i + 1] - blend[i], acc[i + 1] + blend[i], bs) if i < len(bones) - 1 else 0.0
            v = prev - nxt
            if v > 1e-4:
                w[bones[i]] = w.get(bones[i], 0) + v
            prev = nxt
        return w
    return fn


# ---------------------------------------------------------------------------------------------------------------
# Head (head-local coordinates, origin at the skull centre, face toward -Y)
# ---------------------------------------------------------------------------------------------------------------
HC = V((0, -0.024, 1.672))
HA, HB, HC_ = 0.108, 0.121, 0.152
ZC = -0.097                  # mouth line height
MOUTH_W = 0.031              # mouth half width


def head_shape(d):
    """Unit direction -> skull/face surface point. Long squarish jaw, flat face, heavy brow."""
    x, y, z = d
    p = V((x * HA, y * HB, z * HC_))
    if z < 0:
        t = -z
        p.z *= 1.12
        sq = smooth(0.0, 0.8, t)
        p.x = HA * spow(x, 1 - 0.30 * sq) * (1 - 0.11 * t ** 2.2)    # boxy bearded jaw, still tapering to the chin
        if y > 0:
            p.y *= 1 - 0.30 * t * t
        if p.z < -0.128:
            p.z = -0.128 - (-0.128 - p.z) * 0.45                     # flat-bottomed chin
    if y < 0:
        p.y *= 0.92
        # square jaw / beard volume pushes the lower face forward so the profile isn't receding
        p.y -= 0.022 * smooth(-0.02, -0.11, p.z) * (-y) ** 1.5 * smooth(0.08, 0.02, abs(p.x))
    else:
        p.y *= 1.06
    # brow ridge, cheekbones and a slight temple pinch
    p.y -= 0.007 * gauss(p.x / 0.055) * gauss((p.z - 0.040) / 0.016) * max(0, -y)
    p.y -= 0.008 * gauss((abs(p.x) - 0.058) / 0.018) * gauss((p.z + 0.018) / 0.016) * max(0, -y)
    p.x += 0.004 * gauss((p.z + 0.018) / 0.02) * max(0, -y) * (1 if x > 0 else -1)
    p.x *= 1 - 0.05 * gauss((p.z - 0.05) / 0.03) * max(0, -y)
    return p


def head_dir(th, ph):
    return V((math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)))


def build_head_skin(seg, rings):
    return sphere(lambda th, ph: head_shape(head_dir(th, ph)), seg, rings)


class Surf:
    """Ray-casts onto the head skin from the front to place features on the face."""

    def __init__(self, verts, faces):
        self.bvh = BVHTree.FromPolygons(verts, faces)

    def front(self, x, z, off=0.0):
        hit = self.bvh.ray_cast(V((x, -1.0, z)), V((0, 1, 0)))
        if hit[0] is None:
            return None, None
        return hit[0] + hit[1] * off, hit[1]

    def side(self, sgn, y, z, off=0.0):
        hit = self.bvh.ray_cast(V((sgn, y, z)), V((-sgn, 0, 0)))
        return hit[0] + hit[1] * off, hit[1]


HEAD_RES = (64, 48)
TEX_W, TEX_H = 1024, 512


def sphere_uvs(faces, seg, rings):
    """Per-loop equirectangular UVs for a sphere() mesh, unwrapped across the phi seam and at the poles."""
    nv = 2 + (rings - 1) * seg

    def param(i):
        if i == 0:
            return None, 0.0
        if i == nv - 1:
            return None, 1.0
        r, j = divmod(i - 1, seg)
        return j / seg, (r + 1) / rings
    out = []
    for f in faces:
        ps = [param(i) for i in f]
        us = [u for u, _ in ps if u is not None]
        if max(us) - min(us) > 0.5:
            ps = [((u + 1 if u is not None and u < 0.5 else u), v) for u, v in ps]
            us = [u for u, _ in ps if u is not None]
        mid = sum(us) / len(us)
        out.append([((u if u is not None else mid), 1 - v) for u, v in ps])
    return out


def face_texture():
    """Paints skin / beard stubble / hair zones in the head's (phi, theta) UV space, with Hewlett-style stipple
    dots fading out past the beard edge."""
    import numpy as np
    lw, lh = 256, 128
    grid = np.zeros((lh + 1, lw + 1, 3))
    for r in range(lh + 1):
        th = math.pi * r / lh
        for c in range(lw + 1):
            grid[r, c] = head_shape(head_dir(th, 2 * math.pi * c / lw))[:]
    # rows run top (theta=0) to bottom; image rows are bottom-up, matching v = 1 - theta/pi
    ys = (np.arange(TEX_H) + 0.5) / TEX_H * lh
    xs = (np.arange(TEX_W) + 0.5) / TEX_W * lw
    y0, x0 = np.minimum(np.floor(ys).astype(int), lh - 1), np.minimum(np.floor(xs).astype(int), lw - 1)
    fy, fx = (ys - y0)[:, None, None], (xs - x0)[None, :, None]
    g = lambda a, b: grid[y0[:, None] + a, x0[None, :] + b]
    P = (g(0, 0) * (1 - fx) + g(0, 1) * fx) * (1 - fy) + (g(1, 0) * (1 - fx) + g(1, 1) * fx) * fy
    x, y, z = np.abs(P[..., 0]), P[..., 1], P[..., 2]
    ss = lambda e0, e1, v: (lambda t: t * t * (3 - 2 * t))(np.clip((v - e0) / (e1 - e0), 0, 1))
    # beard: below a line from the mustache up to the sideburns, minus a skin-coloured lip zone
    zl = -0.054 + 0.80 * np.maximum(0, x - 0.022)
    beard = ss(0.004, -0.004, z - zl) * ss(0.05, 0.03, y)
    lip = (x / 0.034) ** 2 + ((z - ZC) / 0.0105) ** 2
    beard *= ss(0.75, 1.15, lip)
    hair = np.maximum.reduce([
        ss(0.025, 0.04, y) * ss(-0.115, -0.10, z),                                            # nape
        ss(0.074, 0.082, x) * ss(-0.02, -0.008, z) * ss(-0.03, -0.015, y),                     # above the ears
        ss(0.083, 0.090, x) * ss(-0.052, -0.04, z) * ss(-0.035, -0.025, y) * ss(0.015, 0.005, y),  # sideburns
    ])
    rng = np.random.default_rng(7)
    dots = rng.random((TEX_H // 2, TEX_W // 2)) > 0.93
    dots = np.repeat(np.repeat(dots, 2, 0), 2, 1).astype(float)
    fade = ss(0.016, -0.010, z - zl) * ss(0.06, 0.035, y) * ss(0.5, 1.0, lip)
    col = lambda h: np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])
    skin, stub, dot, hairc = col(PALETTE['Skin']), col(PALETTE['Stubble']), col('#0f383c'), col(PALETTE['Hair'])
    img = skin * (1 - beard[..., None]) + stub * beard[..., None]
    d = (dots * np.maximum(fade, beard))[..., None]
    img = img * (1 - d * 0.8) + dot * d * 0.8
    img = img * (1 - hair[..., None]) + hairc * hair[..., None]
    rgba = np.concatenate([img, np.ones((TEX_H, TEX_W, 1))], -1)[::-1].astype(np.float32)
    im = bpy.data.images.new('FaceTex', TEX_W, TEX_H)
    im.pixels.foreach_set(np.ascontiguousarray(rgba).ravel())
    im.file_format = 'PNG'
    im.pack()
    return im


# eye placement (head local)
EYE_R = 0.0315
LID_R = 0.0348
UPPER_EDGE = math.radians(84)    # sleepy: the upper lid comes down just past the middle of the eye
LOWER_EDGE = math.radians(40)
BLINK_UP = math.radians(36)
BLINK_LO = math.radians(22)


def eye_frames(surf):
    out = {}
    for s, sg in SIDE.items():
        p, n = surf.front(0.047 * sg, 0.012)
        f = V((0.12 * sg, -1, -0.04)).normalized()
        c = p - f * 0.0115
        up = V((0, 0, 1))
        up = (up - f * up.dot(f)).normalized()
        # outer corners droop slightly - the Hewlett sleepy look
        up = M.Rotation(math.radians(-7) * sg, 3, f) @ up
        out[s] = dict(c=c, f=f, up=up, r=up.cross(f).normalized() * -1)
    return out


def build_head(B, BODY, surf):
    """Head mesh (morph parts) into B, static head parts into BODY."""
    hw = lambda p: {'head': 1.0}
    skin = build_head_skin(*HEAD_RES)
    B.add(skin, 'Face', hw, tag='skin', hull=0.0035, hull_geo=build_head_skin(44, 32), uv=sphere_uvs(skin[1], *HEAD_RES))
    eyes = eye_frames(surf)

    # --- eyes: cream balls with small black pupils sitting at the lid line
    for s, e in eyes.items():
        BODY.add(sphere(lambda th, ph, e=e: e['c'] + head_dir(th, ph) * EYE_R, 24, 16), 'EyeWhite', hw, hull=0.0014)
        look = (e['f'] - e['up'] * 0.10 - V((SIDE[s] * 0.06, 0, 0))).normalized()
        BODY.add(cap(e['c'], EYE_R * 1.012, look, math.radians(15), 16, 4, ref=e['up']), 'Pupil', hw)

    # --- heavy lids (rotate for the blink key) with an ink line along the edge
    for s, e in eyes.items():
        for which, axis, edge in (('U', e['up'], UPPER_EDGE), ('D', -e['up'], LOWER_EDGE)):
            tag = f'lid{which}_{s}'
            geo = cap(e['c'], LID_R, axis, edge, 32, 10, ref=e['f'])
            B.add(geo, 'EyeLid', hw, tag=tag, hull=0.0012)
            line = []
            for k in range(-9, 10):
                b = math.radians(9.5 * k)
                d = axis * math.cos(edge) + (e['f'] * math.cos(b) + axis.cross(e['f']) * math.sin(b)) * math.sin(edge)
                line.append(e['c'] + d * (LID_R + 0.0006))
            rad = [0.0024 if which == 'U' else 0.0010] * len(line)
            B.add(tube(line, rad, 6, up=e['f'], per=2, dome=2), 'Ink', hw, tag=tag)

    # --- eye bags: two ink crescents under each eye
    for s, e in eyes.items():
        for k, (rad, spread, drop, w) in enumerate(((1.20, 70, 0.0, 0.0011), (1.42, 50, 0.004, 0.0009))):
            pts = []
            for i in range(-6, 7):
                a = math.radians(-90 + spread * i / 6)
                d = (e['up'] * math.sin(a) + e['r'] * math.cos(a) * -1) * rad * EYE_R
                p = e['c'] + d + e['f'] * 0.006 - e['up'] * drop
                q, n = surf.front(p.x, p.z, 0.0012)
                pts.append(q if q else p)
            BODY.add(tube(pts, [w] * len(pts), 5, per=2, dome=2), 'Ink', hw)

    # --- thick flat brows, inner ends lower: bored/unimpressed
    for s, sg in SIDE.items():
        pts, rad = [], []
        for i in range(7):
            u = i / 6
            x = (0.010 + 0.072 * u) * sg
            z = 0.046 + 0.010 * math.sin(u * 2.4) + 0.002 * u
            q, n = surf.front(x, z, 0.004)
            pts.append(q)
            rad.append((0.0078 * (1 - 0.35 * u ** 2), 0.0050))
        BODY.add(tube(pts, rad, 10, up=(0, 0, 1), per=3, dome=3), 'Hair', hw, hull=0.0012)

    # --- long nose: narrow bridge from between the brows to a heavy bulb, flared wings, dark nostrils
    root, _ = surf.front(0, 0.030, -0.007)
    tip = root + V((0, -0.044, -0.080))
    bridge = [root, root + V((0, -0.014, -0.025)), root + V((0, -0.028, -0.052)), tip + V((0, 0.006, 0.010))]
    BODY.add(tube(bridge, [(0.0085, 0.009), (0.0085, 0.010), (0.011, 0.012), (0.014, 0.013)], 12, up=(1, 0, 0), per=4),
             'Skin', hw, hull=0.0018)
    BODY.add(blob(tip, (0.0165, 0.0150, 0.0140), seg=18, rings=12), 'Skin', hw, hull=0.0018)
    for sg in (1, -1):
        wing = tip + V((0.0145 * sg, 0.011, -0.003))
        BODY.add(blob(wing, (0.0095, 0.0095, 0.0080), seg=14, rings=10), 'Skin', hw, hull=0.0016)
        BODY.add(blob(tip + V((0.0068 * sg, -0.001, -0.0125)), (0.0045, 0.0040, 0.0022), seg=10, rings=6), 'Ink', hw)
    # nasolabial folds and a chin crease: ink lines on the skin (tagged skin so the jaw keys carry them)
    for sg in (1, -1):
        pts = []
        for i in range(7):
            u = i / 6
            x, z = (0.030 + 0.012 * u) * sg, ZC + 0.030 - 0.040 * u
            q, _ = surf.front(x, z, 0.0008)
            pts.append(q)
        B.add(tube(pts, [0.0007, 0.0011, 0.0012, 0.0011, 0.0009, 0.0007, 0.0004], 5, per=2, dome=2), 'Ink', hw, tag='skin_line')
    pts = []
    for i in range(7):
        x = (-1 + i / 3) * 0.012
        q, _ = surf.front(x, ZC - 0.030 - 0.002 * (1 - (x / 0.012) ** 2), 0.0008)
        pts.append(q)
    B.add(tube(pts, [0.0004, 0.0008, 0.001, 0.001, 0.001, 0.0008, 0.0004], 5, per=2, dome=2), 'Ink', hw, tag='skin_line')

    # --- ears: big, slightly sticking out
    for s, sg in SIDE.items():
        p, n = surf.side(sg, 0.012, -0.004, -0.004)
        rot = (M.Rotation(math.radians(34) * sg, 3, 'Z') @ M.Rotation(math.radians(-8), 3, 'X'))
        ear = blob(p + V((0.010 * sg, 0.006, 0)), (0.010, 0.024, 0.039), rot, e=0.9, seg=18, rings=14,
                   deform=lambda q, sg=sg: V((q.x + 0.004 * sg * (q.y / 0.02) ** 2, q.y, q.z)))
        BODY.add(ear, 'Skin', hw, hull=0.0025)
        BODY.add(blob(p + V((0.0175 * sg, 0.000, 0.0)), (0.004, 0.013, 0.023), rot, seg=12, rings=8), 'Stubble', hw)

    build_cap(BODY, hw)
    return eyes


def shape_normal(d):
    """Numerical surface normal of head_shape at unit direction d."""
    t1 = d.orthogonal().normalized()
    t2 = d.cross(t1)
    e = 1e-3
    a = head_shape((d + t1 * e).normalized()) - head_shape((d - t1 * e).normalized())
    b = head_shape((d + t2 * e).normalized()) - head_shape((d - t2 * e).normalized())
    n = a.cross(b).normalized()
    return n if n.dot(head_shape(d)) > 0 else -n


def build_cap(BODY, hw):
    """Backwards snapback: dome over the head shape cut by a tilted plane, teal strap and hair in the opening at the
    front, orange-brown brim at the back."""
    pn = V((0, 0.40, 1)).normalized()            # cap sits low at the back, high on the forehead
    pd = pn.dot(V((0, -0.10, 0.072)))
    e1 = V((1, 0, 0))
    e2 = pn.cross(e1)
    SEG, RINGS = 72, 18

    def dirv(th, ph):
        return (pn * math.cos(th) + (e1 * math.cos(ph) + e2 * math.sin(ph)) * math.sin(th)).normalized()

    def edge_theta(ph):
        lo, hi = 0.0, math.pi
        for _ in range(40):
            mid = (lo + hi) / 2
            if head_shape(dirv(mid, ph)).dot(pn) > pd:
                lo = mid
            else:
                hi = mid
        return lo

    def outer(th, ph, frac):
        d = dirv(th, ph)
        back = max(0.0, d.dot(V((0, 0.55, 0.83)).normalized()))
        return head_shape(d) + shape_normal(d) * (0.011 + 0.024 * (1 - frac ** 2) + 0.014 * back * (1 - frac))

    verts, mats_rings = [outer(0, 0, 0)], []
    rim_outer, rim_inner = [], []
    thetas = [edge_theta(2 * math.pi * j / SEG) for j in range(SEG)]
    for i in range(1, RINGS + 1):
        for j in range(SEG):
            ph = 2 * math.pi * j / SEG
            verts.append(outer(thetas[j] * i / RINGS, ph, i / RINGS))
    for j in range(SEG):
        ph = 2 * math.pi * j / SEG
        d = dirv(thetas[j], ph)
        verts.append(head_shape(d) + shape_normal(d) * 0.0008)
    ring = lambda i, j: 1 + (i - 1) * SEG + j % SEG
    faces, fm = [], []

    def front_of(j):
        ph = 2 * math.pi * j / SEG
        return -(e2.y * math.sin(ph))   # 1 at the front (forehead), -1 at the back

    jf = int(round(SEG * 0.75)) if e2.y > 0 else SEG // 4         # azimuth index of the forehead
    strap_z = verts[ring(RINGS - 2, jf)].z
    for j in range(SEG):
        faces.append((0, ring(1, j), ring(1, j + 1)))
        fm.append('Cap')
    for i in range(1, RINGS + 1):
        for j in range(SEG):
            faces.append((ring(i, j), ring(i + 1, j), ring(i + 1, j + 1), ring(i, j + 1)))
            fr = front_of(j + 0.5)
            c = sum((verts[k] for k in faces[-1]), V()) / 4
            if i >= RINGS - 2:
                fm.append('CapBand' if fr > 0.55 else 'Cap')     # snapback strap across the forehead
            else:
                fm.append('Cap')
    BODY.add((verts, faces), fm, hw, hull=0.0028)

    # arched snapback opening above the strap with the hair showing through (a decal hugging the cap front)
    cap_bvh = BVHTree.FromPolygons(verts, faces)
    av, af, NA, NR = [], [], 20, 4
    hitp = lambda x, z: cap_bvh.ray_cast(V((x, -1, z)), V((0, 1, 0)))
    h0 = hitp(0, strap_z)
    av.append(h0[0] + h0[1] * 0.0012)
    for r in range(1, NR + 1):
        for k in range(NA + 1):
            a = math.pi * k / NA
            h = hitp(0.036 * r / NR * math.cos(a), strap_z - 0.002 + 0.040 * r / NR * math.sin(a))
            av.append(h[0] + h[1] * 0.0012)
    ar = lambda r, k: 1 + (r - 1) * (NA + 1) + k
    for k in range(NA):
        af.append((0, ar(1, k), ar(1, k + 1)))
    for r in range(1, NR):
        for k in range(NA):
            af.append((ar(r, k), ar(r + 1, k), ar(r + 1, k + 1), ar(r, k + 1)))
    BODY.add((av, af), 'Hair', hw)

    # button on top
    top = outer(0, 0, 0)
    BODY.add(blob(top, (0.009, 0.009, 0.0045), seg=12, rings=6), 'Cap', hw)

    # brim at the back: arched sheet following the rim, top black, underside orange
    nb = 22
    inner, outer_e = [], []
    for k in range(nb + 1):
        w = -1 + 2 * k / nb
        ph = math.pi / 2 + w * math.radians(68)          # +e2 points to the back of the head
        th = edge_theta(ph)
        d = dirv(th, ph)
        p = head_shape(d) + shape_normal(d) * 0.011
        out_dir = V((p.x * 0.9, 1.0, -0.02)).normalized()
        L = 0.100 * math.sqrt(max(0, 1 - w * w)) ** 0.7 + 0.006
        inner.append(p)
        outer_e.append(p + out_dir * L)
    bv, bf, bm = [], [], []
    rows = 6
    for side_off, mat in ((0.0045, 'Cap'), (-0.0045, 'CapBrim')):
        b0 = len(bv)
        for r in range(rows + 1):
            for k in range(nb + 1):
                s = r / rows
                p = inner[k].lerp(outer_e[k], s)
                p.z += -0.012 * s * s + side_off
                bv.append(p)
        for r in range(rows):
            for k in range(nb):
                a = b0 + r * (nb + 1) + k
                q = (a, a + 1, a + nb + 2, a + nb + 1)
                bf.append(q if side_off > 0 else tuple(reversed(q)))
                bm.append(mat)
    # outer lip of the brim
    top0, bot0 = 0, (rows + 1) * (nb + 1)
    for k in range(nb):
        a, b = top0 + rows * (nb + 1) + k, bot0 + rows * (nb + 1) + k
        bf.append((a, b, b + 1, a + 1))
        bm.append('Cap')
    BODY.add((bv, bf), bm, hw, hull=0.0022)

    # hair mass under the cap rim at the sides/back (none on the forehead), ragged Hewlett tufts at the edge
    HS, HR = 64, 5
    hv, hf = [], []
    for i in range(HR + 1):
        for j in range(HS):
            ph = 2 * math.pi * j / HS
            back = math.sin(ph) * (1 if e2.y > 0 else -1)            # 1 at the back of the head
            sidew = abs(math.cos(ph))
            depth = 0.10 * smooth(-0.35, 0.1, back) + 0.20 * sidew * smooth(-0.30, 0.05, back)
            depth *= 0.75 + 0.25 * abs(math.sin(ph * 9 + 0.5)) ** 0.6
            th0 = edge_theta(ph) - 0.06
            th = th0 + (depth + 0.06) * i / HR
            d = dirv(th, ph)
            off = 0.0065 * (1 - 0.7 * (i / HR) ** 2) if depth > 0.01 else 0.0005
            hv.append(head_shape(d) + shape_normal(d) * off)
    for i in range(HR):
        for j in range(HS):
            a, b = i * HS + j, i * HS + (j + 1) % HS
            hf.append((a, a + HS, b + HS, b))
    BODY.add((hv, hf), 'Hair', hw, hull=0.0022)

    # chunky tapered spikes (2-D style) fanning out from under the rim: over the ears and down the nape
    import random
    rnd = random.Random(3)
    for k in range(44):
        ph = math.radians(-98 + 196 * (k + rnd.random() * 0.6) / 44) + (math.pi / 2 if e2.y > 0 else -math.pi / 2)
        d0 = dirv(edge_theta(ph) + 0.03, ph)
        base = head_shape(d0) + shape_normal(d0) * 0.004
        nrm = shape_normal(d0)
        down = V((0, 0, -1))
        tang = nrm.cross(down).normalized()
        ln = 0.040 + 0.040 * rnd.random()
        dirs = (nrm * (0.75 + 0.3 * rnd.random()) + down * (0.55 + 0.4 * rnd.random()) + tang * (rnd.random() - 0.5) * 0.9).normalized()
        mid = base + dirs * ln * 0.5 + nrm * 0.004
        tipp = base + dirs * ln + down * 0.006
        w0 = 0.011 + 0.006 * rnd.random()
        BODY.add(tube([base - nrm * 0.006, mid, tipp], [(w0, w0 * 0.55), (w0 * 0.6, w0 * 0.38), (0.0006, 0.0006)], 7, up=tang, per=2,
                      start='flat', end=None), 'Hair', hw, hull=0.0012)
    # hair tufts poking out under the cap above the ears
    for sg in (1, -1):
        for k, (y, z, ln) in enumerate(((-0.03, 0.03, 0.022), (-0.005, 0.02, 0.026), (0.02, 0.012, 0.024), (0.045, 0.0, 0.02))):
            d = V((sg * 1.0, y / HB, z / HC_)).normalized()
            p = head_shape(d)
            n = shape_normal(d)
            tipp = p + n * 0.012 + V((0, 0.006, -ln))
            BODY.add(tube([p - n * 0.002, p + n * 0.006 + V((0, 0.002, -ln * 0.4)), tipp], [0.0075, 0.005, 0.0008], 7, per=2,
                          start='flat', end=None), 'Hair', hw)


def mouth_geometry(B, surf):
    """Flat mouth decal + teeth + tongue grids. Positions per shape key are filled in later from (kind, u, v)."""
    NU, NV = 24, 8
    hw = lambda p: {'head': 1.0}
    for kind, nv, mat in (('mouth', NV, 'Mouth'), ('teeth', 3, 'Teeth'), ('tongue', 4, 'Tongue')):
        verts, faces, info = [], [], []
        span = {'mouth': 1.0, 'teeth': 0.86, 'tongue': 0.66}[kind]
        for j in range(nv + 1):
            for i in range(NU + 1):
                u = (-1 + 2 * i / NU) * span
                v = j / nv
                verts.append(V((0, 0, 0)))
                info.append((kind, u, v))
        for j in range(nv):
            for i in range(NU):
                a = j * (NU + 1) + i
                faces.append((a, a + 1, a + NU + 2, a + NU + 1))   # faces toward -Y once placed
        B.add((verts, faces), mat, hw, tag=kind, info=info)


# ---------------------------------------------------------------------------------------------------------------
# Face shape keys
# ---------------------------------------------------------------------------------------------------------------
JAW_PIVOT = V((0, 0.032, -0.078))
JAW_ANGLE = 0.40


def skin_field(key, p):
    """Displacement field applied to the skin (and its outline hull) for each mouth key."""
    q = p.copy()
    front = smooth(0.02, -0.04, p.y)
    if key == 'mouthOpen':
        w = smooth(ZC + 0.004, ZC - 0.012, p.z) * smooth(0.05, -0.02, p.y)
        rel = p - JAW_PIVOT
        q = JAW_PIVOT + M.Rotation(JAW_ANGLE * w, 3, 'X') @ rel
        q.z += 0.0035 * gauss(p.x / 0.03) * gauss((p.z - ZC - 0.012) / 0.012) * front     # upper lip lifts a touch
    elif key == 'mouthRound':
        w = gauss(math.sqrt((p.x / 0.036) ** 2 + ((p.z - ZC) / 0.026) ** 2)) * front
        q.y -= 0.009 * w
        q.x *= 1 - 0.22 * w
    elif key == 'mouthWide':
        w = gauss(math.sqrt((p.x / 0.05) ** 2 + ((p.z - ZC) / 0.03) ** 2)) * front
        q.x *= 1 + 0.16 * w
        q.z += 0.004 * w * smooth(0.0, 0.03, abs(p.x))
        q.y += 0.002 * w
    return q


def outline_2d(key, u, surf_rest):
    """Mouth outline at param u in [-1,1] for a key: (x, z_low, z_up, teeth fraction, tongue fraction)."""
    prof = math.sqrt(max(0.0, 1 - u * u))
    if key == 'rest':
        zm = ZC - 0.0030 * u * u + 0.0022 * max(0.0, u) ** 2
        h = 0.0017 * prof ** 0.5 + 0.0003
        return u * MOUTH_W, zm - h, zm + h, 0.0, 0.0
    if key == 'mouthOpen':
        x = u * MOUTH_W * 0.92
        lip, _ = surf_rest.front(x, ZC)
        dropped = skin_field('mouthOpen', lip - V((0, 0, 0.004)))
        zl = ZC + (dropped.z - ZC) * prof ** 0.7
        return x, zl, ZC + 0.0055 * prof, 0.24, 0.30
    if key == 'mouthRound':
        return u * MOUTH_W * 0.48, ZC - 0.010 * prof, ZC + 0.0075 * prof, 0.14, 0.0
    if key == 'mouthWide':
        zm = ZC + 0.0015 * u * u
        return u * MOUTH_W * 1.30, zm - 0.0065 * prof, zm + 0.0040 * prof, 0.55, 0.0
    raise KeyError(key)


def lid_rotate(p, eye, which, ang):
    axis = eye['up'].cross(eye['f']).normalized()
    a = ang if which == 'U' else -ang
    return eye['c'] + M.Rotation(a, 3, axis) @ (p - eye['c'])


def head_positions(B, key, eyes, skin_faces_idx):
    """Absolute head-local positions of every Head vertex for a key ('rest' for the basis)."""
    pos = [v.copy() for v in B.verts]
    if key in ('mouthOpen', 'mouthRound', 'mouthWide'):
        for i, t in enumerate(B.tags):
            if t.startswith('skin'):
                pos[i] = skin_field(key, B.verts[i])
    if key == 'blink':
        for i, t in enumerate(B.tags):
            if t.startswith('lid'):
                which, s = t[3], t[5]
                pos[i] = lid_rotate(B.verts[i], eyes[s], which, BLINK_UP if which == 'U' else BLINK_LO)
    # mouth decal sits on the (deformed) skin of this key
    skin_v = [pos[i] for i in range(len(pos))]
    surf_key = Surf(skin_v, skin_faces_idx)
    surf_rest = Surf(B.verts, skin_faces_idx)
    okey = key if key in ('mouthOpen', 'mouthRound', 'mouthWide') else 'rest'
    for i, inf in enumerate(B.info):
        if not inf:
            continue
        kind, u, v = inf
        x, zl, zu, tt, tg = outline_2d(okey, u, surf_rest)
        if kind == 'mouth':
            z, off = lerp(zl, zu, v), 0.0016
        elif kind == 'teeth':
            z, off = lerp(zu, zl, tt * (1 - v)), 0.0026
        else:
            z, off = lerp(zl, zu, tg * v), 0.0024
        p, n = surf_key.front(x, z, off)
        pos[i] = p
    return pos


# ---------------------------------------------------------------------------------------------------------------
# Body
# ---------------------------------------------------------------------------------------------------------------
def torso_weights(p):
    w = chain([V((0, 0, 0.85)), J['spine'], J['chest'], V((0, 0, 1.50))], ['hips', 'spine', 'chest'], [0.05, 0.06])(p)
    s = smooth(0.075, 0.14, abs(p.x)) * smooth(1.33, 1.41, p.z) * 0.85
    if s > 0:
        w = {k: v * (1 - s) for k, v in w.items()}
        w[f"shoulder_{'L' if p.x > 0 else 'R'}"] = s
    return w


def folds(amp, freq, lo=0.0, hi=1.0, seed=0.0):
    """Ripple function for tube(): cloth folds strongest between s=lo..hi."""
    return lambda sv, a: 1 + amp * smooth(lo, hi, sv) * (0.6 * math.sin(freq * a + seed + sv * 9) + 0.4 * math.sin(2.3 * freq * a - sv * 17))


def build_body(BODY):
    # baggy tee: short narrow torso, caved chest, hem hanging out over the trousers with folds
    rings = [(0.905, 0.154, 0.118), (0.96, 0.148, 0.112), (1.04, 0.134, 0.102), (1.12, 0.127, 0.091), (1.21, 0.132, 0.092),
             (1.29, 0.140, 0.093), (1.355, 0.146, 0.091), (1.393, 0.135, 0.084), (1.42, 0.098, 0.067), (1.436, 0.052, 0.044)]
    path = [V((0, 0.010 - 0.016 * smooth(1.1, 1.42, z), z)) for z, _, _ in rings]
    torso = tube(path, [(rx, ry) for _, rx, ry in rings], 30, up=(1, 0, 0), start='flat', end='flat', per=2,
                 ripple=lambda sv, a: 1 + 0.022 * smooth(0.35, 0.0, sv) * math.sin(5 * a + 0.8) * (0.4 + 0.6 * abs(math.sin(a))))
    BODY.add(torso, 'Shirt', torso_weights, hull=0.0045)
    shirt_bvh = BVHTree.FromPolygons(torso[0], torso[1])
    BODY.add(tube([V((0, -0.006, 1.425)), V((0, -0.006, 1.437))], [(0.053, 0.047), (0.051, 0.045)], 20, start=None, end=None),
             'Shirt', torso_weights)

    # yellow splat graphic on the shirt front (the logo in the portrait), with two black "eyes"
    cx, cz = 0.008, 1.17
    nring, nang = 4, 64
    verts, faces = [], []

    def splat_r(a):
        r = 0.054 * (0.78 + 0.16 * math.sin(3 * a + 0.4) + 0.10 * math.sin(7 * a + 1.3))
        spikes = max(0, math.sin(5 * a + 0.7)) ** 8 * 0.038 + max(0, math.sin(9 * a - 0.2)) ** 12 * 0.022
        drip = max(0, -math.sin(a)) ** 30 * 0.035 if abs(math.cos(a)) < 0.3 else 0
        return r + spikes + drip

    def place(x, z, off=0.0022):
        hit = shirt_bvh.ray_cast(V((x, -1, z)), V((0, 1, 0)))
        return hit[0] + hit[1] * off
    verts.append(place(cx, cz))
    for k in range(1, nring + 1):
        for j in range(nang):
            a = 2 * math.pi * j / nang
            r = splat_r(a) * k / nring
            verts.append(place(cx + r * math.cos(a), cz + r * math.sin(a) * 1.05))
    ring = lambda i, j: 1 + (i - 1) * nang + j % nang
    for j in range(nang):
        faces.append((0, ring(1, j), ring(1, j + 1)))
    for i in range(1, nring):
        for j in range(nang):
            faces.append((ring(i, j), ring(i + 1, j), ring(i + 1, j + 1), ring(i, j + 1)))
    BODY.add((verts, faces), 'ShirtLogo', torso_weights)
    for ex in (-0.015, 0.021):
        ev = [place(cx + ex, cz + 0.008, 0.0030)]
        for j in range(16):
            a = 2 * math.pi * j / 16
            ev.append(place(cx + ex + 0.008 * math.cos(a), cz + 0.008 + 0.0115 * math.sin(a), 0.0030))
        BODY.add((ev, [(0, 1 + j, 1 + (j + 1) % 16) for j in range(16)]), 'Shirt', torso_weights)

    # thin neck
    neck = tube([V((0, 0.006, 1.40)), V((0, 0.0, 1.48)), V((0, -0.012, 1.59))], [0.034, 0.032, 0.034], 14, start='flat', end='flat')
    BODY.add(neck, 'Skin', chain([V((0, 0, 1.33)), J['neck'], J['head'], V((0, 0, 1.7))], ['chest', 'neck', 'head'], [0.02, 0.03]),
             hull=0.003)

    # trousers: pelvis + stick-thin legs that bunch up in folds over the trainers
    pel = [(0.86, 0.11, 0.080), (0.90, 0.132, 0.090), (0.96, 0.136, 0.092), (1.02, 0.126, 0.084), (1.06, 0.110, 0.074)]
    BODY.add(tube([V((0, 0.003, z)) for z, _, _ in pel], [(a, b) for _, a, b in pel], 24, start='flat', end='flat'), 'Trousers',
             'hips', hull=0.0045)
    for s, q in SJ.items():
        sg = SIDE[s]
        zs = [0.99, 0.90, 0.78, 0.66, 0.59, 0.555, 0.52, 0.44, 0.34, 0.25, 0.19, 0.15, 0.115, 0.08]
        rs = [0.056, 0.050, 0.044, 0.040, 0.043, 0.047, 0.042, 0.038, 0.038, 0.041, 0.050, 0.047, 0.056, 0.061]
        path = [V((q['thigh'].x, -0.008 * smooth(0.7, 0.555, z) + 0.004 * smooth(0.5, 0.2, z), z)) for z in zs]
        legw = chain([V((q['thigh'].x, 0, 1.1)), q['thigh'], q['knee'], q['ankle']], ['hips', f'thigh_{s}', f'shin_{s}'], [0.05, 0.06])
        BODY.add(tube(path, rs, 18, start='flat', end='flat', per=2, ripple=folds(0.10, 3, 0.62, 1.0, seed=sg)), 'Trousers', legw,
                 hull=0.0045)

        # HUGE chunky trainers - the iconic stick-legs-into-big-shoes contrast
        fw = f'foot_{s}'
        sx = q['ankle'].x + 0.006 * sg

        def shoe_def(p):
            toe = smooth(-0.02, -0.15, p.y)
            return V((p.x * (1 + 0.10 * toe), p.y, p.z * (1 - 0.32 * toe) - 0.014 * toe + 0.006 * smooth(0.05, 0.15, p.y)))
        BODY.add(blob(V((sx, -0.072, 0.058)), (0.066, 0.180, 0.056), e=0.6, seg=28, rings=18, deform=shoe_def), 'Shoes', fw, hull=0.004)
        BODY.add(blob(V((sx, -0.074, 0.0205)), (0.072, 0.190, 0.020), e=0.42, seg=28, rings=10), 'ShoeSole', fw, hull=0.003)
        BODY.add(tube([V((sx, 0.006, 0.085)), V((sx, 0.002, 0.135))], [0.052, 0.050], 16, start=None, end='flat'), 'Shoes', fw, hull=0.003)
        for side_x in (1, -1):
            st = [V((sx + side_x * 0.066, y, 0.045 + 0.022 * smooth(-0.20, 0.04, y))) for y in (-0.19, -0.10, -0.02, 0.04)]
            BODY.add(tube(st, [0.006, 0.0085, 0.0085, 0.006], 6, per=2, dome=2), 'ShoeTrim', fw)
        for k in range(3):     # laces
            y = -0.06 - 0.035 * k
            BODY.add(tube([V((sx - 0.022, y, 0.103 - 0.011 * k)), V((sx + 0.022, y - 0.004, 0.103 - 0.011 * k))], [0.0045, 0.0045], 6,
                          per=1, dome=2), 'ShoeTrim', fw)

    # arms: skinny with knobbly elbows and wrists, flared baggy sleeves to mid upper-arm, big hands
    for s, q in SJ.items():
        sg = SIDE[s]
        armw = chain([q['clav'], q['shoulder'], q['elbow'], q['wrist'], q['hand']],
                     [f'shoulder_{s}', f'upperarm_{s}', f'forearm_{s}', f'hand_{s}'], [0.035, 0.045, 0.02])
        up = lambda t: q['shoulder'].lerp(q['elbow'], t)
        fo = lambda t: q['elbow'].lerp(q['wrist'], t)
        path = [up(0.12), up(0.55), up(0.92), q['elbow'], fo(0.1), fo(0.45), fo(0.85), q['wrist'], q['wrist'] - V((0, 0, 0.018))]
        BODY.add(tube(path, [0.028, 0.025, 0.026, 0.0285, 0.025, 0.0225, 0.018, 0.0185, 0.019], 12, up=(0, -1, 0), start='dome', end='flat',
                      per=2), 'Skin', armw, hull=0.003)
        sl = [q['shoulder'] + V((-0.060 * sg, 0, -0.048)), q['shoulder'] + V((-0.010 * sg, 0, -0.036)), up(0.25), up(0.48)]
        sv, sf = tube(sl, [0.046, 0.052, 0.060, 0.067], 18, up=(0, -1, 0), start='flat', end=None, per=3, ripple=folds(0.07, 4, 0.3, 1.0))
        d = (sl[-1] - sl[-2]).normalized()
        iv, ifc = tube([sl[-1] - d * 0.02, sl[-1]], [0.062, 0.065], 18, up=(0, -1, 0), start=None, end=None)
        nv = len(sv)
        faces = list(sf) + [tuple(nv + i for i in reversed(f)) for f in ifc]
        BODY.add((sv + iv, faces), 'Shirt', armw, hull=0.0045, hull_geo=(sv, sf))
        build_hand(BODY, s, q)
        if s == 'L':
            BODY.add(tube([fo(0.80), fo(0.92)], [0.0245, 0.0245], 16, start='flat', end='flat'), 'Wristband', armw, hull=0.0022)


def hand_frame(s, q):
    f = (q['hand'] - q['wrist']).normalized()
    th = V((0, -1, 0))
    th = (th - f * th.dot(f)).normalized()
    palm = f.cross(th) if s == 'L' else th.cross(f)     # palms face the body
    return f, th, palm


def build_hand(BODY, s, q):
    f, th, palm = hand_frame(s, q)
    W = q['wrist']
    HS = 1.25                                      # Hewlett hands are oversized
    L = lambda a, t, n: W + (f * a + th * t + palm * n) * HS
    hb = f'hand_{s}'
    fist = s == 'R'
    BODY.add(blob(L(0.047, 0.002, 0.0), (0.048 * HS, 0.044 * HS, 0.018 * HS), M((f, th, f.cross(th))).transposed(), e=0.72, seg=20, rings=14),
             'Skin', hb, hull=0.0028)
    knuckles = [(0.031, 0.079, 0.0094), (0.011, 0.086, 0.0098), (-0.010, 0.081, 0.0094), (-0.029, 0.066, 0.0085)]
    relaxed = [(10, 16, 12, 6), (14, 20, 14, 2), (18, 24, 16, -3), (22, 28, 18, -8)]
    grip = [(78, 92, 72, 0), (80, 94, 70, 0), (82, 96, 70, 0), (84, 98, 72, 0)]
    for k, (t0, ln, r) in enumerate(knuckles):
        c1, c2, c3, spread = (grip if fist else relaxed)[k]
        p = L(0.086, t0, 0.001)
        d = (f * math.cos(math.radians(spread)) + th * math.sin(math.radians(spread))).normalized()
        pts = [p - d * 0.012 * HS, p]
        for seg_len, curl in zip((0.42, 0.33, 0.25), (c1, c2, c3)):
            d = (M.Rotation(math.radians(curl), 3, d.cross(palm).normalized() * -1) @ d).normalized()
            pts.append(pts[-1] + d * ln * seg_len * HS)
        pts = [W + (p_ - W) * 1.0 for p_ in pts]
        BODY.add(tube(pts, [x * HS for x in (r, r, r * 0.97, r * 0.9, r * 0.82)], 8, up=palm, per=3), 'Skin', hb, hull=0.0022)
    # thumb
    if fist:
        tp = [L(0.020, 0.034, 0.010), L(0.045, 0.048, 0.024), L(0.072, 0.040, 0.040), L(0.092, 0.020, 0.046)]
    else:
        tp = [L(0.018, 0.034, 0.008), L(0.040, 0.056, 0.020), L(0.064, 0.066, 0.030), L(0.084, 0.068, 0.034)]
    BODY.add(tube(tp, [x * HS for x in (0.0125, 0.0115, 0.010, 0.009)], 8, up=palm, per=3), 'Skin', hb, hull=0.0022)
    if fist:
        build_mic(BODY, L, th, hb, HS)


MIC = {}


def build_mic(BODY, L, th, hb, HS):
    """SM58-style handheld mic gripped in the right fist; thumb side points at the grille."""
    c = L(0.094, 0.0, 0.025)
    MIC['axis'] = th.copy()
    pts = [c - th * 0.070, c - th * 0.060, c, c + th * 0.060, c + th * 0.074]
    BODY.add(tube(pts, [0.0135, 0.0142, 0.0166, 0.0192, 0.0202], 16, up=(1, 0, 0), start='flat', end='flat'), 'Mic', hb, hull=0.0022)
    BODY.add(tube([c - th * 0.071, c - th * 0.074], [0.0105, 0.0105], 16, start='flat', end='flat'), 'MicGrille', hb)
    BODY.add(tube([c + th * 0.072, c + th * 0.082], [0.0225, 0.0225], 16, start='flat', end='flat'), 'Mic', hb, hull=0.0018)
    g = c + th * 0.103
    BODY.add(blob(g, (0.028, 0.028, 0.029), seg=20, rings=14), 'MicGrille', hb, hull=0.0022)
    MIC['grille'] = g.copy()


# ---------------------------------------------------------------------------------------------------------------
# Scene assembly
# ---------------------------------------------------------------------------------------------------------------
def make_object(name, B, mats, offset=V((0, 0, 0)), keep=lambda tag: True):
    """Mesh object from the vertices whose tag passes keep(); returns (object, kept vertex indices)."""
    idx = [i for i, t in enumerate(B.tags) if keep(t)]
    remap = {i: k for k, i in enumerate(idx)}
    fsel = [n for n, f in enumerate(B.faces) if all(i in remap for i in f)]
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(B.verts[i] + offset) for i in idx], [], [tuple(remap[i] for i in B.faces[n]) for n in fsel])
    fmat = [B.fmat[n] for n in fsel]
    names = []
    for m in fmat:
        if m not in names:
            names.append(m)
    for n in names:
        me.materials.append(mats[n])
    me.polygons.foreach_set('material_index', [names.index(m) for m in fmat])
    fuv = [B.fuv[n] for n in fsel]
    if any(fuv):
        uvl = me.uv_layers.new(name='UVMap')
        flat = []
        for n, uv in zip(fsel, fuv):
            flat += [c for p in (uv or [(0.0, 0.0)] * len(B.faces[n])) for c in p]
        uvl.data.foreach_set('uv', flat)
    me.update()
    me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    groups = {}
    for k, i in enumerate(idx):
        w = B.weights[i]
        tot = sum(w.values())
        for b, x in w.items():
            groups.setdefault(b, {}).setdefault(x / tot, []).append(k)
    for b, byw in groups.items():
        vg = ob.vertex_groups.new(name=b)
        for x, ids in byw.items():
            vg.add(ids, x, 'REPLACE')
    return ob, idx


def make_rig():
    arm = bpy.data.armatures.new('Rig')
    rig = bpy.data.objects.new('Rig', arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for name, h, t, parent in BONES:
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = h, t
        eb.roll = 0
        if parent:
            eb.parent = arm.edit_bones[parent]
            eb.use_connect = (arm.edit_bones[parent].tail - eb.head).length < 1e-5
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return rig


def bind(ob, rig):
    ob.parent = rig
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig


# ---------------------------------------------------------------------------------------------------------------
# Posing: specs (body-centric, armature-space Euler degrees + IK targets) -> per-bone local transforms
# ---------------------------------------------------------------------------------------------------------------
class Poser:
    def __init__(self, rig):
        self.rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in rig.data.bones}
        self.rel = {n: (self.rest[p].inverted() @ self.rest[n]) if p else self.rest[n] for n, p in self.parent.items()}
        self.length = {b.name: b.length for b in rig.data.bones}
        self.hand_rest = {}
        for s, q in SJ.items():
            f, th, palm = hand_frame(s, q)
            self.hand_rest[s] = frame3(f, th)
        self.mic_off = MIC['grille'] - SJ['R']['wrist']

    def solve(self, spec):
        P, out = {}, {}

        def dflt(b):
            p = self.parent[b]
            return P[p] @ self.rel[b] if p else self.rest[b].copy()

        def fk(b, e=(0, 0, 0), loc=(0, 0, 0)):
            R0 = self.rest[b].to_3x3()
            Rd = Euler([math.radians(a) for a in e], 'XYZ').to_matrix()
            Rb = R0.inverted() @ Rd @ R0
            tb = R0.inverted() @ V(loc)
            P[b] = dflt(b) @ (M.Translation(tb) @ Rb.to_4x4())
            out[b] = (tb, Rb.to_quaternion())

        def setw(b, Rw):
            D = dflt(b)
            Mw = M.Translation(D.to_translation()) @ Rw.to_4x4()
            Bm = D.inverted() @ Mw
            P[b] = Mw
            out[b] = (V((0, 0, 0)), Bm.to_quaternion().normalized())

        def aim(b, d):
            D = dflt(b).to_3x3()
            y = D.col[1].normalized()
            setw(b, y.rotation_difference(d.normalized()).to_matrix() @ D)

        def ik(b1, b2, a, t, pole):
            l1, l2 = self.length[b1], self.length[b2]
            d = t - a
            dist = clamp(d.length, 1e-4, (l1 + l2) * 0.9995)
            dn = d.normalized()
            cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1)
            pn = (pole - dn * pole.dot(dn)).normalized()
            e = a + (dn * cosA + pn * math.sqrt(1 - cosA * cosA)) * l1
            aim(b1, e - a)
            aim(b2, (a + dn * dist) - e)

        def space(name):
            return M.Identity(4) if name == 'world' else P[name] @ self.rest[name].inverted()

        fk('root', (0, 0, spec['root_yaw']), spec['root'])
        fk('hips', spec['hips'], spec['hips_off'])
        for b in ('spine', 'chest', 'neck', 'head'):
            fk(b, spec[b])
        for s, sg in SIDE.items():
            up, fwd = spec[f'sh_{s}']
            fk(f'shoulder_{s}', (0, -sg * up, -sg * fwd))
        for s in SIDE:
            h = spec[f'hand_{s}']
            S = space(h['space'])
            R3 = S.to_3x3()
            Rd = frame3(R3 @ V(h['f']), R3 @ V(h['th']), 'mic' in h) @ frame3(*hand_frame(s, SJ[s])[:2], True).inverted()
            if 'mic' in h:
                wrist = S @ V(h['mic']) - Rd @ self.mic_off
            else:
                wrist = S @ V(h['w'])
            a = dflt(f'upperarm_{s}').to_translation()
            ik(f'upperarm_{s}', f'forearm_{s}', a, wrist, R3 @ V(h['pole']))
            setw(f'hand_{s}', Rd @ self.rest[f'hand_{s}'].to_3x3())
        for s, sg in SIDE.items():
            ft = spec[f'foot_{s}']
            Rf = (M.Rotation(math.radians(ft['yaw']), 3, 'Z') @ M.Rotation(math.radians(ft['pitch']), 3, 'X'))
            ball = V(ft['ball'])
            ankle = ball + Rf @ V((0, -BALL_Y, SJ[s]['ankle'].z))
            a = dflt(f'thigh_{s}').to_translation()
            pole = Rf @ V((0.12 * sg, -1, 0))
            ik(f'thigh_{s}', f'shin_{s}', a, ankle, pole)
            setw(f'foot_{s}', Rf @ self.rest[f'foot_{s}'].to_3x3())
        return out, P


# ---------------------------------------------------------------------------------------------------------------
# Choreography. t in seconds; every loop is periodic in BAR with its hits (lowest knees / nod down) on each beat.
# ---------------------------------------------------------------------------------------------------------------
def wrap(x):
    return x - math.floor(x)


def bounce(ph, fall=0.24, k=1.6):
    """1 on the beat, eased: slow rise out of the hit, quick drop into the next one."""
    ph = wrap(ph)
    if ph < 1 - fall:
        return ((1 + math.cos(math.pi * ph / (1 - fall))) / 2) ** k
    return (1 - math.cos(math.pi * (ph - (1 - fall)) / fall)) / 2


def loop_cr(keys, t, period):
    """Periodic Catmull-Rom through [(time, tuple)] keys sorted in [0, period)."""
    n = len(keys)
    t %= period
    ts = [k[0] for k in keys]
    before = [j for j in range(n) if ts[j] <= t]
    i = before[-1] if before else n - 1
    t0 = ts[i] - (period if ts[i] > t else 0)
    t1 = ts[(i + 1) % n] + (period if i == n - 1 else 0) - (period if ts[i] > t else 0)
    s = (t - t0) / (t1 - t0)
    p0, p1, p2, p3 = (keys[(i + k) % n][1] for k in (-1, 0, 1, 2))
    return tuple(0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s * s + (-a + 3 * b - 3 * c + d) * s ** 3)
                 for a, b, c, d in zip(p0, p1, p2, p3))


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


MOUTH_WORLD = V((0, 0, 0))


def stand():
    """Base Gorillaz slouch: hips pushed forward, chest caved, head jutting forward on the thin neck."""
    return dict(
        root=(0, 0, 0), root_yaw=0.0, hips_off=(0, -0.055, -0.022), hips=(-12, 0, 0),
        spine=(3, 0, 0), chest=(17, 0, 0), neck=(24, 0, 0), head=(-29, 0, 0),
        sh_L=(-3, 10), sh_R=(-3, 10),
        hand_L=dict(space='chest', w=(0.19, -0.05, 0.84), f=(0.05, -0.25, -1), th=(0.15, -1, 0.1), pole=(0.4, 1, -0.3)),
        hand_R=dict(space='chest', mic=(-0.05, -0.23, 1.30), th=(0.08, 0.25, 1), f=(0.9, -0.45, 0.0), pole=(-1, 0.4, -0.6)),
        foot_L=dict(ball=(0.125, BALL_Y + 0.01, 0), yaw=12, pitch=0), foot_R=dict(ball=(-0.125, BALL_Y + 0.025, 0), yaw=-12, pitch=0),
    )


def idle(t):
    ph = t / BEAT
    bar = 2 * math.pi * t / BAR
    s = stand()
    sway = math.sin(bar)
    s['hips_off'] = (0.020 * sway, -0.055, -0.022 - 0.013 * bounce(ph))
    s['hips'] = (-12, 3.0 * sway, 4 * math.sin(bar - 0.6))
    s['spine'] = (3 + 1.2 * bounce(ph - 0.03), -1.6 * sway, -1.5 * math.sin(bar - 0.8))
    s['chest'] = (17 + 1.2 * math.sin(2 * bar - 0.5), -1.6 * math.sin(bar - 0.3), -3 * math.sin(bar - 1.0))
    s['neck'] = (24 + 1.5 * bounce(ph - 0.05), 0, 2 * math.sin(bar - 1.2))
    s['head'] = (-29 + 4.5 * bounce(ph - 0.07), 2.5 + 3 * math.sin(bar - 1.4), 6 * math.sin(bar - 1.6))
    s['sh_L'] = (2.5 * bounce(ph - 0.1), 1.0 * math.sin(bar - 1))
    s['sh_R'] = (1.5 * bounce(ph - 0.12), 0)
    s['hand_L']['w'] = (0.19 + 0.010 * math.sin(bar - 1.0), -0.05 - 0.025 * math.sin(bar - 1.3), 0.84 + 0.008 * bounce(ph - 0.15))
    s['hand_R']['mic'] = (-0.05 + 0.006 * math.sin(bar - 1.2), -0.23, 1.30 + 0.010 * bounce(ph - 0.1))
    return s


def groove(t):
    ph = t / BEAT
    alt = math.cos(math.pi * t / BEAT)                  # +1 on beats 1 & 3, -1 on 2 & 4: side-to-side per beat
    altl = math.cos(math.pi * (t / BEAT - 0.18))        # same, lagging: upper body follows the hips
    altl2 = math.cos(math.pi * (t / BEAT - 0.32))
    roll = math.pi * t / BEAT
    bt = bounce(ph, 0.26)
    s = stand()
    s['hips_off'] = (0.016 * alt, -0.055, -0.030 - 0.055 * bt)
    s['hips'] = (-12 - 3 * bt, 3.5 * alt, 8 * alt)
    s['spine'] = (3 + 3.5 * bounce(ph - 0.03, 0.26), -2 * altl, -3.5 * altl)
    s['chest'] = (17 + 2.5 * bounce(ph - 0.06, 0.26), -2.5 * altl, -6 * altl2)
    s['neck'] = (24 + 3 * bounce(ph - 0.08), 0, -2 * altl2)
    s['head'] = (-30 + 11 * bounce(ph - 0.09, 0.28) - 2.5 * bounce(ph - 0.45, 0.3), 6 + 4 * altl2, 5 * altl2)
    s['sh_L'] = (7 * math.sin(roll), 5 * math.cos(roll))
    s['sh_R'] = (7 * math.sin(roll + math.pi), 5 * math.cos(roll + math.pi))
    s['hand_L'] = dict(space='chest', w=(0.20 + 0.012 * altl, -0.06 - 0.085 * altl2, 0.86 + 0.06 * bounce(ph - 0.16, 0.3)),
                       f=(0.1, -0.35 - 0.4 * altl2, -1), th=(0.2, -1, 0.15), pole=(0.4, 1, -0.3))
    s['hand_R'] = dict(space='chest', mic=(-0.09, -0.22 - 0.01 * altl, 1.22 + 0.028 * bounce(ph - 0.13, 0.3)), th=(0.2, 0.0, 1),
                       f=(0.85, -0.5, 0.0), pole=(-1, 0.5, -0.5))
    lift = max(0.0, -math.cos(2 * math.pi * ph)) ** 1.5      # off-beat heel taps, alternating feet
    s['foot_L']['pitch'] = 13 * lift * (0.5 + 0.5 * math.cos(math.pi * (t / BEAT - 0.5)))
    s['foot_R']['pitch'] = 13 * lift * (0.5 - 0.5 * math.cos(math.pi * (t / BEAT - 0.5)))
    return s


SING_GESTURE = [  # (beat, wrist, finger dir, thumb dir) in chest space: reach, heart, out, up
    (-0.15, (0.30, -0.36, 1.24), (0.25, -1, 0.2), (1, 0.1, 0.35)),
    (0.85, (0.12, -0.25, 1.26), (-0.65, -0.55, 0.35), (0.25, 0.0, 1)),
    (1.85, (0.42, -0.17, 1.16), (0.85, -0.4, 0.3), (0.1, -0.2, 1)),
    (2.85, (0.26, -0.28, 1.47), (0.2, -0.55, 0.85), (0.4, -0.8, 0.1)),
]


def sing(t):
    ph = t / BEAT
    bar = 2 * math.pi * t / BAR
    bt = bounce(ph)
    s = stand()
    s['hips_off'] = (0.012 * math.sin(bar), -0.03, -0.028 - 0.028 * bt)
    s['hips'] = (-8 - 2 * bt, 2 * math.sin(bar), 4 * math.sin(bar - 0.4))
    s['spine'] = (6 + 2 * bounce(ph - 0.03), 0, 0)
    s['chest'] = (14 + 2 * bounce(ph - 0.05), -2 * math.sin(bar - 0.6), -5 * math.sin(bar - 0.7))
    s['neck'] = (18 + 2.5 * bounce(ph - 0.07), 0, 0)
    s['head'] = (-24 + 7 * bounce(ph - 0.09), 4 * math.sin(bar - 1.0), 5 * math.sin(bar - 1.1))
    s['sh_R'] = (6, 4)
    s['sh_L'] = (3 + 4 * bounce(ph - 0.1), 0)
    keys = [(b * BEAT, w + f + th) for b, w, f, th in SING_GESTURE]
    keys = [((k + BAR) % BAR, v) for k, v in keys]
    keys.sort()
    wv = loop_cr(keys, t, BAR)
    ov = loop_cr(keys, t - 0.07, BAR)                    # hand orientation trails the wrist (follow-through)
    s['hand_L'] = dict(space='chest', w=wv[:3], f=ov[3:6], th=ov[6:9], pole=(1, 0.3, -0.6))
    m = MOUTH_WORLD
    # mic at chin height, off to his right, angled up at the mouth: the front camera still sees the lip-sync
    s['hand_R'] = dict(space='head', mic=(m.x - 0.052, m.y - 0.032, m.z - 0.050), th=(0.38, 0.30, 0.88), f=(0.85, -0.5, 0.0),
                       pole=(-1, 0.25, -0.9))
    return s


def hype(t):
    ph = wrap(t / BEAT)
    alt = math.cos(math.pi * t / BEAT)
    a0, a1, H = 0.17, 0.79, 0.075
    air = (ph - a0) / (a1 - a0) if a0 < ph < a1 else None
    rz = H * 4 * air * (1 - air) if air is not None else 0.0
    if ph >= a1:
        comp = (1 - math.cos(math.pi * (ph - a1) / (1 - a1))) / 2
    elif ph <= a0:
        comp = (1 + math.cos(math.pi * ph / a0)) / 2
    else:
        comp = 0.0
    bang = bounce(ph - 0.04, 0.3, 1.3)
    s = stand()
    s['root'] = (0, 0, rz)
    s['hips_off'] = (0.012 * alt, -0.02, -0.022 - 0.10 * comp)
    s['hips'] = (-6 - 4 * comp, 4 * alt, 7 * alt)
    s['spine'] = (6 + 8 * comp, -2 * alt, -3 * alt)
    s['chest'] = (12 + 6 * bounce(ph - 0.05, 0.3), -3 * alt, -5 * alt)
    s['neck'] = (16 + 10 * bang, 0, 0)
    s['head'] = (-30 + 26 * bang, 5 * math.cos(math.pi * (t / BEAT - 0.2)), 0)
    s['sh_L'] = (10 * bang, 0)
    s['sh_R'] = (6 * bang, 3)
    pump = bounce(ph + 0.02, 0.4, 1.2)                    # fist punches up on the beat
    s['hand_L'] = dict(space='chest', w=(lerp(0.23, 0.19, pump), lerp(-0.10, -0.08, pump), lerp(1.50, 1.98, pump)),
                       f=(0.0, lerp(-0.35, -0.1, pump), 1), th=(-1, -0.1, 0.1), pole=(0.7, 0.3, -1))
    m = MOUTH_WORLD   # shouting: the mic rides the chest, so the head bangs down into it
    s['hand_R'] = dict(space='chest', mic=(m.x - 0.012, m.y - 0.13, m.z - 0.035), th=(0.12, 0.40, 0.91), f=(0.85, -0.5, 0.0),
                       pole=(-1, 0.3, -0.8))
    tuck = math.sin(math.pi * air) if air is not None else 0.0
    even = 0.5 + 0.5 * alt
    s['foot_L'] = dict(ball=(0.135, BALL_Y + 0.01, rz + tuck * (0.02 + 0.03 * even)), yaw=11, pitch=8 * tuck)
    s['foot_R'] = dict(ball=(-0.135, BALL_Y + 0.025, rz + tuck * (0.02 + 0.03 * (1 - even))), yaw=-11, pitch=8 * tuck)
    return s


def flat_spec(s):
    """Spec dict <-> flat float list for Catmull-Rom over key poses."""
    out = []
    for k in sorted(s):
        v = s[k]
        if isinstance(v, dict):
            for kk in sorted(v):
                if kk != 'space':
                    out += list(v[kk]) if isinstance(v[kk], (tuple, list)) else [v[kk]]
        else:
            out += list(v) if isinstance(v, (tuple, list)) else [v]
    return out


def unflat_spec(template, vals):
    s, i = {}, 0
    for k in sorted(template):
        v = template[k]
        if isinstance(v, dict):
            d = {}
            for kk in sorted(v):
                if kk == 'space':
                    d[kk] = v[kk]
                elif isinstance(v[kk], (tuple, list)):
                    d[kk] = tuple(vals[i:i + len(v[kk])])
                    i += len(v[kk])
                else:
                    d[kk] = vals[i]
                    i += 1
            s[k] = d
        elif isinstance(v, (tuple, list)):
            s[k] = tuple(vals[i:i + len(v)])
            i += len(v)
        else:
            s[k] = vals[i]
            i += 1
    return s


def drop_keys():
    h0 = hype(0.0)

    def pose(**kw):
        s = hype(0.0)
        for k, v in kw.items():
            if isinstance(v, dict):
                s[k] = dict(s[k], **v)
            else:
                s[k] = v
        return s
    crouch = pose(hips_off=(0, 0.035, -0.215), hips=(-6, 0, 0), spine=(22, 0, 0), chest=(14, 0, 0), neck=(12, 0, 0), head=(2, 0, 0),
                  sh_L=(-4, -6), sh_R=(-4, -6),
                  hand_L=dict(w=(0.22, 0.15, 1.00), f=(0.1, 0.6, -1), th=(0, -1, 0)),
                  hand_R=dict(mic=(-0.22, 0.12, 1.05), th=(0.0, -0.3, 1), f=(0.3, 0.6, -1)))
    push = pose(hips_off=(0, 0, 0.0), hips=(0, 0, 0), spine=(2, 0, 0), chest=(-2, 0, 0), neck=(4, 0, 0), head=(-22, 0, 0),
                sh_L=(8, 6), sh_R=(8, 6),
                hand_L=dict(w=(0.27, -0.30, 1.60), f=(0.2, -0.5, 1), th=(-1, 0, 0)),
                hand_R=dict(mic=(-0.27, -0.34, 1.63), th=(0.0, -0.4, 1), f=(-0.3, -0.5, 1)))
    apex = pose(hips_off=(0, 0, 0.0), hips=(-8, 0, 0), spine=(-6, 0, 0), chest=(-8, 0, 0), neck=(0, 0, 0), head=(-26, 4, 0),
                sh_L=(12, 0), sh_R=(12, 0),
                hand_L=dict(w=(0.70, -0.07, 1.72), f=(1, -0.1, 0.45), th=(0, -1, 0.2)),
                hand_R=dict(mic=(-0.76, -0.12, 1.78), th=(0, -0.2, 1), f=(-1, -0.1, 0.35)))
    reach = pose(hips_off=(0, 0, -0.01), spine=(4, 0, 0), chest=(2, 0, 0), neck=(6, 0, 0), head=(-12, 0, 0), sh_L=(4, 0), sh_R=(4, 0),
                 hand_L=dict(w=(0.50, -0.12, 1.28), f=(0.8, -0.3, -0.2), th=(0, -1, 0)),
                 hand_R=dict(mic=(-0.44, -0.25, 1.42), th=(0.0, -0.2, 1), f=(-0.8, -0.4, 0)))
    land = pose(hips_off=(0, 0.025, -0.19), hips=(-5, 0, 0), spine=(20, 0, 0), chest=(14, 0, 0), neck=(14, 0, 0), head=(6, 0, 0),
                sh_L=(-2, -4), sh_R=(-2, -4),
                hand_L=dict(w=(0.30, -0.22, 1.08), f=(0.4, -0.6, -0.5), th=(0, -1, 0.3)),
                hand_R=dict(mic=(-0.16, -0.30, 1.25), th=(0.2, 0.3, 0.9), f=(0.8, -0.5, 0)))
    return [(0.0, h0), (0.30, crouch), (0.43, push), (0.69, apex), (0.92, reach), (1.06, land), (DROP_LEN, h0)]


DROP_T0, DROP_T1, DROP_H = 0.445, 0.935, 0.42


def drop_jump(t):
    keys = drop_keys()
    tmpl = keys[0][1]
    flats = [(k, flat_spec(s)) for k, s in keys]
    n = len(flats)
    for i in range(n - 1):
        if flats[i][0] <= t <= flats[i + 1][0] or i == n - 2:
            t0, t1 = flats[i][0], flats[i + 1][0]
            u = clamp((t - t0) / (t1 - t0))
            p0, p1, p2, p3 = (flats[max(0, min(n - 1, i + k))][1] for k in (-1, 0, 1, 2))
            vals = [0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u ** 3)
                    for a, b, c, d in zip(p0, p1, p2, p3)]
            break
    s = unflat_spec(tmpl, vals)
    # ballistic flight with knees tucked
    if DROP_T0 < t < DROP_T1:
        a = (t - DROP_T0) / (DROP_T1 - DROP_T0)
        rz = DROP_H * 4 * a * (1 - a)
        tuck = 0.17 * math.sin(math.pi * a) ** 1.3
    else:
        rz, tuck = 0.0, 0.0
    s['root'] = (0, 0, rz)
    s['foot_L'] = dict(s['foot_L'], ball=(0.135 + 0.03 * tuck / 0.17, BALL_Y + 0.01, rz + tuck))
    s['foot_R'] = dict(s['foot_R'], ball=(-0.135 - 0.03 * tuck / 0.17, BALL_Y + 0.025, rz + tuck * 0.85))
    s['foot_L']['pitch'] = 25 * tuck / 0.17
    s['foot_R']['pitch'] = 25 * tuck / 0.17
    return s


CLIPS = [('Idle', idle, BAR, 64), ('Groove', groove, BAR, 64), ('Sing', sing, BAR, 64), ('Hype', hype, BAR, 96),
         ('DropJump', drop_jump, DROP_LEN, 78)]


def bake_clips(rig, poser):
    from bpy_extras import anim_utils
    ad = rig.animation_data_create()
    actions = {}
    for name, fn, dur, n in CLIPS:
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        ad.action = act
        prev = {}
        for i in range(n + 1):
            t = dur * i / n
            vals, _ = poser.solve(fn(t))
            for b, (loc, q) in vals.items():
                pb = rig.pose.bones[b]
                if b in prev and prev[b].dot(q) < 0:
                    q = -q                             # keep quaternion hemispheres continuous
                prev[b] = q
                pb.rotation_quaternion = q
                pb.keyframe_insert('rotation_quaternion', frame=t * FPS, group=b)
                if b in ('root', 'hips'):
                    pb.location = loc
                    pb.keyframe_insert('location', frame=t * FPS, group=b)
        cb = anim_utils.action_get_channelbag_for_slot(act, ad.action_slot)
        for fc in cb.fcurves:
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR'
        actions[name] = act
        ad.action = None
    # one NLA track per clip so each exports as its own glTF animation
    for name, act in actions.items():
        tr = ad.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 0, act)
        tr.mute = True
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    return actions


# ---------------------------------------------------------------------------------------------------------------
# Previews (Workbench, flat toon-ish)
# ---------------------------------------------------------------------------------------------------------------
def look(cam, loc, target):
    cam.location = loc
    cam.rotation_euler = (V(target) - V(loc)).to_track_quat('-Z', 'Y').to_euler()


def render_to(path, res=(720, 900)):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def load_rgba(path):
    import numpy as np
    im = bpy.data.images.load(path)
    w, h = im.size
    a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, im.channels)
    if im.channels == 3:
        a = np.concatenate([a, np.ones((h, w, 1), np.float32)], -1)
    bpy.data.images.remove(im)
    return a


def save_rgba(a, out):
    img = bpy.data.images.new('sheet', a.shape[1], a.shape[0])
    img.pixels.foreach_set(a.ravel())
    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def contact_sheet(paths, out, cols, cleanup=True):
    import numpy as np
    arr = [load_rgba(p) for p in paths]
    h, w = arr[0].shape[:2]
    rows = (len(arr) + cols - 1) // cols
    canvas = np.ones((rows * h, cols * w, 4), dtype=np.float32)
    for k, a in enumerate(arr):
        r, c = divmod(k, cols)
        canvas[(rows - 1 - r) * h:(rows - r) * h, c * w:(c + 1) * w] = a
    save_rgba(canvas, out)
    if cleanup:
        for p in paths:
            os.remove(p)


def side_by_side(paths, out, height=900):
    """Images scaled (nearest) to one height and placed left to right."""
    import numpy as np
    tiles = []
    for p in paths:
        a = load_rgba(p)
        h, w = a.shape[:2]
        nw = int(w * height / h)
        ys = (np.arange(height) * h / height).astype(int)
        xs = (np.arange(nw) * w / nw).astype(int)
        tiles.append(a[ys][:, xs])
    save_rgba(np.concatenate(tiles, 1), out)


def toon_matcap(path):
    """Two-tone cel matcap (lit / shadow with a hard terminator) so Workbench previews read like flat drawings."""
    import numpy as np
    n = 256
    yy, xx = np.mgrid[0:n, 0:n]
    x, y = (xx + 0.5) / n * 2 - 1, (yy + 0.5) / n * 2 - 1
    r2 = x * x + y * y
    z = np.sqrt(np.clip(1 - r2, 0, 1))
    L = np.array([-0.45, 0.55, 0.70])
    L = L / np.linalg.norm(L)
    d = x * L[0] + y * L[1] + z * L[2]
    v = np.where(d > 0.18, 1.0, 0.70)
    rgba = np.stack([v, v, v, np.ones_like(v)], -1).astype(np.float32)
    save_rgba(rgba, path)
    return path


def previews(rig, head, actions, outdir):
    os.makedirs(outdir, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    mc = toon_matcap(os.path.join(outdir, '_toon_matcap.png'))
    sl = bpy.context.preferences.studio_lights.load(mc, 'MATCAP')
    sh.light = 'MATCAP'
    sh.studio_light = sl.name
    sh.color_type = 'TEXTURE'
    sh.show_backface_culling = True
    sh.show_shadows = False
    sh.show_cavity = False
    sc.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('W')
    world.color = (0.78, 0.78, 0.78)
    sc.world = world
    cam_data = bpy.data.cameras.new('Cam')
    cam = bpy.data.objects.new('Cam', cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam_data.lens = 85
    ad = rig.animation_data
    target = V((0, 0, 0.95))

    def at(angle_deg, dist, tgt, h=0.0):
        a = math.radians(angle_deg)
        return V((tgt.x + math.sin(a) * dist, tgt.y - math.cos(a) * dist, tgt.z + h))

    # "rest" views show the idle slouch at the downbeat (the bind pose is a straight T-less A-pose for skinning)
    ad.action = actions['Idle']
    sc.frame_set(0)
    for nm, ang in (('rest_front', 0), ('rest_34', 35), ('rest_side', 90), ('rest_back', 180)):
        look(cam, at(ang, 6.2, target, 0.1), target)
        render_to(os.path.join(outdir, nm + '.png'))
    ad.action = None
    sc.frame_set(0)
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    look(cam, at(0, 6.2, target, 0.1), target)
    render_to(os.path.join(outdir, 'bind_front.png'))
    ref = os.path.join(os.path.dirname(os.path.normpath(outdir)), 'gorillaz-ref', 'ref2.png')
    portrait = os.path.join(os.path.dirname(os.path.normpath(outdir)), 'images', 'me-gorillaz.png')
    # face close-ups with each key at 1 (and the combos the stage uses), head in the idle pose
    ad.action = actions['Idle']
    sc.frame_set(0)
    hm = rig.pose.bones['head'].matrix @ rig.data.bones['head'].matrix_local.inverted()
    face = hm @ (HC + V((0, 0, -0.02)))
    fwd = (hm.to_3x3() @ V((0, -1, 0))).normalized()
    keys = head.data.shape_keys.key_blocks
    shots = [('rest', {}), ('mouthOpen', {'mouthOpen': 1}), ('mouthRound', {'mouthRound': 1}), ('mouthWide', {'mouthWide': 1}),
             ('blink', {'blink': 1}), ('open+round', {'mouthOpen': 1, 'mouthRound': 1}), ('open+wide', {'mouthOpen': 1, 'mouthWide': 1}),
             ('half-open', {'mouthOpen': 0.5})]
    for view, ang in (('front', 0), ('34', 32)):
        paths = []
        for nm, vals in shots:
            for kb in keys[1:]:
                kb.value = vals.get(kb.name, 0.0)
            bpy.context.view_layer.update()
            d = M.Rotation(math.radians(ang), 3, 'Z') @ fwd
            look(cam, face + d * 1.3 + V((0, 0, 0.02)), face)
            paths.append(render_to(os.path.join(outdir, f'_face_{nm}_{view}.png'), (420, 420)))
        contact_sheet(paths, os.path.join(outdir, f'face_keys_{view}.png'), 4)
    for kb in keys[1:]:
        kb.value = 0
    d = M.Rotation(math.radians(22), 3, 'Z') @ fwd
    look(cam, face + d * 1.45 + V((0, 0, 0.03)), face)
    render_to(os.path.join(outdir, 'face_closeup.png'), (700, 700))
    if os.path.exists(portrait):
        side_by_side([os.path.join(outdir, 'face_closeup.png'), portrait], os.path.join(outdir, 'compare_face.png'), 700)
    # animation contact sheets
    for name, fn, dur, n in CLIPS:
        ad.action = actions[name]
        frames = 8 if name != 'DropJump' else 10
        paths = []
        for k in range(frames):
            t = dur * k / frames
            f = t * FPS
            sc.frame_set(int(f), subframe=f - int(f))
            look(cam, at(30, 6.6, V((0, 0, 1.0)), 0.1), V((0, 0, 1.0)))
            paths.append(render_to(os.path.join(outdir, f'_{name}_{k}.png'), (360, 540)))
        contact_sheet(paths, os.path.join(outdir, f'anim_{name}.png'), 5 if name == 'DropJump' else 4)
    ad.action = actions['Sing']
    sc.frame_set(0)
    for kb in keys[1:]:
        kb.value = {'mouthOpen': 0.8, 'mouthRound': 0.3}.get(kb.name, 0.0)
    hm = rig.pose.bones['head'].matrix @ rig.data.bones['head'].matrix_local.inverted()
    face = hm @ (HC + V((0, 0, -0.04)))
    look(cam, face + V((0, -2.2, 0.05)), face)
    render_to(os.path.join(outdir, 'sing_front_face.png'), (600, 600))
    for kb in keys[1:]:
        kb.value = 0.0
    ad.action = None
    if os.path.exists(ref):
        side_by_side([os.path.join(outdir, 'rest_front.png'), os.path.join(outdir, 'rest_34.png'), ref], os.path.join(outdir, 'compare.png'))
    os.remove(mc)


# ---------------------------------------------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------------------------------------------
def order_animations(path, names):
    """The exporter sorts clips alphabetically; rewrite the GLB JSON chunk so they appear in contract order."""
    import json, struct
    data = open(path, 'rb').read()
    jlen = struct.unpack('<I', data[12:16])[0]
    gl = json.loads(data[20:20 + jlen])
    gl['animations'].sort(key=lambda a: names.index(a['name']))
    js = json.dumps(gl, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    rest = data[20 + jlen:]
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + len(rest)) + struct.pack('<II', len(js), 0x4E4F534A) + js + rest
    open(path, 'wb').write(out)


def main():
    global MOUTH_WORLD
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.render.fps_base = 1.0
    mats = make_materials(face_texture())

    HEAD, BODY_H, BODY = Builder(), Builder(), Builder()
    skin_geo = build_head_skin(*HEAD_RES)
    surf = Surf(*skin_geo)
    eyes = build_head(HEAD, BODY_H, surf)
    mouth_geometry(HEAD, surf)
    mp, _ = surf.front(0, ZC)
    MOUTH_WORLD = mp + HC
    build_body(BODY)

    # static head parts join the body mesh (rigid on the head bone)
    for v, f, m, w, t in ((BODY_H.verts, BODY_H.faces, BODY_H.fmat, BODY_H.weights, BODY_H.tags),):
        base = len(BODY.verts)
        BODY.verts += [x + HC for x in v]
        BODY.faces += [tuple(base + i for i in fc) for fc in f]
        BODY.fmat += m
        BODY.weights += w
        BODY.tags += t
        BODY.info += [None] * len(v)
        BODY.fuv += BODY_H.fuv

    skin_idx = [f for f in HEAD.faces if HEAD.tags[f[0]] == 'skin']
    rest = head_positions(HEAD, 'rest', eyes, skin_idx)
    HEAD.verts = rest
    hull = lambda t: t.endswith('#hull')
    head, hidx = make_object('Head', HEAD, mats, HC, keep=lambda t: not hull(t))
    head_ink, iidx = make_object('HeadInk', HEAD, mats, HC, keep=hull)
    body, _ = make_object('Body', BODY, mats, keep=lambda t: not hull(t))
    body_ink, _ = make_object('BodyInk', BODY, mats, keep=hull)
    keyed = {}
    for key in ('mouthOpen', 'mouthRound', 'mouthWide', 'blink'):
        keyed[key] = head_positions(HEAD, key, eyes, skin_idx)
    for ob, ids in ((head, hidx), (head_ink, iidx)):
        ob.shape_key_add(name='Basis', from_mix=False)
        for key, pos in keyed.items():
            kb = ob.shape_key_add(name=key, from_mix=False)
            kb.data.foreach_set('co', [c for i in ids for c in (pos[i] + HC)])
        for kb in ob.data.shape_keys.key_blocks:
            kb.value = 0.0               # new keys can come in at 1; the stage expects a closed, open-eyed rest
        ob.data.update()
        if ob is head_ink:
            # ink follows the face keys in previews
            for kb in ob.data.shape_keys.key_blocks[1:]:
                d = kb.driver_add('value').driver
                d.type = 'AVERAGE'
                v = d.variables.new()
                v.targets[0].id_type = 'KEY'
                v.targets[0].id = head.data.shape_keys
                v.targets[0].data_path = f'key_blocks["{kb.name}"].value'

    rig = make_rig()
    for ob in (body, head, body_ink, head_ink):
        bind(ob, rig)
    poser = Poser(rig)
    actions = bake_clips(rig, poser)
    sc.frame_start, sc.frame_end = 0, int(round(BAR * FPS))

    tris = sum(len(p.vertices) - 2 for ob in (body, head) for p in ob.data.polygons)
    print(f'[character] verts body={len(body.data.vertices)} head={len(head.data.vertices)} tris={tris}')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for ob in (rig, body, head):
        ob.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=False,
        export_optimize_animation_size=False, export_morph=True, export_morph_normal=True, export_skins=True,
        export_cameras=False, export_lights=False, export_materials='EXPORT', export_extras=False,
    )
    order_animations(OUT, [c[0] for c in CLIPS])
    print(f'[character] wrote {OUT} ({os.path.getsize(OUT) / 1e6:.2f} MB)')
    if PREVIEW:
        previews(rig, head, actions, PREVIEW)


main()
