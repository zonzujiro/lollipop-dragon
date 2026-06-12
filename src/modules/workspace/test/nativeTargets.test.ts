import { describe, expect, it } from "vitest";
import { createDefaultTab } from "../../../types/tab";
import { findTabByHandle } from "../controller";

describe("native workspace targets", () => {
  it("matches existing file tabs by native path", async () => {
    const tab = createDefaultTab({
      id: "tab-1",
      label: "notes.md",
      fileHandle: {
        kind: "native_file",
        path: "/tmp/project/notes.md",
        name: "notes.md",
      },
    });

    await expect(
      findTabByHandle(
        [tab],
        {
          kind: "native_file",
          path: "/tmp/project/notes.md",
          name: "notes.md",
        },
        "file",
      ),
    ).resolves.toBe(tab);
  });

  it("matches existing directory tabs by native path", async () => {
    const tab = createDefaultTab({
      id: "tab-1",
      label: "project",
      directoryHandle: {
        kind: "native_directory",
        path: "/tmp/project",
        name: "project",
      },
    });

    await expect(
      findTabByHandle(
        [tab],
        {
          kind: "native_directory",
          path: "/tmp/project",
          name: "project",
        },
        "directory",
      ),
    ).resolves.toBe(tab);
  });
});
