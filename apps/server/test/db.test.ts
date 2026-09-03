import { describe, it, expect, beforeEach } from "vitest";
import { resetDbForTests, getDb } from "../src/db.js";

describe("db", () => {
  beforeEach(() => resetDbForTests());

  it("creates the default project row", () => {
    const row = getDb().prepare("SELECT * FROM project WHERE id = 1").get() as { name: string };
    expect(row.name).toBe("Untitled Project");
  });
});
