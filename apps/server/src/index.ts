import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { join } from "node:path";
import { registerProjectRoutes } from "./routes/project.js";
import { registerMediaRoutes } from "./routes/media.js";
import { registerStatic } from "./static.js";

const app = Fastify({ logger: true });
const dataDir = process.env.DATA_DIR ?? join(process.cwd(), "data");

app.get("/healthz", async () => ({ status: "ok" }));
app.register(multipart);
app.register(registerProjectRoutes);
app.register(registerMediaRoutes, { uploadsDir: join(dataDir, "uploads") });
await registerStatic(app, join(process.cwd(), "../web/dist"));

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
