import { Router } from "express";

export const appVersionRouter = Router();

// Se actualiza a mano cada vez que se sube un APK nuevo a public/apks/.
// Simple a propósito: no vale la pena una tabla en la base para esto.
const CHILD_APP_VERSION = {
  versionCode: 13,
  versionName: "0.8.0",
  downloadUrl: "/apks/familyguard-hijo-latest.apk",
  notes: "Nuevo diseño. Misiones con foto, botón \"Llegué bien\", estado del teléfono, no se pierde ninguna ubicación aunque no haya señal, y juegos en familia (Truco y Ludo).",
};

const PARENT_APP_VERSION = {
  versionCode: 13,
  versionName: "0.9.0",
  downloadUrl: "/apks/familyguard-padre-latest.apk",
  notes: "Nuevo diseño. La ubicación se ve siempre (con aviso si está desactualizada), los hijos ya no se pierden, misiones con recompensa y foto, novedades de la familia y juegos (Truco y Ludo).",
};

// Las dos apps llaman esto al arrancar para saber si hay una versión más
// nueva que la que tienen instalada.
appVersionRouter.get("/child/latest", (req, res) => {
  res.json(CHILD_APP_VERSION);
});

appVersionRouter.get("/parent/latest", (req, res) => {
  res.json(PARENT_APP_VERSION);
});
