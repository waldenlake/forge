import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { idleProgress, type ForgeProgress } from "../src/state/progress.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-phase-finish-handoff-"));
  try {
    mkdirSync(join(cwd, ".forge"), { recursive: true });
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function runForge(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [forgeBin, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: "", GEMINI_CLI: "" },
  });
}

function writeProgress(cwd: string, progress: ForgeProgress): void {
  writeFileSync(
    join(cwd, ".forge", "progress.json"),
    `${JSON.stringify(progress, null, 2)}\n`,
    "utf8",
  );
}

function verifiedProgress(): ForgeProgress {
  return {
    ...idleProgress(),
    feature: "checkout-flow",
    status: "verified",
    created_at: "2026-06-01T00:00:00.000Z",
    updated_at: "2026-06-04T00:00:00.000Z",
    spec_path: "docs/spec.md",
    plan_path: "docs/plan.md",
    total_tasks: 2,
    completed_tasks: 2,
    tasks: [
      { id: 1, title: "T1", status: "done", commit: "aaa1111" },
      { id: 2, title: "T2", status: "done", commit: "bbb2222" },
    ],
    verification: {
      status: "passed",
      attempts: 1,
      last_run: "2026-06-04T00:00:00.000Z",
      report_path: ".forge/verification-2026-06-04.json",
    },
  };
}

describe("phase:finish handoff archival", () => {
  test("archives handoff.md to .forge/specs/<feature>-handoff.md and clears live file", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, verifiedProgress());
      // Pre-existing handoff.md from the executing phase
      const live = join(cwd, ".forge", "handoff.md");
      writeFileSync(live, "# Forge Handoff\nFeature:    checkout-flow\n", "utf8");

      const result = runForge(cwd, ["phase:finish"]);
      expect(result.status).toBe(0);

      // Live handoff.md must be cleared (gone or empty)
      const stillExists = existsSync(live);
      if (stillExists) {
        // If the implementation chose "clear" instead of "delete", body must
        // be empty/whitespace.
        expect(readFileSync(live, "utf8").trim()).toBe("");
      } else {
        expect(stillExists).toBe(false);
      }

      // Archive must exist with the original content
      const archive = join(cwd, ".forge", "specs", "checkout-flow-handoff.md");
      expect(existsSync(archive)).toBe(true);
      expect(readFileSync(archive, "utf8")).toContain("checkout-flow");
    });
  });

  test("phase:finish succeeds even when no handoff.md exists (idempotent)", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, verifiedProgress());
      // No handoff.md present
      expect(existsSync(join(cwd, ".forge", "handoff.md"))).toBe(false);

      const result = runForge(cwd, ["phase:finish"]);
      expect(result.status).toBe(0);
      // No archive expected when nothing was there
      expect(
        existsSync(join(cwd, ".forge", "specs", "checkout-flow-handoff.md")),
      ).toBe(false);
    });
  });

  test("phase:finish JSON output reports archive path when archived", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, verifiedProgress());
      writeFileSync(
        join(cwd, ".forge", "handoff.md"),
        "# Forge Handoff\nFeature:    checkout-flow\n",
        "utf8",
      );

      const result = runForge(cwd, ["phase:finish"]);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);

      expect(payload.ok).toBe(true);
      expect(payload).toHaveProperty("handoff_archived_to");
      expect(payload.handoff_archived_to).toBe(
        ".forge/specs/checkout-flow-handoff.md",
      );
    });
  });

  test("phase:finish JSON output omits handoff_archived_to when no handoff existed", () => {
    withTempProject((cwd) => {
      writeProgress(cwd, verifiedProgress());

      const result = runForge(cwd, ["phase:finish"]);
      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);

      expect(payload.ok).toBe(true);
      expect(payload.handoff_archived_to ?? null).toBe(null);
    });
  });
});
