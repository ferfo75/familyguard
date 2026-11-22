import test from "node:test";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { chooseMove, LEVELS } from "./chessbot";
import * as rooms from "./rooms";

test("siempre juega un mate en 1 si lo tiene, en cualquier nivel", async () => {
  // blancas: Dh5 + Ac4 contra el rey negro (mate del pastor): Dxf7#
  const fen = "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 1";
  for (const level of LEVELS) {
    const mv = await chooseMove(fen, level);
    const g = new Chess(fen);
    g.move(mv);
    assert.equal(g.isCheckmate(), true, `${level} no dio el mate`);
  }
});

test("el nivel difícil no regala la dama y captura una pieza que está de regalo", async () => {
  // las negras pueden comer la dama blanca con el peón: gxh5 es lo mejor
  const fen = "rnbqkbnr/pppppp1p/8/6p1/7Q/8/PPPPPPPP/RNB1KBNR b KQkq - 0 2";
  const mv = await chooseMove(fen, "dificil");
  assert.deepEqual({ f: mv.from, t: mv.to }, { f: "g5", t: "h4" });
});

test("las jugadas que elige son siempre legales (partidas completas entre niveles)", async () => {
  for (const [w, b] of [["facil", "normal"], ["dificil", "facil"]] as const) {
    const g = new Chess();
    let n = 0;
    while (!g.isGameOver() && n++ < 36) {
      const mv = await chooseMove(g.fen(), g.turn() === "w" ? w : b);
      assert.doesNotThrow(() => g.move(mv));
    }
    assert.ok(n > 6);
  }
});

test("el nivel difícil piensa en un tiempo razonable", async () => {
  const t0 = Date.now();
  await chooseMove("r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P1B2/2PBPN2/PP1N1PPP/R2QK2R w KQ - 0 9", "dificil");
  assert.ok(Date.now() - t0 < 3500, "tardó " + (Date.now() - t0) + " ms");
});

test("sala de ajedrez solo: la computadora entra, juega cuando le toca y la partida sigue", async () => {
  rooms._resetForTests();
  const room = rooms.createRoom("fam", "chess", { key: "p1", name: "Fer" }) as rooms.Room;
  assert.equal("error" in rooms.addBot("fam", room.id, "otro", "normal"), true); // solo el anfitrión
  const started = rooms.addBot("fam", room.id, "p1", "facil") as rooms.Room;
  assert.equal(started.status, "playing");
  assert.equal(started.seats.length, 2);
  assert.match(started.seats[1].name, /Computadora/);
  // si la computadora tiene blancas, le toca primero
  const botSeat = started.order.indexOf(`bot:${room.id}`);
  assert.equal(rooms.botPending(started), botSeat === 0);
  if (botSeat === 0) { await rooms.botMove(started); assert.equal(rooms.botPending(started), false); }
  // la persona mueve y después le toca a la computadora
  const humanSeat = started.order.indexOf("p1");
  const view = rooms.viewFor(started, "p1") as any;
  const m = view.game.legal[0];
  const res = rooms.act("fam", room.id, "p1", { t: "move", from: m.from, to: m.to });
  assert.equal("error" in res, false);
  assert.equal(rooms.botPending(started), true);
  await rooms.botMove(started);
  assert.equal(rooms.botPending(started), false);
  assert.equal((started.state as any).turn, humanSeat);
});
