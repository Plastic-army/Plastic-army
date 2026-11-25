/* Plastic Army — prototipo de un jugador.
 * Soldaditos de juguete en un escritorio gigante. Todo se dibuja con formas simples
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
  const ROOM_COLOR = C3.FromHexString('#fdf1dc');
  scene.clearColor = new C4(ROOM_COLOR.r, ROOM_COLOR.g, ROOM_COLOR.b, 1);
  scene.ambientColor = new C3(0.35, 0.35, 0.35);
  scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
  scene.fogStart = 120; scene.fogEnd = 320; scene.fogColor = ROOM_COLOR;
  scene.skipPointerMovePicking = true;
  scene.detachControl(); // los controles son nuestros; Babylon no debe tocar los clics

  const camera = new BABYLON.FreeCamera('cam', new V3(-34, 2, 0), scene);
  camera.minZ = 0.05; camera.maxZ = 600; camera.fov = 1.15;
  camera.inputs.clear();

  const hemi = new BABYLON.HemisphericLight('hemi', new V3(0.2, 1, -0.3), scene);
  hemi.intensity = 0.72; hemi.groundColor = new C3(0.45, 0.4, 0.5);
  const sun = new BABYLON.DirectionalLight('sun', new V3(-0.45, -1, -0.35), scene);
  sun.position = new V3(60, 100, 60); sun.intensity = 0.75; sun.diffuse = C3.FromHexString('#fff4dd');
  let shadowGen = null;
  if (!touchMode) {
    shadowGen = new BABYLON.ShadowGenerator(2048, sun);
    shadowGen.usePercentageCloserFiltering = true;
    shadowGen.bias = 0.0015; shadowGen.normalBias = 0.02;
    sun.shadowMinZ = 1; sun.shadowMaxZ = 300;
  }
  const casters = [];
  const addCaster = (m) => { if (shadowGen) shadowGen.addShadowCaster(m); };

  // ------------------------------------------------------------------
  // Constantes del juego
  // ------------------------------------------------------------------
  const GRAV = 22, STEP = 0.65, RADIUS = 0.35, H = 1.8, H_CROUCH = 1.2, EYE = 1.55, EYE_CROUCH = 0.95;
  const DESK_X = 40, DESK_Z = 22, BOT_X = 38.3, BOT_Z = 20.3;
  const WIN_SCORE = 30;
  const TEAM_NAME = ['Azul', 'Rojo'];
  const TEAM_HEX = ['#3a86ff', '#ef233c'];

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
    facil: { enemies: 3, spread: 0.1, reaction: 0.85, dmg: 0.55, turn: 3.2, rateMul: 1.6 },
    normal: { enemies: 4, spread: 0.055, reaction: 0.55, dmg: 0.75, turn: 4.8, rateMul: 1.25 },
    dificil: { enemies: 5, spread: 0.03, reaction: 0.32, dmg: 0.95, turn: 7, rateMul: 1 }
  };
  const ALLY_SKILL = { spread: 0.05, reaction: 0.5, dmg: 0.8, turn: 5, rateMul: 1.2 };
  const BOT_NAMES = ['Cabo Botón', 'Sargento Tapita', 'Soldado Clip', 'Capitán Goma', 'Teniente Lápiz', 'Cabo Chicle', 'Sargento Dado', 'Soldado Canica', 'Cabo Tuerca', 'Soldado Crayón'];

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
  // El mapa: Escritorio
  // ------------------------------------------------------------------
  function buildWorld() {
    // Habitación gigante alrededor
    const floor = BABYLON.MeshBuilder.CreateGround('floor', { width: 700, height: 500 }, scene);
    floor.position.y = -32; floor.material = mat('#9d8ac7'); finishStatic(floor, false);
    const wallMat = mat('#fde8c4');
    box('wallBack', 400, 220, 2, 0, -32, 95, wallMat, { collide: false, shadow: false });
    box('wallFront', 400, 220, 2, 0, -32, -110, wallMat, { collide: false, shadow: false });
    box('wallL', 2, 220, 260, -150, -32, 0, mat('#ffd6a5'), { collide: false, shadow: false });
    box('wallR', 2, 220, 260, 150, -32, 0, mat('#ffd6a5'), { collide: false, shadow: false });
    // ventana
    const win = BABYLON.MeshBuilder.CreatePlane('window', { width: 90, height: 60 }, scene);
    win.position.set(-50, 50, 93.9); win.material = mat('#bde0fe', { emissive: '#a9d6ff', noFog: true });
    box('winFrameH', 94, 3, 2, -50, 18.5, 93.5, '#ffffff', { collide: false, shadow: false });
    box('winFrameM', 3, 60, 2, -50, 20, 93.5, '#ffffff', { collide: false, shadow: false });
    // póster
    const poster = BABYLON.MeshBuilder.CreatePlane('poster', { width: 48, height: 24 }, scene);
    poster.position.set(-148.8, 40, -20); poster.rotation.y = -Math.PI / 2;
    const pm = new BABYLON.StandardMaterial('posterMat', scene); pm.diffuseTexture = logoTexture(); pm.emissiveColor = new C3(0.35, 0.35, 0.35); pm.specularColor = C3.Black();
    poster.material = pm;
    // silla gigante detrás del jugador rojo
    box('chairSeat', 34, 4, 30, 72, -14, -8, '#264653', { collide: false });
    box('chairBack', 4, 40, 30, 90, -10, -8, '#264653', { collide: false });

    // Escritorio de madera
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
    wood.diffuseTexture.uScale = 3; wood.diffuseTexture.vScale = 2;
    wood.specularColor = new C3(0.12, 0.1, 0.08);
    box('desk', DESK_X * 2, 2, DESK_Z * 2, 0, -2, 0, wood, { shadow: false });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box('leg', 3, 30, 3, sx * (DESK_X - 3), -32, sz * (DESK_Z - 3), '#a47148', { collide: false });

    // Teclado: la trinchera del medio
    box('kbd', 8, 1.0, 24, 0, 0, 0, '#e9ecef');
    addCollider(-4, 1.0, -12, 4, 1.4, 12);
    const keys = [], fancy = [];
    for (let i = 0; i < 5; i++) for (let j = 0; j < 17; j++) {
      const k = BABYLON.MeshBuilder.CreateBox('key', { width: 1.0, height: 0.4, depth: 1.0 }, scene);
      k.position.set(-2.6 + i * 1.3, 1.2, -10.4 + j * 1.3);
      ((i === 1 && (j === 3 || j === 13)) || (i === 2 && (j === 2 || j === 3 || j === 4 || j === 12 || j === 13 || j === 14)) ? fancy : keys).push(k);
    }
    const sp = BABYLON.MeshBuilder.CreateBox('space', { width: 1.0, height: 0.4, depth: 9 }, scene); sp.position.set(3.2, 1.2, 0); keys.push(sp);
    const km = BABYLON.Mesh.MergeMeshes(keys, true, true); km.material = plastic('#adb5bd'); finishStatic(km);
    const fm = BABYLON.Mesh.MergeMeshes(fancy, true, true); fm.material = plastic('#ff9f1c'); finishStatic(fm);

    // Pilas de libros (subidas para francotiradores)
    const bookStack = (cx, cz, flip, colors) => {
      const sizes = [[12, 14, 0, 0], [10, 11.5, 0.6, 0.5], [8, 9, -0.4, 0.8], [6, 6.5, 0.5, 0.2]];
      sizes.forEach(([w, d, ox, oz], i) => {
        const x = cx + ox * flip, z = cz + oz * flip;
        box('book', w, 1, d, x, i, z, colors[i]);
        box('pages', 0.2, 0.8, d - 0.6, x + (w / 2 + 0.05) * flip, i + 0.1, z, '#fffdf5', { collide: false, shadow: false });
      });
    };
    bookStack(-16, 13, 1, ['#3a86ff', '#ffbe0b', '#8338ec', '#06d6a0']);
    bookStack(16, -13, -1, ['#ef233c', '#06d6a0', '#ffbe0b', '#3a86ff']);

    // Lámpara
    cyl('lampBase', 7, 0.8, -27, 0, 16, '#17a2b8');
    cyl('lampPole', 0.8, 18, -27, 0.8, 16, '#17a2b8');
    const top = new V3(-27, 18.8, 16), end = new V3(-19, 23, 9);
    beam('lampArm', 0.7, top, end, '#17a2b8');
    const shade = BABYLON.MeshBuilder.CreateCylinder('shade', { diameterTop: 2.2, diameterBottom: 8, height: 5, tessellation: 28 }, scene);
    shade.position.set(-18, 21, 8); shade.rotation.x = 0.35; shade.rotation.z = -0.25; shade.material = plastic('#17a2b8'); finishStatic(shade);
    const bulb = BABYLON.MeshBuilder.CreateSphere('bulb', { diameter: 3, segments: 12 }, scene);
    bulb.position.set(-17.6, 19.2, 7.4); bulb.material = mat('#fff3b0', { emissive: '#fff3b0' }); finishStatic(bulb, false);
    const spot = new BABYLON.SpotLight('lampLight', new V3(-17.6, 19, 7.4), new V3(0.15, -1, -0.15), 1.3, 2, scene);
    spot.diffuse = C3.FromHexString('#ffe8a3'); spot.intensity = 0.7; spot.range = 60;

    // Monitor gigante (fondo)
    box('monBase', 10, 0.5, 6, 12, 0, 18.5, '#343a40');
    box('monNeck', 1.6, 9, 1.2, 12, 0.5, 19.8, '#343a40');
    box('monFrame', 38, 21, 1.2, 12, 8, 20.8, '#212529', { collide: false });
    const screen = BABYLON.MeshBuilder.CreatePlane('screen', { width: 36, height: 19 }, scene);
    screen.position.set(12, 18.5, 20.15); screen.rotation.y = Math.PI;
    const sm = new BABYLON.StandardMaterial('screenMat', scene); sm.diffuseTexture = logoTexture(); sm.emissiveTexture = sm.diffuseTexture; sm.specularColor = C3.Black(); sm.disableLighting = true;
    screen.material = sm; screen.rotation.y = 0;
    finishStatic(screen, false);

    // Taza de café y portalápices
    cyl('mug', 5.6, 4, 25, 0, 14, '#ef476f');
    const handle = BABYLON.MeshBuilder.CreateTorus('handle', { diameter: 2.6, thickness: 0.6, tessellation: 20 }, scene);
    handle.position.set(28, 2, 14); handle.rotation.x = Math.PI / 2; handle.material = plastic('#ef476f'); finishStatic(handle);
    cyl('coffee', 5.0, 0.1, 25, 3.7, 14, '#6f4518', { collide: false });
    cyl('pencilCup', 4.6, 5, -24, 0, -14, '#118ab2');
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6;
      beam('pencil', 0.5, new V3(-24 + Math.cos(a) * 0.8, 1, -14 + Math.sin(a) * 0.8), new V3(-24 + Math.cos(a) * 2.6, 10 + i * 0.6, -14 + Math.sin(a) * 2.6), pick(['#ffbe0b', '#fb5607', '#8338ec', '#06d6a0']));
    }

    // Cosas pequeñas para cubrirse
    const eraser = (x, z) => { box('eraser', 2.8, 1.0, 1.5, x, 0, z, '#ff8fab'); box('sleeve', 1.1, 1.06, 1.56, x - 0.3, 0, z, '#3a86ff', { collide: false }); };
    eraser(-20, 1); eraser(20, -1); eraser(-1, 17.5);
    box('sticky1', 3.2, 2.2, 3.2, -28, 0, 5, '#ffd60a');
    box('sticky2', 3.2, 2.2, 3.2, 28, 0, -5, '#9ef01a');
    box('dice', 2.6, 2.6, 2.6, 0, 0, -17.5, '#e63946');
    for (const [dx, dz] of [[-0.6, -0.6], [0.6, 0.6], [0, 0], [-0.6, 0.6], [0.6, -0.6]]) {
      const dot = BABYLON.MeshBuilder.CreateCylinder('dot', { diameter: 0.4, height: 0.06, tessellation: 10 }, scene);
      dot.position.set(dx, 2.62, -17.5 + dz); dot.material = plastic('#ffffff'); finishStatic(dot, false);
    }
    // Ratón de computadora
    const mouse = BABYLON.MeshBuilder.CreateSphere('mouse', { diameter: 1, segments: 16 }, scene);
    mouse.scaling.set(3.6, 1.7, 6); mouse.position.set(-9, 0.2, -15); mouse.material = plastic('#dee2e6'); finishStatic(mouse);
    addCollider(-10.6, 0, -17.6, -7.4, 1.05, -12.4);
    // Celular, cuaderno, calculadora, regla, lápiz
    box('phone', 3.6, 0.45, 7, -13, 0, -5, '#212529');
    box('phoneScreen', 3.1, 0.02, 6.2, -13, 0.45, -5, mat('#4cc9f0', { emissive: '#1b6f8a' }), { collide: false, shadow: false });
    box('notebook', 8, 0.4, 10, 11, 0, 3, '#06d6a0');
    box('nbPaper', 7.4, 0.42, 9.6, 11.2, 0, 3, '#fffdf5', { collide: false, shadow: false });
    box('calc', 5, 0.8, 7.5, 28, 0, -16, '#6c757d');
    box('calcScreen', 3.6, 0.05, 1.6, 28, 0.8, -18.5, mat('#b5e48c', { emissive: '#4f772d' }), { collide: false, shadow: false });
    box('ruler', 14, 0.15, 1.5, 6, 0, -20, '#ffe066');
    cyl('pencilLying', 0.6, 8, -6, 0.3, 19, '#ffbe0b', { collide: false });
    statics[statics.length - 1].rotation.z = Math.PI / 2; statics[statics.length - 1].position.y = 0.3;
    addCollider(-10, 0, 18.7, -2, 0.6, 19.3);
    cyl('pencilLying2', 0.6, 8, 21, 0.3, 8, '#fb5607', { collide: false });
    statics[statics.length - 1].rotation.x = Math.PI / 2; statics[statics.length - 1].position.y = 0.3;
    addCollider(20.7, 0, 4, 21.3, 0.6, 12);

    statics.forEach((m) => m.freezeWorldMatrix());
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
    for (let i = 0; i < 30; i++) {
      const x = (team === 0 ? -1 : 1) * rand(33, 37.5), z = rand(-17, 17);
      if (!freeSpot(x, z)) continue;
      if (soldiers.some((s) => s.alive && s !== undefined && Math.hypot(s.pos.x - x, s.pos.z - z) < 1.6)) continue;
      return new V3(x, 0.05, z);
    }
    return new V3(team === 0 ? -35 : 35, 0.05, rand(-4, 4));
  }
  function respawn(s) {
    s.pos.copyFrom(spawnPoint(s.team)); s.vel.setAll(0);
    s.alive = true; s.hp = s.maxHp; s.spawnProt = 1.5; s.yaw = s.team === 0 ? Math.PI / 2 : -Math.PI / 2; s.pitch = 0;
    s.reloadT = 0; s.h = H;
    if (s === P) {
      P.weapons.forEach((w) => (w.ammo = w.def.mag)); P.nades = P.cls.nades; P.crouch = false;
      showMsg(''); updateHud(true);
    } else {
      s.ammo = s.wdef.mag; s.target = null; s.wp = null; s.deathT = 0; s.stuckT = 0;
      s.mesh.setEnabled(true); s.mesh.rotation.set(0, s.yaw, 0);
      if (s.marker) s.marker.setEnabled(true);
    }
  }

  function createBots() {
    bots.forEach((b) => { b.mesh.dispose(); });
    bots = [];
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
    const counts = [3, diff.enemies];
    for (let team = 0; team < 2; team++) {
      for (let i = 0; i < counts[team]; i++) {
        const b = makeSoldier(team, true, names.pop());
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
    const cork = BABYLON.MeshBuilder.CreateCylinder('cork', { diameterTop: 0.15, diameterBottom: 0.19, height: 0.22, tessellation: 8 }, scene);
    cork.rotation.x = Math.PI / 2; cork.bakeCurrentTransformIntoVertices();
    projMasters.cork = cork; cork.material = mat('#e0b084', { emissive: '#7a5a3a' }); cork.position.y = -999;
    const dart = BABYLON.MeshBuilder.CreateCylinder('dart', { diameter: 0.07, height: 0.6, tessellation: 6 }, scene);
    dart.rotation.x = Math.PI / 2; dart.bakeCurrentTransformIntoVertices();
    projMasters.dart = dart; dart.material = mat('#9ef01a', { emissive: '#5a9e00' }); dart.position.y = -999;
    const nade = BABYLON.MeshBuilder.CreateSphere('nade', { diameter: 0.36, segments: 12 }, scene);
    nade.material = mat('#5ec8ff', { spec: 1, power: 96, emissive: '#1d5f8a', alpha: 0.9 }); nade.position.y = -999;
    projMasters.nade = nade;
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

  function throwNade(owner, vel) {
    const m = takeMesh('nade');
    const pos = eyeOf(owner);
    if (owner === P) pos.addInPlace(forwardVec().scale(0.6));
    m.position.copyFrom(pos);
    grenades.push({ pos, vel, owner, team: owner.team, t: 2.2, mesh: m, r: 0.18 });
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
      if (g.t <= 0 || g.pos.y < -25) { explode(g); giveMesh('nade', g.mesh); grenades.splice(i, 1); }
    }
  }
  function explode(g) {
    const R = 6.5;
    confetti(g.pos, 2.5); flashSphere(g.pos, R * 0.9, '#ffd23f');
    sfx('boom', clamp(1 - V3.Distance(g.pos, camera.position) / 90, 0.1, 1));
    for (const s of soldiers) {
      if (!s.alive) continue;
      const c = chestOf(s), d = V3.Distance(c, g.pos);
      if (s === P && d < R * 1.8) shake = Math.max(shake, 0.35 * (1 - d / (R * 1.8)));
      if (d > R || s.team === g.team) continue;
      const from = g.pos.add(new V3(0, 0.3, 0));
      if (!canSee(from, c) && !canSee(from, eyeOf(s))) continue;
      damage(s, 115 * Math.pow(1 - d / R, 0.6), g.owner, false, 'nade');
    }
  }

  // ------------------------------------------------------------------
  // Daño, eliminaciones y marcador
  // ------------------------------------------------------------------
  const score = [0, 0];
  let state = 'menu', gameTime = 0, shake = 0;

  function damage(t, amount, attacker, head, how) {
    if (!t.alive || t.spawnProt > 0 || state !== 'playing') return;
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
    if (score[0] >= WIN_SCORE || score[1] >= WIN_SCORE) endMatch();
  }
  let killerName = null;

  // ------------------------------------------------------------------
  // HUD
  // ------------------------------------------------------------------
  const hud = { sb: $('sb'), sr: $('sr'), hpfill: $('hpfill'), hptext: $('hptext'), wname: $('wname'), ammo: $('ammo'), nades: $('nades'), slots: $('slots'), msg: $('msg'), dmg: $('dmg'), cross: $('crosshair'), hit: $('hitmarker'), banner: $('banner'), feed: $('killfeed') };
  let dmgFlash = 0, hitT = 0, bannerT = 0, lastHudKey = '';
  WEAPONS.forEach((w, i) => { const s = document.createElement('span'); s.textContent = (i + 1) + ' ' + w.name.split(' ')[0]; hud.slots.appendChild(s); });
  function updateHud(force) {
    const w = P.weapons[P.wi];
    const key = [score[0], score[1], Math.ceil(P.hp), P.wi, w.ammo, P.nades, P.reloadT > 0].join('|');
    if (!force && key === lastHudKey) return;
    lastHudKey = key;
    hud.sb.textContent = score[0]; hud.sr.textContent = score[1];
    const hp = Math.max(0, Math.ceil(P.hp));
    hud.hpfill.style.width = (100 * hp / P.maxHp) + '%'; hud.hpfill.classList.toggle('low', hp < P.maxHp * 0.35);
    hud.hptext.textContent = hp;
    hud.wname.textContent = w.def.name;
    hud.ammo.textContent = P.reloadT > 0 ? 'Recargando…' : w.ammo + ' / ' + w.def.mag;
    hud.nades.textContent = '● ×' + P.nades;
    [...hud.slots.children].forEach((s, i) => s.classList.toggle('cur', i === P.wi));
  }
  function hitmarker(head) { hitT = 0.15; hud.hit.classList.add('show'); hud.hit.classList.toggle('head', !!head); }
  function showBanner(t) { hud.banner.textContent = t; hud.banner.classList.add('show'); bannerT = 1.4; }
  function showMsg(t) { if (hud.msg.textContent !== t) hud.msg.textContent = t; }
  function addFeed(att, vic, how, head) {
    const cls = (s) => (s === P ? 'me' : s.team === 0 ? 'b' : 'r');
    const icon = { rifle: '•', shotgun: '▮', dart: '➶', nade: '●', fall: '↓' }[how] || '•';
    const div = document.createElement('div');
    if (!att || att === vic) div.innerHTML = `<span class="${cls(vic)}">${vic.name}</span> se cayó del escritorio`;
    else div.innerHTML = `<span class="${cls(att)}">${att.name}</span> ${icon}${head ? '✪' : ''} <span class="${cls(vic)}">${vic.name}</span>`;
    hud.feed.prepend(div);
    while (hud.feed.children.length > 5) hud.feed.lastChild.remove();
    setTimeout(() => div.remove(), 5000);
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
  let jumpPressed = false;
  const SENS = 0.0022;

  addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (state !== 'playing') return;
    if (e.code === 'Space') { jumpPressed = true; e.preventDefault(); }
    if (e.code === 'KeyR') startReload();
    if (e.code === 'KeyG') playerNade();
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
      const s = SENS * (aimDown && WEAPONS[P.wi].zoom ? 0.4 : aimDown ? 0.75 : 1);
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
  const tbtn = (id, fn) => $(id).addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); if (state === 'playing') fn(); }, { passive: false });
  tbtn('bJump', () => (jumpPressed = true));
  tbtn('bNade', () => playerNade());
  tbtn('bSwap', () => switchWeapon((P.wi + 1) % 3));
  tbtn('bReload', () => startReload());
  tbtn('bCrouch', () => { P.crouchToggle = !P.crouchToggle; $('bCrouch').classList.toggle('on', P.crouchToggle); });
  tbtn('bPause', () => pauseGame());

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
    for (const s of soldiers) { if (s.alive && s.team !== P.team) { const ts = segSoldier(eye, far, s); if (ts >= 0 && ts < t) t = ts; } }
    const aimPt = eye.add(far.scale(Math.max(t, 0.02)));
    const right = new V3(Math.cos(P.yaw), 0, -Math.sin(P.yaw));
    const origin = eye.add(f.scale(0.35)).add(right.scale(0.14)).add(new V3(0, -0.1, 0));
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
      showMsg((killerName ? '¡Te eliminó ' + killerName + '!' : '¡Te caíste del escritorio!') + '\nVuelves en ' + Math.max(1, Math.ceil(P.deathT)) + '…');
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
        P.yaw += curve(rx) * 3.4 * slow * zoom * dt;
        P.pitch = clamp(P.pitch + curve(ry) * 2.2 * slow * zoom * dt, -1.45, 1.45);
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
      firing = firing || onTarget;
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
    let best = null, bestD = 55;
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
  function pickWaypoint(b) {
    for (let i = 0; i < 12; i++) {
      const x = b.team === 0 ? rand(-30, 34) : rand(-34, 30), z = rand(-19, 19);
      if (freeSpot(x, z)) return new V3(x, 0, z);
    }
    return new V3(0, 0, b.pos.z > 0 ? 16 : -16);
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
    b.alertT = Math.max(0, (b.alertT || 0) - dt);
    b.nadeCd -= dt;
    b.think -= dt;
    if (b.think <= 0) {
      b.think = rand(0.18, 0.32);
      const t = findTarget(b);
      if (t !== b.target) { b.target = t; b.seenT = 0; }
      if (t) b.lastSeen = t.pos.clone();
      if (!t && (!b.wp || Math.hypot(b.wp.x - b.pos.x, b.wp.z - b.pos.z) < 2 || b.stuckT > 1.2)) {
        b.wp = b.lastSeen && Math.random() < 0.5 ? b.lastSeen : pickWaypoint(b); b.lastSeen = null; b.stuckT = 0;
      }
      if (Math.random() < 0.12) b.strafeDir *= -1;
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
      const nx = dx / d, nz = dz / d;
      mx = nx * fwd + nz * b.strafeDir * 0.75; mz = nz * fwd - nx * b.strafeDir * 0.75;
      // disparar
      if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) b.ammo = b.wdef.mag; }
      else if (b.seenT > sk.reaction && Math.abs(angDiff(b.yaw, desiredYaw)) < 0.25 && gameTime >= b.nextShot && b.spawnProt <= 0) botFire(b, t);
    } else {
      b.target = null;
      if (b.wp) {
        const dx = b.wp.x - b.pos.x, dz = b.wp.z - b.pos.z, d = Math.hypot(dx, dz) || 1;
        mx = dx / d; mz = dz / d; desiredYaw = Math.atan2(dx, dz);
      }
      if (b.alertT > 0 && b.alertFrom) desiredYaw = Math.atan2(b.alertFrom.pos.x - b.pos.x, b.alertFrom.pos.z - b.pos.z);
      if (b.ammo < b.wdef.mag && b.reloadT <= 0) b.reloadT = b.wdef.reload;
      if (b.reloadT > 0) { b.reloadT -= dt; if (b.reloadT <= 0) b.ammo = b.wdef.mag; }
    }
    const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
    const speed = 5.2;
    const k = Math.min(1, 10 * dt);
    b.vel.x += (mx * speed - b.vel.x) * k; b.vel.z += (mz * speed - b.vel.z) * k;
    if (b.blocked && b.onGround) b.vel.y = 8.3;
    const before = b.pos.clone();
    moveBody(b, dt);
    b.pos.x = clamp(b.pos.x, -BOT_X, BOT_X); b.pos.z = clamp(b.pos.z, -BOT_Z, BOT_Z);
    if (len > 0.3 && Math.hypot(b.pos.x - before.x, b.pos.z - before.z) < speed * dt * 0.3) b.stuckT = (b.stuckT || 0) + dt; else b.stuckT = 0;
    if (b.pos.y < -5) { respawn(b); return; }
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
  let menuAngle = 0;
  function updateCamera(dt) {
    if (state === 'menu') {
      menuAngle += dt * 0.12;
      camera.position.set(Math.sin(menuAngle) * 58, 24, Math.cos(menuAngle) * 46);
      camera.setTarget(new V3(0, 1, 0));
      vms.forEach((v) => v.setEnabled(false));
      return;
    }
    camera.rotationQuaternion = null;
    const targetEye = P.crouch ? P.h - 0.25 : EYE;
    P.eyeH += (targetEye - P.eyeH) * Math.min(1, 14 * dt);
    const sp = Math.hypot(P.vel.x, P.vel.z);
    if (P.onGround && sp > 1) P.bobT += dt * sp * 1.5;
    let ex = P.pos.x, ey = P.pos.y + P.eyeH + Math.sin(P.bobT * 2) * 0.035 * Math.min(1, sp / 6), ez = P.pos.z;
    if (!P.alive) ey = P.pos.y + 0.5;
    if (shake > 0) { ex += rand(-shake, shake) * 0.3; ey += rand(-shake, shake) * 0.3; shake = Math.max(0, shake - dt); }
    camera.position.set(ex, ey, ez);
    camera.rotation.set(P.pitch, P.yaw, P.alive ? 0 : 0.5);
    const def = WEAPONS[P.wi];
    const fovT = aimDown ? (def.zoom ? 0.5 : 0.95) : 1.15;
    camera.fov += (fovT - camera.fov) * Math.min(1, 12 * dt);
    // arma
    vms.forEach((v, i) => v.setEnabled(i === P.wi && P.alive && !(aimDown && def.zoom && camera.fov < 0.7)));
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
    score[0] = score[1] = 0;
    projectiles.forEach((p) => giveMesh(p.key, p.mesh)); projectiles.length = 0;
    grenades.forEach((g) => giveMesh('nade', g.mesh)); grenades.length = 0;
    soldiers.forEach((s) => { s.kills = 0; s.deaths = 0; s.alive = false; });
    soldiers.forEach((s) => respawn(s));
    P.wi = 0; P.crouchToggle = false; $('bCrouch').classList.remove('on');
    hud.feed.innerHTML = '';
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
    const won = score[0] >= WIN_SCORE;
    $('overTitle').textContent = won ? '¡VICTORIA AZUL!' : 'Ganó el equipo Rojo';
    $('overTitle').style.color = won ? '#3a86ff' : '#ef233c';
    $('overStats').innerHTML = `Marcador: <b class="blue">${score[0]}</b> – <b class="red">${score[1]}</b><br>Tus eliminaciones: <b>${P.kills}</b> · Veces que caíste: <b>${P.deaths}</b>`;
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
  buildViewmodels();
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
  window.__pa = { get dbg() { return { mouseDown, touchMode, locked, nextShot: P.nextShot, gameTime, reloadT: P.reloadT, alive: P.alive }; }, scene, P, get bots() { return bots; }, score, get state() { return state; }, startMatch, firePlayer, playerNade };
})();
