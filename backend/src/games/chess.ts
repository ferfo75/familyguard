import { randomInt } from "node:crypto";
import { Chess } from "chess.js";

/**
 * Ajedrez de 2 jugadores con el servidor como árbitro (reglas completas con chess.js:
 * enroque, al paso, coronación, jaque, mate, tablas por ahogado, repetición, 50 jugadas y material insuficiente).
 * Asiento 0 = blancas, asiento 1 = negras (se sortea al empezar).
 */

export interface ChessPlayer { id: string; name: string }

export interface ChessMoveRec {
  n: number; seat: number; from: string; to: string; san: string;
  piece: string; captured: string | null; promotion: string | null;
  flags: string; check: boolean; mate: boolean;
}

export interface ChessState {
  kind: "chess";
  players: ChessPlayer[]; // índice = asiento; players[0] juega con blancas
  game: Chess; // no sale al cliente
  turn: number; // asiento que mueve
  moves: ChessMoveRec[];
  moveSeq: number;
  /** null mientras se juega; -1 = tablas; 0/1 = ganó ese asiento */
  winner: number | null;
  result: "mate" | "resign" | "abandon" | "stalemate" | "repetition" | "fifty" | "material" | "draw" | null;
  events: string[];
}

export type Action =
  | { t: "move"; from: string; to: string; promotion?: "q" | "r" | "b" | "n" }
  | { t: "resign" };
export type Result = { ok: true } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

export function createChess(players: ChessPlayer[], rng: () => number = () => randomInt(0, 2)): ChessState {
  if (players.length !== 2) throw new Error("chess_needs_2");
  const ordered = rng() === 0 ? players : [players[1], players[0]];
  return {
    kind: "chess", players: ordered, game: new Chess(), turn: 0, moves: [], moveSeq: 0, winner: null, result: null,
    events: [`Juegan blancas ${ordered[0].name} y negras ${ordered[1].name}`],
  };
}

const SQ = /^[a-h][1-8]$/;

function finishIfOver(s: ChessState) {
  const g = s.game;
  if (g.isCheckmate()) {
    s.winner = 1 - s.turn; // el que mueve está en mate
    s.result = "mate";
    s.events.push(`¡Jaque mate! Gana ${s.players[s.winner].name}`);
  } else if (g.isStalemate()) { s.winner = -1; s.result = "stalemate"; s.events.push("Tablas por rey ahogado"); }
  else if (g.isInsufficientMaterial()) { s.winner = -1; s.result = "material"; s.events.push("Tablas por material insuficiente"); }
  else if (g.isThreefoldRepetition()) { s.winner = -1; s.result = "repetition"; s.events.push("Tablas por repetición"); }
  else if (g.isDrawByFiftyMoves()) { s.winner = -1; s.result = "fifty"; s.events.push("Tablas por la regla de las 50 jugadas"); }
  else if (g.isDraw()) { s.winner = -1; s.result = "draw"; s.events.push("Tablas"); }
}

export function apply(s: ChessState, seat: number, a: Action): Result {
  if (s.winner !== null) return fail("game_over");
  if (seat !== 0 && seat !== 1) return fail("not_a_player");
  if (a.t === "resign") {
    s.winner = 1 - seat; s.result = "resign";
    s.events.push(`${s.players[seat].name} se rindió`);
    return { ok: true };
  }
  if (a.t !== "move") return fail("bad_action");
  if (seat !== s.turn) return fail("not_your_turn");
  if (!SQ.test(a.from) || !SQ.test(a.to)) return fail("bad_action");
  let m;
  try {
    m = s.game.move({ from: a.from, to: a.to, promotion: a.promotion });
  } catch {
    return fail("illegal_move");
  }
  s.moveSeq += 1;
  const rec: ChessMoveRec = {
    n: s.moveSeq, seat, from: m.from, to: m.to, san: m.san, piece: m.piece, captured: m.captured ?? null,
    promotion: m.promotion ?? null, flags: m.flags, check: s.game.inCheck(), mate: s.game.isCheckmate(),
  };
  s.moves.push(rec);
  s.turn = 1 - seat;
  if (s.events.length > 30) s.events.shift();
  finishIfOver(s);
  return { ok: true };
}

/** Piezas que cada bando se llevó, deducidas de las jugadas. */
function capturedBy(s: ChessState, seat: number): string[] {
  return s.moves.filter((m) => m.seat === seat && m.captured).map((m) => m.captured!);
}

export function viewFor(s: ChessState, seat: number) {
  const mine = s.winner === null && seat === s.turn;
  const legal = mine
    ? s.game.moves({ verbose: true }).map((m) => ({ from: m.from, to: m.to, promotion: m.promotion ? true : false }))
    : [];
  return {
    kind: "chess" as const,
    seat,
    players: s.players.map((p, i) => ({ seat: i, name: p.name, color: i === 0 ? "w" : "b" })),
    fen: s.game.fen(),
    turn: s.turn,
    inCheck: s.game.inCheck(),
    legal,
    moves: s.moves.slice(-120),
    moveSeq: s.moveSeq,
    captured: [capturedBy(s, 0), capturedBy(s, 1)],
    winner: s.winner,
    result: s.result,
    events: s.events.slice(-6),
  };
}
