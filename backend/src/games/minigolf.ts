import fs from "node:fs";
import path from "node:path";

/**
 * Minigolf de 1 a 4 jugadores. El servidor simula cada tiro (física determinista a 240 Hz), manda a todos
 * la trayectoria ya calculada y así las pantallas solo la reproducen: nadie puede hacer trampa y todos
 * ven exactamente lo mismo, aunque su celular sea lento.
 *
 * Los hoyos viven en public/games/golf/courses.json (los lee tanto este archivo como la pantalla).
 * Mundo de 360 x 600 unidades, y hacia abajo; la salida (tee) abajo y el hoyo arriba.
 */

export type Pt = [number, number];
export interface Course {
  name: string;
  par: number;
  tee: Pt;
  hole: Pt;
  outline: Pt[];
  blocks?: Pt[][];
  sand?: Pt[][];
  water?: Pt[][];
  bumpers?: { x: number; y: number; r: number; e?: number }[];
  mills?: { x: number; y: number; len: number; arms: number; w: number; speed: number; phase: number }[];
  portals?: { a: Pt; b: Pt }[];
}

export const WORLD = { w: 360, h: 600 };
export const BALL_R = 5.5;
export const HOLE_R = 10;
export const MAX_STROKES = 7;
const DT = 1 / 240;
const FRAME_EVERY = 4; // 60 cuadros por segundo
const MAX_SIM_SECONDS = 14;
const MAX_V = 640;

let cache: Course[] | null = null;
export function loadCourses(): Course[] {
  if (cache) return cache;
  const file = path.join(__dirname, "..", "..", "public", "games", "golf", "courses.json");
  cache = JSON.parse(fs.readFileSync(file, "utf8")) as Course[];
  return cache;
}

/* ------------------------------ física ------------------------------ */

type Seg = [number, number, number, number];
function polySegs(poly: Pt[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; out.push([a[0], a[1], b[0], b[1]]); }
  return out;
}
export function inPoly(x: number, y: number, poly: Pt[]): boolean {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export interface ShotResult {
  frames: number[]; // x0,y0,x1,y1… a 60 cuadros por segundo
  outcome: "rest" | "hole" | "water";
  end: Pt; // dónde queda la pelota (en "water", dónde cayó)
  seconds: number;
}

/** Simula un tiro. `angle` en radianes (0 = derecha, -π/2 = arriba) y `power` de 0 a 1. */
export function simulate(course: Course, from: Pt, angle: number, power: number): ShotResult {
  const walls: Seg[] = [...polySegs(course.outline)];
  for (const b of course.blocks ?? []) walls.push(...polySegs(b));
  const sandPolys = course.sand ?? [];
  const waterPolys = course.water ?? [];
  const bumpers = course.bumpers ?? [];
  const mills = course.mills ?? [];
  const portals = course.portals ?? [];

  let x = from[0], y = from[1];
  const p = Math.min(1, Math.max(0, power));
  const v0 = Math.min(MAX_V, 60 + 520 * p);
  let vx = Math.cos(angle) * v0, vy = Math.sin(angle) * v0;
  const frames: number[] = [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  let step = 0;
  let portalCool = 0;
  let outcome: ShotResult["outcome"] = "rest";

  const collideSeg = (s: Seg, e: number, ux = 0, uy = 0) => {
    const [ax, ay, bx, by] = s;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + dx * t, cy = ay + dy * t;
    let nx = x - cx, ny = y - cy;
    const d2 = nx * nx + ny * ny;
    if (d2 >= BALL_R * BALL_R) return;
    const d = Math.sqrt(d2);
    if (d < 1e-6) { nx = -dy; ny = dx; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l; } else { nx /= d; ny /= d; }
    // sacar la pelota de la pared
    x = cx + nx * BALL_R; y = cy + ny * BALL_R;
    const rvx = vx - ux, rvy = vy - uy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const k = (1 + e) * vn;
      vx = rvx - k * nx + ux; vy = rvy - k * ny + uy;
      // un poco de roce tangencial
      vx *= 0.995; vy *= 0.995;
    }
  };

  const maxSteps = Math.round(MAX_SIM_SECONDS / DT);
  for (let i = 0; i < maxSteps; i++) {
    const time = i * DT;
    // terreno
    let sandy = false;
    for (const sp of sandPolys) if (inPoly(x, y, sp)) { sandy = true; break; }
    const speed = Math.hypot(vx, vy);
    if (speed > 0) {
      const decel = sandy ? 330 + 1.6 * speed : 62 + 0.42 * speed;
      const ns = Math.max(0, speed - decel * DT);
      vx *= ns / speed; vy *= ns / speed;
    }
    x += vx * DT; y += vy * DT;

    // paredes y obstáculos fijos
    for (const w of walls) collideSeg(w, 0.78);
    for (const b of bumpers) {
      const dx = x - b.x, dy = y - b.y, rr = b.r + BALL_R;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1e-6, nx = dx / d, ny = dy / d;
        x = b.x + nx * rr; y = b.y + ny * rr;
        const vn = vx * nx + vy * ny;
        if (vn < 0) {
          const e = b.e ?? 1.1;
          vx -= (1 + e) * vn * nx; vy -= (1 + e) * vn * ny;
          const sp2 = Math.hypot(vx, vy);
          if (e > 1 && sp2 < 140) { vx = (vx / (sp2 || 1)) * 140; vy = (vy / (sp2 || 1)) * 140; }
        }
      }
    }
    for (const m of mills) {
      const th = m.phase + m.speed * time;
      for (let k = 0; k < m.arms; k++) {
        const a = th + (k * 2 * Math.PI) / m.arms;
        const ex = m.x + Math.cos(a) * m.len, ey = m.y + Math.sin(a) * m.len;
        // velocidad de la punta en el punto de contacto (aprox. en el punto más cercano)
        const sx = m.x, sy = m.y;
        const dx = ex - sx, dy = ey - sy;
        const t = Math.max(0, Math.min(1, ((x - sx) * dx + (y - sy) * dy) / (dx * dx + dy * dy)));
        const cx = sx + dx * t, cy = sy + dy * t;
        const ux = -m.speed * (cy - m.y), uy = m.speed * (cx - m.x);
        // grosor del aspa: se trata como pared de radio w
        const ddx = x - cx, ddy = y - cy, rr = BALL_R + m.w / 2;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 < rr * rr) {
          const d = Math.sqrt(d2) || 1e-6, nx = ddx / d, ny = ddy / d;
          x = cx + nx * rr; y = cy + ny * rr;
          const rvx = vx - ux, rvy = vy - uy, vn = rvx * nx + rvy * ny;
          if (vn < 0) { const k2 = 1.75 * vn; vx = rvx - k2 * nx + ux; vy = rvy - k2 * ny + uy; }
        }
      }
    }

    // portales
    if (portalCool > 0) portalCool -= DT;
    else {
      for (const po of portals) {
        for (const [from2, to2] of [[po.a, po.b], [po.b, po.a]] as [Pt, Pt][]) {
          if (Math.hypot(x - from2[0], y - from2[1]) < 12) {
            x = to2[0]; y = to2[1]; portalCool = 0.7;
            frames.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
            break;
          }
        }
        if (portalCool > 0) break;
      }
    }

    // agua
    for (const wp of waterPolys) {
      if (inPoly(x, y, wp)) { outcome = "water"; break; }
    }
    if (outcome === "water") {
      frames.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
      return { frames, outcome, end: [x, y], seconds: (frames.length / 2 - 1) / 60 };
    }

    // hoyo: atrae si va despacio y cae; si va muy rápido pasa por encima
    const hx = course.hole[0] - x, hy = course.hole[1] - y;
    const hd = Math.hypot(hx, hy);
    const sp = Math.hypot(vx, vy);
    if (hd < HOLE_R + 2) {
      if (sp < 330) {
        const pull = (1 - hd / (HOLE_R + 2)) * 900;
        vx += (hx / (hd || 1)) * pull * DT; vy += (hy / (hd || 1)) * pull * DT;
      }
      if (hd < HOLE_R * 0.8 && sp < 300) {
        x = course.hole[0]; y = course.hole[1];
        frames.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
        return { frames, outcome: "hole", end: [x, y], seconds: (frames.length / 2 - 1) / 60 };
      }
    }

    // cualquier escape de la cancha (por un tiro muy fuerte) vuelve a la última posición
    if (x < -20 || y < -20 || x > WORLD.w + 20 || y > WORLD.h + 20) { x = from[0]; y = from[1]; vx = vy = 0; }

    step++;
    if (step % FRAME_EVERY === 0) frames.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);

    if (Math.hypot(vx, vy) < 5 && i > 10) {
      // quieta (pero no si un aspa de molino todavía podría empujarla: igual se corta, es lo habitual)
      break;
    }
  }
  frames.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  return { frames, outcome, end: [x, y], seconds: (frames.length / 2 - 1) / 60 };
}

/* ------------------------------ partida ------------------------------ */

export interface GolfPlayer { id: string; name: string }

export interface GolfState {
  kind: "minigolf";
  players: GolfPlayer[];
  hole: number; // índice del hoyo actual
  holes: number;
  strokes: number[][]; // strokes[asiento][hoyo] (hoyos terminados)
  cur: number[]; // golpes en el hoyo actual
  done: boolean[]; // ya embocó o levantó en este hoyo
  balls: Pt[];
  turn: number;
  shotSeq: number;
  lastShot: { n: number; seat: number; hole: number; from: Pt; frames: number[]; outcome: ShotResult["outcome"]; end: Pt; penalty: boolean; sunk: boolean; pickedUp: boolean; strokesNow: number } | null;
  holeSeq: number;
  lastHole: { n: number; hole: number; strokes: number[] } | null;
  readyAt: number; // hasta cuándo se está reproduciendo el último tiro en las pantallas
  winner: number | null; // -1 = empate
  winners: number[];
  events: string[];
}

export type Action = { t: "shot"; angle: number; power: number };
export type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

const NUM_HOLES = () => loadCourses().length;

export function createGolf(players: GolfPlayer[]): GolfState {
  if (players.length < 1 || players.length > 4) throw new Error("golf_needs_1_to_4");
  const c = loadCourses()[0];
  return {
    kind: "minigolf", players, hole: 0, holes: NUM_HOLES(), strokes: players.map(() => []), cur: players.map(() => 0),
    done: players.map(() => false), balls: players.map(() => [c.tee[0], c.tee[1]] as Pt), turn: 0, shotSeq: 0, lastShot: null,
    holeSeq: 0, lastHole: null, readyAt: 0, winner: null, winners: [], events: [`Hoyo 1: ${c.name} (par ${c.par}). Empieza ${players[0].name}`],
  };
}

function say(s: GolfState, t: string) { s.events.push(t); if (s.events.length > 20) s.events.shift(); }

function nextPlayer(s: GolfState, from: number): number {
  for (let i = 1; i <= s.players.length; i++) {
    const t = (from + i) % s.players.length;
    if (!s.done[t]) return t;
  }
  return from;
}

function endHole(s: GolfState) {
  const strokes = s.cur.slice();
  s.holeSeq += 1;
  s.lastHole = { n: s.holeSeq, hole: s.hole, strokes };
  s.players.forEach((_, i) => s.strokes[i].push(strokes[i]));
  if (s.hole + 1 >= s.holes) {
    const totals = s.strokes.map((h) => h.reduce((a, b) => a + b, 0));
    const best = Math.min(...totals);
    s.winners = totals.map((t, i) => (t === best ? i : -1)).filter((i) => i >= 0);
    s.winner = s.winners.length === 1 ? s.winners[0] : -1;
    say(s, s.winner === -1 ? "¡Empate!" : `¡Ganó ${s.players[s.winner].name} con ${best} golpes!`);
    return;
  }
  // arranca el que menos golpes hizo (el "honor")
  const min = Math.min(...strokes);
  const first = strokes.indexOf(min);
  s.hole += 1;
  const c = loadCourses()[s.hole];
  s.cur = s.players.map(() => 0);
  s.done = s.players.map(() => false);
  s.balls = s.players.map(() => [c.tee[0], c.tee[1]] as Pt);
  s.turn = first;
  say(s, `Hoyo ${s.hole + 1}: ${c.name} (par ${c.par}). Empieza ${s.players[first].name}`);
}

export function apply(s: GolfState, seat: number, a: Action, now: number = Date.now()): Result {
  if (s.winner !== null) return fail("game_over");
  if (seat < 0 || seat >= s.players.length) return fail("not_a_player");
  if (seat !== s.turn) return fail("not_your_turn");
  if (a.t !== "shot" || typeof a.angle !== "number" || typeof a.power !== "number" || !Number.isFinite(a.angle) || !Number.isFinite(a.power)) return fail("bad_action");
  if (now < s.readyAt) return fail("wait_ball");
  const course = loadCourses()[s.hole];
  const from = s.balls[seat];
  const res = simulate(course, from, a.angle, a.power);
  s.shotSeq += 1;
  s.cur[seat] += 1;
  let penalty = false, sunk = false, pickedUp = false;
  if (res.outcome === "hole") {
    sunk = true; s.done[seat] = true; s.balls[seat] = [course.hole[0], course.hole[1]];
    say(s, `${s.players[seat].name} embocó en ${s.cur[seat]}`);
  } else if (res.outcome === "water") {
    penalty = true; s.cur[seat] += 1; s.balls[seat] = [from[0], from[1]];
    say(s, `${s.players[seat].name} cayó al agua (+1)`);
  } else {
    s.balls[seat] = [res.end[0], res.end[1]];
  }
  if (!sunk && s.cur[seat] >= MAX_STROKES) {
    pickedUp = true; s.done[seat] = true; s.cur[seat] = MAX_STROKES;
    say(s, `${s.players[seat].name} levanta la pelota (máximo ${MAX_STROKES})`);
  }
  s.lastShot = { n: s.shotSeq, seat, hole: s.hole, from: [from[0], from[1]], frames: res.frames, outcome: res.outcome, end: res.end, penalty, sunk, pickedUp, strokesNow: s.cur[seat] };
  s.readyAt = now + Math.max(0, res.seconds * 1000 - 400);
  if (s.done.every(Boolean)) endHole(s);
  else if (s.done[seat]) s.turn = nextPlayer(s, seat);
  else s.turn = nextPlayer(s, seat); // por turnos: pasa al siguiente que no terminó (si es el único, sigue él)
  return { ok: true };
}

export function viewFor(s: GolfState, seat: number) {
  return {
    kind: "minigolf" as const,
    seat,
    hole: s.hole,
    holes: s.holes,
    players: s.players.map((p, i) => ({
      seat: i, name: p.name, cur: s.cur[i], done: s.done[i], ball: s.balls[i],
      strokes: s.strokes[i], total: s.strokes[i].reduce((a, b) => a + b, 0),
    })),
    turn: s.turn,
    lastShot: s.lastShot,
    shotSeq: s.shotSeq,
    lastHole: s.lastHole,
    holeSeq: s.holeSeq,
    winner: s.winner,
    winners: s.winners,
    events: s.events.slice(-6),
  };
}
