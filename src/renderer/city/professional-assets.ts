import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export type ProfessionalModel = 'apartments' | 'factory' | 'tree' | 'shrub' | 'grass';
export type ProfessionalSurface = 'brick' | 'concrete' | 'asphalt';
export type ProfessionalSurfaceMaps = { map: THREE.Texture; normalMap: THREE.Texture; armMap: THREE.Texture };

const modelPaths: Record<ProfessionalModel, string> = {
  apartments: 'modular_urban_apartments_facade/model.gltf',
  factory: 'modular_factory_facade/model.gltf',
  tree: 'quiver_tree_01/quiver_tree_01_1k.gltf',
  shrub: 'wild_rooibos_bush/wild_rooibos_bush_1k.gltf',
  grass: 'grass_medium_02/grass_medium_02_1k.gltf'
};

const assetUrl = (path: string): string => new URL(`assets/professional/${path}`, document.baseURI).href;
const surfacePaths: Record<ProfessionalSurface, { directory: string; stem: string }> = {
  brick: { directory: 'red_brick_03', stem: 'red_brick_03' },
  concrete: { directory: 'concrete_wall_007', stem: 'concrete_wall_007' },
  asphalt: { directory: 'asphalt_02', stem: 'asphalt_02' }
};

const disposeMaterial = (material: THREE.Material): void => {
  const seen = new Set<THREE.Texture>();
  for (const value of Object.values(material)) if (value instanceof THREE.Texture) seen.add(value);
  for (const texture of seen) texture.dispose();
  material.dispose();
};

const prepareModel = (model: THREE.Object3D): THREE.Group => {
  const root = model as THREE.Group;
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (material instanceof THREE.MeshStandardMaterial) {
        if (material.transparent || material.alphaTest > 0) {
          // Foliage cards need both sides and a modest cutout threshold. Treating them as opaque front faces was clipping most of the professionally-authored leaf canopy.
          material.side = THREE.DoubleSide;
          material.shadowSide = THREE.DoubleSide;
          material.alphaTest = Math.max(material.alphaTest, .18);
          material.depthWrite = true;
          material.transparent = false;
        } else {
          material.side = THREE.FrontSide;
        }
      }
    }
  });
  return root;
};

export class ProfessionalAssetBank {
  private readonly gltf = new GLTFLoader();
  private readonly rgbe = new RGBELoader();
  private readonly texture = new THREE.TextureLoader();
  private readonly models = new Map<ProfessionalModel, Promise<THREE.Group>>();
  private readonly surfaces = new Map<ProfessionalSurface, Promise<ProfessionalSurfaceMaps>>();
  private environmentPromise?: Promise<THREE.Texture>;
  private disposed = false;

  clone(kind: ProfessionalModel, retain?: (name: string) => boolean): Promise<THREE.Group> {
    if (this.disposed) return Promise.reject(new Error('专业资源库已释放。'));
    let model = this.models.get(kind);
    if (!model) {
      model = this.gltf.loadAsync(assetUrl(modelPaths[kind])).then(result => prepareModel(result.scene));
      this.models.set(kind, model);
    }
    return model.then(source => {
      const copy = source.clone(true);
      if (!retain) return copy;
      const discarded: THREE.Object3D[] = [];
      copy.traverse(object => {
        if (object instanceof THREE.Mesh && !retain(object.name)) discarded.push(object);
      });
      for (const object of discarded) object.parent?.remove(object);
      return copy;
    });
  }

  environment(renderer: THREE.WebGLRenderer): Promise<THREE.Texture> {
    if (this.disposed) return Promise.reject(new Error('专业资源库已释放。'));
    if (!this.environmentPromise) {
      this.environmentPromise = this.rgbe.loadAsync(assetUrl('suburban_garden/environment.hdr')).then(source => {
        const generator = new THREE.PMREMGenerator(renderer);
        const environment = generator.fromEquirectangular(source).texture;
        source.dispose();
        generator.dispose();
        return environment;
      });
    }
    return this.environmentPromise;
  }

  surface(surface: ProfessionalSurface): Promise<ProfessionalSurfaceMaps> {
    if (this.disposed) return Promise.reject(new Error('专业资源库已释放。'));
    let maps = this.surfaces.get(surface);
    if (!maps) {
      const asset = surfacePaths[surface]; const path = (suffix: string) => assetUrl(`materials/${asset.directory}/${asset.stem}_${suffix}_1k.jpg`);
      maps = Promise.all([this.texture.loadAsync(path('diff')), this.texture.loadAsync(path('nor_gl')), this.texture.loadAsync(path('arm'))]).then(([map, normalMap, armMap]) => {
        map.colorSpace = THREE.SRGBColorSpace;
        for (const texture of [map, normalMap, armMap]) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4; }
        normalMap.colorSpace = armMap.colorSpace = THREE.NoColorSpace;
        return { map, normalMap, armMap };
      });
      this.surfaces.set(surface, maps);
    }
    return maps;
  }

  dispose(): void {
    this.disposed = true;
    for (const promise of this.models.values()) void promise.then(model => {
      const seen = new Set<THREE.Material>();
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) seen.add(material);
      });
      for (const material of seen) disposeMaterial(material);
    }).catch(() => undefined);
    for (const promise of this.surfaces.values()) void promise.then(maps => { maps.map.dispose(); maps.normalMap.dispose(); maps.armMap.dispose(); }).catch(() => undefined);
    void this.environmentPromise?.then(texture => texture.dispose()).catch(() => undefined);
  }
}
