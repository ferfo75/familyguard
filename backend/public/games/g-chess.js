// Ajedrez 3D: tablero y piezas de madera dibujados con Three.js (todo generado por código, sin imágenes).
// Las reglas las decide el servidor; acá solo se muestra, se elige la pieza y se anima la jugada.
import { THREE, createStage, envMap, woodTexture, createSfx, isLowEnd } from "./g-fx3d.js";
const LOW = isLowEnd();

const GLYPH = { w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" }, b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" } };
const sqXY = (sq) => [sq.charCodeAt(0) - 97, Number(sq[1]) - 1];
const posOf = (sq) => { const [f, r] = sqXY(sq); return new THREE.Vector3(f - 3.5, 0, 3.5 - r); };
const sqName = (f, r) => String.fromCharCode(97 + f) + (r + 1);

const CSS = `
.ch-wrap{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px}
.ch-stage{flex:1;min-height:180px;position:relative;border-radius:22px;overflow:hidden;background:#1c1510;box-shadow:inset 0 0 0 2px rgba(255,255,255,.06)}
.ch-stage::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 46%,transparent 52%,rgba(0,0,0,.6) 100%)}
.ch-bar{flex:none;display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:14px;background:var(--card);border:2px solid transparent}
.ch-bar.turn{border-color:#E0A83A;box-shadow:0 0 0 3px rgba(224,168,58,.25)}
.ch-bar .dot{width:26px;height:26px;font-size:12px}
.ch-bar .nm{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:36%}
.ch-bar .cap{flex:1;text-align:right;font-size:17px;letter-spacing:-2px;white-space:nowrap;overflow:hidden;color:var(--cocoa);opacity:.85}
.ch-foot{flex:none;display:flex;align-items:center;gap:8px}
.ch-status{flex:1;text-align:center;font-weight:800;padding:7px 8px;border-radius:12px;background:var(--honey-soft);color:var(--on-honey);font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ch-status.mine{background:var(--terracotta);color:#fff}.ch-status.bad{background:var(--brick);color:#fff}
.ch-ovl{position:absolute;inset:0;display:grid;place-items:center;background:rgba(10,6,3,.55);z-index:5}
.ch-card{background:var(--card);border-radius:22px;padding:18px 20px;text-align:center;max-width:290px;box-shadow:0 12px 40px rgba(0,0,0,.5)}
.ch-card h2{font-size:28px;margin-bottom:4px}.ch-card p{margin:0 0 14px;color:var(--muted)}
.ch-promo{display:flex;gap:8px;justify-content:center;margin-top:10px}
.ch-promo button{font-size:34px;line-height:1;padding:8px 12px;background:#fff;color:#33261C;border-radius:14px}
.ch-toast{position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:6px 16px;border-radius:999px;background:var(--brick);color:#fff;font-weight:800;font-size:15px;z-index:4;pointer-events:none;animation:chpop .35s ease}
@keyframes chpop{from{transform:translateX(-50%) scale(.6);opacity:0}}
`;

export default function (api) {
  const { esc, sleep, S } = api;
  const sfx = createSfx(() => api.Snd.on);
  let C = null;
  let styleDone = false;

  /* ---------- geometrías (se arman una sola vez) ---------- */
  let GEO = null;
  const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg);
  const BASE = [[0, 0], [0.33, 0], [0.355, 0.025], [0.35, 0.07], [0.3, 0.1], [0.25, 0.13]];
  function geoms() {
    if (GEO) return GEO;
    const g = {};
    g.p = lathe([...BASE, [0.16, 0.2], [0.115, 0.3], [0.13, 0.37], [0.2, 0.4], [0.2, 0.43], [0.13, 0.46], [0.16, 0.51], [0.185, 0.57], [0.17, 0.64], [0.12, 0.69], [0.05, 0.71], [0, 0.715]]);
    g.r = lathe([...BASE, [0.2, 0.19], [0.185, 0.5], [0.23, 0.56], [0.3, 0.64], [0.3, 0.78], [0.21, 0.78], [0, 0.78]]);
    g.b = lathe([...BASE, [0.17, 0.2], [0.12, 0.38], [0.2, 0.46], [0.22, 0.5], [0.15, 0.53], [0.21, 0.6], [0.245, 0.7], [0.22, 0.82], [0.15, 0.93], [0.07, 0.99], [0, 1.0]]);
    g.q = lathe([...BASE, [0.19, 0.2], [0.13, 0.42], [0.17, 0.5], [0.27, 0.6], [0.3, 0.74], [0.25, 0.86], [0.29, 0.94], [0.27, 1.0], [0.18, 1.02], [0, 1.02]]);
    g.k = lathe([...BASE, [0.19, 0.2], [0.13, 0.44], [0.17, 0.52], [0.27, 0.62], [0.3, 0.76], [0.26, 0.9], [0.28, 0.99], [0.2, 1.05], [0.1, 1.07], [0, 1.07]]);
    // base del caballo + cabeza extruida con un contorno suavizado
    g.nBase = lathe([...BASE, [0.28, 0.17], [0.26, 0.2], [0, 0.2]]);
    const pts = [[-0.26, 0.19], [-0.31, 0.45], [-0.25, 0.7], [-0.17, 0.9], [-0.11, 1.03], [-0.03, 1.13], [0.02, 1.01], [0.12, 0.98], [0.28, 0.85], [0.41, 0.74], [0.4, 0.66], [0.27, 0.64], [0.14, 0.6], [0.2, 0.46], [0.3, 0.3], [0.3, 0.19]]
      .map((p) => new THREE.Vector3(p[0], p[1], 0));
    const curve = new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.35);
    const shape = new THREE.Shape(curve.getPoints(90).map((p) => new THREE.Vector2(p.x, p.y)));
    g.nHead = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.07, bevelSegments: 5, curveSegments: 12 });
    g.nHead.translate(0, 0, -0.1);
    g.sphere = new THREE.SphereGeometry(1, 20, 14);
    g.box = new THREE.BoxGeometry(1, 1, 1);
    GEO = g;
    return g;
  }
  const MATS = {};
  function mat(color) {
    if (!MATS[color]) {
      MATS[color] = color === "w"
        ? new THREE.MeshPhysicalMaterial({ color: 0xf1e7d0, roughness: 0.32, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.25, envMapIntensity: 1.0 })
        : new THREE.MeshPhysicalMaterial({ color: 0x2b211b, roughness: 0.28, metalness: 0.05, clearcoat: 0.7, clearcoatRoughness: 0.2, envMapIntensity: 1.15 });
    }
    return MATS[color];
  }
  const accent = (color) => (color === "w" ? new THREE.MeshStandardMaterial({ color: 0x8c2f1f, roughness: 0.4 }) : new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.3, metalness: 0.6 }));
  const MATS2 = {};
  const acc = (c) => (MATS2[c] ||= accent(c));

  function makePiece(type, color, sq) {
    const g = geoms();
    const grp = new THREE.Group();
    const m = mat(color);
    const add = (geo, material = m) => { const me = new THREE.Mesh(geo, material); me.castShadow = true; me.receiveShadow = true; grp.add(me); return me; };
    if (type === "n") {
      add(g.nBase);
      const head = new THREE.Group();
      const hm = new THREE.Mesh(g.nHead, m); hm.castShadow = true; hm.receiveShadow = true; head.add(hm);
      const eyeMat = new THREE.MeshStandardMaterial({ color: color === "w" ? 0x1a1410 : 0xe8d9b0, roughness: 0.2 });
      for (const sd of [-1, 1]) {
        const eye = new THREE.Mesh(g.sphere, eyeMat); eye.scale.setScalar(0.035); eye.position.set(0.15, 0.86, sd * 0.17); head.add(eye);
      }
      // mira hacia el rival, un poco de costado para que se vea el perfil
      const side = sq && sq.charCodeAt(0) - 97 < 4 ? 1 : -1;
      head.rotation.y = (color === "w" ? Math.PI / 2 : -Math.PI / 2) + side * 0.85 * (color === "w" ? 1 : -1);
      grp.add(head);
    } else {
      add(g[type]);
      if (type === "r") {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const mer = add(g.box); mer.scale.set(0.12, 0.14, 0.12); mer.position.set(Math.cos(a) * 0.245, 0.85, Math.sin(a) * 0.245); mer.rotation.y = -a;
        }
      } else if (type === "b") {
        const k = add(g.sphere); k.scale.setScalar(0.06); k.position.y = 1.03;
        const slit = add(g.box, acc(color)); slit.scale.set(0.03, 0.2, 0.2); slit.position.set(0.03, 0.8, 0); slit.rotation.z = -0.5; slit.castShadow = false;
      } else if (type === "q") {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const b = add(g.sphere); b.scale.setScalar(0.05); b.position.set(Math.cos(a) * 0.24, 1.04, Math.sin(a) * 0.24);
        }
        const t = add(g.sphere); t.scale.setScalar(0.085); t.position.y = 1.1;
      } else if (type === "k") {
        const v = add(g.box); v.scale.set(0.07, 0.3, 0.07); v.position.y = 1.22;
        const h = add(g.box); h.scale.set(0.22, 0.07, 0.07); h.position.y = 1.27;
      }
    }
    return grp;
  }

  /* ---------- tablero ---------- */
  function boardTexture() {
    const S2 = 1024, cell = S2 / 8;
    const c = document.createElement("canvas"); c.width = c.height = S2;
    const g = c.getContext("2d");
    const light = woodTexture(256, "#e6c690", "#a77a3a", 11, { knots: 2 }).image;
    const dark = woodTexture(256, "#7b4a2a", "#2b160a", 23, { knots: 2 }).image;
    for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
      const isLight = (f + r) % 2 === 1; // a1 es oscura
      const src = isLight ? light : dark;
      g.save();
      g.translate(f * cell + cell / 2, (7 - r) * cell + cell / 2);
      g.rotate(((f * 7 + r * 3) % 4) * Math.PI / 2);
      g.drawImage(src, ((f * 53 + r * 97) % 120), ((f * 31 + r * 61) % 120), 130, 130, -cell / 2, -cell / 2, cell, cell);
      g.restore();
      g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(f * cell, (7 - r) * cell, cell, 1.5); g.fillRect(f * cell, (7 - r) * cell, 1.5, cell);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }
  function labelsTexture(whiteBottom) {
    const S2 = 1024, c = document.createElement("canvas"); c.width = c.height = S2;
    const g = c.getContext("2d");
    g.fillStyle = "#e9d7b4"; g.font = "bold 38px Georgia,serif"; g.textAlign = "center"; g.textBaseline = "middle";
    const u = S2 / 10; // 10 unidades de lado
    for (let i = 0; i < 8; i++) {
      const ch = String.fromCharCode(97 + i), n = String(i + 1);
      const x = (i + 1.5) * u;
      g.fillText(ch, x, u * 0.5); g.fillText(ch, x, S2 - u * 0.5);
      const y = (8 - i + 0.5) * u; // rango 1 abajo
      g.fillText(n, u * 0.5, y); g.fillText(n, S2 - u * 0.5, y);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  }

  function buildScene(stage) {
    const { scene } = stage;
    scene.background = new THREE.Color(0x1a1410);
    scene.environment = envMap(stage.renderer);
    scene.environmentIntensity = 0.7;
    scene.add(new THREE.HemisphereLight(0xd8e4ff, 0x4a3320, 0.45));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
    sun.position.set(-5, 11, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
    const sc = sun.shadow.camera; sc.left = -6.5; sc.right = 6.5; sc.top = 6.5; sc.bottom = -6.5; sc.near = 2; sc.far = 28;
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
    scene.add(sun);
    const rim = new THREE.DirectionalLight(0x9db8ff, 0.5); rim.position.set(6, 4, -7); scene.add(rim);

    // mesa
    const tableTex = woodTexture(512, "#2c1e14", "#0d0703", 5, { streaks: 200, knots: 5 });
    tableTex.wrapS = tableTex.wrapT = THREE.MirroredRepeatWrapping; tableTex.repeat.set(4, 4);
    const table = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.7 }));
    table.rotation.x = -Math.PI / 2; table.position.y = -0.31; table.receiveShadow = true; scene.add(table);

    // marco y tablero
    const frameTex = woodTexture(512, "#5a3820", "#1f1008", 37, { knots: 3 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.32, 10.2), new THREE.MeshStandardMaterial({ map: frameTex, roughness: 0.4, envMapIntensity: 0.9 }));
    frame.position.y = -0.16; frame.receiveShadow = true; frame.castShadow = true; scene.add(frame);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.42, envMapIntensity: 0.8 }));
    board.rotation.x = -Math.PI / 2; board.position.y = 0.004; board.receiveShadow = true; scene.add(board);
    const trim = new THREE.Mesh(new THREE.RingGeometry(5.6, 5.9, 4, 1, Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0x1c0f07, roughness: 0.5 }));
    trim.rotation.x = -Math.PI / 2; trim.position.y = 0.006; scene.add(trim);
    const labels = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ map: labelsTexture(), transparent: true, depthWrite: false }));
    labels.rotation.x = -Math.PI / 2; labels.position.y = 0.012; scene.add(labels);
    return sun;
  }

  /* ---------- marcadores ---------- */
  function glowTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"); const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, "rgba(255,70,50,.95)"); gr.addColorStop(0.6, "rgba(255,60,40,.45)"); gr.addColorStop(1, "rgba(255,60,40,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  function ensureStyle() {
    if (styleDone) return; styleDone = true;
    const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  }

  /* ---------- pantalla ---------- */
  function build(v) {
    ensureStyle();
    const me = v.players[v.seat], opp = v.players[1 - v.seat];
    api.screen("chess:" + (S.room ? S.room.roomId : ""), `
      <div class="top"><div class="t">♟️ Ajedrez</div><button class="sec" data-a="snd">${api.Snd.on ? "🔊" : "🔇"}</button><button class="sec" data-a="quit">✕</button></div>
      <div class="ch-wrap">
        <div class="ch-bar" id="ch-opp"><div class="dot" style="background:${opp.color === "w" ? "#8a7a68" : "#33261C"}">${esc((opp.name[0] || "?").toUpperCase())}</div><div class="nm">${esc(opp.name)}</div><div class="cap" id="ch-capo"></div></div>
        <div class="ch-stage" id="ch-stage"></div>
        <div class="ch-bar" id="ch-me"><div class="dot" style="background:${me.color === "w" ? "#8a7a68" : "#33261C"}">${esc((me.name[0] || "?").toUpperCase())}</div><div class="nm">${esc(me.name)} (vos)</div><div class="cap" id="ch-capm"></div></div>
        <div class="ch-foot"><button class="sec" data-ch="view">📐 Vista</button><div class="ch-status" id="ch-status"></div><button class="sec" data-ch="resign">🏳️ Rendirme</button></div>
      </div>`);
    const stageEl = document.getElementById("ch-stage");
    const stage = createStage(stageEl, { fov: 44 });
    const sun = buildScene(stage);
    const sel = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.5, depthWrite: false }));
    sel.rotation.x = -Math.PI / 2; sel.position.y = 0.02; sel.visible = false; stage.scene.add(sel);
    const lastA = sel.clone(), lastB = sel.clone();
    for (const l of [lastA, lastB]) { l.material = new THREE.MeshBasicMaterial({ color: 0xa6d85a, transparent: true, opacity: 0.38, depthWrite: false }); l.position.y = 0.016; l.visible = false; stage.scene.add(l); }
    const checkGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false }));
    checkGlow.rotation.x = -Math.PI / 2; checkGlow.position.y = 0.024; checkGlow.visible = false; stage.scene.add(checkGlow);
    const markers = new THREE.Group(); stage.scene.add(markers);
    const quietGeo = new THREE.CircleGeometry(0.2, 28), capGeo = new THREE.RingGeometry(0.34, 0.48, 36);
    const quietMat = new THREE.MeshBasicMaterial({ color: 0x4cd67a, transparent: true, opacity: 0.85, depthWrite: false });
    const capMat = new THREE.MeshBasicMaterial({ color: 0xe0432f, transparent: true, opacity: 0.85, depthWrite: false });

    C = {
      v, stage, stageEl, sun, sel, lastA, lastB, checkGlow, markers, quietGeo, capGeo, quietMat, capMat,
      pieces: new Map(), group: new THREE.Group(), selected: null, lastN: 0, myColor: me.color, view: 0, az: 0, busy: false, ended: false, promo: null,
    };
    stage.scene.add(C.group);
    placeFromFen(v.fen);
    C.lastN = v.moveSeq;
    camera();
    stage.onResize = camera;
    stage.onLost = () => { stageEl.insertAdjacentHTML("beforeend", '<div class="ch-ovl"><div class="ch-card"><p>El gráfico se interrumpió. Cerrá y volvé a abrir el juego.</p></div></div>'); };
    bindInput();
    stage.invalidate();
  }

  const VIEWS = [{ el: 54, dist: 1 }, { el: 86, dist: 0.9 }, { el: 28, dist: 1.1 }];
  function camera() {
    if (!C) return;
    const { stage } = C, cam = stage.camera, w = C.stageEl.clientWidth, h = C.stageEl.clientHeight;
    if (!w || !h) return;
    const aspect = w / h, vfov = (cam.fov * Math.PI) / 180;
    // distancia para que el ancho del tablero entre siempre, también en pantallas angostas
    const need = (5.3 / (Math.tan(vfov / 2) * Math.min(aspect, 1.6)));
    const needV = (6.6 / Math.tan(vfov / 2)) * 0.95;
    const view = VIEWS[C.view];
    const d = Math.max(need, needV * (aspect < 0.9 ? 0.82 : 1)) * view.dist;
    const el = (view.el * Math.PI) / 180;
    const side = C.myColor === "w" ? 1 : -1;
    const az = C.az;
    cam.position.set(Math.sin(az) * Math.cos(el) * d * side, Math.sin(el) * d, Math.cos(az) * Math.cos(el) * d * side + (view.el > 80 ? 0.001 : 0));
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, side * 0.1);
    stage.invalidate();
  }

  function setPiece(sq, type, color, animateIn) {
    const g = makePiece(type, color, sq);
    const p = posOf(sq); g.position.copy(p);
    if (animateIn) { g.scale.setScalar(0.01); tween(300, (t) => { const s = 1 + Math.sin(t * Math.PI) * 0.18; g.scale.setScalar(Math.max(0.01, t < 1 ? t * s : 1)); }); }
    C.group.add(g);
    C.pieces.set(sq, { mesh: g, type, color });
  }
  function clearPieces() { C.pieces.forEach((p) => C.group.remove(p.mesh)); C.pieces.clear(); }
  function parseFen(fen) {
    const out = {};
    fen.split(" ")[0].split("/").forEach((row, i) => {
      let f = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) f += Number(ch);
        else { out[sqName(f, 7 - i)] = { type: ch.toLowerCase(), color: ch === ch.toUpperCase() ? "w" : "b" }; f++; }
      }
    });
    return out;
  }
  function placeFromFen(fen) {
    clearPieces();
    const pos = parseFen(fen);
    Object.keys(pos).forEach((sq) => setPiece(sq, pos[sq].type, pos[sq].color));
    C.stage.invalidate();
  }
  function matchesFen(fen) {
    const pos = parseFen(fen);
    const a = Object.keys(pos), b = [...C.pieces.keys()];
    if (a.length !== b.length) return false;
    return a.every((sq) => C.pieces.has(sq) && C.pieces.get(sq).type === pos[sq].type && C.pieces.get(sq).color === pos[sq].color);
  }

  /* ---------- animación ---------- */
  function tween(ms, fn, ease = (t) => t * t * (3 - 2 * t)) {
    return new Promise((res) => {
      const t0 = performance.now();
      C.stage.addAnim((now) => {
        const t = Math.max(0, Math.min(1, ((now || performance.now()) - t0) / ms));
        fn(ease(t), t);
        if (t >= 1) { res(); return false; }
        return true;
      });
    });
  }

  async function animateMove(m) {
    const piece = C.pieces.get(m.from);
    if (!piece) return;
    const a = posOf(m.from), b = posOf(m.to);
    let victimSq = null;
    if (m.captured) victimSq = m.flags.includes("e") ? sqName(sqXY(m.to)[0], sqXY(m.from)[1]) : m.to;
    const victim = victimSq ? C.pieces.get(victimSq) : null;
    const arc = piece.type === "n" ? 0.95 : 0.32;
    const dist = a.distanceTo(b), dur = Math.min(720, 330 + dist * 70);
    // enroque: se mueve también la torre
    let rook = null;
    if (m.flags.includes("k") || m.flags.includes("q")) {
      const rank = m.seat === 0 ? "1" : "8";
      const [rf, rt] = m.flags.includes("k") ? ["h", "f"] : ["a", "d"];
      const r0 = C.pieces.get(rf + rank);
      if (r0) rook = { p: r0, from: posOf(rf + rank), to: posOf(rt + rank), fromSq: rf + rank, toSq: rt + rank };
    }
    C.pieces.delete(m.from);
    if (rook) C.pieces.delete(rook.fromSq);
    if (victim) C.pieces.delete(victimSq);
    let hit = false;
    await tween(dur, (t) => {
      piece.mesh.position.set(a.x + (b.x - a.x) * t, Math.sin(t * Math.PI) * arc, a.z + (b.z - a.z) * t);
      if (rook) rook.p.mesh.position.set(rook.from.x + (rook.to.x - rook.from.x) * t, Math.sin(t * Math.PI) * 0.22, rook.from.z + (rook.to.z - rook.from.z) * t);
      if (victim && t > 0.82 && !hit) { hit = true; sfx.capture(); }
    }, (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    piece.mesh.position.copy(b);
    C.pieces.set(m.to, piece);
    if (rook) { rook.p.mesh.position.copy(rook.to); C.pieces.set(rook.toSq, rook.p); }
    if (!victim) sfx.wood();
    if (victim) {
      const vp = victim.mesh;
      tween(260, (t) => { vp.scale.setScalar(Math.max(0.01, 1 - t)); vp.position.y = -t * 0.4; vp.rotation.y = t * 3; }).then(() => { C.group.remove(vp); C.stage.invalidate(); });
    }
    if (m.promotion) {
      C.group.remove(piece.mesh);
      setPiece(m.to, m.promotion, piece.color, true);
      sfx.score();
    }
    if (m.check) setTimeout(() => sfx.check(), 160);
    C.stage.invalidate();
  }

  /* ---------- tocar el tablero ---------- */
  function bindInput() {
    const cv = C.stage.canvas, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null;
    cv.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, az: C.az, t: performance.now(), drag: false }; try { cv.setPointerCapture(e.pointerId); } catch (err) {} sfx.unlock(); });
    cv.addEventListener("pointermove", (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 10) down.drag = true;
      if (down.drag) { C.az = Math.max(-0.9, Math.min(0.9, down.az + dx * 0.005)); camera(); }
    });
    cv.addEventListener("pointerup", (e) => {
      const d = down; down = null;
      if (!d || d.drag) return;
      const r = cv.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, C.stage.camera);
      let sq = null;
      const hits = ray.intersectObjects(C.group.children, true);
      if (hits.length) {
        // la pieza tocada → su casilla
        let o = hits[0].object; while (o.parent && o.parent !== C.group) o = o.parent;
        for (const [k, p] of C.pieces) if (p.mesh === o) { sq = k; break; }
      }
      if (!sq) {
        const pt = new THREE.Vector3();
        if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), pt)) {
          const f = Math.floor(pt.x + 4), rk = 7 - Math.floor(pt.z + 4);
          if (f >= 0 && f < 8 && rk >= 0 && rk < 8) sq = sqName(f, rk);
        }
      }
      if (sq) tapSquare(sq);
    });
  }

  function tapSquare(sq) {
    if (!C || C.ended || C.promo) return;
    const v = C.v;
    if (v.turn !== v.seat) { setSel(null); return; }
    const mine = v.legal.filter((m) => m.from === sq);
    if (C.selected) {
      const mv = v.legal.filter((m) => m.from === C.selected && m.to === sq);
      if (mv.length) {
        if (mv[0].promotion) { askPromotion(C.selected, sq); return; }
        send(C.selected, sq);
        return;
      }
    }
    if (mine.length) { setSel(sq); sfx.tap(); } else setSel(null);
  }
  function send(from, to, promotion) {
    setSel(null);
    api.act({ t: "move", from, to, promotion });
  }
  function askPromotion(from, to) {
    C.promo = { from, to };
    const col = C.myColor;
    const ov = document.createElement("div"); ov.className = "ch-ovl"; ov.id = "ch-promo";
    ov.innerHTML = `<div class="ch-card"><b>Coronás: elegí la pieza</b><div class="ch-promo">${["q", "r", "b", "n"].map((t) => `<button data-promo="${t}">${GLYPH[col][t]}</button>`).join("")}</div></div>`;
    C.stageEl.appendChild(ov);
  }
  function setSel(sq) {
    C.selected = sq;
    // marcas
    C.markers.clear();
    if (!sq) { C.sel.visible = false; C.stage.invalidate(); liftOnly(null); return; }
    const p = posOf(sq);
    C.sel.position.set(p.x, 0.02, p.z); C.sel.visible = true;
    const pos = parseFen(C.v.fen);
    for (const m of C.v.legal.filter((x) => x.from === sq)) {
      const capture = !!pos[m.to] || (pos[sq] && pos[sq].type === "p" && m.to[0] !== sq[0]);
      const mk = new THREE.Mesh(capture ? C.capGeo : C.quietGeo, capture ? C.capMat : C.quietMat);
      const q = posOf(m.to); mk.rotation.x = -Math.PI / 2; mk.position.set(q.x, 0.03, q.z);
      C.markers.add(mk);
    }
    liftOnly(sq);
    C.stage.invalidate();
  }
  function liftOnly(sq) {
    C.pieces.forEach((p, k) => { p.mesh.position.y = k === sq ? 0.14 : 0; });
  }

  /* ---------- estado de la pantalla ---------- */
  function ui(v) {
    const turnMine = v.turn === v.seat && v.winner === null;
    document.getElementById("ch-me").classList.toggle("turn", turnMine);
    document.getElementById("ch-opp").classList.toggle("turn", v.turn !== v.seat && v.winner === null);
    const me = v.players[v.seat], opp = v.players[1 - v.seat];
    const glyphs = (seat) => v.captured[seat].map((t) => GLYPH[v.players[seat].color === "w" ? "b" : "w"][t]).join("");
    document.getElementById("ch-capm").textContent = glyphs(v.seat);
    document.getElementById("ch-capo").textContent = glyphs(1 - v.seat);
    const st = document.getElementById("ch-status");
    let txt, cls = "";
    if (v.winner !== null) { txt = v.winner === -1 ? "Tablas" : v.winner === v.seat ? "¡Ganaste!" : "Perdiste"; }
    else if (turnMine) { txt = v.inCheck ? "¡Estás en jaque! Tu turno" : "Tu turno"; cls = v.inCheck ? "bad" : "mine"; }
    else txt = (v.inCheck ? "Jaque a " : "Juega ") + opp.name;
    st.textContent = txt; st.className = "ch-status " + cls;
    // última jugada
    const last = v.moves[v.moves.length - 1];
    if (last) {
      const a = posOf(last.from), b = posOf(last.to);
      C.lastA.position.set(a.x, 0.016, a.z); C.lastB.position.set(b.x, 0.016, b.z); C.lastA.visible = C.lastB.visible = true;
    } else C.lastA.visible = C.lastB.visible = false;
    // jaque: brillo rojo bajo el rey del que mueve
    C.checkGlow.visible = false;
    if (v.inCheck && v.winner !== -1) {
      const turnColor = v.players[v.turn].color;
      for (const [sq, p] of C.pieces) if (p.type === "k" && p.color === turnColor) { const q = posOf(sq); C.checkGlow.position.set(q.x, 0.024, q.z); C.checkGlow.visible = true; }
    }
    C.stage.invalidate();
  }

  function showEnd(v) {
    if (C.ended) return; C.ended = true;
    const win = v.winner === v.seat, draw = v.winner === -1;
    const why = { mate: "Jaque mate", resign: "Abandono", abandon: "Abandono", stalemate: "Rey ahogado", repetition: "Repetición de posición", fifty: "Regla de las 50 jugadas", material: "Material insuficiente", draw: "Tablas" }[v.result] || "";
    let who = "";
    if (v.result === "resign") who = win ? `${esc(v.players[1 - v.seat].name)} se rindió` : "Te rendiste";
    const ov = document.createElement("div"); ov.className = "ch-ovl";
    ov.innerHTML = `<div class="ch-card"><h2>${draw ? "🤝 Tablas" : win ? "🏆 ¡Ganaste!" : "😔 Perdiste"}</h2><p>${esc(who || why)}</p><div class="row"><button class="grow" data-a="leave">Volver a los juegos</button></div></div>`;
    C.stageEl.appendChild(ov);
    if (draw) sfx.draw(); else if (win) sfx.win(); else sfx.lose();
  }

  document.addEventListener("click", async (e) => {
    if (!C) return;
    const pr = e.target.closest("[data-promo]");
    if (pr && C.promo) { const { from, to } = C.promo; C.promo = null; document.getElementById("ch-promo")?.remove(); send(from, to, pr.dataset.promo); return; }
    const b = e.target.closest("[data-ch]"); if (!b) return;
    if (b.dataset.ch === "view") { C.view = (C.view + 1) % VIEWS.length; C.az = 0; camera(); }
    else if (b.dataset.ch === "resign") { if (!C.ended && (await api.ask("¿Rendirte? Perdés la partida.", "Rendirme"))) api.act({ t: "resign" }); }
  });

  async function state(view) {
    const v = view.game;
    if (!C || C.stageEl !== document.getElementById("ch-stage")) { if (C) { try { C.stage.dispose(); } catch (e) {} } C = null; build(v); ui(v); if (v.winner !== null) showEnd(v); return; }
    C.v = v;
    const news = v.moves.filter((m) => m.n > C.lastN);
    setSel(null);
    for (const m of news) { C.lastN = m.n; await animateMove(m); }
    if (!matchesFen(v.fen)) placeFromFen(v.fen);
    C.lastN = Math.max(C.lastN, v.moveSeq);
    ui(v);
    if (v.winner !== null) showEnd(v);
    else if (v.turn === v.seat && news.length) sfx.tap();
  }
  function reset() {
    if (C) { try { C.stage.dispose(); } catch (e) {} }
    C = null;
  }
  return { state, reset };
}
