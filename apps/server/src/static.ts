import type { FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { join } from "node:path";

export async function registerStatic(app: FastifyInstance, distDir: string) {
  await app.register(fastifyStatic, { root: distDir });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith("/api/")) {
      reply.code(404).send({ error: "not found" });
      return;
    }
    reply.sendFile("index.html", distDir);
  });
}
