import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import { resetDbForTests, getDb } from "../src/db.js";
import { registerMediaRoutes } from "../src/routes/media.js";

const UPLOADS_DIR = "/tmp/edito-test-uploads";

function buildApp(opts?: { maxBytes?: number }) {
  const app = Fastify();
  app.register(multipart);
  app.register(registerMediaRoutes, { uploadsDir: "/tmp/edito-test-uploads", maxBytes: opts?.maxBytes });
  return app;
}

describe("media routes", () => {
  beforeEach(() => resetDbForTests());

  it("rejects non-audio uploads with 415", async () => {
    const app = buildApp();
    const form = new FormData();
    form.append("file", new Blob(["not audio"], { type: "text/plain" }), "note.txt");
    const res = await app.inject({ method: "POST", url: "/api/media", payload: form as any });
    expect(res.statusCode).toBe(415);
  });

  it("DELETE returns 409 when media is referenced by a clip", async () => {
    const db = getDb();
    db.prepare(
      "INSERT INTO media (id, original_filename, stored_filename, duration, sample_rate) VALUES ('m1','a.wav','m1.wav', 3, 44100)"
    ).run();
    db.prepare(
      "INSERT INTO track (id, name, order_index, color, volume, pan) VALUES ('t1','T',0,'#fff',1,0)"
    ).run();
    db.prepare(
      "INSERT INTO clip (id, track_id, media_id, start_time, source_offset, duration, name) VALUES ('c1','t1','m1',0,0,3,'clip')"
    ).run();
    const app = buildApp();
    const res = await app.inject({ method: "DELETE", url: "/api/media/m1" });
    expect(res.statusCode).toBe(409);
  });

  it("rejects uploads exceeding the size limit with 413 and leaves no trace", async () => {
    if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });
    const before = readdirSync(UPLOADS_DIR);

    const app = buildApp({ maxBytes: 10 });
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(1000)], { type: "audio/wav" }), "big.wav");
    const res = await app.inject({ method: "POST", url: "/api/media", payload: form as any });

    expect(res.statusCode).toBe(413);
    expect((getDb().prepare("SELECT COUNT(*) c FROM media").get() as any).c).toBe(0);
    const after = readdirSync(UPLOADS_DIR);
    expect(after.length).toBe(before.length);
  });

  it("honors a Range header with a 206 partial response and correct Content-Type", async () => {
    const app = buildApp();
    const form = new FormData();
    form.append("file", new Blob(["abcdefgh"], { type: "audio/wav" }), "small.wav");
    const uploadRes = await app.inject({ method: "POST", url: "/api/media", payload: form as any });
    expect(uploadRes.statusCode).toBe(201);
    const { id } = uploadRes.json();

    const res = await app.inject({
      method: "GET",
      url: `/api/media/${id}`,
      headers: { range: "bytes=0-3" },
    });

    expect(res.statusCode).toBe(206);
    expect(res.headers["content-range"]).toBeDefined();
    expect(res.headers["content-type"]).toBe("audio/wav");
    expect(res.rawPayload.length).toBe(4);
  });

  it("returns the correct Content-Type on the plain (non-Range) GET path", async () => {
    const app = buildApp();
    const form = new FormData();
    form.append("file", new Blob(["abcdefgh"], { type: "audio/wav" }), "small.wav");
    const uploadRes = await app.inject({ method: "POST", url: "/api/media", payload: form as any });
    expect(uploadRes.statusCode).toBe(201);
    const { id } = uploadRes.json();

    const res = await app.inject({ method: "GET", url: `/api/media/${id}` });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("audio/wav");
  });

  it("accepts an audio/webm upload (microphone recordings) with 201, not 415", async () => {
    const app = buildApp();
    const form = new FormData();
    form.append("file", new Blob(["fake webm bytes"], { type: "audio/webm" }), "Enregistrement.webm");
    const res = await app.inject({ method: "POST", url: "/api/media", payload: form as any });
    expect(res.statusCode).toBe(201);
  });

  it("returns audio/webm Content-Type when fetching a stored .webm recording", async () => {
    const app = buildApp();
    const form = new FormData();
    form.append("file", new Blob(["fake webm bytes"], { type: "audio/webm" }), "Enregistrement.webm");
    const uploadRes = await app.inject({ method: "POST", url: "/api/media", payload: form as any });
    expect(uploadRes.statusCode).toBe(201);
    const { id } = uploadRes.json();

    const res = await app.inject({ method: "GET", url: `/api/media/${id}` });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("audio/webm");
  });
});
