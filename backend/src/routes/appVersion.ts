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
  versionCode: 17,
  versionName: "0.10.1",
  downloadUrl: "/apks/familyguard-padre-latest.apk",
  notes: "Alertas con sonido propio: el SOS suena como alarma y aparece en pantalla completa sobre cualquier app; \"voy en camino\", llegada a casa y llegada al colegio suenan distinto cada uno. Después de instalar, entrá a Más → Alertas en este celular y tocá Permitir en cada punto. Nuevo: en cada tarjeta de Familia hay un botón con la mira para pedir la ubicación ahora (despierta el celular del hijo/a).",
};

// Las dos apps llaman esto al arrancar para saber si hay una versión más
// nueva que la que tienen instalada.
appVersionRouter.get("/child/latest", (req, res) => {
  res.json(CHILD_APP_VERSION);
});

appVersionRouter.get("/parent/latest", (req, res) => {
  res.json(PARENT_APP_VERSION);
});
