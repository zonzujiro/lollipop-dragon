import { describe, expect, it } from "vitest";
import { getRouteParts } from "./index";

describe("getRouteParts", () => {
  it("ignores repeated leading slashes", () => {
    expect(getRouteParts("//share/doc-123")).toEqual(["share", "doc-123"]);
  });
});
