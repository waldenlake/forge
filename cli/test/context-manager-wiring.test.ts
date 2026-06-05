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

import { defaultConfig, type ForgeConfig } from "../src/state/config.js";
import { idleProgress, type ForgeProgress } from "../src/state/progress.js";
import { encodeCwdForClaude } from "../src/lib/context-readers/claude.js";

const repoRoot = resolve(import.meta.dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

/**
 * End-to-end test for context-manager → next-action → run-loop wiring.
 *
 * This test sets up a project where:
 *   - context_management.enabled: true
 *   - threshold_pct: 0.50
 *   - A real Claude Code JSONL fixture with usage > threshold
 *   - In an "executing" phase with a pending task
 *
 * Without the wiring fix, run-loop would either crash (treating handoff-session
 * as run-cli with undefined command) or silently skip the checkpoint.
 *
 * The test asserts run-loop returns action: "handoff-session" or
 * "suggest-compact", surfaces the reason field, and writes the signal file.
 */

function makeFixtureProject(opts: { tokens: number; terminal: "tmux" | "bare" }): {
  cwd: string;
  fakeHome: string;
  cleanup: () => void;
} {
  const tmpDir = mkdtempSync(join(tmpdir(), "forge-ctx-wiring-"));
  const cwd = join(tmpDir, "proj");
  mkdirSync(join(cwd, ".forge"), { recursive: true });

  // config: enable context-manager
  const config: ForgeConfig = defaultConfig({
    context_management: {
      enabled: true,
      threshold_pct: 0.5,
      strategy: "in-place-restart",
      fallback: "prompt-compact",
      min_tasks_between_handoff: 1,
    },
  });
  writeFileSync(
    join(cwd, ".forge", "config.json"),
    JSON.stringify(config, null, 2),
    "utf8",
  );

  // progress: executing with one pending task and at least one done task,
  // so the anti-loop counter (no prior handoff recorded) lets a handoff fire
  const progress: ForgeProgress = {
    ...idleProgress(),
    feature: "wiring-test",
    status: "executing",
    spec_path: "docs/spec.md",
    plan_path: "docs/plan.md",
    total_tasks: 2,
    completed_tasks: 1,
    tasks: [
      { id: 1, title: "First", status: "done" },
      { id: 2, title: "Second pending", status: "pending" },
    ],
  };
  writeFileSync(
    join(cwd, ".forge", "progress.json"),
    JSON.stringify(progress, null, 2),
    "utf8",
  );

  // Fake ~/.claude/projects/<encoded>/<session>.jsonl with usage > threshold
  // Use the SAME encoder as the production code so test stays in sync.
  const encoded = encodeCwdForClaude(cwd);
  const fakeHome = join(tmpDir, "fakehome");
  const projectDir = join(fakeHome, ".claude", "projects", encoded);
  mkdirSync(projectDir, { recursive: true });

  // Distribute tokens to make total_context = opts.tokens
  const cacheRead = Math.max(0, opts.tokens - 1000);
  writeFileSync(
    join(projectDir, "session.jsonl"),
    JSON.stringify({
      type: "assistant",
      message: {
        role: "assistant",
        usage: {
          input_tokens: 1000,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: cacheRead,
          output_tokens: 100,
        },
      },
    }) + "\n",
    "utf8",
  );

  return {
    cwd,
    fakeHome,
    cleanup: () => rmSync(tmpDir, { recursive: true, force: true }),
  };
}

function runLoop(cwd: string, fakeHome: string, env: Record<string, string>) {
  return spawnSync(process.execPath, [forgeBin, "run-loop"], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: fakeHome,
      USERPROFILE: fakeHome,
      CLAUDE_PLUGIN_ROOT: "/path", // forces claude-code platform
      OPENCODE_HOME: "",
      OPENCODE_SESSION_ID: "",
      CODEX_CLI: "",
      CODEX_HOME: "",
      TMUX: "",
      WEZTERM_PANE: "",
      WT_SESSION: "",
      // Suppress wezterm command-probe: dev/CI hosts may have wezterm.exe
      // installed without it being the active terminal.
      FORGE_TERMINAL_PROBE: "off",
      ...env,
    },
  });
}

describe("run-loop surfaces context-manager actions", () => {
  test("over-threshold + tmux → run-loop returns action: handoff-session method: in-place", () => {
    // 130k of 200k = 65% > 50%
    const fixture = makeFixtureProject({ tokens: 130_000, terminal: "tmux" });
    try {
      const result = runLoop(fixture.cwd, fixture.fakeHome, {
        TMUX: "/tmp/tmux-1000/default,1,0",
      });

      expect(result.stderr).toBe("");
      const out = JSON.parse(result.stdout);

      expect(out.ok).toBe(true);
      expect(out.action).toBe("handoff-session");
      expect(out.method).toBe("in-place");
      expect(out.reason).toMatch(/exceeds threshold/);
      // Must NOT have fallen through to invoke-skill (that would mean it
      // dispatched the next task instead of handing off).
      expect(out.skill).toBeUndefined();

      // Side effect: signal file written for hook scripts to pick up
      const signalPath = join(fixture.cwd, ".forge", "handoff-signal.json");
      expect(existsSync(signalPath)).toBe(true);
      const signal = JSON.parse(readFileSync(signalPath, "utf8"));
      expect(signal.action).toBe("handoff-session");
      expect(signal.method).toBe("in-place");

      // Side effect: anti-loop counter recorded
      const metaPath = join(fixture.cwd, ".forge", "handoff-meta.json");
      expect(existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      expect(meta.last_handoff_completed_tasks).toBe(1);
    } finally {
      fixture.cleanup();
    }
  });

  test("over-threshold + bare terminal → run-loop returns action: suggest-compact", () => {
    const fixture = makeFixtureProject({ tokens: 130_000, terminal: "bare" });
    try {
      const result = runLoop(fixture.cwd, fixture.fakeHome, {});

      expect(result.stderr).toBe("");
      const out = JSON.parse(result.stdout);

      expect(out.ok).toBe(true);
      expect(out.action).toBe("suggest-compact");
      expect(out.reason).toMatch(/exceeds threshold/);

      // suggest-compact does NOT write the signal file (no platform hook to fire)
      expect(existsSync(join(fixture.cwd, ".forge", "handoff-signal.json"))).toBe(
        false,
      );
    } finally {
      fixture.cleanup();
    }
  });

  test("under-threshold → run-loop dispatches next task as before (no regression)", () => {
    // 50k of 200k = 25% < 50%
    const fixture = makeFixtureProject({ tokens: 50_000, terminal: "tmux" });
    try {
      const result = runLoop(fixture.cwd, fixture.fakeHome, {
        TMUX: "/tmp/tmux-1000/default,1,0",
      });

      expect(result.stderr).toBe("");
      const out = JSON.parse(result.stdout);

      expect(out.ok).toBe(true);
      expect(out.action).toBe("invoke-skill");
      expect(out.skill).toBe("forge_executing");
      expect(out.args.task_id).toBe(2);

      // No signal file when under threshold
      expect(existsSync(join(fixture.cwd, ".forge", "handoff-signal.json"))).toBe(
        false,
      );
    } finally {
      fixture.cleanup();
    }
  });

  test("anti-loop: second checkpoint with no new task done → continues, no handoff", () => {
    // First call triggers handoff (130k > 50%), second call should NOT
    // because completed_tasks hasn't advanced.
    const fixture = makeFixtureProject({ tokens: 130_000, terminal: "tmux" });
    try {
      const env = { TMUX: "/tmp/tmux-1000/default,1,0" };

      const first = runLoop(fixture.cwd, fixture.fakeHome, env);
      const firstOut = JSON.parse(first.stdout);
      expect(firstOut.action).toBe("handoff-session");

      // Second call without progress.json change
      const second = runLoop(fixture.cwd, fixture.fakeHome, env);
      const secondOut = JSON.parse(second.stdout);
      // Anti-loop: must NOT return handoff again. Falls through to next task.
      expect(secondOut.action).toBe("invoke-skill");
      expect(secondOut.skill).toBe("forge_executing");
    } finally {
      fixture.cleanup();
    }
  });

  test("plugin disabled → action never appears regardless of context", () => {
    const fixture = makeFixtureProject({ tokens: 180_000, terminal: "tmux" });
    try {
      // Disable the plugin
      const configPath = join(fixture.cwd, ".forge", "config.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      config.context_management.enabled = false;
      writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");

      const result = runLoop(fixture.cwd, fixture.fakeHome, {
        TMUX: "/tmp/tmux-1000/default,1,0",
      });
      const out = JSON.parse(result.stdout);

      // Even at 90% usage, plugin disabled means dispatch next task as normal
      expect(out.action).toBe("invoke-skill");
      expect(out.skill).toBe("forge_executing");
    } finally {
      fixture.cleanup();
    }
  });
});
