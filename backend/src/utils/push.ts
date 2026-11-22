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

/** Tipos de aviso que la app del padre distingue por sonido y ventana. */
export type AlertKind = "sos" | "msg" | "home" | "school" | "zone";

/**
 * Aviso de datos puro (sin bloque "notification"): así Android siempre le pasa el
 * mensaje a la app, también con la app cerrada o en segundo plano, y es la app la
 * que elige el sonido y la ventana emergente según `kind`. Prioridad alta para que
 * llegue al instante aunque el celular esté en reposo.
 */
export async function sendAlertPush(tokens: string[], kind: AlertKind, title: string, body: string, extra: Record<string, string> = {}) {
  if (!messaging || tokens.length === 0) return;
  try {
    await messaging.sendEachForMulticast({
      tokens,
      data: { kind, title, body, ...extra },
      android: { priority: "high", ttl: kind === "sos" ? 3_600_000 : 600_000 },
    });
  } catch (err) {
    console.error("[push] error enviando aviso", err);
  }
}

/** Una zona se llama "Casa"/"Colegio"…: de ahí sale qué sonido usar al llegar. */
export function zoneKindFromName(name: string): "home" | "school" | "zone" {
  const n = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/(casa|hogar|home|depto|departamento)/.test(n)) return "home";
  if (/(cole|escuela|school|instituto|liceo|jardin|universidad|facu)/.test(n)) return "school";
  return "zone";
}

/**
 * Aviso de máxima prioridad para "despertar" la app del hijo: Android lo entrega aunque el celular esté en
 * reposo y le permite arrancar el seguimiento. Devuelve "invalid" si el token ya no sirve (app desinstalada).
 */
export async function sendWakePush(token: string): Promise<"ok" | "invalid" | "off" | "error"> {
  if (!messaging) return "off";
  try {
    await messaging.send({ token, data: { kind: "wake" }, android: { priority: "high", ttl: 10 * 60_000 } });
    return "ok";
  } catch (err: any) {
    const code = String(err?.code ?? "");
    if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token") || code.includes("invalid-argument")) return "invalid";
    console.error("[push] error despertando al hijo", err);
    return "error";
  }
}
