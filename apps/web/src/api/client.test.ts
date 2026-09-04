import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchProject, saveProject } from "./client";

describe("api client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("fetchProject calls GET /api/project and returns json", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ tracks: [], clips: [], media: [], project: { id: 1, name: "x", sampleRate: 44100 } }) });
    const result = await fetchProject();
    expect(fetch).toHaveBeenCalledWith("/api/project");
    expect(result.tracks).toEqual([]);
  });

  it("saveProject sends PATCH with JSON body", async () => {
    (fetch as any).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    await saveProject({ tracks: [] });
    expect(fetch).toHaveBeenCalledWith(
      "/api/project",
      expect.objectContaining({ method: "PATCH", headers: expect.objectContaining({ "Content-Type": "application/json" }) })
    );
  });
});
