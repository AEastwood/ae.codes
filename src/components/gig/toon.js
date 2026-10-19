import * as THREE from 'three';

const INK = 0x060d0d;

// Three flat bands of light (shadow, mid, lit) for the cel look
export function createGradientMap() {
    const data = new Uint8Array([55, 55, 55, 255, 150, 150, 150, 255, 255, 255, 255, 255]);
    const texture = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
}

// Models may ship their own ink hull (a material called "Outline"): keep it flat black, never lit
const isInk = (material) => /outline|ink/i.test(material?.name ?? '');

// A flat-shaded copy of a material, keeping its colour, texture and vertex colours
function toToon(material, gradientMap) {
    if (isInk(material)) {
        const ink = new THREE.MeshBasicMaterial({ color: INK, side: material.side ?? THREE.FrontSide });
        ink.name = material.name;
        return ink;
    }
    const toon = new THREE.MeshToonMaterial({
        color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
        map: material.map ?? null,
        gradientMap,
        vertexColors: Boolean(material.vertexColors),
        transparent: Boolean(material.transparent),
        opacity: material.opacity ?? 1,
        alphaTest: material.alphaTest ?? 0,
        side: material.side ?? THREE.FrontSide,
    });
    if (material.emissive && material.emissiveIntensity > 0) {
        toon.emissive = material.emissive.clone();
        toon.emissiveIntensity = material.emissiveIntensity;
        toon.emissiveMap = material.emissiveMap ?? null;
    }
    toon.name = material.name;
    return toon;
}

// Swaps every mesh's materials for toon ones, sharing duplicates so a 20-mesh model doesn't make 20 programs
export function toonify(root, gradientMap) {
    const converted = new Map();
    const convert = (material) => {
        if (!converted.has(material)) converted.set(material, toToon(material, gradientMap));
        return converted.get(material);
    };

    root.traverse((object) => {
        if (!object.isMesh) return;
        const old = object.material;
        object.material = Array.isArray(old) ? old.map(convert) : convert(old);
    });
    for (const old of converted.keys()) old.dispose();
}

/*
  Ink line material for the inverted hull: the back faces of a copy of the mesh, pushed out along
  the normals before morphs and skinning run, so the line bends with every pose and mouth shape.
*/
export function createOutlineMaterial(width) {
    const material = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
    material.userData.outlineWidth = { value: width };
    material.onBeforeCompile = (shader) => {
        shader.uniforms.outlineWidth = material.userData.outlineWidth;
        shader.vertexShader = shader.vertexShader
            .replace('void main() {', 'uniform float outlineWidth;\nvoid main() {')
            .replace('#include <begin_vertex>', 'vec3 transformed = vec3( position ) + normalize( normal ) * outlineWidth;');
    };
    material.customProgramCacheKey = () => 'gig-outline';
    return material;
}

/*
  Gives every mesh under `root` an ink outline `worldWidth` units thick. Skinned meshes get a second
  skinned mesh bound to the same skeleton and sharing the morph weights, so the line follows exactly.
  Returns the outline materials so the caller can dispose them.
*/
export function addOutlines(root, worldWidth) {
    const meshes = [];
    root.traverse((object) => {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (object.isMesh && !object.userData.isOutline && !materials.every(isInk)) meshes.push(object);
    });

    const materials = [];
    const scale = new THREE.Vector3();
    root.updateMatrixWorld(true);

    for (const mesh of meshes) {
        if (!mesh.geometry.attributes.normal || !mesh.parent) continue;
        mesh.getWorldScale(scale);
        const material = createOutlineMaterial(0);
        // Widths are given in world units; the hull is pushed out in the mesh's own (possibly scaled) space
        material.userData.meshScale = ((scale.x + scale.y + scale.z) / 3) || 1;
        setOutlineWidth([material], worldWidth);
        materials.push(material);

        let outline;
        if (mesh.isSkinnedMesh) {
            outline = new THREE.SkinnedMesh(mesh.geometry, material);
            outline.bindMode = mesh.bindMode;
            outline.bind(mesh.skeleton, mesh.bindMatrix);
        } else {
            outline = new THREE.Mesh(mesh.geometry, material);
        }
        // Same array, not a copy: setting the mouth on the face moves its outline too
        if (mesh.morphTargetInfluences) {
            outline.morphTargetInfluences = mesh.morphTargetInfluences;
            outline.morphTargetDictionary = mesh.morphTargetDictionary;
        }
        outline.position.copy(mesh.position);
        outline.quaternion.copy(mesh.quaternion);
        outline.scale.copy(mesh.scale);
        outline.frustumCulled = false;
        outline.renderOrder = mesh.renderOrder;
        outline.userData.isOutline = true;
        mesh.frustumCulled = false;
        mesh.parent.add(outline);
    }
    return materials;
}

// Sets how thick the ink lines are in world units, e.g. to keep them a constant few pixels on screen
export function setOutlineWidth(materials, worldWidth) {
    for (const material of materials) {
        material.userData.outlineWidth.value = worldWidth / (material.userData.meshScale ?? 1);
    }
}

// Frees every geometry, material and texture under `root`
export function disposeObject(root) {
    const textures = new Set();
    const materials = new Set();
    const geometries = new Set();

    root.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of list) {
            if (!material) continue;
            materials.add(material);
            for (const value of Object.values(material)) {
                if (value?.isTexture) textures.add(value);
            }
            for (const uniform of Object.values(material.uniforms ?? {})) {
                if (uniform?.value?.isTexture) textures.add(uniform.value);
            }
        }
    });

    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
}
