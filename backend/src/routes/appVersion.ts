import { Router } from "express";

export const appVersionRouter = Router();

// Se actualiza a mano cada vez que se sube un APK nuevo a public/apks/.
// Simple a propósito: no vale la pena una tabla en la base para esto.
const CHILD_APP_VERSION = {
  versionCode: 12,
  versionName: "0.7.0",
  downloadUrl: "/apks/familyguard-hijo-latest.apk",
  notes: "Nuevo: detecta si está caminando, en bici o en auto/micro y se lo muestra al padre junto con la ubicación.",
};

const PARENT_APP_VERSION = {
  versionCode: 12,
  versionName: "0.8.0",
  downloadUrl: "/apks/familyguard-padre-latest.apk",
  notes: "Nuevo: \"Resumen del día (IA)\" y avisos push de batería baja y viaje completado.",
};

// Las dos apps llaman esto al arrancar para saber si hay una versión más
// nueva que la que tienen instalada.
appVersionRouter.get("/child/latest", (req, res) => {
  res.json(CHILD_APP_VERSION);
});

appVersionRouter.get("/parent/latest", (req, res) => {
  res.json(PARENT_APP_VERSION);
});
