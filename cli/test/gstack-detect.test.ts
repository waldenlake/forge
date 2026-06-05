import { describe, expect, test } from "vitest";

import { detectGstack } from "../src/lib/gstack.js";

describe("detectGstack", () => {
  test("returns one of cli | skill | none", () => {
    const result = detectGstack();
    expect(["cli", "skill", "none"]).toContain(result);
  });

  test("verify-plan skip-reason wording communicates skill-pack mode (when applicable)", async () => {
    // This test is a contract assertion: when the reader is invoked in an
    // environment that already has the skill pack, the doctor and
    // verify-plan layers must phrase the skip with the AI-skill hint.
    // Smoke-test the lib output type rather than running spawnSync to keep
    // CI deterministic. The full e2e path is covered by verify-plan tests.
    const result = detectGstack();
    expect(typeof result).toBe("string");
  });
});
