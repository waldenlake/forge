import type { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import {
  handoffAbsolutePath,
  renderHandoff,
  writeHandoff,
} from "../lib/handoff.js";
import { progressPath, readProgress } from "../state/progress.js";

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

/**
 * `forge handoff:get` — print `.forge/handoff.md`, rebuilding it from
 * `progress.json` if missing. Output is the markdown body verbatim (no JSON
 * envelope on success) because hooks (PreCompact, SessionStart) pipe stdout
 * directly into compaction seeds; any wrapping would corrupt them.
 *
 * Error path: when neither handoff.md nor progress.json exists, we cannot
 * synthesize anything truthful — return a JSON `{ok:false}` envelope and
 * exit non-zero so callers can detect the failure.
 */
export function registerHandoffCommand(program: Command): void {
  program.command("handoff:get").action(() => {
    const cwd = process.cwd();
    const handoffPath = handoffAbsolutePath(cwd);

    if (existsSync(handoffPath)) {
      // Echo the on-disk file verbatim. Even if it is stale relative to
      // progress.json, /audit is the place that surfaces drift — handoff:get
      // is an unconditional reader so hooks don't introduce subtle rebuild
      // races during compaction.
      process.stdout.write(readFileSync(handoffPath, "utf8"));
      return;
    }

    if (!existsSync(progressPath(cwd))) {
      fail("no handoff.md and no progress.json — run `forge init` first");
      return;
    }

    // Rebuild from progress.json. writeHandoff() persists the rebuilt content
    // so subsequent calls echo from disk and stay deterministic.
    let progress;
    try {
      progress = readProgress(cwd);
    } catch (error) {
      fail(`failed to read progress.json: ${(error as Error).message}`);
      return;
    }

    const rendered = renderHandoff(progress);
    writeHandoff(cwd, progress);
    process.stdout.write(rendered);
  });
}
