import fs from "fs";

let messaging: import("firebase-admin").messaging.Messaging | null = null;

// La inicialización de Firebase es opcional: si no se configura, el backend
// sigue funcionando (ubicación, geocercas, uso de apps) sin notificaciones push.
export function initPush() {
  const path = process.env.FIREBASE_CREDENTIALS_PATH;
  if (!path || !fs.existsSync(path)) {
    console.warn("[push] FIREBASE_CREDENTIALS_PATH no configurado: push deshabilitado");
    return;
  }
  const admin = require("firebase-admin");
  admin.initializeApp({ credential: admin.credential.cert(require(path)) });
  messaging = admin.messaging();
  console.log("[push] Firebase Admin inicializado");
}

export async function sendPushToTokens(tokens: string[], title: string, body: string, data?: Record<string, string>) {
  if (!messaging || tokens.length === 0) return;
  try {
    await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data,
    });
  } catch (err) {
    console.error("[push] error enviando notificación", err);
  }
}
