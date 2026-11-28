/* Plastic Army — prototipo de un jugador.
 * Soldaditos de juguete en un jardín: cuatro equipos, cuatro mesas. Todo se dibuja con formas simples
 * (cajas, cilindros, esferas), así que no hace falta descargar modelos.
 */
'use strict';
(function () {
  const V3 = BABYLON.Vector3, C3 = BABYLON.Color3, C4 = BABYLON.Color4;
  const $ = (id) => document.getElementById(id);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // ------------------------------------------------------------------
  // Motor y escena
  // ------------------------------------------------------------------
  const canvas = $('game');
  let touchMode = window.matchMedia('(pointer: coarse)').matches;
  const engine = new BABYLON.Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }, true);
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, touchMode ? 1.5 : 2));
  const scene = new BABYLON.Scene(engine);
  const SKY_COLOR = C3.FromHexString('#a9dcff');
  scene.clearColor = new C4(SKY_COLOR.r, SKY_COLOR.g, SKY_COLOR.b, 1);
  scene.ambientColor = new C3(0.35, 0.35, 0.35);
  scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
  scene.fogStart = 160; scene.fogEnd = 460; scene.fogColor = SKY_COLOR;
  scene.skipPointerMovePicking = true;
  scene.detachControl(); // los controles son nuestros; Babylon no debe tocar los clics

  const camera = new BABYLON.FreeCamera('cam', new V3(-34, 2, 0), scene);
  camera.minZ = 0.05; camera.maxZ = 900; camera.fov = 1.15;
  camera.inputs.clear();

  const hemi = new BABYLON.HemisphericLight('hemi', new V3(0.2, 1, -0.3), scene);
  hemi.intensity = 0.78; hemi.groundColor = new C3(0.42, 0.5, 0.38);
  const sun = new BABYLON.DirectionalLight('sun', new V3(-0.45, -1, -0.35), scene);
  sun.position = new V3(90, 140, 90); sun.intensity = 0.85; sun.diffuse = C3.FromHexString('#fff4dd');
  let shadowGen = null;
  if (!touchMode) {
    shadowGen = new BABYLON.ShadowGenerator(2048, sun);
    shadowGen.usePercentageCloserFiltering = true;
    shadowGen.bias = 0.0015; shadowGen.normalBias = 0.02;
    sun.shadowMinZ = 1; sun.shadowMaxZ = 400;
  }
  const casters = [];
  const addCaster = (m) => { if (shadowGen) shadowGen.addShadowCaster(m); };

  // ------------------------------------------------------------------
  // Constantes del juego
  // ------------------------------------------------------------------
  const GRAV = 22, STEP = 0.65, RADIUS = 0.35, H = 1.8, H_CROUCH = 1.2, EYE = 1.55, EYE_CROUCH = 0.95;
  const WIN_SCORE = 50, TEAM_SIZE = 8, TEAMS = 4;
  const TEAM_NAME = ['Azul', 'Rojo', 'Verde', 'Amarillo'];
  const TEAM_HEX = ['#3a86ff', '#ef233c', '#2fb344', '#ffbe0b'];
  const TEAM_LIGHT = ['#8ec5ff', '#ff8a95', '#8fe39b', '#ffe08a'];

  const WEAPONS = [
    { id: 'rifle', name: 'Rifle de bolitas', mag: 30, rate: 9, dmg: 13, pellets: 1, spread: 0.012, speed: 95, gravity: 3, range: 90, reload: 1.6, kick: 0.012, proj: 'pellet', sound: 'rifle', ideal: 16 },
    { id: 'shotgun', name: 'Escopeta de corchos', mag: 6, rate: 1.4, dmg: 12, pellets: 8, spread: 0.075, speed: 70, gravity: 7, range: 30, reload: 2.0, kick: 0.05, proj: 'cork', sound: 'shotgun', ideal: 7 },
    { id: 'dart', name: 'Lanzadardos', mag: 5, rate: 1.3, dmg: 70, pellets: 1, spread: 0.002, speed: 150, gravity: 1.5, range: 140, reload: 2.2, kick: 0.04, proj: 'dart', sound: 'dart', zoom: true, ideal: 26 }
  ];
  const CLASSES = {
    fusilero: { name: 'Fusilero', hp: 100, speed: 6.2, jump: 8.3, nades: 2, reloadMul: 0.7 },
    escudero: { name: 'Escudero', hp: 150, speed: 5.3, jump: 7.8, nades: 2, reloadMul: 1 },
    explorador: { name: 'Explorador', hp: 80, speed: 7.6, jump: 9.8, nades: 1, reloadMul: 1 },
    ingeniero: { name: 'Ingeniero', hp: 100, speed: 6.0, jump: 8.3, nades: 4, reloadMul: 1 }
  };
  const DIFFS = {
    facil: { spread: 0.1, reaction: 0.85, dmg: 0.55, turn: 3.2, rateMul: 1.6 },
    normal: { spread: 0.055, reaction: 0.55, dmg: 0.75, turn: 4.8, rateMul: 1.25 },
    dificil: { spread: 0.03, reaction: 0.32, dmg: 0.95, turn: 7, rateMul: 1 }
  };
  const ALLY_SKILL = { spread: 0.05, reaction: 0.5, dmg: 0.8, turn: 5, rateMul: 1.2 };
  const BOT_RANKS = ['Cabo', 'Sargento', 'Soldado', 'Capitán', 'Teniente', 'Coronel'];
  const BOT_NOUNS = ['Botón', 'Tapita', 'Clip', 'Goma', 'Lápiz', 'Chicle', 'Dado', 'Canica', 'Tuerca', 'Crayón', 'Yoyó', 'Trompo', 'Globo', 'Cubito', 'Pincel', 'Tiza',
    'Corcho', 'Imán', 'Peón', 'Ficha', 'Resorte', 'Bolita', 'Chapita', 'Sacapuntas', 'Pompón', 'Galleta', 'Fideo', 'Piedrita', 'Hojita', 'Bellota', 'Semilla', 'Ramita', 'Pochoclo', 'Caramelo'];

  // ------------------------------------------------------------------
  // Materiales y utilidades de construcción
  // ------------------------------------------------------------------
  const matCache = {};
  function mat(hex, opt = {}) {
    const key = hex + JSON.stringify(opt);
    if (matCache[key]) return matCache[key];
    const m = new BABYLON.StandardMaterial('m' + hex, scene);
    m.diffuseColor = C3.FromHexString(hex);
    const s = opt.spec ?? 0.15;
    m.specularColor = new C3(s, s, s);
    m.specularPower = opt.power ?? 32;
    if (opt.emissive) m.emissiveColor = C3.FromHexString(opt.emissive);
    if (opt.alpha !== undefined) m.alpha = opt.alpha;
    if (opt.noFog) m.fogEnabled = false;
    matCache[key] = m;
    return m;
  }
  const plastic = (hex) => mat(hex, { spec: 0.55, power: 48 });

  const colliders = [];
  function addCollider(x0, y0, z0, x1, y1, z1) {
    const c = { min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } };
    colliders.push(c);
    return c;
  }
  const statics = [];
  function finishStatic(m, shadow = true) {
    m.receiveShadows = true;
    if (shadow) addCaster(m);
    statics.push(m);
    return m;
  }
  // Caja apoyada en "y" (la base queda en y)
  function box(name, w, h, d, x, y, z, material, opt = {}) {
    const m = BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.position.set(x, y + h / 2, z);
    m.material = typeof material === 'string' ? plastic(material) : material;
    if (opt.collide !== false) addCollider(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
    return finishStatic(m, opt.shadow !== false);
  }
  function cyl(name, diam, h, x, y, z, material, opt = {}) {
    const m = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: diam, height: h, tessellation: opt.tess || 28 }, scene);
    m.position.set(x, y + h / 2, z);
    m.material = typeof material === 'string' ? plastic(material) : material;
    if (opt.collide !== false) { const r = diam * 0.45; addCollider(x - r, y, z - r, x + r, y + h, z + r); }
    return finishStatic(m, opt.shadow !== false);
  }
  function beam(name, diam, a, b, material) {
    const dir = b.subtract(a); const len = dir.length(); dir.normalize();
    const m = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: diam, height: len, tessellation: 16 }, scene);
    m.position = a.add(b).scale(0.5);
    const axis = V3.Cross(V3.Up(), dir);
    const ang = Math.acos(clamp(V3.Dot(V3.Up(), dir), -1, 1));
    if (axis.length() > 1e-6) m.rotationQuaternion = BABYLON.Quaternion.RotationAxis(axis.normalize(), ang);
    m.material = typeof material === 'string' ? plastic(material) : material;
    return finishStatic(m);
  }
  function textTexture(w, h, draw) {
    const t = new BABYLON.DynamicTexture('tt', { width: w, height: h }, scene, true);
    draw(t.getContext(), w, h); t.update();
    return t;
  }
  function logoTexture() {
    return textTexture(1024, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#3a86ff'); g.addColorStop(1, '#8338ec');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) { c.fillStyle = pick(['#ffd23f', '#ff006e', '#9ef01a', '#5ec8ff', '#fff']); c.fillRect(Math.random() * w, Math.random() * h, 14, 8); }
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '900 150px "Arial Black", Arial, sans-serif';
      c.fillStyle = '#2b2d42'; c.fillText('PLASTIC', w / 2 + 6, h * 0.36 + 6); c.fillText('ARMY', w / 2 + 6, h * 0.68 + 6);
      c.fillStyle = '#9ef01a'; c.fillText('PLASTIC', w / 2, h * 0.36);
      c.fillStyle = '#ffd23f'; c.fillText('ARMY', w / 2, h * 0.68);
    });
  }

  // ------------------------------------------------------------------
  // El mapa: Jardín (al aire libre)
  // Cuatro mesas (una base por equipo) al norte, sur, este y oeste. Cada base tiene un
  // puente directo a la mesa redonda del centro y puentes a las bases vecinas (pasando
  // por los ladrillos de las esquinas). Si te caes al pasto, quedas eliminado.
  // ------------------------------------------------------------------
  const BASE_D = 44, TABLE_HALF = 12, BRIDGE_W = 7, RAIL = 0.3, CIRCLE_R = 16, CORNER_HALF = 5, ENTRY_R = 13;
  const GROUND_Y = -30;
  const TEAM_DIR = [[0, -1], [0, 1], [1, 0], [-1, 0]]; // Azul: sur, Rojo: norte, Verde: este, Amarillo: oeste
  const TEAM_PLACE = ['Sur', 'Norte', 'Este', 'Oeste'];
  const baseCenter = (t) => ({ x: TEAM_DIR[t][0] * BASE_D, z: TEAM_DIR[t][1] * BASE_D });

  // --- Mapa para los bots: zonas por donde se puede caminar y un grafo de caminos ---
  // Nodos: 0-3 centro de cada base, 4-7 ladrillos de las esquinas, 8-11 entradas del círculo (una por base)
  const CORN = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const NODES = [];
  for (let t = 0; t < TEAMS; t++) NODES.push(baseCenter(t));
  CORN.forEach(([x, z]) => NODES.push({ x: x * BASE_D, z: z * BASE_D }));
  TEAM_DIR.forEach(([x, z]) => NODES.push({ x: x * ENTRY_R, z: z * ENTRY_R }));
  const cornIdx = (x, z) => 4 + CORN.findIndex(([a, b]) => a === x && b === z);
  const baseCorners = (t) => { const [dx, dz] = TEAM_DIR[t]; return dx === 0 ? [[1, dz], [-1, dz]] : [[dx, 1], [dx, -1]]; };
  const EDGES = [];
  for (let t = 0; t < TEAMS; t++) {
    EDGES.push([t, 8 + t]); // puente directo al centro
    for (const [cx, cz] of baseCorners(t)) EDGES.push([t, cornIdx(cx, cz)]);
  }
  // dentro del círculo solo se une cada entrada con las de al lado (así nadie choca con la sombrilla del centro)
  EDGES.push([8, 10], [10, 9], [9, 11], [11, 8]);
  const NN = NODES.length;
  const ND = [], NEXT = [];
  for (let i = 0; i < NN; i++) { ND.push(new Array(NN).fill(Infinity)); NEXT.push(new Array(NN).fill(-1)); ND[i][i] = 0; NEXT[i][i] = i; }
  for (const [a, b] of EDGES) {
    const d = Math.hypot(NODES[a].x - NODES[b].x, NODES[a].z - NODES[b].z);
    ND[a][b] = ND[b][a] = d; NEXT[a][b] = b; NEXT[b][a] = a;
  }
  for (let k = 0; k < NN; k++) for (let i = 0; i < NN; i++) for (let j = 0; j < NN; j++) {
    if (ND[i][k] + ND[k][j] < ND[i][j]) { ND[i][j] = ND[i][k] + ND[k][j]; NEXT[i][j] = NEXT[i][k]; }
  }
  // Zonas: rectángulos [x0,z0,x1,z1] o el círculo, cada una con los nodos que la tocan
  const REGIONS = [];
  const BRIDGE_REGIONS = [];
  const addRect = (x0, z0, x1, z1, nodes) => { const r = { rect: [x0, z0, x1, z1], nodes }; REGIONS.push(r); return r; };
  const CIRCLE_REGION = { circle: true, nodes: [8, 9, 10, 11] };
  REGIONS.push(CIRCLE_REGION);
  function inRegion(r, x, z, m = 0) {
    if (r.circle) return x * x + z * z < (CIRCLE_R - 0.8 - m) ** 2;
    return x > r.rect[0] + m && x < r.rect[2] - m && z > r.rect[1] + m && z < r.rect[3] - m;
  }
  const regionsAt = (x, z) => REGIONS.filter((r) => inRegion(r, x, z));
  function walkable(x, z, m = 0) { for (const r of REGIONS) if (inRegion(r, x, z, m)) return true; return false; }
  // ¿El tramo recto A→B pasa cerca de la sombrilla del centro?
  function hitsCenter(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const t = clamp(-(ax * dx + az * dz) / L2, 0, 1);
    return Math.hypot(ax + dx * t, az + dz * t) < 2.6;
  }
  function lineWalkable(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az));
    for (let i = 1; i <= n; i++) { const k = i / n; if (!walkable(ax + (bx - ax) * k, az + (bz - az) * k, 0.5)) return false; }
    return true;
  }
  // Camino de (ax,az) a (tx,tz) como lista de puntos, o null si no hay
  function findRoute(ax, az, tx, tz) {
    const sR = regionsAt(ax, az), gR = regionsAt(tx, tz);
    if (!gR.length) return null;
    const inCircle = (x, z) => inRegion(CIRCLE_REGION, x, z);
    if (sR.some((r) => gR.includes(r)) && !(inCircle(ax, az) && hitsCenter(ax, az, tx, tz))) return [{ x: tx, z: tz }];
    let starts = [...new Set(sR.flatMap((r) => r.nodes))];
    if (!starts.length) { // fuera de toda zona: ir al nodo más cercano
      let bi = 0, bd = Infinity;
      NODES.forEach((n, i) => { const d = Math.hypot(n.x - ax, n.z - az); if (d < bd) { bd = d; bi = i; } });
      starts = [bi];
    }
    const goals = [...new Set(gR.flatMap((r) => r.nodes))];
    let best = null, bestC = Infinity;
    for (const s of starts) {
      if (inCircle(ax, az) && s >= 8 && hitsCenter(ax, az, NODES[s].x, NODES[s].z)) continue;
      for (const g of goals) {
        if (inCircle(tx, tz) && g >= 8 && hitsCenter(NODES[g].x, NODES[g].z, tx, tz)) continue;
        const c = Math.hypot(NODES[s].x - ax, NODES[s].z - az) + ND[s][g] + Math.hypot(NODES[g].x - tx, NODES[g].z - tz);
        if (c < bestC) { bestC = c; best = [s, g]; }
      }
    }
    if (!best) return null;
    const pts = [];
    let n = best[0];
    pts.push(NODES[n]);
    while (n !== best[1]) { n = NEXT[n][best[1]]; if (n < 0) return null; pts.push(NODES[n]); }
    pts.push({ x: tx, z: tz });
    // atajo: si se puede ir derecho al punto siguiente sin pisar el vacío, se salta el primero
    while (pts.length >= 2 && lineWalkable(ax, az, pts[1].x, pts[1].z) && !hitsCenter(ax, az, pts[1].x, pts[1].z)) pts.shift();
    return pts.map((p) => ({ x: p.x, z: p.z }));
  }
  // Puntos donde pueden aparecer las cajas sorpresa
  const BOX_SPOTS = [];

  function stripeTexture(colors, n) {
    return textTexture(512, 64, (c, w, h) => { for (let i = 0; i < n; i++) { c.fillStyle = colors[i % colors.length]; c.fillRect((i * w) / n, 0, w / n + 1, h); } });
  }

  function buildWorld() {
    // --- Pasto, cielo y alrededores ---
    const grassMat = new BABYLON.StandardMaterial('grass', scene);
    grassMat.diffuseTexture = textTexture(512, 512, (c, w, h) => {
      c.fillStyle = '#6cc04a'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { c.fillStyle = pick(['#5fb33e', '#7ccd55', '#58a83a', '#86d65f']); c.fillRect(Math.random() * w, Math.random() * h, 2, 5 + Math.random() * 6); }
    });
    grassMat.diffuseTexture.uScale = 40; grassMat.diffuseTexture.vScale = 40;
    grassMat.specularColor = C3.Black();
    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 1200, height: 1200 }, scene);
    ground.position.y = GROUND_Y; ground.material = grassMat; finishStatic(ground, false);

    // árboles lejanos
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rand(-0.15, 0.15), r = rand(175, 250);
      const x = Math.cos(a) * r, z = Math.sin(a) * r, th = rand(70, 110);
      cyl('trunk', rand(7, 11), th, x, GROUND_Y, z, mat('#8d5a34'), { collide: false, shadow: false, tess: 12 });
      for (let k = 0; k < 3; k++) {
        const f = BABYLON.MeshBuilder.CreateSphere('leaf', { diameter: rand(45, 65), segments: 8 }, scene);
        f.position.set(x + rand(-14, 14), GROUND_Y + th + rand(-6, 14), z + rand(-14, 14));
        f.material = mat(pick(['#3f9b3a', '#4caf50', '#2e8b3a'])); finishStatic(f, false);
      }
    }
    // nubes
    const cloudMat = mat('#ffffff', { emissive: '#e8f4ff', noFog: true });
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2), r = rand(150, 320), x = Math.cos(a) * r, z = Math.sin(a) * r, y = rand(120, 170);
      for (let k = 0; k < 4; k++) {
        const c = BABYLON.MeshBuilder.CreateSphere('cloud', { diameter: rand(22, 38), segments: 8 }, scene);
        c.position.set(x + k * rand(12, 18) - 25, y + rand(-4, 4), z + rand(-8, 8)); c.scaling.y = 0.55;
        c.material = cloudMat; finishStatic(c, false);
      }
    }
    // flores gigantes y arbustos que asoman entre las mesas
    const flower = (x, z, hgt, petal) => {
      cyl('stem', 0.9, hgt, x, GROUND_Y, z, mat('#3c9a3c'), { collide: false, shadow: false, tess: 8 });
      const top = GROUND_Y + hgt;
      for (let k = 0; k < 6; k++) {
        const p = BABYLON.MeshBuilder.CreateSphere('petal', { diameter: 3.2, segments: 8 }, scene);
        p.position.set(x + Math.cos(k * 1.047) * 2.2, top, z + Math.sin(k * 1.047) * 2.2); p.scaling.y = 0.35;
        p.material = plastic(petal); finishStatic(p, false);
      }
      const ctr = BABYLON.MeshBuilder.CreateSphere('fc', { diameter: 2.6, segments: 8 }, scene);
      ctr.position.set(x, top + 0.3, z); ctr.scaling.y = 0.6; ctr.material = plastic('#ffd23f'); finishStatic(ctr, false);
    };
    [[24, 24, 22], [-24, -24, 21], [-24, 24, 20], [24, -24, 23], [70, 30, 30], [-70, -30, 29], [30, -70, 31], [-30, 70, 28], [66, 66, 27], [-66, -66, 26]]
      .forEach(([x, z, hh], i) => flower(x, z, hh, ['#ff70a6', '#ffffff', '#c77dff', '#ff9f1c'][i % 4]));
    for (const [x, z] of [[-92, 20], [92, -20], [20, 94], [-20, -94], [86, 86], [-88, -86]]) {
      const b = BABYLON.MeshBuilder.CreateSphere('bush', { diameter: rand(22, 30), segments: 10 }, scene);
      b.position.set(x, GROUND_Y + 6, z); b.scaling.y = 0.75; b.material = mat('#4e9f3d'); finishStatic(b, false);
    }
    // una pelota gigante tirada en el pasto
    const ball = BABYLON.MeshBuilder.CreateSphere('ball', { diameter: 26, segments: 20 }, scene);
    ball.position.set(-34, GROUND_Y + 13, 92);
    const bm = new BABYLON.StandardMaterial('ballMat', scene); bm.diffuseTexture = stripeTexture(['#ff006e', '#ffffff', '#3a86ff', '#ffffff', '#ffd23f', '#ffffff'], 6); bm.specularColor = new C3(0.4, 0.4, 0.4);
    ball.material = bm; finishStatic(ball, false);

    // --- Materiales ---
    const wood = new BABYLON.StandardMaterial('wood', scene);
    wood.diffuseTexture = textTexture(512, 512, (c, w, h) => {
      c.fillStyle = '#d4a373'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        c.strokeStyle = `rgba(120,70,30,${0.06 + Math.random() * 0.14})`; c.lineWidth = 1 + Math.random() * 3;
        const y = Math.random() * h; c.beginPath(); c.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x / 70 + i) * 5);
        c.stroke();
      }
    });
    wood.diffuseTexture.uScale = 2; wood.diffuseTexture.vScale = 2;
    wood.specularColor = new C3(0.12, 0.1, 0.08);
    const rulerMat = new BABYLON.StandardMaterial('ruler', scene);
    rulerMat.diffuseTexture = textTexture(512, 64, (c, w, h) => {
      c.fillStyle = '#ffd166'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#7a5c12';
      for (let i = 0; i <= 50; i++) { const x = (i * w) / 50; c.fillRect(x, 0, 2, i % 5 === 0 ? 14 : 7); c.fillRect(x, h - (i % 5 === 0 ? 14 : 7), 2, 14); }
    });
    rulerMat.specularColor = new C3(0.3, 0.3, 0.3);

    // --- Mesa redonda del centro (con sombrilla) ---
    cyl('roundTop', CIRCLE_R * 2, 2, 0, -2, 0, wood, { collide: false, shadow: false, tess: 64 });
    cyl('roundRim', CIRCLE_R * 2 + 0.4, 0.5, 0, -2.2, 0, '#a47148', { collide: false, shadow: false, tess: 64 });
    cyl('roundLeg', 4, 28, 0, GROUND_Y, 0, '#a47148', { collide: false, shadow: false });
    cyl('roundFoot', 16, 1.2, 0, GROUND_Y, 0, '#a47148', { collide: false, shadow: false });
    // el piso del círculo se arma con franjas cruzadas (la física solo entiende cajas)
    const STRIPS = 16, sw = (CIRCLE_R * 2) / STRIPS;
    for (let i = 0; i < STRIPS; i++) {
      const z0 = -CIRCLE_R + i * sw, z1 = z0 + sw, zEdge = Math.max(Math.abs(z0), Math.abs(z1));
      const hw = Math.sqrt(Math.max(0, CIRCLE_R * CIRCLE_R - zEdge * zEdge));
      if (hw > 0.5) { addCollider(-hw, -2, z0, hw, 0, z1); addCollider(z0, -2, -hw, z1, 0, hw); }
    }
    cyl('umbPole', 0.8, 16, 0, 0, 0, '#f1f3f5', { tess: 12 });
    cyl('umbBase', 4, 0.8, 0, 0, 0, '#495057');
    const canopy = BABYLON.MeshBuilder.CreateCylinder('canopy', { diameterTop: 0.6, diameterBottom: 24, height: 4.5, tessellation: 16 }, scene);
    canopy.position.set(0, 14.5, 0);
    const cm = new BABYLON.StandardMaterial('canopyMat', scene); cm.diffuseTexture = stripeTexture(['#ff4d6d', '#ffffff'], 16); cm.specularColor = new C3(0.2, 0.2, 0.2); cm.backFaceCulling = false;
    canopy.material = cm; finishStatic(canopy);
    // bloques de juguete para cubrirse en el centro
    [[1, 1, 2.4, '#ff9f1c'], [-1, -1, 2.4, '#8338ec'], [1, -1, 1.2, '#06d6a0'], [-1, 1, 1.2, '#ff70a6']].forEach(([sx, sz, hh, col]) => {
      box('block', 2.4, hh, 2.4, sx * 4.2, 0, sz * 4.2, col);
    });
    [[0.38, 0.92], [-0.92, 0.38], [-0.38, -0.92], [0.92, -0.38]].forEach(([x, z], i) => {
      box('cBlock', 2, 1.2, 2, x * 12, 0, z * 12, ['#3a86ff', '#ef233c', '#2fb344', '#ffbe0b'][i]);
    });
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([x, z]) => BOX_SPOTS.push({ x: x * 6.6, z: z * 9 }));

    // --- Puentes anchos (reglas) con barandas de lápiz y cosas para cubrirse ---
    const railMats = ['#ffbe0b', '#fb5607', '#8338ec', '#06d6a0'];
    const coverCols = ['#ff70a6', '#3a86ff', '#9ef01a', '#ff9f1c', '#8338ec', '#ffd23f'];
    function bridge(ax, az, bx, bz, nodes) {
      const alongX = az === bz, hw = BRIDGE_W / 2;
      const x0 = alongX ? Math.min(ax, bx) : ax - hw, x1 = alongX ? Math.max(ax, bx) : ax + hw;
      const z0 = alongX ? az - hw : Math.min(az, bz), z1 = alongX ? az + hw : Math.max(az, bz);
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const len = alongX ? w : d;
      const m = BABYLON.MeshBuilder.CreateBox('bridge', { width: len, height: 0.6, depth: BRIDGE_W }, scene);
      m.position.set(cx, -0.3, cz); if (!alongX) m.rotation.y = Math.PI / 2;
      m.material = rulerMat; finishStatic(m, false);
      addCollider(x0, -0.6, z0, x1, 0, z1);
      for (const s of [-1, 1]) {
        const rc = s * (hw - RAIL / 2);
        if (alongX) addCollider(x0, 0, az + rc - RAIL / 2, x1, 1.1, az + rc + RAIL / 2);
        else addCollider(ax + rc - RAIL / 2, 0, z0, ax + rc + RAIL / 2, 1.1, z1);
        const a = alongX ? new V3(x0, 1.0, az + rc) : new V3(ax + rc, 1.0, z0);
        const b = alongX ? new V3(x1, 1.0, az + rc) : new V3(ax + rc, 1.0, z1);
        beam('rail', 0.32, a, b, pick(railMats));
        const posts = Math.max(2, Math.round(len / 4));
        for (let i = 0; i <= posts; i++) {
          const k = i / posts;
          const px = alongX ? x0 + w * k : ax + rc, pz = alongX ? az + rc : z0 + d * k;
          box('post', 0.25, 1.0, 0.25, px, 0, pz, '#adb5bd', { collide: false });
        }
      }
      // cosas para cubrirse a los costados (el medio queda libre para pasar)
      const n = Math.max(1, Math.floor((len - 4) / 6.5));
      for (let i = 0; i < n; i++) {
        const k = (i + 1) / (n + 1), side = i % 2 ? 1 : -1, tall = i % 3 === 1;
        const along = (alongX ? x0 : z0) + len * k, lat = side * 2.25;
        const bxp = alongX ? along : ax + lat, bzp = alongX ? az + lat : along;
        const hh = tall ? 2.3 : 1.25;
        box('bCover', alongX ? 1.8 : 1.5, hh, alongX ? 1.5 : 1.8, bxp, 0, bzp, coverCols[(i + Math.abs(Math.round(ax + az))) % coverCols.length]);
      }
      BOX_SPOTS.push({ x: (ax + bx) / 2, z: (az + bz) / 2 });
      // zona caminable (un poco más larga para que empalme con lo que une)
      const r = alongX ? addRect(x0 - 1.5, z0 + RAIL, x1 + 1.5, z1 - RAIL, nodes) : addRect(x0 + RAIL, z0 - 1.5, x1 - RAIL, z1 + 1.5, nodes);
      BRIDGE_REGIONS.push(r);
    }
    // esquinas: ladrillos de juguete
    CORN.forEach(([kx, kz], j) => {
      const x = kx * BASE_D, z = kz * BASE_D, s = CORNER_HALF * 2;
      box('brick', s, 2, s, x, -2, z, '#e63946', { shadow: false });
      for (const ox of [-2.5, 2.5]) for (const oz of [-2.5, 2.5]) cyl('stud', 2.8, 0.25, x + ox, 0, z + oz, '#e63946', { collide: false, shadow: false, tess: 16 });
      cyl('brickLeg', 2, 28, x, GROUND_Y, z, '#adb5bd', { collide: false, shadow: false, tess: 10 });
      box('cornerWall', 2, 2.3, 2, x + kx * 2.6, 0, z + kz * 2.6, '#ffd23f'); // refugio en la punta de afuera
      addRect(x - CORNER_HALF, z - CORNER_HALF, x + CORNER_HALF, z + CORNER_HALF, [4 + j]);
      BOX_SPOTS.push({ x: x - kx * 1.5, z: z - kz * 1.5 });
    });
    for (let t = 0; t < TEAMS; t++) {
      const [dx, dz] = TEAM_DIR[t], cx = dx * BASE_D, cz = dz * BASE_D;
      // puente directo al centro
      if (dz === 0) bridge(dx * (BASE_D - TABLE_HALF), 0, dx * (CIRCLE_R - 0.1), 0, [t, 8 + t]);
      else bridge(0, dz * (BASE_D - TABLE_HALF), 0, dz * (CIRCLE_R - 0.1), [t, 8 + t]);
      // puentes a las bases vecinas (por las esquinas)
      for (const [kx, kz] of baseCorners(t)) {
        if (dz === 0) bridge(cx, kz * TABLE_HALF, cx, kz * (BASE_D - CORNER_HALF), [t, cornIdx(kx, kz)]);
        else bridge(kx * TABLE_HALF, cz, kx * (BASE_D - CORNER_HALF), cz, [t, cornIdx(kx, kz)]);
      }
    }
    // --- Las cuatro bases: una mesa por equipo ---
    for (let t = 0; t < TEAMS; t++) buildBase(t, wood);

    mergeStatics();
    statics.forEach((m) => m.freezeWorldMatrix());
  }

  // Junta las piezas quietas que comparten material en una sola malla: muchas menos llamadas de dibujo (clave en celulares)
  function mergeStatics() {
    const shadowList = shadowGen ? shadowGen.getShadowMap().renderList : [];
    const groups = new Map();
    for (const m of statics) {
      if (!m.material) continue;
      const casts = shadowList.includes(m);
      const key = m.material.uniqueId + (casts ? 's' : 'n');
      if (!groups.has(key)) groups.set(key, { mtl: m.material, casts, list: [] });
      groups.get(key).list.push(m);
    }
    statics.length = 0;
    for (const { mtl, casts, list } of groups.values()) {
      if (list.length === 1) { statics.push(list[0]); continue; }
      if (casts) list.forEach((m) => shadowGen.removeShadowCaster(m));
      const merged = BABYLON.Mesh.MergeMeshes(list, true, true);
      if (!merged) { statics.push(...list); continue; }
      merged.material = mtl; merged.receiveShadows = true;
      if (casts) addCaster(merged);
      statics.push(merged);
    }
  }

  function buildBase(t, wood) {
    const [dx, dz] = TEAM_DIR[t], cx = dx * BASE_D, cz = dz * BASE_D, H2 = TABLE_HALF;
    // (u, v) son coordenadas de la base: v positivo = hacia afuera del mapa, u = hacia los costados
    const L = (u, v) => [cx - u * dz + v * dx, cz + u * dx + v * dz];
    const team = TEAM_HEX[t];
    box('table', H2 * 2, 2, H2 * 2, cx, -2, cz, wood, { shadow: false });
    for (const a of [-1, 1]) for (const b of [-1, 1]) box('tLeg', 2.4, 28, 2.4, cx + a * (H2 - 2), GROUND_Y, cz + b * (H2 - 2), '#a47148', { collide: false, shadow: false });
    addRect(cx - H2, cz - H2, cx + H2, cz + H2, [t]);
    // mantel a cuadros del color del equipo
    const cloth = new BABYLON.StandardMaterial('cloth' + t, scene);
    cloth.diffuseTexture = textTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
      c.fillStyle = team; c.globalAlpha = 0.55;
      for (let i = 0; i < 8; i++) { c.fillRect(i * 32, 0, 16, h); c.fillRect(0, i * 32, w, 16); }
    });
    cloth.diffuseTexture.uScale = cloth.diffuseTexture.vScale = 3; cloth.specularColor = C3.Black();
    box('cloth', H2 * 2 - 1.5, 0.05, H2 * 2 - 1.5, cx, 0, cz, cloth, { collide: false, shadow: false });
    // bandera en el borde de afuera
    const [fx, fz] = L(0, 10.5);
    cyl('flagPole', 0.4, 10, fx, 0, fz, '#f1f3f5', { tess: 10 });
    const flag = BABYLON.MeshBuilder.CreateBox('flag', { width: dz ? 4 : 0.12, height: 2.6, depth: dz ? 0.12 : 4 }, scene);
    flag.position.set(fx + (dz ? 2.1 : 0), 8.6, fz + (dz ? 0 : 2.1)); flag.material = plastic(team); finishStatic(flag);
    // cosas para cubrirse (dejando libres los pasillos hacia los tres puentes)
    for (const s of [-1, 1]) {
      const [lx, lz] = L(s * 7.5, -7.5);
      box('lunchbox', 4.5, 2.6, 4.5, lx, 0, lz, team);
      box('lunchLid', 4.7, 0.4, 4.7, lx, 2.6, lz, TEAM_LIGHT[t], { collide: false });
      const [ux, uz] = L(s * 7.5, 7.5);
      cyl('cup', 3, 4, ux, 0, uz, s < 0 ? '#ffffff' : TEAM_LIGHT[t]);
    }
    const [px, pz] = L(-4, 5);
    cyl('plate', 5, 0.15, px, 0, pz, '#f8f9fa', { collide: false, shadow: false });
  }

  // ------------------------------------------------------------------
  // Soldaditos (modelo hecho de piezas, un solo color como los de verdad)
  // ------------------------------------------------------------------
  function makeSoldierMesh(name, hex) {
    const parts = [];
    const add = (m, x, y, z) => { m.position.set(x, y, z); parts.push(m); return m; };
    const B = (w, h, d) => BABYLON.MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, scene);
    add(BABYLON.MeshBuilder.CreateCylinder('p', { diameter: 0.95, height: 0.08, tessellation: 18 }, scene), 0, 0.04, 0);
    add(B(0.22, 0.8, 0.26), -0.13, 0.48, -0.04);
    add(B(0.22, 0.8, 0.26), 0.13, 0.48, 0.08);
    add(B(0.56, 0.62, 0.32), 0, 1.18, 0);
    add(B(0.4, 0.42, 0.18), 0, 1.2, -0.24);
    add(BABYLON.MeshBuilder.CreateSphere('p', { diameter: 0.36, segments: 10 }, scene), 0, 1.62, 0);
    const helm = add(BABYLON.MeshBuilder.CreateSphere('p', { diameter: 0.48, segments: 10 }, scene), 0, 1.72, 0); helm.scaling.y = 0.6;
    add(BABYLON.MeshBuilder.CreateCylinder('p', { diameter: 0.56, height: 0.04, tessellation: 18 }, scene), 0, 1.67, 0);
    const aL = add(B(0.15, 0.5, 0.17), -0.33, 1.2, 0.14); aL.rotation.x = -1.1;
    const aR = add(B(0.15, 0.5, 0.17), 0.33, 1.2, 0.14); aR.rotation.x = -1.1;
    add(B(0.09, 0.1, 1.0), 0.12, 1.3, 0.5);
    const m = BABYLON.Mesh.MergeMeshes(parts, true, true);
    m.name = name; m.material = plastic(hex);
    m.receiveShadows = true; addCaster(m);
    return m;
  }

  // ------------------------------------------------------------------
  // Efectos: confeti, polvito, destellos
  // ------------------------------------------------------------------
  const squareTex = textTexture(16, 16, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 16, 16); });
  function makePS(cap, c1, c2) {
    const ps = new BABYLON.ParticleSystem('ps', cap, scene);
    ps.particleTexture = squareTex; ps.emitter = new V3(0, -200, 0);
    ps.emitRate = 0; ps.manualEmitCount = 0;
    ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    ps.color1 = C4.FromHexString(c1 + 'ff'); ps.color2 = C4.FromHexString(c2 + 'ff'); ps.colorDead = new C4(1, 1, 1, 0);
    ps.start();
    return ps;
  }
  const confettiPS = [['#ff006e', '#ffd23f'], ['#3a86ff', '#9ef01a'], ['#8338ec', '#fb5607']].map(([a, b]) => {
    const ps = makePS(touchMode ? 400 : 900, a, b);
    ps.minEmitBox = new V3(-0.3, -0.4, -0.3); ps.maxEmitBox = new V3(0.3, 0.4, 0.3);
    ps.direction1 = new V3(-3, 5, -3); ps.direction2 = new V3(3, 9, 3);
    ps.minEmitPower = 0.5; ps.maxEmitPower = 1.1; ps.minLifeTime = 1.1; ps.maxLifeTime = 2.2;
    ps.minSize = 0.07; ps.maxSize = 0.17; ps.minAngularSpeed = -9; ps.maxAngularSpeed = 9;
    ps.gravity = new V3(0, -9, 0);
    return ps;
  });
  const puffPS = makePS(400, '#ffffff', '#dddddd');
  puffPS.minEmitBox = V3.Zero(); puffPS.maxEmitBox = V3.Zero();
  puffPS.direction1 = new V3(-1, 1, -1); puffPS.direction2 = new V3(1, 2.5, 1);
  puffPS.minEmitPower = 0.6; puffPS.maxEmitPower = 1.4; puffPS.minLifeTime = 0.2; puffPS.maxLifeTime = 0.45;
  puffPS.minSize = 0.04; puffPS.maxSize = 0.1; puffPS.gravity = new V3(0, -6, 0);
  const burstQueue = [];
  function confetti(pos, amount = 1) {
    confettiPS.forEach((ps) => burstQueue.push({ ps, pos: pos.clone(), n: Math.round((touchMode ? 25 : 45) * amount), power: amount > 1.5 ? 2.2 : 1 }));
  }
  function puff(x, y, z) { burstQueue.push({ ps: puffPS, pos: new V3(x, y, z), n: 6, power: 1 }); }
  function flushBursts() {
    const used = new Set();
    for (let i = 0; i < burstQueue.length; i++) {
      const b = burstQueue[i];
      if (used.has(b.ps)) continue;
      used.add(b.ps);
      b.ps.emitter = b.pos; b.ps.manualEmitCount = b.n;
      if (b.ps !== puffPS) { b.ps.minEmitPower = 0.5 * b.power; b.ps.maxEmitPower = 1.1 * b.power; }
      burstQueue.splice(i, 1); i--;
    }
  }
  const fxList = [];
  function flashSphere(pos, size, hex) {
    const s = BABYLON.MeshBuilder.CreateSphere('flash', { diameter: 1, segments: 10 }, scene);
    s.position.copyFrom(pos);
    const m = new BABYLON.StandardMaterial('fm', scene); m.emissiveColor = C3.FromHexString(hex); m.disableLighting = true; m.alpha = 0.8;
    s.material = m;
    fxList.push({ t: 0, dur: 0.35, upd: (k) => { s.scaling.setAll(size * (0.3 + k)); m.alpha = 0.8 * (1 - k); }, end: () => { s.dispose(); m.dispose(); } });
  }

  // ------------------------------------------------------------------
  // Sonido (sintetizado, sin archivos)
  // ------------------------------------------------------------------
  let actx = null, master = null, noiseBuf = null;
  function initAudio() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = 0.45; master.connect(actx.destination);
      noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { actx = null; }
  }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    const t = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, ftype, freq, vol, delay = 0) {
    const t = actx.currentTime + delay;
    const s = actx.createBufferSource(); s.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq;
    const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.02);
  }
  function sfx(kind, v = 1) {
    if (!actx || v <= 0.01) return;
    switch (kind) {
      case 'rifle': tone('square', 950, 280, 0.06, 0.09 * v); noise(0.04, 'highpass', 2500, 0.08 * v); break;
      case 'shotgun': tone('sine', 520, 120, 0.12, 0.35 * v); noise(0.16, 'lowpass', 1400, 0.3 * v); break;
      case 'dart': noise(0.14, 'bandpass', 1800, 0.35 * v); tone('sine', 280, 900, 0.12, 0.12 * v); break;
      case 'boom': noise(0.9, 'lowpass', 700, 0.9 * v); tone('sine', 110, 35, 0.6, 0.6 * v); tone('triangle', 900, 1400, 0.2, 0.1 * v, 0.05); break;
      case 'hit': tone('sine', 1300, 1250, 0.05, 0.15); break;
      case 'head': tone('sine', 1900, 1800, 0.08, 0.18); break;
      case 'kill': [660, 880, 1320].forEach((f, i) => tone('triangle', f, f, 0.09, 0.15, i * 0.07)); break;
      case 'hurt': tone('square', 170, 70, 0.14, 0.12); break;
      case 'jump': tone('sine', 300, 620, 0.1, 0.05); break;
      case 'reload': noise(0.03, 'highpass', 3000, 0.15); noise(0.03, 'highpass', 2500, 0.15, 0.18); break;
      case 'empty': noise(0.02, 'highpass', 4000, 0.1); break;
      case 'throw': noise(0.18, 'bandpass', 900, 0.2); break;
      case 'clink': tone('sine', 2200, 2100, 0.04, 0.08 * v); break;
      case 'swap': noise(0.04, 'highpass', 2000, 0.1); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.18, 0.18, i * 0.13)); break;
      case 'lose': [392, 330, 262].forEach((f, i) => tone('triangle', f, f * 0.98, 0.25, 0.15, i * 0.2)); break;
    }
  }
  const volAt = (pos) => clamp(1 - V3.Distance(pos, camera.position) / 70, 0, 1) * 0.7;

  // ------------------------------------------------------------------
  // Física sencilla: cajas alineadas (AABB)
  // ------------------------------------------------------------------
  function overlaps(b, c) {
    return b.pos.x - b.r < c.max.x && b.pos.x + b.r > c.min.x && b.pos.y < c.max.y && b.pos.y + b.h > c.min.y && b.pos.z - b.r < c.max.z && b.pos.z + b.r > c.min.z;
  }
  function collidesAny(b) { for (const c of colliders) if (overlaps(b, c)) return true; return false; }
  function axisMove(b, ax, d) {
    if (d === 0) return;
    b.pos[ax] += d;
    for (const c of colliders) {
      if (!overlaps(b, c)) continue;
      if (ax === 'y') {
        if (d < 0) { b.pos.y = c.max.y; b.vel.y = 0; b.onGround = true; }
        else { b.pos.y = c.min.y - b.h - 0.001; b.vel.y = 0; }
      } else {
        const rise = c.max.y - b.pos.y;
        if (rise > 0 && rise <= STEP && b.wasGround) {
          const oy = b.pos.y; b.pos.y = c.max.y + 0.001;
          if (!collidesAny(b)) continue;
          b.pos.y = oy;
        }
        b.pos[ax] = d > 0 ? c.min[ax] - b.r - 0.001 : c.max[ax] + b.r + 0.001;
        b.blocked = true;
      }
    }
  }
  function moveBody(b, dt) {
    b.vel.y = Math.max(b.vel.y - GRAV * dt, -45);
    b.wasGround = b.onGround; b.blocked = false;
    axisMove(b, 'x', b.vel.x * dt);
    axisMove(b, 'z', b.vel.z * dt);
    b.onGround = false;
    axisMove(b, 'y', b.vel.y * dt);
  }
  function segBox(px, py, pz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
    let tmin = 0, tmax = 1, t1, t2, s;
    if (Math.abs(dx) < 1e-9) { if (px < x0 || px > x1) return -1; } else { t1 = (x0 - px) / dx; t2 = (x1 - px) / dx; if (t1 > t2) { s = t1; t1 = t2; t2 = s; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
    if (Math.abs(dy) < 1e-9) { if (py < y0 || py > y1) return -1; } else { t1 = (y0 - py) / dy; t2 = (y1 - py) / dy; if (t1 > t2) { s = t1; t1 = t2; t2 = s; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
    if (Math.abs(dz) < 1e-9) { if (pz < z0 || pz > z1) return -1; } else { t1 = (z0 - pz) / dz; t2 = (z1 - pz) / dz; if (t1 > t2) { s = t1; t1 = t2; t2 = s; } if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2; if (tmin > tmax) return -1; }
    return tmin;
  }
  function segWorld(p, d, maxT = 1) {
    let best = maxT;
    for (const c of colliders) {
      const t = segBox(p.x, p.y, p.z, d.x, d.y, d.z, c.min.x, c.min.y, c.min.z, c.max.x, c.max.y, c.max.z);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
  function segSoldier(p, d, s, pad = 0) {
    const r = s.r + 0.05 + pad;
    return segBox(p.x, p.y, p.z, d.x, d.y, d.z, s.pos.x - r, s.pos.y, s.pos.z - r, s.pos.x + r, s.pos.y + s.h + pad, s.pos.z + r);
  }
  const eyeOf = (s) => new V3(s.pos.x, s.pos.y + (s.h - 0.25), s.pos.z);
  const chestOf = (s) => new V3(s.pos.x, s.pos.y + s.h * 0.62, s.pos.z);
  function canSee(a, b) { const d = b.subtract(a); return segWorld(a, d) >= 1; }
  function freeSpot(x, z) {
    const t = { pos: new V3(x, 0, z), r: 0.6, h: H };
    return !collidesAny(t);
  }

  // ------------------------------------------------------------------
  // Soldados (jugador y bots)
  // ------------------------------------------------------------------
  function makeSoldier(team, isBot, name) {
    return {
      team, isBot, name, pos: new V3(), vel: new V3(), r: RADIUS, h: H, onGround: false, wasGround: false, blocked: false,
      alive: true, hp: 100, maxHp: 100, kills: 0, deaths: 0, spawnProt: 0, yaw: 0, pitch: 0, nextShot: 0, reloadT: 0,
      lastHurtT: -99
    };
  }
  const P = makeSoldier(0, false, 'Tú');
  P.cls = CLASSES.fusilero;
  P.weapons = WEAPONS.map((def) => ({ def, ammo: def.mag }));
  P.wi = 0; P.nades = 2; P.crouch = false; P.eyeH = EYE; P.deathT = 0; P.bobT = 0;
  let bots = [], soldiers = [P];
  let diff = DIFFS.normal;

  function spawnPoint(team) {
    // en la parte de afuera de la mesa de su equipo
    const [dx, dz] = TEAM_DIR[team], c = baseCenter(team);
    for (let i = 0; i < 40; i++) {
      const u = rand(-10, 10), v = rand(2, 10.5);
      const x = c.x - u * dz + v * dx, z = c.z + u * dx + v * dz;
      if (!freeSpot(x, z)) continue;
      if (soldiers.some((s) => s.alive && s !== undefined && Math.hypot(s.pos.x - x, s.pos.z - z) < 1.4)) continue;
      return new V3(x, 0.05, z);
    }
    return new V3(c.x + dx * rand(2, 5), 0.05, c.z + dz * rand(2, 5));
  }
  function respawn(s) {
    s.pos.copyFrom(spawnPoint(s.team)); s.vel.setAll(0);
    s.alive = true; s.hp = s.maxHp; s.spawnProt = 1.5; s.yaw = Math.atan2(-s.pos.x, -s.pos.z); s.pitch = 0;
    s.reloadT = 0; s.h = H; s.item = null; s.shieldT = 0; setShield(s, false);
    if (s === P) {
      P.weapons.forEach((w) => (w.ammo = w.def.mag)); P.nades = P.cls.nades; P.crouch = false;
      showMsg(''); updateHud(true);
    } else {
      s.ammo = s.wdef.mag; s.target = null; s.route = null; s.lastSeen = null; s.pusher = Math.random() < 0.65; s.retreatT = 0; s.boxGoal = null; s.goal = null; s.deathT = 0; s.stuckT = 0;
      s.mesh.setEnabled(true); s.mesh.rotation.set(0, s.yaw, 0);
      if (s.marker) s.marker.setEnabled(true);
    }
  }

  function createBots() {
    bots.forEach((b) => { b.mesh.dispose(); });
    bots = [];
    // 8 por equipo: tu equipo tiene 7 bots + tú, los otros tres equipos 8 bots cada uno
    const nouns = BOT_NOUNS.slice().sort(() => Math.random() - 0.5);
    for (let team = 0; team < TEAMS; team++) {
      for (let i = 0; i < TEAM_SIZE - (team === 0 ? 1 : 0); i++) {
        const b = makeSoldier(team, true, pick(BOT_RANKS) + ' ' + (nouns.pop() || 'Juguete'));
        b.skill = team === 0 ? ALLY_SKILL : diff;
        b.wdef = WEAPONS[i % 3 === 2 ? (Math.random() < 0.5 ? 2 : 1) : (i % 3 === 1 ? 1 : 0)];
        b.mesh = makeSoldierMesh(b.name, TEAM_HEX[team]);
        if (team === 0) {
          const mk = BABYLON.MeshBuilder.CreateDisc('mk', { radius: 0.2, tessellation: 3 }, scene);
          mk.material = mat('#8ec5ff', { emissive: '#3a86ff' }); mk.parent = b.mesh; mk.position.y = 2.25;
          mk.rotation.z = -Math.PI / 2; mk.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; b.marker = mk;
        }
        b.strafeDir = Math.random() < 0.5 ? -1 : 1; b.think = Math.random() * 0.3; b.burst = 0; b.nadeCd = rand(6, 14);
        bots.push(b);
      }
    }
    soldiers = [P, ...bots];
  }

  // ------------------------------------------------------------------
  // Proyectiles (bolitas, corchos, dardos) y canicas
  // ------------------------------------------------------------------
  const projMasters = {};
  function buildProjMasters() {
    const mk = (key, mesh, hex) => { mesh.material = mat(hex, { emissive: hex }); mesh.position.y = -999; projMasters[key] = mesh; };
    mk('pellet0', BABYLON.MeshBuilder.CreateSphere('pel', { diameter: 0.14, segments: 6 }, scene), '#7bdff2');
    mk('pellet1', BABYLON.MeshBuilder.CreateSphere('pel', { diameter: 0.14, segments: 6 }, scene), '#ff9e00');
    mk('pellet2', BABYLON.MeshBuilder.CreateSphere('pel', { diameter: 0.14, segments: 6 }, scene), '#b8f35a');
    mk('pellet3', BABYLON.MeshBuilder.CreateSphere('pel', { diameter: 0.14, segments: 6 }, scene), '#fff275');
    const cork = BABYLON.MeshBuilder.CreateCylinder('cork', { diameterTop: 0.15, diameterBottom: 0.19, height: 0.22, tessellation: 8 }, scene);
    cork.rotation.x = Math.PI / 2; cork.bakeCurrentTransformIntoVertices();
    projMasters.cork = cork; cork.material = mat('#e0b084', { emissive: '#7a5a3a' }); cork.position.y = -999;
    const dart = BABYLON.MeshBuilder.CreateCylinder('dart', { diameter: 0.07, height: 0.6, tessellation: 6 }, scene);
    dart.rotation.x = Math.PI / 2; dart.bakeCurrentTransformIntoVertices();
    projMasters.dart = dart; dart.material = mat('#9ef01a', { emissive: '#5a9e00' }); dart.position.y = -999;
    const nade = BABYLON.MeshBuilder.CreateSphere('nade', { diameter: 0.36, segments: 12 }, scene);
    nade.material = mat('#5ec8ff', { spec: 1, power: 96, emissive: '#1d5f8a', alpha: 0.9 }); nade.position.y = -999;
    projMasters.nade = nade;
    const mega = BABYLON.MeshBuilder.CreateSphere('mega', { diameter: 0.6, segments: 14 }, scene);
    mega.material = mat('#ff4d6d', { spec: 1, power: 96, emissive: '#b5172f' }); mega.position.y = -999;
    projMasters.mega = mega;
  }
  const pools = {};
  function takeMesh(key) {
    const pool = pools[key] || (pools[key] = []);
    const m = pool.pop() || projMasters[key].createInstance(key);
    m.setEnabled(true);
    return m;
  }
  function giveMesh(key, m) { m.setEnabled(false); pools[key].push(m); }

  const projectiles = [], grenades = [];
  function spawnProjectile(owner, def, origin, dir, dmgMul) {
    const key = def.proj === 'pellet' ? 'pellet' + owner.team : def.proj;
    const m = takeMesh(key);
    m.position.copyFrom(origin);
    projectiles.push({ pos: origin.clone(), vel: dir.scale(def.speed * rand(0.95, 1.05)), owner, team: owner.team, def, dmg: def.dmg * dmgMul, life: def.range / def.speed + 0.3, mesh: m, key });
  }
  const tmpD = new V3();
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.vel.y -= p.def.gravity * dt;
      p.vel.scaleToRef(dt, tmpD);
      let best = segWorld(p.pos, tmpD, 1.0001), hitS = null;
      for (const s of soldiers) {
        if (!s.alive || s.team === p.team) continue;
        const t = segSoldier(p.pos, tmpD, s);
        if (t >= 0 && t < best) { best = t; hitS = s; }
      }
      p.life -= dt;
      if (best <= 1) {
        const hx = p.pos.x + tmpD.x * best, hy = p.pos.y + tmpD.y * best, hz = p.pos.z + tmpD.z * best;
        if (hitS) {
          const head = hy > hitS.pos.y + hitS.h - 0.36;
          let dmg = p.dmg * (head ? 1.6 : 1);
          if (p.def.id === 'shotgun') { const dist = V3.Distance(new V3(hx, hy, hz), p.owner.pos); dmg *= clamp(1.25 - dist / 22, 0.3, 1); }
          damage(hitS, dmg, p.owner, head, p.def.id);
        } else puff(hx, hy, hz);
        giveMesh(p.key, p.mesh); projectiles.splice(i, 1);
        continue;
      }
      p.pos.addInPlace(tmpD);
      if (p.life <= 0 || p.pos.y < -30) { giveMesh(p.key, p.mesh); projectiles.splice(i, 1); continue; }
      p.mesh.position.copyFrom(p.pos);
      if (p.def.proj !== 'pellet') p.mesh.lookAt(p.pos.add(p.vel));
    }
  }

  function throwNade(owner, vel, mega = false) {
    const key = mega ? 'mega' : 'nade';
    const m = takeMesh(key);
    const pos = eyeOf(owner);
    if (owner === P) pos.addInPlace(forwardVec().scale(0.6));
    m.position.copyFrom(pos);
    grenades.push({ pos, vel, owner, team: owner.team, t: mega ? 2.4 : 2.2, mesh: m, r: mega ? 0.3 : 0.18, key, mega });
    sfx('throw', owner === P ? 1 : volAt(pos));
  }
  function nadeHits(g) {
    for (const c of colliders) {
      if (g.pos.x + g.r > c.min.x && g.pos.x - g.r < c.max.x && g.pos.y + g.r > c.min.y && g.pos.y - g.r < c.max.y && g.pos.z + g.r > c.min.z && g.pos.z - g.r < c.max.z) return true;
    }
    return false;
  }
  function updateGrenades(dt) {
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      g.vel.y -= GRAV * dt;
      for (const ax of ['x', 'y', 'z']) {
        const d = g.vel[ax] * dt;
        g.pos[ax] += d;
        if (nadeHits(g)) {
          g.pos[ax] -= d;
          if (Math.abs(g.vel[ax]) > 2.5) sfx('clink', volAt(g.pos));
          g.vel[ax] *= -0.45;
          if (ax === 'y') { g.vel.x *= 0.75; g.vel.z *= 0.75; }
        }
      }
      g.mesh.position.copyFrom(g.pos);
      g.mesh.rotation.x += g.vel.z * dt * 3; g.mesh.rotation.z -= g.vel.x * dt * 3;
      g.t -= dt;
      if (g.t <= 0 || g.pos.y < -25) { explode(g); giveMesh(g.key, g.mesh); grenades.splice(i, 1); }
    }
  }
  function explode(g) {
    const R = g.mega ? MEGA_R : 6.5;
    confetti(g.pos, g.mega ? 5 : 2.5); flashSphere(g.pos, R * 0.9, g.mega ? '#ff4d6d' : '#ffd23f');
    if (g.mega) { flashSphere(g.pos.add(new V3(0, 1.5, 0)), R * 0.6, '#ffd23f'); sfx('boom', 1); }
    sfx('boom', clamp(1 - V3.Distance(g.pos, camera.position) / 90, 0.1, 1));
    for (const s of soldiers) {
      if (!s.alive) continue;
      const c = chestOf(s), d = V3.Distance(c, g.pos);
      if (s === P && d < R * 1.8) shake = Math.max(shake, (g.mega ? 0.7 : 0.35) * (1 - d / (R * 1.8)));
      if (d > R || s.team === g.team) continue;
      const from = g.pos.add(new V3(0, g.mega ? 1.5 : 0.3, 0));
      if (!canSee(from, c) && !canSee(from, eyeOf(s))) continue;
      damage(s, g.mega ? 9999 : 115 * Math.pow(1 - d / R, 0.6), g.owner, false, g.mega ? 'mega' : 'nade');
    }
  }

  // ------------------------------------------------------------------
  // Cajas sorpresa: escudo, mega granada o 200 de vida (los bots también las agarran)
  // ------------------------------------------------------------------
  const BOX_COUNT = 3, BOX_RESPAWN = 40, SHIELD_TIME = 7, MEGA_R = 14, HEAL_HP = 200;
  const POWERS = {
    shield: { name: 'Escudo', icon: '🛡', color: '#5ec8ff' },
    mega: { name: 'Mega granada', icon: '💣', color: '#ff4d6d' },
    heal: { name: '200 de vida', icon: '❤', color: '#9ef01a' }
  };
  const boxes = [];
  let boxMaster = null, shieldMat = null;
  function buildBoxes() {
    const giftMat = new BABYLON.StandardMaterial('gift', scene);
    giftMat.diffuseTexture = textTexture(256, 256, (c, w, h) => {
      c.fillStyle = '#ffbe0b'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ff006e'; c.fillRect(w * 0.42, 0, w * 0.16, h); c.fillRect(0, h * 0.42, w, h * 0.16);
      c.fillStyle = '#ffffff'; c.font = '900 120px "Arial Black", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.strokeStyle = '#2b2d42'; c.lineWidth = 10; c.strokeText('?', w / 2, h / 2 + 6); c.fillText('?', w / 2, h / 2 + 6);
    });
    giftMat.emissiveColor = new C3(0.45, 0.35, 0.1); giftMat.specularColor = new C3(0.4, 0.4, 0.4);
    boxMaster = BABYLON.MeshBuilder.CreateBox('giftBox', { size: 1.1 }, scene);
    boxMaster.material = giftMat; boxMaster.position.y = -999; addCaster(boxMaster);
    shieldMat = new BABYLON.StandardMaterial('shieldMat', scene);
    shieldMat.diffuseColor = C3.FromHexString('#5ec8ff'); shieldMat.emissiveColor = C3.FromHexString('#2a8fd6');
    shieldMat.alpha = 0.28; shieldMat.specularColor = new C3(1, 1, 1); shieldMat.backFaceCulling = false;
    for (let i = 0; i < BOX_COUNT; i++) {
      const m = i === 0 ? boxMaster : boxMaster.clone('giftBox' + i);
      boxes.push({ mesh: m, active: false, t: 0, pos: new V3(), spin: rand(0, 6) });
    }
  }
  function placeBox(bx) {
    const free = BOX_SPOTS.filter((p) => !boxes.some((o) => o !== bx && o.active && Math.hypot(o.pos.x - p.x, o.pos.z - p.z) < 8) &&
      !soldiers.some((s) => s.alive && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 4));
    const p = pick(free.length ? free : BOX_SPOTS);
    bx.pos.set(p.x, 0, p.z); bx.active = true; bx.mesh.setEnabled(true);
  }
  function resetBoxes() { boxes.forEach((b) => (b.active = false)); boxes.forEach(placeBox); }
  function updateBoxes(dt) {
    for (const bx of boxes) {
      if (!bx.active) { bx.t -= dt; if (bx.t <= 0) placeBox(bx); continue; }
      bx.spin += dt;
      bx.mesh.position.set(bx.pos.x, 0.9 + Math.sin(bx.spin * 2.5) * 0.18, bx.pos.z);
      bx.mesh.rotation.y = bx.spin * 1.4;
      for (const s of soldiers) {
        if (!s.alive || Math.hypot(s.pos.x - bx.pos.x, s.pos.z - bx.pos.z) > 1.3 || Math.abs(s.pos.y - bx.pos.y) > 2) continue;
        givePower(s, pick(Object.keys(POWERS)));
        bx.active = false; bx.t = BOX_RESPAWN; bx.mesh.setEnabled(false);
        confetti(bx.mesh.position, 1.2);
        break;
      }
    }
  }
  function givePower(s, kind) {
    const pw = POWERS[kind];
    if (kind === 'heal') s.hp = Math.max(s.hp, HEAL_HP);
    else s.item = kind;
    if (s === P) {
      sfx('win');
      showBanner(pw.icon + ' ' + pw.name.toUpperCase() + (kind === 'heal' ? '!' : touchMode ? ' · toca ⭐' : ' · tecla F'));
      updateHud(true);
    }
    addNote(s, (s === P ? 'agarraste ' : 'agarró ') + pw.icon + ' ' + pw.name);
  }
  function setShield(s, on) {
    if (!s.shieldMesh && on) {
      const host = s === P ? P.mesh : s.mesh;
      if (host) {
        const sh = BABYLON.MeshBuilder.CreateSphere('shield', { diameter: 2.4, segments: 14 }, scene);
        sh.material = shieldMat; sh.parent = host; sh.position.y = 0.95; sh.isPickable = false;
        s.shieldMesh = sh;
      }
    }
    if (s.shieldMesh) s.shieldMesh.setEnabled(on);
  }
  // Usa la habilidad guardada (escudo o mega granada)
  function useItem(s, aimDir) {
    if (!s.alive || !s.item) return false;
    const kind = s.item; s.item = null;
    if (kind === 'shield') { s.shieldT = SHIELD_TIME; setShield(s, true); sfx('reload'); }
    else if (kind === 'mega') throwNade(s, aimDir, true);
    if (s === P) updateHud(true);
    return true;
  }
  function playerItem() {
    if (!P.alive || !P.item) return;
    const f = forwardVec();
    useItem(P, f.scale(19).add(new V3(0, 5.5, 0)).add(P.vel.scale(0.5)));
  }
  function updateShields(dt) {
    for (const s of soldiers) {
      if (s.shieldT > 0) { s.shieldT -= dt; if (s.shieldT <= 0 || !s.alive) { s.shieldT = 0; setShield(s, false); } }
    }
  }

  // ------------------------------------------------------------------
  // Daño, eliminaciones y marcador
  // ------------------------------------------------------------------
  const score = new Array(TEAMS).fill(0);
  let state = 'menu', gameTime = 0, shake = 0;

  function damage(t, amount, attacker, head, how) {
    if (!t.alive || t.spawnProt > 0 || state !== 'playing') return;
    if (t.shieldT > 0) { // el escudo frena todo
      if (attacker === P) { hitmarker(false, true); sfx('clink', 1); }
      if (t === P) sfx('clink', 1);
      return;
    }
    t.hp -= amount; t.lastHurtT = gameTime;
    if (t === P) { dmgFlash = Math.min(1, dmgFlash + amount / 45); sfx('hurt'); }
    else if (attacker === P) { hitmarker(head); sfx(head ? 'head' : 'hit'); }
    if (t.isBot && attacker && attacker.alive) { t.alertFrom = attacker; t.alertT = 2.5; }
    if (t.hp <= 0) kill(t, attacker, how, head);
  }
  function kill(t, attacker, how, head) {
    t.alive = false; t.hp = 0; t.deaths++;
    confetti(chestOf(t), 1);
    if (attacker && attacker.team !== t.team) { score[attacker.team]++; attacker.kills++; }
    addFeed(attacker, t, how, head);
    if (t === P) {
      P.deathT = 3;
      killerName = attacker ? attacker.name : null;
    } else {
      t.deathT = 0; t.respawnT = 4.5;
      if (t.marker) t.marker.setEnabled(false);
    }
    if (attacker === P && t !== P) { sfx('kill'); showBanner(head ? '¡TIRO A LA CABEZA! +1' : '¡ELIMINADO! +1'); }
    updateHud(true);
    if (state === 'playing' && score.some((v) => v >= WIN_SCORE)) endMatch();
  }
  let killerName = null;

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------
  const hud = { score: $('score'), hpfill: $('hpfill'), hptext: $('hptext'), wname: $('wname'), ammo: $('ammo'), nades: $('nades'), slots: $('slots'), msg: $('msg'), dmg: $('dmg'), cross: $('crosshair'), hit: $('hitmarker'), banner: $('banner'), feed: $('killfeed'), item: $('item'), shield: $('shieldfx') };
  let dmgFlash = 0, hitT = 0, bannerT = 0, lastHudKey = '';
  // marcador de los 4 equipos
  hud.score.innerHTML = TEAM_NAME.map((n, t) => `<span class="team" style="color:${TEAM_LIGHT[t]}">${n.toUpperCase()} <b id="sc${t}">0</b></span>`).join('') + `<span class="goal">Meta: ${WIN_SCORE}</span>`;
  const scoreEls = TEAM_NAME.map((n, t) => $('sc' + t));
  WEAPONS.forEach((w, i) => { const s = document.createElement('span'); s.textContent = (i + 1) + ' ' + w.name.split(' ')[0]; hud.slots.appendChild(s); });
  function updateHud(force) {
    const w = P.weapons[P.wi];
    const key = [score.join(','), Math.ceil(P.hp), P.wi, w.ammo, P.nades, P.reloadT > 0, P.item, Math.ceil(P.shieldT || 0)].join('|');
    if (!force && key === lastHudKey) return;
    lastHudKey = key;
    scoreEls.forEach((el, t) => { el.textContent = score[t]; });
    const lead = Math.max(...score);
    scoreEls.forEach((el, t) => el.parentNode.classList.toggle('lead', lead > 0 && score[t] === lead));
    const hp = Math.max(0, Math.ceil(P.hp));
    hud.hpfill.style.width = Math.min(100, 100 * hp / P.maxHp) + '%'; hud.hpfill.classList.toggle('low', hp < P.maxHp * 0.35);
    hud.hpfill.classList.toggle('over', hp > P.maxHp);
    hud.hptext.textContent = hp;
    hud.wname.textContent = w.def.name;
    hud.ammo.textContent = P.reloadT > 0 ? 'Recargando…' : w.ammo + ' / ' + w.def.mag;
    hud.nades.textContent = '● ×' + P.nades;
    const pw = P.item && POWERS[P.item];
    hud.item.textContent = P.shieldT > 0 ? `🛡 Escudo ${Math.ceil(P.shieldT)}s` : pw ? `${pw.icon} ${pw.name} · ${touchMode ? '⭐' : 'F'}` : '';
    hud.item.classList.toggle('hidden', !hud.item.textContent);
    hud.shield.classList.toggle('on', P.shieldT > 0);
    bItem.classList.toggle('empty', !P.item);
    bItem.textContent = pw ? pw.icon : '⭐';
    [...hud.slots.children].forEach((s, i) => s.classList.toggle('cur', i === P.wi));
  }
  function hitmarker(head, blocked) { hitT = 0.15; hud.hit.classList.add('show'); hud.hit.classList.toggle('head', !!head); hud.hit.classList.toggle('blocked', !!blocked); }
  function showBanner(t) { hud.banner.textContent = t; hud.banner.classList.add('show'); bannerT = 1.4; }
  function showMsg(t) { if (hud.msg.textContent !== t) hud.msg.textContent = t; }
  function addFeed(att, vic, how, head) {
    const cls = (s) => (s === P ? 'me' : 't' + s.team);
    const icon = { rifle: '•', shotgun: '▮', dart: '➶', nade: '●', mega: '💣', fall: '↓' }[how] || '•';
    const div = document.createElement('div');
    if (!att || att === vic) div.innerHTML = `<span class="${cls(vic)}">${vic.name}</span> se cayó al pasto`;
    else div.innerHTML = `<span class="${cls(att)}">${att.name}</span> ${icon}${head ? '✪' : ''} <span class="${cls(vic)}">${vic.name}</span>`;
    pushFeed(div);
  }
  function pushFeed(div) {
    hud.feed.prepend(div);
    while (hud.feed.children.length > 5) hud.feed.lastChild.remove();
    setTimeout(() => div.remove(), 5000);
  }
  function addNote(s, text) {
    const div = document.createElement('div');
    div.innerHTML = `<span class="${s === P ? 'me' : 't' + s.team}">${s.name}</span> ${text}`;
    pushFeed(div);
  }

  // ------------------------------------------------------------------
  // Arma en primera persona (viewmodel)
  // ------------------------------------------------------------------
  const vmRoot = new BABYLON.TransformNode('vmRoot', scene);
  vmRoot.parent = camera;
  vmRoot.scaling.setAll(0.6);
  const vms = [];
  function buildViewmodels() {
    const part = (shape, o, hex, x, y, z, rx = 0) => {
      const m = shape === 'box' ? BABYLON.MeshBuilder.CreateBox('v', o, scene) : shape === 'cyl' ? BABYLON.MeshBuilder.CreateCylinder('v', Object.assign({ tessellation: 14 }, o), scene) : BABYLON.MeshBuilder.CreateSphere('v', Object.assign({ segments: 10 }, o), scene);
      m.position.set(x, y, z); m.rotation.x = rx; m.material = plastic(hex); return m;
    };
    const R = Math.PI / 2;
    const groups = [
      [ // rifle de bolitas
        part('box', { width: 0.11, height: 0.13, depth: 0.55 }, '#ff9f1c', 0, 0, 0),
        part('cyl', { diameter: 0.05, height: 0.35 }, '#495057', 0, 0.02, 0.42, R),
        part('sph', { diameter: 0.17 }, '#ffd23f', 0, 0.12, -0.02),
        part('box', { width: 0.08, height: 0.16, depth: 0.08 }, '#e85d04', 0, -0.12, -0.1),
        part('box', { width: 0.09, height: 0.1, depth: 0.22 }, '#e85d04', 0, -0.02, -0.36)
      ],
      [ // escopeta de corchos
        part('box', { width: 0.16, height: 0.11, depth: 0.38 }, '#8d5524', 0, -0.02, -0.08),
        part('cyl', { diameter: 0.075, height: 0.55 }, '#d4a373', -0.04, 0.03, 0.3, R),
        part('cyl', { diameter: 0.075, height: 0.55 }, '#d4a373', 0.04, 0.03, 0.3, R),
        part('cyl', { diameter: 0.06, height: 0.06 }, '#f3d5b5', -0.04, 0.03, 0.59, R),
        part('cyl', { diameter: 0.06, height: 0.06 }, '#f3d5b5', 0.04, 0.03, 0.59, R),
        part('box', { width: 0.08, height: 0.15, depth: 0.08 }, '#6f4518', 0, -0.13, -0.12)
      ],
      [ // lanzadardos
        part('box', { width: 0.12, height: 0.16, depth: 0.45 }, '#8338ec', 0, 0, 0),
        part('cyl', { diameter: 0.07, height: 0.4 }, '#fb5607', 0, 0.03, 0.38, R),
        part('cyl', { diameter: 0.035, height: 0.12 }, '#9ef01a', 0, 0.03, 0.62, R),
        part('box', { width: 0.04, height: 0.06, depth: 0.16 }, '#212529', 0, 0.12, 0.02),
        part('box', { width: 0.08, height: 0.16, depth: 0.08 }, '#5a189a', 0, -0.13, -0.08)
      ]
    ];
    groups.forEach((parts) => {
      const m = BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
      m.parent = vmRoot; m.renderingGroupId = 1; m.setEnabled(false);
      vms.push(m);
    });
  }
  let vmKick = 0, vmSwap = 0;

  // ------------------------------------------------------------------
  // Entrada: teclado, ratón y pantalla táctil
  // ------------------------------------------------------------------
  const keys = {};
  let mouseDown = false, aimDown = false, locked = false, wantsLock = false;
  let jumpPressed = false, touchFire = false, editingLayout = false;
  const SENS = 0.0022;

  // ------------------------------------------------------------------
  // Configuración del jugador (se guarda en este aparato)
  // ------------------------------------------------------------------
  const CFG_KEY = 'plasticArmy.settings.v1';
  const CFG_DEFAULT = { sens: 1, cam: 'first', fire: 'auto', layout: {} };
  const cfg = (() => {
    try { return Object.assign({}, CFG_DEFAULT, JSON.parse(localStorage.getItem(CFG_KEY) || '{}')); } catch (e) { return Object.assign({}, CFG_DEFAULT); }
  })();
  if (!cfg.layout || typeof cfg.layout !== 'object') cfg.layout = {};
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* sin guardado */ } }

  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Escape' && editingLayout) { endLayoutEdit(); return; }
    if (e.code === 'Escape' && !settingsUI.classList.contains('hidden')) { closeSettings(); return; }
    if (state !== 'playing') return;
    if (e.code === 'Space') { jumpPressed = true; e.preventDefault(); }
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyG') playerNade();
    if (e.code === 'KeyF') playerItem();
    if (e.code === 'KeyQ') switchWeapon((P.wi + 1) % 3);
    if (e.code === 'Digit1') switchWeapon(0);
    if (e.code === 'Digit2') switchWeapon(1);
    if (e.code === 'Digit3') switchWeapon(2);
    if (e.code === 'KeyP' || (e.code === 'Escape' && !locked)) pauseGame();
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; aimDown = false; });
  // Ratón: escuchamos pointer y mouse a la vez y leemos qué botones están apretados,
  // así un clic perdido (o apretar los dos botones juntos) no deja el disparo trabado.
  const syncButtons = (e) => { mouseDown = (e.buttons & 1) !== 0; aimDown = (e.buttons & 2) !== 0; };
  const onDown = (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (performance.now() - lastTouchT < 1500 || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) return;
    if (touchMode) disableTouch();
    if (state !== 'playing') return;
    if (!locked && wantsLock) requestLock();
    syncButtons(e);
  };
  const onUp = (e) => { if (!e.pointerType || e.pointerType === 'mouse') syncButtons(e); };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('mousedown', onDown);
  addEventListener('pointerup', onUp);
  addEventListener('mouseup', onUp);
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || state !== 'playing' || touchMode) return;
    if ((locked || e.buttons) && Math.abs(e.movementX) < 250 && Math.abs(e.movementY) < 250) {
      const s = SENS * cfg.sens * (aimDown && WEAPONS[P.wi].zoom ? 0.4 : aimDown ? 0.75 : 1);
      P.yaw += e.movementX * s; P.pitch = clamp(P.pitch + e.movementY * s, -1.45, 1.45);
    }
  });
  addEventListener('wheel', (e) => { if (state === 'playing') switchWeapon((P.wi + (e.deltaY > 0 ? 1 : 2)) % 3); }, { passive: true });

  function requestLock() {
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* sin bloqueo de puntero */ }
  }
  document.addEventListener('pointerlockchange', () => {
    const was = locked;
    locked = document.pointerLockElement === canvas;
    if (was && !locked && state === 'playing') pauseGame();
  });

  // Táctil: dos joysticks que aparecen donde pones el dedo
  const sticks = {
    L: { id: null, ox: 0, oy: 0, x: 0, y: 0, el: $('stickL') },
    R: { id: null, ox: 0, oy: 0, x: 0, y: 0, el: $('stickR') }
  };
  const STICK_R = 55;
  const touchLayer = $('touch');
  function enableTouch() {
    touchMode = true;
    document.body.classList.add('touch');
    if (state === 'playing') touchLayer.classList.remove('hidden');
  }
  function disableTouch() {
    touchMode = false;
    document.body.classList.remove('touch');
    touchLayer.classList.add('hidden');
    hud.cross.classList.remove('on');
  }
  if (touchMode) enableTouch();
  let lastTouchT = -1e9;
  addEventListener('touchstart', () => { lastTouchT = performance.now(); if (!touchMode) enableTouch(); }, { passive: true, capture: true });
  touchLayer.addEventListener('touchstart', (e) => {
    if (e.target.classList.contains('tbtn')) return;
    e.preventDefault();
    if (editingLayout) return;
    for (const t of e.changedTouches) {
      const side = t.clientX < innerWidth * 0.5 ? 'L' : 'R';
      const s = sticks[side];
      if (s.id !== null) continue;
      s.id = t.identifier; s.ox = t.clientX; s.oy = t.clientY; s.x = 0; s.y = 0;
      s.el.style.left = s.ox + 'px'; s.el.style.top = s.oy + 'px'; s.el.classList.add('on');
      s.el.firstElementChild.style.transform = 'translate(0px,0px)';
    }
  }, { passive: false });
  touchLayer.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      for (const k of ['L', 'R']) {
        const s = sticks[k];
        if (s.id !== t.identifier) continue;
        let dx = t.clientX - s.ox, dy = t.clientY - s.oy;
        const len = Math.hypot(dx, dy);
        if (len > STICK_R) { dx *= STICK_R / len; dy *= STICK_R / len; }
        s.x = dx / STICK_R; s.y = dy / STICK_R;
        s.el.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
      }
    }
  }, { passive: false });
  const endTouch = (e) => {
    for (const t of e.changedTouches) for (const k of ['L', 'R']) {
      const s = sticks[k];
      if (s.id === t.identifier) { s.id = null; s.x = 0; s.y = 0; s.el.classList.remove('on'); }
    }
  };
  touchLayer.addEventListener('touchend', endTouch);
  touchLayer.addEventListener('touchcancel', endTouch);
  const tbtn = (id, fn) => $(id).addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); if (state === 'playing' && !editingLayout) fn(); }, { passive: false });
  tbtn('bJump', () => (jumpPressed = true));
  tbtn('bNade', () => playerNade());
  const bItem = $('bItem');
  tbtn('bItem', () => playerItem());
  tbtn('bSwap', () => switchWeapon((P.wi + 1) % 3));
  tbtn('bReload', () => startReload());
  tbtn('bCrouch', () => { P.crouchToggle = !P.crouchToggle; $('bCrouch').classList.toggle('on', P.crouchToggle); });
  tbtn('bPause', () => pauseGame());
  // Botón de disparo (modo manual): dispara mientras lo mantienes apretado
  const bFire = $('bFire');
  bFire.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); if (state === 'playing' && !editingLayout) { touchFire = true; bFire.classList.add('on'); } }, { passive: false });
  const fireUp = (e) => { e.preventDefault(); touchFire = false; bFire.classList.remove('on'); };
  bFire.addEventListener('touchend', fireUp, { passive: false });
  bFire.addEventListener('touchcancel', fireUp, { passive: false });

  // ------------------------------------------------------------------
  // Jugador: movimiento y disparo
  // ------------------------------------------------------------------
  const forwardVec = () => new V3(Math.sin(P.yaw) * Math.cos(P.pitch), -Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch));
  function switchWeapon(i) {
    if (i === P.wi || !P.alive) return;
    P.wi = i; P.reloadT = 0; P.nextShot = Math.max(P.nextShot, gameTime + 0.25); vmSwap = 1; sfx('swap');
    updateHud(true);
  }
  function startReload() {
    const w = P.weapons[P.wi];
    if (P.reloadT > 0 || w.ammo === w.def.mag || !P.alive) return;
    P.reloadT = w.def.reload * P.cls.reloadMul; sfx('reload'); updateHud(true);
  }
  function playerNade() {
    if (!P.alive || P.nades <= 0) return;
    P.nades--;
    const f = forwardVec();
    throwNade(P, f.scale(17).add(new V3(0, 4.5, 0)).add(P.vel.scale(0.5)));
    updateHud(true);
  }
  // ¿La mira está sobre un enemigo visible? (para el disparo automático en celular)
  function enemyInSights(range) {
    const eye = camera.position, d = forwardVec().scale(range);
    const wall = segWorld(eye, d);
    for (const s of soldiers) {
      if (!s.alive || s.team === P.team) continue;
      const t = segSoldier(eye, d, s, 0.2);
      if (t >= 0 && t < wall) return true;
    }
    return false;
  }
  function firePlayer() {
    const w = P.weapons[P.wi], def = w.def;
    if (P.reloadT > 0 || gameTime < P.nextShot) return;
    if (w.ammo <= 0) { sfx('empty'); startReload(); return; }
    w.ammo--; P.nextShot = gameTime + 1 / def.rate;
    const f = forwardVec();
    const eye = camera.position.clone();
    const far = f.scale(def.range);
    // punto al que apunta el centro de la pantalla
    let t = segWorld(eye, far);
    if (thirdPerson()) t = Math.max(t, camBack / def.range); // no apuntar a lo que hay entre la cámara y tu soldadito
    for (const s of soldiers) { if (s.alive && s.team !== P.team) { const ts = segSoldier(eye, far, s); if (ts >= 0 && ts < t) t = ts; } }
    const aimPt = eye.add(far.scale(Math.max(t, 0.02)));
    const right = new V3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    const gunEye = thirdPerson() ? headPos() : eye;
    const origin = gunEye.add(f.scale(0.35)).add(right.scale(0.14)).add(new V3(0, -0.1, 0));
    const base = aimPt.subtract(origin).normalize();
    const moving = Math.hypot(P.vel.x, P.vel.z) > 1 ? 1.6 : 1;
    let spread = def.spread * moving * (P.onGround ? 1 : 2) * (P.crouch ? 0.7 : 1) * (aimDown ? 0.5 : 1);
    if (def.pellets > 1) spread = def.spread;
    for (let i = 0; i < def.pellets; i++) spawnProjectile(P, def, origin, jitter(base, spread), 1);
    sfx(def.sound);
    P.pitch -= def.kick * (P.crouch ? 0.6 : 1); vmKick = 1;
    if (w.ammo === 0) startReload();
    updateHud();
  }
  function jitter(dir, s) {
    const up = Math.abs(dir.y) > 0.95 ? new V3(1, 0, 0) : V3.Up();
    const r = V3.Cross(dir, up).normalize(), u = V3.Cross(r, dir).normalize();
    const a = (Math.random() + Math.random() - 1) * s, b = (Math.random() + Math.random() - 1) * s;
    return dir.add(r.scale(a)).add(u.scale(b)).normalize();
  }

  function updatePlayer(dt) {
    if (!P.alive) {
      P.deathT -= dt;
      showMsg((killerName ? '¡Te eliminó ' + killerName + '!' : '¡Te caíste al pasto!') + '\nVuelves en ' + Math.max(1, Math.ceil(P.deathT)) + '…');
      if (P.deathT <= 0) respawn(P);
      return;
    }
    P.spawnProt = Math.max(0, P.spawnProt - dt);
    let mx = 0, mz = 0;
    if (keys.KeyW || keys.ArrowUp) mz += 1;
    if (keys.KeyS || keys.ArrowDown) mz -= 1;
    if (keys.KeyD || keys.ArrowRight) mx += 1;
    if (keys.KeyA || keys.ArrowLeft) mx -= 1;
    if (touchMode) {
      mx += sticks.L.x; mz -= sticks.L.y;
      // Joystick derecho: mientras lo mantienes inclinado la mira gira (más lejos del centro = más rápido)
      const rx = sticks.R.x, ry = sticks.R.y;
      if (rx || ry) {
        const curve = (v) => Math.sign(v) * Math.pow(Math.abs(v), 1.7);
        const slow = hud.cross.classList.contains('on') ? 0.45 : 1; // ayuda: más lento sobre un enemigo
        const zoom = aimDown && WEAPONS[P.wi].zoom ? 0.4 : 1;
        P.yaw += curve(rx) * 3.4 * cfg.sens * slow * zoom * dt;
        P.pitch = clamp(P.pitch + curve(ry) * 2.2 * cfg.sens * slow * zoom * dt, -1.45, 1.45);
      }
    }
    const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
    P.crouch = !!(keys.KeyC || P.crouchToggle);
    const wantH = P.crouch ? H_CROUCH : H;
    if (wantH > P.h) { const oh = P.h; P.h = wantH; if (collidesAny(P)) { P.h = oh; P.crouch = true; } } else P.h = wantH;
    const sprint = (keys.ShiftLeft || keys.ShiftRight || (touchMode && Math.hypot(sticks.L.x, sticks.L.y) > 0.95 && mz > 0.7)) && !P.crouch && mz > 0;
    const speed = P.cls.speed * (sprint ? 1.4 : 1) * (P.crouch ? 0.5 : 1) * (aimDown ? 0.6 : 1);
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    const tx = (fz * mx + fx * mz) * speed, tz = (-fx * mx + fz * mz) * speed;
    const k = Math.min(1, (P.onGround ? 14 : 2.5) * dt);
    P.vel.x += (tx - P.vel.x) * k; P.vel.z += (tz - P.vel.z) * k;
    if (jumpPressed && P.onGround) { P.vel.y = P.cls.jump * (P.crouch ? 0.8 : 1); sfx('jump'); }
    jumpPressed = false;
    moveBody(P, dt);
    if (P.pos.y < -18) { kill(P, null, 'fall'); return; }

    // vida que se recupera sola si no recibes daño
    if (gameTime - P.lastHurtT > 4 && P.hp < P.maxHp) P.hp = Math.min(P.maxHp, P.hp + 14 * dt);

    // recarga
    if (P.reloadT > 0) {
      P.reloadT -= dt;
      if (P.reloadT <= 0) { P.reloadT = 0; P.weapons[P.wi].ammo = P.weapons[P.wi].def.mag; updateHud(true); }
    }
    // disparo
    const def = WEAPONS[P.wi];
    let firing = mouseDown;
    if (touchMode) {
      const onTarget = enemyInSights(def.range * 0.8);
      hud.cross.classList.toggle('on', onTarget);
      firing = firing || (cfg.fire === 'manual' ? touchFire : onTarget);
    }
    if (firing) firePlayer();
    updateHud();
  }

  // ------------------------------------------------------------------
  // Inteligencia de los bots
  // ------------------------------------------------------------------
  function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
  function findTarget(b) {
    const eye = eyeOf(b);
    let best = null, bestD = 60;
    for (const s of soldiers) {
      if (!s.alive || s.team === b.team) continue;
      const dx = s.pos.x - b.pos.x, dz = s.pos.z - b.pos.z, d = Math.hypot(dx, dz);
      if (d > bestD) continue;
      const inFov = Math.abs(angDiff(b.yaw, Math.atan2(dx, dz))) < 1.3 || d < 7 || (b.alertT > 0 && b.alertFrom === s);
      if (!inFov) continue;
      if (!canSee(eye, chestOf(s)) && !canSee(eye, eyeOf(s))) continue;
      best = s; bestD = d;
    }
    return best;
  }
  // Adónde va un bot cuando no ve enemigos: al círculo, a una base enemiga, a un cruce o a cuidar la suya
  function goalCandidate(b) {
    const r = Math.random();
    if (r < 0.25) { const a = rand(0, Math.PI * 2), d = rand(4, CIRCLE_R - 3); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; }
    if (r < 0.5) { // una base enemiga (nunca la propia)
      const t = pick([0, 1, 2, 3].filter((k) => k !== b.team)), c = baseCenter(t);
      return { x: c.x + rand(-9, 9), z: c.z + rand(-9, 9) };
    }
    if (r < 0.7) { const [kx, kz] = pick(CORN); return { x: kx * BASE_D + rand(-3, 3), z: kz * BASE_D + rand(-3, 3) }; }
    // un punto de algún puente
    const rr = pick(BRIDGE_REGIONS).rect, alongX = rr[2] - rr[0] > rr[3] - rr[1];
    const cx = (rr[0] + rr[2]) / 2, cz = (rr[1] + rr[3]) / 2;
    return alongX ? { x: rand(rr[0] + 3, rr[2] - 3), z: cz + rand(-0.8, 0.8) } : { x: cx + rand(-0.8, 0.8), z: rand(rr[1] + 3, rr[3] - 3) };
  }
  // Adónde va un bot cuando no ve enemigos: prueba varios lugares y elige el que tenga menos compañeros cerca
  // (así el equipo se reparte por el mapa en vez de ir todos juntos o quedarse en la base)
  function pickGoal(b) {
    let best = null, bestScore = Infinity;
    for (let i = 0; i < 6; i++) {
      const g = goalCandidate(b);
      if (!freeSpot(g.x, g.z) || !walkable(g.x, g.z, 0.6)) continue;
      let crowd = 0;
      for (const o of bots) {
        if (o === b || o.team !== b.team || !o.alive) continue;
        if (Math.hypot(o.pos.x - g.x, o.pos.z - g.z) < 14) crowd++;
        if (o.goal && Math.hypot(o.goal.x - g.x, o.goal.z - g.z) < 14) crowd += 1.5;
      }
      const sc = crowd + Math.random() * 0.8;
      if (sc < bestScore) { bestScore = sc; best = g; }
    }
    b.goal = best || { x: 0, z: ENTRY_R };
    return b.goal;
  }
  function inBase(b) { const h = baseCenter(b.team); return Math.abs(b.pos.x - h.x) < TABLE_HALF && Math.abs(b.pos.z - h.z) < TABLE_HALF; }
  // Caja sorpresa cercana que convenga ir a buscar
  function nearBox(b, maxD) {
    let best = null, bd = maxD;
    for (const bx of boxes) {
      if (!bx.active) continue;
      const d = Math.hypot(bx.pos.x - b.pos.x, bx.pos.z - b.pos.z);
      if (d < bd) { bd = d; best = bx; }
    }
    return best;
  }

  // Dirección hacia el próximo punto del camino (o null si no hay camino)
  function routeDir(b) {
    while (b.route && b.route.length && Math.hypot(b.route[0].x - b.pos.x, b.route[0].z - b.pos.z) < 1.2) b.route.shift();
    if (!b.route || !b.route.length) return null;
    const dx = b.route[0].x - b.pos.x, dz = b.route[0].z - b.pos.z, d = Math.hypot(dx, dz) || 1;
    return [dx / d, dz / d];
  }
  function planRoute(b, goal) {
    return findRoute(b.pos.x, b.pos.z, goal.x, goal.z);
  }
  // Freno de seguridad: los bots no caminan hacia el borde de una mesa o un puente
  function safeMove(b, mx, mz) {
    if (!mx && !mz) return [0, 0];
    const m = walkable(b.pos.x, b.pos.z, 0.45) ? 0.45 : 0, look = 0.9;
    const ok = (x, z) => walkable(b.pos.x + x * look, b.pos.z + z * look, m);
    if (ok(mx, mz)) return [mx, mz];
    if (mx && ok(mx, 0)) return [mx, 0];
    if (mz && ok(0, mz)) return [0, mz];
    return [0, 0];
  }
  function updateBot(b, dt) {
    if (!b.alive) {
      b.deathT += dt;
      const k = Math.min(1, b.deathT / 0.35);
      b.mesh.rotation.x = -k * Math.PI / 2;
      if (b.deathT > 1.6) b.mesh.setEnabled(false);
      b.respawnT -= dt;
      if (b.respawnT <= 0) respawn(b);
      return;
    }
    const sk = b.skill;
    b.spawnProt = Math.max(0, b.spawnProt - dt);
    b.retreatT = Math.max(0, (b.retreatT || 0) - dt);
    b.boxCd = (b.boxCd || 0) - dt;
    // se curan solos si nadie les pega un rato (igual que el jugador)
    if (gameTime - b.lastHurtT > 5 && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + 12 * dt);
    b.alertT = Math.max(0, (b.alertT || 0) - dt);
    b.nadeCd -= dt;
    b.think -= dt;
    if (b.think <= 0) {
      b.think = rand(0.18, 0.32);
      const t = findTarget(b);
      if (t !== b.target) { b.target = t; b.seenT = 0; }
      if (t) b.lastSeen = t.pos.clone();
      const hurt = b.hp < b.maxHp * 0.35;
      // con poca vida: usa el escudo si lo tiene, o se retira a otro lado mientras se cura
      if (t && hurt && b.item === 'shield') useItem(b);
      else if (t && hurt && b.retreatT <= 0 && b.shieldT <= 0 && Math.random() < 0.5) {
        let far = null, fd = -1;
        for (let i = 0; i < 4; i++) { const g = goalCandidate(b); const d = Math.hypot(g.x - t.pos.x, g.z - t.pos.z); if (d > fd && walkable(g.x, g.z, 0.6) && freeSpot(g.x, g.z)) { fd = d; far = g; } }
        const r = far && planRoute(b, far);
        if (r) { b.route = r; b.retreatT = 3.5; }
      }
      // ¿hay una caja sorpresa cerca? a veces va a buscarla
      const bx = b.retreatT <= 0 && nearBox(b, t ? 9 : 26);
      if (bx && b.boxCd <= 0 && (!b.boxGoal || b.boxGoal !== bx)) {
        b.boxCd = 2.5;
        if (Math.random() < (t ? 0.35 : 0.7)) { const r = planRoute(b, bx.pos); if (r) { b.route = r; b.boxGoal = bx; } }
      }
      if (b.boxGoal && !b.boxGoal.active) b.boxGoal = null;
      // los "atacantes" siguen su camino mientras disparan; los demás buscan cómo llegar al enemigo
      if (b.retreatT > 0 || b.boxGoal) { /* sigue con su camino */ }
      else if (t && !b.pusher && !inBase(b)) b.route = planRoute(b, t.pos) || [];
      if (!b.route || !b.route.length || b.stuckT > 1.2) {
        let route = null;
        if (!t && b.lastSeen && Math.random() < 0.5) route = planRoute(b, b.lastSeen);
        if (!route) route = planRoute(b, pickGoal(b));
        if (!route) route = planRoute(b, baseCenter(b.team));
        b.route = route || []; b.lastSeen = null; b.stuckT = 0; b.boxGoal = null;
      }
      if (Math.random() < 0.12) b.strafeDir *= -1;
      // mega granada: la tira a grupos de enemigos a media distancia
      if (t && b.item === 'mega') {
        const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z, d = Math.hypot(dx, dz);
        if (d > 10 && d < 26) {
          const T = 0.9 + d / 30, dy = t.pos.y - (b.pos.y + b.h - 0.25);
          useItem(b, new V3(dx / T, (dy + 0.5 * GRAV * T * T) / T, dz / T));
        }
      }
      // a veces lanza una canica
      if (t && b.nadeCd <= 0 && Math.random() < 0.25) {
        const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z, d = Math.hypot(dx, dz);
        if (d > 7 && d < 24) {
          const T = 0.9 + d / 30, dy = t.pos.y - (b.pos.y + b.h - 0.25);
          throwNade(b, new V3(dx / T + rand(-1, 1), (dy + 0.5 * GRAV * T * T) / T, dz / T + rand(-1, 1)));
          b.nadeCd = rand(10, 18);
        }
      }
    }
    let mx = 0, mz = 0, desiredYaw = b.yaw, desiredPitch = 0;
    const t = b.target;
    if (t && t.alive) {
      b.seenT += dt;
      const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
      desiredYaw = Math.atan2(dx, dz);
      const eye = eyeOf(b), ch = chestOf(t);
      desiredPitch = -Math.atan2(ch.y - eye.y, d);
      const ideal = b.wdef.ideal;
      const fwd = d > ideal + 3 ? 1 : d < ideal - 3 ? -0.6 : 0;
      const nx = dx / d, nz = dz / d, stx = nz * b.strafeDir * 0.75, stz = -nx * b.strafeDir * 0.75;
      const rd = routeDir(b);
      if (rd && (b.pusher || inBase(b) || fwd > 0 || b.retreatT > 0 || b.boxGoal)) { mx = rd[0] + stx * 0.35; mz = rd[1] + stz * 0.35; }
      else { mx = nx * fwd + stx; mz = nz * fwd + stz; }
      // disparar
      if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) b.ammo = b.wdef.mag; }
      else if (b.seenT > sk.reaction && Math.abs(angDiff(b.yaw, desiredYaw)) < 0.25 && gameTime >= b.nextShot && b.spawnProt <= 0) botFire(b, t);
    } else {
      b.target = null;
      const rd = routeDir(b);
      if (rd) { mx = rd[0]; mz = rd[1]; desiredYaw = Math.atan2(mx, mz); }
      if (b.alertT > 0 && b.alertFrom) desiredYaw = Math.atan2(b.alertFrom.pos.x - b.pos.x, b.alertFrom.pos.z - b.pos.z);
      if (b.ammo < b.wdef.mag && b.reloadT <= 0) b.reloadT = b.wdef.reload;
      if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) b.ammo = b.wdef.mag; }
    }
    let len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
    [mx, mz] = safeMove(b, mx, mz);
    len = Math.hypot(mx, mz);
    const speed = t && t.alive && b.retreatT <= 0 ? 5.2 : 6.2; // corren cuando viajan o se escapan
    const k = Math.min(1, 10 * dt);
    b.vel.x += (mx * speed - b.vel.x) * k; b.vel.z += (mz * speed - b.vel.z) * k;
    if (b.blocked && b.onGround) b.vel.y = 8.3;
    const before = b.pos.clone();
    moveBody(b, dt);
    if (len > 0.3 && Math.hypot(b.pos.x - before.x, b.pos.z - before.z) < speed * dt * 0.3) b.stuckT = (b.stuckT || 0) + dt; else b.stuckT = 0;
    if (b.pos.y < -8) { kill(b, null, 'fall'); return; }
    b.yaw += clamp(angDiff(b.yaw, desiredYaw), -sk.turn * dt, sk.turn * dt);
    b.pitch += (desiredPitch - b.pitch) * Math.min(1, 8 * dt);
    b.mesh.position.copyFrom(b.pos);
    b.mesh.rotation.y = b.yaw;
  }
  function botFire(b, t) {
    const def = b.wdef;
    if (b.ammo <= 0) { b.reloadT = def.reload; return; }
    b.ammo--;
    const eye = eyeOf(b);
    const fwd = new V3(Math.sin(b.yaw), 0, Math.cos(b.yaw));
    const origin = eye.add(fwd.scale(0.6));
    const aim = chestOf(t).add(new V3(0, rand(-0.25, 0.35), 0));
    const base = aim.subtract(origin).normalize();
    const moving = Math.hypot(t.vel.x, t.vel.z) > 2 ? 1.4 : 1;
    const err = jitter(base, b.skill.spread * moving);
    for (let i = 0; i < def.pellets; i++) spawnProjectile(b, def, origin, jitter(err, def.spread), b.skill.dmg);
    sfx(def.sound, volAt(origin));
    // ráfagas cortas
    b.burst = (b.burst || 0) + 1;
    let wait = (1 / def.rate) * b.skill.rateMul * rand(1, 1.4);
    if (def.id === 'rifle' && b.burst >= 4 + ((Math.random() * 4) | 0)) { b.burst = 0; wait += rand(0.4, 0.9); }
    b.nextShot = gameTime + wait;
  }

  // ------------------------------------------------------------------
  // Cámara y arma en pantalla
  // ------------------------------------------------------------------
  let menuAngle = 0, camBack = 0;
  const thirdPerson = () => cfg.cam === 'third' && state !== 'menu';
  const headPos = () => new V3(P.pos.x, P.pos.y + P.eyeH, P.pos.z);
  function updateCamera(dt) {
    if (state === 'menu') {
      menuAngle += dt * 0.12;
      camera.position.set(Math.sin(menuAngle) * 92, 42, Math.cos(menuAngle) * 92);
      camera.setTarget(new V3(0, 1, 0));
      vms.forEach((v) => v.setEnabled(false));
      if (P.mesh) P.mesh.setEnabled(false);
      return;
    }
    camera.rotationQuaternion = null;
    const targetEye = P.crouch ? P.h - 0.25 : EYE;
    P.eyeH += (targetEye - P.eyeH) * Math.min(1, 14 * dt);
    const sp = Math.hypot(P.vel.x, P.vel.z);
    if (P.onGround && sp > 1) P.bobT += dt * sp * 1.5;
    let ex = P.pos.x, ey = P.pos.y + P.eyeH + Math.sin(P.bobT * 2) * 0.035 * Math.min(1, sp / 6), ez = P.pos.z;
    if (!P.alive && !thirdPerson()) ey = P.pos.y + 0.5;
    if (shake > 0) { ex += rand(-shake, shake) * 0.3; ey += rand(-shake, shake) * 0.3; shake = Math.max(0, shake - dt); }
    camBack = 0;
    if (thirdPerson()) {
      // Cámara más lejos: detrás y un poco a la derecha del soldadito, sin atravesar paredes
      const f = forwardVec(), right = new V3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
      const head = new V3(ex, ey, ez);
      const off = f.scale(-3.3).add(right.scale(0.75)).add(new V3(0, 0.45, 0));
      const t = Math.max(0.12, segWorld(head, off) - 0.08);
      ex += off.x * t; ey += off.y * t; ez += off.z * t;
      camBack = off.length() * t;
    }
    camera.position.set(ex, ey, ez);
    camera.rotation.set(P.pitch, P.yaw, P.alive || thirdPerson() ? 0 : 0.5);
    if (P.mesh) {
      P.mesh.setEnabled(thirdPerson() && (P.alive || P.deathT > 1.4));
      P.mesh.position.copyFrom(P.pos);
      P.mesh.rotation.set(P.alive ? 0 : -Math.min(1, (3 - P.deathT) / 0.35) * Math.PI / 2, P.yaw, 0);
      P.mesh.scaling.y = P.h / H;
    }
    const def = WEAPONS[P.wi];
    const fovT = aimDown ? (def.zoom ? 0.5 : 0.95) : 1.15;
    camera.fov += (fovT - camera.fov) * Math.min(1, 12 * dt);
    // arma
    vms.forEach((v, i) => v.setEnabled(!thirdPerson() && i === P.wi && P.alive && !(aimDown && def.zoom && camera.fov < 0.7)));
    vmKick = Math.max(0, vmKick - dt * 8); vmSwap = Math.max(0, vmSwap - dt * 5);
    const reloadDip = P.reloadT > 0 ? Math.sin(Math.min(1, 1 - P.reloadT / (def.reload * P.cls.reloadMul)) * Math.PI) : 0;
    vmRoot.position.set(
      (aimDown ? 0.0 : 0.2) + Math.sin(P.bobT) * 0.012 * Math.min(1, sp / 6),
      (aimDown ? -0.12 : -0.2) - Math.abs(Math.cos(P.bobT)) * 0.012 * Math.min(1, sp / 6) - vmSwap * 0.3 - reloadDip * 0.18,
      0.42 - vmKick * 0.06
    );
    vmRoot.rotation.set(-vmKick * 0.12 + reloadDip * 0.6, 0, 0);
    // cruz de la mira
    const spreadPx = 6 + (Math.hypot(P.vel.x, P.vel.z) > 1 ? 6 : 0) + (P.onGround ? 0 : 8) + vmKick * 6 - (aimDown ? 3 : 0);
    hud.cross.style.setProperty('--s', spreadPx + 'px');
  }

  // ------------------------------------------------------------------
  // Estados: menú, jugando, pausa, fin
  // ------------------------------------------------------------------
  const ui = { menu: $('menu'), pause: $('pause'), over: $('over'), hud: $('hud'), touch: touchLayer, rotate: $('rotate') };
  let chosenClass = 'fusilero', chosenDiff = 'normal';
  const choose = (wrap, attr, cb) => wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    [...wrap.children].forEach((b) => b.classList.toggle('sel', b === btn)); cb(btn.dataset[attr]);
  });
  choose($('classChoices'), 'class', (v) => (chosenClass = v));
  choose($('diffChoices'), 'diff', (v) => (chosenDiff = v));

  function startMatch() {
    initAudio();
    diff = DIFFS[chosenDiff];
    P.cls = CLASSES[chosenClass]; P.maxHp = P.cls.hp;
    createBots();
    score.fill(0);
    projectiles.forEach((p) => giveMesh(p.key, p.mesh)); projectiles.length = 0;
    grenades.forEach((g) => giveMesh(g.key, g.mesh)); grenades.length = 0;
    soldiers.forEach((s) => { s.kills = 0; s.deaths = 0; s.alive = false; });
    soldiers.forEach((s) => respawn(s));
    P.wi = 0; P.crouchToggle = false; $('bCrouch').classList.remove('on');
    hud.feed.innerHTML = '';
    resetBoxes();
    gameTime = 0; P.nextShot = 0; P.reloadT = 0;
    resume();
  }
  function resume() {
    state = 'playing';
    ui.menu.classList.add('hidden'); ui.pause.classList.add('hidden'); ui.over.classList.add('hidden');
    ui.hud.classList.remove('hidden');
    document.body.classList.add('playing');
    if (touchMode) {
      ui.touch.classList.remove('hidden');
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } else { wantsLock = true; requestLock(); }
    checkRotate();
    updateHud(true);
  }
  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused'; mouseDown = false; aimDown = false;
    for (const k in keys) keys[k] = false;
    ui.pause.classList.remove('hidden'); ui.touch.classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function toMenu() {
    state = 'menu';
    ui.pause.classList.add('hidden'); ui.over.classList.add('hidden'); ui.hud.classList.add('hidden'); ui.touch.classList.add('hidden');
    ui.menu.classList.remove('hidden'); document.body.classList.remove('playing');
    checkRotate();
  }
  function endMatch() {
    state = 'over';
    const winner = score.indexOf(Math.max(...score)), won = winner === 0;
    $('overTitle').textContent = won ? '¡VICTORIA AZUL!' : 'Ganó el equipo ' + TEAM_NAME[winner];
    $('overTitle').style.color = TEAM_HEX[winner];
    const order = TEAM_NAME.map((n, t) => t).sort((a, b) => score[b] - score[a]);
    $('overStats').innerHTML = order.map((t, i) => `${i + 1}º <b style="color:${TEAM_HEX[t]}">${TEAM_NAME[t]}</b> ${score[t]}`).join(' · ') +
      `<br>Tus eliminaciones: <b>${P.kills}</b> · Veces que caíste: <b>${P.deaths}</b>`;
    ui.over.classList.remove('hidden'); ui.touch.classList.add('hidden');
    sfx(won ? 'win' : 'lose');
    if (won) for (let i = 0; i < 4; i++) confetti(new V3(P.pos.x + rand(-3, 3), P.pos.y + 3, P.pos.z + rand(-3, 3)), 2);
    if (document.pointerLockElement) document.exitPointerLock();
    wantsLock = false; mouseDown = false;
  }
  function checkRotate() {
    ui.rotate.classList.toggle('hidden', !(touchMode && state === 'playing' && innerHeight > innerWidth));
  }
  $('play').addEventListener('click', startMatch);
  $('resume').addEventListener('click', () => { initAudio(); resume(); });
  $('quit').addEventListener('click', toMenu);
  $('again').addEventListener('click', startMatch);
  $('toMenu').addEventListener('click', toMenu);

  // ------------------------------------------------------------------
  // Menú de configuración (tuerca) y botones que se pueden mover
  // ------------------------------------------------------------------
  const MOVABLE = ['bPause', 'bSwap', 'bReload', 'bNade', 'bItem', 'bCrouch', 'bJump', 'bFire'];
  const settingsUI = $('settings');
  let settingsFromPlay = false;
  function applyLayout() {
    for (const id of MOVABLE) {
      const el = $(id), p = cfg.layout[id];
      if (p) Object.assign(el.style, { left: (p.x * 100) + '%', top: (p.y * 100) + '%', right: 'auto', bottom: 'auto', transform: 'translate(-50%,-50%)' });
      else Object.assign(el.style, { left: '', top: '', right: '', bottom: '', transform: '' });
    }
  }
  function applySettings() {
    cfg.sens = Math.round(clamp(+cfg.sens || 1, 0.2, 3) * 10) / 10;
    $('sensVal').textContent = cfg.sens.toFixed(1);
    $('sensRange').value = cfg.sens;
    [...$('camChoices').children].forEach((b) => b.classList.toggle('sel', b.dataset.cam === cfg.cam));
    [...$('fireChoices').children].forEach((b) => b.classList.toggle('sel', b.dataset.fire === cfg.fire));
    document.body.classList.toggle('fire-manual', cfg.fire === 'manual');
    if (cfg.fire !== 'manual') { touchFire = false; $('bFire').classList.remove('on'); }
    applyLayout();
  }
  const setSens = (v) => { cfg.sens = v; applySettings(); saveCfg(); };
  $('sensMinus').addEventListener('click', () => setSens(cfg.sens - 0.1));
  $('sensPlus').addEventListener('click', () => setSens(cfg.sens + 0.1));
  $('sensRange').addEventListener('input', (e) => setSens(+e.target.value));
  choose($('camChoices'), 'cam', (v) => { cfg.cam = v; applySettings(); saveCfg(); });
  choose($('fireChoices'), 'fire', (v) => { cfg.fire = v; applySettings(); saveCfg(); });
  function openSettings() {
    settingsFromPlay = state === 'playing';
    if (settingsFromPlay) pauseGame();
    if (document.pointerLockElement) document.exitPointerLock();
    applySettings();
    settingsUI.classList.remove('hidden'); document.body.classList.add('settings-open');
  }
  function closeSettings() {
    settingsUI.classList.add('hidden'); document.body.classList.remove('settings-open');
    if (settingsFromPlay && state === 'paused') { initAudio(); resume(); }
    settingsFromPlay = false;
  }
  $('gear').addEventListener('click', (e) => { e.stopPropagation(); openSettings(); });
  $('pauseSettings').addEventListener('click', openSettings);
  $('settingsDone').addEventListener('click', closeSettings);
  // Reacomodar botones: se arrastran con el dedo (o el ratón) y se guardan como porcentaje de la pantalla
  function startLayoutEdit() {
    editingLayout = true; touchFire = false;
    for (const k of ['L', 'R']) { const st = sticks[k]; st.id = null; st.x = st.y = 0; st.el.classList.remove('on'); }
    document.body.classList.add('editing-layout'); $('layoutBar').classList.remove('hidden');
  }
  function endLayoutEdit() {
    editingLayout = false; saveCfg();
    document.body.classList.remove('editing-layout'); $('layoutBar').classList.add('hidden');
  }
  const resetLayout = () => { cfg.layout = {}; applyLayout(); saveCfg(); };
  $('editLayout').addEventListener('click', startLayoutEdit);
  $('resetLayout').addEventListener('click', () => { resetLayout(); showBanner('Botones restablecidos'); });
  $('layoutReset').addEventListener('click', resetLayout);
  $('layoutDone').addEventListener('click', endLayoutEdit);
  let drag = null;
  for (const id of MOVABLE) {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => {
      if (!editingLayout) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      drag = { el, id, pid: e.pointerId, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2), w: r.width, h: r.height };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
      el.classList.add('dragging');
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || drag.el !== el || e.pointerId !== drag.pid) return;
      const cx = clamp(e.clientX - drag.dx, drag.w / 2, innerWidth - drag.w / 2);
      const cy = clamp(e.clientY - drag.dy, drag.h / 2, innerHeight - drag.h / 2);
      cfg.layout[id] = { x: cx / innerWidth, y: cy / innerHeight };
      applyLayout();
    });
    const drop = (e) => { if (drag && drag.el === el && e.pointerId === drag.pid) { el.classList.remove('dragging'); drag = null; saveCfg(); } };
    el.addEventListener('pointerup', drop);
    el.addEventListener('pointercancel', drop);
  }
  applySettings();

  // Instalar como app (PWA)
  let installEvt = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('install').classList.remove('hidden'); });
  $('install').addEventListener('click', () => { if (installEvt) { installEvt.prompt(); installEvt = null; $('install').classList.add('hidden'); } });

  addEventListener('resize', () => { engine.resize(); checkRotate(); });

  // ------------------------------------------------------------------
  // Bucle principal
  // ------------------------------------------------------------------
  buildWorld();
  buildProjMasters();
  buildBoxes();
  buildViewmodels();
  P.mesh = makeSoldierMesh('Tú', '#5aa2ff'); P.mesh.setEnabled(false);
  createBots();
  soldiers.forEach((s) => respawn(s));

  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    if (state === 'playing') {
      gameTime += dt;
      updatePlayer(dt);
      for (const b of bots) updateBot(b, dt);
      updateProjectiles(dt);
      updateGrenades(dt);
      updateBoxes(dt); updateShields(dt);
    } else if (state === 'over') {
      updateProjectiles(dt); updateGrenades(dt);
    }
    for (let i = fxList.length - 1; i >= 0; i--) {
      const f = fxList[i]; f.t += dt; const k = Math.min(1, f.t / f.dur); f.upd(k);
      if (k >= 1) { f.end(); fxList.splice(i, 1); }
    }
    flushBursts();
    // HUD con desvanecido
    dmgFlash = Math.max(0, dmgFlash - dt * 1.6); hud.dmg.style.opacity = dmgFlash.toFixed(2);
    if (hitT > 0) { hitT -= dt; if (hitT <= 0) hud.hit.classList.remove('show'); }
    if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) hud.banner.classList.remove('show'); }
    updateCamera(dt);
    scene.render();
  });

  // Para pruebas automáticas
  window.__pa = { get dbg() { return { mouseDown, touchMode, locked, nextShot: P.nextShot, gameTime, reloadT: P.reloadT, alive: P.alive }; }, scene, P, get bots() { return bots; }, score, get state() { return state; }, startMatch, firePlayer, playerNade, findRoute, walkable, givePower, playerItem,
    simulate(sec) { for (let t = 0; t < sec && state === 'playing'; t += 1 / 30) { gameTime += 1 / 30; for (const b of bots) updateBot(b, 1 / 30); updateProjectiles(1 / 30); updateGrenades(1 / 30); updateBoxes(1 / 30); updateShields(1 / 30); } }, get boxes() { return boxes; } };
})();
