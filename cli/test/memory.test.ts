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
import { Command } from "commander";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { ForgeConfig } from "../src/state/config.js";
import { defaultConfig } from "../src/state/config.js";
import { writeAndVerify } from "../src/state/memory.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-memory-"));

  try {
    mkdirSync(join(cwd, ".forge"), { recursive: true });
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

async function withTempProjectAsync(run: (cwd: string) => Promise<void>): Promise<void> {
  const cwd = mkdtempSync(join(tmpdir(), "forge-cli-memory-"));

  try {
    mkdirSync(join(cwd, ".forge"), { recursive: true });
    await run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function runForge(cwd: string, args: string[]) {
  return spawnSync(process.execPath, [forgeBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: "",
      GEMINI_CLI: "",
    },
  });
}

function parseStdout(result: ReturnType<typeof runForge>): any {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

function writeConfig(cwd: string, config: ForgeConfig = defaultConfig()): void {
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("../src/state/memory.js");
  vi.resetModules();
  process.exitCode = undefined;
});

describe("memory runtime commands", () => {
  test("memory:set-feature creates and replaces Current Feature inside Forge", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeFileSync(
        join(cwd, "AGENTS.md"),
        "# Project Instructions\n\n## Forge\n\n**Current Feature:**\n- Feature: Old Feature\n\n## Notes\nKeep this.\n",
        "utf8",
      );

      const result = runForge(cwd, [
        "memory:set-feature",
        "--feature",
        "Runtime",
        "--progress",
        "2/9 tasks complete",
        "--next-task-id",
        "9",
        "--next-task-title",
        "Implement Memory Runtime",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toEqual({
        ok: true,
        verified: true,
        memory_file: join(cwd, "AGENTS.md"),
      });

      const memory = readFileSync(join(cwd, "AGENTS.md"), "utf8");
      expect(memory).toContain("## Forge");
      expect(memory).toContain("**Current Feature**");
      expect(memory).not.toContain("**Current Feature:**");
      expect(memory).toContain("- Feature: Runtime");
      expect(memory).toContain("- Progress: 2/9 tasks complete");
      expect(memory).toContain("- Next Task: 9 - Implement Memory Runtime");
      expect(memory).not.toContain("Old Feature");
      expect(memory).toContain("## Notes\nKeep this.");
    });
  });

  test("memory:set-feature replaces an existing Current Feature marker without a colon", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeFileSync(
        join(cwd, "AGENTS.md"),
        "# Project Instructions\n\n## Forge\n\n**Current Feature**\n- Feature: Old Feature\n- Progress: stale\n\n## Notes\nKeep this.\n",
        "utf8",
      );

      const result = runForge(cwd, [
        "memory:set-feature",
        "--feature",
        "Runtime",
        "--progress",
        "2/9 tasks complete",
        "--next-task-id",
        "9",
        "--next-task-title",
        "Implement Memory Runtime",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        verified: true,
      });

      const memory = readFileSync(join(cwd, "AGENTS.md"), "utf8");
      expect(memory).toContain("**Current Feature**");
      expect(memory).not.toContain("**Current Feature:**");
      expect(memory).toContain("- Feature: Runtime");
      expect(memory).not.toContain("Old Feature");
      expect(memory).not.toContain("stale");
      expect(memory).toContain("## Notes\nKeep this.");
    });
  });

  test("memory:set-feature does not treat Forge Runtime as the Forge section", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeFileSync(
        join(cwd, "AGENTS.md"),
        "# Project Instructions\n\n## Forge Runtime\nRuntime notes stay here.\n",
        "utf8",
      );

      const result = runForge(cwd, [
        "memory:set-feature",
        "--feature",
        "Runtime",
        "--progress",
        "2/9 tasks complete",
        "--next-task-id",
        "9",
        "--next-task-title",
        "Implement Memory Runtime",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        verified: true,
      });

      const memory = readFileSync(join(cwd, "AGENTS.md"), "utf8");
      expect(memory).toContain("## Forge Runtime\nRuntime notes stay here.");
      expect(memory).toContain("\n## Forge\n");
      expect(memory.indexOf("## Forge Runtime")).toBeLessThan(
        memory.indexOf("\n## Forge\n"),
      );
      expect(memory).toContain("**Current Feature**");
      expect(memory).toContain("- Feature: Runtime");
    });
  });

  test("memory:set-feature preserves inline Current Feature text inside Forge notes", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeFileSync(
        join(cwd, "AGENTS.md"),
        "# Project Instructions\n\n## Forge\n\nNote: **Current Feature** means current task metadata.\nKeep this note.\n",
        "utf8",
      );

      const result = runForge(cwd, [
        "memory:set-feature",
        "--feature",
        "Runtime",
        "--progress",
        "2/9 tasks complete",
        "--next-task-id",
        "9",
        "--next-task-title",
        "Implement Memory Runtime",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        verified: true,
      });

      const memory = readFileSync(join(cwd, "AGENTS.md"), "utf8");
      expect(memory).toContain(
        "Note: **Current Feature** means current task metadata.",
      );
      expect(memory).toContain("Keep this note.");
      expect(memory).toContain("**Current Feature**\n- Feature: Runtime");
    });
  });

  test("memory:complete-feature removes current feature, appends completed entry, and verifies by reading again", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeFileSync(
        join(cwd, "AGENTS.md"),
        "# Project Instructions\n\n## Forge\n\n**Current Feature:**\n- Feature: Runtime\n- Progress: 8/9 tasks complete\n- Next Task: 9 - Implement Memory Runtime\n\n## Notes\nKeep this.\n",
        "utf8",
      );

      const result = runForge(cwd, [
        "memory:complete-feature",
        "--feature",
        "Runtime",
        "--date",
        "2026-05-26",
        "--tasks",
        "9/9",
        "--deferred",
        "none",
        "--spec",
        ".forge/specs/runtime.md",
        "--plan",
        ".forge/specs/runtime-plan.md",
        "--scenarios",
        "memory commands verified",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toEqual({
        ok: true,
        verified: true,
        memory_file: join(cwd, "AGENTS.md"),
      });

      const memory = readFileSync(join(cwd, "AGENTS.md"), "utf8");
      expect(memory).toContain("## Forge");
      expect(memory).not.toContain("**Current Feature:**");
      expect(memory).toContain("**Completed Features**");
      expect(memory).not.toContain("**Completed Features:**");
      expect(memory).toContain("- Runtime (2026-05-26)");
      expect(memory).toContain("Tasks: 9/9");
      expect(memory).toContain("Deferred: none");
      expect(memory).toContain("Spec: .forge/specs/runtime.md");
      expect(memory).toContain("Plan: .forge/specs/runtime-plan.md");
      expect(memory).toContain("Scenarios: memory commands verified");
      expect(memory).toContain("## Notes\nKeep this.");
    });
  });

  test("memory:complete-feature removes colonless current feature and reuses colonless completed section", () => {
    withTempProject((cwd) => {
      writeConfig(cwd);
      writeFileSync(
        join(cwd, "AGENTS.md"),
        "# Project Instructions\n\n## Forge\n\n**Current Feature**\n- Feature: Runtime\n- Progress: stale\n\n**Completed Features**\n- Earlier Feature (2026-05-25)\n\n## Notes\nKeep this.\n",
        "utf8",
      );

      const result = runForge(cwd, [
        "memory:complete-feature",
        "--feature",
        "Runtime",
        "--date",
        "2026-05-26",
        "--tasks",
        "9/9",
        "--deferred",
        "none",
        "--spec",
        ".forge/specs/runtime.md",
        "--plan",
        ".forge/specs/runtime-plan.md",
        "--scenarios",
        "memory commands verified",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        verified: true,
      });

      const memory = readFileSync(join(cwd, "AGENTS.md"), "utf8");
      expect(memory).not.toContain("**Current Feature**");
      expect(memory).not.toContain("Progress: stale");
      expect(memory).toContain("**Completed Features**");
      expect(memory).not.toContain("**Completed Features:**");
      expect(memory.match(/\*\*Completed Features\*\*/g)).toHaveLength(1);
      expect(memory).toContain("- Runtime (2026-05-26)");
      expect(memory).toContain("- Earlier Feature (2026-05-25)");
      expect(memory).toContain("## Notes\nKeep this.");
    });
  });

  test("memory commands read configured memory_file", () => {
    withTempProject((cwd) => {
      writeConfig(cwd, defaultConfig({ memory_file: "CLAUDE.md" }));

      const result = runForge(cwd, [
        "memory:set-feature",
        "--feature",
        "Runtime",
        "--progress",
        "started",
        "--next-task-id",
        "9",
        "--next-task-title",
        "Implement Memory Runtime",
      ]);

      expect(result.status).toBe(0);
      expect(parseStdout(result)).toMatchObject({
        ok: true,
        verified: true,
        memory_file: join(cwd, "CLAUDE.md"),
      });
      expect(readFileSync(join(cwd, "CLAUDE.md"), "utf8")).toContain(
        "- Feature: Runtime",
      );
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false);
    });
  });

  test("memory:set-feature fails without config and does not create an arbitrary memory file", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, [
        "memory:set-feature",
        "--feature",
        "Runtime",
        "--progress",
        "started",
        "--next-task-id",
        "9",
        "--next-task-title",
        "Implement Memory Runtime",
      ]);

      expect(result.status).toBe(1);
      expect(parseStdout(result)).toMatchObject({ ok: false });
      expect(existsSync(join(cwd, "AGENTS.md"))).toBe(false);
      expect(existsSync(join(cwd, "CLAUDE.md"))).toBe(false);
      expect(existsSync(join(cwd, "GEMINI.md"))).toBe(false);
    });
  });

  test("memory:complete-feature returns verified false when write verification cannot find the completed marker", async () => {
    await withTempProjectAsync(async (cwd) => {
      writeConfig(cwd);
      writeFileSync(join(cwd, "AGENTS.md"), "## Forge\n", "utf8");
      const originalCwd = process.cwd();

      try {
        process.chdir(cwd);
        vi.doMock("../src/state/memory.js", async (importOriginal) => {
          const actual =
            await importOriginal<typeof import("../src/state/memory.js")>();

          return {
            ...actual,
            writeAndVerify: () => false,
          };
        });
        const { registerMemoryCommand } = await import(
          "../src/commands/memory.js"
        );
        const writes: string[] = [];
        const stdout = vi
          .spyOn(process.stdout, "write")
          .mockImplementation((chunk: string | Uint8Array) => {
            writes.push(String(chunk));
            return true;
          });
        const program = new Command()
          .exitOverride()
          .configureOutput({ writeOut: () => undefined, writeErr: () => undefined });
        registerMemoryCommand(program);

        await program.parseAsync([
          "node",
          "forge",
          "memory:complete-feature",
          "--feature",
          "Runtime",
          "--date",
          "2026-05-26",
          "--tasks",
          "9/9",
          "--deferred",
          "none",
          "--spec",
          ".forge/specs/runtime.md",
          "--plan",
          ".forge/specs/runtime-plan.md",
          "--scenarios",
          "memory commands verified",
        ]);

        expect(process.exitCode).toBe(1);
        expect(JSON.parse(writes.join(""))).toEqual({
          ok: false,
          verified: false,
          memory_file: join(cwd, "AGENTS.md"),
        });
        stdout.mockRestore();
      } finally {
        vi.doUnmock("../src/state/memory.js");
        process.chdir(originalCwd);
      }
    });
  });
});

describe("memory state helpers", () => {
  test("writeAndVerify returns false when read-back content does not contain the marker", () => {
    withTempProject((cwd) => {
      const file = join(cwd, "AGENTS.md");

      const verified = writeAndVerify(file, "content without marker", "missing marker");

      expect(verified).toBe(false);
      expect(readFileSync(file, "utf8")).toBe("content without marker");
    });
  });
});

describe("workflow rules helpers", () => {
  test("replaceWorkflowRules inserts rules into Forge section", async () => {
    const { replaceWorkflowRules } = await import("../src/state/memory.js");

    const content =
      "# Project Instructions\n\n## Forge\n\n**Current Feature**\n- Feature: Foo\n\n## Notes\nKeep this.\n";
    const result = replaceWorkflowRules(
      content,
      "**Workflow Rules**\n- Always run tests before committing.",
    );

    expect(result).toContain("**Workflow Rules**");
    expect(result).toContain("- Always run tests before committing.");
    expect(result).toContain("## Forge");
    expect(result).toContain("## Notes\nKeep this.");
  });

  test("clearWorkflowRules removes rules block", async () => {
    const { clearWorkflowRules } = await import("../src/state/memory.js");

    const content =
      "# Project Instructions\n\n## Forge\n\n**Workflow Rules**\n- Always run tests before committing.\n\n**Current Feature**\n- Feature: Foo\n\n## Notes\nKeep this.\n";
    const result = clearWorkflowRules(content);

    expect(result).not.toContain("**Workflow Rules**");
    expect(result).not.toContain("- Always run tests before committing.");
    expect(result).toContain("**Current Feature**");
    expect(result).toContain("- Feature: Foo");
    expect(result).toContain("## Notes\nKeep this.");
  });

  test("replaceWorkflowRules preserves Current Feature subsection", async () => {
    const { replaceWorkflowRules } = await import("../src/state/memory.js");

    const content =
      "# Project Instructions\n\n## Forge\n\n**Current Feature**\n- Feature: Bar\n- Progress: 3/5 tasks complete\n\n## Other\nStays.\n";
    const result = replaceWorkflowRules(
      content,
      "**Workflow Rules**\n- No direct state edits.",
    );

    expect(result).toContain("**Workflow Rules**");
    expect(result).toContain("- No direct state edits.");
    expect(result).toContain("**Current Feature**");
    expect(result).toContain("- Feature: Bar");
    expect(result).toContain("- Progress: 3/5 tasks complete");
    expect(result).toContain("## Other\nStays.");
  });
});
