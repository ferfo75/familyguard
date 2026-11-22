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
  versionCode: 16,
  versionName: "0.10.0",
  downloadUrl: "/apks/familyguard-padre-latest.apk",
  notes: "Alertas con sonido propio: el SOS suena como alarma y aparece en pantalla completa sobre cualquier app; \"voy en camino\", llegada a casa y llegada al colegio suenan distinto cada uno. Después de instalar, entrá a Más → Alertas en este celular y tocá Permitir en cada punto. Truco: baraja nueva con cartas más grandes (se agrandan al tocarlas) e irse al mazo vale como un no quiero.",
};

// Las dos apps llaman esto al arrancar para saber si hay una versión más
// nueva que la que tienen instalada.
appVersionRouter.get("/child/latest", (req, res) => {
  res.json(CHILD_APP_VERSION);
});

appVersionRouter.get("/parent/latest", (req, res) => {
  res.json(PARENT_APP_VERSION);
});
