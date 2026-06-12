/**
 * Unit tests for the PURE handoff-policy layer:
 *   - resolveHandoffMethod(strategy, fallback, capability)
 *   - decideHandoff(state, config, threshold)
 *
 * These previously-missing tests cover the strategy/fallback wiring that the
 * config schema declared but the code never consumed. No IO — built from
 * literals, so every branch is reachable deterministically.
 */

import { describe, expect, test } from "vitest";
import {
  decideHandoff,
  resolveHandoffMethod,
} from "../src/plugins/context-manager.js";
import type { ContextStateOk, RestartMethod } from "../src/lib/context-state.js";
import type {
  ContextManagementConfig,
  ContextManagementStrategy,
} from "../src/state/config.js";

// ─── resolveHandoffMethod ────────────────────────────────────────────────────

describe("resolveHandoffMethod — default config preserves prior behavior", () => {
  // Default config: strategy=in-place-restart, fallback=prompt-compact.
  const strat: ContextManagementStrategy = "in-place-restart";
  const fb: ContextManagementStrategy = "prompt-compact";

  test("capability in-place → in-place (opencode / tmux / wezterm)", () => {
    expect(resolveHandoffMethod(strat, fb, "in-place")).toBe("in-place");
  });

  test("capability new-window → new-window (Windows Terminal)", () => {
    // in-place-restart means 'best available restart' → new-window on wt.
    expect(resolveHandoffMethod(strat, fb, "new-window")).toBe("new-window");
  });

  test("no capability (bare terminal) → fallback prompt-compact → compact", () => {
    expect(resolveHandoffMethod(strat, fb, null)).toBe("compact");
  });
});

describe("resolveHandoffMethod — strategy overrides are honored", () => {
  test("prompt-compact strategy forces compact even on capable env", () => {
    expect(resolveHandoffMethod("prompt-compact", "prompt-compact", "in-place")).toBe(
      "compact",
    );
  });

  test("new-window strategy on in-place-only env → fallback compact", () => {
    // User explicitly wants new-window but env only does in-place; default
    // fallback prompt-compact applies.
    expect(resolveHandoffMethod("new-window", "prompt-compact", "in-place")).toBe(
      "compact",
    );
  });

  test("new-window strategy on wt → new-window", () => {
    expect(resolveHandoffMethod("new-window", "prompt-compact", "new-window")).toBe(
      "new-window",
    );
  });

  test("fallback in-place-restart rescues when primary unsatisfiable", () => {
    // strategy new-window unsatisfiable on in-place env; fallback
    // in-place-restart resolves to the capability (in-place).
    expect(resolveHandoffMethod("new-window", "in-place-restart", "in-place")).toBe(
      "in-place",
    );
  });

  test("both strategy and fallback unsatisfiable → compact floor", () => {
    expect(resolveHandoffMethod("new-window", "new-window", "in-place")).toBe(
      "compact",
    );
  });
});

// ─── decideHandoff ───────────────────────────────────────────────────────────

function okState(overrides: Partial<ContextStateOk> = {}): ContextStateOk {
  return {
    ok: true,
    platform: "claude-code",
    session_id: "s1",
    model: "claude-sonnet-4-6",
    total_context: 130_000,
    window_size: 200_000,
    usage_pct: 0.65,
    source: "/fake/session.jsonl",
    terminal: { kind: "tmux", supports_in_place: true },
    ...overrides,
  };
}

describe("decideHandoff — honors strategy/fallback", () => {
  test("default config + in-place-capable env → handoff in-place", () => {
    const config: ContextManagementConfig = { enabled: true, threshold_pct: 0.5 };
    const d = decideHandoff(okState(), config, 0.5);
    expect(d.action).toBe("handoff-session");
    if (d.action === "handoff-session") {
      expect(d.method).toBe("in-place");
      expect(d.reason).toMatch(/exceeds threshold/);
    }
  });

  test("strategy=off → continue (handoff disabled)", () => {
    const config: ContextManagementConfig = {
      enabled: true,
      threshold_pct: 0.5,
      strategy: "off",
    };
    expect(decideHandoff(okState(), config, 0.5).action).toBe("continue");
  });

  test("strategy=prompt-compact → suggest-compact even on capable env", () => {
    const config: ContextManagementConfig = {
      enabled: true,
      threshold_pct: 0.5,
      strategy: "prompt-compact",
    };
    expect(decideHandoff(okState(), config, 0.5).action).toBe("suggest-compact");
  });

  test("bare terminal + default config → suggest-compact", () => {
    const config: ContextManagementConfig = { enabled: true, threshold_pct: 0.5 };
    const state = okState({
      platform: "claude-code",
      terminal: { kind: "bare", supports_in_place: false },
    });
    expect(decideHandoff(state, config, 0.5).action).toBe("suggest-compact");
  });

  test("opencode platform → in-place regardless of terminal", () => {
    const config: ContextManagementConfig = { enabled: true, threshold_pct: 0.5 };
    const state = okState({
      platform: "opencode",
      terminal: { kind: "bare", supports_in_place: false },
    });
    const d = decideHandoff(state, config, 0.5);
    expect(d.action).toBe("handoff-session");
    if (d.action === "handoff-session") expect(d.method).toBe("in-place");
  });

  test("Windows Terminal + default config → handoff new-window", () => {
    const config: ContextManagementConfig = { enabled: true, threshold_pct: 0.5 };
    const state = okState({
      platform: "claude-code",
      terminal: { kind: "wt", supports_in_place: false },
    });
    const d = decideHandoff(state, config, 0.5);
    expect(d.action).toBe("handoff-session");
    if (d.action === "handoff-session") expect(d.method).toBe("new-window");
  });
});
