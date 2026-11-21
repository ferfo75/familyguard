import { randomInt } from "node:crypto";

/**
 * Ludo de 2 a 4 jugadores, con el servidor como árbitro (el dado lo tira el servidor).
 *
 * Reglas:
 *  - 4 fichas por jugador; hace falta un 6 para sacar una ficha de la base.
 *  - Un 6, o comer una ficha rival, da otro tiro. Tres 6 seguidos pierden el turno.
 *  - Se come a una ficha rival al caer sobre ella, salvo en casillas seguras (salidas y estrellas).
 *  - Para entrar a la casa hace falta el número exacto.
 *  - Gana el primero que mete sus 4 fichas en la casa.
 *
 * Posición de una ficha (relativa a su dueño): 0 = base, 1..51 = tablero compartido,
 * 52..56 = pasillo propio, 57 = casa.
 */

export const TRACK = 52;
export const HOME = 57;
export const START_OFFSETS = [0, 13, 26, 39];
// Casillas seguras en índice absoluto: las 4 salidas y las estrellas (a 8 de cada salida).
export const SAFE = new Set([0, 13, 26, 39, 8, 21, 34, 47]);

export interface LudoPlayer { id: string; name: string }

export interface LudoState {
  kind: "ludo";
  players: LudoPlayer[];
  offsets: number[]; // índice de salida de cada jugador en el tablero
  pieces: number[][]; // pieces[jugador][ficha] = posición relativa
  turn: number;
  dice: number | null; // tirada pendiente de mover
  movable: number[]; // fichas que se pueden mover con esa tirada
  sixes: number;
  lastRoll: { seat: number; value: number } | null;
  winner: number | null;
  events: string[];
}

export type Action = { t: "roll" } | { t: "move"; piece: number };
export type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

export function createLudo(players: LudoPlayer[]): LudoState {
  if (players.length < 2 || players.length > 4) throw new Error("ludo_needs_2_to_4");
  // Con 2 jugadores se sientan enfrentados.
  const offsets = players.length === 2 ? [0, 26] : START_OFFSETS.slice(0, players.length);
  return {
    kind: "ludo", players, offsets, pieces: players.map(() => [0, 0, 0, 0]), turn: 0, dice: null,
    movable: [], sixes: 0, lastRoll: null, winner: null, events: [`Empieza ${players[0].name}`],
  };
}

function say(s: LudoState, t: string) {
  s.events.push(t);
  if (s.events.length > 30) s.events.shift();
}

/** Índice absoluto en el tablero de 52 casillas, o null si está en base, pasillo o casa. */
export function trackIndex(s: LudoState, seat: number, pos: number): number | null {
  if (pos < 1 || pos > 51) return null;
  return (s.offsets[seat] + pos - 1) % TRACK;
}

function movablePieces(s: LudoState, seat: number, dice: number): number[] {
  const out: number[] = [];
  s.pieces[seat].forEach((p, i) => {
    if (p === 0) { if (dice === 6) out.push(i); }
    else if (p + dice <= HOME) out.push(i);
  });
  return out;
}

function nextTurn(s: LudoState) {
  s.turn = (s.turn + 1) % s.players.length;
  s.dice = null;
  s.movable = [];
  s.sixes = 0;
}

export function apply(s: LudoState, seat: number, a: Action, rng: () => number = () => randomInt(1, 7)): Result {
  if (s.winner !== null) return fail("game_over");
  if (seat !== s.turn) return fail("not_your_turn");
  const me = s.players[seat].name;

  if (a.t === "roll") {
    if (s.dice !== null) return fail("move_first");
    const dice = rng();
    s.lastRoll = { seat, value: dice };
    if (dice === 6) s.sixes += 1;
    if (dice === 6 && s.sixes >= 3) {
      say(s, `${me} sacó tres 6 seguidos y pierde el turno`);
      nextTurn(s);
      return { ok: true };
    }
    const mv = movablePieces(s, seat, dice);
    if (mv.length === 0) {
      say(s, `${me} sacó ${dice} y no puede mover`);
      if (dice === 6) { s.dice = null; s.movable = []; } // el 6 igual da otro tiro
      else nextTurn(s);
      return { ok: true };
    }
    s.dice = dice;
    s.movable = mv;
    say(s, `${me} sacó ${dice}`);
    return { ok: true };
  }

  if (s.dice === null) return fail("roll_first");
  if (!s.movable.includes(a.piece)) return fail("piece_not_movable");
  const from = s.pieces[seat][a.piece];
  const to = from === 0 ? 1 : from + s.dice;
  s.pieces[seat][a.piece] = to;
  let extra = s.dice === 6;

  const idx = trackIndex(s, seat, to);
  if (idx !== null && !SAFE.has(idx)) {
    for (let o = 0; o < s.players.length; o++) {
      if (o === seat) continue;
      s.pieces[o].forEach((p, i) => {
        if (trackIndex(s, o, p) === idx) {
          s.pieces[o][i] = 0;
          extra = true;
          say(s, `${me} se comió una ficha de ${s.players[o].name}`);
        }
      });
    }
  }
  if (to === HOME) {
    say(s, `${me} metió una ficha en la casa`);
    if (s.pieces[seat].every((p) => p === HOME)) {
      s.winner = seat;
      s.dice = null;
      s.movable = [];
      say(s, `¡Ganó ${me}!`);
      return { ok: true };
    }
  }
  s.dice = null;
  s.movable = [];
  if (!extra) nextTurn(s);
  else if (s.dice === null) say(s, `${me} juega otra vez`);
  return { ok: true };
}

export function viewFor(s: LudoState, seat: number) {
  return {
    kind: "ludo" as const,
    seat,
    players: s.players.map((p, i) => ({ name: p.name, seat: i, offset: s.offsets[i], pieces: s.pieces[i] })),
    turn: s.turn,
    dice: s.dice,
    movable: s.turn === seat ? s.movable : [],
    lastRoll: s.lastRoll,
    winner: s.winner,
    allowed: { roll: s.winner === null && s.turn === seat && s.dice === null, move: s.winner === null && s.turn === seat && s.dice !== null },
    events: s.events.slice(-8),
  };
}
