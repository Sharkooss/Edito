import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { resetDbForTests, getDb } from "../src/db.js";
import { registerProjectRoutes } from "../src/routes/project.js";

function buildApp() {
  const app = Fastify();
  app.register(registerProjectRoutes);
  return app;
}

const TRACK = {
  id: "t1",
  orderIndex: 0,
  name: "Piste 1",
  color: "",
  volume: 1,
  pan: 0,
  muted: false,
  soloed: false,
};

// Clips carry a foreign key onto media, and foreign_keys is ON, so a clip test
// has to put the referenced media row in place first.
function seedMedia(id = "m1") {
  getDb()
    .prepare(
      `INSERT INTO media (id, original_filename, stored_filename, duration, sample_rate)
       VALUES (?, 'a.wav', 'a.wav', 10, 44100)`
    )
    .run(id);
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

  it("round-trips clip gain and fades", async () => {
    const app = buildApp();
    seedMedia();
    await app.inject({
      method: "PATCH",
      url: "/api/project",
      payload: {
        tracks: [TRACK],
        clips: [
          {
            id: "c1",
            trackId: "t1",
            mediaId: "m1",
            startTime: 0,
            sourceOffset: 0,
            duration: 2,
            name: "a",
            gain: 0.5,
            fadeIn: 0.25,
            fadeOut: 0.75,
          },
        ],
      },
    });
    const clip = (await app.inject({ method: "GET", url: "/api/project" })).json().clips[0];
    expect(clip.gain).toBe(0.5);
    expect(clip.fadeIn).toBe(0.25);
    expect(clip.fadeOut).toBe(0.75);
  });

  it("defaults gain to 1 and fades to 0 when omitted", async () => {
    const app = buildApp();
    seedMedia();
    await app.inject({
      method: "PATCH",
      url: "/api/project",
      payload: {
        tracks: [TRACK],
        clips: [
          {
            id: "c1",
            trackId: "t1",
            mediaId: "m1",
            startTime: 0,
            sourceOffset: 0,
            duration: 2,
            name: "a",
          },
        ],
      },
    });
    const clip = (await app.inject({ method: "GET", url: "/api/project" })).json().clips[0];
    expect(clip.gain).toBe(1);
    expect(clip.fadeIn).toBe(0);
    expect(clip.fadeOut).toBe(0);
  });

  it("round-trips the clip effects payload verbatim", async () => {
    const app = buildApp();
    seedMedia();
    const effects = JSON.stringify({ speed: 0.5, pitch: -3, preservePitch: true });
    await app.inject({
      method: "PATCH",
      url: "/api/project",
      payload: {
        tracks: [TRACK],
        clips: [
          {
            id: "c1",
            trackId: "t1",
            mediaId: "m1",
            startTime: 0,
            sourceOffset: 0,
            duration: 2,
            name: "a",
            gain: 1,
            fadeIn: 0,
            fadeOut: 0,
            effects,
          },
        ],
      },
    });
    const clip = (await app.inject({ method: "GET", url: "/api/project" })).json().clips[0];
    expect(clip.effects).toBe(effects);
  });

  it("defaults effects to an empty object when omitted", async () => {
    const app = buildApp();
    seedMedia();
    await app.inject({
      method: "PATCH",
      url: "/api/project",
      payload: {
        tracks: [TRACK],
        clips: [
          {
            id: "c1",
            trackId: "t1",
            mediaId: "m1",
            startTime: 0,
            sourceOffset: 0,
            duration: 2,
            name: "a",
          },
        ],
      },
    });
    const clip = (await app.inject({ method: "GET", url: "/api/project" })).json().clips[0];
    expect(clip.effects).toBe("{}");
  });
});
