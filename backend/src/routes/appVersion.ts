import { Router } from "express";

export const appVersionRouter = Router();

// Se actualiza a mano cada vez que se sube un APK nuevo a public/apks/.
// Simple a propósito: no vale la pena una tabla en la base para esto.
const CHILD_APP_VERSION = {
  versionCode: 6,
  versionName: "0.6.0",
  downloadUrl: "/apks/familyguard-hijo-latest.apk",
  notes: "Auto-actualización con un toque, ruta, velocidad, hacer sonar, nota de voz en SOS, batería obligatoria.",
};

const PARENT_APP_VERSION = {
  versionCode: 5,
  versionName: "0.5.0",
  downloadUrl: "/apks/familyguard-padre-latest.apk",
  notes: "Arreglo de botones tapados en SOS, satélite por defecto, camino en vivo siempre visible, marcadores nuevos.",
};

// Las dos apps llaman esto al arrancar para saber si hay una versión más
// nueva que la que tienen instalada.
appVersionRouter.get("/child/latest", (req, res) => {
  res.json(CHILD_APP_VERSION);
});

appVersionRouter.get("/parent/latest", (req, res) => {
  res.json(PARENT_APP_VERSION);
});
