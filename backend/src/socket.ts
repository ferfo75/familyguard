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
    socket.on("disconnect", () => {});
  });

  return io;
}

export function broadcastToFamily(parentId: string, event: string, payload: unknown) {
  io?.to(`family:${parentId}`).emit(event, payload);
}
