import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

describe("forge CLI baseline", () => {
  test("prints machine-readable version compatibility JSON", async () => {
    const result = spawnSync(
      process.execPath,
      ["cli/dist/index.js", "--version-json"],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      ok: true,
      version: "0.2.0",
      compatible: true,
    });
  });

  test("prints readable help without error output", () => {
    const result = spawnSync(
      process.execPath,
      ["cli/dist/index.js", "--help"],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("forge");
    expect(result.stderr).toBe("");
  });
});
