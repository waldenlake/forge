import { describe, expect, test } from "vitest";

import {
  detectPlatform,
  detectTerminalCapability,
} from "../src/lib/platform-detect.js";

describe("detectPlatform", () => {
  test("returns 'opencode' when OPENCODE_HOME is set", () => {
    expect(detectPlatform({ OPENCODE_HOME: "/home/user/.opencode" })).toBe(
      "opencode",
    );
  });

  test("returns 'opencode' when OPENCODE_SESSION_ID is set", () => {
    expect(
      detectPlatform({ OPENCODE_SESSION_ID: "ses_abc123" }),
    ).toBe("opencode");
  });

  test("returns 'claude-code' when CLAUDE_PLUGIN_ROOT is non-empty", () => {
    expect(
      detectPlatform({ CLAUDE_PLUGIN_ROOT: "/path/to/plugin" }),
    ).toBe("claude-code");
  });

  test("returns 'claude-code' when CLAUDE_CODE_ENTRY is set", () => {
    expect(detectPlatform({ CLAUDE_CODE_ENTRY: "cli" })).toBe("claude-code");
  });

  test("does NOT return 'claude-code' when CLAUDE_PLUGIN_ROOT is empty string", () => {
    expect(detectPlatform({ CLAUDE_PLUGIN_ROOT: "" })).toBe("unknown");
  });

  test("returns 'codex' when CODEX_CLI is set", () => {
    expect(detectPlatform({ CODEX_CLI: "1" })).toBe("codex");
  });

  test("returns 'codex' when CODEX_HOME is set", () => {
    expect(detectPlatform({ CODEX_HOME: "/home/user/.codex" })).toBe("codex");
  });

  test("returns 'unknown' when no platform vars are set", () => {
    expect(detectPlatform({})).toBe("unknown");
  });

  test("opencode takes priority over claude-code", () => {
    expect(
      detectPlatform({
        OPENCODE_HOME: "/opt/opencode",
        CLAUDE_PLUGIN_ROOT: "/path/to/plugin",
      }),
    ).toBe("opencode");
  });

  test("claude-code takes priority over codex", () => {
    expect(
      detectPlatform({
        CLAUDE_PLUGIN_ROOT: "/path",
        CODEX_CLI: "1",
      }),
    ).toBe("claude-code");
  });
});

describe("detectTerminalCapability", () => {
  test("returns tmux with supports_in_place when $TMUX is set", () => {
    const result = detectTerminalCapability({ TMUX: "/tmp/tmux-1000/default,12345,0" });
    expect(result.kind).toBe("tmux");
    expect(result.supports_in_place).toBe(true);
  });

  test("returns wezterm with supports_in_place when WEZTERM_PANE is set", () => {
    const result = detectTerminalCapability({ WEZTERM_PANE: "0" });
    expect(result.kind).toBe("wezterm");
    expect(result.supports_in_place).toBe(true);
  });

  test("returns wezterm when WEZTERM_EXECUTABLE is set", () => {
    const result = detectTerminalCapability({
      WEZTERM_EXECUTABLE: "/usr/bin/wezterm",
    });
    expect(result.kind).toBe("wezterm");
    expect(result.supports_in_place).toBe(true);
  });

  test("returns wt without supports_in_place when $WT_SESSION is set", () => {
    const result = detectTerminalCapability({ WT_SESSION: "some-guid" });
    expect(result.kind).toBe("wt");
    expect(result.supports_in_place).toBe(false);
  });

  test("returns bare without supports_in_place when no multiplexer detected", () => {
    const result = detectTerminalCapability({});
    expect(result.kind).toBe("bare");
    expect(result.supports_in_place).toBe(false);
  });

  test("tmux takes priority over wezterm", () => {
    const result = detectTerminalCapability({
      TMUX: "/tmp/tmux",
      WEZTERM_PANE: "0",
    });
    expect(result.kind).toBe("tmux");
  });

  test("wezterm takes priority over wt", () => {
    const result = detectTerminalCapability({
      WEZTERM_PANE: "1",
      WT_SESSION: "some-guid",
    });
    expect(result.kind).toBe("wezterm");
  });
});
