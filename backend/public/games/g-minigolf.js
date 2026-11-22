// Minigolf: 6 hoyos dibujados en Canvas 2D (pasto con franjas, maderas con relieve, agua animada, molinos, portales).
// El servidor calcula cada tiro y manda la trayectoria; esta pantalla la reproduce y deja apuntar arrastrando hacia atrás.
import { createSfx, rng } from "./g-fx3d.js";

// roundRect no existe en WebViews viejos: se agrega una versión simple
if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.min(typeof r === "number" ? r : 0, w / 2, h / 2);
    this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
  };
}
const WORLD_W = 360, WORLD_H = 600, BALL_R = 5.5, HOLE_R = 10;
const PULL_MAX = 120; // unidades del mundo que hay que arrastrar para el tiro más fuerte
const PCOLORS = ["#e5483b", "#3b82e0", "#f2b630", "#9b59d6"];
const PDARK = ["#8e1f17", "#1b4a91", "#a06f00", "#5b2a85"];

const CSS = `
.mg-wrap{flex:1;min-height:0;display:flex;flex-direction:column;gap:6px}
.mg-chips{flex:none;display:flex;gap:5px}
.mg-chip{flex:1;min-width:0;display:flex;align-items:center;gap:6px;padding:3px 8px;border-radius:12px;background:var(--card);border:2px solid transparent}
.mg-chip.turn{border-color:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 28%,transparent)}
.mg-chip i{width:13px;height:13px;border-radius:50%;background:var(--c);flex:none;box-shadow:inset -2px -2px 3px rgba(0,0,0,.35)}
.mg-chip b{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.mg-chip span{font-weight:800;font-size:14px}
.mg-stage{flex:1;min-height:200px;position:relative;border-radius:20px;overflow:hidden;background:#16241a}
.mg-stage canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;display:block}
.mg-foot{flex:none;display:flex;align-items:center;gap:8px}
.mg-msg{flex:1;text-align:center;font-weight:800;padding:7px 8px;border-radius:12px;background:var(--honey-soft);color:var(--on-honey);font-size:14px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-msg.mine{background:var(--terracotta);color:#fff}
.mg-hud{position:absolute;left:8px;top:8px;right:8px;display:flex;justify-content:space-between;pointer-events:none;font-weight:800;font-size:13px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.9)}
.mg-ovl{position:absolute;inset:0;display:grid;place-items:center;background:rgba(6,12,8,.62);z-index:6;padding:14px}
.mg-card{background:var(--card);border-radius:22px;padding:16px 16px 14px;text-align:center;width:100%;max-width:330px;box-shadow:0 12px 40px rgba(0,0,0,.5);max-height:100%;overflow:auto}
.mg-card h2{font-size:25px;margin-bottom:6px}
.mg-card table{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 10px}
.mg-card th,.mg-card td{padding:4px 3px;border-bottom:1px solid var(--line)}
.mg-card td:first-child,.mg-card th:first-child{text-align:left;font-weight:700}
.mg-card tr.tot td{font-weight:900;border-top:2px solid var(--line)}
.mg-card td.best{color:var(--moss);font-weight:800}
.mg-toast{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);z-index:5;font-family:Georgia,serif;font-weight:900;font-size:26px;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,.85);pointer-events:none;animation:mgt 1.5s ease forwards;white-space:nowrap}
@keyframes mgt{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}18%{transform:translate(-50%,-50%) scale(1.12);opacity:1}78%{opacity:1}100%{transform:translate(-50%,-80%);opacity:0}}
`;

/* ---------- geometría (cliente) para la mira ---------- */
const polySegs = (poly) => poly.map((a, i) => { const b = poly[(i + 1) % poly.length]; return [a[0], a[1], b[0], b[1]]; });
function rayHit(segs, x, y, dx, dy, maxLen) {
  // primer choque de un rayo (con radio de pelota) contra las paredes; devuelve {t, nx, ny}
  let best = null;
  for (const [ax, ay, bx, by] of segs) {
    const ex = bx - ax, ey = by - ay, len = Math.hypot(ex, ey) || 1;
    let nx = -ey / len, ny = ex / len;
    const denom = dx * nx + dy * ny;
    if (Math.abs(denom) < 1e-6) continue;
    // desplazar la pared BALL_R hacia el lado desde el que viene el rayo
    const side = denom > 0 ? -1 : 1;
    const ox = ax + nx * side * BALL_R, oy = ay + ny * side * BALL_R;
    const t = ((ox - x) * nx + (oy - y) * ny) / denom;
    if (t < 0.01 || t > maxLen) continue;
    const px = x + dx * t, py = y + dy * t;
    const u = ((px - ax) * ex + (py - ay) * ey) / (len * len);
    if (u < -0.02 || u > 1.02) continue;
    if (!best || t < best.t) best = { t, nx: nx * side, ny: ny * side };
  }
  return best;
}

export default function (api) {
  const { esc, sleep, S } = api;
  const sfx = createSfx(() => api.Snd.on);
  let M = null, COURSES = null, styleDone = false;

  async function courses() {
    if (!COURSES) { const r = await fetch("golf/courses.json?v=1"); COURSES = await r.json(); }
    return COURSES;
  }
  function ensureStyle() { if (styleDone) return; styleDone = true; const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); }

  /* ---------- capa estática (todo lo que no se mueve) ---------- */
  function pathPoly(g, poly) { g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }

  function renderStatic(course, hi, w, h, dpr, s, ox, oy) {
    const cv = document.createElement("canvas"); cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const g = cv.getContext("2d");
    const r = rng(1000 + hi * 77);
    // fondo (fuera de la cancha): césped oscuro con grano
    const bg = g.createLinearGradient(0, 0, 0, cv.height); bg.addColorStop(0, "#1b2e20"); bg.addColorStop(1, "#122017");
    g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.08)"; g.fillRect(r() * cv.width, r() * cv.height, 2 * dpr, 2 * dpr); }
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);

    // sombra de la cancha sobre el fondo
    g.save(); g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = 18 * s; g.shadowOffsetY = 7 * s; g.fillStyle = "#000"; pathPoly(g, course.outline); g.fill(); g.restore();

    // pasto
    g.save(); pathPoly(g, course.outline); g.clip();
    const grass = g.createLinearGradient(0, 0, WORLD_W, WORLD_H); grass.addColorStop(0, "#58b04d"); grass.addColorStop(1, "#3f9340");
    g.fillStyle = grass; g.fillRect(0, 0, WORLD_W, WORLD_H);
    for (let x = 0, k = 0; x < WORLD_W; x += 24, k++) { g.fillStyle = k % 2 ? "rgba(255,255,255,.055)" : "rgba(0,40,0,.06)"; g.fillRect(x, 0, 24, WORLD_H); }
    for (let i = 0; i < 2600; i++) {
      const x = r() * WORLD_W, y = r() * WORLD_H, l = 2 + r() * 3;
      g.strokeStyle = r() < 0.5 ? "rgba(255,255,255,.10)" : "rgba(10,60,10,.16)"; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 2, y - l); g.stroke();
    }
    const vg = g.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 120, WORLD_W / 2, WORLD_H / 2, 420); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,30,0,.28)");
    g.fillStyle = vg; g.fillRect(0, 0, WORLD_W, WORLD_H);

    // arena
    for (const poly of course.sand || []) {
      g.save(); pathPoly(g, poly); g.fillStyle = "#e9d69b"; g.fill(); g.clip();
      for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? "rgba(150,115,50,.35)" : "rgba(255,248,215,.55)"; g.fillRect(poly[0][0] + (r() - 0.2) * 140, poly[0][1] + (r() - 0.2) * 140, 1.1, 1.1); }
      g.restore();
      g.save(); pathPoly(g, poly); g.lineWidth = 3; g.strokeStyle = "rgba(160,125,55,.7)"; g.stroke(); g.restore();
    }
    // agua (base; las ondas se animan arriba)
    for (const poly of course.water || []) {
      g.save(); pathPoly(g, poly);
      const wg = g.createLinearGradient(0, poly[0][1], 0, poly[2] ? poly[2][1] : poly[0][1] + 100); wg.addColorStop(0, "#3d92e0"); wg.addColorStop(1, "#1f62b4");
      g.fillStyle = wg; g.fill(); g.lineWidth = 5; g.strokeStyle = "rgba(255,255,255,.55)"; g.stroke(); g.restore();
    }
    // tee (alfombrita de salida)
    g.save(); g.translate(course.tee[0], course.tee[1]); g.fillStyle = "rgba(20,70,25,.55)"; g.beginPath(); g.roundRect(-16, -13, 32, 26, 6); g.fill(); g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = 1.5; g.stroke(); g.restore();
    // hoyo
    const [hx, hy] = course.hole;
    g.save(); g.fillStyle = "rgba(0,0,0,.25)"; g.beginPath(); g.arc(hx, hy, HOLE_R + 3, 0, 6.3); g.fill();
    const hgrad = g.createRadialGradient(hx - 2, hy - 3, 1, hx, hy, HOLE_R); hgrad.addColorStop(0, "#202020"); hgrad.addColorStop(1, "#000");
    g.fillStyle = hgrad; g.beginPath(); g.arc(hx, hy, HOLE_R, 0, 6.3); g.fill();
    g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 1.3; g.beginPath(); g.arc(hx, hy, HOLE_R, 0.3, 2.3); g.stroke();
    g.restore();
    g.restore(); // fin del clip del pasto

    // paredes del borde (por fuera de la cancha): capas de madera con relieve
    g.save();
    g.beginPath(); g.rect(-40, -40, WORLD_W + 80, WORLD_H + 80); pathPoly2(g, course.outline); g.clip("evenodd");
    g.lineJoin = "round";
    pathPoly(g, course.outline);
    g.lineWidth = 22; g.strokeStyle = "#2f1c0e"; g.stroke();
    g.lineWidth = 17; g.strokeStyle = "#7d4f2c"; g.stroke();
    g.lineWidth = 9; g.strokeStyle = "#a8703f"; g.stroke();
    g.lineWidth = 3; g.strokeStyle = "#d09a63"; g.stroke();
    g.restore();
    // obstáculos de madera
    for (const poly of course.blocks || []) {
      g.save(); g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 8; g.shadowOffsetX = 3; g.shadowOffsetY = 5;
      pathPoly(g, poly); g.fillStyle = "#8e5b33"; g.fill(); g.restore();
      g.save(); g.lineJoin = "round"; pathPoly(g, poly); g.fillStyle = "#9b6538"; g.fill();
      g.lineWidth = 3; g.strokeStyle = "#2f1c0e"; g.stroke();
      g.clip(); g.lineWidth = 7; g.strokeStyle = "#c18a55"; pathPoly(g, poly); g.stroke(); g.restore();
    }
    return cv;
  }
  function pathPoly2(g, poly) { poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); }

  /* ---------- pantalla ---------- */
  function build(g, cs) {
    ensureStyle();
    api.screen("minigolf:" + (S.room ? S.room.roomId : ""), `
      <div class="top"><div class="t">⛳ Minigolf</div><button class="sec" data-a="snd">${api.Snd.on ? "🔊" : "🔇"}</button><button class="sec" data-a="quit">✕</button></div>
      <div class="mg-wrap">
        <div class="mg-chips" id="mg-chips"></div>
        <div class="mg-stage" id="mg-stage"><canvas id="mg-cv"></canvas><div class="mg-hud"><span id="mg-hole"></span><span id="mg-strokes"></span></div></div>
        <div class="mg-foot"><div class="mg-msg" id="mg-msg"></div><button class="sec" data-mg="card">📋</button></div>
      </div>`);
    const stage = document.getElementById("mg-stage"), cv = document.getElementById("mg-cv");
    M = {
      g, cs, stage, cv, ctx: cv.getContext("2d"), hole: -1, course: null, segs: [], layer: null,
      w: 0, h: 0, dpr: 1, s: 1, ox: 0, oy: 0,
      balls: g.players.map((p) => ({ x: p.ball[0], y: p.ball[1], vis: true, sunk: false, fade: 1 })),
      trail: [], particles: [], bumpPulse: [], millAngle: [], millT: 0, playing: null, aiming: null, waiting: false,
      lastShotN: g.lastShot ? g.lastShot.n : 0, lastHoleN: g.lastHole ? g.lastHole.n : 0, ended: false, raf: 0, t0: performance.now(),
    };
    setHole(g.hole);
    // ajusta el tamaño cuando cambia la ventana
    const ro = new ResizeObserver(() => { layout(); }); ro.observe(stage); M.ro = ro;
    bindInput();
    layout();
    loop();
  }

  function layout() {
    if (!M) return;
    const w = M.stage.clientWidth, h = M.stage.clientHeight; if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    M.w = w; M.h = h; M.dpr = dpr;
    M.cv.width = Math.round(w * dpr); M.cv.height = Math.round(h * dpr);
    fitView();
  }
  // Encuadra la cancha del hoyo actual (con su borde) para que se vea lo más grande posible.
  function fitView() {
    if (!M || !M.course || !M.w) return;
    const xs = M.course.outline.map((p) => p[0]), ys = M.course.outline.map((p) => p[1]);
    const m = 16, minx = Math.min(...xs) - m, maxx = Math.max(...xs) + m, miny = Math.min(...ys) - m - 14, maxy = Math.max(...ys) + m;
    const bw = maxx - minx, bh = maxy - miny, pad = 8;
    const s = Math.min((M.w - pad * 2) / bw, (M.h - pad * 2) / bh);
    M.s = s; M.ox = (M.w - bw * s) / 2 - minx * s; M.oy = (M.h - bh * s) / 2 - miny * s;
    rebuildLayer();
  }
  function rebuildLayer() {
    if (!M || !M.course || !M.w) return;
    M.layer = renderStatic(M.course, M.hole, M.w, M.h, M.dpr, M.s, M.ox, M.oy);
  }
  function setHole(hi) {
    if (!M || M.hole === hi) return;
    M.hole = hi; M.course = M.cs[hi];
    M.segs = [...polySegs(M.course.outline), ...(M.course.blocks || []).flatMap(polySegs)];
    M.bumpPulse = (M.course.bumpers || []).map(() => 0);
    M.millAngle = (M.course.mills || []).map((m) => m.phase);
    M.trail = []; M.particles = [];
    fitView();
  }

  /* ---------- bucle de dibujo ---------- */
  function loop() {
    if (!M) return;
    M.raf = requestAnimationFrame(loop);
    draw(performance.now());
  }
  function draw(now) {
    const { ctx, w, h, dpr, s, ox, oy } = M; if (!w || !M.course) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (M.layer) ctx.drawImage(M.layer, 0, 0, M.cv.width, M.cv.height); else { ctx.fillStyle = "#16241a"; ctx.fillRect(0, 0, M.cv.width, M.cv.height); }
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    const time = (now - M.t0) / 1000;
    const course = M.course;

    // ondas del agua
    for (const poly of course.water || []) {
      ctx.save(); pathPoly(ctx, poly); ctx.clip();
      const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      ctx.lineWidth = 1.6;
      for (let y = y0 + 6; y < y1; y += 14) {
        ctx.strokeStyle = `rgba(255,255,255,${0.16 + 0.1 * Math.sin(time * 2 + y)})`;
        ctx.beginPath();
        for (let x = x0; x <= x1; x += 6) { const yy = y + Math.sin(x * 0.09 + time * 2.2 + y * 0.3) * 2.4; x === x0 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy); }
        ctx.stroke();
      }
      ctx.restore();
    }
    // portales
    for (const po of course.portals || []) for (const [i, p] of [[0, po.a], [1, po.b]]) drawPortal(ctx, p[0], p[1], time, i);
    // bumpers
    (course.bumpers || []).forEach((b, i) => drawBumper(ctx, b, M.bumpPulse[i] = Math.max(0, (M.bumpPulse[i] || 0) - 0.06)));
    // molinos (la base va debajo de la pelota; las aspas arriba)
    const mills = course.mills || [];
    mills.forEach((m) => drawMillBase(ctx, m));
    // estela
    for (let i = 0; i < M.trail.length; i++) { const t = M.trail[i]; ctx.fillStyle = `rgba(255,255,255,${(i / M.trail.length) * 0.22})`; ctx.beginPath(); ctx.arc(t[0], t[1], BALL_R * (0.35 + 0.5 * i / M.trail.length), 0, 6.3); ctx.fill(); }
    // pelotas (primero las quietas, la que se mueve arriba)
    const order = M.g.players.map((_, i) => i).sort((a, b) => (M.playing && M.playing.seat === a ? 1 : 0) - (M.playing && M.playing.seat === b ? 1 : 0));
    for (const i of order) {
      const b = M.balls[i]; if (!b.vis) continue;
      if (M.g.players[i].done && !(M.playing && M.playing.seat === i)) continue; // ya embocó
      drawBall(ctx, b.x, b.y, i, b.fade, M.g.turn === i && !M.playing && M.g.winner === null, time);
    }
    // aspas de molino
    mills.forEach((m, i) => drawMillArms(ctx, m, M.millAngle[i]));
    // bandera
    drawFlag(ctx, course.hole[0], course.hole[1], time);
    // partículas
    stepParticles(ctx);
    // mira
    if (M.aiming) drawAim(ctx);
  }

  function drawBall(g, x, y, seat, fade, active, time) {
    g.save(); g.globalAlpha = fade;
    if (active) { g.strokeStyle = PCOLORS[seat]; g.globalAlpha = fade * (0.45 + 0.35 * Math.sin(time * 5)); g.lineWidth = 2; g.beginPath(); g.arc(x, y, BALL_R + 4 + Math.sin(time * 5) * 1.2, 0, 6.3); g.stroke(); g.globalAlpha = fade; }
    g.fillStyle = "rgba(0,0,0,.32)"; g.beginPath(); g.ellipse(x + 1.6, y + 2.6, BALL_R * 0.95, BALL_R * 0.7, 0, 0, 6.3); g.fill();
    const rg = g.createRadialGradient(x - 2, y - 2.4, 0.6, x, y, BALL_R);
    rg.addColorStop(0, "#fff"); rg.addColorStop(0.35, PCOLORS[seat]); rg.addColorStop(1, PDARK[seat]);
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, BALL_R, 0, 6.3); g.fill();
    g.fillStyle = "rgba(255,255,255,.85)"; g.beginPath(); g.arc(x - 1.8, y - 2.1, 1.25, 0, 6.3); g.fill();
    g.restore();
  }
  function drawBumper(g, b, pulse) {
    const r = b.r * (1 + pulse * 0.14);
    g.save();
    g.fillStyle = "rgba(0,0,0,.32)"; g.beginPath(); g.ellipse(b.x + 3, b.y + 5, r, r * 0.9, 0, 0, 6.3); g.fill();
    const base = g.createRadialGradient(b.x - r * 0.3, b.y - r * 0.4, 2, b.x, b.y, r);
    base.addColorStop(0, "#fff"); base.addColorStop(1, "#d5cdbf");
    g.fillStyle = base; g.beginPath(); g.arc(b.x, b.y, r, 0, 6.3); g.fill();
    g.lineWidth = 2; g.strokeStyle = "#8f877a"; g.stroke();
    const dome = g.createRadialGradient(b.x - r * 0.28, b.y - r * 0.32, 1, b.x, b.y, r * 0.72);
    dome.addColorStop(0, pulse > 0.2 ? "#ffb7a8" : "#ff8a7a"); dome.addColorStop(0.5, "#e5483b"); dome.addColorStop(1, "#8e1f17");
    g.fillStyle = dome; g.beginPath(); g.arc(b.x, b.y, r * 0.72, 0, 6.3); g.fill();
    g.fillStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.ellipse(b.x - r * 0.22, b.y - r * 0.3, r * 0.2, r * 0.12, -0.6, 0, 6.3); g.fill();
    g.restore();
  }
  function drawPortal(g, x, y, time, i) {
    g.save(); g.translate(x, y);
    const col = i ? ["#44e0ff", "#1a7fb8"] : ["#d58bff", "#7a2bb8"];
    const gl = g.createRadialGradient(0, 0, 2, 0, 0, 20); gl.addColorStop(0, col[0] + "dd"); gl.addColorStop(1, col[1] + "00");
    g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 20, 0, 6.3); g.fill();
    for (let k = 0; k < 3; k++) { g.save(); g.rotate(time * (i ? -2 : 2) + k * 2.1); g.strokeStyle = col[0]; g.globalAlpha = 0.85 - k * 0.2; g.lineWidth = 2.2 - k * 0.4; g.beginPath(); g.arc(0, 0, 13 - k * 3.5, 0, 4.4); g.stroke(); g.restore(); }
    g.fillStyle = "#0a0414"; g.beginPath(); g.arc(0, 0, 4, 0, 6.3); g.fill();
    g.restore();
  }
  function drawMillBase(g, m) {
    g.save(); g.fillStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.ellipse(m.x + 4, m.y + 6, 13, 11, 0, 0, 6.3); g.fill(); g.restore();
  }
  function drawMillArms(g, m, ang) {
    g.save(); g.translate(m.x, m.y);
    for (let k = 0; k < m.arms; k++) {
      const a = ang + (k * Math.PI * 2) / m.arms;
      // sombra
      g.save(); g.translate(4, 6); g.rotate(a); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(0, -m.w / 2, m.len, m.w); g.restore();
      g.save(); g.rotate(a);
      g.fillStyle = "#7b4a24"; g.fillRect(0, -m.w / 2, m.len, m.w);
      g.fillStyle = "#c18a55"; g.fillRect(0, -m.w / 2, m.len, 2);
      // vela
      g.fillStyle = "#f2ead6"; g.fillRect(m.len * 0.25, -m.w * 1.5, m.len * 0.75, m.w * 1.5);
      g.strokeStyle = "rgba(170,60,40,.65)"; g.lineWidth = 1.5; for (let i = 1; i < 5; i++) { const xx = m.len * 0.25 + (m.len * 0.75 * i) / 5; g.beginPath(); g.moveTo(xx, -m.w * 1.5); g.lineTo(xx, 0); g.stroke(); }
      g.restore();
    }
    // eje
    const hub = g.createRadialGradient(-2, -2, 1, 0, 0, 10); hub.addColorStop(0, "#d9b27a"); hub.addColorStop(1, "#5a3414");
    g.fillStyle = hub; g.beginPath(); g.arc(0, 0, 9, 0, 6.3); g.fill(); g.strokeStyle = "#2f1c0e"; g.lineWidth = 1.5; g.stroke();
    g.restore();
  }
  function drawFlag(g, hx, hy, time) {
    g.save(); g.translate(hx, hy);
    g.strokeStyle = "rgba(0,0,0,.28)"; g.lineWidth = 2; g.beginPath(); g.moveTo(1.5, 0); g.lineTo(9, -30); g.stroke();
    g.strokeStyle = "#f5f0e6"; g.lineWidth = 2.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -34); g.stroke();
    g.fillStyle = "#e5483b"; g.beginPath(); g.moveTo(0, -34);
    const wv = Math.sin(time * 5) * 1.8;
    g.quadraticCurveTo(10, -31 + wv, 19, -27 + wv * 1.4); g.quadraticCurveTo(10, -23 - wv, 0, -21); g.closePath(); g.fill();
    g.restore();
  }

  /* ---------- partículas ---------- */
  function burst(x, y, n, colors, speed, life, grav = 0) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.3, v = speed * (0.3 + Math.random()); M.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, c: colors[(Math.random() * colors.length) | 0], r: 1 + Math.random() * 1.8, grav }); }
  }
  function stepParticles(g) {
    M.particles = M.particles.filter((p) => p.life > 0);
    for (const p of M.particles) {
      p.x += p.vx / 60; p.y += p.vy / 60; p.vy += p.grav / 60; p.life -= 1 / 60;
      g.globalAlpha = Math.max(0, p.life / p.max); g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.3); g.fill();
    }
    g.globalAlpha = 1;
  }

  /* ---------- mira ---------- */
  function drawAim(g) {
    const a = M.aiming, me = M.g.seat, b = M.balls[me];
    if (a.power < 0.03) return;
    const dx = Math.cos(a.angle), dy = Math.sin(a.angle);
    // banda elástica hacia atrás
    g.save();
    g.strokeStyle = "rgba(255,255,255,.55)"; g.lineWidth = 2.5; g.lineCap = "round";
    g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - dx * a.power * 46, b.y - dy * a.power * 46); g.stroke();
    // línea de puntos con un rebote
    const len = 70 + a.power * 230;
    let x = b.x, y = b.y, d = [dx, dy], left = len;
    g.setLineDash([2, 6]); g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,.95)";
    for (let seg = 0; seg < 2 && left > 0; seg++) {
      const hit = rayHit(M.segs, x, y, d[0], d[1], left);
      const l = hit ? hit.t : left;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + d[0] * l, y + d[1] * l); g.stroke();
      if (!hit) { x += d[0] * l; y += d[1] * l; break; }
      x += d[0] * l; y += d[1] * l; left -= l;
      const dot = d[0] * hit.nx + d[1] * hit.ny; d = [d[0] - 2 * dot * hit.nx, d[1] - 2 * dot * hit.ny];
      g.fillStyle = "rgba(255,255,255,.9)"; g.beginPath(); g.arc(x, y, 3, 0, 6.3); g.fill();
    }
    g.setLineDash([]);
    // flecha
    g.fillStyle = "#fff"; g.translate(x, y); g.rotate(Math.atan2(d[1], d[0])); g.beginPath(); g.moveTo(8, 0); g.lineTo(-3, -6); g.lineTo(-3, 6); g.closePath(); g.fill();
    g.restore();
    // anillo de potencia
    g.save(); g.lineWidth = 3.2; g.lineCap = "round";
    const col = a.power < 0.5 ? "#6fe08a" : a.power < 0.8 ? "#ffd54a" : "#ff6a4a";
    g.strokeStyle = "rgba(0,0,0,.3)"; g.beginPath(); g.arc(b.x, b.y, 15, 0, 6.3); g.stroke();
    g.strokeStyle = col; g.beginPath(); g.arc(b.x, b.y, 15, -Math.PI / 2, -Math.PI / 2 + a.power * Math.PI * 2); g.stroke();
    g.restore();
  }

  function bindInput() {
    const cv = M.cv;
    const toWorld = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - M.ox) / M.s, (e.clientY - r.top - M.oy) / M.s]; };
    cv.addEventListener("pointerdown", (e) => {
      sfx.unlock();
      if (!canShoot()) return;
      M.aiming = { start: toWorld(e), angle: 0, power: 0 };
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    });
    cv.addEventListener("pointermove", (e) => {
      if (!M.aiming) return;
      const [x, y] = toWorld(e), dx = x - M.aiming.start[0], dy = y - M.aiming.start[1];
      const d = Math.hypot(dx, dy);
      M.aiming.power = Math.min(1, Math.max(0, (d - 6) / PULL_MAX));
      M.aiming.angle = Math.atan2(-dy, -dx); // se tira al lado contrario del arrastre
    });
    const end = () => {
      const a = M.aiming; M.aiming = null;
      if (!a || a.power < 0.06 || !canShoot()) return;
      M.waiting = true; msg();
      api.act({ t: "shot", angle: a.angle, power: a.power });
    };
    cv.addEventListener("pointerup", end);
    cv.addEventListener("pointercancel", () => { M.aiming = null; });
  }
  const canShoot = () => M && !M.ended && !M.playing && !M.waiting && M.g.winner === null && M.g.turn === M.g.seat && !M.g.players[M.g.seat].done;

  /* ---------- reproducción de un tiro ---------- */
  async function playShot(sh) {
    if (M.hole !== sh.hole) setHole(sh.hole);
    const seat = sh.seat, ball = M.balls[seat], fr = sh.frames;
    ball.x = sh.from[0]; ball.y = sh.from[1]; ball.vis = true; ball.sunk = false; ball.fade = 1;
    M.trail = []; M.waiting = false;
    M.playing = { seat }; msg();
    const n = fr.length / 2;
    sfx.hit(Math.min(1, Math.hypot(fr[2] - fr[0], fr[3] - fr[1]) / 9));
    burst(sh.from[0], sh.from[1], 7, ["#cfeea8", "#8cd16c", "#ffffff"], 38, 0.5);
    const t0 = performance.now(), mills = M.course.mills || [];
    let lastIdx = 0, prevDir = null, lastBump = [], portalCool = 0;
    await new Promise((res) => {
      const step = () => {
        if (!M) return res();
        const el = (performance.now() - t0) / 1000, idxF = Math.min(n - 1, el * 60), i = Math.floor(idxF), f = idxF - i;
        const x = fr[i * 2] + ((fr[Math.min(n - 1, i + 1) * 2] - fr[i * 2]) * f), y = fr[i * 2 + 1] + ((fr[Math.min(n - 1, i + 1) * 2 + 1] - fr[i * 2 + 1]) * f);
        // eventos entre el cuadro anterior y este (rebotes, bumpers, portales)
        for (let k = lastIdx + 1; k <= i; k++) {
          const dx = fr[k * 2] - fr[(k - 1) * 2], dy = fr[k * 2 + 1] - fr[(k - 1) * 2 + 1], sp = Math.hypot(dx, dy);
          if (sp > 22) { sfx.portal(); burst(fr[(k - 1) * 2], fr[(k - 1) * 2 + 1], 12, ["#d58bff", "#44e0ff", "#fff"], 60, 0.6); burst(fr[k * 2], fr[k * 2 + 1], 12, ["#d58bff", "#44e0ff", "#fff"], 60, 0.6); prevDir = null; continue; }
          if (sp > 0.4) {
            const dir = Math.atan2(dy, dx);
            if (prevDir !== null) {
              let da = Math.abs(dir - prevDir); if (da > Math.PI) da = 2 * Math.PI - da;
              if (da > 0.35) {
                (M.course.bumpers || []).forEach((b, bi) => { if (Math.hypot(fr[k * 2] - b.x, fr[k * 2 + 1] - b.y) < b.r + BALL_R + 3) { M.bumpPulse[bi] = 1; sfx.bump(); burst(b.x, b.y, 6, ["#ffd54a", "#fff"], 50, 0.35); } });
                sfx.bounce(Math.min(1, sp / 6));
                burst(fr[k * 2], fr[k * 2 + 1], 3, ["#ffffff", "#cfeea8"], 28, 0.3);
              }
            }
            prevDir = dir;
          }
        }
        lastIdx = i;
        ball.x = x; ball.y = y;
        M.trail.push([x, y]); if (M.trail.length > 14) M.trail.shift();
        // molinos al ritmo del servidor
        mills.forEach((m, mi) => { M.millAngle[mi] = m.phase + m.speed * el; });
        if (el >= (n - 1) / 60) return res();
        requestAnimationFrame(step);
      };
      step();
    });
    // final del tiro
    M.trail = [];
    if (sh.outcome === "hole") {
      sfx.plop();
      for (let k = 0; k < 18; k++) { ball.fade = 1 - k / 18; await sleep(16); }
      ball.vis = false; ball.sunk = true; ball.fade = 1;
      burst(M.course.hole[0], M.course.hole[1], 26, ["#ffd54a", "#e5483b", "#3b82e0", "#fff", "#6fe08a"], 90, 1.1, 90);
      sfx.cheer();
      toast(sh.strokesNow === 1 ? "¡HOYO EN UNO! 🎉" : "¡Embocó! ⛳");
      await sleep(900);
    } else if (sh.outcome === "water") {
      sfx.splash();
      burst(ball.x, ball.y, 26, ["#bfe3ff", "#ffffff", "#5aa9ec"], 80, 0.8, 140);
      ball.vis = false; toast("¡Al agua! +1");
      await sleep(900);
      ball.x = sh.from[0]; ball.y = sh.from[1]; ball.vis = true; ball.fade = 0;
      for (let k = 0; k <= 12; k++) { ball.fade = k / 12; await sleep(16); }
    } else if (sh.pickedUp) {
      toast("Máximo de golpes: se levanta la pelota");
      await sleep(900);
    }
    // el molino vuelve a su posición inicial
    const start = (M.course.mills || []).map((m, mi) => M.millAngle[mi]);
    const t1 = performance.now();
    await new Promise((res) => { const st = () => { const k = Math.min(1, (performance.now() - t1) / 450); (M.course.mills || []).forEach((m, mi) => { M.millAngle[mi] = start[mi] + (((m.phase - start[mi]) % (Math.PI * 2 / m.arms)) * k); }); if (k < 1) requestAnimationFrame(st); else res(); }; st(); });
    (M.course.mills || []).forEach((m, mi) => { M.millAngle[mi] = m.phase; });
    M.playing = null;
  }

  function toast(t) { const el = document.createElement("div"); el.className = "mg-toast"; el.textContent = t; M.stage.appendChild(el); setTimeout(() => el.remove(), 1600); }

  /* ---------- paneles ---------- */
  function chips(g) {
    document.getElementById("mg-chips").innerHTML = g.players.map((p, i) => `<div class="mg-chip ${g.turn === i && g.winner === null ? "turn" : ""}" style="--c:${PCOLORS[i]}"><i></i><b>${i === g.seat ? "Vos" : esc(p.name)}</b><span>${p.done ? "✓" : p.cur}</span></div>`).join("");
  }
  function msg() {
    const el = document.getElementById("mg-msg"); if (!el || !M) return;
    const g = M.g; let t = "", cls = "";
    if (g.winner !== null) t = "Terminó la partida";
    else if (M.playing || M.waiting) t = "…";
    else if (g.turn === g.seat) { t = g.players[g.seat].done ? "Esperá a los demás" : "Tu turno: arrastrá hacia atrás y soltá"; cls = "mine"; }
    else t = "Juega " + g.players[g.turn].name;
    el.textContent = t; el.className = "mg-msg " + cls;
  }
  function hud(g) {
    const c = M.cs[g.hole];
    document.getElementById("mg-hole").textContent = `Hoyo ${g.hole + 1}/${g.holes} · ${c.name} · Par ${c.par}`;
    document.getElementById("mg-strokes").textContent = `Tus golpes: ${g.players[g.seat].cur}`;
  }
  function scoreTable(g, upto) {
    const holes = upto ?? g.players[0].strokes.length;
    const cols = Array.from({ length: holes }, (_, i) => i);
    const minPer = cols.map((i) => Math.min(...g.players.map((p) => p.strokes[i])));
    return `<table><thead><tr><th></th>${cols.map((i) => `<th>${i + 1}</th>`).join("")}<th>Tot</th></tr></thead><tbody>${g.players.map((p, pi) => `<tr><td><span style="color:${PCOLORS[pi]}">●</span> ${pi === g.seat ? "Vos" : esc(p.name)}</td>${cols.map((i) => `<td class="${p.strokes[i] === minPer[i] ? "best" : ""}">${p.strokes[i]}</td>`).join("")}<td><b>${p.strokes.slice(0, holes).reduce((a, b) => a + b, 0)}</b></td></tr>`).join("")}<tr class="tot"><td>Par</td>${cols.map((i) => `<td>${M.cs[i].par}</td>`).join("")}<td>${cols.reduce((a, i) => a + M.cs[i].par, 0)}</td></tr></tbody></table>`;
  }
  function overlay(html, auto) {
    const ov = document.createElement("div"); ov.className = "mg-ovl"; ov.innerHTML = `<div class="mg-card">${html}</div>`;
    M.stage.appendChild(ov);
    return new Promise((res) => { const done = () => { ov.remove(); res(); }; ov.addEventListener("click", (e) => { if (e.target.closest("[data-mg=close]") || (auto && e.target === ov)) done(); }); if (auto) setTimeout(done, auto); });
  }
  async function holeResult(g) {
    const hi = g.lastHole.hole, last = hi + 1 >= g.holes;
    if (last) return; // el final tiene su propia pantalla
    const mine = g.lastHole.strokes[g.seat], par = M.cs[hi].par;
    const name = mine === 1 ? "¡Hoyo en uno!" : mine < par ? "¡Bajo el par!" : mine === par ? "Par" : mine === par + 1 ? "Un golpe sobre el par" : "Sobre el par";
    await overlay(`<h2>Hoyo ${hi + 1} terminado</h2><div class="muted">${esc(M.cs[hi].name)} · ${name}</div>${scoreTable(g)}<button class="big" data-mg="close" style="width:100%">Siguiente hoyo ▶</button>`, 6500);
  }
  function showEnd(g) {
    if (M.ended) return; M.ended = true;
    const win = g.winners.includes(g.seat), tie = g.winner === -1;
    const title = tie ? "🤝 ¡Empate!" : win ? "🏆 ¡Ganaste!" : "😔 Ganó " + esc(g.players[g.winner].name);
    const ov = document.createElement("div"); ov.className = "mg-ovl";
    ov.innerHTML = `<div class="mg-card"><h2>${title}</h2>${scoreTable(g)}<div class="row"><button class="grow" data-a="leave">Volver a los juegos</button></div></div>`;
    M.stage.appendChild(ov);
    if (win) sfx.win(); else if (tie) sfx.draw(); else sfx.lose();
  }

  document.addEventListener("click", (e) => {
    if (!M) return;
    const b = e.target.closest("[data-mg=card]"); if (!b) return;
    overlay(`<h2>Planilla</h2>${scoreTable(M.g, Math.max(1, M.g.players[0].strokes.length) || 1)}<button class="sec" data-mg="close" style="width:100%">Cerrar</button>`);
  });

  /* ---------- estado ---------- */
  async function state(view) {
    const g = view.game;
    if (!M || M.stage !== document.getElementById("mg-stage")) {
      if (M) teardown();
      const cs = await courses();
      build(g, cs);
    }
    M.g = g;
    const sh = g.lastShot;
    if (sh && sh.n > M.lastShotN) { M.lastShotN = sh.n; chips(g); await playShot(sh); }
    if (g.lastHole && g.lastHole.n > M.lastHoleN) { M.lastHoleN = g.lastHole.n; if (g.winner === null) await holeResult(g); }
    // sincronizar con lo que dice el servidor
    if (M.hole !== g.hole) { setHole(g.hole); toast(`Hoyo ${g.hole + 1}: ${M.cs[g.hole].name}`); }
    g.players.forEach((p, i) => { const b = M.balls[i]; b.x = p.ball[0]; b.y = p.ball[1]; b.vis = true; b.fade = 1; });
    M.waiting = false;
    chips(g); msg(); hud(g);
    if (g.winner !== null) { await sleep(500); showEnd(g); }
  }
  function teardown() { if (!M) return; cancelAnimationFrame(M.raf); try { M.ro.disconnect(); } catch (e) {} M = null; }
  return { state, reset: teardown };
}
