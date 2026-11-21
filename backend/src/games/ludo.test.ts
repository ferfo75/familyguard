import test from "node:test";
import assert from "node:assert/strict";
import { createLudo, apply, trackIndex, viewFor, HOME } from "./ludo";

const mk = (n = 2) => createLudo(Array.from({ length: n }, (_, i) => ({ id: String(i), name: `J${i}` })));
const dice = (v: number) => () => v;

test("sin 6 no se sale de la base y pasa el turno", () => {
  const s = mk();
  assert.equal(apply(s, 0, { t: "roll" }, dice(3)).ok, true);
  assert.equal(s.turn, 1);
  assert.deepEqual(s.pieces[0], [0, 0, 0, 0]);
});

test("un 6 saca la ficha y da otro tiro", () => {
  const s = mk();
  apply(s, 0, { t: "roll" }, dice(6));
  assert.deepEqual(s.movable, [0, 1, 2, 3]);
  apply(s, 0, { t: "move", piece: 0 });
  assert.equal(s.pieces[0][0], 1);
  assert.equal(s.turn, 0); // 6: juega otra vez
  assert.equal(s.dice, null);
});

test("tres 6 seguidos pierden el turno", () => {
  const s = mk();
  apply(s, 0, { t: "roll" }, dice(6)); apply(s, 0, { t: "move", piece: 0 });
  apply(s, 0, { t: "roll" }, dice(6)); apply(s, 0, { t: "move", piece: 0 });
  apply(s, 0, { t: "roll" }, dice(6));
  assert.equal(s.turn, 1);
});

test("turnos: no se puede mover ni tirar fuera de turno", () => {
  const s = mk();
  assert.deepEqual(apply(s, 1, { t: "roll" }, dice(2)), { ok: false, error: "not_your_turn" });
  assert.deepEqual(apply(s, 0, { t: "move", piece: 0 }), { ok: false, error: "roll_first" });
  apply(s, 0, { t: "roll" }, dice(6));
  assert.deepEqual(apply(s, 0, { t: "roll" }, dice(2)), { ok: false, error: "move_first" });
});

test("se come a un rival fuera de casilla segura y no en una segura", () => {
  const s = mk(); // offsets 0 y 26
  // J0 en su pos 10 → índice 9. J1 en su pos 36 → índice (26+35)%52 = 9. Casilla 9 no es segura.
  s.pieces[0][0] = 7; s.pieces[1][0] = 36;
  assert.equal(trackIndex(s, 0, 10), 9);
  assert.equal(trackIndex(s, 1, 36), 9);
  apply(s, 0, { t: "roll" }, dice(3));
  apply(s, 0, { t: "move", piece: 0 });
  assert.equal(s.pieces[1][0], 0);
  assert.equal(s.turn, 0); // comer da otro tiro

  const t = mk();
  // índice 8 es estrella (segura): J0 en pos 5 +4 = 9? usamos pos 5 → índice 4; +4 → pos 9 → índice 8
  t.pieces[0][0] = 5; t.pieces[1][0] = 35; // J1 pos 35 → (26+34)%52 = 8
  apply(t, 0, { t: "roll" }, dice(4));
  apply(t, 0, { t: "move", piece: 0 });
  assert.equal(t.pieces[1][0], 35);
  assert.equal(t.turn, 1);
});

test("hace falta el número exacto para entrar a la casa", () => {
  const s = mk();
  s.pieces[0] = [55, 0, 0, 0];
  apply(s, 0, { t: "roll" }, dice(3)); // 58 > 57
  assert.equal(s.turn, 1); // no puede mover
  s.turn = 0;
  apply(s, 0, { t: "roll" }, dice(2));
  assert.deepEqual(s.movable, [0]);
  apply(s, 0, { t: "move", piece: 0 });
  assert.equal(s.pieces[0][0], HOME);
});

test("gana quien mete las 4 fichas", () => {
  const s = mk();
  s.pieces[0] = [HOME, HOME, HOME, 56];
  apply(s, 0, { t: "roll" }, dice(1));
  apply(s, 0, { t: "move", piece: 3 });
  assert.equal(s.winner, 0);
  assert.deepEqual(apply(s, 0, { t: "roll" }, dice(1)), { ok: false, error: "game_over" });
});

test("la vista solo deja mover al que tiene el turno", () => {
  const s = mk(3);
  apply(s, 0, { t: "roll" }, dice(6));
  assert.deepEqual(viewFor(s, 0).movable, [0, 1, 2, 3]);
  assert.deepEqual(viewFor(s, 1).movable, []);
  assert.equal(viewFor(s, 1).allowed.roll, false);
});

test("partidas al azar de 2, 3 y 4 jugadores terminan sin errores", () => {
  for (let g = 0; g < 150; g++) {
    const n = 2 + (g % 3);
    const s = mk(n);
    let guard = 0;
    while (s.winner === null && guard++ < 20000) {
      const seat = s.turn;
      if (s.dice === null) assert.equal(apply(s, seat, { t: "roll" }).ok, true);
      else {
        const piece = s.movable[Math.floor(Math.random() * s.movable.length)];
        assert.equal(apply(s, seat, { t: "move", piece }).ok, true);
      }
    }
    assert.ok(s.winner !== null, "no terminó");
  }
});
