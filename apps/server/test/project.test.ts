import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { resetDbForTests } from "../src/db.js";
import { registerProjectRoutes } from "../src/routes/project.js";

function buildApp() {
  const app = Fastify();
  app.register(registerProjectRoutes);
  return app;
}

describe("project routes", () => {
  beforeEach(() => resetDbForTests());

  it("GET /api/project returns empty tracks/clips initially", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/project" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tracks).toEqual([]);
    expect(body.clips).toEqual([]);
  });

  it("PATCH /api/project upserts a track then GET reflects it", async () => {
    const app = buildApp();
    const track = {
      id: "t1",
      orderIndex: 0,
      name: "Voix",
      color: "#f97316",
      volume: 1,
      pan: 0,
      muted: false,
      soloed: false,
    };
    const patchRes = await app.inject({
      method: "PATCH",
      url: "/api/project",
      payload: { tracks: [track] },
    });
    expect(patchRes.statusCode).toBe(200);

    const getRes = await app.inject({ method: "GET", url: "/api/project" });
    const body = getRes.json();
    expect(body.tracks).toHaveLength(1);
    expect(body.tracks[0].name).toBe("Voix");
  });

  it("PATCH /api/project with an invalid track (missing orderIndex) returns 400", async () => {
    const app = buildApp();
    const invalidTrack = {
      id: "t1",
      // orderIndex is missing
      name: "Voix",
      color: "#f97316",
      volume: 1,
      pan: 0,
      muted: false,
      soloed: false,
    };
    const patchRes = await app.inject({
      method: "PATCH",
      url: "/api/project",
      payload: { tracks: [invalidTrack] },
    });
    expect(patchRes.statusCode).toBe(400);
  });
});
