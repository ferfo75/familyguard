import { randomInt } from "node:crypto";

/**
 * Generala (Argentina) de 1 a 4 jugadores; los dados los tira el servidor.
 *
 * Cada turno: hasta 3 tiros de 5 dados (después del primero se eligen los dados que se guardan)
 * y se anota el resultado en una categoría libre (o se tacha con 0).
 *
 * Categorías y puntos:
 *  - 1, 2, 3, 4, 5, 6: suma de los dados de ese número.
 *  - Escalera 20 · Full 30 · Póker 40 · Generala 50 · Doble generala 100.
 *  - "Servida" (a los 3 tiros ya hecha en el primero): escalera 25, full 35, póker 45.
 *  - Generala servida (cinco iguales en el primer tiro): gana la partida en el acto.
 *  - Doble generala: una segunda generala cuando la Generala ya está anotada con 50.
 *
 * Termina cuando todos llenaron sus 11 categorías; gana el mayor total.
 */

export const CATEGORIES = ["1", "2", "3", "4", "5", "6", "escalera", "full", "poker", "generala", "doble"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface GeneralaPlayer { id: string; name: string }

export interface GeneralaState {
  kind: "generala";
  players: GeneralaPlayer[];
  sheets: (number | null)[][]; // sheets[asiento][índice de categoría]; null = libre, 0 = tachada
  turn: number;
  dice: number[]; // 5 dados; [] antes del primer tiro del turno
  rollsLeft: number; // tiros que quedan en el turno (3 → 0)
  /** Último tiro, para animar: quién, qué dados se volvieron a tirar y cómo cayeron. */
  lastRoll: { n: number; seat: number; rolled: boolean[]; dice: number[]; servida: boolean } | null;
  rollSeq: number;
  /** Anotaciones, para que todos vean cuándo se llenó una casilla. */
  scoreSeq: number;
  lastScore: { n: number; seat: number; cat: Category; points: number; servida: boolean } | null;
  /** null mientras se juega; -1 = empate; asiento ganador */
  winner: number | null;
  winners: number[];
  instantWin: boolean;
  events: string[];
}

export type Action =
  | { t: "roll"; keep?: boolean[] }
  | { t: "score"; cat: Category };
export type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

export function createGenerala(players: GeneralaPlayer[]): GeneralaState {
  if (players.length < 1 || players.length > 4) throw new Error("generala_needs_1_to_4");
  return {
    kind: "generala", players, sheets: players.map(() => CATEGORIES.map(() => null)), turn: 0, dice: [], rollsLeft: 3,
    lastRoll: null, rollSeq: 0, scoreSeq: 0, lastScore: null, winner: null, winners: [], instantWin: false,
    events: [`Empieza ${players[0].name}`],
  };
}

function say(s: GeneralaState, t: string) {
  s.events.push(t);
  if (s.events.length > 20) s.events.shift();
}

const counts = (d: number[]) => { const c = [0, 0, 0, 0, 0, 0, 0]; for (const v of d) c[v]++; return c; };
export const isGenerala = (d: number[]) => d.length === 5 && d.every((v) => v === d[0]);
export const isPoker = (d: number[]) => counts(d).some((n) => n >= 4);
export const isFull = (d: number[]) => { const c = counts(d).filter((n) => n > 0).sort(); return c.length === 2 && c[0] === 2 && c[1] === 3; };
export const isEscalera = (d: number[]) => {
  const s = [...d].sort().join("");
  return s === "12345" || s === "23456" || s === "13456";
};

/** Puntos que daría anotar `d` en `cat` (0 si no se cumple). `servida` = salió en el primer tiro. */
export function scoreOf(cat: Category, d: number[], servida: boolean, sheet?: (number | null)[]): number {
  const bonus = servida ? 5 : 0;
  switch (cat) {
    case "1": case "2": case "3": case "4": case "5": case "6": {
      const v = Number(cat);
      return d.filter((x) => x === v).length * v;
    }
    case "escalera": return isEscalera(d) ? 20 + bonus : 0;
    case "full": return isFull(d) ? 30 + bonus : 0;
    case "poker": return isPoker(d) ? 40 + bonus : 0;
    case "generala": return isGenerala(d) ? 50 : 0;
    case "doble": {
      // Solo vale si la Generala ya está anotada con 50.
      const gi = CATEGORIES.indexOf("generala");
      return isGenerala(d) && sheet && sheet[gi] === 50 ? 100 : 0;
    }
  }
}

export const total = (sheet: (number | null)[]) => sheet.reduce<number>((a, v) => a + (v ?? 0), 0);

function nextTurn(s: GeneralaState) {
  s.dice = []; s.rollsLeft = 3;
  const done = s.sheets.every((sh) => sh.every((v) => v !== null));
  if (done) {
    const totals = s.sheets.map(total);
    const best = Math.max(...totals);
    s.winners = totals.map((t, i) => (t === best ? i : -1)).filter((i) => i >= 0);
    s.winner = s.winners.length === 1 ? s.winners[0] : -1;
    say(s, s.winner === -1 ? "¡Empate!" : `¡Ganó ${s.players[s.winner].name} con ${best} puntos!`);
    return;
  }
  // siguiente jugador que todavía tenga categorías libres
  for (let i = 1; i <= s.players.length; i++) {
    const t = (s.turn + i) % s.players.length;
    if (s.sheets[t].some((v) => v === null)) { s.turn = t; break; }
  }
  say(s, `Juega ${s.players[s.turn].name}`);
}

export function apply(s: GeneralaState, seat: number, a: Action, rng: () => number = () => randomInt(1, 7)): Result {
  if (s.winner !== null) return fail("game_over");
  if (seat < 0 || seat >= s.players.length) return fail("not_a_player");
  if (seat !== s.turn) return fail("not_your_turn");

  if (a.t === "roll") {
    if (s.rollsLeft <= 0) return fail("score_first");
    const first = s.dice.length === 0;
    let rolled: boolean[];
    if (first) rolled = [true, true, true, true, true];
    else {
      const keep = Array.isArray(a.keep) && a.keep.length === 5 ? a.keep.map(Boolean) : [false, false, false, false, false];
      if (keep.every(Boolean)) return fail("keep_not_all");
      rolled = keep.map((k) => !k);
    }
    const dice = first ? [0, 0, 0, 0, 0] : [...s.dice];
    for (let i = 0; i < 5; i++) if (rolled[i]) dice[i] = rng();
    s.dice = dice;
    s.rollsLeft -= 1;
    s.rollSeq += 1;
    const servida = first && true; // "servida" se evalúa recién al anotar: solo cuenta si fue el primer tiro
    s.lastRoll = { n: s.rollSeq, seat, rolled, dice: [...dice], servida: servida && s.rollsLeft === 2 };
    if (first && isGenerala(dice)) {
      // Generala servida: gana la partida.
      s.winner = seat; s.winners = [seat]; s.instantWin = true;
      say(s, `¡GENERALA SERVIDA! Gana ${s.players[seat].name}`);
    }
    return { ok: true };
  }

  if (a.t === "score") {
    const ci = CATEGORIES.indexOf(a.cat);
    if (ci < 0) return fail("bad_action");
    if (s.dice.length !== 5) return fail("roll_first");
    const sheet = s.sheets[seat];
    if (sheet[ci] !== null) return fail("category_taken");
    const servida = s.rollsLeft === 2; // se anota después del primer tiro
    const pts = scoreOf(a.cat, s.dice, servida, sheet);
    sheet[ci] = pts;
    s.scoreSeq += 1;
    s.lastScore = { n: s.scoreSeq, seat, cat: a.cat, points: pts, servida: servida && pts > 0 && ["escalera", "full", "poker"].includes(a.cat) };
    say(s, pts === 0 ? `${s.players[seat].name} tacha ${label(a.cat)}` : `${s.players[seat].name} anota ${pts} en ${label(a.cat)}`);
    nextTurn(s);
    return { ok: true };
  }
  return fail("bad_action");
}

export function label(c: Category): string {
  return ({ "1": "los 1", "2": "los 2", "3": "los 3", "4": "los 4", "5": "los 5", "6": "los 6", escalera: "escalera", full: "full", poker: "póker", generala: "generala", doble: "doble generala" } as Record<string, string>)[c];
}

export function viewFor(s: GeneralaState, seat: number) {
  const mine = s.winner === null && seat === s.turn;
  // Qué daría cada categoría libre con los dados de ahora (solo para quien juega)
  const options: Record<string, number> = {};
  if (mine && s.dice.length === 5) {
    const servida = s.rollsLeft === 2;
    CATEGORIES.forEach((c, i) => { if (s.sheets[seat][i] === null) options[c] = scoreOf(c, s.dice, servida, s.sheets[seat]); });
  }
  return {
    kind: "generala" as const,
    seat,
    players: s.players.map((p, i) => ({ seat: i, name: p.name, total: total(s.sheets[i]) })),
    categories: CATEGORIES,
    sheets: s.sheets,
    turn: s.turn,
    dice: s.dice,
    rollsLeft: s.rollsLeft,
    lastRoll: s.lastRoll,
    lastScore: s.lastScore,
    options,
    winner: s.winner,
    winners: s.winners,
    instantWin: s.instantWin,
    events: s.events.slice(-6),
  };
}
