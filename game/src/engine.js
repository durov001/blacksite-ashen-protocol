// engine.js — renderer, scene, camera, lights for BLACKSITE: ASHEN PROTOCOL.
import * as THREE from 'three';

export function createEngine(mountEl) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mountEl.clientWidth || window.innerWidth, mountEl.clientHeight || window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mountEl.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a222b); // cool blue-grey dusk
  scene.fog = new THREE.Fog(0x1a222b, 28, 75);

  const camera = new THREE.PerspectiveCamera(74,
    (mountEl.clientWidth || window.innerWidth) / (mountEl.clientHeight || window.innerHeight),
    0.05, 140);
  camera.rotation.order = 'YXZ';

  // Cool sky fill vs warm ground bounce. Bright enough to read at a glance:
  // ACES tone mapping eats the shadows, so the base lights run hot.
  scene.add(new THREE.HemisphereLight(0x8fb4d6, 0x2a2018, 1.3));
  scene.add(new THREE.AmbientLight(0x36424e, 0.7));

  // Amber dusk sun, shadows on, tight frustum over the 56x40m map.
  const sun = new THREE.DirectionalLight(0xf0a830, 2.6);
  sun.position.set(18, 26, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -32; sun.shadow.camera.right = 32;
  sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  function resize() {
    const w = mountEl.clientWidth || window.innerWidth;
    const h = mountEl.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  return {
    renderer, scene, camera,
    render() { renderer.render(scene, camera); },
    resize,
    setFov(fov) { camera.fov = fov; camera.updateProjectionMatrix(); },
  };
}
