/**
 * `forge context:usage` — cross-platform context occupancy reader.
 *
 * Returns deterministic, externally-measured context usage so the
 * context-manager plugin (and skills) can make threshold-based decisions
 * without relying on AI self-report.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { readClaudeUsage } from "../lib/context-readers/claude.js";
import { readOpencodeUsage } from "../lib/context-readers/opencode.js";
import { resolveWindowSize } from "../lib/context-window.js";
import {
  detectPlatform,
  detectTerminalCapability,
  type Platform,
} from "../lib/platform-detect.js";
import { configPath, readConfig } from "../state/config.js";

type ContextUsageOptions = {
  json?: boolean;
  session?: string;
  platform?: string;
};

/** Default threshold (from config or fallback). */
const DEFAULT_THRESHOLD_PCT = 0.50;

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

/**
 * Resolve the OpenCode DB path. OpenCode stores its DB at
 * `~/.local/share/opencode/opencode.db` (Linux/Mac) or under LOCALAPPDATA (Windows).
 */
function opencodeDbPath(): string {
  if (process.platform === "win32") {
    const appData = process.env.LOCALAPPDATA ?? join(
      process.env.USERPROFILE ?? "",
      "AppData",
      "Local",
    );
    return join(appData, "opencode", "opencode.db");
  }
  const home = process.env.HOME ?? "";
  return join(home, ".local", "share", "opencode", "opencode.db");
}

/**
 * Read threshold_pct from .forge/config.json if available, otherwise default.
 */
function readThreshold(cwd: string): number {
  try {
    if (!existsSync(configPath(cwd))) return DEFAULT_THRESHOLD_PCT;
    const config = readConfig(cwd);
    return (config as any).context_management?.threshold_pct ?? DEFAULT_THRESHOLD_PCT;
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

      // Platform detection (explicit override or auto-detect)
      const platform: Platform = options.platform
        ? (options.platform as Platform)
        : detectPlatform();

      // Unsupported platforms
      if (platform === "codex" || platform === "unknown") {
        writeJson({
          ok: false,
          platform,
          reason: "unsupported_platform",
        });
        return;
      }

      // Read context usage from the appropriate backend
      let totalContext: number;
      let sessionId: string;
      let source: string;
      let model: string | null;

      if (platform === "opencode") {
        const dbPath = opencodeDbPath();
        const result = readOpencodeUsage(dbPath, cwd, options.session);
        if (!result.ok) {
          writeJson({ ok: false, platform, reason: result.reason });
          return;
        }
        totalContext = result.total_context;
        sessionId = result.session_id;
        source = result.source;
        model = result.model;
      } else {
        // claude-code
        const result = readClaudeUsage(cwd, options.session);
        if (!result.ok) {
          writeJson({ ok: false, platform, reason: result.reason });
          return;
        }
        totalContext = result.total_context;
        sessionId = result.session_id;
        source = result.source;
        model = result.model;
      }

      // Compute usage percentage. Window size is derived from the model id
      // the platform reported, never from config or env. See lib/context-window.ts.
      const windowSize = resolveWindowSize(model);
      const usagePct = totalContext / windowSize;

      // Terminal capability for session restart advice
      const terminal = detectTerminalCapability();
      const threshold = readThreshold(cwd);
      const overThreshold = usagePct > threshold;

      // Decide: fresh_session_advised (chain A) vs compact_advised (chain B)
      // Based on: over threshold + terminal supports in-place
      let freshSessionAdvised = false;
      let compactAdvised = false;
      let method: "in-place" | "new-window" | null = null;

      if (overThreshold) {
        if (platform === "opencode") {
          // OpenCode always supports in-place via SDK
          freshSessionAdvised = true;
          method = "in-place";
        } else if (terminal.supports_in_place) {
          freshSessionAdvised = true;
          method = "in-place";
        } else if (terminal.kind === "wt") {
          freshSessionAdvised = true;
          method = "new-window";
        } else {
          // Bare terminal: can't restart, suggest compact
          compactAdvised = true;
        }
      }

      writeJson({
        ok: true,
        platform,
        session_id: sessionId,
        model,
        total_context: totalContext,
        window_size: windowSize,
        usage_pct: Math.round(usagePct * 1000) / 1000, // 3 decimal places
        source,
        threshold_pct: threshold,
        terminal: terminal.kind,
        fresh_session_advised: freshSessionAdvised,
        compact_advised: compactAdvised,
        ...(method ? { method } : {}),
      });
    });
}
