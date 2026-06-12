/**
 * `forge context:usage` — cross-platform context occupancy reader.
 *
 * Returns deterministic, externally-measured context usage so the
 * context-manager plugin (and skills) can make threshold-based decisions
 * without relying on AI self-report.
 *
 * This command is the PRESENTATION layer: it senses via readContextState and
 * formats JSON advice. The restart-method advice reflects raw environment
 * CAPABILITY (envRestartCapability); user strategy/fallback policy is applied
 * separately by the context-manager checkpoint, not here.
 */

import { existsSync } from "node:fs";
import type { Command } from "commander";
import {
  envRestartCapability,
  readContextState,
} from "../lib/context-state.js";
import { configPath, readConfig } from "../state/config.js";

type ContextUsageOptions = {
  json?: boolean;
  session?: string;
  platform?: string;
};

/** Default threshold (from config or fallback). */
const DEFAULT_THRESHOLD_PCT = 0.5;

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

/**
 * Read threshold_pct from .forge/config.json if available, otherwise default.
 */
function readThreshold(cwd: string): number {
  try {
    if (!existsSync(configPath(cwd))) return DEFAULT_THRESHOLD_PCT;
    const config = readConfig(cwd);
    return config.context_management?.threshold_pct ?? DEFAULT_THRESHOLD_PCT;
  } catch {
    return DEFAULT_THRESHOLD_PCT;
  }
}

export function registerContextCommand(program: Command): void {
  program
    .command("context:usage")
    .option("--json", "output as JSON (default)")
    .option("--session <id>", "explicit session id")
    .option("--platform <name>", "override platform detection")
    .action((options: ContextUsageOptions) => {
      const cwd = process.cwd();

      const state = readContextState(cwd, {
        platformOverride: options.platform,
        sessionId: options.session,
      });

      if (!state.ok) {
        writeJson({ ok: false, platform: state.platform, reason: state.reason });
        return;
      }

      const threshold = readThreshold(cwd);
      const overThreshold = state.usage_pct > threshold;

      // Restart advice from raw environment capability:
      //   capability present → fresh session advised, method = capability
      //   no capability (bare terminal) → compact advised
      const capability = envRestartCapability(state.platform, state.terminal);
      let freshSessionAdvised = false;
      let compactAdvised = false;
      let method: "in-place" | "new-window" | null = null;

      if (overThreshold) {
        if (capability) {
          freshSessionAdvised = true;
          method = capability;
        } else {
          compactAdvised = true;
        }
      }

      writeJson({
        ok: true,
        platform: state.platform,
        session_id: state.session_id,
        model: state.model,
        total_context: state.total_context,
        window_size: state.window_size,
        usage_pct: Math.round(state.usage_pct * 1000) / 1000, // 3 decimals
        source: state.source,
        threshold_pct: threshold,
        terminal: state.terminal.kind,
        fresh_session_advised: freshSessionAdvised,
        compact_advised: compactAdvised,
        ...(method ? { method } : {}),
      });
    });
}
