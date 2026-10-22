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

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/location", locationRouter);
app.use("/geofences", geofenceRouter);
app.use("/usage", usageRouter);
app.use("/sos", sosRouter);
app.use("/push", pushRouter);

const httpServer = createServer(app);
initSocket(httpServer);
initPush();

const port = Number(process.env.PORT) || 4000;
httpServer.listen(port, () => {
  console.log(`[familyguard-backend] escuchando en http://localhost:${port}`);
});
