import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { registerProjectRoutes } from "./routes/project.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerStatic } from "./static.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });
const dataDir = process.env.DATA_DIR ?? join(__dirname, "../../../data");

app.get("/healthz", async () => ({ status: "ok" }));
app.register(multipart);
app.register(registerProjectRoutes);
app.register(registerMediaRoutes, { uploadsDir: join(dataDir, "uploads") });
const webDistCandidates = [join(process.cwd(), "web-dist"), join(process.cwd(), "../web/dist")];
const webDist = webDistCandidates.find((p) => existsSync(p)) ?? webDistCandidates[0];
await registerStatic(app, webDist);

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
