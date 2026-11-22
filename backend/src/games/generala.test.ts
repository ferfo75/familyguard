import test from "node:test";
import assert from "node:assert/strict";
import { createGenerala, apply, scoreOf, isEscalera, isFull, isPoker, isGenerala, total, viewFor, CATEGORIES } from "./generala";

const seq = (...vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
const mk = (n = 2) => createGenerala(Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "J" + i })));

test("reconoce las figuras", () => {
  assert.ok(isEscalera([1, 2, 3, 4, 5])); assert.ok(isEscalera([6, 2, 5, 3, 4])); assert.ok(isEscalera([1, 3, 4, 5, 6]));
  assert.ok(!isEscalera([1, 2, 3, 4, 6]));
  assert.ok(isFull([3, 3, 3, 5, 5])); assert.ok(!isFull([3, 3, 3, 3, 5])); assert.ok(!isFull([2, 2, 2, 2, 2]));
  assert.ok(isPoker([4, 4, 4, 4, 1])); assert.ok(isPoker([4, 4, 4, 4, 4]));
  assert.ok(isGenerala([6, 6, 6, 6, 6]));
});

test("puntos: números, figuras y bono por servida", () => {
  assert.equal(scoreOf("3", [3, 3, 1, 3, 2], false), 9);
  assert.equal(scoreOf("escalera", [1, 2, 3, 4, 5], false), 20);
  assert.equal(scoreOf("escalera", [1, 2, 3, 4, 5], true), 25);
  assert.equal(scoreOf("full", [2, 2, 5, 5, 5], true), 35);
  assert.equal(scoreOf("poker", [6, 6, 6, 6, 1], false), 40);
  assert.equal(scoreOf("poker", [6, 6, 6, 6, 1], true), 45);
  assert.equal(scoreOf("generala", [2, 2, 2, 2, 2], false), 50);
  assert.equal(scoreOf("full", [1, 2, 3, 4, 6], false), 0);
});

test("la doble generala solo vale con la generala ya anotada en 50", () => {
  const sheet = CATEGORIES.map(() => null) as (number | null)[];
  assert.equal(scoreOf("doble", [4, 4, 4, 4, 4], false, sheet), 0);
  sheet[CATEGORIES.indexOf("generala")] = 50;
  assert.equal(scoreOf("doble", [4, 4, 4, 4, 4], false, sheet), 100);
  sheet[CATEGORIES.indexOf("generala")] = 0;
  assert.equal(scoreOf("doble", [4, 4, 4, 4, 4], false, sheet), 0);
});

test("turno: hasta 3 tiros, se guardan dados y hay que anotar antes de pasar", () => {
  const s = mk();
  assert.deepEqual(apply(s, 1, { t: "roll" }, seq(1)), { ok: false, error: "not_your_turn" });
  assert.deepEqual(apply(s, 0, { t: "score", cat: "1" }), { ok: false, error: "roll_first" });
  apply(s, 0, { t: "roll" }, seq(1, 2, 3, 4, 6));
  assert.deepEqual(s.dice, [1, 2, 3, 4, 6]);
  apply(s, 0, { t: "roll", keep: [true, true, true, false, false] }, seq(5, 5));
  assert.deepEqual(s.dice, [1, 2, 3, 5, 5]);
  assert.equal(s.rollsLeft, 1);
  assert.deepEqual(apply(s, 0, { t: "roll", keep: [true, true, true, true, true] }, seq(1)), { ok: false, error: "keep_not_all" });
  apply(s, 0, { t: "roll", keep: [false, false, false, false, false] }, seq(2, 2, 2, 5, 5));
  assert.equal(s.rollsLeft, 0);
  assert.deepEqual(apply(s, 0, { t: "roll" }, seq(1)), { ok: false, error: "score_first" });
  assert.deepEqual(apply(s, 0, { t: "score", cat: "full" }), { ok: true });
  assert.equal(s.sheets[0][CATEGORIES.indexOf("full")], 30);
  assert.equal(s.turn, 1);
  assert.deepEqual(s.dice, []);
});

test("full servido vale 35 y una categoría no se repite", () => {
  const s = mk(1);
  apply(s, 0, { t: "roll" }, seq(3, 3, 3, 6, 6));
  apply(s, 0, { t: "score", cat: "full" });
  assert.equal(s.sheets[0][CATEGORIES.indexOf("full")], 35);
  apply(s, 0, { t: "roll" }, seq(1, 1, 1, 2, 2));
  assert.deepEqual(apply(s, 0, { t: "score", cat: "full" }), { ok: false, error: "category_taken" });
});

test("generala servida gana en el acto", () => {
  const s = mk();
  apply(s, 0, { t: "roll" }, seq(5));
  assert.equal(s.winner, 0);
  assert.equal(s.instantWin, true);
  assert.deepEqual(apply(s, 1, { t: "roll" }, seq(1)), { ok: false, error: "game_over" });
});

test("la partida termina con 11 turnos cada uno y el empate se detecta", () => {
  const s = mk();
  let guard = 0;
  while (s.winner === null && guard++ < 100) {
    const seat = s.turn;
    apply(s, seat, { t: "roll" }, seq(1, 2, 3, 4, 6));
    const free = CATEGORIES.find((_c, i) => s.sheets[seat][i] === null)!;
    assert.deepEqual(apply(s, seat, { t: "score", cat: free }), { ok: true });
  }
  assert.equal(s.sheets[0].every((v) => v !== null), true);
  assert.equal(total(s.sheets[0]), total(s.sheets[1]));
  assert.equal(s.winner, -1);
  assert.equal(viewFor(s, 0).winners.length, 2);
});
