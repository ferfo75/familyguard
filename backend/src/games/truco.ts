import { randomInt } from "node:crypto";

/**
 * Truco argentino, a 30 puntos, SIN flor, 1 contra 1 o 2 contra 2.
 *
 * Reglas de la casa (las que pidió la familia):
 *  - Envido, Real Envido y Falta Envido (encadenables: envido, envido, real, falta).
 *  - Falta Envido: si los DOS equipos están en "malas" (15 o menos), el que la gana
 *    gana el partido. Si alguien ya está en "buenas", el ganador suma lo que le falta
 *    al que va primero para llegar a 30: si la gana el que va perdiendo, suma eso; si la
 *    gana el que va primero, llega a 30 y gana el partido.
 *  - Truco, Retruco, Vale Cuatro. Quiero rechazado = puntos de la apuesta anterior.
 *
 * El motor es puro y lo decide todo el servidor: cada jugador solo recibe su propia vista
 * (sus cartas, nunca las ajenas).
 */

export type Suit = "espada" | "basto" | "oro" | "copa";
export interface Card { suit: Suit; rank: number } // rank: 1-7, 10, 11, 12

export const TARGET = 30;

const SUITS: Suit[] = ["espada", "basto", "oro", "copa"];
const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

/** Fuerza de la carta para ganar una mano (14 = ancho de espada, la más alta). */
export function cardPower(c: Card): number {
  if (c.rank === 1 && c.suit === "espada") return 14;
  if (c.rank === 1 && c.suit === "basto") return 13;
  if (c.rank === 7 && c.suit === "espada") return 12;
  if (c.rank === 7 && c.suit === "oro") return 11;
  if (c.rank === 3) return 10;
  if (c.rank === 2) return 9;
  if (c.rank === 1) return 8; // ancho falso (copa, oro)
  if (c.rank === 12) return 7;
  if (c.rank === 11) return 6;
  if (c.rank === 10) return 5;
  if (c.rank === 7) return 4; // 7 falso (copa, basto)
  if (c.rank === 6) return 3;
  if (c.rank === 5) return 2;
  return 1; // 4
}

const envidoCardValue = (c: Card) => (c.rank >= 10 ? 0 : c.rank);

/** Tanto de envido de tres cartas: dos del mismo palo = 20 + las dos mejores; si no, la más alta. */
export function envidoPoints(hand: Card[]): number {
  let best = 0;
  for (const c of hand) best = Math.max(best, envidoCardValue(c));
  for (const suit of SUITS) {
    const v = hand.filter((c) => c.suit === suit).map(envidoCardValue).sort((a, b) => b - a);
    if (v.length >= 2) best = Math.max(best, 20 + v[0] + v[1]);
  }
  return best;
}

export type EnvidoCall = "envido" | "real" | "falta";
export type TrucoCall = "truco" | "retruco" | "valecuatro";
const ENVIDO_VALUE: Record<EnvidoCall, number> = { envido: 2, real: 3, falta: 0 };
const TRUCO_LEVEL: Record<TrucoCall, number> = { truco: 2, retruco: 3, valecuatro: 4 };

export interface TrucoPlayer { id: string; name: string }

type PendingEnvido = { type: "envido"; chain: EnvidoCall[]; from: 0 | 1 };
type PendingTruco = { type: "truco"; level: 2 | 3 | 4; from: 0 | 1 };

export interface TrucoState {
  kind: "truco";
  players: TrucoPlayer[]; // por asiento: el equipo es asiento % 2
  scores: [number, number];
  handNo: number;
  mano: number;
  dealt: Card[][]; // las 3 cartas repartidas (para el envido)
  hands: Card[][]; // las que quedan en mano
  tricks: (0 | 1 | null)[]; // ganador de cada baza (null = parda)
  table: { seat: number; card: Card }[]; // jugadas de la baza en curso
  lastTrick: { seat: number; card: Card }[]; // baza anterior, para mostrarla un momento
  turn: number;
  trucoLevel: 1 | 2 | 3 | 4;
  trucoAcceptedBy: 0 | 1 | null;
  envidoDone: boolean;
  pending: PendingEnvido | PendingTruco | null;
  suspendedTruco: PendingTruco | null; // truco al que todavía hay que responder tras un envido
  winner: 0 | 1 | null;
  events: string[];
  /** Lo que canta cada jugador, con número de orden: los clientes lo muestran en burbujas y lo dicen en voz alta. */
  shouts: { n: number; seat: number; text: string }[];
  shoutSeq: number;
  /** Cuenta las bazas terminadas: cuando cambia, el cliente anima la baza que acaba de cerrarse. */
  trickSeq: number;
  lastTrickWinSeat: number | null;
  /** Cómo terminó la última mano (para mostrarlo antes de repartir la siguiente). */
  handSeq: number;
  lastHand: { n: number; winner: 0 | 1; points: number; why: string } | null;
}

export type Action =
  | { t: "play"; card: Card }
  | { t: "call"; call: EnvidoCall | TrucoCall }
  | { t: "respond"; r: "quiero" | "noquiero" }
  | { t: "mazo" };

export type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const OK: Result = { ok: true };

const teamOf = (seat: number) => (seat % 2) as 0 | 1;
const other = (t: 0 | 1) => (t === 0 ? 1 : 0) as 0 | 1;

export function newDeck(): Card[] {
  const d: Card[] = [];
  for (const suit of SUITS) for (const rank of RANKS) d.push({ suit, rank });
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function say(s: TrucoState, text: string) {
  s.events.push(text);
  if (s.events.length > 40) s.events.shift();
}

const nm = (s: TrucoState, seat: number) => s.players[seat].name;
const teamName = (s: TrucoState, t: 0 | 1) =>
  s.players.length === 2 ? s.players[t].name : s.players.filter((_, i) => teamOf(i) === t).map((p) => p.name).join(" y ");

export function createTruco(players: TrucoPlayer[], deck: Card[] = newDeck()): TrucoState {
  if (players.length !== 2 && players.length !== 4) throw new Error("truco_needs_2_or_4");
  const s: TrucoState = {
    kind: "truco", players, scores: [0, 0], handNo: 0, mano: players.length - 1, dealt: [], hands: [],
    tricks: [], table: [], lastTrick: [], turn: 0, trucoLevel: 1, trucoAcceptedBy: null, envidoDone: false,
    pending: null, suspendedTruco: null, winner: null, events: [], shouts: [], shoutSeq: 0, trickSeq: 0, lastTrickWinSeat: null, handSeq: 0, lastHand: null,
  };
  dealHand(s, deck);
  return s;
}

function shout(s: TrucoState, seat: number, text: string) {
  s.shoutSeq += 1;
  s.shouts.push({ n: s.shoutSeq, seat, text });
  if (s.shouts.length > 12) s.shouts.shift();
}

function dealHand(s: TrucoState, deck: Card[] = newDeck()) {
  const n = s.players.length;
  s.handNo += 1;
  s.mano = (s.mano + 1) % n;
  s.dealt = Array.from({ length: n }, (_, i) => deck.slice(i * 3, i * 3 + 3));
  s.hands = s.dealt.map((h) => [...h]);
  s.tricks = [];
  s.table = [];
  s.turn = s.mano;
  s.trucoLevel = 1;
  s.trucoAcceptedBy = null;
  s.envidoDone = false;
  s.pending = null;
  s.suspendedTruco = null;
  say(s, `Mano ${s.handNo}: reparte, juega primero ${nm(s, s.mano)}`);
}

function award(s: TrucoState, team: 0 | 1, points: number, why: string) {
  s.scores[team] = Math.min(TARGET, s.scores[team] + points);
  say(s, `${teamName(s, team)} suma ${points} (${why})`);
  if (s.scores[team] >= TARGET) {
    s.winner = team;
    s.pending = null;
    s.suspendedTruco = null;
    say(s, `¡Ganó ${teamName(s, team)}!`);
  }
}

function endHand(s: TrucoState, winner: 0 | 1, points: number, why: string) {
  s.handSeq += 1;
  s.lastHand = { n: s.handSeq, winner, points, why };
  award(s, winner, points, why);
  if (s.winner === null) dealHand(s);
}

/** Quién gana la mano por bazas, o null si todavía no se definió. */
export function handWinner(tricks: (0 | 1 | null)[], mano: number): 0 | 1 | null {
  const [a, b, c] = tricks;
  if (tricks.length < 2) return null;
  if (a !== null && a !== undefined) {
    if (b === a || b === null) return a;
    if (tricks.length < 3) return null; // 1 a 1: decide la tercera
    return c ?? a; // tercera parda: gana quien ganó la primera
  }
  // primera parda
  if (b !== null) return b;
  if (tricks.length < 3) return null;
  return c ?? teamOf(mano);
}

function trickWinner(s: TrucoState): 0 | 1 | null {
  let best = -1;
  const power: [number, number] = [-1, -1];
  for (const p of s.table) {
    const pw = cardPower(p.card);
    const t = teamOf(p.seat);
    if (pw > power[t]) power[t] = pw;
    best = Math.max(best, pw);
  }
  if (power[0] === power[1]) return null;
  return power[0] > power[1] ? 0 : 1;
}

function envidoOutcome(s: TrucoState): { winner: 0 | 1; points: [number, number]; seats: [number, number] } {
  const n = s.players.length;
  const best: [number, number] = [-1, -1];
  const seats: [number, number] = [s.mano, s.mano];
  let winner: 0 | 1 = teamOf(s.mano);
  // En empate gana el equipo del que está más cerca de la mano.
  for (let k = 0; k < n; k++) {
    const seat = (s.mano + k) % n;
    const t = teamOf(seat);
    const v = envidoPoints(s.dealt[seat]);
    if (v > best[t]) { best[t] = v; seats[t] = seat; }
  }
  if (best[0] > best[1]) winner = 0;
  else if (best[1] > best[0]) winner = 1;
  return { winner, points: best, seats };
}

/** Puntos de una falta envido según la regla de la casa. */
export function faltaPoints(scores: [number, number], winner: 0 | 1): number {
  const bothInMalas = scores[0] <= 15 && scores[1] <= 15;
  if (bothInMalas) return TARGET - scores[winner]; // el que gana, gana el partido
  return TARGET - Math.max(scores[0], scores[1]);
}

function envidoSum(chain: EnvidoCall[]): number {
  return chain.reduce((acc, c) => acc + ENVIDO_VALUE[c], 0);
}

function canAppendEnvido(chain: EnvidoCall[], c: EnvidoCall): boolean {
  if (chain.length === 0) return true;
  const last = chain[chain.length - 1];
  if (last === "falta") return false;
  if (c === "envido") return last === "envido" && chain.filter((x) => x === "envido").length < 2;
  if (c === "real") return last === "envido";
  return true; // falta sobre cualquier cosa
}

function envidoAllowed(s: TrucoState): boolean {
  return s.tricks.length === 0 && !s.envidoDone && s.trucoLevel === 1 && s.winner === null;
}

function nextTrucoCall(s: TrucoState, team: 0 | 1): TrucoCall | null {
  if (s.trucoLevel === 1) return "truco";
  if (s.trucoAcceptedBy !== team) return null; // solo el que aceptó puede subir
  if (s.trucoLevel === 2) return "retruco";
  if (s.trucoLevel === 3) return "valecuatro";
  return null;
}

/** Qué puede hacer cada asiento ahora (la UI solo dibuja botones con esto). */
export interface Allowed {
  play: boolean;
  calls: (EnvidoCall | TrucoCall)[];
  respond: boolean;
  mazo: boolean;
}

export function allowedFor(s: TrucoState, seat: number): Allowed {
  const none: Allowed = { play: false, calls: [], respond: false, mazo: false };
  if (s.winner !== null) return none;
  const team = teamOf(seat);
  if (s.pending) {
    if (s.pending.from === team) return none; // espera la respuesta del rival
    const calls: (EnvidoCall | TrucoCall)[] = [];
    if (s.pending.type === "envido") {
      for (const c of ["envido", "real", "falta"] as EnvidoCall[]) if (canAppendEnvido(s.pending.chain, c)) calls.push(c);
    } else {
      // truco cantado: se puede subir la apuesta, o cantar envido antes si todavía es "primero"
      if (envidoAllowed(s) && !s.suspendedTruco) calls.push("envido", "real", "falta");
      if (s.pending.level === 2) calls.push("retruco");
      if (s.pending.level === 3) calls.push("valecuatro");
    }
    return { play: false, calls, respond: true, mazo: false };
  }
  if (seat !== s.turn) return none;
  const calls: (EnvidoCall | TrucoCall)[] = [];
  const t = nextTrucoCall(s, team);
  if (t) calls.push(t);
  if (envidoAllowed(s)) calls.push("envido", "real", "falta");
  return { play: true, calls, respond: false, mazo: true };
}

export function apply(s: TrucoState, seat: number, a: Action): Result {
  if (s.winner !== null) return fail("game_over");
  if (seat < 0 || seat >= s.players.length) return fail("not_a_player");
  const allowed = allowedFor(s, seat);
  const team = teamOf(seat);

  switch (a.t) {
    case "play": {
      if (!allowed.play) return fail("not_your_turn");
      const idx = s.hands[seat].findIndex((c) => c.suit === a.card.suit && c.rank === a.card.rank);
      if (idx < 0) return fail("card_not_in_hand");
      const [card] = s.hands[seat].splice(idx, 1);
      s.table.push({ seat, card });
      say(s, `${nm(s, seat)} juega`);
      return afterPlay(s);
    }
    case "mazo": {
      if (!allowed.mazo) return fail("not_your_turn");
      say(s, `${nm(s, seat)} se va al mazo`);
      shout(s, seat, "¡Me voy al mazo!");
      endHand(s, other(team), s.trucoLevel, "mazo");
      return OK;
    }
    case "call": {
      if (!allowed.calls.includes(a.call)) return fail("call_not_allowed");
      return doCall(s, seat, a.call);
    }
    case "respond": {
      if (!allowed.respond || !s.pending) return fail("nothing_to_answer");
      return a.r === "quiero" ? accept(s, seat) : reject(s, seat);
    }
  }
  return fail("bad_action");
}

function afterPlay(s: TrucoState): Result {
  const n = s.players.length;
  if (s.table.length < n) {
    s.turn = (s.turn + 1) % n;
    return OK;
  }
  // baza completa
  const w = trickWinner(s);
  s.tricks.push(w);
  let winnerSeat: number | null = null;
  if (w !== null) {
    let bestP = -1;
    for (const p of s.table) if (teamOf(p.seat) === w && cardPower(p.card) > bestP) { bestP = cardPower(p.card); winnerSeat = p.seat; }
    say(s, `Baza para ${teamName(s, w)}`);
  } else {
    say(s, "Baza parda");
  }
  s.lastTrick = s.table;
  s.lastTrickWinSeat = winnerSeat;
  s.trickSeq += 1;
  s.table = [];
  const hw = handWinner(s.tricks, s.mano);
  if (hw !== null) {
    endHand(s, hw, s.trucoLevel, "mano");
    return OK;
  }
  s.turn = winnerSeat ?? s.mano; // en parda abre el mano
  return OK;
}

const SHOUT_TEXT: Record<EnvidoCall | TrucoCall, string> = {
  envido: "¡Envido!", real: "¡Real envido!", falta: "¡Falta envido!",
  truco: "¡Truco!", retruco: "¡Quiero retruco!", valecuatro: "¡Quiero vale cuatro!",
};

function doCall(s: TrucoState, seat: number, call: EnvidoCall | TrucoCall): Result {
  const team = teamOf(seat);
  const who = teamName(s, team);
  shout(s, seat, SHOUT_TEXT[call]);
  if (call === "envido" || call === "real" || call === "falta") {
    if (s.pending?.type === "truco") {
      s.suspendedTruco = s.pending; // el truco queda esperando su respuesta
      s.pending = { type: "envido", chain: [call], from: team };
    } else if (s.pending?.type === "envido") {
      s.pending.chain.push(call);
      s.pending.from = team;
    } else {
      s.pending = { type: "envido", chain: [call], from: team };
    }
    say(s, `${who}: ${call === "real" ? "Real Envido" : call === "falta" ? "Falta Envido" : "Envido"}`);
    return OK;
  }
  const level = TRUCO_LEVEL[call] as 2 | 3 | 4;
  s.pending = { type: "truco", level, from: team };
  s.suspendedTruco = null;
  say(s, `${who}: ${call === "truco" ? "Truco" : call === "retruco" ? "Retruco" : "Vale Cuatro"}`);
  return OK;
}

function accept(s: TrucoState, seat: number): Result {
  const team = teamOf(seat);
  const p = s.pending!;
  shout(s, seat, "¡Quiero!");
  if (p.type === "truco") {
    s.trucoLevel = p.level;
    s.trucoAcceptedBy = team;
    s.pending = null;
    say(s, `${teamName(s, team)}: Quiero`);
    return OK;
  }
  // envido aceptado
  const { winner, points, seats } = envidoOutcome(s);
  const chain = p.chain;
  shout(s, seats[winner], `¡Tengo ${points[winner]}!`);
  shout(s, seats[other(winner)], "Son buenas");
  s.envidoDone = true;
  s.pending = s.suspendedTruco; // vuelve el truco pendiente, si lo había
  s.suspendedTruco = null;
  say(s, `${teamName(s, team)}: Quiero`);
  const loser = other(winner);
  say(s, `Envido: ${teamName(s, winner)} dice ${points[winner]}, ${teamName(s, loser)}: son buenas`);
  const pts = chain.includes("falta") ? faltaPoints(s.scores, winner) : envidoSum(chain);
  award(s, winner, pts, "envido");
  return OK;
}

function reject(s: TrucoState, seat: number): Result {
  const team = teamOf(seat);
  const p = s.pending!;
  const caller = other(team);
  shout(s, seat, "No quiero");
  if (p.type === "truco") {
    say(s, `${teamName(s, team)}: No quiero`);
    endHand(s, caller, p.level - 1, "truco no querido");
    return OK;
  }
  // envido rechazado: se lleva lo cantado antes del último aumento (mínimo 1)
  const pts = Math.max(1, envidoSum(p.chain.slice(0, -1)));
  s.envidoDone = true;
  s.pending = s.suspendedTruco;
  s.suspendedTruco = null;
  say(s, `${teamName(s, team)}: No quiero`);
  award(s, caller, pts, "envido no querido");
  return OK;
}

/** Vista que recibe cada jugador: sus cartas y nada de las ajenas. */
export function viewFor(s: TrucoState, seat: number) {
  const team = teamOf(seat);
  const p = s.pending;
  return {
    kind: "truco" as const,
    seat,
    team,
    players: s.players.map((pl, i) => ({ name: pl.name, seat: i, team: teamOf(i), cards: s.hands[i].length })),
    scores: s.scores,
    target: TARGET,
    handNo: s.handNo,
    mano: s.mano,
    myHand: s.hands[seat],
    table: s.table,
    lastTrick: s.lastTrick,
    trickSeq: s.trickSeq,
    lastTrickWinSeat: s.lastTrickWinSeat,
    handSeq: s.handSeq,
    lastHand: s.lastHand,
    tricks: s.tricks,
    turn: s.turn,
    trucoLevel: s.trucoLevel,
    pending: p ? { type: p.type, from: p.from, text: pendingText(p), mine: p.from === team } : null,
    allowed: allowedFor(s, seat),
    winner: s.winner,
    events: s.events.slice(-8),
    shouts: s.shouts,
  };
}

function pendingText(p: PendingEnvido | PendingTruco): string {
  if (p.type === "truco") return p.level === 2 ? "Truco" : p.level === 3 ? "Retruco" : "Vale Cuatro";
  return p.chain.map((c) => (c === "real" ? "Real Envido" : c === "falta" ? "Falta Envido" : "Envido")).join(" + ");
}
