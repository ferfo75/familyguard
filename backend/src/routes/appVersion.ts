import { Router } from "express";

export const appVersionRouter = Router();

// Se actualiza a mano cada vez que se sube un APK nuevo a public/apks/.
// Simple a propósito: no vale la pena una tabla en la base para esto.
const CHILD_APP_VERSION = {
  versionCode: 8,
  versionName: "0.6.2",
  downloadUrl: "/apks/familyguard-hijo-latest.apk",
  notes: "El teléfono ahora reintenta reconectar el canal de \"hacer sonar\" de respaldo aunque el sistema haya matado el servicio principal en segundo plano.",
};

const PARENT_APP_VERSION = {
  versionCode: 7,
  versionName: "0.6.0",
  downloadUrl: "/apks/familyguard-padre-latest.apk",
  notes: "Mapa en vivo más ordenado (sin líneas enredadas) y nuevo recorrido animado del día, botón \"Ver recorrido de hoy\".",
};

// Las dos apps llaman esto al arrancar para saber si hay una versión más
// nueva que la que tienen instalada.
appVersionRouter.get("/child/latest", (req, res) => {
  res.json(CHILD_APP_VERSION);
});

appVersionRouter.get("/parent/latest", (req, res) => {
  res.json(PARENT_APP_VERSION);
});
