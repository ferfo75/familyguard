import { Router } from "express";

export const appVersionRouter = Router();

// Se actualiza a mano cada vez que se sube un APK nuevo a public/apks/.
// Simple a propósito: no vale la pena una tabla en la base para esto.
const CHILD_APP_VERSION = {
  versionCode: 9,
  versionName: "0.6.3",
  downloadUrl: "/apks/familyguard-hijo-latest.apk",
  notes: "Al sonar, ahora se abre una pantalla explicando que los padres llaman, con botón para dejar de sonar. El padre también puede cortarlo a distancia.",
};

const PARENT_APP_VERSION = {
  versionCode: 8,
  versionName: "0.6.1",
  downloadUrl: "/apks/familyguard-padre-latest.apk",
  notes: "\"Hacer sonar\" ahora pide confirmación antes de mandarlo, y se agregó un botón \"Detener\" para cortarlo a distancia.",
};

// Las dos apps llaman esto al arrancar para saber si hay una versión más
// nueva que la que tienen instalada.
appVersionRouter.get("/child/latest", (req, res) => {
  res.json(CHILD_APP_VERSION);
});

appVersionRouter.get("/parent/latest", (req, res) => {
  res.json(PARENT_APP_VERSION);
});
