import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifySocketToken, adultStillInFamily } from "./middleware/auth";
import { db } from "./db";
import * as games from "./games/rooms";

let io: Server;

// Habitación de socket.io por familia: todos los sockets (apps padre y del/los
// hijos) de un mismo parentId se unen a "family:<parentId>" y así la
// ubicación y las alertas llegan en tiempo real sin que nadie se suscriba a
// datos de otra familia.
export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, { cors: { origin: "*" } });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("missing_token"));
    const payload = verifySocketToken(token);
    if (!payload) return next(new Error("invalid_token"));
    try {
      // Un adulto que el dueño quitó de la familia no puede seguir conectado con su sesión vieja.
      if (payload.kind === "parent" && !(await adultStillInFamily(payload))) return next(new Error("invalid_token"));
    } catch {
      return next(new Error("try_again"));
    }
    (socket.data as any).auth = payload;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const auth = (socket.data as any).auth;
    socket.join(`family:${auth.parentId}`);
    // Los sockets de la app del hijo además se unen a una sala propia por
    // dispositivo, para poder mandarle comandos (ej. "hacer sonar") a ESE
    // hijo puntual sin que le llegue a sus hermanos.
    if (auth.kind === "child") {
      socket.join(`child:${auth.childDeviceId}`);
    }
    registerGameHandlers(socket);
    socket.on("disconnect", () => {});
  });

  setInterval(() => games.sweep(), 10 * 60_000).unref();
  return io;
}

// ---------- Juegos familiares (Truco y Ludo) ----------
// El servidor es el árbitro: valida cada jugada y a cada uno le manda solo SU vista.

type Ack = (res: any) => void;

function playerKey(auth: any): string {
  // Cada adulto es un jugador distinto: la madre y el padre ya no comparten asiento en los juegos.
  if (auth.kind === "parent") return auth.adultId ? `a:${auth.adultId}` : `p:${auth.parentId}`;
  return `c:${auth.childDeviceId}`;
}

async function playerName(auth: any): Promise<string> {
  try {
    if (auth.kind === "parent" && auth.adultId) {
      const a = await db.adult.findUnique({ where: { id: auth.adultId }, select: { name: true } });
      return a?.name || "Mamá/Papá";
    }
    if (auth.kind === "parent") {
      const p = await db.parent.findUnique({ where: { id: auth.parentId }, select: { name: true } });
      return p?.name || "Mamá/Papá";
    }
    const c = await db.childDevice.findUnique({ where: { id: auth.childDeviceId }, select: { name: true } });
    return c?.name || "Hijo/a";
  } catch {
    return auth.kind === "parent" ? "Mamá/Papá" : "Hijo/a";
  }
}

function pushRoom(room: games.Room) {
  for (const key of games.playerKeys(room)) io.to(`player:${key}`).emit("game:state", games.viewFor(room, key));
}

/** Si le toca a la computadora (ajedrez solo), juega después de una pausa corta para que se note. */
function kickBot(room: games.Room) {
  if (!games.botPending(room)) return;
  setTimeout(async () => {
    const r = games.getRoom(room.id);
    if (!r || !games.botPending(r)) return;
    try { await games.botMove(r); } catch (e) { console.error("[games] bot", e); return; }
    pushRoom(r);
    if (r.status === "ended") pushLobby(r.familyId);
    kickBot(r);
  }, 700 + Math.random() * 900);
}

function pushLobby(familyId: string) {
  io.to(`family:${familyId}`).emit("game:lobby", { rooms: games.roomsOfFamily(familyId).map(games.summary) });
}

function registerGameHandlers(socket: Socket) {
  const auth = (socket.data as any).auth;
  const familyId: string = auth.parentId;
  const key = playerKey(auth);
  socket.join(`player:${key}`);
  let namePromise: Promise<string> | null = null;
  const me = async () => ({ key, name: await (namePromise ??= playerName(auth)) });

  const reply = (ack: Ack | undefined, res: any) => { if (typeof ack === "function") ack(res); };
  const guard = (fn: (data: any, ack?: Ack) => Promise<void> | void) => async (data: any, ack?: Ack) => {
    try { await fn(data ?? {}, ack); }
    catch (e) { console.error("[games]", e); reply(ack, { error: "server_error" }); }
  };

  socket.on("game:hello", guard(async (_d, ack) => {
    const mine = games.roomOf(familyId, key);
    reply(ack, {
      me: await me(),
      rooms: games.roomsOfFamily(familyId).map(games.summary),
      current: mine ? games.viewFor(mine, key) : null,
    });
  }));

  socket.on("game:create", guard(async (d, ack) => {
    const r = games.createRoom(familyId, d.type, await me());
    if ("error" in r) return reply(ack, r);
    pushRoom(r); pushLobby(familyId);
    reply(ack, { ok: true, roomId: r.id });
  }));

  socket.on("game:join", guard(async (d, ack) => {
    const team = d.team === 0 || d.team === 1 ? d.team : undefined;
    const r = games.joinRoom(familyId, String(d.roomId), await me(), team);
    if ("error" in r) return reply(ack, r);
    pushRoom(r); pushLobby(familyId);
    reply(ack, { ok: true, roomId: r.id });
  }));

  socket.on("game:leave", guard((_d, ack) => {
    const { room, left } = games.leaveRoom(familyId, key);
    io.to(`player:${key}`).emit("game:state", { roomId: null });
    if (room) pushRoom(room);
    if (left) pushLobby(familyId);
    reply(ack, { ok: true });
  }));

  socket.on("game:start", guard((d, ack) => {
    const r = games.startRoom(familyId, String(d.roomId), key);
    if ("error" in r) return reply(ack, r);
    pushRoom(r); pushLobby(familyId);
    reply(ack, { ok: true });
  }));

  socket.on("game:addbot", guard((d, ack) => {
    const r = games.addBot(familyId, String(d.roomId), key, String(d.level ?? "normal"));
    if ("error" in r) return reply(ack, r);
    pushRoom(r); pushLobby(familyId); kickBot(r);
    reply(ack, { ok: true });
  }));

  socket.on("game:action", guard((d, ack) => {
    const r = games.act(familyId, String(d.roomId), key, d.action);
    if ("error" in r) return reply(ack, r);
    pushRoom(r.room); kickBot(r.room);
    if (r.room.status === "ended") pushLobby(familyId);
    reply(ack, { ok: true });
  }));
}

export function broadcastToFamily(parentId: string, event: string, payload: unknown) {
  io?.to(`family:${parentId}`).emit(event, payload);
}

// true si el hijo tiene un socket conectado ahora mismo (si no, el comando
// no tiene quién lo reciba y conviene avisarle al padre en vez de fallar en silencio).
export async function isChildConnected(childDeviceId: string): Promise<boolean> {
  if (!io) return false;
  const sockets = await io.in(`child:${childDeviceId}`).fetchSockets();
  return sockets.length > 0;
}

export function sendCommandToChild(childDeviceId: string, event: string, payload: unknown) {
  io?.to(`child:${childDeviceId}`).emit(event, payload);
}
