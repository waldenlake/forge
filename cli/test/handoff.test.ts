import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  handoffRelativePath,
  renderHandoff,
  writeHandoff,
} from "../src/lib/handoff.js";
import { idleProgress, type ForgeProgress } from "../src/state/progress.js";

function progressFixture(overrides: Partial<ForgeProgress> = {}): ForgeProgress {
  return {
    ...idleProgress(),
    feature: "ecommerce-checkout",
    status: "executing",
    created_at: "2026-06-04T10:00:00.000Z",
    updated_at: "2026-06-04T15:10:22.000Z",
    spec_path: "docs/superpowers/specs/2026-06-04-ecommerce-checkout-design.md",
    plan_path: "docs/superpowers/specs/2026-06-04-ecommerce-checkout-tasks.md",
    total_tasks: 20,
    completed_tasks: 6,
    tasks: [
      ...Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        title: `Implement checkout step ${i + 1}`,
        status: "done" as const,
      })),
      {
        id: 6,
        title: "Implement checkout step 6",
        status: "done" as const,
        commit: "a3b2c1f",
      },
      {
        id: 7,
        title: "Implement checkout step 7 with payment validation",
        status: "pending" as const,
        tags: ["S007", "S008"],
      },
      ...Array.from({ length: 13 }, (_, i) => ({
        id: i + 8,
        title: `Future step ${i + 8}`,
        status: "pending" as const,
      })),
    ],
    ...overrides,
  };
}

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-handoff-"));
  try {
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe("handoff writer", () => {
  test("returns the relative path .forge/handoff.md", () => {
    expect(handoffRelativePath()).toBe(".forge/handoff.md");
  });

  test("rendered markdown contains every required field", () => {
    const md = renderHandoff(progressFixture());

    expect(md).toContain("# Forge Handoff");
    expect(md).toContain("Feature:");
    expect(md).toContain("ecommerce-checkout");
    expect(md).toContain("Status:");
    expect(md).toContain("executing");
    expect(md).toMatch(/Tasks:\s+6\/20/);
    expect(md).toMatch(/deferred:\s*0/);
    expect(md).toMatch(/Last task:\s*6\s*—\s*Implement checkout step 6/);
    expect(md).toMatch(/Last commit:\s*a3b2c1f/);
    expect(md).toMatch(/Next task:/);
    expect(md).toMatch(/id:\s*7/);
    expect(md).toContain("Implement checkout step 7 with payment validation");
    expect(md).toMatch(/scenarios:\s*S007,\s*S008/);
    expect(md).toContain(
      "spec:  docs/superpowers/specs/2026-06-04-ecommerce-checkout-design.md",
    );
    expect(md).toContain(
      "plan:  docs/superpowers/specs/2026-06-04-ecommerce-checkout-tasks.md",
    );
    // generated_at is required (ISO 8601 timestamp)
    expect(md).toMatch(
      /generated_at:\s*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    // Resume command literal is what hooks/skills key off of
    expect(md).toContain("Resume command: /resume");
  });

  test("idle progress (no feature) renders placeholders without crashing", () => {
    const md = renderHandoff(idleProgress());

    expect(md).toContain("# Forge Handoff");
    expect(md).toMatch(/Status:\s+idle/);
    // No active feature → fields exist with "—" placeholder.
    expect(md).toMatch(/Feature:\s+—/);
    expect(md).toMatch(/Last task:\s+—/);
    expect(md).toMatch(/Next task:\s+—/);
    expect(md).toContain("Resume command: /resume");
  });

  test("deferred tasks counted correctly", () => {
    const progress = progressFixture({
      tasks: [
        {
          id: 1,
          title: "Done task",
          status: "done",
          commit: "deadbeef",
        },
        { id: 2, title: "Deferred A", status: "deferred" },
        { id: 3, title: "Deferred B", status: "deferred" },
        { id: 4, title: "Pending next", status: "pending" },
      ],
      total_tasks: 4,
      completed_tasks: 1,
    });

    const md = renderHandoff(progress);
    expect(md).toMatch(/Tasks:\s+1\/4/);
    expect(md).toMatch(/deferred:\s*2/);
    expect(md).toMatch(/Next task:[\s\S]*id:\s*4/);
  });

  test("execution_complete with no remaining pending tasks → next_task is —", () => {
    const progress = progressFixture({
      status: "execution_complete",
      total_tasks: 2,
      completed_tasks: 2,
      tasks: [
        { id: 1, title: "T1", status: "done", commit: "aaa1111" },
        { id: 2, title: "T2", status: "done", commit: "bbb2222" },
      ],
    });

    const md = renderHandoff(progress);
    expect(md).toMatch(/Last task:\s*2\s*—\s*T2/);
    expect(md).toMatch(/Next task:\s+—/);
  });

  test("writeHandoff completely rewrites the file (no append)", () => {
    withTempProject((cwd) => {
      mkdirSync(join(cwd, ".forge"), { recursive: true });
      const handoffFile = join(cwd, ".forge", "handoff.md");

      // Pre-existing junk should be replaced, not appended to.
      writeFileSync(handoffFile, "OLD CONTENT\nshould vanish\n", "utf8");

      writeHandoff(cwd, progressFixture());
      const first = readFileSync(handoffFile, "utf8");
      expect(first).not.toContain("OLD CONTENT");
      expect(first).toContain("# Forge Handoff");

      // Second write should fully replace the first.
      writeHandoff(
        cwd,
        progressFixture({
          feature: "different-feature",
          // Override paths too so the assertion below catches a real overwrite.
          spec_path: "docs/different-spec.md",
          plan_path: "docs/different-plan.md",
        }),
      );
      const second = readFileSync(handoffFile, "utf8");
      expect(second).toContain("different-feature");
      expect(second).not.toContain("ecommerce-checkout");
    });
  });

  test("writeHandoff creates .forge/ directory if missing", () => {
    withTempProject((cwd) => {
      // Note: NOT pre-creating .forge/
      expect(existsSync(join(cwd, ".forge"))).toBe(false);
      writeHandoff(cwd, progressFixture());
      expect(existsSync(join(cwd, ".forge", "handoff.md"))).toBe(true);
    });
  });

  test("scenarios with no tags renders 'scenarios: —' rather than empty line", () => {
    const progress = progressFixture({
      tasks: [
        { id: 1, title: "T1", status: "done", commit: "abc1234" },
        { id: 2, title: "T2 no scenarios", status: "pending" },
      ],
      total_tasks: 2,
      completed_tasks: 1,
    });

    const md = renderHandoff(progress);
    expect(md).toMatch(/scenarios:\s+—/);
  });
});
