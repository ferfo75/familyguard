import { Router } from "express";

export const appVersionRouter = Router();

// Se actualiza a mano cada vez que se sube un APK nuevo a public/apks/.
// Simple a propósito: no vale la pena una tabla en la base para esto.
const CHILD_APP_VERSION = {
  versionCode: 15,
  versionName: "0.9.0",
  downloadUrl: "/apks/familyguard-hijo-latest.apk",
  notes: "Novedad: si Android duerme el seguimiento, el servidor lo despierta solo con un aviso de máxima prioridad. Abrí la app una vez después de instalar esta versión para que quede registrada.",
};

const PARENT_APP_VERSION = {
  versionCode: 18,
  versionName: "0.10.2",
  downloadUrl: "/apks/familyguard-padre-latest.apk",
  notes: "Nuevo: cada tarjeta de Familia muestra una línea de diagnóstico (cuándo fue el último latido del celular del hijo/a, qué versión de la app tiene y si puede recibir el aviso de despertar). El botón de la mira ahora responde enseguida y explica en un mensaje qué pasó (avisado, sin registrar, sin conexión, etc.). Incluye las alertas con sonido de SOS.",
};

// Las dos apps llaman esto al arrancar para saber si hay una versión más
// nueva que la que tienen instalada.
appVersionRouter.get("/child/latest", (req, res) => {
  res.json(CHILD_APP_VERSION);
});

appVersionRouter.get("/parent/latest", (req, res) => {
  res.json(PARENT_APP_VERSION);
});
