import { Router } from "express";

export const appVersionRouter = Router();

// Se actualiza a mano cada vez que se sube un APK nuevo a public/apks/.
// Simple a propósito: no vale la pena una tabla en la base para esto.
const CHILD_APP_VERSION = {
  versionCode: 14,
  versionName: "0.8.1",
  downloadUrl: "/apks/familyguard-hijo-latest.apk",
  notes: "Arreglo importante: después de actualizar la app, el seguimiento de ubicación se reactiva solo (antes quedaba apagado hasta abrirla). Abrila una vez después de instalar esta versión.",
};

const PARENT_APP_VERSION = {
  versionCode: 15,
  versionName: "0.9.2",
  downloadUrl: "/apks/familyguard-padre-latest.apk",
  notes: "Arreglo: los nombres de las pestañas ya no se parten en celulares angostos, y el aviso de \"no reporta\" explica qué hacer. Incluye cuentas por adulto, cerrar sesión y los juegos.",
};

// Las dos apps llaman esto al arrancar para saber si hay una versión más
// nueva que la que tienen instalada.
appVersionRouter.get("/child/latest", (req, res) => {
  res.json(CHILD_APP_VERSION);
});

appVersionRouter.get("/parent/latest", (req, res) => {
  res.json(PARENT_APP_VERSION);
});
