import type { Command } from "commander";
import {
  readConfig,
  writeConfig,
  type ContextManagementStrategy,
  type ForgeConfig,
} from "../state/config.js";

const STRATEGIES = [
  "in-place-restart",
  "new-window",
  "prompt-compact",
  "off",
] as const;

type ConfigContextOptions = {
  show?: boolean;
  enable?: boolean;
  disable?: boolean;
  threshold?: string;
  strategy?: string;
  fallback?: string;
  minTasks?: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function fail(error: string): void {
  process.exitCode = 1;
  writeJson({ ok: false, error });
}

/**
 * Default config payload applied when --enable is used and no
 * context_management section yet exists. These match the spec defaults.
 */
function defaultEnabledConfig() {
  return {
    enabled: true,
    threshold_pct: 0.5,
    strategy: "in-place-restart" as ContextManagementStrategy,
    fallback: "prompt-compact" as ContextManagementStrategy,
    min_tasks_between_handoff: 1,
  };
}

export function registerConfigContextCommand(program: Command): void {
  program
    .command("config:context")
    .description("inspect or update context_management config (hot-toggleable mid-flow)")
    .option("--show", "print current context_management config")
    .option("--enable", "enable the context-manager plugin (sets defaults if missing)")
    .option("--disable", "disable the context-manager plugin (preserves other fields)")
    .option("--threshold <0-1>", "context usage threshold for handoff (e.g. 0.5)")
    .option(
      "--strategy <name>",
      `preferred strategy: ${STRATEGIES.join(" | ")}`,
    )
    .option(
      "--fallback <name>",
      `fallback strategy: ${STRATEGIES.join(" | ")}`,
    )
    .option(
      "--min-tasks <n>",
      "minimum tasks between handoffs (anti-loop guard)",
    )
    .action((options: ConfigContextOptions) => {
      const cwd = process.cwd();
      let config: ForgeConfig;
      try {
        config = readConfig(cwd);
      } catch (e) {
        fail(`cannot read .forge/config.json: ${(e as Error).message}`);
        return;
      }

      // --show: pure read, return current state (or null if absent)
      if (options.show) {
        writeJson({ ok: true, context_management: config.context_management ?? null });
        return;
      }

      if (options.enable && options.disable) {
        fail("--enable and --disable are mutually exclusive");
        return;
      }

      // Start from current section (or defaults if --enable bootstraps it)
      const current = config.context_management ?? {};
      const next = { ...current };

      if (options.enable) {
        // Bootstrap with defaults if section was empty, otherwise just flip enabled
        if (Object.keys(current).length === 0) {
          Object.assign(next, defaultEnabledConfig());
        } else {
          next.enabled = true;
        }
      }

      if (options.disable) {
        next.enabled = false;
      }

      if (options.threshold !== undefined) {
        const t = Number(options.threshold);
        if (!Number.isFinite(t) || t < 0 || t > 1) {
          fail(`invalid --threshold ${options.threshold}: must be 0-1`);
          return;
        }
        next.threshold_pct = t;
      }

      if (options.strategy !== undefined) {
        if (!STRATEGIES.includes(options.strategy as ContextManagementStrategy)) {
          fail(`invalid --strategy ${options.strategy}: must be one of ${STRATEGIES.join(", ")}`);
          return;
        }
        next.strategy = options.strategy as ContextManagementStrategy;
      }

      if (options.fallback !== undefined) {
        if (!STRATEGIES.includes(options.fallback as ContextManagementStrategy)) {
          fail(`invalid --fallback ${options.fallback}: must be one of ${STRATEGIES.join(", ")}`);
          return;
        }
        next.fallback = options.fallback as ContextManagementStrategy;
      }

      if (options.minTasks !== undefined) {
        const n = parseInt(options.minTasks, 10);
        if (!Number.isInteger(n) || n < 1) {
          fail(`invalid --min-tasks ${options.minTasks}: must be a positive integer`);
          return;
        }
        next.min_tasks_between_handoff = n;
      }

      // Nothing requested → behave like --show
      const noFlagsProvided =
        !options.enable &&
        !options.disable &&
        options.threshold === undefined &&
        options.strategy === undefined &&
        options.fallback === undefined &&
        options.minTasks === undefined;
      if (noFlagsProvided) {
        writeJson({ ok: true, context_management: config.context_management ?? null });
        return;
      }

      const updated: ForgeConfig = { ...config, context_management: next };
      try {
        writeConfig(cwd, updated);
      } catch (e) {
        fail(`failed to write config: ${(e as Error).message}`);
        return;
      }

      writeJson({ ok: true, context_management: next });
    });
}
