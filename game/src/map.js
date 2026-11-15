// map.js — Ashen Refinery: floor, walls, Furnace mid, Reactor Site A (NW),
// Cargo Site B (NE), Control Room (W), Catwalk corridor (E). Deterministic.
// X east-west, Z north-south, ground y=0. Bounds x [-28,28], z [-20,20].
import * as THREE from 'three';

const BOUNDS = { minX: -28, maxX: 28, minZ: -20, maxZ: 20 };

export function createMap(scene) {
  const colliders = [];
  const solidMeshes = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 14);

  const M = {
    concrete: new THREE.MeshStandardMaterial({ color: 0x6a6f75, roughness: 0.95 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x565b61, roughness: 1 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.85, metalness: 0.35 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 0.9, metalness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8a929c, roughness: 0.5, metalness: 0.7 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xf0a830, emissive: 0xf0a830, emissiveIntensity: 1.6 }),
    hazard: new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.8 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x7a6238, roughness: 0.95 }),
    barrel: new THREE.MeshStandardMaterial({ color: 0x4a6a8a, roughness: 0.7, metalness: 0.4 }),
    barrel2: new THREE.MeshStandardMaterial({ color: 0x8a3a28, roughness: 0.7, metalness: 0.4 }),
    contA: new THREE.MeshStandardMaterial({ color: 0x8a3a28, roughness: 0.8, metalness: 0.3 }),
    contB: new THREE.MeshStandardMaterial({ color: 0x2a6a7a, roughness: 0.8, metalness: 0.3 }),
    contC: new THREE.MeshStandardMaterial({ color: 0x5a6a3a, roughness: 0.8, metalness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2a4a5a, roughness: 0.2, metalness: 0.6, emissive: 0x1a3a4a, emissiveIntensity: 0.5 }),
  };

  // Box centered at (x,z), footprint w(x) x d(z), height h, base y0. Adds collider + solid.
  function box(mat, x, z, w, h, d, o) {
    o = o || {};
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(w, h, d);
    m.position.set(x, (o.y || 0) + h / 2, z);
    m.castShadow = h >= 2 && !o.noShadow;
    m.receiveShadow = true;
    scene.add(m);
    if (o.solid !== false) solidMeshes.push(m);
    if (o.col !== false) colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return m;
  }
  // Cylinder centered at (x,z), radius r, height h, base y0.
  function cyl(mat, x, z, r, h, o) {
    o = o || {};
    const m = new THREE.Mesh(cylGeo, mat);
    m.scale.set(r, h, r);
    m.position.set(x, (o.y || 0) + h / 2, z);
    m.castShadow = h >= 2;
    m.receiveShadow = true;
    scene.add(m);
    if (o.solid !== false) solidMeshes.push(m);
    if (o.col !== false) colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
    return m;
  }

  // ---- floor ----
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(56, 40), M.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // Painted guide lines: amber center lane, cyan flank lane.
  box(M.hazard, 0, 0, 0.3, 0.02, 30, { y: 0.01, col: false, solid: false, noShadow: true });
  box(M.glass, -24, 0, 0.3, 0.02, 26, { y: 0.01, col: false, solid: false, noShadow: true });

  // ---- outer walls (h 3.6, t 0.6) ----
  box(M.concrete, 0, -19.7, 56, 3.6, 0.6);
  box(M.concrete, 0, 19.7, 56, 3.6, 0.6);
  box(M.concrete, -27.7, 0, 0.6, 3.6, 40);
  box(M.concrete, 27.7, 0, 0.6, 3.6, 40);
  // Wall caps (visual trim, no extra collider).
  box(M.dark, 0, -19.7, 56, 0.25, 0.8, { y: 3.6, col: false, solid: false });
  box(M.dark, 0, 19.7, 56, 0.25, 0.8, { y: 3.6, col: false, solid: false });

  // ---- Furnace (mid, 0,0): body 8x6, h 4.5, chimneys, hazard base ----
  box(M.dark, 0, 0, 8, 4.5, 6);
  box(M.rust, 0, 0, 8.6, 0.7, 6.6, { y: 4.5, col: false, solid: false });
  cyl(M.rust, -2.5, -1.5, 0.8, 3.5, { y: 4.5, col: false });
  cyl(M.rust, 2.5, 1.5, 0.8, 3, { y: 4.5, col: false });
  cyl(M.amber, -2.5, -1.5, 0.55, 0.3, { y: 7.9, col: false, solid: false });
  box(M.amber, 0, 3.02, 3, 0.9, 0.1, { y: 1.2, col: false, solid: false, noShadow: true }); // furnace mouth glow
  for (let i = 0; i < 4; i++) box(i % 2 ? M.dark : M.hazard, -3 + i * 2, 3.05, 2, 0.35, 0.1, { y: 0, col: false, solid: false, noShadow: true });
  for (let i = 0; i < 4; i++) box(i % 2 ? M.hazard : M.dark, -3 + i * 2, -3.05, 2, 0.35, 0.1, { y: 0, col: false, solid: false, noShadow: true });

  // ---- Reactor Site A (NW): enclosed room x -25..-15, z -15..-7, 2 entrances ----
  // North + west walls solid.
  box(M.concrete, -20, -14.7, 10, 3.4, 0.6);
  box(M.concrete, -24.7, -11, 0.6, 3.4, 8);
  // South wall with gap x -19.5..-17.5 (entrance from mid).
  box(M.concrete, -22.25, -6.7, 5.5, 3.4, 0.6);
  box(M.concrete, -16.25, -6.7, 2.5, 3.4, 0.6);
  // East wall with gap z -12.5..-10.5 (entrance from north-mid).
  box(M.concrete, -14.7, -13.75, 0.6, 3.4, 2.5);
  box(M.concrete, -14.7, -8.75, 0.6, 3.4, 3.5);
  // Reactor core in NW corner + glowing top.
  cyl(M.steel, -22.5, -13.5, 1.6, 3);
  cyl(M.amber, -22.5, -13.5, 1.1, 0.4, { y: 3, col: false, solid: false });
  box(M.crate, -17, -13.5, 1.4, 1.4, 1.4);
  // Hazard stripes at both entrances.
  box(M.hazard, -18.5, -6.7, 2, 0.35, 0.15, { y: 2.9, col: false, solid: false, noShadow: true });
  box(M.hazard, -14.7, -11.5, 0.15, 0.35, 2, { y: 2.9, col: false, solid: false, noShadow: true });

  // ---- Cargo Site B (NE): open, container cover ----
  box(M.contA, 18, -14, 6, 2.6, 2.4);                 // north container
  box(M.contB, 18, -14, 4, 2.6, 2.4, { y: 2.6 });     // stacked on top
  box(M.contC, 23, -12, 2.4, 2.6, 5);                 // east container (rotated)
  box(M.contB, 15, -9, 2.4, 2.6, 4);                  // west container (rotated)
  box(M.crate, 21, -7, 1.4, 1.4, 1.4);
  box(M.crate, 16.5, -12.5, 1.2, 1.2, 1.2);
  box(M.hazard, 18, -12.75, 6, 0.3, 0.12, { y: 0.1, col: false, solid: false, noShadow: true });

  // ---- Control Room (W): alcove x -25..-17, z 1..7, open east + south gap ----
  // North wall with gap x -22..-18 (route to A approach).
  box(M.concrete, -23.5, 1.3, 3, 3.2, 0.6);
  box(M.concrete, -17.5, 1.3, 1, 3.2, 0.6);
  // South wall with gap x -20..-17.
  box(M.concrete, -22.5, 6.7, 5, 3.2, 0.6);
  box(M.dark, -22.5, 3.5, 3, 1.1, 1.2);               // console desk
  box(M.glass, -22.5, 3.5, 2.6, 0.5, 0.15, { y: 1.1, col: false, solid: false, noShadow: true }); // console screen
  box(M.amber, -20, 1.3, 0.4, 0.4, 0.4, { y: 3.2, col: false, solid: false, noShadow: true }); // status lamp

  // ---- Catwalk (E corridor): x 22..27.4, z -4..12, west wall gap z 2..6 ----
  box(M.dark, 21.7, -1, 0.6, 3.2, 6);                 // west wall, north segment (z -4..2)
  box(M.dark, 21.7, 9, 0.6, 3.2, 6);                  // west wall, south segment (z 6..12)
  box(M.dark, 24.7, 12.3, 5.4, 3.2, 0.6);             // south end wall
  box(M.dark, 24.7, 5, 5.4, 0.25, 10, { y: 3.2, col: false }); // overhead walkway deck
  box(M.steel, 22.4, 0.5, 0.4, 3.2, 0.4);             // walkway pillar
  box(M.steel, 22.4, 9.5, 0.4, 3.2, 0.4);             // walkway pillar
  box(M.hazard, 21.7, 4, 0.15, 0.35, 4, { y: 2.8, col: false, solid: false, noShadow: true });

  // ---- cover: crates + barrels (mid lanes, approaches) ----
  const crates = [
    [3, 8.5, 1.6], [-3, 8.5, 1.2], [3, -8.5, 1.6], [-3, -8.5, 1.2],
    [-6.5, 4.5, 1.4], [6.5, 4.5, 1.4], [-6.5, -3.5, 1.4], [6.5, -3.5, 1.4],
    [-12, -8, 1.4], [12, -8, 1.4], [-10, 12, 1.4], [10, 12, 1.4],
  ];
  for (const [x, z, s] of crates) box(M.crate, x, z, s, s, s);
  const barrels = [
    [13, 9, 0], [-13, 9, 1], [13.8, 8.2, 1], [-13.8, 8.2, 0],
    [-13, -3.5, 0], [-12.2, -2.9, 1], [14, -4, 1], [14.8, -3.4, 0],
  ];
  for (const [x, z, v] of barrels) cyl(v ? M.barrel2 : M.barrel, x, z, 0.45, 1.1);

  // ---- amber point lamps (no shadows) + fixtures ----
  const lamps = [[0, 5.2, 0], [-20, 4.2, -11], [20, 4.2, -11], [0, 4.5, 12]];
  for (const [x, y, z] of lamps) {
    const l = new THREE.PointLight(0xf0a830, 40, 20, 2);
    l.position.set(x, y, z);
    scene.add(l);
    const fix = new THREE.Mesh(boxGeo, M.amber);
    fix.scale.set(0.5, 0.18, 0.5);
    fix.position.set(x, y + 0.15, z);
    scene.add(fix);
  }

  // ---- site markers: glowing ring + beam (objectives.js pulses them) ----
  function siteMarker(x, z, color) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(4.4, 5, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 7, 10, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 3.5;
    g.add(ring, beam);
    g.position.set(x, 0, z);
    g.userData.ring = ring; g.userData.beam = beam;
    scene.add(g);
    return g;
  }
  const siteMarkers = {
    A: siteMarker(-20, -11, 0xf0a830),
    B: siteMarker(20, -11, 0x3ad9c8),
  };

  // ---- waypoint nav graph (28 nodes; edges verified clear of colliders) ----
  const WP = [
    [0, 17, [1]], [0, 12, [0, 2, 3, 12]], [-6, 10, [1, 4, 12]], [6, 10, [1, 5, 12]],
    [-10, 6, [2, 6, 11]], [10, 6, [3, 7, 14]], [-14, 2, [4, 10, 11]], [24, 4, [5, 8]],
    [24, 0, [7, 9]], [24, -6, [8, 21, 23]], [-20, 4, [6, 11]], [-20, -2, [4, 6, 10, 16]],
    [0, 6, [1, 2, 3, 13, 14]], [-9, 1.5, [12, 16]], [9, 1.5, [5, 12, 17]],
    [0, -6, [16, 17, 24]], [-10, -6, [11, 13, 15, 18, 26]], [10, -6, [14, 15, 22, 27]],
    [-18.5, -5, [16, 19]], [-20, -11, [18, 20]], [-16, -11, [19, 26]],
    [20, -11, [9, 22, 23]], [16, -5.5, [17, 21, 27]], [24, -7, [9, 21]],
    [0, -12, [15, 25, 26, 27]], [0, -17, [24]], [-8, -14, [16, 20, 24]], [8, -14, [17, 22, 24]],
  ];
  const waypoints = WP.map(([x, z, neighbors], id) => ({ id, x, z, neighbors }));

  return {
    colliders,
    solidMeshes,
    waypoints,
    sites: {
      A: { center: { x: -20, z: -11 }, radius: 5, name: 'REACTOR' },
      B: { center: { x: 20, z: -11 }, radius: 5, name: 'CARGO' },
    },
    spawns: {
      vanguard: [
        { x: 0, z: 17, yaw: Math.PI }, { x: -2.5, z: 17.5, yaw: Math.PI },
        { x: 2.5, z: 17.5, yaw: Math.PI }, { x: -5, z: 16, yaw: Math.PI },
        { x: 5, z: 16, yaw: Math.PI },
      ],
      wraith: [
        { x: 0, z: -17, yaw: 0 }, { x: -2.5, z: -17.5, yaw: 0 },
        { x: 2.5, z: -17.5, yaw: 0 }, { x: -5, z: -16, yaw: 0 },
        { x: 5, z: -16, yaw: 0 },
      ],
    },
    siteMarkers,
    bounds: BOUNDS,
  };
}
