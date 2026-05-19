import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("text encoding guard", () => {
  it("documents UTF-8 as the editor charset for source files", () => {
    const editorConfig = readFileSync(".editorconfig", "utf8");

    expect(editorConfig).toMatch(/charset\s*=\s*utf-8/i);
  });
});
