import Fastify from "fastify";
import { registerProjectRoutes } from "./routes/project.js";

const app = Fastify({ logger: true });

app.get("/healthz", async () => ({ status: "ok" }));
app.register(registerProjectRoutes);

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
