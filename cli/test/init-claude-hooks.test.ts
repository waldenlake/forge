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

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-init-hooks-"));
  try {
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

describe("forge init Claude Code hooks", () => {
  test("generates PreCompact + PostCompact hooks when .claude/ exists", () => {
    withTempProject((cwd) => {
      // Create .claude/ directory to simulate Claude Code project
      mkdirSync(join(cwd, ".claude"), { recursive: true });

      const result = runForge(cwd, ["init"]);
      expect(result.status).toBe(0);

      const settingsPath = join(cwd, ".claude", "settings.json");
      expect(existsSync(settingsPath)).toBe(true);

      const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.PreCompact).toBeDefined();
      expect(settings.hooks.PostCompact).toBeDefined();

      // Both hooks should call forge handoff:get
      const preCmd = settings.hooks.PreCompact[0].hooks[0].command;
      expect(preCmd).toContain("handoff:get");
      const postCmd = settings.hooks.PostCompact[0].hooks[0].command;
      expect(postCmd).toContain("handoff:get");

      // Output should confirm hooks were written
      const output = JSON.parse(result.stdout);
      expect(output.claude_hooks_written).toBe(true);
    });
  });

  test("does NOT create .claude/settings.json when .claude/ does not exist", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, ["init"]);
      expect(result.status).toBe(0);

      const settingsPath = join(cwd, ".claude", "settings.json");
      expect(existsSync(settingsPath)).toBe(false);

      const output = JSON.parse(result.stdout);
      expect(output.claude_hooks_written).toBeUndefined();
    });
  });

  test("merges hooks into existing .claude/settings.json without overwriting", () => {
    withTempProject((cwd) => {
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      // Pre-existing settings with user content
      const existing = {
        permissions: { allow: ["Bash(*)"] },
        hooks: {
          SessionStart: [{ hooks: [{ type: "command", command: "echo start" }] }],
        },
      };
      writeFileSync(
        join(cwd, ".claude", "settings.json"),
        JSON.stringify(existing, null, 2),
        "utf8",
      );

      const result = runForge(cwd, ["init"]);
      expect(result.status).toBe(0);

      const settings = JSON.parse(
        readFileSync(join(cwd, ".claude", "settings.json"), "utf8"),
      );
      // Existing keys preserved
      expect(settings.permissions.allow).toContain("Bash(*)");
      expect(settings.hooks.SessionStart).toBeDefined();
      // New hooks added
      expect(settings.hooks.PreCompact).toBeDefined();
      expect(settings.hooks.PostCompact).toBeDefined();
    });
  });

  test("does not overwrite existing PreCompact/PostCompact hooks", () => {
    withTempProject((cwd) => {
      mkdirSync(join(cwd, ".claude"), { recursive: true });
      const existing = {
        hooks: {
          PreCompact: [{ hooks: [{ type: "command", command: "custom-pre" }] }],
        },
      };
      writeFileSync(
        join(cwd, ".claude", "settings.json"),
        JSON.stringify(existing, null, 2),
        "utf8",
      );

      runForge(cwd, ["init"]);

      const settings = JSON.parse(
        readFileSync(join(cwd, ".claude", "settings.json"), "utf8"),
      );
      // Existing PreCompact preserved (not overwritten)
      expect(settings.hooks.PreCompact[0].hooks[0].command).toBe("custom-pre");
      // PostCompact added since it didn't exist
      expect(settings.hooks.PostCompact).toBeDefined();
    });
  });
});
