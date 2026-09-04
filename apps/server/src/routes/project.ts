import type { FastifyInstance } from "fastify";
import { getDb } from "../db.js";
import type { Track, Clip, Project, Media, ProjectState } from "../types.js";

function rowToTrack(r: any): Track {
  return {
    id: r.id,
    orderIndex: r.order_index,
    name: r.name,
    color: r.color,
    volume: r.volume,
    pan: r.pan,
    muted: !!r.muted,
    soloed: !!r.soloed,
  };
}

function rowToClip(r: any): Clip {
  return {
    id: r.id,
    trackId: r.track_id,
    mediaId: r.media_id,
    startTime: r.start_time,
    sourceOffset: r.source_offset,
    duration: r.duration,
    name: r.name,
    gain: r.gain,
    fadeIn: r.fade_in,
    fadeOut: r.fade_out,
  };
}

function rowToMedia(r: any): Media {
  return {
    id: r.id,
    originalFilename: r.original_filename,
    storedFilename: r.stored_filename,
    duration: r.duration,
    sampleRate: r.sample_rate,
  };
}

export function loadProjectState(): ProjectState {
  const db = getDb();
  const projectRow = db.prepare("SELECT * FROM project WHERE id = 1").get() as any;
  const tracks = (db.prepare("SELECT * FROM track ORDER BY order_index").all() as any[]).map(rowToTrack);
  const clips = (db.prepare("SELECT * FROM clip").all() as any[]).map(rowToClip);
  const media = (db.prepare("SELECT * FROM media").all() as any[]).map(rowToMedia);
  const project: Project = { id: projectRow.id, name: projectRow.name, sampleRate: projectRow.sample_rate };
  return { project, tracks, clips, media };
}

const trackSchema = {
  type: "object",
  required: ["id", "orderIndex", "name", "color", "volume", "pan", "muted", "soloed"],
  properties: {
    id: { type: "string" },
    orderIndex: { type: "number" },
    name: { type: "string" },
    color: { type: "string" },
    volume: { type: "number" },
    pan: { type: "number" },
    muted: { type: "boolean" },
    soloed: { type: "boolean" },
  },
};

const clipSchema = {
  type: "object",
  required: ["id", "trackId", "mediaId", "startTime", "sourceOffset", "duration", "name"],
  properties: {
    id: { type: "string" },
    trackId: { type: "string" },
    mediaId: { type: "string" },
    startTime: { type: "number" },
    sourceOffset: { type: "number" },
    duration: { type: "number" },
    name: { type: "string" },
    gain: { type: "number" },
    fadeIn: { type: "number" },
    fadeOut: { type: "number" },
  },
};

const patchProjectBodySchema = {
  type: "object",
  properties: {
    project: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
    },
    tracks: {
      type: "array",
      items: trackSchema,
    },
    clips: {
      type: "array",
      items: clipSchema,
    },
  },
};

export async function registerProjectRoutes(app: FastifyInstance) {
  app.get("/api/project", async () => loadProjectState());

  app.patch("/api/project", { schema: { body: patchProjectBodySchema } }, async (req, reply) => {
    const body = req.body as { project?: Partial<Project>; tracks?: Track[]; clips?: Clip[] };
    const db = getDb();
    const tx = db.transaction(() => {
      if (body.project) {
        db.prepare("UPDATE project SET name = COALESCE(?, name), updated_at = datetime('now') WHERE id = 1").run(
          body.project.name ?? null
        );
      }
      if (body.tracks) {
        db.prepare("DELETE FROM track").run();
        const insert = db.prepare(
          `INSERT INTO track (id, project_id, name, order_index, color, volume, pan, muted, soloed)
           VALUES (@id, 1, @name, @orderIndex, @color, @volume, @pan, @muted, @soloed)`
        );
        for (const t of body.tracks) {
          insert.run({ ...t, muted: t.muted ? 1 : 0, soloed: t.soloed ? 1 : 0 });
        }
      }
      if (body.clips) {
        db.prepare("DELETE FROM clip").run();
        const insert = db.prepare(
          `INSERT INTO clip (id, track_id, media_id, start_time, source_offset, duration, name, gain, fade_in, fade_out)
           VALUES (@id, @trackId, @mediaId, @startTime, @sourceOffset, @duration, @name, @gain, @fadeIn, @fadeOut)`
        );
        // gain/fades arrived after v1, so a client that predates them still saves.
        for (const c of body.clips) {
          insert.run({
            id: c.id,
            trackId: c.trackId,
            mediaId: c.mediaId,
            startTime: c.startTime,
            sourceOffset: c.sourceOffset,
            duration: c.duration,
            name: c.name,
            gain: c.gain ?? 1,
            fadeIn: c.fadeIn ?? 0,
            fadeOut: c.fadeOut ?? 0,
          });
        }
      }
    });
    tx();
    reply.send({ ok: true });
  });
}
