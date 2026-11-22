import { Chess } from "chess.js";

/**
 * Rival de ajedrez para jugar solo: búsqueda negamax con poda alfa-beta, material y tablas de posición.
 * Tres niveles: fácil (mira 1 jugada y a veces elige una no tan buena), normal (2) y difícil (3).
 * Es un jugador sencillo a propósito: sirve para entretenerse y practicar, no para ganarle a un maestro.
 */

export type BotLevel = "facil" | "normal" | "dificil";
export const LEVELS: BotLevel[] = ["facil", "normal", "dificil"];
export const LEVEL_NAME: Record<BotLevel, string> = { facil: "fácil", normal: "normal", dificil: "difícil" };

const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// Tablas de posición (desde las blancas; fila 0 = octava fila).
const PST: Record<string, number[]> = {
  p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
  n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
  b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
  r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
  q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
  k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
};

/** Valor del tablero desde el punto de vista de las blancas. */
function evaluate(g: Chess): number {
  const board = g.board();
  let s = 0;
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = board[r][f];
    if (!p) continue;
    const idx = p.color === "w" ? r * 8 + f : (7 - r) * 8 + f;
    const v = VAL[p.type] + PST[p.type][idx];
    s += p.color === "w" ? v : -v;
  }
  return s;
}

type Mv = { from: string; to: string; promotion?: string; captured?: string; piece: string };

function ordered(g: Chess): Mv[] {
  const ms = g.moves({ verbose: true }) as unknown as Mv[];
  const key = (m: Mv) => (m.captured ? 10 * VAL[m.captured] - VAL[m.piece] / 10 : 0) + (m.promotion ? 800 : 0);
  return ms.sort((a, b) => key(b) - key(a));
}

const TIMEOUT = new Error("timeout");
let nodes = 0, deadline = 0;

function negamax(g: Chess, depth: number, alpha: number, beta: number, ply: number): number {
  if (depth === 0) return (g.turn() === "w" ? 1 : -1) * evaluate(g);
  if ((++nodes & 255) === 0 && Date.now() > deadline) throw TIMEOUT;
  const ms = ordered(g);
  if (ms.length === 0) return g.inCheck() ? -100000 + ply : 0; // mate o ahogado
  let best = -Infinity;
  for (const m of ms) {
    g.move({ from: m.from, to: m.to, promotion: m.promotion });
    const sc = -negamax(g, depth - 1, -beta, -alpha, ply + 1);
    g.undo();
    if (sc > best) best = sc;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

const tick = () => new Promise<void>((r) => setImmediate(r));

/**
 * Elige una jugada para el bando que mueve en `fen`. Profundiza de a una jugada (1, 2, 3) hasta agotar el tiempo
 * del nivel, y cede el turno al servidor entre jugadas para no trabarlo.
 */
export async function chooseMove(fen: string, level: BotLevel, rnd: () => number = Math.random): Promise<{ from: string; to: string; promotion?: "q" }> {
  const g = new Chess(fen);
  let moves = ordered(g);
  if (moves.length === 0) throw new Error("no_moves");
  const maxDepth = level === "facil" ? 1 : level === "normal" ? 2 : 3;
  deadline = Date.now() + (level === "dificil" ? 2200 : level === "normal" ? 1500 : 800);
  nodes = 0;
  let scored: { m: Mv; s: number }[] = moves.map((m) => ({ m, s: 0 }));
  for (let d = 1; d <= maxDepth; d++) {
    const cur: { m: Mv; s: number }[] = [];
    try {
      for (const m of moves) {
        g.move({ from: m.from, to: m.to, promotion: m.promotion });
        let sc: number;
        try { sc = g.isCheckmate() ? 100000 : -negamax(g, d - 1, -Infinity, Infinity, 1); } finally { g.undo(); }
        cur.push({ m, s: sc });
        await tick();
      }
    } catch (e) {
      if (e === TIMEOUT) break; // se usa la última profundidad completa
      throw e;
    }
    scored = cur.sort((a, b) => b.s - a.s);
    moves = scored.map((x) => x.m); // la mejor primero, para podar más en la próxima vuelta
  }
  scored.sort((a, b) => b.s - a.s);
  let pick = scored[0];
  if (pick.s < 90000) { // si hay mate, siempre se juega
    const margin = level === "facil" ? 400 : level === "normal" ? 25 : 4;
    const pool = scored.filter((x) => x.s >= scored[0].s - margin).slice(0, level === "facil" ? 5 : 4);
    pick = pool[Math.floor(rnd() * pool.length)];
    if (level === "facil" && rnd() < 0.15) pick = scored[Math.floor(rnd() * scored.length)]; // de vez en cuando un descuido
  }
  return { from: pick.m.from, to: pick.m.to, promotion: pick.m.promotion ? "q" : undefined };
}
