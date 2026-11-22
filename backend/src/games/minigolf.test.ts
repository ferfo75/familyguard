import test from "node:test";
import assert from "node:assert/strict";
import { createGolf, apply, simulate, loadCourses, MAX_STROKES, inPoly } from "./minigolf";

const courses = loadCourses();
const mk = (n = 2) => createGolf(Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "J" + i })));
let CLOCK = 1e12;
/** Cada llamada avanza el reloj: simula que la pelota anterior ya terminó de rodar. */
const later = () => (CLOCK += 1e9);

test("hay 6 hoyos bien formados", () => {
  assert.equal(courses.length, 6);
  for (const c of courses) {
    assert.ok(inPoly(c.tee[0], c.tee[1], c.outline), c.name + ": la salida está dentro");
    assert.ok(inPoly(c.hole[0], c.hole[1], c.outline), c.name + ": el hoyo está dentro");
    for (const w of c.water ?? []) assert.ok(!inPoly(c.tee[0], c.tee[1], w), c.name + ": la salida no está en el agua");
  }
});

test("la simulación es determinista y la pelota queda quieta dentro de la cancha", () => {
  const a = simulate(courses[0], courses[0].tee, -Math.PI / 2 + 0.1, 0.6);
  const b = simulate(courses[0], courses[0].tee, -Math.PI / 2 + 0.1, 0.6);
  assert.deepEqual(a, b);
  assert.equal(a.outcome, "rest");
  assert.ok(inPoly(a.end[0], a.end[1], courses[0].outline));
  assert.ok(a.frames.length > 10 && a.frames.length % 2 === 0);
});

test("un tiro suave avanza poco y uno fuerte rebota sin salirse de la cancha", () => {
  const soft = simulate(courses[2], courses[2].tee, -Math.PI / 2, 0);
  assert.ok(Math.abs(soft.end[1] - courses[2].tee[1]) < 40);
  for (let deg = 0; deg < 360; deg += 15) {
    const r = simulate(courses[4], courses[4].tee, (deg * Math.PI) / 180, 1);
    assert.ok(r.end[0] > 0 && r.end[0] < 360 && r.end[1] > 0 && r.end[1] < 600);
  }
});

test("el hoyo 1 se puede embocar de un tiro recto", () => {
  const r = simulate(courses[0], courses[0].tee, (270 * Math.PI) / 180, 0.7);
  assert.equal(r.outcome, "hole");
});

test("el agua devuelve la pelota y suma un golpe de penalidad", () => {
  const s = mk();
  s.hole = 3;
  s.balls = s.players.map(() => [courses[3].tee[0], courses[3].tee[1]]);
  const r = apply(s, 0, { t: "shot", angle: Math.atan2(-195, -50), power: 0.6 }, 0);
  assert.deepEqual(r, { ok: true });
  assert.equal(s.lastShot!.outcome, "water");
  assert.equal(s.cur[0], 2);
  assert.deepEqual(s.balls[0], courses[3].tee);
});

test("turnos: espera que termine la pelota anterior, alterna y respeta el orden", () => {
  const s = mk();
  assert.deepEqual(apply(s, 1, { t: "shot", angle: -1.5, power: 0.5 }, 0), { ok: false, error: "not_your_turn" });
  assert.deepEqual(apply(s, 0, { t: "shot", angle: -1.5, power: 0.5 }, 0), { ok: true });
  assert.equal(s.turn, 1);
  assert.deepEqual(apply(s, 1, { t: "shot", angle: -1.5, power: 0.5 }, 0), { ok: false, error: "wait_ball" });
  assert.deepEqual(apply(s, 1, { t: "shot", angle: -1.5, power: 0.5 }, later()), { ok: true });
  assert.deepEqual(apply(s, 0, { t: "shot", angle: NaN, power: 0.5 }, later()), { ok: false, error: "bad_action" });
});

test("se levanta la pelota al llegar al máximo y pasa al hoyo siguiente", () => {
  const s = mk(1);
  let n = 0;
  while (s.hole === 0 && n++ < 20) apply(s, 0, { t: "shot", angle: 0, power: 0.1 }, later());
  assert.equal(s.hole, 1);
  assert.equal(s.strokes[0][0], MAX_STROKES);
  assert.equal(s.lastHole!.strokes[0], MAX_STROKES);
});

test("partida completa de un jugador: 6 hoyos y termina", () => {
  const s = mk(1);
  let guard = 0;
  while (s.winner === null && guard++ < 200) apply(s, 0, { t: "shot", angle: 0, power: 0.05 }, later());
  assert.equal(s.winner, 0);
  assert.equal(s.strokes[0].length, 6);
});
