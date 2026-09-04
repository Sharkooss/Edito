import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createWriteStream, createReadStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { join, extname } from "node:path";
import { pipeline } from "node:stream/promises";
import { getDb } from "../db.js";

const ALLOWED_MIME = new Set(["audio/wav", "audio/wave", "audio/x-wav", "audio/mpeg", "audio/ogg", "audio/mp4", "audio/m4a"]);
const MAX_BYTES = 100 * 1024 * 1024;

export async function registerMediaRoutes(app: FastifyInstance, opts: { uploadsDir: string; maxBytes?: number }) {
  const uploadsDir = opts.uploadsDir;
  const maxBytes = opts.maxBytes ?? MAX_BYTES;
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });

  app.post("/api/media", async (req, reply) => {
    const file = await (req as any).file({ limits: { fileSize: maxBytes } });
    if (!file || !ALLOWED_MIME.has(file.mimetype)) {
      return reply.code(415).send({ error: "unsupported media type" });
    }
    const id = randomUUID();
    const storedFilename = `${id}${extname(file.filename)}`;
    const dest = join(uploadsDir, storedFilename);
    await pipeline(file.file, createWriteStream(dest));

    // @fastify/busboy caps the stream at `limits.fileSize` but does not emit an
    // error on the stream itself — it just truncates and ends normally, setting
    // `file.file.truncated = true`. Since we pipe directly to disk (rather than
    // buffering via `toBuffer()`), we must check this flag ourselves.
    if ((file.file as any).truncated) {
      if (existsSync(dest)) unlinkSync(dest);
      return reply.code(413).send({ error: "file too large" });
    }

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
    const size = stat.size;
    const rangeHeader = req.headers.range;

    if (!rangeHeader) {
      reply.header("Accept-Ranges", "bytes");
      reply.header("Content-Length", size);
      return reply.send(createReadStream(filePath));
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    let start: number;
    let end: number;
    if (!match || (match[1] === "" && match[2] === "")) {
      reply.header("Content-Range", `bytes */${size}`);
      return reply.code(416).send({ error: "range not satisfiable" });
    }
    if (match[1] === "") {
      // suffix range: bytes=-N -> last N bytes
      const suffixLength = Number(match[2]);
      start = Math.max(size - suffixLength, 0);
      end = size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] === "" ? size - 1 : Number(match[2]);
    }

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= size) {
      reply.header("Content-Range", `bytes */${size}`);
      return reply.code(416).send({ error: "range not satisfiable" });
    }

    reply.code(206);
    reply.header("Accept-Ranges", "bytes");
    reply.header("Content-Range", `bytes ${start}-${end}/${size}`);
    reply.header("Content-Length", end - start + 1);
    return reply.send(createReadStream(filePath, { start, end }));
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
