import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { resetDbForTests, getDb } from "../src/db.js";
import { registerMediaRoutes } from "../src/routes/media.js";

function buildApp() {
  const app = Fastify();
  app.register(multipart);
  app.register(registerMediaRoutes, { uploadsDir: "/tmp/edito-test-uploads" });
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
});
