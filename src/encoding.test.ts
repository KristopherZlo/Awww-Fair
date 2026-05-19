import { describe, expect, it } from "vitest";
import editorConfig from "../.editorconfig?raw";

describe("text encoding guard", () => {
  it("documents UTF-8 as the editor charset for source files", () => {
    expect(editorConfig).toMatch(/charset\s*=\s*utf-8/i);
  });
});
