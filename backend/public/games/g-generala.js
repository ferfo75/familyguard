// Generala con dados 3D que ruedan sobre un paño verde. El servidor tira los dados (nadie puede hacer trampa);
// acá se animan, se eligen los que se guardan y se anota en la planilla.
import { THREE, createStage, envMap, woodTexture, feltTexture, createSfx, rng } from "./g-fx3d.js";

const CAT_LABEL = { "1": "⚀ Uno", "2": "⚁ Dos", "3": "⚂ Tres", "4": "⚃ Cuatro", "5": "⚄ Cinco", "6": "⚅ Seis", escalera: "Escalera", full: "Full", poker: "Póker", generala: "Generala", doble: "Doble generala" };
const CAT_NAME = { "1": "los 1", "2": "los 2", "3": "los 3", "4": "los 4", "5": "los 5", "6": "los 6", escalera: "Escalera", full: "Full", poker: "Póker", generala: "Generala", doble: "Doble generala" };
const NORMAL = { 1: [0, 1, 0], 6: [0, -1, 0], 3: [1, 0, 0], 4: [-1, 0, 0], 2: [0, 0, 1], 5: [0, 0, -1] };
const SLOT_X = (i) => (i - 2) * 1.38;
const REST_Z = -0.25, HELD_Z = 1.55;

const CSS = `
.gn-wrap{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px}
.gn-chips{flex:none;display:flex;gap:5px}
.gn-chip{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;padding:3px 4px;border-radius:12px;background:var(--card);border:2px solid transparent;line-height:1.15}
.gn-chip.turn{border-color:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 28%,transparent)}
.gn-chip b{font-size:12px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gn-chip span{font-size:17px;font-weight:800;font-family:Georgia,serif}
.gn-stage{flex:none;height:clamp(180px,31%,290px);position:relative;border-radius:20px;overflow:hidden;background:#14301f;box-shadow:inset 0 0 0 2px rgba(255,255,255,.06)}
.gn-stage::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 50%,transparent 55%,rgba(0,0,0,.5) 100%)}
.gn-info{position:absolute;left:0;right:0;top:6px;text-align:center;z-index:3;pointer-events:none;font-weight:800;font-size:13px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8)}
.gn-pips{display:inline-flex;gap:4px;margin-left:6px;vertical-align:middle}.gn-pips i{width:9px;height:9px;border-radius:50%;background:#FFD54A;box-shadow:0 0 6px #FFD54A}.gn-pips i.off{background:rgba(255,255,255,.25);box-shadow:none}
.gn-act{flex:none;display:flex;gap:8px;align-items:center}
.gn-act button.main{flex:1;font-size:17px;padding:12px 14px}
.gn-sheet-wrap{flex:1;min-height:0;overflow-y:auto;border-radius:16px;background:var(--card);border:1px solid var(--line)}
table.gn-sheet{width:100%;border-collapse:collapse;font-size:13px}
.gn-sheet th{position:sticky;top:0;background:var(--card);z-index:2;padding:5px 4px;font-size:12px;border-bottom:2px solid var(--line)}
.gn-sheet th.turn{color:var(--terracotta)}
.gn-sheet td{padding:0 4px;height:30px;border-bottom:1px solid var(--line);text-align:center}
.gn-sheet td.cat{text-align:left;font-weight:700;white-space:nowrap;padding-left:8px}
.gn-sheet td.me{background:color-mix(in srgb,var(--terracotta) 7%,transparent)}
.gn-sheet td.opt{cursor:pointer;color:var(--terracotta);font-weight:800}
.gn-sheet td.opt.zero{color:var(--muted);font-weight:600}
.gn-sheet td.opt.sel{background:var(--terracotta);color:#fff;border-radius:8px}
.gn-sheet td.taken{font-weight:800}.gn-sheet td.strike{color:var(--muted);text-decoration:line-through}
.gn-sheet td.flash{animation:gnflash 1.2s}
@keyframes gnflash{0%,60%{background:#FFD54A}}
.gn-sheet tr.tot td{font-weight:900;font-size:15px;border-top:2px solid var(--line);font-family:Georgia,serif}
.gn-ovl{position:absolute;inset:0;display:grid;place-items:center;background:rgba(8,14,10,.6);z-index:6;padding:16px}
.gn-card{background:var(--card);border-radius:22px;padding:18px 20px;text-align:center;width:100%;max-width:300px;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.gn-card h2{font-size:27px;margin-bottom:6px}.gn-card .rk{display:flex;justify-content:space-between;padding:5px 2px;border-top:1px solid var(--line);font-weight:700}
.gn-big{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);z-index:5;font-family:Georgia,serif;font-weight:900;font-size:30px;color:#FFD54A;text-shadow:0 3px 10px rgba(0,0,0,.8);pointer-events:none;animation:gnbig 1.6s ease forwards;white-space:nowrap}
@keyframes gnbig{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}20%{transform:translate(-50%,-50%) scale(1.15);opacity:1}80%{opacity:1}100%{transform:translate(-50%,-70%) scale(1);opacity:0}}
`;

export default function (api) {
  const { esc, sleep, S } = api;
  const sfx = createSfx(() => api.Snd.on);
  let G = null, styleDone = false;

  /* ---------- dado ---------- */
  let DIE = null;
  function pipFace(n) {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d");
    const bg = g.createLinearGradient(0, 0, 256, 256); bg.addColorStop(0, "#fbf5e6"); bg.addColorStop(1, "#e7dcc2");
    g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
    const L = { 1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]], 4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], 5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]], 6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]] }[n];
    for (const [x, y] of L) {
      const cx = x * 256, cy = y * 256;
      if (n === 1) {
        // El uno es un cuadrado rojo grande en el centro: así se distingue de un vistazo de las demás caras.
        const s = 118, x0 = cx - s / 2, y0 = cy - s / 2;
        g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.roundRect(x0 + 2, y0 + 4, s, s, 26); g.fill();
        const rg = g.createLinearGradient(x0, y0, x0 + s, y0 + s); rg.addColorStop(0, "#ee5547"); rg.addColorStop(1, "#a01d13");
        g.fillStyle = rg; g.beginPath(); g.roundRect(x0, y0, s, s, 26); g.fill();
        g.fillStyle = "rgba(255,255,255,.28)"; g.beginPath(); g.roundRect(x0 + 10, y0 + 9, s - 36, 16, 8); g.fill();
        continue;
      }
      // Puntos redondos y grandes (las demás caras no llevan ningún cuadrado).
      const r = n === 6 ? 31 : 37;
      const rg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 2, cx, cy, r);
      rg.addColorStop(0, "#4a4440"); rg.addColorStop(1, "#0f0c0a");
      g.fillStyle = "rgba(0,0,0,.22)"; g.beginPath(); g.arc(cx + 1.5, cy + 3, r + 2.5, 0, 6.3); g.fill();
      g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, r, 0, 6.3); g.fill();
      g.fillStyle = "rgba(255,255,255,.22)"; g.beginPath(); g.arc(cx - r * 0.35, cy - r * 0.4, r * 0.22, 0, 6.3); g.fill();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }
  function dieAssets() {
    if (DIE) return DIE;
    const n = 14, r = 0.13, geo = new THREE.BoxGeometry(1, 1, 1, n, n, n);
    const pos = geo.attributes.position, nor = geo.attributes.normal, v = new THREE.Vector3(), inner = new THREE.Vector3(), d = new THREE.Vector3();
    const lim = 0.5 - r;
    const uv = geo.attributes.uv, n0 = nor.array.slice(); // normales originales: dicen a qué cara pertenece cada vértice
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      // repartir más vértices cerca de los bordes para que el redondeado se vea suave
      for (const a of ["x", "y", "z"]) { const s = Math.sign(v[a]), m = Math.abs(v[a]) * 2; v[a] = s * 0.5 * Math.pow(m, 0.5); }
      inner.set(Math.max(-lim, Math.min(lim, v.x)), Math.max(-lim, Math.min(lim, v.y)), Math.max(-lim, Math.min(lim, v.z)));
      d.copy(v).sub(inner);
      if (d.lengthSq() > 1e-9) { d.normalize(); v.copy(inner).addScaledVector(d, r); nor.setXYZ(i, d.x, d.y, d.z); }
      pos.setXYZ(i, v.x, v.y, v.z);
      // El dibujo de cada cara se calcula desde la posición FINAL del vértice. Con las UV originales, al redistribuir
      // los vértices el dibujo se estiraba y los puntos salían deformados (cuadrados oscuros en el medio).
      const ax = Math.abs(n0[i * 3]), ay = Math.abs(n0[i * 3 + 1]), az = Math.abs(n0[i * 3 + 2]);
      let u, w;
      if (ax >= ay && ax >= az) { const sg = Math.sign(n0[i * 3]); u = sg * -v.z + 0.5; w = v.y + 0.5; }
      else if (ay >= az) { const sg = Math.sign(n0[i * 3 + 1]); u = v.x + 0.5; w = sg * -v.z + 0.5; }
      else { const sg = Math.sign(n0[i * 3 + 2]); u = sg * v.x + 0.5; w = v.y + 0.5; }
      uv.setXY(i, Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, w)));
    }
    geo.computeBoundingSphere();
    // orden de materiales de BoxGeometry: +x, -x, +y, -y, +z, -z
    const faces = [3, 4, 1, 6, 2, 5];
    const mats = faces.map((f) => new THREE.MeshPhysicalMaterial({ map: pipFace(f), roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.9 }));
    DIE = { geo, mats };
    return DIE;
  }
  function makeDie() {
    const { geo, mats } = dieAssets();
    const m = new THREE.Mesh(geo, mats); m.castShadow = true; m.receiveShadow = true; m.scale.setScalar(1.05);
    return m;
  }
  const orient = (value, yaw) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...NORMAL[value]), new THREE.Vector3(0, 1, 0));
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
  };

  function ensureStyle() { if (styleDone) return; styleDone = true; const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); }

  /* ---------- escena ---------- */
  function buildScene(stage) {
    const { scene } = stage;
    scene.background = new THREE.Color(0x0e1c14);
    scene.environment = envMap(stage.renderer); scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x1a3a22, 0.5));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.8); sun.position.set(-3, 9, 4); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); const sc = sun.shadow.camera; sc.left = -6; sc.right = 6; sc.top = 5; sc.bottom = -5; sc.near = 1; sc.far = 24;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; scene.add(sun);
    // paño
    const felt = feltTexture(512, "#1f6b3f", 77); felt.repeat.set(5, 3.4);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 6.4), new THREE.MeshStandardMaterial({ map: felt, roughness: 0.95, envMapIntensity: 0.25 }));
    table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table);
    // borde de madera
    const wood = woodTexture(512, "#6a4125", "#24130a", 91, { knots: 3 });
    const rimMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.4, envMapIntensity: 0.9 });
    const rim = (w, d, x, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.38, d), rimMat); b.position.set(x, 0.1, z); b.castShadow = true; b.receiveShadow = true; scene.add(b); };
    rim(10.4, 0.5, 0, -3.45); rim(10.4, 0.5, 0, 3.45); rim(0.5, 7.4, -4.95, 0); rim(0.5, 7.4, 4.95, 0);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.MeshStandardMaterial({ color: 0x120b06, roughness: 0.8 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.02; scene.add(outer);
  }

  /* ---------- pantalla ---------- */
  function build(g) {
    ensureStyle();
    api.screen("generala:" + (S.room ? S.room.roomId : ""), `
      <div class="top"><div class="t">🎯 Generala</div><button class="sec" data-a="snd">${api.Snd.on ? "🔊" : "🔇"}</button><button class="sec" data-a="quit">✕</button></div>
      <div class="gn-wrap">
        <div class="gn-chips" id="gn-chips"></div>
        <div class="gn-stage" id="gn-stage"><div class="gn-info" id="gn-info"></div></div>
        <div class="gn-act" id="gn-act"></div>
        <div class="gn-sheet-wrap" id="gn-sheet"></div>
      </div>`);
    const el = document.getElementById("gn-stage");
    const stage = createStage(el, { fov: 38 });
    buildScene(stage);
    G = { g, stage, el, dice: [], held: [false, false, false, false, false], lastRollN: g.lastRoll ? g.lastRoll.n : 0, lastScoreN: g.lastScore ? g.lastScore.n : 0, sel: null, rolling: false, ended: false, group: new THREE.Group(), ringGroup: new THREE.Group() };
    stage.scene.add(G.group, G.ringGroup);
    for (let i = 0; i < 5; i++) { const m = makeDie(); m.visible = false; G.group.add(m); G.dice.push({ mesh: m, value: 1, pos: new THREE.Vector3(SLOT_X(i), 0.55, REST_Z), yaw: 0 }); }
    const ringGeo = new THREE.RingGeometry(0.62, 0.78, 36), ringMat = new THREE.MeshBasicMaterial({ color: 0xFFD54A, transparent: true, opacity: 0.9, depthWrite: false });
    for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(ringGeo, ringMat); r.rotation.x = -Math.PI / 2; r.position.set(SLOT_X(i), 0.02, HELD_Z); r.visible = false; G.ringGroup.add(r); }
    stage.onResize = camera; camera();
    stage.onLost = () => { el.insertAdjacentHTML("beforeend", '<div class="gn-ovl"><div class="gn-card"><p>El gráfico se interrumpió. Cerrá y volvé a abrir el juego.</p></div></div>'); };
    bindInput();
    // dados que ya estaban sobre la mesa (al volver a entrar a una partida)
    if (g.dice.length === 5) g.dice.forEach((v, i) => placeDie(i, v, !!G.held[i], false));
    stage.invalidate();
  }
  function camera() {
    if (!G) return;
    const cam = G.stage.camera, w = G.el.clientWidth, h = G.el.clientHeight; if (!w || !h) return;
    const aspect = w / h, vfov = (cam.fov * Math.PI) / 180;
    const dW = 3.9 / (Math.tan(vfov / 2) * aspect), dH = 3.6 / Math.tan(vfov / 2);
    const d = Math.max(dW, dH), el = (58 * Math.PI) / 180;
    cam.position.set(0, Math.sin(el) * d, Math.cos(el) * d + 0.4); cam.lookAt(0, 0, 0.35);
    G.stage.invalidate();
  }

  function slotPos(i, held) { return new THREE.Vector3(SLOT_X(i), 0.55, held ? HELD_Z : REST_Z); }
  function placeDie(i, value, held, animate) {
    const d = G.dice[i], wasVisible = d.mesh.visible;
    d.value = value; d.mesh.visible = true;
    d.yaw = d.yaw || (i * 1.7 + 0.3) % 6.28;
    if (!(wasVisible && animate)) d.mesh.quaternion.copy(orient(value, d.yaw));
    const p = slotPos(i, held);
    if (!animate) d.mesh.position.copy(p);
    else slideTo(i, p, 260);
    d.pos.copy(p);
    const ring = G.ringGroup.children[i]; ring.visible = !!held;
  }
  function slideTo(i, p, ms) {
    const m = G.dice[i].mesh, a = m.position.clone(), t0 = performance.now();
    G.stage.addAnim((now) => { const t = Math.max(0, Math.min(1, ((now || performance.now()) - t0) / ms)); const e = t * t * (3 - 2 * t); m.position.lerpVectors(a, p, e); return t < 1; });
  }

  /* ---------- tiro con animación ---------- */
  async function rollAnim(lr) {
    G.rolling = true;
    sfx.rattle();
    const jobs = [];
    const spinDur = 1250;
    for (let i = 0; i < 5; i++) {
      if (!lr.rolled[i]) continue; // los dados guardados no se mueven
      G.held[i] = false;
      const d = G.dice[i], m = d.mesh;
      m.visible = true;
      const rand = rng((lr.n * 131 + i * 17) >>> 0);
      const from = new THREE.Vector3(4.2 + rand() * 0.8, 2.6 + rand(), 2.4 + rand() * 1.2);
      const mid = new THREE.Vector3(SLOT_X(i) + (rand() - 0.5) * 0.6, 0, REST_Z + (rand() - 0.5) * 0.5);
      const to = slotPos(i, false); to.x += (rand() - 0.5) * 0.12; to.z += (rand() - 0.5) * 0.14;
      d.value = lr.dice[i]; d.yaw = rand() * 6.28;
      const qT = orient(lr.dice[i], d.yaw);
      const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      const turns = 5 + rand() * 4, dur = spinDur + i * 70 + rand() * 160;
      const ring = G.ringGroup.children[i]; ring.visible = false;
      jobs.push(new Promise((res) => {
        const t0 = performance.now(); let landed = false;
        G.stage.addAnim((now) => {
          const t = Math.max(0, Math.min(1, ((now || performance.now()) - t0) / dur));
          const e = 1 - Math.pow(1 - t, 2.2);
          // trayectoria: baja desde la mano, rebota 2 veces y queda en su lugar
          const base = new THREE.Vector3().lerpVectors(from, to, e);
          const bounce = Math.abs(Math.sin(t * Math.PI * 3.2)) * Math.pow(1 - t, 1.6) * 1.15;
          m.position.set(base.x, to.y + bounce + (1 - e) * (from.y - to.y) * 0.8, base.z);
          const qs = new THREE.Quaternion().setFromAxisAngle(axis, turns * Math.PI * 2 * Math.pow(1 - t, 1.6));
          m.quaternion.copy(qT).multiply(qs);
          if (!landed && t > 0.86) { landed = true; sfx.diceLand(); }
          if (t >= 1) { m.position.copy(to); m.quaternion.copy(qT); d.pos.copy(to); res(); return false; }
          return true;
        });
      }));
    }
    await Promise.all(jobs);
    G.rolling = false;
  }

  /* ---------- tocar un dado ---------- */
  function bindInput() {
    const cv = G.stage.canvas, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    cv.addEventListener("pointerup", (e) => {
      sfx.unlock();
      if (!G || G.rolling || G.ended) return;
      const g = G.g;
      if (g.winner !== null || g.turn !== g.seat || g.dice.length !== 5 || g.rollsLeft <= 0) return;
      const r = cv.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, G.stage.camera);
      const hit = ray.intersectObjects(G.group.children, false)[0];
      if (!hit) return;
      const i = G.dice.findIndex((d) => d.mesh === hit.object);
      if (i < 0) return;
      G.held[i] = !G.held[i];
      sfx.tap();
      placeDie(i, G.dice[i].value, G.held[i], true);
      G.stage.invalidate(); actUi(G.g);
    });
  }

  /* ---------- interfaz ---------- */
  function chips(g) {
    document.getElementById("gn-chips").innerHTML = g.players.map((p, i) => `<div class="gn-chip ${g.turn === i && g.winner === null ? "turn" : ""}" style="--c:${api.COLORS[i % 4]}"><b>${i === g.seat ? "Vos" : esc(p.name)}</b><span>${p.total}</span></div>`).join("");
  }
  function info(g) {
    const el = document.getElementById("gn-info");
    if (g.winner !== null) { el.innerHTML = ""; return; }
    const mine = g.turn === g.seat;
    const pips = [0, 1, 2].map((i) => `<i class="${i < g.rollsLeft ? "" : "off"}"></i>`).join("");
    if (!g.dice.length) el.innerHTML = mine ? `Tu turno — tirá los dados` : `Juega ${esc(g.players[g.turn].name)}`;
    else el.innerHTML = `${mine ? "Tu turno" : esc(g.players[g.turn].name)} · tiros <span class="gn-pips">${pips}</span>`;
  }
  function actUi(g) {
    const box = document.getElementById("gn-act"); if (!box) return;
    const mine = g.turn === g.seat && g.winner === null;
    const rolled = g.dice.length === 5;
    let h = "";
    if (!mine || g.winner !== null) h = `<button class="main" disabled>${g.winner !== null ? "Partida terminada" : "Juega " + esc(g.players[g.turn].name) + "…"}</button>`;
    else if (G.sel && g.options[G.sel] !== undefined) {
      const pts = g.options[G.sel];
      h = `<button class="main moss" data-gn="score">${pts > 0 ? `✅ Anotar ${pts} en ${CAT_NAME[G.sel]}` : `✖ Tachar ${CAT_NAME[G.sel]}`}</button><button class="sec" data-gn="cancel">Cancelar</button>`;
    } else if (!rolled) h = `<button class="main" data-gn="roll">🎲 Tirar los dados</button>`;
    else if (g.rollsLeft > 0) {
      const allHeld = G.held.every(Boolean);
      h = `<button class="main" data-gn="roll" ${allHeld || G.rolling ? "disabled" : ""}>🎲 Tirar de nuevo (${g.rollsLeft})</button><div class="muted" style="max-width:110px;font-size:11px;line-height:1.2">Tocá los dados que querés guardar</div>`;
    } else h = `<button class="main" disabled>Elegí dónde anotar ↓</button>`;
    box.innerHTML = h;
  }
  function sheet(g, flashCell) {
    const rows = g.categories.map((c, ci) => {
      const cells = g.players.map((p, pi) => {
        const val = g.sheets[pi][ci], me = pi === g.seat;
        if (val !== null) return `<td class="${me ? "me " : ""}${val === 0 ? "strike" : "taken"} ${flashCell && flashCell.pi === pi && flashCell.ci === ci ? "flash" : ""}">${val === 0 ? "✕" : val}</td>`;
        if (me && g.options[c] !== undefined) return `<td class="me opt ${g.options[c] === 0 ? "zero" : ""} ${G.sel === c ? "sel" : ""}" data-cat="${c}">${g.options[c] === 0 ? "tachar" : g.options[c]}</td>`;
        return `<td class="${me ? "me" : ""}">·</td>`;
      }).join("");
      return `<tr><td class="cat">${CAT_LABEL[c]}</td>${cells}</tr>`;
    }).join("");
    document.getElementById("gn-sheet").innerHTML = `<table class="gn-sheet"><thead><tr><th></th>${g.players.map((p, i) => `<th class="${g.turn === i && g.winner === null ? "turn" : ""}">${i === g.seat ? "Vos" : esc(p.name)}</th>`).join("")}</tr></thead><tbody>${rows}<tr class="tot"><td class="cat">Total</td>${g.players.map((p) => `<td>${p.total}</td>`).join("")}</tr></tbody></table>`;
  }
  function showEnd(g) {
    if (G.ended) return; G.ended = true;
    const order = g.players.map((p, i) => ({ ...p, i })).sort((a, b) => b.total - a.total);
    const win = g.winners.includes(g.seat), tie = g.winner === -1;
    const title = g.instantWin ? (win ? "🏆 ¡Generala servida!" : "😮 Generala servida de " + esc(g.players[g.winner].name)) : tie ? "🤝 ¡Empate!" : win ? "🏆 ¡Ganaste!" : "😔 Ganó " + esc(g.players[g.winner].name);
    const ov = document.createElement("div"); ov.className = "gn-ovl";
    ov.innerHTML = `<div class="gn-card"><h2>${title}</h2>${g.instantWin ? "" : order.map((p) => `<div class="rk"><span>${p.i === g.seat ? "Vos" : esc(p.name)}</span><span>${p.total}</span></div>`).join("")}<div class="row" style="margin-top:12px"><button class="grow" data-a="leave">Volver a los juegos</button></div></div>`;
    G.el.appendChild(ov);
    if (win) sfx.win(); else if (tie) sfx.draw(); else sfx.lose();
  }
  function bigText(t) { const b = document.createElement("div"); b.className = "gn-big"; b.textContent = t; G.el.appendChild(b); setTimeout(() => b.remove(), 1700); }

  document.addEventListener("click", (e) => {
    if (!G) return;
    const td = e.target.closest("td[data-cat]");
    if (td) { const g = G.g; if (g.turn === g.seat && g.winner === null) { G.sel = G.sel === td.dataset.cat ? null : td.dataset.cat; sfx.tap(); sheet(g); actUi(g); } return; }
    const b = e.target.closest("[data-gn]"); if (!b) return;
    const g = G.g;
    if (b.dataset.gn === "roll") {
      b.disabled = true;
      const first = g.dice.length === 0;
      api.act(first ? { t: "roll" } : { t: "roll", keep: G.held.slice() });
    } else if (b.dataset.gn === "score") { const c = G.sel; G.sel = null; api.act({ t: "score", cat: c }); }
    else if (b.dataset.gn === "cancel") { G.sel = null; sheet(g); actUi(g); }
  });

  async function state(view) {
    const g = view.game;
    if (!G || G.el !== document.getElementById("gn-stage")) { if (G) { try { G.stage.dispose(); } catch (e) {} } G = null; build(g); }
    else G.g = g;
    // 1) tiro nuevo → animación
    if (g.lastRoll && g.lastRoll.n > G.lastRollN) {
      G.lastRollN = g.lastRoll.n;
      G.sel = null;
      chips(g); info(g); document.getElementById("gn-act").innerHTML = '<button class="main" disabled>…</button>';
      await rollAnim(g.lastRoll);
      if (g.instantWin) bigText("¡GENERALA SERVIDA!");
    }
    // 2) anotación nueva
    let flash = null;
    if (g.lastScore && g.lastScore.n > G.lastScoreN) {
      G.lastScoreN = g.lastScore.n;
      flash = { pi: g.lastScore.seat, ci: g.categories.indexOf(g.lastScore.cat) };
      if (g.lastScore.seat !== g.seat) sfx.score(); else sfx.score();
      if (g.lastScore.cat === "generala" && g.lastScore.points === 50) bigText("¡GENERALA! 50");
      else if (g.lastScore.points >= 100) bigText("¡DOBLE GENERALA! 100");
      else if (g.lastScore.servida) bigText("¡Servida! +5");
    }
    // 3) mesa: dados del turno actual, o vacía si empieza un turno
    if (g.dice.length === 5) {
      g.dice.forEach((v, i) => { if (!G.rolling) { const d = G.dice[i]; if (!d.mesh.visible || d.value !== v) placeDie(i, v, !!G.held[i], false); } });
    } else {
      G.dice.forEach((d, i) => { d.mesh.visible = false; G.ringGroup.children[i].visible = false; G.held[i] = false; });
    }
    if (g.turn !== g.seat) G.held = [false, false, false, false, false];
    chips(g); info(g); sheet(g, flash); actUi(g);
    G.stage.invalidate();
    if (g.winner !== null) { await sleep(g.instantWin ? 1300 : 400); showEnd(g); }
  }
  function reset() { if (G) { try { G.stage.dispose(); } catch (e) {} } G = null; }
  return { state, reset };
}
