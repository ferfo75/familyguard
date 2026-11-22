import test from "node:test";
import assert from "node:assert/strict";
import { createChess, apply, viewFor } from "./chess";

const mk = () => createChess([{ id: "a", name: "Ana" }, { id: "b", name: "Beto" }], () => 0); // Ana = blancas

test("el sorteo define quién juega con blancas", () => {
  const s = createChess([{ id: "a", name: "Ana" }, { id: "b", name: "Beto" }], () => 1);
  assert.equal(s.players[0].id, "b");
});

test("solo mueve quien tiene el turno y las jugadas ilegales se rechazan", () => {
  const s = mk();
  assert.deepEqual(apply(s, 1, { t: "move", from: "e7", to: "e5" }), { ok: false, error: "not_your_turn" });
  assert.deepEqual(apply(s, 0, { t: "move", from: "e2", to: "e5" }), { ok: false, error: "illegal_move" });
  assert.deepEqual(apply(s, 0, { t: "move", from: "z9", to: "e5" }), { ok: false, error: "bad_action" });
  assert.deepEqual(apply(s, 0, { t: "move", from: "e2", to: "e4" }), { ok: true });
  assert.equal(s.turn, 1);
});

test("mate del loco: ganan las negras", () => {
  const s = mk();
  apply(s, 0, { t: "move", from: "f2", to: "f3" });
  apply(s, 1, { t: "move", from: "e7", to: "e5" });
  apply(s, 0, { t: "move", from: "g2", to: "g4" });
  apply(s, 1, { t: "move", from: "d8", to: "h4" });
  assert.equal(s.winner, 1);
  assert.equal(s.result, "mate");
  assert.deepEqual(apply(s, 0, { t: "move", from: "a2", to: "a3" }), { ok: false, error: "game_over" });
  assert.equal(viewFor(s, 0).legal.length, 0);
});

test("la vista solo trae jugadas legales para quien mueve", () => {
  const s = mk();
  const v0 = viewFor(s, 0), v1 = viewFor(s, 1);
  assert.equal(v0.legal.length, 20);
  assert.equal(v1.legal.length, 0);
  assert.ok(v0.legal.some((m) => m.from === "g1" && m.to === "f3"));
});

test("el enroque funciona y rendirse da la victoria al rival", () => {
  const s = mk();
  const opening: [number, string, string][] = [[0, "e2", "e4"], [1, "e7", "e5"], [0, "g1", "f3"], [1, "b8", "c6"], [0, "f1", "c4"], [1, "g8", "f6"]];
  for (const [seat, from, to] of opening) {
    assert.deepEqual(apply(s, seat, { t: "move", from, to }), { ok: true });
  }
  assert.deepEqual(apply(s, 0, { t: "move", from: "e1", to: "g1" }), { ok: true });
  assert.equal(s.moves[s.moves.length - 1].san, "O-O");
  apply(s, 1, { t: "resign" });
  assert.equal(s.winner, 0);
  assert.equal(s.result, "resign");
});

test("rey ahogado es tablas", () => {
  const s = mk();
  const line: [number, string, string][] = [
    [0, "e2", "e3"], [1, "a7", "a5"], [0, "d1", "h5"], [1, "a8", "a6"], [0, "h5", "a5"], [1, "h7", "h5"], [0, "h2", "h4"],
    [1, "a6", "h6"], [0, "a5", "c7"], [1, "f7", "f6"], [0, "c7", "d7"], [1, "e8", "f7"], [0, "d7", "b7"], [1, "d8", "d3"],
    [0, "b7", "b8"], [1, "d3", "h7"], [0, "b8", "c8"], [1, "f7", "g6"], [0, "c8", "e6"],
  ];
  for (const [seat, from, to] of line) assert.deepEqual(apply(s, seat, { t: "move", from, to }), { ok: true });
  assert.equal(s.winner, -1);
  assert.equal(s.result, "stalemate");
});
