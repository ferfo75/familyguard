import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifySocketToken } from "./middleware/auth";

let io: Server;

// Habitación de socket.io por familia: todos los sockets (apps padre y del/los
// hijos) de un mismo parentId se unen a "family:<parentId>" y así la
// ubicación y las alertas llegan en tiempo real sin que nadie se suscriba a
// datos de otra familia.
export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, { cors: { origin: "*" } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("missing_token"));
    const payload = verifySocketToken(token);
    if (!payload) return next(new Error("invalid_token"));
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
    socket.on("disconnect", () => {});
  });

  return io;
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
