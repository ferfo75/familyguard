import { Router } from "express";

export const appVersionRouter = Router();

// Se actualiza a mano cada vez que se sube un APK nuevo a public/apks/.
// Simple a propósito: no vale la pena una tabla en la base para esto.
const CHILD_APP_VERSION = {
  versionCode: 10,
  versionName: "0.6.4",
  downloadUrl: "/apks/familyguard-hijo-latest.apk",
  notes: "Permiso agregado para que la pantalla de \"te están llamando\" se abra sola en Android 14+ (antes podía quedar solo como notificación).",
};

const PARENT_APP_VERSION = {
  versionCode: 9,
  versionName: "0.6.2",
  downloadUrl: "/apks/familyguard-padre-latest.apk",
  notes: "Nuevo: botón para eliminar un hijo/a (ej. un perfil de prueba), con confirmación.",
};

// Las dos apps llaman esto al arrancar para saber si hay una versión más
// nueva que la que tienen instalada.
appVersionRouter.get("/child/latest", (req, res) => {
  res.json(CHILD_APP_VERSION);
});

appVersionRouter.get("/parent/latest", (req, res) => {
  res.json(PARENT_APP_VERSION);
});
