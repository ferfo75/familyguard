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
import path from "path";

const app = express();
app.use(cors());
// El límite default de express.json() (100kb) no alcanza para el audio del
// SOS en base64; lo subimos un poco con margen.
app.use(express.json({ limit: "3mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

// Sirve los .apk para que la app del hijo se pueda auto-actualizar con un
// toque, sin pasar por WhatsApp/USB cada vez. Archivos chicos (10-20MB),
// no vale la pena un bucket aparte para esto.
app.use("/apks", express.static(path.join(__dirname, "..", "public", "apks")));

app.use("/auth", authRouter);
app.use("/location", locationRouter);
app.use("/geofences", geofenceRouter);
app.use("/usage", usageRouter);
app.use("/sos", sosRouter);
app.use("/push", pushRouter);
app.use("/commands", commandsRouter);
app.use("/app", appVersionRouter);
app.use("/children", childrenRouter);

const httpServer = createServer(app);
initSocket(httpServer);
initPush();

const port = Number(process.env.PORT) || 4000;
httpServer.listen(port, () => {
  console.log(`[familyguard-backend] escuchando en http://localhost:${port}`);
});
