import { Router } from "express";

export const appVersionRouter = Router();

// Se actualiza a mano cada vez que se sube un APK nuevo a public/apks/.
// Simple a propósito: no vale la pena una tabla en la base para esto.
const CHILD_APP_VERSION = {
  versionCode: 11,
  versionName: "0.6.5",
  downloadUrl: "/apks/familyguard-hijo-latest.apk",
  notes: "Notificaciones push reales activadas (Firebase): ahora pueden llegar aunque la app esté cerrada.",
};

const PARENT_APP_VERSION = {
  versionCode: 10,
  versionName: "0.6.3",
  downloadUrl: "/apks/familyguard-padre-latest.apk",
  notes: "Notificaciones push reales activadas (Firebase): las alertas (ej. SOS) ahora pueden llegar aunque la app esté cerrada.",
};

// Las dos apps llaman esto al arrancar para saber si hay una versión más
// nueva que la que tienen instalada.
appVersionRouter.get("/child/latest", (req, res) => {
  res.json(CHILD_APP_VERSION);
});

appVersionRouter.get("/parent/latest", (req, res) => {
  res.json(PARENT_APP_VERSION);
});
