import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { defaultConfig } from "../src/state/config.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

function withTempProject(run: (cwd: string) => void): void {
  const cwd = mkdtempSync(join(tmpdir(), "forge-context-usage-"));
  try {
    mkdirSync(join(cwd, ".forge"), { recursive: true });
    writeFileSync(
      join(cwd, ".forge", "config.json"),
      JSON.stringify(defaultConfig({}), null, 2),
      "utf8",
    );
    run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function runForge(cwd: string, args: string[], envOverrides?: Record<string, string>) {
  return spawnSync(process.execPath, [forgeBin, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: "",
      GEMINI_CLI: "",
      OPENCODE_HOME: "",
      OPENCODE_SESSION_ID: "",
      CODEX_CLI: "",
      CODEX_HOME: "",
      TMUX: "",
      WEZTERM_PANE: "",
      WEZTERM_EXECUTABLE: "",
      WT_SESSION: "",
      // Suppress wezterm command-probe: dev/CI hosts may have wezterm.exe
      // installed without it being the active terminal.
      FORGE_TERMINAL_PROBE: "off",
      ...envOverrides,
    },
  });
}

function parseStdout(result: ReturnType<typeof runForge>): any {
  expect(result.stderr).toBe("");
  return JSON.parse(result.stdout);
}

describe("forge context:usage", () => {
  test("returns ok:false with reason 'unsupported_platform' for codex", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, ["context:usage", "--platform", "codex"]);
      const output = parseStdout(result);

      expect(output.ok).toBe(false);
      expect(output.platform).toBe("codex");
      expect(output.reason).toBe("unsupported_platform");
    });
  });

  test("returns ok:false with reason 'unsupported_platform' for unknown", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, ["context:usage", "--platform", "unknown"]);
      const output = parseStdout(result);

      expect(output.ok).toBe(false);
      expect(output.platform).toBe("unknown");
      expect(output.reason).toBe("unsupported_platform");
    });
  });

  test("opencode platform returns ok:false when DB is not accessible", () => {
    withTempProject((cwd) => {
      // Force opencode platform but real DB won't exist in temp dir
      const result = runForge(cwd, ["context:usage", "--platform", "opencode"]);
      const output = parseStdout(result);

      expect(output.ok).toBe(false);
      expect(output.platform).toBe("opencode");
      // Should report a reason about DB access failure
      expect(output.reason).toBeTruthy();
    });
  });

  test("claude-code platform returns ok:false when project dir is not found", () => {
    withTempProject((cwd) => {
      // Force claude-code platform — since cwd is a temp dir, no
      // ~/.claude/projects/<encoded> will exist for it
      const result = runForge(cwd, ["context:usage", "--platform", "claude-code"]);
      const output = parseStdout(result);

      expect(output.ok).toBe(false);
      expect(output.platform).toBe("claude-code");
      expect(output.reason).toContain("project directory not found");
    });
  });

  test("auto-detects platform from environment variables", () => {
    withTempProject((cwd) => {
      // With all platform vars cleared, should detect "unknown" → unsupported
      const result = runForge(cwd, ["context:usage"]);
      const output = parseStdout(result);

      expect(output.ok).toBe(false);
      expect(output.platform).toBe("unknown");
      expect(output.reason).toBe("unsupported_platform");
    });
  });

  test("auto-detects codex when CODEX_CLI is set", () => {
    withTempProject((cwd) => {
      const result = runForge(cwd, ["context:usage"], { CODEX_CLI: "1" });
      const output = parseStdout(result);

      expect(output.ok).toBe(false);
      expect(output.platform).toBe("codex");
      expect(output.reason).toBe("unsupported_platform");
    });
  });

  // This test uses a real Claude Code session JSONL fixture to verify
  // the full pipeline (encode cwd → find jsonl → parse usage → compute pct).
  test("claude-code: end-to-end with fixture JSONL returns correct fields", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "forge-ctx-e2e-"));
    try {
      // Create a fake ~/.claude/projects/<encoded>/<session>.jsonl
      const projectCwd = join(tmpDir, "myproject");
      mkdirSync(projectCwd, { recursive: true });
      mkdirSync(join(projectCwd, ".forge"), { recursive: true });
      writeFileSync(
        join(projectCwd, ".forge", "config.json"),
        JSON.stringify(defaultConfig({}), null, 2),
        "utf8",
      );

      // Encode cwd and create the Claude projects structure
      const encoded = projectCwd.replace(/[:\\/]/g, "-");
      const claudeProjectsDir = join(tmpDir, "claude-projects");
      const projectSessionDir = join(claudeProjectsDir, encoded);
      mkdirSync(projectSessionDir, { recursive: true });

      // Write a fixture JSONL with known usage
      const sessionFile = join(projectSessionDir, "test-session.jsonl");
      const lines = [
        JSON.stringify({
          type: "user",
          message: { role: "user", content: [{ type: "text", text: "hi" }] },
        }),
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            usage: {
              input_tokens: 5000,
              cache_creation_input_tokens: 1000,
              cache_read_input_tokens: 94000,
              output_tokens: 500,
            },
          },
        }),
      ];
      writeFileSync(sessionFile, lines.join("\n") + "\n", "utf8");

      // Run forge context:usage with a HOME override so it finds our fake structure.
      // We need to override the claudeProjectsDir — but our implementation uses
      // process.env.HOME. Set HOME to point our fake structure.
      // Actually: the readClaudeUsage uses ~/.claude/projects/ from HOME.
      // We need HOME to resolve to tmpDir so ~/.claude/projects/ = tmpDir/claude-projects.
      // Create the path: tmpDir/.claude/projects/<encoded>/
      const fakeHome = join(tmpDir, "fakehome");
      const fakeClaudeProjects = join(fakeHome, ".claude", "projects", encoded);
      mkdirSync(fakeClaudeProjects, { recursive: true });
      writeFileSync(
        join(fakeClaudeProjects, "test-session.jsonl"),
        lines.join("\n") + "\n",
        "utf8",
      );

      const result = spawnSync(
        process.execPath,
        [forgeBin, "context:usage", "--platform", "claude-code"],
        {
          cwd: projectCwd,
          encoding: "utf8",
          env: {
            ...process.env,
            HOME: fakeHome,
            USERPROFILE: fakeHome,
            CLAUDE_PLUGIN_ROOT: "",
            GEMINI_CLI: "",
            OPENCODE_HOME: "",
            TMUX: "",
            WEZTERM_PANE: "",
            WT_SESSION: "",
            FORGE_TERMINAL_PROBE: "off",
          },
        },
      );

      expect(result.stderr).toBe("");
      const output = JSON.parse(result.stdout);

      expect(output.ok).toBe(true);
      expect(output.platform).toBe("claude-code");
      expect(output.session_id).toBe("test-session");
      // 5000 + 1000 + 94000 = 100000
      expect(output.total_context).toBe(100000);
      expect(output.window_size).toBe(200000);
      expect(output.usage_pct).toBe(0.5);
      expect(output).toHaveProperty("terminal");
      expect(output).toHaveProperty("threshold_pct");
      // At exactly 50% with default threshold 50%: not over threshold
      expect(output.fresh_session_advised).toBe(false);
      expect(output.compact_advised).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("claude-code: fresh_session_advised=true when over threshold with tmux", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "forge-ctx-threshold-"));
    try {
      const projectCwd = join(tmpDir, "proj");
      mkdirSync(join(projectCwd, ".forge"), { recursive: true });
      writeFileSync(
        join(projectCwd, ".forge", "config.json"),
        JSON.stringify(defaultConfig({}), null, 2),
        "utf8",
      );

      const encoded = projectCwd.replace(/[:\\/]/g, "-");
      const fakeHome = join(tmpDir, "home");
      const projectDir = join(fakeHome, ".claude", "projects", encoded);
      mkdirSync(projectDir, { recursive: true });

      // Usage > 50% of 200k → over threshold
      const lines = [
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            usage: {
              input_tokens: 10000,
              cache_creation_input_tokens: 5000,
              cache_read_input_tokens: 110000,
              output_tokens: 200,
            },
          },
        }),
      ];
      writeFileSync(join(projectDir, "ses.jsonl"), lines.join("\n") + "\n", "utf8");

      const result = spawnSync(
        process.execPath,
        [forgeBin, "context:usage", "--platform", "claude-code"],
        {
          cwd: projectCwd,
          encoding: "utf8",
          env: {
            ...process.env,
            HOME: fakeHome,
            USERPROFILE: fakeHome,
            CLAUDE_PLUGIN_ROOT: "",
            GEMINI_CLI: "",
            OPENCODE_HOME: "",
            TMUX: "/tmp/tmux-1000/default,123,0",
            WEZTERM_PANE: "",
            WT_SESSION: "",
            FORGE_TERMINAL_PROBE: "off",
          },
        },
      );

      expect(result.stderr).toBe("");
      const output = JSON.parse(result.stdout);

      expect(output.ok).toBe(true);
      // 10000 + 5000 + 110000 = 125000 → 62.5% > 50%
      expect(output.total_context).toBe(125000);
      expect(output.usage_pct).toBe(0.625);
      expect(output.fresh_session_advised).toBe(true);
      expect(output.method).toBe("in-place");
      expect(output.terminal).toBe("tmux");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("claude-code: compact_advised=true when over threshold with bare terminal", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "forge-ctx-bare-"));
    try {
      const projectCwd = join(tmpDir, "proj");
      mkdirSync(join(projectCwd, ".forge"), { recursive: true });
      writeFileSync(
        join(projectCwd, ".forge", "config.json"),
        JSON.stringify(defaultConfig({}), null, 2),
        "utf8",
      );

      const encoded = projectCwd.replace(/[:\\/]/g, "-");
      const fakeHome = join(tmpDir, "home");
      const projectDir = join(fakeHome, ".claude", "projects", encoded);
      mkdirSync(projectDir, { recursive: true });

      const lines = [
        JSON.stringify({
          type: "assistant",
          message: {
            role: "assistant",
            usage: {
              input_tokens: 50000,
              cache_creation_input_tokens: 20000,
              cache_read_input_tokens: 80000,
              output_tokens: 500,
            },
          },
        }),
      ];
      writeFileSync(join(projectDir, "ses.jsonl"), lines.join("\n") + "\n", "utf8");

      const result = spawnSync(
        process.execPath,
        [forgeBin, "context:usage", "--platform", "claude-code"],
        {
          cwd: projectCwd,
          encoding: "utf8",
          env: {
            ...process.env,
            HOME: fakeHome,
            USERPROFILE: fakeHome,
            CLAUDE_PLUGIN_ROOT: "",
            GEMINI_CLI: "",
            OPENCODE_HOME: "",
            TMUX: "",
            WEZTERM_PANE: "",
            WT_SESSION: "",
            FORGE_TERMINAL_PROBE: "off",
          },
        },
      );

      expect(result.stderr).toBe("");
      const output = JSON.parse(result.stdout);

      expect(output.ok).toBe(true);
      // 50000 + 20000 + 80000 = 150000 → 75% > 50%
      expect(output.total_context).toBe(150000);
      expect(output.fresh_session_advised).toBe(false);
      expect(output.compact_advised).toBe(true);
      expect(output.terminal).toBe("bare");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
