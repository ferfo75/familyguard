import test from "node:test";
import assert from "node:assert/strict";
import {
  Card, cardPower, envidoPoints, handWinner, faltaPoints, createTruco, apply, allowedFor, viewFor, newDeck, TrucoState,
} from "./truco";

const c = (suit: Card["suit"], rank: number): Card => ({ suit, rank });

test("jerarquía de cartas", () => {
  const order = [c("espada", 1), c("basto", 1), c("espada", 7), c("oro", 7), c("copa", 3), c("oro", 2),
    c("copa", 1), c("oro", 12), c("basto", 11), c("copa", 10), c("copa", 7), c("oro", 6), c("basto", 5), c("copa", 4)];
  const p = order.map(cardPower);
  for (let i = 1; i < p.length; i++) assert.ok(p[i - 1] >= p[i], `posición ${i}`);
  assert.equal(cardPower(c("copa", 1)), cardPower(c("oro", 1)));
  assert.equal(cardPower(c("copa", 7)), cardPower(c("basto", 7)));
  assert.ok(cardPower(c("espada", 1)) > cardPower(c("basto", 1)));
});

test("tanto de envido", () => {
  assert.equal(envidoPoints([c("oro", 7), c("oro", 6), c("copa", 1)]), 33);
  assert.equal(envidoPoints([c("oro", 12), c("oro", 11), c("copa", 1)]), 20);
  assert.equal(envidoPoints([c("oro", 12), c("copa", 5), c("basto", 7)]), 7);
  assert.equal(envidoPoints([c("oro", 12), c("copa", 11), c("basto", 10)]), 0);
  assert.equal(envidoPoints([c("oro", 7), c("oro", 6), c("oro", 5)]), 33);
  assert.equal(envidoPoints([c("copa", 4), c("oro", 3), c("copa", 5)]), 29);
});

test("quién gana la mano por bazas", () => {
  assert.equal(handWinner([0, 0], 0), 0);
  assert.equal(handWinner([0, 1], 0), null);
  assert.equal(handWinner([0, 1, 1], 0), 1);
  assert.equal(handWinner([0, null], 1), 0); // gané la 1ª y la 2ª fue parda
  assert.equal(handWinner([null, 1], 0), 1); // 1ª parda: decide la 2ª
  assert.equal(handWinner([null, null], 0), null);
  assert.equal(handWinner([null, null, 1], 0), 1);
  assert.equal(handWinner([null, null, null], 1), 1); // todo parda: gana el mano
  assert.equal(handWinner([0, 1, null], 0), 0); // 3ª parda: gana quien ganó la 1ª
  assert.equal(handWinner([1, 0, null], 0), 1);
});

test("falta envido: regla de la casa", () => {
  // los dos en malas: el que la gana, gana el partido
  assert.equal(faltaPoints([0, 0], 0), 30);
  assert.equal(faltaPoints([10, 15], 1), 15);
  assert.equal(10 + faltaPoints([10, 15], 0), 30);
  // alguien en buenas: se suma lo que le falta al que va primero
  assert.equal(faltaPoints([20, 5], 1), 10); // va perdiendo y gana: suma 10
  assert.equal(5 + faltaPoints([20, 5], 1), 15);
  assert.equal(20 + faltaPoints([20, 5], 0), 30); // va primero y gana: llega a 30
  assert.equal(faltaPoints([16, 3], 1), 14);
});

// Mazo armado a mano: mano (asiento 0) y asiento 1 con cartas conocidas.
function deckFor(...hands: Card[][]): Card[] {
  const rest = newDeck().filter((d) => !hands.flat().some((h) => h.suit === d.suit && h.rank === d.rank));
  const out: Card[] = [];
  hands.forEach((h) => out.push(...h));
  return [...out, ...rest];
}

function game1v1(h0: Card[], h1: Card[]): TrucoState {
  // createTruco hace mano = (2-1+1)%2 = 0 → arranca el jugador 0
  return createTruco([{ id: "a", name: "Ana" }, { id: "b", name: "Beto" }], deckFor(h0, h1));
}

test("1 contra 1: una mano completa con las dos bazas", () => {
  const s = game1v1([c("espada", 1), c("copa", 4), c("copa", 5)], [c("oro", 3), c("basto", 4), c("oro", 4)]);
  assert.equal(s.turn, 0);
  assert.deepEqual(apply(s, 1, { t: "play", card: c("oro", 3) }), { ok: false, error: "not_your_turn" });
  assert.equal(apply(s, 0, { t: "play", card: c("espada", 1) }).ok, true);
  assert.equal(apply(s, 1, { t: "play", card: c("oro", 3) }).ok, true);
  assert.equal(s.tricks[0], 0); // el ancho gana
  assert.equal(s.turn, 0); // y abre la segunda
  assert.equal(apply(s, 0, { t: "play", card: c("copa", 5) }).ok, true);
  assert.equal(apply(s, 1, { t: "play", card: c("oro", 4) }).ok, true);
  // 0 ganó la 1ª y la 2ª la gana quien tenga más: copa 5 (2) vs oro 4 (1) → 0 gana la mano
  assert.deepEqual(s.scores, [1, 0]);
  assert.equal(s.handNo, 2);
  assert.equal(s.mano, 1);
});

test("no se puede jugar una carta que no se tiene ni espiar al rival", () => {
  const s = game1v1([c("espada", 1), c("copa", 4), c("copa", 5)], [c("oro", 3), c("basto", 4), c("oro", 4)]);
  assert.deepEqual(apply(s, 0, { t: "play", card: c("oro", 3) }), { ok: false, error: "card_not_in_hand" });
  const v = viewFor(s, 0);
  assert.equal(JSON.stringify(v).includes('"oro","rank":3'), false, "la vista no debe contener cartas del rival");
  assert.equal(v.myHand.length, 3);
});

test("truco querido, retruco y vale cuatro: solo sube el que aceptó", () => {
  const s = game1v1([c("espada", 1), c("copa", 4), c("copa", 5)], [c("oro", 3), c("basto", 4), c("oro", 4)]);
  assert.deepEqual(apply(s, 0, { t: "call", call: "retruco" }), { ok: false, error: "call_not_allowed" });
  assert.equal(apply(s, 0, { t: "call", call: "truco" }).ok, true);
  assert.equal(allowedFor(s, 0).play, false); // espera respuesta
  assert.equal(apply(s, 1, { t: "call", call: "retruco" }).ok, true); // sube
  assert.equal(apply(s, 0, { t: "call", call: "valecuatro" }).ok, true); // sube de nuevo
  assert.equal(apply(s, 1, { t: "respond", r: "quiero" }).ok, true);
  assert.equal(s.trucoLevel, 4);
  assert.equal(allowedFor(s, 0).calls.includes("valecuatro"), false);
  assert.equal(allowedFor(s, 1).calls.length, 0);
});

test("truco no querido da 1 punto; retruco no querido 2; mazo da lo que vale", () => {
  let s = game1v1([c("espada", 1), c("copa", 4), c("copa", 5)], [c("oro", 3), c("basto", 4), c("oro", 4)]);
  apply(s, 0, { t: "call", call: "truco" });
  apply(s, 1, { t: "respond", r: "noquiero" });
  assert.deepEqual(s.scores, [1, 0]);

  s = game1v1([c("espada", 1), c("copa", 4), c("copa", 5)], [c("oro", 3), c("basto", 4), c("oro", 4)]);
  apply(s, 0, { t: "call", call: "truco" });
  apply(s, 1, { t: "call", call: "retruco" });
  apply(s, 0, { t: "respond", r: "noquiero" });
  assert.deepEqual(s.scores, [0, 2]);

  s = game1v1([c("espada", 1), c("copa", 4), c("copa", 5)], [c("oro", 3), c("basto", 4), c("oro", 4)]);
  apply(s, 0, { t: "call", call: "truco" });
  apply(s, 1, { t: "respond", r: "quiero" });
  apply(s, 0, { t: "mazo" });
  assert.deepEqual(s.scores, [0, 2]);
});

test("envido: querido, no querido y encadenado", () => {
  // 0: 7 y 6 de oro (33); 1: 3 de oro y 4 de basto (4)
  let s = game1v1([c("oro", 7), c("oro", 6), c("copa", 1)], [c("oro", 3), c("basto", 4), c("copa", 12)]);
  apply(s, 0, { t: "call", call: "envido" });
  apply(s, 1, { t: "respond", r: "quiero" });
  assert.deepEqual(s.scores, [2, 0]);

  s = game1v1([c("oro", 7), c("oro", 6), c("copa", 1)], [c("oro", 3), c("basto", 4), c("copa", 12)]);
  apply(s, 0, { t: "call", call: "envido" });
  apply(s, 1, { t: "respond", r: "noquiero" });
  assert.deepEqual(s.scores, [1, 0]);

  // envido, real envido (el rival sube): si el primero no quiere, se lleva lo anterior (2)
  s = game1v1([c("oro", 7), c("oro", 6), c("copa", 1)], [c("oro", 3), c("basto", 4), c("copa", 12)]);
  apply(s, 0, { t: "call", call: "envido" });
  apply(s, 1, { t: "call", call: "real" });
  apply(s, 0, { t: "respond", r: "noquiero" });
  assert.deepEqual(s.scores, [0, 2]);

  // envido + real querido = 5
  s = game1v1([c("oro", 7), c("oro", 6), c("copa", 1)], [c("oro", 3), c("basto", 4), c("copa", 12)]);
  apply(s, 0, { t: "call", call: "envido" });
  apply(s, 1, { t: "call", call: "real" });
  apply(s, 0, { t: "respond", r: "quiero" });
  assert.deepEqual(s.scores, [5, 0]);
});

test("envido solo en la primera baza y no después de aceptado el truco", () => {
  const s = game1v1([c("oro", 7), c("oro", 6), c("copa", 1)], [c("oro", 3), c("basto", 4), c("copa", 12)]);
  apply(s, 0, { t: "play", card: c("copa", 1) });
  apply(s, 1, { t: "play", card: c("oro", 3) });
  assert.equal(allowedFor(s, s.turn).calls.some((x) => x === "envido"), false);

  const t = game1v1([c("oro", 7), c("oro", 6), c("copa", 1)], [c("oro", 3), c("basto", 4), c("copa", 12)]);
  apply(t, 0, { t: "call", call: "truco" });
  apply(t, 1, { t: "respond", r: "quiero" });
  assert.equal(allowedFor(t, 0).calls.includes("envido"), false);
});

test("envido cantado como respuesta a un truco; después se contesta el truco", () => {
  const s = game1v1([c("oro", 7), c("oro", 6), c("copa", 1)], [c("oro", 3), c("basto", 4), c("copa", 12)]);
  apply(s, 0, { t: "call", call: "truco" });
  assert.ok(allowedFor(s, 1).calls.includes("envido"));
  apply(s, 1, { t: "call", call: "envido" });
  apply(s, 0, { t: "respond", r: "quiero" }); // 0 tiene 33, gana
  assert.deepEqual(s.scores, [2, 0]);
  assert.equal(s.pending?.type, "truco"); // el truco sigue esperando la respuesta de 1
  assert.equal(allowedFor(s, 1).respond, true);
  apply(s, 1, { t: "respond", r: "noquiero" });
  assert.deepEqual(s.scores, [3, 0]);
});

test("falta envido en malas gana el partido", () => {
  const s = game1v1([c("oro", 7), c("oro", 6), c("copa", 1)], [c("oro", 3), c("basto", 4), c("copa", 12)]);
  apply(s, 0, { t: "call", call: "falta" });
  apply(s, 1, { t: "respond", r: "quiero" });
  assert.equal(s.winner, 0);
  assert.equal(s.scores[0], 30);
  assert.deepEqual(apply(s, 0, { t: "mazo" }), { ok: false, error: "game_over" });
});

test("falta envido con uno en buenas: gana el que va perdiendo y suma lo que le falta al líder", () => {
  const s = game1v1([c("oro", 7), c("oro", 6), c("copa", 1)], [c("oro", 3), c("basto", 4), c("copa", 12)]);
  s.scores = [5, 20]; // el jugador 1 va primero (20), el 0 va perdiendo (5) y tiene 33
  apply(s, 0, { t: "call", call: "falta" });
  apply(s, 1, { t: "respond", r: "quiero" });
  assert.deepEqual(s.scores, [15, 20]); // suma 10 (30-20)
  assert.equal(s.winner, null);
});

test("falta envido: si la gana el que va primero, gana el partido", () => {
  const s = game1v1([c("oro", 7), c("oro", 6), c("copa", 1)], [c("oro", 3), c("basto", 4), c("copa", 12)]);
  s.scores = [22, 8]; // 0 va primero y tiene el mejor tanto
  apply(s, 1, { t: "mazo" } as never); // el 1 no es su turno: ignorado
  apply(s, 0, { t: "call", call: "falta" });
  apply(s, 1, { t: "respond", r: "quiero" });
  assert.equal(s.winner, 0);
});

test("2 contra 2: orden de turnos, equipos y responde cualquiera del equipo rival", () => {
  const s = createTruco([
    { id: "a", name: "Ana" }, { id: "b", name: "Beto" }, { id: "c", name: "Cami" }, { id: "d", name: "Dani" },
  ]);
  assert.equal(s.hands.length, 4);
  assert.equal(s.turn, s.mano);
  const seat = s.turn;
  assert.equal(apply(s, seat, { t: "call", call: "truco" }).ok, true);
  const rivals = [0, 1, 2, 3].filter((x) => x % 2 !== seat % 2);
  const partner = [0, 1, 2, 3].find((x) => x % 2 === seat % 2 && x !== seat)!;
  assert.equal(allowedFor(s, partner).respond, false);
  assert.equal(allowedFor(s, rivals[1]).respond, true);
  assert.equal(apply(s, rivals[1], { t: "respond", r: "quiero" }).ok, true);
});

test("partida completa al azar termina con un ganador y sin errores", () => {
  for (let g = 0; g < 200; g++) {
    const n = g % 2 === 0 ? 2 : 4;
    const s = createTruco(Array.from({ length: n }, (_, i) => ({ id: String(i), name: `J${i}` })));
    let guard = 0;
    while (s.winner === null && guard++ < 5000) {
      // alguien tiene algo para hacer en cada instante
      let moved = false;
      for (let seat = 0; seat < n && !moved; seat++) {
        const al = allowedFor(s, seat);
        if (al.respond) {
          const r = Math.random();
          if (r < 0.15 && al.calls.length) apply(s, seat, { t: "call", call: al.calls[0] });
          else apply(s, seat, { t: "respond", r: Math.random() < 0.7 ? "quiero" : "noquiero" });
          moved = true;
        } else if (al.play) {
          if (Math.random() < 0.2 && al.calls.length) {
            const res = apply(s, seat, { t: "call", call: al.calls[Math.floor(Math.random() * al.calls.length)] });
            assert.equal(res.ok, true);
          } else if (Math.random() < 0.03) {
            apply(s, seat, { t: "mazo" });
          } else {
            const card = s.hands[seat][Math.floor(Math.random() * s.hands[seat].length)];
            assert.equal(apply(s, seat, { t: "play", card }).ok, true);
          }
          moved = true;
        }
      }
      assert.ok(moved, "el juego se trabó: nadie puede actuar");
    }
    assert.ok(s.winner !== null, "no terminó");
    assert.ok(s.scores[s.winner] >= 30);
    assert.ok(s.scores[0] <= 30 && s.scores[1] <= 30);
  }
});
