import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { initSocket } from "./socket";
import { initPush } from "./utils/push";
import { authRouter } from "./routes/auth";
import { locationRouter } from "./routes/location";
import { geofenceRouter } from "./routes/geofence";
import { usageRouter } from "./routes/usage";
import { sosRouter } from "./routes/sos";
import { pushRouter } from "./routes/push";
import { commandsRouter } from "./routes/commands";
import { appVersionRouter } from "./routes/appVersion";
import { childrenRouter } from "./routes/children";
import { placesRouter } from "./routes/places";
import { summaryRouter } from "./routes/summary";
import { internalRouter } from "./routes/internal";
import { tasksRouter } from "./routes/tasks";
import { feedRouter, checkinsRouter } from "./routes/feed";
import path from "path";

const app = express();
// Detrás del proxy de Render, req.ip tiene que ser el del cliente real (lo usa el límite de intentos de invitación).
app.set("trust proxy", 1);
app.use(cors());
// El límite default de express.json() (100kb) no alcanza para el audio del
// SOS en base64; lo subimos un poco con margen.
app.use(express.json({ limit: "3mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Sirve los .apk para que la app del hijo se pueda auto-actualizar con un
// toque, sin pasar por WhatsApp/USB cada vez. Archivos chicos (10-20MB),
// no vale la pena un bucket aparte para esto.
app.use("/apks", express.static(path.join(__dirname, "..", "public", "apks")));

// Pantalla de juegos en familia (Truco y Ludo): una sola página que abren las dos apps en un WebView.
// No lleva datos ni secretos: el token llega en el fragmento (#t=...) que el navegador nunca envía al servidor.
app.use("/games", express.static(path.join(__dirname, "..", "public", "games"), { maxAge: 0 }));

app.use("/auth", authRouter);
app.use("/location", locationRouter);
app.use("/location", placesRouter);
app.use("/location", summaryRouter);
app.use("/internal", internalRouter);
app.use("/geofences", geofenceRouter);
app.use("/usage", usageRouter);
app.use("/sos", sosRouter);
app.use("/push", pushRouter);
app.use("/commands", commandsRouter);
app.use("/app", appVersionRouter);
app.use("/children", childrenRouter);
app.use("/tasks", tasksRouter);
app.use("/feed", feedRouter);
app.use("/checkins", checkinsRouter);

const httpServer = createServer(app);
initSocket(httpServer);
initPush();

const port = Number(process.env.PORT) || 4000;
httpServer.listen(port, () => {
  console.log(`[familyguard-backend] escuchando en http://localhost:${port}`);
});
