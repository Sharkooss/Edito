import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createWriteStream, createReadStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { getDb } from "../db.js";

const ALLOWED_MIME = new Set(["audio/wav", "audio/wave", "audio/x-wav", "audio/mpeg", "audio/ogg", "audio/mp4", "audio/m4a"]);
const MAX_BYTES = 100 * 1024 * 1024;

export async function registerMediaRoutes(app: FastifyInstance, opts: { uploadsDir: string }) {
  const uploadsDir = opts.uploadsDir;
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

  app.post("/api/media", async (req, reply) => {
    const file = await (req as any).file({ limits: { fileSize: MAX_BYTES } });
    if (!file || !ALLOWED_MIME.has(file.mimetype)) {
      return reply.code(415).send({ error: "unsupported media type" });
    }
    const id = randomUUID();
    const storedFilename = `${id}${extname(file.filename)}`;
    const dest = join(uploadsDir, storedFilename);
    await pipeline(file.file, createWriteStream(dest));

    // Durée/sampleRate réelles décodées côté client lors de l'import (Web Audio),
    // transmises en champs de formulaire à côté du fichier.
    const fields = file.fields as any;
    const duration = Number(fields?.duration?.value ?? 0);
    const sampleRate = Number(fields?.sampleRate?.value ?? 44100);

    getDb()
      .prepare(
        "INSERT INTO media (id, original_filename, stored_filename, duration, sample_rate) VALUES (?, ?, ?, ?, ?)"
      )
      .run(id, file.filename, storedFilename, duration, sampleRate);

    reply.code(201).send({ id, originalFilename: file.filename, duration, sampleRate });
  });

  app.get("/api/media/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = getDb().prepare("SELECT * FROM media WHERE id = ?").get(id) as any;
    if (!row) return reply.code(404).send({ error: "not found" });
    const filePath = join(uploadsDir, row.stored_filename);
    const stat = statSync(filePath);
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Length", stat.size);
    return reply.send(createReadStream(filePath));
  });

  app.delete("/api/media/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const refCount = (db.prepare("SELECT COUNT(*) c FROM clip WHERE media_id = ?").get(id) as any).c;
    if (refCount > 0) return reply.code(409).send({ error: "media still referenced by a clip" });
    const row = db.prepare("SELECT * FROM media WHERE id = ?").get(id) as any;
    if (!row) return reply.code(404).send({ error: "not found" });
    const filePath = join(uploadsDir, row.stored_filename);
    if (existsSync(filePath)) unlinkSync(filePath);
    db.prepare("DELETE FROM media WHERE id = ?").run(id);
    reply.code(204).send();
  });
}
