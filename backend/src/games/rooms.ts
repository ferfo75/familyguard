import { randomBytes } from "node:crypto";
import * as truco from "./truco";
import * as ludo from "./ludo";
import * as chess from "./chess";
import * as generala from "./generala";
import * as golf from "./minigolf";

/**
 * Salas de juego en memoria, una lista por familia (parentId).
 *
 * Decisión consciente: NO se guardan en la base. Una partida dura minutos, y si el servidor se
 * reinicia (Render duerme/despliega) la sala se pierde — los jugadores vuelven a crearla.
 * A cambio no hay tablas, ni migraciones, ni limpieza de datos de chicos.
 */

export type GameType = "truco" | "ludo" | "chess" | "generala" | "minigolf";
export type AnyState = truco.TrucoState | ludo.LudoState | chess.ChessState | generala.GeneralaState | golf.GolfState;
export interface Seat { key: string; name: string; team?: 0 | 1 }

export interface Room {
  id: string;
  familyId: string;
  type: GameType;
  hostKey: string;
  seats: Seat[];
  status: "lobby" | "playing" | "ended";
  state: AnyState | null;
  order: string[]; // clave de jugador por asiento, una vez empezada la partida
  createdAt: number;
  updatedAt: number;
}

const rooms = new Map<string, Room>();
const MAX_SEATS: Record<GameType, number> = { truco: 4, ludo: 4, chess: 2, generala: 4, minigolf: 4 };

export function roomsOfFamily(familyId: string): Room[] {
  return [...rooms.values()].filter((r) => r.familyId === familyId);
}
export function getRoom(id: string): Room | undefined { return rooms.get(id); }
export function roomOf(familyId: string, key: string): Room | undefined {
  return roomsOfFamily(familyId).find((r) => r.seats.some((s) => s.key === key));
}

export function summary(r: Room) {
  return {
    id: r.id, type: r.type, status: r.status, host: r.hostKey,
    seats: r.seats.map((s) => ({ key: s.key, name: s.name, team: s.team ?? null })),
    max: MAX_SEATS[r.type],
  };
}

type Err = { error: string };
const err = (error: string): Err => ({ error });

export function createRoom(familyId: string, type: GameType, me: Seat): Room | Err {
  if (!(type in MAX_SEATS)) return err("bad_game");
  if (roomOf(familyId, me.key)) return err("already_in_room");
  const now = Date.now();
  const r: Room = {
    id: randomBytes(4).toString("hex"), familyId, type, hostKey: me.key,
    seats: [{ ...me, team: type === "truco" ? 0 : undefined }], status: "lobby", state: null, order: [],
    createdAt: now, updatedAt: now,
  };
  rooms.set(r.id, r);
  return r;
}

export function joinRoom(familyId: string, roomId: string, me: Seat, team?: 0 | 1): Room | Err {
  const r = rooms.get(roomId);
  if (!r || r.familyId !== familyId) return err("room_not_found");
  if (r.status !== "lobby") return err("already_started");
  const existing = r.seats.find((s) => s.key === me.key);
  if (existing) {
    if (r.type === "truco" && (team === 0 || team === 1)) existing.team = team;
    r.updatedAt = Date.now();
    return r;
  }
  if (roomOf(familyId, me.key)) return err("already_in_room");
  if (r.seats.length >= MAX_SEATS[r.type]) return err("room_full");
  let t: 0 | 1 | undefined;
  if (r.type === "truco") {
    const count = (x: 0 | 1) => r.seats.filter((s) => s.team === x).length;
    t = team === 0 || team === 1 ? team : count(0) <= count(1) ? 0 : 1;
  }
  r.seats.push({ ...me, team: t });
  r.updatedAt = Date.now();
  return r;
}

/** @returns la sala (o null si quedó vacía y se borró). */
export function leaveRoom(familyId: string, key: string): { room: Room | null; left?: Room } {
  const r = roomOf(familyId, key);
  if (!r) return { room: null };
  if (r.status === "playing") {
    // Abandonar una partida en curso la termina (si no, los demás quedarían esperando para siempre).
    r.status = "ended";
    const name = r.seats.find((s) => s.key === key)?.name ?? "Alguien";
    if (r.state) { r.state.events.push(`${name} abandonó la partida`); }
    r.updatedAt = Date.now();
    return { room: r, left: r };
  }
  r.seats = r.seats.filter((s) => s.key !== key);
  r.updatedAt = Date.now();
  if (r.seats.length === 0) { rooms.delete(r.id); return { room: null, left: r }; }
  if (r.hostKey === key) r.hostKey = r.seats[0].key;
  return { room: r, left: r };
}

export function startRoom(familyId: string, roomId: string, key: string): Room | Err {
  const r = rooms.get(roomId);
  if (!r || r.familyId !== familyId) return err("room_not_found");
  if (r.hostKey !== key) return err("only_host_starts");
  if (r.status !== "lobby") return err("already_started");
  if (r.type === "truco") {
    const a = r.seats.filter((s) => s.team === 0);
    const b = r.seats.filter((s) => s.team === 1);
    const ok = (a.length === 1 && b.length === 1) || (a.length === 2 && b.length === 2);
    if (!ok) return err("truco_needs_1v1_or_2v2");
    // Asientos alternados por equipo: equipo A en 0 y 2, equipo B en 1 y 3.
    const ordered: Seat[] = a.length === 1 ? [a[0], b[0]] : [a[0], b[0], a[1], b[1]];
    r.order = ordered.map((s) => s.key);
    r.state = truco.createTruco(ordered.map((s) => ({ id: s.key, name: s.name })));
  } else if (r.type === "ludo") {
    if (r.seats.length < 2) return err("ludo_needs_2_to_4");
    r.order = r.seats.map((s) => s.key);
    r.state = ludo.createLudo(r.seats.map((s) => ({ id: s.key, name: s.name })));
  } else if (r.type === "chess") {
    if (r.seats.length !== 2) return err("chess_needs_2");
    const st = chess.createChess(r.seats.map((s) => ({ id: s.key, name: s.name })));
    r.order = st.players.map((p) => p.id); // el sorteo de colores define el asiento
    r.state = st;
  } else if (r.type === "generala") {
    r.order = r.seats.map((s) => s.key);
    r.state = generala.createGenerala(r.seats.map((s) => ({ id: s.key, name: s.name })));
  } else {
    r.order = r.seats.map((s) => s.key);
    r.state = golf.createGolf(r.seats.map((s) => ({ id: s.key, name: s.name })));
  }
  r.status = "playing";
  r.updatedAt = Date.now();
  return r;
}

export function act(familyId: string, roomId: string, key: string, action: any): { room: Room } | Err {
  const r = rooms.get(roomId);
  if (!r || r.familyId !== familyId) return err("room_not_found");
  if (r.status !== "playing" || !r.state) return err("not_playing");
  const seat = r.order.indexOf(key);
  if (seat < 0) return err("not_a_player");
  const st = r.state;
  let res: { ok: true } | { ok: false; error: string };
  if (st.kind === "truco") {
    const clean = sanitizeTruco(action);
    if (!clean) return err("bad_action"); // jamás se interpreta una acción mal formada como otra distinta
    res = truco.apply(st, seat, clean);
  } else if (st.kind === "ludo") {
    const clean = sanitizeLudo(action);
    if (!clean) return err("bad_action");
    res = ludo.apply(st, seat, clean);
  } else if (st.kind === "chess") {
    const clean = sanitizeChess(action);
    if (!clean) return err("bad_action");
    res = chess.apply(st, seat, clean);
  } else if (st.kind === "generala") {
    const clean = sanitizeGenerala(action);
    if (!clean) return err("bad_action");
    res = generala.apply(st, seat, clean);
  } else {
    const clean = sanitizeGolf(action);
    if (!clean) return err("bad_action");
    res = golf.apply(st, seat, clean);
  }
  if (!res.ok) return err(res.error);
  r.updatedAt = Date.now();
  if (r.state.winner !== null) r.status = "ended";
  return { room: r };
}

// Lo que llega por el socket es input de un cliente: se reduce a la forma esperada antes de usarlo.
const CALLS = ["envido", "real", "falta", "truco", "retruco", "valecuatro"];
const SUITS = ["espada", "basto", "oro", "copa"];
function sanitizeTruco(a: any): truco.Action | null {
  switch (a?.t) {
    case "play":
      if (!SUITS.includes(a.card?.suit) || !Number.isInteger(a.card?.rank)) return null;
      return { t: "play", card: { suit: a.card.suit, rank: a.card.rank } };
    case "call": return CALLS.includes(a.call) ? { t: "call", call: a.call } : null;
    case "respond": return a.r === "quiero" || a.r === "noquiero" ? { t: "respond", r: a.r } : null;
    case "mazo": return { t: "mazo" };
    default: return null;
  }
}
function sanitizeLudo(a: any): ludo.Action | null {
  if (a?.t === "move") return Number.isInteger(a.piece) ? { t: "move", piece: a.piece } : null;
  if (a?.t === "roll") return { t: "roll" };
  return null;
}

function sanitizeChess(a: any): chess.Action | null {
  if (a?.t === "resign") return { t: "resign" };
  if (a?.t === "move" && typeof a.from === "string" && typeof a.to === "string") {
    const promo = ["q", "r", "b", "n"].includes(a.promotion) ? a.promotion : undefined;
    return { t: "move", from: a.from, to: a.to, promotion: promo };
  }
  return null;
}
function sanitizeGenerala(a: any): generala.Action | null {
  if (a?.t === "roll") {
    const keep = Array.isArray(a.keep) && a.keep.length === 5 ? a.keep.map(Boolean) : undefined;
    return { t: "roll", keep };
  }
  if (a?.t === "score" && (generala.CATEGORIES as readonly string[]).includes(a.cat)) return { t: "score", cat: a.cat };
  return null;
}
function sanitizeGolf(a: any): golf.Action | null {
  if (a?.t === "shot" && typeof a.angle === "number" && typeof a.power === "number" && Number.isFinite(a.angle) && Number.isFinite(a.power)) {
    return { t: "shot", angle: a.angle, power: a.power };
  }
  return null;
}

export function viewFor(r: Room, key: string) {
  const base = { roomId: r.id, status: r.status, type: r.type, host: r.hostKey };
  if (!r.state) return { ...base, lobby: summary(r) };
  const seat = r.order.indexOf(key);
  if (seat < 0) return { ...base, lobby: summary(r) };
  return {
    ...base,
    lobby: summary(r),
    game:
      r.state.kind === "truco" ? truco.viewFor(r.state, seat)
      : r.state.kind === "ludo" ? ludo.viewFor(r.state, seat)
      : r.state.kind === "chess" ? chess.viewFor(r.state, seat)
      : r.state.kind === "generala" ? generala.viewFor(r.state, seat)
      : golf.viewFor(r.state, seat),
  };
}

export function playerKeys(r: Room): string[] {
  return r.seats.map((s) => s.key);
}

/** Borra salas abandonadas: lobby sin tocar 2 h, partida sin movimiento 6 h, terminadas a los 30 min. */
export function sweep(now = Date.now()) {
  for (const [id, r] of rooms) {
    const idle = now - r.updatedAt;
    const limit = r.status === "ended" ? 30 * 60_000 : r.status === "lobby" ? 2 * 3600_000 : 6 * 3600_000;
    if (idle > limit) rooms.delete(id);
  }
}

export function _resetForTests() { rooms.clear(); }
