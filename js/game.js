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
  scene.fogStart = 220; scene.fogEnd = 600; scene.fogColor = SKY_COLOR;
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
  // En la Batalla campal todos empiezan con esta pistolita y buscan las otras armas tiradas en el mapa
  const PISTOL = { id: 'pistol', name: 'Pistolita de bolitas', mag: 12, rate: 4, dmg: 12, pellets: 1, spread: 0.018, speed: 85, gravity: 3, range: 60, reload: 1.2, kick: 0.02, proj: 'pellet', sound: 'rifle', ideal: 12 };
  const ALL_GUNS = [...WEAPONS, PISTOL];
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

  let colliders = []; // los del mapa que se está jugando (cada mapa tiene los suyos)
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
  const BASE_D = 70, TABLE_HALF = 15, BRIDGE_W = 7, RAIL = 0.3, CIRCLE_R = 22, CORNER_HALF = 6, ENTRY_R = 18;
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
      const a = (i / 14) * Math.PI * 2 + rand(-0.15, 0.15), r = rand(210, 290);
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
    [[38, 38, 22], [-38, -38, 21], [-38, 38, 20], [38, -38, 23], [104, 45, 30], [-104, -45, 29], [45, -104, 31], [-45, 104, 28], [100, 100, 27], [-100, -100, 26]]
      .forEach(([x, z, hh], i) => flower(x, z, hh, ['#ff70a6', '#ffffff', '#c77dff', '#ff9f1c'][i % 4]));
    for (const [x, z] of [[-122, 30], [122, -30], [30, 124], [-30, -124], [112, 112], [-114, -112]]) {
      const b = BABYLON.MeshBuilder.CreateSphere('bush', { diameter: rand(22, 30), segments: 10 }, scene);
      b.position.set(x, GROUND_Y + 6, z); b.scaling.y = 0.75; b.material = mat('#4e9f3d'); finishStatic(b, false);
    }
    // una pelota gigante tirada en el pasto
    const ball = BABYLON.MeshBuilder.CreateSphere('ball', { diameter: 26, segments: 20 }, scene);
    ball.position.set(-52, GROUND_Y + 13, 118);
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
    const canopy = BABYLON.MeshBuilder.CreateCylinder('canopy', { diameterTop: 0.6, diameterBottom: 30, height: 5, tessellation: 16 }, scene);
    canopy.position.set(0, 14.5, 0);
    const cm = new BABYLON.StandardMaterial('canopyMat', scene); cm.diffuseTexture = stripeTexture(['#ff4d6d', '#ffffff'], 16); cm.specularColor = new C3(0.2, 0.2, 0.2); cm.backFaceCulling = false;
    canopy.material = cm; finishStatic(canopy);
    // bloques de juguete para cubrirse en el centro
    [[1, 1, 2.4, '#ff9f1c'], [-1, -1, 2.4, '#8338ec'], [1, -1, 1.2, '#06d6a0'], [-1, 1, 1.2, '#ff70a6']].forEach(([sx, sz, hh, col]) => {
      box('block', 2.4, hh, 2.4, sx * 4.2, 0, sz * 4.2, col);
    });
    [[0.38, 0.92], [-0.92, 0.38], [-0.38, -0.92], [0.92, -0.38]].forEach(([x, z], i) => {
      box('cBlock', 2, 1.2, 2, x * 16.5, 0, z * 16.5, ['#3a86ff', '#ef233c', '#2fb344', '#ffbe0b'][i]);
    });
    // más cobertura en la mesa redonda (ahora es más grande)
    [[1, 0, 2.2, '#ffd23f'], [0, 1, 1.2, '#3a86ff'], [-1, 0, 2.2, '#ef233c'], [0, -1, 1.2, '#2fb344']].forEach(([sx, sz, hh, col]) => box('mBlock', 2.2, hh, 2.2, sx * 8.5, 0, sz * 8.5, col));
    // las cajas sorpresa aparecen solo acá, en el medio
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; BOX_SPOTS.push({ x: Math.cos(a) * 10, z: Math.sin(a) * 10 }); }

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
    const [fx, fz] = L(0, H2 - 1.5);
    cyl('flagPole', 0.4, 10, fx, 0, fz, '#f1f3f5', { tess: 10 });
    const flag = BABYLON.MeshBuilder.CreateBox('flag', { width: dz ? 4 : 0.12, height: 2.6, depth: dz ? 0.12 : 4 }, scene);
    flag.position.set(fx + (dz ? 2.1 : 0), 8.6, fz + (dz ? 0 : 2.1)); flag.material = plastic(team); finishStatic(flag);
    // cosas para cubrirse (dejando libres los pasillos hacia los tres puentes)
    for (const s of [-1, 1]) {
      const [lx, lz] = L(s * 9, -9);
      box('lunchbox', 4.5, 2.6, 4.5, lx, 0, lz, team);
      box('lunchLid', 4.7, 0.4, 4.7, lx, 2.6, lz, TEAM_LIGHT[t], { collide: false });
      const [ux, uz] = L(s * 9, 9);
      cyl('cup', 3, 4, ux, 0, uz, s < 0 ? '#ffffff' : TEAM_LIGHT[t]);
    }
    const [px, pz] = L(-4, 5);
    cyl('plate', 5, 0.15, px, 0, pz, '#f8f9fa', { collide: false, shadow: false });
  }

  // ------------------------------------------------------------------
  // Mapas de la Batalla campal: Plaza y Casa de 2 pisos.
  // Cada mapa guarda sus piezas y sus paredes (colliders); se arma la primera vez que se juega
  // y después solo se prende o se apaga.
  // ------------------------------------------------------------------
  const MAPS = {
    jardin: { id: 'jardin', name: 'Jardín', built: true, meshes: [], colliders: [] },
    plaza: { id: 'plaza', name: 'Plaza', players: 50, drop: 12, built: false, meshes: [], colliders: [], nav: null },
    casa: { id: 'casa', name: 'Casa', players: 50, drop: 12, built: false, meshes: [], colliders: [], nav: null },
    barrio: { id: 'barrio', name: 'Barrio', players: 50, drop: 12, built: false, meshes: [], colliders: [], nav: null }
  };
  let curMap = MAPS.jardin;
  function setMap(id) {
    const m = MAPS[id];
    if (!m.built) {
      colliders = m.colliders; colGrid = null; statics.length = 0;
      ({ plaza: buildPlaza, casa: buildCasa, barrio: buildBarrio })[id]();
      mergeStatics();
      statics.forEach((s) => s.freezeWorldMatrix());
      m.meshes = statics.slice(); statics.length = 0;
      m.grid = colGrid = buildColGrid(m.colliders);
      m.nav = buildNav(m.bounds);
      m.built = true;
    }
    for (const k in MAPS) if (MAPS[k] !== m) MAPS[k].meshes.forEach((s) => s.setEnabled(false));
    m.meshes.forEach((s) => s.setEnabled(true));
    colliders = m.colliders; colGrid = m.grid; curMap = m;
    scene.fogStart = m.fog ? m.fog[0] : 220; scene.fogEnd = m.fog ? m.fog[1] : 600;
  }

  // --- Caminos para los bots: grilla de baldosas donde uno se puede parar (puede haber varias
  // alturas en la misma baldosa, como el piso 1 y el piso 2) y búsqueda A* ---
  const navQ = [];
  function buildNav(bd) {
    const [x0, z0, x1, z1, cell] = bd;
    const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell);
    const cols = new Array(nx * nz), nodes = [];
    const probe = { pos: new V3(), r: 0.45, h: 1.7 };
    for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
      const x = x0 + (ix + 0.5) * cell, z = z0 + (iz + 0.5) * cell, list = [];
      const tops = [];
      for (const c of queryBox(x, z, x, z, navQ)) if (x >= c.min.x && x <= c.max.x && z >= c.min.z && z <= c.max.z) tops.push(c.max.y);
      tops.sort((a, b) => a - b);
      for (const y of tops) {
        if (list.length && y - nodes[list[list.length - 1]].y < 0.05) continue;
        probe.pos.set(x, y + 0.02, z);
        if (collidesAny(probe)) continue;
        list.push(nodes.length); nodes.push({ x, y, z, ix, iz, nb: [] });
      }
      cols[ix * nz + iz] = list;
    }
    const colAt = (ix, iz) => (ix < 0 || iz < 0 || ix >= nx || iz >= nz ? null : cols[ix * nz + iz]);
    const near = (list, y) => { let best = -1, bd2 = STEP + 0.01; if (list) for (const k of list) { const d = Math.abs(nodes[k].y - y); if (d < bd2) { bd2 = d; best = k; } } return best; };
    for (const n of nodes) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const k = near(colAt(n.ix + dx, n.iz + dz), n.y);
        if (k < 0) continue;
        if (dx && dz && (near(colAt(n.ix + dx, n.iz), n.y) < 0 || near(colAt(n.ix, n.iz + dz), n.y) < 0)) continue;
        n.nb.push(k);
      }
    }
    // solo sirve la parte más grande conectada (el techo o la punta de una pared no cuentan)
    const comp = new Int32Array(nodes.length).fill(-1);
    let bestC = -1, bestN = 0;
    for (let i = 0, c = 0; i < nodes.length; i++) {
      if (comp[i] >= 0) continue;
      let cnt = 0; const st = [i]; comp[i] = c;
      while (st.length) { const u = st.pop(); cnt++; for (const v of nodes[u].nb) if (comp[v] < 0) { comp[v] = c; st.push(v); } }
      if (cnt > bestN) { bestN = cnt; bestC = c; }
      c++;
    }
    const main = [];
    for (let i = 0; i < cols.length; i++) if (cols[i]) cols[i] = cols[i].filter((k) => comp[k] === bestC);
    nodes.forEach((n, i) => { if (comp[i] === bestC) main.push(i); });
    function nodeAt(x, y, z) {
      const ix = Math.floor((x - x0) / cell), iz = Math.floor((z - z0) / cell);
      let best = -1, bdd = Infinity;
      for (let r = 0; r <= 4 && best < 0; r++) {
        for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
          if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
          const list = colAt(ix + a, iz + b); if (!list) continue;
          for (const k of list) {
            const n = nodes[k], dy = n.y - y;
            if (dy > 1.2) continue;
            const d = Math.hypot(n.x - x, n.z - z) + Math.abs(dy) * 2;
            if (d < bdd) { bdd = d; best = k; }
          }
        }
      }
      return best;
    }
    // ¿se puede ir derecho de a hasta b sin cambiar de altura?
    function flatLine(a, b) {
      if (Math.abs(a.y - b.y) > 0.05) return false;
      const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.4);
      for (let i = 1; i < n; i++) {
        const k = i / n, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
        const list = colAt(Math.floor((x - x0) / cell), Math.floor((z - z0) / cell));
        if (!list || !list.some((q) => Math.abs(nodes[q].y - a.y) < 0.05)) return false;
      }
      return true;
    }
    const N = nodes.length, gs = new Float32Array(N), came = new Int32Array(N), seen = new Int32Array(N), closed = new Int32Array(N);
    let stamp = 0;
    function route(ax, ay, az, tx, ty, tz) {
      const s = nodeAt(ax, ay, az), g = nodeAt(tx, ty, tz);
      if (s < 0 || g < 0) return null;
      stamp++;
      const G = nodes[g], hf = (k) => Math.hypot(nodes[k].x - G.x, nodes[k].y - G.y, nodes[k].z - G.z);
      const heap = [], hk = [];
      const push = (k, f) => { heap.push(f); hk.push(k); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p] <= heap[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hk[p], hk[i]] = [hk[i], hk[p]]; i = p; } };
      const pop = () => {
        const top = hk[0], lf = heap.pop(), lk = hk.pop();
        if (heap.length) { heap[0] = lf; hk[0] = lk; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l] < heap[m]) m = l; if (r < heap.length && heap[r] < heap[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hk[m], hk[i]] = [hk[i], hk[m]]; i = m; } }
        return top;
      };
      gs[s] = 0; seen[s] = stamp; came[s] = -1; push(s, hf(s));
      let found = false, exp = 0;
      while (hk.length) {
        const u = pop();
        if (closed[u] === stamp) continue;
        closed[u] = stamp;
        if (u === g) { found = true; break; }
        if (++exp > 9000) break;
        const U = nodes[u];
        for (const v of U.nb) {
          if (closed[v] === stamp) continue;
          const V = nodes[v], ng = gs[u] + Math.hypot(V.x - U.x, (V.y - U.y) * 1.5, V.z - U.z);
          if (seen[v] !== stamp || ng < gs[v]) { seen[v] = stamp; gs[v] = ng; came[v] = u; push(v, ng + hf(v)); }
        }
      }
      if (!found) return null;
      const path = [];
      for (let k = g; k >= 0; k = came[k]) path.push(nodes[k]);
      path.reverse();
      // atajos: en los tramos planos se va derecho
      const out = [];
      let cur = path[0], i = 1;
      if (path.length === 1) return [{ x: G.x, y: G.y, z: G.z }];
      while (i < path.length) {
        let j = i;
        while (j + 1 < path.length && j - i < 14 && flatLine(cur, path[j + 1])) j++;
        out.push({ x: path[j].x, y: path[j].y, z: path[j].z }); cur = path[j]; i = j + 1;
      }
      return out;
    }
    const randomPoint = () => { const n = nodes[pick(main)]; return { x: n.x, y: n.y, z: n.z }; };
    const pointNear = (x, y, z) => { const k = nodeAt(x, y, z); return k < 0 ? null : { x: nodes[k].x, y: nodes[k].y, z: nodes[k].z }; };
    return { route, randomPoint, nodeAt, pointNear, size: main.length, nodes, main };
  }

  function grassMaterial(name, scale) {
    const g = new BABYLON.StandardMaterial(name, scene);
    g.diffuseTexture = textTexture(512, 512, (c, w, h) => {
      c.fillStyle = '#6cc04a'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { c.fillStyle = pick(['#5fb33e', '#7ccd55', '#58a83a', '#86d65f']); c.fillRect(Math.random() * w, Math.random() * h, 2, 5 + Math.random() * 6); }
    });
    g.diffuseTexture.uScale = g.diffuseTexture.vScale = scale;
    g.specularColor = C3.Black();
    return g;
  }
  function woodMaterial(name, base, line, scale) {
    const w = new BABYLON.StandardMaterial(name, scene);
    w.diffuseTexture = textTexture(512, 512, (c, W, Hh) => {
      c.fillStyle = base; c.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 8; i++) { c.fillStyle = line; c.fillRect(0, (i * Hh) / 8, W, 3); }
      for (let i = 0; i < 60; i++) { c.strokeStyle = 'rgba(90,50,20,0.12)'; c.lineWidth = 1 + Math.random() * 2; const y = Math.random() * Hh; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= W; x += 32) c.lineTo(x, y + Math.sin(x / 60 + i) * 3); c.stroke(); }
    });
    w.diffuseTexture.uScale = w.diffuseTexture.vScale = scale;
    w.specularColor = new C3(0.1, 0.08, 0.06);
    return w;
  }
  function sphereDeco(d, x, y, z, hex, sy = 1) {
    const s = BABYLON.MeshBuilder.CreateSphere('deco', { diameter: d, segments: 10 }, scene);
    s.position.set(x, y, z); s.scaling.y = sy; s.material = typeof hex === 'string' ? mat(hex) : hex; finishStatic(s, false);
    return s;
  }
  function tree(x, z, h = 7, leaf = '#4caf50', collide = true) {
    cyl('trunk', 1.6, h, x, 0, z, mat('#8d5a34'), { tess: 12, collide });
    for (let k = 0; k < 3; k++) sphereDeco(rand(6, 8), x + rand(-1.8, 1.8), h + rand(-0.5, 2), z + rand(-1.8, 1.8), pick([leaf, '#3f9b3a', '#5cbf4f']));
  }
  // Pared con huecos (puertas o ventanas). Recta en X (en z fijo) o en Z (en x fijo).
  // holes: [centro a lo largo de la pared, ancho, y0, y1]
  function wall(alongX, fixed, a0, a1, y0, y1, th, material, holes = [], opt = {}) {
    const cuts = [a0, a1];
    holes.forEach(([c, w]) => cuts.push(c - w / 2, c + w / 2));
    const xs = [...new Set(cuts)].sort((p, q) => p - q).filter((v) => v >= a0 && v <= a1);
    for (let i = 0; i < xs.length - 1; i++) {
      const s0 = xs[i], s1 = xs[i + 1], mid = (s0 + s1) / 2, len = s1 - s0;
      if (len < 0.01) continue;
      const hs = holes.filter(([c, w]) => mid > c - w / 2 && mid < c + w / 2);
      const pieces = [];
      if (!hs.length) pieces.push([y0, y1]);
      else { const [, , hy0, hy1] = hs[0]; if (hy0 > y0) pieces.push([y0, hy0]); if (hy1 < y1) pieces.push([hy1, y1]); }
      for (const [p0, p1] of pieces) {
        if (alongX) box('wall', len, p1 - p0, th, mid, p0, fixed, material, opt);
        else box('wall', th, p1 - p0, len, fixed, p0, mid, material, opt);
      }
    }
  }
  // Losa (piso o techo) con agujeros rectangulares [x0,z0,x1,z1]
  function slab(x0, z0, x1, z1, y0, y1, material, holes = []) {
    const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h[0], h[2]])])].filter((v) => v >= x0 && v <= x1).sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      const xa = xs[i], xb = xs[i + 1], xm = (xa + xb) / 2;
      const hs = holes.filter((h) => xm > h[0] && xm < h[2]).map((h) => [h[1], h[3]]).sort((a, b) => a[0] - b[0]);
      let z = z0;
      const spans = [];
      for (const [hz0, hz1] of hs) { if (hz0 > z) spans.push([z, hz0]); z = Math.max(z, hz1); }
      if (z < z1) spans.push([z, z1]);
      for (const [za, zb] of spans) box('slab', xb - xa, y1 - y0, zb - za, xm, y0, (za + zb) / 2, material, { shadow: false });
    }
  }
  // Escalera de escalones de 0,5 (los soldaditos los suben solos). dir: hacia dónde sube (+1/-1) a lo largo de X
  function stairsX(xStart, dir, zc, width, topY, material) {
    const n = Math.round(topY / 0.5), depth = 1; // 1 m: coincide con las baldosas del mapa de los bots
    for (let i = 0; i < n; i++) {
      const xa = xStart + dir * i * depth, xm = xa + dir * depth / 2;
      box('step', depth, 0.5 * (i + 1), width, xm, 0, zc, i % 2 ? material : mat('#f8f9fa'));
    }
    return xStart + dir * n * depth;
  }

  // --- PLAZA: al aire libre, con pasto, fuente, juegos, arenero y glorieta ---
  function buildPlaza() {
    const S = 100;
    MAPS.plaza.bounds = [-S, -S, S, S, 1.25];
    const ground = BABYLON.MeshBuilder.CreateGround('pGround', { width: 900, height: 900 }, scene);
    ground.material = grassMaterial('pGrass', 70); finishStatic(ground, false);
    addCollider(-S - 6, -1, -S - 6, S + 6, 0, S + 6);
    // caminos de piedra en cruz y un anillo alrededor de la fuente
    const stone = mat('#eadfc8');
    box('path', 6, 0.04, 2 * S, 0, 0, 0, stone, { collide: false, shadow: false });
    box('path', 2 * S, 0.04, 6, 0, 0, 0, stone, { collide: false, shadow: false });
    const ring = BABYLON.MeshBuilder.CreateTorus('pRing', { diameter: 30, thickness: 6, tessellation: 64 }, scene);
    ring.scaling.y = 0.012; ring.position.y = 0.03; ring.material = stone; finishStatic(ring, false);
    // fuente en el medio
    cyl('basin', 14, 0.9, 0, 0, 0, '#d6ccc2', { collide: false, tess: 40 });
    cyl('water', 12.6, 0.95, 0, 0, 0, mat('#5ec8ff', { emissive: '#1b6a9c', alpha: 0.85 }), { collide: false, shadow: false, tess: 40 });
    for (let i = 0; i < 14; i++) { const z0 = -7 + i, z1 = z0 + 1, ze = Math.max(Math.abs(z0), Math.abs(z1)), hw = Math.sqrt(Math.max(0, 49 - ze * ze)); if (hw > 0.3) addCollider(-hw, 0, z0, hw, 0.9, z1); }
    cyl('fCol', 2.2, 3.6, 0, 0.9, 0, '#c9bba9', { tess: 16 });
    cyl('fBowl', 5.2, 0.6, 0, 4.4, 0, '#d6ccc2', { tess: 24 });
    cyl('fJet', 0.5, 2.4, 0, 5, 0, mat('#8fd8ff', { emissive: '#4aa8e0', alpha: 0.7 }), { collide: false, shadow: false, tess: 8 });
    sphereDeco(1.6, 0, 7.4, 0, mat('#8fd8ff', { emissive: '#4aa8e0', alpha: 0.7 }));
    // bancos al lado de los caminos
    const bench = (x, z, alongZ, back) => {
      const w = alongZ ? 1.2 : 4, d = alongZ ? 4 : 1.2;
      box('bench', w, 0.6, d, x, 0, z, '#b5651d');
      if (alongZ) box('bBack', 0.3, 1.0, 4, x + back * 0.55, 0.6, z, '#8d4b16'); else box('bBack', 4, 1.0, 0.3, x, 0.6, z + back * 0.55, '#8d4b16');
    };
    for (const s of [-1, 1]) for (const d of [17, 40, 64, 86]) { bench(4.6, s * d, true, 1); bench(-4.6, s * d + 6 * s, true, -1); bench(s * d, 4.6, false, 1); bench(s * d + 6 * s, -4.6, false, -1); }
    // faroles
    for (const [x, z] of [[11, 11], [-11, 11], [11, -11], [-11, -11], [4, 30], [-4, -30], [30, -4], [-30, 4], [-4, 58], [4, -58], [58, 4], [-58, -4], [4, 84], [-4, -84], [84, -4], [-84, 4]]) {
      cyl('lamp', 0.35, 6, x, 0, z, '#495057', { tess: 8 });
      sphereDeco(1.1, x, 6.3, z, mat('#fff3b0', { emissive: '#ffd23f' }));
    }
    // árboles
    for (const [x, z] of [[22.4, 35.2], [38.4, 19.2], [-22.4, 35.2], [-35.2, 22.4], [22.4, -35.2], [38.4, -22.4], [-25.6, -32], [-38.4, -19.2], [16, 83.2], [-16, 83.2], [83.2, 16], [83.2, -16], [-83.2, 16], [-83.2, -16], [16, -83.2], [-16, -83.2], [40, 72], [-72, -40]]) tree(x, z, rand(6.5, 8.5));
    // canteros con flores (sirven para cubrirse)
    for (const [x, z, w, d] of [[29, 50, 6, 2], [-29, -50, 6, 2], [50, -29, 2, 6], [-50, 29, 2, 6], [70, 32, 2, 6], [-70, -32, 2, 6], [18, 31, 6, 2], [-18, -31, 6, 2]]) {
      box('planter', w, 0.9, d, x, 0, z, '#bc6c25');
      box('soil', w - 0.3, 0.1, d - 0.3, x, 0.9, z, '#6b4226', { collide: false, shadow: false });
      for (let k = 0; k < 4; k++) sphereDeco(0.8, x + rand(-w / 2 + 0.5, w / 2 - 0.5), 1.25, z + rand(-d / 2 + 0.5, d / 2 - 0.5), pick(['#ff70a6', '#ffd23f', '#c77dff', '#ffffff']));
    }

    // Juegos (noreste): torre con escalones, tobogán y hamacas
    const TX = 58, TZ = 58;
    box('tower', 5, 3, 5, TX, 0, TZ, '#ff9f1c');
    for (let i = 0; i < 6; i++) box('tStep', 2.4, 0.5 * (i + 1), 0.8, TX - 0.8, 0, TZ - 2.5 - 0.4 - (5 - i) * 0.8, i % 2 ? '#3a86ff' : '#ffd23f');
    for (const [a, b, w, d] of [[0, 2.35, 5, 0.3], [2.35, 0, 0.3, 5], [-2.35, 0.9, 0.3, 3.2]]) box('tRail', w, 1.0, d, TX + a, 3, TZ + b, '#ef233c');
    for (const [a, b] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) cyl('tPost', 0.35, 3.6, TX + a, 3, TZ + b, '#ef233c', { tess: 8, collide: false });
    const roofT = BABYLON.MeshBuilder.CreateCylinder('tRoof', { diameterTop: 0, diameterBottom: 7.6, height: 2.4, tessellation: 4 }, scene);
    roofT.position.set(TX, 7.8, TZ); roofT.rotation.y = Math.PI / 4; roofT.material = plastic('#3a86ff'); finishStatic(roofT);
    const slide = BABYLON.MeshBuilder.CreateBox('slide', { width: 7, height: 0.2, depth: 1.8 }, scene);
    slide.position.set(TX + 2.5 + 3.1, 1.5, TZ); slide.rotation.z = -0.44; slide.material = plastic('#9ef01a'); finishStatic(slide);
    // hamacas
    const SX = 36, SZ = 74;
    for (const s of [-1, 1]) { beam('swA', 0.3, new V3(SX + s * 5, 0, SZ - 1.5), new V3(SX + s * 5, 5, SZ), '#8338ec'); beam('swB', 0.3, new V3(SX + s * 5, 0, SZ + 1.5), new V3(SX + s * 5, 5, SZ), '#8338ec'); addCollider(SX + s * 5 - 0.2, 0, SZ - 1.6, SX + s * 5 + 0.2, 4.5, SZ + 1.6); }
    beam('swTop', 0.35, new V3(SX - 5, 5, SZ), new V3(SX + 5, 5, SZ), '#ff006e');
    for (const s of [-2, 2]) { beam('rope', 0.06, new V3(SX + s - 0.6, 5, SZ), new V3(SX + s - 0.6, 1.0, SZ), '#adb5bd'); beam('rope', 0.06, new V3(SX + s + 0.6, 5, SZ), new V3(SX + s + 0.6, 1.0, SZ), '#adb5bd'); box('seat', 1.5, 0.15, 0.6, SX + s, 0.85, SZ, '#ffd23f', { collide: false }); }
    // sube y baja
    box('seesawBase', 0.8, 0.8, 0.8, 74, 0, 36, '#495057');
    const ss = BABYLON.MeshBuilder.CreateBox('seesaw', { width: 0.8, height: 0.2, depth: 8 }, scene); ss.position.set(74, 0.9, 36); ss.rotation.x = 0.18; ss.material = plastic('#06d6a0'); finishStatic(ss);

    // Arenero (suroeste) con balde gigante y castillo de arena
    const AX = -58, AZ = -58, AH = 9;
    const sand = mat('#f2d398');
    for (const [a, b, w, d] of [[0, -AH, 2 * AH, 0.6], [0, AH, 2 * AH, 0.6], [-AH, 0, 0.6, 2 * AH], [AH, 0, 0.6, 2 * AH]]) box('sbEdge', w, 0.5, d, AX + a, 0, AZ + b, '#e76f51');
    box('sand', 2 * AH - 0.6, 0.3, 2 * AH - 0.6, AX, 0, AZ, sand, { shadow: false });
    cyl('bucket', 3.2, 3.6, AX + 4, 0.3, AZ + 3, '#ef233c', { tess: 20 });
    box('bHandle', 3.4, 0.2, 0.2, AX + 4, 4.2, AZ + 3, '#ffd23f', { collide: false });
    for (const [a, b, s, h] of [[-3, -3, 4, 2.2], [-3, -3, 2.4, 3.6], [-6, -5, 1.6, 2.6], [-0.5, -6, 1.6, 2.6], [-6, -0.5, 1.6, 2.6]]) box('castle', s, h, s, AX + a, 0.3, AZ + b, sand);
    box('shovel', 0.4, 0.3, 5, AX + 5, 0.3, AZ - 5, '#3a86ff', { collide: false });

    // Glorieta (noroeste)
    const GX = -58, GZ = 58;
    box('gFloor', 11, 0.5, 11, GX, 0, GZ, '#f1e3c8');
    for (const [a, b] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) box('gPost', 0.6, 4.5, 0.6, GX + a, 0.5, GZ + b, '#ffffff');
    for (const s of [-1, 1]) { wall(true, GZ + s * 5, GX - 5, GX + 5, 0.5, 1.5, 0.3, '#ffffff', [[GX, 3, 0, 9]]); wall(false, GX + s * 5, GZ - 5, GZ + 5, 0.5, 1.5, 0.3, '#ffffff', [[GZ, 3, 0, 9]]); }
    const gRoof = BABYLON.MeshBuilder.CreateCylinder('gRoof', { diameterTop: 0.5, diameterBottom: 16.5, height: 3.4, tessellation: 4 }, scene);
    gRoof.position.set(GX, 6.7, GZ); gRoof.rotation.y = Math.PI / 4; gRoof.material = plastic('#ef233c'); finishStatic(gRoof, false);
    box('gTable', 2.4, 1.1, 2.4, GX, 0.5, GZ, '#a47148');

    // Setos y juguetes gigantes (sureste)
    const hedge = mat('#3f8f3a');
    for (const [x, z, w, d] of [[38, -38, 10, 1.4], [42.3, -42, 1.4, 8], [67, -32, 1.4, 10], [58, -67, 12, 1.4], [77, -54, 1.4, 8], [35, -70, 1.4, 8]]) box('hedge', w, 2.4, d, x, 0, z, hedge);
    box('toyBlock', 3, 3, 3, 58, 0, -48, '#ff006e'); box('toyBlock', 2, 2, 2, 58, 3, -48, '#ffd23f');
    box('toyBlock', 2.5, 2.5, 2.5, 74, 0, -74, '#3a86ff');
    const ball = BABYLON.MeshBuilder.CreateSphere('pBall', { diameter: 4, segments: 16 }, scene);
    ball.position.set(48, 2, -77); const bm = new BABYLON.StandardMaterial('pBallM', scene); bm.diffuseTexture = stripeTexture(['#ff006e', '#ffffff', '#3a86ff', '#ffffff', '#ffd23f', '#ffffff'], 6); ball.material = bm; finishStatic(ball);
    addCollider(46.6, 0, -78.4, 49.4, 3.6, -75.6);
    // tachos de basura
    for (const [x, z] of [[8, 4], [-8, -4], [4, -8], [-4, 8]]) cyl('bin', 1.1, 1.3, x + Math.sign(x) * 8, 0, z + Math.sign(z) * 8, '#2fb344', { tess: 12 });

    // borde: un seto alto alrededor de toda la plaza
    for (const s of [-1, 1]) { box('border', 2 * S + 4, 3.2, 2, 0, 0, s * (S + 1), hedge); box('border', 2, 3.2, 2 * S + 4, s * (S + 1), 0, 0, hedge); }
    // ciudad alrededor (solo para mirar)
    const bCols = ['#ffd6a5', '#caffbf', '#9bf6ff', '#ffc6ff', '#fdffb6', '#bdb2ff', '#ffadad'];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2, r = rand(150, 190), x = Math.cos(a) * r, z = Math.sin(a) * r;
      const w = rand(14, 24), h = rand(18, 46);
      box('bld', w, h, w, x, 0, z, bCols[i % bCols.length], { collide: false, shadow: false });
      for (let k = 0; k < 3; k++) box('win', w + 0.2, 1.4, w * 0.7, x, h * (0.25 + k * 0.22), z, mat('#7aa5d8'), { collide: false, shadow: false });
    }
    for (let i = 0; i < 20; i++) { const a = rand(0, Math.PI * 2), r = rand(108, 130); tree(Math.cos(a) * r, Math.sin(a) * r, rand(7, 10), '#4caf50', false); }
    // estanque con patitos de goma (noroeste, entre la glorieta y el centro)
    cyl('pond', 16, 0.5, -30, 0, 70, '#9c6644', { collide: false, tess: 32 });
    cyl('pondW', 15, 0.55, -30, 0, 70, mat('#4cc9f0', { emissive: '#1b6a9c', alpha: 0.9 }), { collide: false, shadow: false, tess: 32 });
    for (let i = 0; i < 8; i++) { const z0 = 62 + i * 2, ze = Math.abs(z0 + 1 - 70), hw = Math.sqrt(Math.max(0, 56 - ze * ze)); if (hw > 0.5) addCollider(-30 - hw, 0, z0, -30 + hw, 0.55, z0 + 2); }
    for (const [x, z] of [[-33, 68], [-27, 73], [-29, 66]]) { sphereDeco(1.2, x, 0.9, z, '#ffd23f', 0.8); sphereDeco(0.7, x + 0.5, 1.6, z, '#ffd23f'); }
    // cancha con arcos (sureste)
    box('court', 26, 0.04, 16, 22, 0, -84, '#e76f51', { collide: false, shadow: false });
    for (const s of [-1, 1]) { box('goalPost', 0.4, 2.6, 0.4, 22 + s * 12.6, 0, -87, '#ffffff'); box('goalPost', 0.4, 2.6, 0.4, 22 + s * 12.6, 0, -81, '#ffffff'); box('goalBar', 0.4, 0.4, 6.4, 22 + s * 12.6, 2.6, -84, '#ffffff', { collide: false }); }
    scatter(70, S - 4, (x, z) => Math.abs(x) < 6 || Math.abs(z) < 6 || Math.hypot(x, z) < 22);
  }
  // Rellena un mapa grande con cosas para cubrirse (árboles, arbustos, bloques, canteros, autitos)
  function scatter(n, S, avoid) {
    const probe = { pos: new V3(), r: 3.2, h: 3 };
    for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
      const x = rand(-S, S), z = rand(-S, S);
      if (avoid(x, z)) continue;
      probe.pos.set(x, 0.05, z);
      if (collidesAny(probe)) continue;
      i++;
      const k = Math.random();
      if (k < 0.3) tree(x, z, rand(6, 8.5));
      else if (k < 0.5) { box('bushC', 2.6, 1.6, 2.6, x, 0, z, mat('#3f8f3a'), { shadow: false }); sphereDeco(3.4, x, 1.4, z, pick(['#4e9f3d', '#5cbf4f', '#3f8f3a']), 0.7); }
      else if (k < 0.7) { const s1 = rand(2, 3.2); box('sBlock', s1, s1, s1, x, 0, z, pick(['#ff006e', '#3a86ff', '#ffd23f', '#8338ec', '#06d6a0', '#fb5607'])); if (Math.random() < 0.5) box('sBlock', s1 * 0.6, s1 * 0.6, s1 * 0.6, x, s1, z, pick(['#ffffff', '#ffd23f', '#ef233c'])); }
      else if (k < 0.85) { const along = Math.random() < 0.5; box('planterS', along ? 6 : 1.8, 0.9, along ? 1.8 : 6, x, 0, z, '#bc6c25'); for (let q = 0; q < 3; q++) sphereDeco(0.8, x + (along ? rand(-2.5, 2.5) : rand(-0.5, 0.5)), 1.2, z + (along ? rand(-0.5, 0.5) : rand(-2.5, 2.5)), pick(['#ff70a6', '#ffd23f', '#c77dff', '#ffffff'])); }
      else toyCar(x, z, Math.random() < 0.5, pick(['#ef233c', '#3a86ff', '#ffbe0b', '#06d6a0', '#8338ec']));
    }
  }
  function toyCar(x, z, alongX, hex) {
    const L = 5, W = 2.4;
    box('carB', alongX ? L : W, 1.4, alongX ? W : L, x, 0.3, z, hex, { collide: false });
    box('carT', alongX ? 2.6 : W - 0.3, 1.0, alongX ? W - 0.3 : 2.6, x, 1.7, z, '#bde0fe', { collide: false });
    addCollider(x - (alongX ? L : W) / 2, 0, z - (alongX ? W : L) / 2, x + (alongX ? L : W) / 2, 2.7, z + (alongX ? W : L) / 2);
    for (const a of [-1.6, 1.6]) for (const b of [-1.25, 1.25]) cyl('wheelC', 1, 0.3, x + (alongX ? a : b), 0, z + (alongX ? b : a), '#212529', { collide: false, shadow: false, tess: 10 });
  }

  // --- CASA DE 2 PISOS, con patio y cerca ---
  function buildCasa() {
    const HX = 24, HZ = 16, F2 = 5, TOP = 10, T = 0.4, YX = 80, YZ = 64;
    MAPS.casa.bounds = [-YX, -YZ, YX, YZ, 1.0];
    MAPS.casa.fog = [120, 400];
    const ground = BABYLON.MeshBuilder.CreateGround('cGround', { width: 900, height: 900 }, scene);
    ground.material = grassMaterial('cGrass', 70); finishStatic(ground, false);
    addCollider(-YX - 4, -1, -YZ - 4, YX + 4, 0, YZ + 4);
    // pisos y paredes
    const floor1 = woodMaterial('floor1', '#d9a066', '#b5783e', 6);
    const floor2 = woodMaterial('floor2', '#e8c39e', '#c99a6b', 6);
    box('f1', 2 * HX, 0.04, 2 * HZ, 0, 0, 0, floor1, { collide: false, shadow: false });
    const ext = mat('#fff1d6'), in1 = mat('#bde0fe', { emissive: '#2c3e50' }), in2 = mat('#ffd6e0', { emissive: '#4a2f36' }), trim = mat('#e07a5f');
    const D = 3.2, Wn = 3, w1 = [1.3, 3.1], w2 = [F2 + 1.3, F2 + 3.1];
    const door = (c) => [c, D, 0, 3.4];
    const win = (c, f) => [c, Wn, ...(f === 1 ? w1 : w2)];
    // fachadas (de 0 a 10, con puertas abajo y ventanas en los dos pisos)
    wall(true, -HZ + T / 2, -HX, HX, 0, TOP, T, ext, [win(-20, 1), door(-14), win(-6, 1), door(4), win(12, 1), win(20, 1), win(-18, 2), win(-8, 2), win(4, 2), win(16, 2)], { shadow: false });
    wall(true, HZ - T / 2, -HX, HX, 0, TOP, T, ext, [win(-20, 1), win(-12, 1), door(-4), win(4, 1), win(14, 1), win(20, 1), win(-18, 2), win(-6, 2), win(6, 2), win(18, 2)], { shadow: false });
    wall(false, -HX + T / 2, -HZ + T, HZ - T, 0, TOP, T, ext, [door(-8), win(4, 1), win(-8, 2), win(8, 2)], { shadow: false });
    wall(false, HX - T / 2, -HZ + T, HZ - T, 0, TOP, T, ext, [door(8), win(-6, 1), win(-8, 2), win(8, 2)], { shadow: false });
    // detalles de afuera: postigos en las ventanas, una franja entre pisos y un zócalo de piedra
    const shutter = mat('#2a9d8f'), out = 0.3;
    const facade = (alongX, fixed, sign, holes) => holes.forEach(([c, w, y0, y1]) => {
      if (y0 <= 0) { // puerta: marco de color arriba
        if (alongX) box('lintel', w + 0.8, 0.4, 0.2, c, y1, fixed + sign * out, trim, { collide: false, shadow: false });
        else box('lintel', 0.2, 0.4, w + 0.8, fixed + sign * out, y1, c, trim, { collide: false, shadow: false });
        return;
      }
      for (const k of [-1, 1]) {
        if (alongX) box('shutter', 0.9, y1 - y0, 0.12, c + k * (w / 2 + 0.5), y0, fixed + sign * out, shutter, { collide: false, shadow: false });
        else box('shutter', 0.12, y1 - y0, 0.9, fixed + sign * out, y0, c + k * (w / 2 + 0.5), shutter, { collide: false, shadow: false });
      }
      if (alongX) box('sill', w + 0.4, 0.2, 0.4, c, y0 - 0.2, fixed + sign * out, '#ffffff', { collide: false, shadow: false });
      else box('sill', 0.4, 0.2, w + 0.4, fixed + sign * out, y0 - 0.2, c, '#ffffff', { collide: false, shadow: false });
    });
    facade(true, -HZ, -1, [win(-20, 1), door(-14), win(-6, 1), door(4), win(12, 1), win(20, 1), win(-18, 2), win(-8, 2), win(4, 2), win(16, 2)]);
    facade(true, HZ, 1, [win(-20, 1), win(-12, 1), door(-4), win(4, 1), win(14, 1), win(20, 1), win(-18, 2), win(-6, 2), win(6, 2), win(18, 2)]);
    facade(false, -HX, -1, [door(-8), win(4, 1), win(-8, 2), win(8, 2)]);
    facade(false, HX, 1, [door(8), win(-6, 1), win(-8, 2), win(8, 2)]);
    for (const sg of [-1, 1]) {
      box('band', 2 * HX + 0.6, 0.45, 0.3, 0, F2 - 0.45, sg * (HZ + 0.1), trim, { collide: false, shadow: false });
      box('band', 0.3, 0.45, 2 * HZ + 0.6, sg * (HX + 0.1), F2 - 0.45, 0, trim, { collide: false, shadow: false });
    }
    // escalón de entrada y techito sobre la puerta principal
    box('porch', 6, 0.3, 2.4, 4, 0, -HZ - 1.2, '#d6ccc2');
    box('porchRoof', 6.4, 0.3, 2.6, 4, 3.9, -HZ - 1.3, '#d1495b', { collide: false });
    // escaleras: A en la cocina (sube hacia +x), B en el comedor (sube hacia -x)
    const holeA = [10, -HZ + T, 20.1, -12.2], holeB = [-20.1, 12.2, -10, HZ - T];
    stairsX(10, 1, -14, 3.2, F2, mat('#f4a261'));
    stairsX(-10, -1, 14, 3.2, F2, mat('#2a9d8f'));
    // losa entre pisos (con los huecos de las escaleras) y techo
    slab(-HX + T, -HZ + T, HX - T, HZ - T, F2 - 0.5, F2, floor2, [holeA, holeB]);
    slab(-HX, -HZ, HX, HZ, TOP - 0.5, TOP, mat('#f8edeb'));
    // cielorrasos claritos (la cara de abajo de las losas queda oscura si no)
    const ceil = mat('#fffaf0', { emissive: '#8c857a' });
    slab(-HX + T, -HZ + T, HX - T, HZ - T, F2 - 0.53, F2 - 0.5, ceil, [holeA, holeB]);
    slab(-HX + T, -HZ + T, HX - T, HZ - T, TOP - 0.53, TOP - 0.5, ceil);
    // barandas alrededor de los huecos de arriba
    box('rail', 10.1, 1.0, 0.25, 15.05, F2, -12.1, trim); box('rail', 0.25, 1.0, 3.6, 9.9, F2, -14.2, trim);
    box('rail', 10.1, 1.0, 0.25, -15.05, F2, 12.1, trim); box('rail', 0.25, 1.0, 3.6, -9.9, F2, 14.2, trim);
    // paredes de adentro, piso 1: cocina, living, comedor, cuarto de juegos
    wall(true, 0, -HX + T, HX - T, 0, F2 - 0.5, T, in1, [door(-16), [0, 5, 0, 3.6], door(15)], { shadow: false });
    wall(false, -8, -HZ + T, 0, 0, F2 - 0.5, T, in1, [door(-8)], { shadow: false });
    wall(false, 6, 0, HZ - T, 0, F2 - 0.5, T, in1, [door(6)], { shadow: false });
    // piso 2: dormitorios y pasillo
    wall(true, 2, -HX + T, HX - T, F2, TOP - 0.5, T, in2, [door(-15), door(0), door(16)], { shadow: false });
    wall(false, -2, -HZ + T, 2, F2, TOP - 0.5, T, in2, [door(-8)], { shadow: false });
    wall(false, 2, 2, HZ - T, F2, TOP - 0.5, T, in2, [door(9)], { shadow: false });
    // techo a dos aguas (solo para mirar)
    const roof = BABYLON.MeshBuilder.CreateCylinder('roof', { diameter: 1, height: 2 * HX + 2, tessellation: 3 }, scene);
    roof.rotation.z = Math.PI / 2; roof.scaling.set(8, 1, 41); roof.position.set(0, TOP + 2, 0);
    roof.material = plastic('#d1495b'); finishStatic(roof, false);
    box('chimney', 2.5, 6, 2.5, 14, TOP, 6, '#9c6644', { collide: false });

    // --- Muebles, piso 1 ---
    // cocina (sureste): mesada, heladera, isla
    box('counter', 14, 1.4, 1.6, 4, 0, -HZ + T + 0.8 + 3.5, '#f8f9fa'); // isla
    box('fridge', 2.2, 4, 2, HX - T - 1.2, 0, -2, '#dee2e6');
    box('counter', 1.6, 1.4, 8, HX - T - 0.8, 0, -8.5, '#adb5bd');
    box('oven', 2, 1.4, 1.6, -2, 0, -1.2, '#495057');
    // living (suroeste): sillón, mesita, tele
    box('sofa', 7, 1.0, 2.2, -16, 0, -6, '#8338ec'); box('sofaBack', 7, 1.0, 0.6, -16, 1.0, -5.2, '#6a2fc0');
    box('coffee', 3, 0.6, 1.6, -16, 0, -10, '#a47148');
    box('tvStand', 6, 1.2, 1.2, -16, 0, -HZ + T + 0.6, '#343a40'); box('tv', 5, 2.6, 0.3, -16, 1.2, -HZ + T + 0.4, '#212529', { collide: false });
    box('rug', 10, 0.03, 7, -16, 0.04, -8.5, '#ffafcc', { collide: false, shadow: false });
    // comedor (noroeste): mesa larga con sillas (debajo te podés agachar)
    box('tableTop', 8, 0.25, 3.4, -10, 1.25, 6, '#a47148');
    for (const [a, b] of [[-3.7, -1.5], [3.7, -1.5], [-3.7, 1.5], [3.7, 1.5]]) box('tLeg', 0.3, 1.25, 0.3, -10 + a, 0, 6 + b, '#7f5539');
    for (const a of [-2.5, 0, 2.5]) for (const s of [-1, 1]) box('chair', 1.2, 0.9, 1.2, -10 + a, 0, 6 + s * 2.6, '#ffbe0b');
    box('shelf', 1.2, 3.5, 5, -HX + T + 0.6, 0, 3.5, '#9c6644');
    // cuarto de juegos (noreste): bloques gigantes y una pelota
    box('pBlock', 3, 3, 3, 15, 0, 9, '#ef233c'); box('pBlock', 2, 2, 2, 15, 3, 9, '#ffd23f');
    box('pBlock', 2.5, 2.5, 2.5, 19.5, 0, 4, '#3a86ff'); box('pBlock', 2.2, 1.4, 4, 11, 0, 3.5, '#2fb344');
    box('toyChest', 4, 1.6, 2, 19, 0, HZ - T - 1.2, '#e76f51');
    box('rug2', 9, 0.03, 8, 15, 0.04, 8, '#a2d2ff', { collide: false, shadow: false });
    // --- Muebles, piso 2 ---
    box('rug3', 44, 0.03, 0.01, 0, F2 + 0.02, 0, '#ffffff', { collide: false, shadow: false });
    box('bed', 4.4, 1.0, 6.5, -19, F2, -11, '#ff70a6'); box('pillow', 3.6, 0.4, 1.2, -19, F2 + 1.0, -13.4, '#ffffff', { collide: false });
    box('bed', 4.4, 1.0, 6.5, -7, F2, -11, '#06d6a0'); box('pillow', 3.6, 0.4, 1.2, -7, F2 + 1.0, -13.4, '#ffffff', { collide: false });
    box('wardrobe', 4.5, 3.6, 1.4, -13, F2, -1, '#9c6644');
    box('bedBig', 7, 1.1, 7, 10, F2, -6, '#4361ee'); box('pillow', 6, 0.4, 1.2, 10, F2 + 1.1, -9, '#ffffff', { collide: false });
    box('desk', 4, 1.3, 1.8, 20, F2, -4, '#a47148');
    box('dresser', 1.4, 2.2, 4, 2.9, F2, 6, '#c08552');
    box('bunk', 3.6, 1.0, 6, -21, F2, 7, '#ffbe0b'); box('bunkTop', 3.6, 0.4, 6, -21, F2 + 2.6, 7, '#ffbe0b'); box('bunkPost', 0.3, 2.6, 0.3, -19.4, F2 + 1.0, 4.2, '#bc6c25');
    box('toys2', 2.4, 2.4, 2.4, -6, F2, 9, '#9ef01a'); box('toys2', 3, 1.2, 1.8, -12, F2, 4.5, '#ff9f1c');
    box('bath', 5, 1.2, 2.6, 12, F2, 13.6, '#ffffff'); box('sink', 1.6, 1.6, 1.4, 20, F2, 13.9, '#e9ecef');
    box('boxes', 3, 2.2, 3, 19, F2, 6, '#ddb892');

    // --- Patio: cerca, árboles, galpón, pileta inflable y juguetes ---
    const fence = mat('#ffffff');
    for (const s of [-1, 1]) {
      box('fence', 2 * YX, 2.6, 0.3, 0, 0, s * YZ, fence); box('fence', 0.3, 2.6, 2 * YZ, s * YX, 0, 0, fence);
      for (let x = -YX; x <= YX; x += 4) box('picket', 0.5, 3.0, 0.5, x, 0, s * YZ, fence, { collide: false });
      for (let z = -YZ; z <= YZ; z += 4) box('picket', 0.5, 3.0, 0.5, s * YX, 0, z, fence, { collide: false });
    }
    for (const [x, z] of [[-32, -24], [32, 24], [-32, 22], [30, -24], [0, 25], [-8, -25]]) tree(x, z, rand(6, 8));
    box('shed', 6, 4, 5, 31, 0, -2, '#81b29a'); const shedRoof = BABYLON.MeshBuilder.CreateBox('shedRoof', { width: 7, height: 0.4, depth: 6 }, scene); shedRoof.position.set(31, 4.3, -2); shedRoof.rotation.z = 0.15; shedRoof.material = plastic('#3d405b'); finishStatic(shedRoof);
    cyl('pool', 8, 0.8, -31, 0, -6, '#4cc9f0', { tess: 32 }); cyl('poolW', 7, 0.82, -31, 0, -6, mat('#90e0ef', { emissive: '#2a9dc0' }), { collide: false, shadow: false, tess: 32 });
    box('car', 4, 1.6, 2.2, 10, 0, 22, '#ef233c'); box('carTop', 2.2, 1, 2, 9.6, 1.6, 22, '#ff8a95');
    for (const a of [-1.3, 1.3]) for (const b of [-1.1, 1.1]) cyl('wheel', 1, 0.3, 10 + a, 0.2, 22 + b, '#212529', { collide: false, tess: 12 });
    box('yBlock', 2.5, 2.5, 2.5, -20, 0, 23, '#ffbe0b'); box('yBlock', 2.5, 2.5, 2.5, -2, 0, -23, '#8338ec'); box('yBlock', 3, 1.5, 3, 20, 0, -23, '#06d6a0');
    box('hedgeY', 8, 2.2, 1.4, -26, 0, 18, '#3f8f3a'); box('hedgeY', 1.4, 2.2, 8, 34, 0, 14, '#3f8f3a');
    box('kennel', 3, 2.6, 3, -30, 0, 10, '#bc6c25');
    // patio grande: garaje, invernadero, pileta de verdad, casita del árbol y huerta
    wall(true, -50, 46, 62, 0, 4, 0.4, mat('#adb5bd'), [[54, 6, 0, 3.4]]); wall(true, -38, 46, 62, 0, 4, 0.4, mat('#adb5bd'));
    wall(false, 46, -50, -38, 0, 4, 0.4, mat('#adb5bd')); wall(false, 62, -50, -38, 0, 4, 0.4, mat('#adb5bd'), [[-44, 3, 1.3, 3]]);
    slab(46, -50, 62, -38, 4, 4.4, mat('#6c757d')); toyCar(51, -44, false, '#3a86ff');
    const glass = mat('#caf0f8', { alpha: 0.45, emissive: '#5a8fa0' });
    wall(true, 40, -60, -44, 0, 3.6, 0.3, glass, [[-52, 3, 0, 3]]); wall(true, 52, -60, -44, 0, 3.6, 0.3, glass);
    wall(false, -60, 40, 52, 0, 3.6, 0.3, glass); wall(false, -44, 40, 52, 0, 3.6, 0.3, glass);
    for (const z of [43, 46.5, 49.5]) box('plantBed', 12, 0.8, 1.6, -52, 0, z, '#9c6644');
    for (let i = 0; i < 10; i++) sphereDeco(1, rand(-57, -47), 1.2, pick([43, 46.5, 49.5]), pick(['#2fb344', '#ef233c', '#ffbe0b']));
    box('poolEdge', 22, 0.8, 1, 0, 0, -45, '#e9ecef'); box('poolEdge', 22, 0.8, 1, 0, 0, -57, '#e9ecef');
    box('poolEdge', 1, 0.8, 13, -11, 0, -51, '#e9ecef'); box('poolEdge', 1, 0.8, 13, 11, 0, -51, '#e9ecef');
    box('poolWater', 21, 0.05, 11, 0, 0.3, -51, mat('#48cae4', { emissive: '#1f7a9c', alpha: 0.9 }), { collide: false, shadow: false });
    box('diving', 1.2, 1.4, 3.5, 0, 0, -59, '#ffffff');
    // casita del árbol: tronco grueso, plataforma con escalones
    cyl('bigTrunk', 3, 8, 58, 0, 40, mat('#8d5a34'));
    box('thFloor', 8, 0.5, 8, 58, 3.5, 40, '#c08552');
    for (let i = 0; i < 7; i++) box('thStep', 2, 0.5 * (i + 1), 1, 58 - 6 + 0.5, 0, 40 - 4 - 0.5 - (6 - i), '#ddb892');
    box('thWall', 8, 1.2, 0.3, 58, 4, 43.9, '#ffbe0b'); box('thWall', 0.3, 1.2, 8, 61.9, 4, 40, '#ffbe0b');
    for (let k = 0; k < 4; k++) sphereDeco(rand(8, 10), 58 + rand(-3, 3), 11 + rand(-1, 2), 40 + rand(-3, 3), pick(['#3f9b3a', '#4caf50']));
    scatter(55, Math.min(YX, YZ) - 3, (x, z) => (Math.abs(x) < HX + 4 && Math.abs(z) < HZ + 5) || Math.abs(x) > YX - 3 || Math.abs(z) > YZ - 3);
    scatter(25, YX - 3, (x, z) => Math.abs(z) < YZ - 2 || Math.abs(x) > YX - 3 || Math.abs(z) > YZ - 3 || Math.abs(x) < HX + 4);
    // vecindario a lo lejos
    for (let i = 0; i < 22; i++) { const a = (i / 22) * Math.PI * 2, r = rand(120, 150); tree(Math.cos(a) * r, Math.sin(a) * r, rand(8, 12), '#4caf50', false); }
  }

  // --- BARRIO: casas a los costados y una plaza en el medio ---
  function fountain(x, z, R) {
    cyl('basin', 2 * R, 0.9, x, 0, z, '#d6ccc2', { collide: false, tess: 40 });
    cyl('water', 2 * R - 1.4, 0.95, x, 0, z, mat('#5ec8ff', { emissive: '#1b6a9c', alpha: 0.85 }), { collide: false, shadow: false, tess: 40 });
    for (let i = 0; i < 2 * R; i++) { const z0 = -R + i, z1 = z0 + 1, ze = Math.max(Math.abs(z0), Math.abs(z1)), hw = Math.sqrt(Math.max(0, R * R - ze * ze)); if (hw > 0.3) addCollider(x - hw, 0, z + z0, x + hw, 0.9, z + z1); }
    cyl('fCol', 2, 3.2, x, 0.9, z, '#c9bba9', { tess: 16 });
    cyl('fBowl', 4.6, 0.6, x, 4, z, '#d6ccc2', { tess: 24 });
    sphereDeco(1.4, x, 5.4, z, mat('#8fd8ff', { emissive: '#4aa8e0', alpha: 0.7 }));
  }
  // Casa de un piso que se puede recorrer: puerta del lado "face", ventanas, una pared adentro y muebles
  function house(cx, cz, w, d, face, hex, roofHex) {
    const T = 0.4, H1 = 4.5, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const wallM = mat(hex), inM = mat('#fdf0d5', { emissive: '#4a4030' });
    const D = 3.2, win = (c) => [c, 2.6, 1.3, 3.0], door = (c) => [c, D, 0, 3.4];
    const sides = {
      s: [true, z0 + T / 2, x0, x1], n: [true, z1 - T / 2, x0, x1],
      w: [false, x0 + T / 2, z0 + T, z1 - T], e: [false, x1 - T / 2, z0 + T, z1 - T]
    };
    const back = { n: 's', s: 'n', e: 'w', w: 'e' }[face];
    for (const k in sides) {
      const [ax, fixed, a0, a1] = sides[k], L = a1 - a0, mid = (a0 + a1) / 2;
      const holes = k === face ? [door(mid), win(a0 + L * 0.2), win(a1 - L * 0.2)] : k === back ? [door(a0 + L * 0.3), win(a1 - L * 0.25)] : [win(mid)];
      wall(ax, fixed, a0, a1, 0, H1, T, wallM, holes, { shadow: false });
    }
    // pared de adentro con puerta (divide en dos cuartos)
    if (w >= d) wall(false, cx + w * 0.1, z0 + T, z1 - T, 0, H1, 0.3, inM, [door(cz)], { shadow: false });
    else wall(true, cz + d * 0.1, x0 + T, x1 - T, 0, H1, 0.3, inM, [door(cx)], { shadow: false });
    box('hFloor', w - 0.2, 0.04, d - 0.2, cx, 0, cz, mat('#e0b083'), { collide: false, shadow: false });
    slab(x0, z0, x1, z1, H1, H1 + 0.5, mat('#f8edeb'));
    slab(x0 + T, z0 + T, x1 - T, z1 - T, H1 - 0.03, H1, mat('#fffaf0', { emissive: '#8c857a' }));
    const roof = BABYLON.MeshBuilder.CreateCylinder('hRoof', { diameter: 1, height: w + 1.2, tessellation: 3 }, scene);
    roof.rotation.z = Math.PI / 2; roof.scaling.set(5, 1, (d + 1.6) / 0.866); roof.position.set(cx, H1 + 0.5 + 1.25, cz);
    roof.material = plastic(roofHex); finishStatic(roof, false);
    // muebles
    const fx = (u) => cx + u * (w / 2 - 2.2), fz = (v) => cz + v * (d / 2 - 2.2);
    box('sofa', 4, 1.0, 1.6, fx(-0.55), 0, fz(-0.6), pick(['#8338ec', '#ef233c', '#3a86ff']));
    box('bedH', 3, 0.9, 4.4, fx(0.6), 0, fz(0.5), pick(['#ff70a6', '#06d6a0', '#ffbe0b']));
    box('tableH', 2.4, 1.1, 1.6, fx(-0.5), 0, fz(0.55), '#a47148');
    box('closet', 1.2, 3.2, 3, fx(0.85), 0, fz(-0.55), '#9c6644');
  }
  function buildBarrio() {
    const S = 110;
    MAPS.barrio.bounds = [-S, -S, S, S, 1.25];
    const ground = BABYLON.MeshBuilder.CreateGround('bGround', { width: 900, height: 900 }, scene);
    ground.material = grassMaterial('bGrass', 70); finishStatic(ground, false);
    addCollider(-S - 6, -1, -S - 6, S + 6, 0, S + 6);
    const asphalt = mat('#5c5f66'), walk = mat('#d9d4cc'), stripe = mat('#ffd23f', { emissive: '#7a6200' });
    // calles: un anillo alrededor de la plaza y otro más afuera, y calles que los cruzan
    const road = (x0, z0, x1, z1) => box('road', x1 - x0, 0.03, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, asphalt, { collide: false, shadow: false });
    for (const sg of [-1, 1]) {
      road(-46, sg > 0 ? 32 : -46, 46, sg > 0 ? 46 : -32); road(sg > 0 ? 32 : -46, -46, sg > 0 ? 46 : -32, 46);
      road(-84, sg > 0 ? 72 : -84, 84, sg > 0 ? 84 : -72); road(sg > 0 ? 72 : -84, -84, sg > 0 ? 84 : -72, 84);
      road(-6, sg > 0 ? 46 : -72, 6, sg > 0 ? 72 : -46); road(sg > 0 ? 46 : -72, -6, sg > 0 ? 72 : -46, 6);
    }
    for (let i = -40; i <= 40; i += 8) for (const sg of [-1, 1]) { box('line', 4, 0.04, 0.4, i, 0.01, sg * 39, stripe, { collide: false, shadow: false }); box('line', 0.4, 0.04, 4, sg * 39, 0.01, i, stripe, { collide: false, shadow: false }); }
    for (let i = -76; i <= 76; i += 8) for (const sg of [-1, 1]) { box('line', 4, 0.04, 0.4, i, 0.01, sg * 78, stripe, { collide: false, shadow: false }); box('line', 0.4, 0.04, 4, sg * 78, 0.01, i, stripe, { collide: false, shadow: false }); }
    // plaza del medio
    box('plazaWalk', 64, 0.05, 64, 0, 0, 0, walk, { collide: false, shadow: false });
    box('plazaGrass', 58, 0.06, 58, 0, 0, 0, mat('#7ccd55'), { collide: false, shadow: false });
    box('pathA', 5, 0.07, 58, 0, 0, 0, walk, { collide: false, shadow: false }); box('pathB', 58, 0.07, 5, 0, 0, 0, walk, { collide: false, shadow: false });
    fountain(0, 0, 6);
    for (const [x, z] of [[14, 14], [-14, 14], [14, -14], [-14, -14], [24, 8], [-24, -8], [8, -24], [-8, 24]]) tree(x, z, rand(6.5, 8));
    for (const sg of [-1, 1]) for (const dd of [12, 22]) { box('benchB', 1.2, 0.6, 4, sg * 4.4, 0, dd * sg, '#b5651d'); box('benchB', 4, 0.6, 1.2, dd * sg, 0, -sg * 4.4, '#b5651d'); }
    box('kiosk', 5, 3, 4, 20, 0, 22, '#ff70a6'); box('kioskRoof', 6.4, 0.4, 5.4, 20, 3, 22, '#ffd23f', { collide: false });
    box('statueBase', 3, 1.4, 3, -20, 0, -21, '#adb5bd'); cyl('statue', 1.4, 3.6, -20, 1.4, -21, '#3a86ff');
    for (const [x, z] of [[30, 30], [-30, 30], [30, -30], [-30, -30], [30, 0], [-30, 0], [0, 30], [0, -30]]) { cyl('lampB', 0.35, 6, x, 0, z, '#495057', { tess: 8 }); sphereDeco(1.1, x, 6.3, z, mat('#fff3b0', { emissive: '#ffd23f' })); }
    // casas: una fila mirando a la plaza y otra fila más afuera
    const wallCols = ['#ffd6a5', '#caffbf', '#9bf6ff', '#ffc6ff', '#fdffb6', '#bdb2ff', '#ffadad', '#f1faee'];
    const roofCols = ['#d1495b', '#3d405b', '#2a9d8f', '#e76f51', '#8338ec', '#264653'];
    let hi = 0;
    const H = (x, z, w, d, f) => house(x, z, w, d, f, wallCols[hi % wallCols.length], roofCols[hi++ % roofCols.length]);
    for (const x of [-38, -14, 14, 38]) { if (Math.abs(x) < 10) continue; H(x, 58, 16, 13, 's'); H(x, -58, 16, 13, 'n'); }
    for (const z of [-38, -14, 14, 38]) { H(58, z, 13, 16, 'w'); H(-58, z, 13, 16, 'e'); }
    for (const x of [-62, -32, 0, 32, 62]) { H(x, 95, 18, 14, 's'); H(x, -95, 18, 14, 'n'); }
    for (const z of [-62, -32, 0, 32, 62]) { H(95, z, 14, 18, 'w'); H(-95, z, 14, 18, 'e'); }
    // autos estacionados, buzones y arbolitos en las veredas
    const carCols = ['#ef233c', '#3a86ff', '#ffbe0b', '#06d6a0', '#8338ec', '#ffffff', '#212529'];
    for (const sg of [-1, 1]) for (const t of [-26, 6, 22]) {
      toyCar(t, sg * 35, true, pick(carCols)); toyCar(sg * 35, t + 3, false, pick(carCols));
      toyCar(t * 2.2, sg * 81.5, true, pick(carCols)); toyCar(sg * 81.5, t * 2.2 + 4, false, pick(carCols));
    }
    for (const sg of [-1, 1]) for (const t of [-70, -50, -26, 26, 50, 70]) { tree(t, sg * 68, rand(6, 7.5)); tree(sg * 68, t + 4, rand(6, 7.5)); }
    for (const sg of [-1, 1]) for (const t of [-45, -20, 20, 45]) { cyl('mailbox', 0.5, 1.6, t + 4, 0, sg * 49.5, '#ef233c', { tess: 8 }); cyl('hydrant', 0.8, 1.1, sg * 49.5, 0, t - 4, '#ffbe0b', { tess: 10 }); }
    // esquinas: canchita, juegos y estacionamiento
    box('court', 18, 0.04, 14, 92, 0, 92, '#e76f51', { collide: false, shadow: false });
    for (const s1 of [-1, 1]) { box('hoop', 0.4, 4, 0.4, 92 + s1 * 8, 0, 92, '#ffffff'); box('board', 0.2, 1.4, 2.2, 92 + s1 * 7.7, 3.4, 92, '#ffffff', { collide: false }); }
    box('slideTower', 4, 2.5, 4, -92, 0, 92, '#ff9f1c'); for (let i = 0; i < 5; i++) box('stStep', 2, 0.5 * (i + 1), 0.8, -92, 0, 92 - 2 - 0.4 - (4 - i) * 0.8, '#3a86ff');
    for (let i = 0; i < 4; i++) toyCar(-100 + i * 6, -92, false, pick(carCols));
    for (let i = 0; i < 3; i++) toyCar(86 + i * 6, -96, false, pick(carCols));
    // borde: un paredón de ladrillos
    for (const sg of [-1, 1]) { box('borderB', 2 * S + 4, 3.4, 2, 0, 0, sg * (S + 1), '#c1666b'); box('borderB', 2, 3.4, 2 * S + 4, sg * (S + 1), 0, 0, '#c1666b'); }
    scatter(40, S - 4, (x, z) => Math.abs(x) < 33 && Math.abs(z) < 33 || (Math.max(Math.abs(x), Math.abs(z)) > 30 && Math.max(Math.abs(x), Math.abs(z)) < 48) || (Math.max(Math.abs(x), Math.abs(z)) > 70 && Math.max(Math.abs(x), Math.abs(z)) < 86) || Math.abs(x) < 8 || Math.abs(z) < 8);
    const bCols = ['#ffd6a5', '#caffbf', '#9bf6ff', '#ffc6ff', '#fdffb6', '#bdb2ff', '#ffadad'];
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2, r = rand(150, 190), x = Math.cos(a) * r, z = Math.sin(a) * r, w = rand(14, 24), h = rand(14, 40);
      box('bld', w, h, w, x, 0, z, bCols[i % bCols.length], { collide: false, shadow: false });
    }
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
  // Grilla de paredes: así cada choque o disparo solo revisa las paredes cercanas (clave con 50 soldaditos)
  const GRID_C = 8;
  let colGrid = null, gridStamp = 0;
  function buildColGrid(list) {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const c of list) { x0 = Math.min(x0, c.min.x); z0 = Math.min(z0, c.min.z); x1 = Math.max(x1, c.max.x); z1 = Math.max(z1, c.max.z); }
    const nx = Math.floor((x1 - x0) / GRID_C) + 1, nz = Math.floor((z1 - z0) / GRID_C) + 1;
    const cells = Array.from({ length: nx * nz }, () => []);
    for (const c of list) {
      c.st = 0;
      const ia = Math.floor((c.min.x - x0) / GRID_C), ib = Math.floor((c.max.x - x0) / GRID_C);
      const ja = Math.floor((c.min.z - z0) / GRID_C), jb = Math.floor((c.max.z - z0) / GRID_C);
      for (let i = ia; i <= ib; i++) for (let j = ja; j <= jb; j++) cells[i * nz + j].push(c);
    }
    return { x0, z0, nx, nz, cells };
  }
  function addCell(g, i, j, buf) {
    if (i < 0 || j < 0 || i >= g.nx || j >= g.nz) return;
    for (const c of g.cells[i * g.nz + j]) if (c.st !== gridStamp) { c.st = gridStamp; buf.push(c); }
  }
  function queryBox(x0, z0, x1, z1, buf) {
    const g = colGrid;
    if (!g) return colliders;
    gridStamp++; buf.length = 0;
    const ia = Math.max(0, Math.floor((x0 - g.x0) / GRID_C)), ib = Math.min(g.nx - 1, Math.floor((x1 - g.x0) / GRID_C));
    const ja = Math.max(0, Math.floor((z0 - g.z0) / GRID_C)), jb = Math.min(g.nz - 1, Math.floor((z1 - g.z0) / GRID_C));
    for (let i = ia; i <= ib; i++) for (let j = ja; j <= jb; j++) addCell(g, i, j, buf);
    return buf;
  }
  // celdas por las que pasa un segmento (recorrido tipo DDA)
  function querySeg(px, pz, dx, dz, buf) {
    const g = colGrid;
    if (!g) return colliders;
    gridStamp++; buf.length = 0;
    let i = Math.floor((px - g.x0) / GRID_C), j = Math.floor((pz - g.z0) / GRID_C);
    const ei = Math.floor((px + dx - g.x0) / GRID_C), ej = Math.floor((pz + dz - g.z0) / GRID_C);
    const si = Math.sign(dx), sj = Math.sign(dz);
    let tx = dx ? ((i + (si > 0 ? 1 : 0)) * GRID_C + g.x0 - px) / dx : Infinity, tz = dz ? ((j + (sj > 0 ? 1 : 0)) * GRID_C + g.z0 - pz) / dz : Infinity;
    const ddx = dx ? GRID_C / Math.abs(dx) : Infinity, ddz = dz ? GRID_C / Math.abs(dz) : Infinity;
    for (let n = 0; n < 500; n++) {
      addCell(g, i, j, buf);
      if (i === ei && j === ej) break;
      if (tx < tz) { if (tx > 1) break; i += si; tx += ddx; } else { if (tz > 1) break; j += sj; tz += ddz; }
    }
    return buf;
  }
  const qA = [], qB = [], qC = [], qD = [];
  function overlaps(b, c) {
    return b.pos.x - b.r < c.max.x && b.pos.x + b.r > c.min.x && b.pos.y < c.max.y && b.pos.y + b.h > c.min.y && b.pos.z - b.r < c.max.z && b.pos.z + b.r > c.min.z;
  }
  function collidesAny(b) { for (const c of queryBox(b.pos.x - b.r, b.pos.z - b.r, b.pos.x + b.r, b.pos.z + b.r, qA)) if (overlaps(b, c)) return true; return false; }
  function axisMove(b, ax, d) {
    if (d === 0) return;
    b.pos[ax] += d;
    const m = b.r + Math.abs(d) + 0.1;
    for (const c of queryBox(b.pos.x - m, b.pos.z - m, b.pos.x + m, b.pos.z + m, qB)) {
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
    for (const c of querySeg(p.x, p.z, d.x * maxT, d.z * maxT, qC)) {
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
  let mode = 'teams'; // 'teams' = por equipos en el Jardín, 'ffa' = Batalla campal (todos contra todos)
  const FFA_COLORS = ['#ef233c', '#2fb344', '#ffbe0b', '#8338ec', '#ff70a6', '#fb5607', '#06d6a0', '#ff9f1c', '#9ef01a', '#f15bb5', '#8d5524', '#e9ecef', '#495057', '#00b4d8', '#c77dff', '#d00000', '#ffd6a5', '#6a994e', '#b5838d', '#f4a261', '#264653', '#e5989b', '#80ed99', '#ffafcc'];
  let duo = false; // Batalla campal en dúos (tú + un bot compañero)
  const mateOf = (s) => (duo ? s.mate || null : null);

  // Batalla campal: aparecés en un lugar al azar, lejos de los demás (en la Plaza caés desde el cielo)
  function ffaSpawn() {
    const nav = curMap.nav;
    for (let tries = 0; tries < 60; tries++) {
      const p = nav.randomPoint(), minD = tries < 40 ? 12 : 5;
      if (soldiers.some((s) => s.alive && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < minD && Math.abs(s.pos.y - p.y) < 3)) continue;
      const v = new V3(p.x, p.y + 0.05, p.z);
      if (curMap.drop) { const hi = { pos: new V3(p.x, p.y + curMap.drop, p.z), r: 0.5, h: H }; if (!collidesAny(hi) && segWorld(new V3(p.x, p.y + 2, p.z), new V3(0, curMap.drop, 0)) >= 1) v.y = p.y + curMap.drop; }
      return v;
    }
    const p = nav.randomPoint();
    return new V3(p.x, p.y + 0.05, p.z);
  }
  function spawnPoint(team) {
    if (mode === 'ffa') return ffaSpawn();
    // en la parte de afuera de la mesa de su equipo
    const [dx, dz] = TEAM_DIR[team], c = baseCenter(team);
    for (let i = 0; i < 40; i++) {
      const u = rand(-(TABLE_HALF - 2), TABLE_HALF - 2), v = rand(2, TABLE_HALF - 1.5);
      const x = c.x - u * dz + v * dx, z = c.z + u * dx + v * dz;
      if (!freeSpot(x, z)) continue;
      if (soldiers.some((s) => s.alive && s !== undefined && Math.hypot(s.pos.x - x, s.pos.z - z) < 1.4)) continue;
      return new V3(x, 0.05, z);
    }
    return new V3(c.x + dx * rand(2, 5), 0.05, c.z + dz * rand(2, 5));
  }
  function respawn(s) {
    s.pos.copyFrom(spawnPoint(s.team)); s.vel.setAll(0);
    s.alive = true; s.hp = s.maxHp; s.spawnProt = mode === 'ffa' ? 3 : 1.5; s.yaw = Math.atan2(-s.pos.x, -s.pos.z); s.pitch = 0;
    s.reloadT = 0; s.h = H; s.item = null; s.shieldT = 0; setShield(s, false);
    if (s === P) {
      P.weapons.forEach((w) => (w.ammo = w.def.mag)); P.nades = mode === 'ffa' ? 0 : P.cls.nades; P.crouch = false;
      showMsg(''); updateHud(true);
    } else {
      if (mode === 'ffa') { s.wdef = PISTOL; s.nades = 0; }
      s.ammo = s.wdef.mag; s.target = null; s.route = null; s.lastSeen = null; s.pusher = Math.random() < 0.65; s.retreatT = 0; s.boxGoal = null; s.goal = null; s.deathT = 0; s.stuckT = 0;
      s.mesh.setEnabled(true); s.mesh.rotation.set(0, s.yaw, 0);
      if (s.marker) s.marker.setEnabled(true);
    }
  }

  function createBots() {
    bots.forEach((b) => { b.mesh.dispose(); });
    bots = [];
    if (mode === 'ffa') { // todos contra todos: cada uno es su propio "equipo"
      const used = new Set();
      const botName = () => { for (let k = 0; k < 50; k++) { const n = pick(BOT_RANKS) + ' ' + pick(BOT_NOUNS); if (!used.has(n)) { used.add(n); return n; } } return 'Soldadito ' + (used.size + 1); };
      P.team = 0; P.mate = null; P.hex = '#5aa2ff';
      for (let i = 0; i < curMap.players - 1; i++) {
        const team = duo ? Math.floor((i + 1) / 2) : i + 1;
        const b = makeSoldier(team, true, botName());
        b.skill = team === 0 ? ALLY_SKILL : diff; b.wdef = PISTOL;
        b.hex = team === 0 ? '#5aa2ff' : FFA_COLORS[(duo ? team : i) % FFA_COLORS.length];
        b.mesh = makeSoldierMesh(b.name, b.hex);
        if (team === 0) { // tu compañero lleva un triangulito celeste arriba
          const mk = BABYLON.MeshBuilder.CreateDisc('mk', { radius: 0.2, tessellation: 3 }, scene);
          mk.material = mat('#8ec5ff', { emissive: '#3a86ff' }); mk.parent = b.mesh; mk.position.y = 2.25;
          mk.rotation.z = -Math.PI / 2; mk.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; b.marker = mk;
        }
        b.strafeDir = Math.random() < 0.5 ? -1 : 1; b.think = Math.random() * 0.3; b.burst = 0; b.nadeCd = rand(6, 14);
        bots.push(b);
      }
      soldiers = [P, ...bots];
      if (duo) for (const s of soldiers) s.mate = soldiers.find((o) => o !== s && o.team === s.team) || null;
      return;
    }
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
    const key = def.proj === 'pellet' ? 'pellet' + (owner.team % 4) : def.proj;
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
    for (const c of queryBox(g.pos.x - g.r, g.pos.z - g.r, g.pos.x + g.r, g.pos.z + g.r, qD)) {
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
  const BOX_MAX = 3, BOX_FIRST = 20, BOX_GAP = 30, BOX_WARN = 5, SHIELD_TIME = 7, MEGA_R = 14, HEAL_HP = 200;
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
    boxMaster = BABYLON.MeshBuilder.CreateBox('giftBox', { size: 1.5 }, scene);
    boxMaster.material = giftMat; boxMaster.position.y = -999; addCaster(boxMaster);
    shieldMat = new BABYLON.StandardMaterial('shieldMat', scene);
    shieldMat.diffuseColor = C3.FromHexString('#5ec8ff'); shieldMat.emissiveColor = C3.FromHexString('#2a8fd6');
    shieldMat.alpha = 0.28; shieldMat.specularColor = new C3(1, 1, 1); shieldMat.backFaceCulling = false;
    boxes.push({ mesh: boxMaster, active: false, pos: new V3(), spin: 0 });
    boxMaster.setEnabled(false);
  }
  // Una caja por vez, siempre en la mesa del centro, con aviso 5 s antes. 3 por partida.
  let boxDrops = 0, dropT = BOX_FIRST;
  const boxWarnEl = $('boxwarn');
  const boxWarning = () => !boxes[0].active && boxDrops < BOX_MAX && dropT <= BOX_WARN;
  function placeBox(bx) {
    const free = BOX_SPOTS.filter((p) => !soldiers.some((s) => s.alive && Math.hypot(s.pos.x - p.x, s.pos.z - p.z) < 3));
    const p = pick(free.length ? free : BOX_SPOTS);
    bx.pos.set(p.x, 0, p.z); bx.active = true; bx.mesh.setEnabled(true);
    boxDrops++;
    confetti(new V3(p.x, 1.5, p.z), 1.5); sfx('clink', 1);
    showBanner('📦 ¡CAJA SORPRESA EN EL CENTRO!');
  }
  function resetBoxes() {
    boxes.forEach((b) => { b.active = false; b.mesh.setEnabled(false); });
    boxDrops = 0; dropT = BOX_FIRST; showBoxWarn('');
  }
  function showBoxWarn(t) { if (boxWarnEl.textContent !== t) { boxWarnEl.textContent = t; boxWarnEl.classList.toggle('hidden', !t); } }
  function updateBoxes(dt) {
    const bx0 = boxes[0];
    if (!bx0.active && boxDrops < BOX_MAX) {
      dropT -= dt;
      if (dropT <= 0) { showBoxWarn(''); placeBox(bx0); }
      else if (dropT <= BOX_WARN) showBoxWarn(`📦 Caja sorpresa ${boxDrops + 1} de ${BOX_MAX} en el centro en ${Math.ceil(dropT)}…`);
      else showBoxWarn('');
    } else if (!bx0.active) showBoxWarn('');
    for (const bx of boxes) {
      if (!bx.active) continue;
      bx.spin += dt;
      bx.mesh.position.set(bx.pos.x, 1.1 + Math.sin(bx.spin * 2.5) * 0.2, bx.pos.z);
      bx.mesh.rotation.y = bx.spin * 1.4;
      for (const s of soldiers) {
        if (!s.alive || Math.hypot(s.pos.x - bx.pos.x, s.pos.z - bx.pos.z) > 1.5 || Math.abs(s.pos.y - bx.pos.y) > 2) continue;
        givePower(s, pick(Object.keys(POWERS)));
        bx.active = false; dropT = BOX_GAP; bx.mesh.setEnabled(false);
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
  // Batalla campal: armas tiradas en el piso (se agarran solas al pasar por encima)
  // ------------------------------------------------------------------
  const PICKUP_KINDS = ['rifle', 'shotgun', 'dart', 'rifle', 'shotgun', 'nades'];
  const PICKUP_GAP = 22, PICKUP_COUNT = { plaza: 60, casa: 55, barrio: 70 };
  const pickups = [], pickupMasters = {};
  function clearPickups() { pickups.forEach((p) => { p.mesh.dispose(); p.ring.dispose(); }); pickups.length = 0; }
  function pickupSpot() {
    for (let i = 0; i < 40; i++) {
      const q = curMap.nav.randomPoint();
      if (pickups.some((o) => o.active && Math.hypot(o.pos.x - q.x, o.pos.z - q.z) < 7)) continue;
      if (i < 30 && soldiers.some((o) => o.alive && Math.hypot(o.pos.x - q.x, o.pos.z - q.z) < 6)) continue;
      return q;
    }
    return curMap.nav.randomPoint();
  }
  function placePickup(p, kind, pos) {
    if (p.mesh) p.mesh.dispose();
    p.kind = kind; p.pos.set(pos.x, pos.y, pos.z); p.active = true;
    p.mesh = pickupMasters[kind].createInstance('pk'); p.mesh.scaling.setAll(kind === 'nades' ? 3 : 2.4); p.ring.setEnabled(true);
    p.ring.position.set(pos.x, pos.y + 0.06, pos.z);
  }
  function spawnPickup(kind, pos, temp = false) {
    const p = { pos: new V3(), mesh: null, ring: pickupMasters.ring.createInstance('pkr'), spin: rand(0, 6), active: false, respawnT: 0, temp };
    placePickup(p, kind, pos);
    pickups.push(p);
    return p;
  }
  function setupPickups() {
    clearPickups();
    if (mode !== 'ffa') return;
    const n = PICKUP_COUNT[curMap.id] || 16;
    for (let i = 0; i < n; i++) spawnPickup(i < 3 ? WEAPONS[i].id : pick(PICKUP_KINDS), pickupSpot());
  }
  const gunDef = (id) => ALL_GUNS.find((w) => w.id === id);
  function wantsPickup(s, p) {
    if (s === P) return true;
    if (p.kind === 'nades') return (s.nades || 0) < 3;
    return s.wdef === PISTOL;
  }
  function takePickup(s, p) {
    if (p.kind === 'nades') {
      s.nades = (s.nades || 0) + 2;
      if (s === P) { showBanner('● +2 CANICAS'); updateHud(true); }
    } else {
      const def = gunDef(p.kind);
      if (s === P) {
        let i = P.weapons.findIndex((w) => w.def === def);
        if (i < 0) { P.weapons.push({ def, ammo: def.mag }); i = P.weapons.length - 1; buildSlots(); showBanner('¡AGARRASTE ' + def.name.toUpperCase() + '!'); }
        else { P.weapons[i].ammo = def.mag; showBanner('+ BALAS · ' + def.name); }
        if (i !== P.wi) switchWeapon(i); else updateHud(true);
      } else { s.wdef = def; s.ammo = def.mag; s.reloadT = 0; s.route = null; }
    }
    sfx(s === P ? 'reload' : 'clink', s === P ? 1 : volAt(p.pos));
  }
  function updatePickups(dt) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (!p.active) {
        if (p.temp) { p.mesh.dispose(); p.ring.dispose(); pickups.splice(i, 1); continue; }
        p.respawnT -= dt;
        if (p.respawnT <= 0) placePickup(p, pick(PICKUP_KINDS), pickupSpot());
        continue;
      }
      p.spin += dt;
      p.mesh.position.set(p.pos.x, p.pos.y + 0.9 + Math.sin(p.spin * 2.5) * 0.15, p.pos.z);
      p.mesh.rotation.y = p.spin * 1.6;
      for (const s of soldiers) {
        if (!s.alive || Math.hypot(s.pos.x - p.pos.x, s.pos.z - p.pos.z) > 1.3 || Math.abs(s.pos.y - p.pos.y) > 1.6 || !wantsPickup(s, p)) continue;
        takePickup(s, p);
        p.active = false; p.respawnT = PICKUP_GAP; p.mesh.setEnabled(false); p.ring.setEnabled(false);
        break;
      }
    }
  }
  // La pickup de arma más cercana (para los bots que todavía tienen la pistolita)
  function nearPickup(b, maxD, gunsOnly) {
    let best = null, bd = maxD;
    for (const p of pickups) {
      if (!p.active || (gunsOnly && p.kind === 'nades') || !inZone(p.pos.x, p.pos.z, 2)) continue;
      const d = Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) + Math.abs(p.pos.y - b.pos.y) * 3;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  const aliveCount = () => soldiers.reduce((n, s) => n + (s.alive ? 1 : 0), 0);
  const teamAlive = (t) => soldiers.some((s) => s.alive && s.team === t);
  const teamsAlive = () => new Set(soldiers.filter((s) => s.alive).map((s) => s.team)).size;
  const teamCount = () => new Set(soldiers.map((s) => s.team)).size;

  // ------------------------------------------------------------------
  // Dúos: si te eliminan queda tu chapita; si tu compañero pasa por arriba, volvés cayendo del cielo con 50 de vida (una vez)
  // ------------------------------------------------------------------
  const tags = [];
  let tagMaster = null;
  function clearTags() { tags.forEach((t) => { t.mesh.dispose(); t.ring.dispose(); }); tags.length = 0; }
  function dropTag(s) {
    if (!tagMaster) {
      tagMaster = BABYLON.MeshBuilder.CreateCylinder('tag', { diameter: 0.9, height: 0.14, tessellation: 20 }, scene);
      tagMaster.rotation.x = Math.PI / 2; tagMaster.bakeCurrentTransformIntoVertices();
      tagMaster.material = mat('#e9ecef', { spec: 1, power: 64, emissive: '#5c6770' }); tagMaster.position.y = -999;
    }
    const mesh = tagMaster.createInstance('tagI'), ring = pickupMasters.ring.createInstance('tagR');
    ring.position.set(s.pos.x, s.pos.y + 0.06, s.pos.z);
    tags.push({ owner: s, pos: s.pos.clone(), mesh, ring, spin: 0, active: true });
  }
  function removeTag(owner) {
    for (let i = tags.length - 1; i >= 0; i--) if (tags[i].owner === owner) { tags[i].active = false; tags[i].mesh.dispose(); tags[i].ring.dispose(); tags.splice(i, 1); }
  }
  const tagOf = (s) => tags.find((t) => t.owner === s) || null;
  function updateTags(dt) {
    for (const t of tags.slice()) {
      t.spin += dt;
      t.mesh.position.set(t.pos.x, t.pos.y + 1.0 + Math.sin(t.spin * 3) * 0.15, t.pos.z); t.mesh.rotation.y = t.spin * 2.4;
      const m = mateOf(t.owner);
      if (!m || !m.alive) continue;
      if (Math.hypot(m.pos.x - t.pos.x, m.pos.z - t.pos.z) < 1.5 && Math.abs(m.pos.y - t.pos.y) < 1.8) { removeTag(t.owner); revive(t.owner, m); }
    }
  }
  function revive(s, mate) {
    const nav = curMap.nav;
    let spot = null;
    for (let i = 0; i < 25 && !spot; i++) {
      const a = rand(0, Math.PI * 2), d = rand(4, 12), q = nav.pointNear(mate.pos.x + Math.cos(a) * d, mate.pos.y, mate.pos.z + Math.sin(a) * d);
      if (q && Math.abs(q.y - mate.pos.y) < 1 && inZone(q.x, q.z, 0)) spot = q;
    }
    if (!spot) spot = { x: mate.pos.x, y: mate.pos.y, z: mate.pos.z };
    if (s === P) { P.weapons = [{ def: PISTOL, ammo: PISTOL.mag }]; P.wi = 0; buildSlots(); }
    respawn(s);
    s.revives = 0; s.hp = 50; s.spawnProt = 2;
    let y = spot.y + 0.05;
    const hi = { pos: new V3(spot.x, spot.y + 18, spot.z), r: 0.5, h: H };
    if (!collidesAny(hi) && segWorld(new V3(spot.x, spot.y + 2, spot.z), new V3(0, 18, 0)) >= 1) y = spot.y + 18;
    s.pos.set(spot.x, y, spot.z); s.vel.setAll(0);
    if (s.isBot) s.mesh.position.copyFrom(s.pos);
    confetti(new V3(spot.x, spot.y + 2, spot.z), 1.2); sfx('win');
    addNote(s, 'volvió cayendo del cielo 🪂');
    if (s === P) { showBanner('🪂 ¡TU COMPAÑERO TE REVIVIÓ! 50 de vida'); showMsg(''); updateHud(true); }
    else if (mate === P) showBanner('🪂 ¡REVIVISTE A ' + s.name.toUpperCase() + '!');
  }

  // ------------------------------------------------------------------
  // Tormenta: el lugar seguro es un círculo que se achica. Afuera se pierde 1 de vida en cada golpe.
  // ------------------------------------------------------------------
  // [espera, segundos achicándose, radio final (parte del inicial), segundos entre golpes]
  const STORM_PHASES = [[50, 40, 0.6, 0.6], [35, 35, 0.34, 0.45], [30, 30, 0.17, 0.35], [25, 25, 0.07, 0.25], [20, 20, 0, 0.15]];
  const storm = { on: false, cx: 0, cz: 0, r: 1e9, toX: 0, toZ: 0, toR: 1e9, fx: 0, fz: 0, fr: 0, phase: 0, t: 0, shrinking: false, hitT: 0, R0: 100 };
  let stormWall = null, stormNext = null;
  function inZone(x, z, m = 0) { return !storm.on || Math.hypot(x - storm.toX, z - storm.toZ) < storm.toR - m; }
  const inStorm = (s) => storm.on && Math.hypot(s.pos.x - storm.cx, s.pos.z - storm.cz) > storm.r;
  function stormPlan() {
    const ph = STORM_PHASES[storm.phase], toR = ph[2] * storm.R0, slack = Math.max(0, storm.r - toR);
    let c = null;
    for (let i = 0; i < 80 && !c; i++) { const q = curMap.nav.randomPoint(); if (Math.hypot(q.x - storm.cx, q.z - storm.cz) <= slack * 0.9) c = q; }
    storm.toX = c ? c.x : storm.cx; storm.toZ = c ? c.z : storm.cz; storm.toR = toR;
  }
  function stormInit() {
    storm.on = mode === 'ffa';
    if (!stormWall) {
      stormWall = BABYLON.MeshBuilder.CreateCylinder('storm', { diameter: 2, height: 160, tessellation: 72, cap: BABYLON.Mesh.NO_CAP }, scene);
      const m = new BABYLON.StandardMaterial('stormM', scene);
      m.diffuseColor = C3.FromHexString('#9d4edd'); m.emissiveColor = C3.FromHexString('#7b2cbf'); m.alpha = 0.3; m.backFaceCulling = false; m.fogEnabled = false;
      stormWall.material = m; stormWall.isPickable = false;
      stormNext = BABYLON.MeshBuilder.CreateCylinder('stormNext', { diameter: 2, height: 0.5, tessellation: 72, cap: BABYLON.Mesh.NO_CAP }, scene);
      const n = new BABYLON.StandardMaterial('stormN', scene); n.emissiveColor = C3.White(); n.disableLighting = true; n.alpha = 0.7; n.backFaceCulling = false;
      stormNext.material = n;
    }
    stormWall.setEnabled(storm.on); stormNext.setEnabled(storm.on);
    if (!storm.on) { storm.r = storm.toR = 1e9; return; }
    const b = curMap.bounds;
    storm.R0 = Math.hypot(b[2] - b[0], b[3] - b[1]) / 2 + 4;
    storm.cx = (b[0] + b[2]) / 2; storm.cz = (b[1] + b[3]) / 2; storm.r = storm.R0;
    storm.phase = 0; storm.shrinking = false; storm.t = STORM_PHASES[0][0]; storm.hitT = 0;
    stormPlan();
  }
  function updateStorm(dt) {
    if (!storm.on) return;
    storm.t -= dt;
    const ph = STORM_PHASES[storm.phase];
    if (ph && !storm.shrinking && storm.t <= 0) {
      storm.shrinking = true; storm.t = ph[1]; storm.fx = storm.cx; storm.fz = storm.cz; storm.fr = storm.r;
      showBanner('🌪 ¡LA TORMENTA SE ESTÁ CERRANDO!');
    } else if (ph && storm.shrinking) {
      const k = clamp(1 - storm.t / ph[1], 0, 1);
      storm.cx = storm.fx + (storm.toX - storm.fx) * k; storm.cz = storm.fz + (storm.toZ - storm.fz) * k; storm.r = storm.fr + (storm.toR - storm.fr) * k;
      if (storm.t <= 0) {
        storm.shrinking = false; storm.phase++;
        if (STORM_PHASES[storm.phase]) { storm.t = STORM_PHASES[storm.phase][0]; stormPlan(); } else storm.t = Infinity;
      }
    }
    // golpes de la tormenta
    storm.hitT -= dt;
    if (storm.hitT <= 0) {
      storm.hitT = (STORM_PHASES[storm.phase] || STORM_PHASES[STORM_PHASES.length - 1])[3];
      for (const s of soldiers) {
        if (!s.alive || !inStorm(s)) continue;
        s.hp -= 1; s.lastHurtT = gameTime;
        if (s === P) { dmgFlash = Math.min(1, dmgFlash + 0.12); updateHud(); }
        if (s.hp <= 0) kill(s, null, 'storm');
      }
    }
    stormWall.position.set(storm.cx, 40, storm.cz); stormWall.scaling.set(Math.max(0.1, storm.r), 1, Math.max(0.1, storm.r));
    const showNext = storm.toR < storm.r - 0.5;
    stormNext.setEnabled(showNext);
    if (showNext) { stormNext.position.set(storm.toX, 0.3, storm.toZ); stormNext.scaling.set(Math.max(0.1, storm.toR), 1, Math.max(0.1, storm.toR)); }
    hud.stormfx.classList.toggle('on', P.alive && inStorm(P));
    const txt = !STORM_PHASES[storm.phase] ? '🌪 Zona final' : storm.shrinking ? '🌪 La tormenta se cierra… ' + Math.ceil(storm.t) + ' s' : '🌪 La tormenta se mueve en ' + Math.ceil(storm.t) + ' s';
    if (hud.storm.textContent !== txt) hud.storm.textContent = txt;
  }

  // ------------------------------------------------------------------
  // Mapa chico (abajo a la izquierda)
  // ------------------------------------------------------------------
  const mini = $('minimap'), miniCtx = mini.getContext('2d');
  let miniT = 0;
  function miniBg(m) {
    if (m.miniBg) return m.miniBg;
    const c = document.createElement('canvas'); c.width = c.height = 200;
    const g = c.getContext('2d'), [x0, z0, x1, z1] = m.bounds, sx = 200 / (x1 - x0), sz = 200 / (z1 - z0);
    g.fillStyle = '#6cc04a'; g.fillRect(0, 0, 200, 200);
    for (const k of m.nav.main) { const n = m.nav.nodes[k]; if (n.y < 0.2) continue; g.fillStyle = n.y > 4 ? '#ffe8c2' : '#d9c7a7'; g.fillRect((n.x - x0) * sx - 1, (z1 - n.z) * sz - 1, 2.4, 2.4); }
    g.fillStyle = '#3d405b';
    for (const cl of m.colliders) {
      const h = cl.max.y - cl.min.y;
      if (h < 1.8 || cl.max.y > 30 || cl.max.x - cl.min.x > 150) continue;
      g.fillRect((cl.min.x - x0) * sx, (z1 - cl.max.z) * sz, Math.max(1, (cl.max.x - cl.min.x) * sx), Math.max(1, (cl.max.z - cl.min.z) * sz));
    }
    m.miniBg = c;
    return c;
  }
  function drawMinimap(dt) {
    const show = mode === 'ffa' && state !== 'menu';
    mini.classList.toggle('hidden', !show);
    if (!show || (miniT -= dt) > 0) return;
    miniT = 0.1;
    const m = curMap, [x0, z0, x1, z1] = m.bounds, sx = 200 / (x1 - x0), sz = 200 / (z1 - z0);
    const X = (x) => (x - x0) * sx, Y = (z) => (z1 - z) * sz;
    const g = miniCtx;
    g.drawImage(miniBg(m), 0, 0);
    if (storm.on) {
      g.save(); g.beginPath(); g.rect(0, 0, 200, 200); g.arc(X(storm.cx), Y(storm.cz), storm.r * sx, 0, Math.PI * 2, true);
      g.fillStyle = 'rgba(123,44,191,0.5)'; g.fill(); g.restore();
      g.lineWidth = 2; g.strokeStyle = '#c77dff'; g.beginPath(); g.arc(X(storm.cx), Y(storm.cz), storm.r * sx, 0, Math.PI * 2); g.stroke();
      if (storm.toR < storm.r - 0.5) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.setLineDash([4, 3]); g.beginPath(); g.arc(X(storm.toX), Y(storm.toZ), Math.max(1, storm.toR * sx), 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    }
    for (const t of tags) if (t.owner === P || t.owner === mateOf(P)) { g.fillStyle = '#e9ecef'; g.fillRect(X(t.pos.x) - 3, Y(t.pos.z) - 3, 6, 6); }
    const mate = mateOf(P);
    if (mate && mate.alive) { g.fillStyle = '#8ec5ff'; g.strokeStyle = '#1d3557'; g.lineWidth = 1.5; g.beginPath(); g.arc(X(mate.pos.x), Y(mate.pos.z), 4.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
    if (P.alive || P.waiting) {
      g.save(); g.translate(X(P.pos.x), Y(P.pos.z)); g.rotate(P.yaw);
      g.fillStyle = P.alive ? '#ffd23f' : '#adb5bd'; g.strokeStyle = '#2b2d42'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, -8); g.lineTo(5.5, 6); g.lineTo(0, 3); g.lineTo(-5.5, 6); g.closePath(); g.fill(); g.stroke(); g.restore();
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
    if (attacker && attacker.team !== t.team) { if (mode === 'teams') score[attacker.team]++; attacker.kills++; }
    addFeed(attacker, t, how, head);
    const ffa = mode === 'ffa';
    if (t === P) {
      P.deathT = 3;
      killerName = attacker && attacker !== P ? attacker.name : how === 'storm' ? 'la tormenta' : null;
    } else {
      t.deathT = 0; t.respawnT = ffa ? Infinity : 4.5; // en la Batalla campal no se vuelve
      if (t.marker) t.marker.setEnabled(false);
      if (ffa && t.wdef !== PISTOL) spawnPickup(t.wdef.id, t.pos, true); // suelta su arma
    }
    if (ffa) {
      const m = mateOf(t);
      if (m && m.alive && t.revives > 0) dropTag(t); // su compañero puede revivirlo
      if (m && !m.alive) removeTag(m); // el compañero que esperaba ya no puede volver
      P.waiting = !P.alive && !!tagOf(P);
      if (!P.alive && !teamAlive(P.team) && P.outT == null) { P.place = teamsAlive() + 1; P.outT = 2.6; }
    }
    if (attacker === P && t !== P) { sfx('kill'); showBanner(head ? '¡TIRO A LA CABEZA! +1' : '¡ELIMINADO! +1'); }
    updateHud(true);
    if (state === 'playing' && mode === 'teams' && score.some((v) => v >= WIN_SCORE)) endMatch();
    if (state === 'playing' && ffa && teamAlive(P.team) && teamsAlive() <= 1) endMatch();
  }
  let killerName = null;

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------
  const hud = { score: $('score'), hpfill: $('hpfill'), hptext: $('hptext'), wname: $('wname'), ammo: $('ammo'), nades: $('nades'), slots: $('slots'), msg: $('msg'), dmg: $('dmg'), cross: $('crosshair'), hit: $('hitmarker'), banner: $('banner'), feed: $('killfeed'), item: $('item'), shield: $('shieldfx'), storm: $('stormInfo'), stormfx: $('stormfx') };
  let dmgFlash = 0, hitT = 0, bannerT = 0, lastHudKey = '';
  // marcador: los 4 equipos, o en la Batalla campal cuántos quedan y tus eliminaciones
  let scoreEls = [];
  function setupScoreHud() {
    $('stormInfo').classList.toggle('hidden', mode !== 'ffa');
    if (mode === 'ffa') {
      hud.score.innerHTML = `<span class="team">QUEDAN <b id="ffaLeft">0</b></span><span class="team" style="color:#ffd23f">ELIMINACIONES <b id="ffaKills">0</b></span><span class="goal ffa">${curMap.name} · ${duo ? 'Dúos' : 'Solo'}</span>`;
      scoreEls = [];
    } else {
      hud.score.innerHTML = TEAM_NAME.map((n, t) => `<span class="team" style="color:${TEAM_LIGHT[t]}">${n.toUpperCase()} <b id="sc${t}">0</b></span>`).join('') + `<span class="goal">Meta: ${WIN_SCORE}</span>`;
      scoreEls = TEAM_NAME.map((n, t) => $('sc' + t));
    }
  }
  setupScoreHud();
  buildSlots();
  function buildSlots() {
    hud.slots.innerHTML = '';
    P.weapons.forEach((w, i) => { const s = document.createElement('span'); s.textContent = (i + 1) + ' ' + w.def.name.split(' ')[0]; hud.slots.appendChild(s); });
  }
  function updateHud(force) {
    const w = P.weapons[P.wi];
    const left = mode === 'ffa' ? aliveCount() : 0;
    const key = [score.join(','), left, P.kills, Math.ceil(P.hp), P.wi, w.ammo, P.nades, P.reloadT > 0, P.item, Math.ceil(P.shieldT || 0), P.weapons.length].join('|');
    if (!force && key === lastHudKey) return;
    lastHudKey = key;
    if (mode === 'ffa') { $('ffaLeft').textContent = left; $('ffaKills').textContent = P.kills; }
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
    const icon = { rifle: '•', shotgun: '▮', dart: '➶', pistol: '·', nade: '●', mega: '💣', fall: '↓' }[how] || '•';
    const div = document.createElement('div');
    if (how === 'storm') div.innerHTML = `${nameTag(vic)} 🌪 no aguantó la tormenta`;
    else if (!att || att === vic) div.innerHTML = `${nameTag(vic)} se cayó al pasto`;
    else div.innerHTML = `${nameTag(att)} ${icon}${head ? '✪' : ''} ${nameTag(vic)}`;
    if (mode === 'ffa' && state === 'playing') div.innerHTML += ` <small>· quedan ${aliveCount()}</small>`;
    pushFeed(div);
  }
  function nameTag(s) {
    if (s === P) return `<span class="me">${s.name}</span>`;
    if (mode === 'ffa') return `<span style="color:${s.hex};font-weight:700">${s.name}${s === mateOf(P) ? ' (compañero)' : ''}</span>`;
    return `<span class="t${s.team}">${s.name}</span>`;
  }
  function pushFeed(div) {
    hud.feed.prepend(div);
    while (hud.feed.children.length > 5) hud.feed.lastChild.remove();
    setTimeout(() => div.remove(), 5000);
  }
  function addNote(s, text) {
    const div = document.createElement('div');
    div.innerHTML = `${nameTag(s)} ${text}`;
    pushFeed(div);
  }

  // ------------------------------------------------------------------
  // Arma en primera persona (viewmodel)
  // ------------------------------------------------------------------
  const vmRoot = new BABYLON.TransformNode('vmRoot', scene);
  vmRoot.parent = camera;
  vmRoot.scaling.setAll(0.6);
  const vms = [];
  // Piezas de cada arma (se usan para el arma en la mano y para las armas tiradas en el piso)
  function gunMesh(id) {
    const part = (shape, o, hex, x, y, z, rx = 0) => {
      const m = shape === 'box' ? BABYLON.MeshBuilder.CreateBox('v', o, scene) : shape === 'cyl' ? BABYLON.MeshBuilder.CreateCylinder('v', Object.assign({ tessellation: 14 }, o), scene) : BABYLON.MeshBuilder.CreateSphere('v', Object.assign({ segments: 10 }, o), scene);
      m.position.set(x, y, z); m.rotation.x = rx; m.material = plastic(hex); return m;
    };
    const R = Math.PI / 2;
    const parts = {
      rifle: () => [ // rifle de bolitas
        part('box', { width: 0.11, height: 0.13, depth: 0.55 }, '#ff9f1c', 0, 0, 0),
        part('cyl', { diameter: 0.05, height: 0.35 }, '#495057', 0, 0.02, 0.42, R),
        part('sph', { diameter: 0.17 }, '#ffd23f', 0, 0.12, -0.02),
        part('box', { width: 0.08, height: 0.16, depth: 0.08 }, '#e85d04', 0, -0.12, -0.1),
        part('box', { width: 0.09, height: 0.1, depth: 0.22 }, '#e85d04', 0, -0.02, -0.36)
      ],
      shotgun: () => [ // escopeta de corchos
        part('box', { width: 0.16, height: 0.11, depth: 0.38 }, '#8d5524', 0, -0.02, -0.08),
        part('cyl', { diameter: 0.075, height: 0.55 }, '#d4a373', -0.04, 0.03, 0.3, R),
        part('cyl', { diameter: 0.075, height: 0.55 }, '#d4a373', 0.04, 0.03, 0.3, R),
        part('cyl', { diameter: 0.06, height: 0.06 }, '#f3d5b5', -0.04, 0.03, 0.59, R),
        part('cyl', { diameter: 0.06, height: 0.06 }, '#f3d5b5', 0.04, 0.03, 0.59, R),
        part('box', { width: 0.08, height: 0.15, depth: 0.08 }, '#6f4518', 0, -0.13, -0.12)
      ],
      dart: () => [ // lanzadardos
        part('box', { width: 0.12, height: 0.16, depth: 0.45 }, '#8338ec', 0, 0, 0),
        part('cyl', { diameter: 0.07, height: 0.4 }, '#fb5607', 0, 0.03, 0.38, R),
        part('cyl', { diameter: 0.035, height: 0.12 }, '#9ef01a', 0, 0.03, 0.62, R),
        part('box', { width: 0.04, height: 0.06, depth: 0.16 }, '#212529', 0, 0.12, 0.02),
        part('box', { width: 0.08, height: 0.16, depth: 0.08 }, '#5a189a', 0, -0.13, -0.08)
      ],
      pistol: () => [ // pistolita de bolitas
        part('box', { width: 0.09, height: 0.12, depth: 0.3 }, '#06d6a0', 0, 0, 0.06),
        part('cyl', { diameter: 0.045, height: 0.16 }, '#495057', 0, 0.02, 0.27, R),
        part('sph', { diameter: 0.08 }, '#ffd23f', 0, 0.08, 0),
        part('box', { width: 0.07, height: 0.17, depth: 0.08 }, '#05a77c', 0, -0.12, -0.04)
      ],
      nades: () => [ // bolsita de canicas
        part('sph', { diameter: 0.2 }, '#5ec8ff', -0.1, 0, 0), part('sph', { diameter: 0.2 }, '#ff70a6', 0.1, 0, 0), part('sph', { diameter: 0.2 }, '#9ef01a', 0, 0.15, 0)
      ]
    }[id]();
    return BABYLON.Mesh.MergeMeshes(parts, true, true, undefined, false, true);
  }
  function buildViewmodels() {
    for (const w of ALL_GUNS) {
      const m = gunMesh(w.id);
      m.parent = vmRoot; m.renderingGroupId = 1; m.setEnabled(false); m.wid = w.id;
      vms.push(m);
    }
    // armas para tirar en el piso (más grandes) y el aro brillante que las marca
    for (const id of ['rifle', 'shotgun', 'dart', 'nades']) {
      const m = gunMesh(id); m.scaling.setAll(id === 'nades' ? 3 : 2.4); m.position.y = -999; addCaster(m);
      pickupMasters[id] = m;
    }
    const ring = BABYLON.MeshBuilder.CreateTorus('pkRing', { diameter: 1.7, thickness: 0.14, tessellation: 28 }, scene);
    ring.material = mat('#fff3b0', { emissive: '#ffd23f' }); ring.position.y = -999;
    pickupMasters.ring = ring;
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
    if (e.code === 'KeyQ') switchWeapon((P.wi + 1) % P.weapons.length);
    const dn = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (dn >= 0) switchWeapon(dn);
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
      const s = SENS * cfg.sens * (aimDown && curDef().zoom ? 0.4 : aimDown ? 0.75 : 1);
      P.yaw += e.movementX * s; P.pitch = clamp(P.pitch + e.movementY * s, -1.45, 1.45);
    }
  });
  addEventListener('wheel', (e) => { if (state === 'playing') switchWeapon((P.wi + (e.deltaY > 0 ? 1 : P.weapons.length - 1)) % P.weapons.length); }, { passive: true });

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
  tbtn('bSwap', () => switchWeapon((P.wi + 1) % P.weapons.length));
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
  const curDef = () => P.weapons[P.wi].def;
  const forwardVec = () => new V3(Math.sin(P.yaw) * Math.cos(P.pitch), -Math.sin(P.pitch), Math.cos(P.yaw) * Math.cos(P.pitch));
  function switchWeapon(i) {
    if (i === P.wi || !P.alive || i >= P.weapons.length) return;
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
    if (!P.alive && mode === 'ffa') {
      if (P.outT != null) {
        P.outT -= dt;
        showMsg((killerName ? '¡Te eliminó ' + killerName + '!' : '¡Quedaste fuera!') + '\nPuesto ' + P.place + 'º de ' + teamCount());
        if (P.outT <= 0) { P.outT = null; endMatch(); }
      } else showMsg(P.waiting ? 'Tu compañero puede revivirte:\ntiene que pasar por arriba de tu chapita' : 'Tu compañero sigue peleando…');
      return;
    }
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
        const zoom = aimDown && curDef().zoom ? 0.4 : 1;
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
    const def = curDef();
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
    // Batalla campal: al principio están ocupados juntando armas y solo pelean de cerca
    let best = null, bestD = mode === 'ffa' ? (gameTime < 30 ? 16 : 45) : 70;
    for (const s of soldiers) {
      if (!s.alive || s.team === b.team) continue;
      const dx = s.pos.x - b.pos.x, dz = s.pos.z - b.pos.z, d = Math.hypot(dx, dz);
      if (d > bestD && !(b.alertT > 0 && b.alertFrom === s && d < 70)) continue;
      const inFov = Math.abs(angDiff(b.yaw, Math.atan2(dx, dz))) < 1.3 || d < 7 || (b.alertT > 0 && b.alertFrom === s);
      if (!inFov) continue;
      if (!canSee(eye, chestOf(s)) && !canSee(eye, eyeOf(s))) continue;
      best = s; bestD = d;
    }
    return best;
  }
  // Adónde va un bot cuando no ve enemigos: al círculo, a una base enemiga, a un cruce o a cuidar la suya
  function goalCandidate(b) {
    if (mode === 'ffa') return curMap.nav.randomPoint();
    const r = Math.random();
    if (r < 0.25) { const a = rand(0, Math.PI * 2), d = rand(4, CIRCLE_R - 3); return { x: Math.cos(a) * d, z: Math.sin(a) * d }; }
    if (r < 0.5) { // una base enemiga (nunca la propia)
      const t = pick([0, 1, 2, 3].filter((k) => k !== b.team)), c = baseCenter(t);
      return { x: c.x + rand(-(TABLE_HALF - 3), TABLE_HALF - 3), z: c.z + rand(-(TABLE_HALF - 3), TABLE_HALF - 3) };
    }
    if (r < 0.7) { const [kx, kz] = pick(CORN); return { x: kx * BASE_D + rand(-3, 3), z: kz * BASE_D + rand(-3, 3) }; }
    // un punto de algún puente
    const rr = pick(BRIDGE_REGIONS).rect, alongX = rr[2] - rr[0] > rr[3] - rr[1];
    const cx = (rr[0] + rr[2]) / 2, cz = (rr[1] + rr[3]) / 2;
    return alongX ? { x: rand(rr[0] + 3, rr[2] - 3), z: cz + rand(-0.8, 0.8) } : { x: cx + rand(-0.8, 0.8), z: rand(rr[1] + 3, rr[3] - 3) };
  }
  // Adónde va un bot cuando no ve enemigos: prueba varios lugares y elige el que tenga menos compañeros cerca
  // (así el equipo se reparte por el mapa en vez de ir todos juntos o quedarse en la base)
  // Batalla campal: si solo tiene la pistolita busca un arma; si no, sale a cazar o recorre el mapa
  // un lugar al azar dentro de la zona segura (el más cerca de varios que prueba)
  function zonePoint(b) {
    let best = null, bd = Infinity;
    for (let i = 0, ok = 0; i < 60 && ok < 10; i++) {
      const q = curMap.nav.randomPoint();
      if (!inZone(q.x, q.z, 3)) continue;
      ok++;
      const d = Math.hypot(q.x - b.pos.x, q.z - b.pos.z);
      if (d < bd) { bd = d; best = q; }
    }
    return best || curMap.nav.pointNear(storm.toX, 0, storm.toZ) || curMap.nav.randomPoint();
  }
  function ffaGoal(b) {
    const m = mateOf(b);
    if (m && m.alive && Math.hypot(m.pos.x - b.pos.x, m.pos.z - b.pos.z) > 22 && Math.random() < 0.6) {
      const q = curMap.nav.pointNear(m.pos.x + rand(-5, 5), m.pos.y, m.pos.z + rand(-5, 5)); if (q) return q;
    }
    if (b.wdef === PISTOL) { const pk = nearPickup(b, 90, true); if (pk) return { x: pk.pos.x, y: pk.pos.y, z: pk.pos.z }; }
    if ((b.nades || 0) === 0 && Math.random() < 0.25) { const pk = nearPickup(b, 30, false); if (pk && pk.kind === 'nades') return { x: pk.pos.x, y: pk.pos.y, z: pk.pos.z }; }
    if (Math.random() < (aliveCount() <= 5 ? 0.75 : 0.35)) { // cuando quedan pocos, salen a buscarse
      let best = null, bd = Infinity;
      for (const s of soldiers) { if (s === b || !s.alive) continue; const d = Math.hypot(s.pos.x - b.pos.x, s.pos.z - b.pos.z) + Math.abs(s.pos.y - b.pos.y) * 4; if (d < bd) { bd = d; best = s; } }
      if (best && inZone(best.pos.x, best.pos.z, 0)) return { x: best.pos.x, y: best.pos.y, z: best.pos.z };
    }
    return storm.on ? zonePoint(b) : curMap.nav.randomPoint();
  }
  const goalOk = (g) => mode === 'ffa' || (walkable(g.x, g.z, 0.6) && freeSpot(g.x, g.z));
  function pickGoal(b) {
    if (mode === 'ffa') { b.goal = ffaGoal(b); return b.goal; }
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
  function inBase(b) { if (mode !== 'teams') return false; const h = baseCenter(b.team); return Math.abs(b.pos.x - h.x) < TABLE_HALF && Math.abs(b.pos.z - h.z) < TABLE_HALF; }
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
    if (mode === 'ffa') return curMap.nav.route(b.pos.x, b.pos.y, b.pos.z, goal.x, goal.y ?? b.pos.y, goal.z);
    return findRoute(b.pos.x, b.pos.z, goal.x, goal.z);
  }
  // Freno de seguridad: los bots no caminan hacia el borde de una mesa o un puente
  function safeMove(b, mx, mz) {
    if (!mx && !mz) return [0, 0];
    if (mode !== 'teams') return [mx, mz]; // en la Plaza y la Casa no hay vacío al que caerse
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
        for (let i = 0; i < 4; i++) { const g = goalCandidate(b); const d = Math.hypot(g.x - t.pos.x, g.z - t.pos.z); if (d > fd && goalOk(g)) { fd = d; far = g; } }
        const r = far && planRoute(b, far);
        if (r) { b.route = r; b.retreatT = 3.5; }
      }
      // ¿hay una caja sorpresa cerca? a veces va a buscarla
      const bx = b.retreatT <= 0 && nearBox(b, t ? 14 : 60);
      if (bx && b.boxCd <= 0 && (!b.boxGoal || b.boxGoal !== bx)) {
        b.boxCd = 2.5;
        if (Math.random() < (t ? 0.35 : 0.7)) { const r = planRoute(b, bx.pos); if (r) { b.route = r; b.boxGoal = bx; } }
      }
      if (b.boxGoal && !b.boxGoal.active) b.boxGoal = null;
      // dúos: ir a buscar la chapita del compañero para revivirlo
      const mt = mateOf(b), tg = mt && !mt.alive && tagOf(mt);
      if (tg && b.boxGoal !== tg && b.boxCd <= 0) { b.boxCd = 1.5; const r = planRoute(b, tg.pos); if (r) { b.route = r; b.boxGoal = tg; } }
      // tormenta: si está afuera de la zona (o se viene), va hacia adentro
      b.zoneCd = (b.zoneCd || 0) - 0.25;
      if (storm.on && b.zoneCd <= 0 && !inZone(b.pos.x, b.pos.z, 2) && (storm.shrinking || storm.t < 22 || inStorm(b)) && !(b.boxGoal && b.boxGoal.zone)) {
        b.zoneCd = 3; const r = planRoute(b, zonePoint(b)); if (r) { b.route = r; b.boxGoal = { active: true, zone: true }; }
      }
      if (b.boxGoal && b.boxGoal.zone && inZone(b.pos.x, b.pos.z, 4)) b.boxGoal = null;
      if (mode === 'ffa' && b.wdef === PISTOL && b.retreatT <= 0 && b.boxCd <= 0 && !(b.boxGoal && (b.boxGoal.zone || b.boxGoal.owner))) {
        const pk = nearPickup(b, t ? 12 : 40, true);
        b.boxCd = 2;
        if (pk && pk !== b.boxGoal) { const r = planRoute(b, pk.pos); if (r) { b.route = r; b.boxGoal = pk; } }
      }
      // cuando avisan que viene la caja, algunos van hacia el centro
      if (!t && boxWarning() && !b.boxGoal && b.boxCd <= 0 && b.retreatT <= 0) {
        b.boxCd = 3;
        if (Math.random() < 0.4) { const sp = pick(BOX_SPOTS), r = planRoute(b, { x: sp.x * 0.7, z: sp.z * 0.7 }); if (r) b.route = r; }
      }
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
      if (t && b.nadeCd <= 0 && (mode === 'teams' || b.nades > 0) && Math.random() < 0.25) {
        const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z, d = Math.hypot(dx, dz);
        if (d > 7 && d < 24) {
          const T = 0.9 + d / 30, dy = t.pos.y - (b.pos.y + b.h - 0.25);
          throwNade(b, new V3(dx / T + rand(-1, 1), (dy + 0.5 * GRAV * T * T) / T, dz / T + rand(-1, 1)));
          b.nadeCd = rand(10, 18); if (mode === 'ffa') b.nades--;
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
      else if (b.seenT > sk.reaction + (mode === 'ffa' ? 0.3 : 0) && Math.abs(angDiff(b.yaw, desiredYaw)) < 0.25 && gameTime >= b.nextShot && b.spawnProt <= 0) botFire(b, t);
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
    for (let i = 0; i < def.pellets; i++) spawnProjectile(b, def, origin, jitter(err, def.spread), b.skill.dmg * (mode === 'ffa' ? 0.45 : 1));
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
  let camBack = 0;
  const LOBBY_STAGE = { x: 0, y: 0.05, z: 15 }, LOBBY_YAW = Math.PI + 0.35; // quieto, mirando a la cámara
  const thirdPerson = () => cfg.cam === 'third' && state !== 'menu';
  const headPos = () => new V3(P.pos.x, P.pos.y + P.eyeH, P.pos.z);
  let photoCam = null; // solo para sacar fotos de los mapas
  function updateCamera(dt) {
    const mateCam = mode === 'ffa' && !P.alive && state !== 'menu' && mateOf(P);
    if (mateCam && mateCam.alive) { // mirás a tu compañero mientras esperás
      const m = mateCam, head = new V3(m.pos.x, m.pos.y + 1.6, m.pos.z);
      const off = new V3(-Math.sin(m.yaw) * 4.5, 1.6, -Math.cos(m.yaw) * 4.5);
      const t = Math.max(0.15, segWorld(head, off) - 0.08);
      camera.rotationQuaternion = null; camera.fov = 1.0;
      camera.position.set(head.x + off.x * t, head.y + off.y * t, head.z + off.z * t); camera.setTarget(head);
      vms.forEach((v) => v.setEnabled(false)); if (P.mesh) P.mesh.setEnabled(false);
      return;
    }
    if (photoCam) {
      camera.rotationQuaternion = null; camera.fov = photoCam.fov || 0.9;
      camera.position.copyFrom(photoCam.p); camera.setTarget(photoCam.t);
      vms.forEach((v) => v.setEnabled(false)); if (P.mesh) P.mesh.setEnabled(false);
      return;
    }
    if (state === 'menu') {
      // Lobby: tu soldadito quieto en el centro
      const st = LOBBY_STAGE;
      camera.rotationQuaternion = null; camera.fov = 0.8;
      camera.position.set(st.x, st.y + 1.15, st.z - 4.6);
      camera.setTarget(new V3(st.x, st.y + 0.95, st.z));
      vms.forEach((v) => v.setEnabled(false));
      if (P.mesh) {
        P.mesh.setEnabled(true);
        P.mesh.position.set(st.x, st.y, st.z);
        P.mesh.rotation.set(0, LOBBY_YAW, 0); P.mesh.scaling.y = 1;
      }
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
    const def = curDef();
    const fovT = aimDown ? (def.zoom ? 0.5 : 0.95) : 1.15;
    camera.fov += (fovT - camera.fov) * Math.min(1, 12 * dt);
    // arma
    vms.forEach((v) => v.setEnabled(!thirdPerson() && v.wid === def.id && P.alive && !(aimDown && def.zoom && camera.fov < 0.7)));
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
  let chosenClass = CLASSES[cfg.cls] ? cfg.cls : 'fusilero', chosenDiff = DIFFS[cfg.diff] ? cfg.diff : 'normal';
  const choose = (wrap, attr, cb) => wrap.addEventListener('click', (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    [...wrap.children].forEach((b) => b.classList.toggle('sel', b === btn)); cb(btn.dataset[attr]);
  });
  const markSel = (wrap, attr, v) => [...wrap.children].forEach((b) => b.classList.toggle('sel', b.dataset[attr] === v));
  markSel($('classChoices'), 'class', chosenClass); markSel($('diffChoices'), 'diff', chosenDiff);
  choose($('classChoices'), 'class', (v) => { chosenClass = cfg.cls = v; saveCfg(); });
  choose($('diffChoices'), 'diff', (v) => { chosenDiff = cfg.diff = v; saveCfg(); });
  // Pestañas del lobby: Inicio, Tienda, Misiones
  const TAB_IDS = { inicio: 'tabInicio', tienda: 'tabTienda', misiones: 'tabMisiones' };
  function showTab(name) {
    ui.menu.dataset.tab = name;
    [...$('tabs').children].forEach((b) => b.classList.toggle('sel', b.dataset.tab === name));
    for (const k in TAB_IDS) $(TAB_IDS[k]).classList.toggle('hidden', k !== name);
  }
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { initAudio(); sfx('swap'); showTab(b.dataset.tab); } });

  function startMatch() {
    initAudio();
    diff = DIFFS[chosenDiff];
    mode = cfg.mode === 'ffa' ? 'ffa' : 'teams';
    duo = mode === 'ffa' && cfg.squad === 'duo';
    setMap(mode === 'ffa' ? (MAPS[cfg.map] && cfg.map !== 'jardin' ? cfg.map : 'plaza') : 'jardin');
    P.cls = CLASSES[chosenClass]; P.maxHp = P.cls.hp;
    P.weapons = mode === 'ffa' ? [{ def: PISTOL, ammo: PISTOL.mag }] : WEAPONS.map((def) => ({ def, ammo: def.mag }));
    P.wi = 0; buildSlots(); setupScoreHud(); clearPickups();
    createBots();
    score.fill(0);
    projectiles.forEach((p) => giveMesh(p.key, p.mesh)); projectiles.length = 0;
    grenades.forEach((g) => giveMesh(g.key, g.mesh)); grenades.length = 0;
    soldiers.forEach((s) => { s.kills = 0; s.deaths = 0; s.alive = false; s.revives = duo ? 1 : 0; });
    P.place = null; P.outT = null; P.waiting = false; clearTags(); stormInit();
    soldiers.forEach((s) => respawn(s));
    P.wi = 0; P.crouchToggle = false; $('bCrouch').classList.remove('on');
    hud.feed.innerHTML = '';
    resetBoxes();
    setupPickups();
    gameTime = 0; P.nextShot = 0; P.reloadT = 0; lastHudKey = '';
    resume();
    if (mode === 'ffa') showBanner('🪂 ¡A ' + (curMap.id === 'casa' ? 'LA CASA' : curMap.id === 'barrio' ? 'EL BARRIO' : 'LA PLAZA') + '! Agarra armas del piso');
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
    setMap('jardin'); clearPickups(); clearTags(); mode = 'teams'; storm.on = false; if (stormWall) { stormWall.setEnabled(false); stormNext.setEnabled(false); } hud.stormfx.classList.remove('on');
    projectiles.forEach((p) => giveMesh(p.key, p.mesh)); projectiles.length = 0;
    grenades.forEach((g) => giveMesh(g.key, g.mesh)); grenades.length = 0;
    bots.forEach((b) => b.mesh.setEnabled(false));
    showTab('inicio');
    checkRotate();
  }
  function endMatch() {
    state = 'over';
    if (mode === 'ffa') {
      const won = teamAlive(P.team);
      $('overTitle').textContent = won ? (duo ? '¡GANÓ TU DÚO!' : '¡GANASTE LA BATALLA CAMPAL!') : `Quedaste ${P.place}º de ${teamCount()}${duo ? ' dúos' : ''}`;
      $('overTitle').style.color = won ? '#e0a800' : '#3a86ff';
      $('overStats').innerHTML = `Mapa: <b>${curMap.name}</b> · ${duo ? 'Dúos' : 'Solo'} · Tus eliminaciones: <b>${P.kills}</b>` + (won ? (duo ? '<br>¡Tu equipo fue el último en pie!' : '<br>¡Fuiste el último soldadito en pie!') : killerName ? `<br>Te eliminó <b>${killerName}</b>` : '');
      ui.over.classList.remove('hidden'); ui.touch.classList.add('hidden');
      sfx(won ? 'win' : 'lose');
      if (won) for (let i = 0; i < 4; i++) confetti(new V3(P.pos.x + rand(-3, 3), P.pos.y + 3, P.pos.z + rand(-3, 3)), 2);
      if (document.pointerLockElement) document.exitPointerLock();
      wantsLock = false; mouseDown = false;
      return;
    }
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
  // Elegir modo (arriba de INICIAR) y, para la Batalla campal, la ventana de mapas
  if (cfg.mode !== 'ffa') cfg.mode = 'teams';
  if (!['plaza', 'casa', 'barrio'].includes(cfg.map)) cfg.map = 'plaza';
  if (cfg.squad !== 'duo') cfg.squad = 'solo';
  function showModePick() {
    document.querySelectorAll('.modeCard').forEach((b) => b.classList.toggle('sel', b.dataset.mode === cfg.mode));
    document.querySelectorAll('.mapCard').forEach((b) => b.classList.toggle('sel', b.dataset.map === cfg.map));
    $('ffaImg').src = 'img/mapa-' + cfg.map + '.jpg';
    $('ffaSub').textContent = cfg.mode === 'ffa' ? MAPS[cfg.map].name + ' · ' + (cfg.squad === 'duo' ? 'Dúos' : 'Solo') : '50 jugadores · tormenta';
    document.querySelectorAll('#squadPick button').forEach((b) => b.classList.toggle('sel', b.dataset.squad === cfg.squad));
  }
  $('modePick').addEventListener('click', (e) => {
    const b = e.target.closest('.modeCard'); if (!b) return;
    initAudio(); sfx('swap');
    if (b.dataset.mode === 'ffa') { showModePick(); $('mapPick').classList.remove('hidden'); return; }
    cfg.mode = 'teams'; saveCfg(); showModePick();
  });
  $('mapPick').addEventListener('click', (e) => {
    const sq = e.target.closest('#squadPick button');
    if (sq) { sfx('swap'); cfg.squad = sq.dataset.squad; saveCfg(); showModePick(); return; }
    const b = e.target.closest('.mapCard');
    if (b) { sfx('swap'); cfg.mode = 'ffa'; cfg.map = b.dataset.map; saveCfg(); showModePick(); $('mapPick').classList.add('hidden'); return; }
    if (e.target.id === 'mapBack' || e.target === $('mapPick')) $('mapPick').classList.add('hidden');
  });
  showModePick();
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
    $('classNote').textContent = settingsFromPlay ? 'Si cambias la clase o la dificultad, se usa en la próxima partida.' : '';
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
  colliders = MAPS.jardin.colliders;
  buildWorld();
  MAPS.jardin.meshes = statics.slice(); statics.length = 0;
  MAPS.jardin.grid = colGrid = buildColGrid(MAPS.jardin.colliders);
  buildProjMasters();
  buildBoxes();
  buildViewmodels();
  P.mesh = makeSoldierMesh('Tú', '#5aa2ff'); P.mesh.setEnabled(false);
  createBots();
  soldiers.forEach((s) => respawn(s));

  let framesDrawn = 0;
  engine.runRenderLoop(() => {
    const dt = Math.min(engine.getDeltaTime() / 1000, 0.05);
    if (state === 'playing') {
      gameTime += dt;
      updatePlayer(dt);
      for (const b of bots) updateBot(b, dt);
      updateProjectiles(dt);
      updateGrenades(dt);
      if (mode === 'teams') updateBoxes(dt); else { updatePickups(dt); updateTags(dt); updateStorm(dt); }
      updateShields(dt);
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
    drawMinimap(dt);
    scene.render();
    if (++framesDrawn === 3 && window.__paReady) window.__paReady(); // avisa a la pantalla de carga
  });

  // Para pruebas automáticas
  window.__pa = { get dbg() { return { mouseDown, touchMode, locked, nextShot: P.nextShot, gameTime, reloadT: P.reloadT, alive: P.alive }; }, scene, P, get bots() { return bots; }, score, get state() { return state; }, startMatch, firePlayer, playerNade, findRoute, walkable, givePower, playerItem,
    simulate(sec) { for (let t = 0; t < sec && state === 'playing'; t += 1 / 30) { gameTime += 1 / 30; for (const b of bots) updateBot(b, 1 / 30); updateProjectiles(1 / 30); updateGrenades(1 / 30); if (mode === 'teams') updateBoxes(1 / 30); else { updatePickups(1 / 30); updateTags(1 / 30); updateStorm(1 / 30); } updateShields(1 / 30); } }, get boxes() { return boxes; }, get boxDrops() { return boxDrops; },
    setMap, MAPS, camera, photo(p, t, fov) { photoCam = p ? { p: new V3(...p), t: new V3(...t), fov } : null; }, get pickups() { return pickups; }, get mode() { return mode; }, cfg, get soldiers() { return soldiers; }, storm, get tags() { return tags; } };
})();
