import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, mkdirSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test, afterEach } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const forgeBin = resolve(repoRoot, "cli/dist/index.js");

// "doctor" is a real subcommand, runs fast, no .forge setup required for the
// checks themselves (it just sets ok=false, exits 1 – but still runs hooks).
// We use it because preAction/postAction hooks only fire for subcommands.
const CMD = "doctor";

function runForge(args: string[], cwd: string) {
  return spawnSync(process.execPath, [forgeBin, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function makeTmpDir(suffix: string): string {
  const dir = join(tmpdir(), `forge-logger-test-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("forge --log-file structured logger", () => {
  const tmps: string[] = [];

  afterEach(() => {
    for (const dir of tmps) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
    tmps.length = 0;
  });

  test("log file is created and first line is JSON with ts, cmd, event:start", () => {
    const tmpDir = makeTmpDir("1");
    tmps.push(tmpDir);
    const logFile = join(tmpDir, "forge.log");

    runForge(["--log-file", logFile, CMD], tmpDir);

    expect(existsSync(logFile)).toBe(true);

    const lines = readFileSync(logFile, "utf8")
      .trim()
      .split("\n")
      .filter((l) => l.trim() !== "");

    expect(lines.length).toBeGreaterThanOrEqual(1);

    const first = JSON.parse(lines[0]);
    expect(typeof first.ts).toBe("string");
    expect(first.cmd).toBe(CMD);
    expect(first.event).toBe("start");
  });

  test("log contains both start and result events", () => {
    const tmpDir = makeTmpDir("2");
    tmps.push(tmpDir);
    const logFile = join(tmpDir, "cmd.log");

    runForge(["--log-file", logFile, CMD], tmpDir);

    expect(existsSync(logFile)).toBe(true);

    const lines = readFileSync(logFile, "utf8")
      .trim()
      .split("\n")
      .filter((l) => l.trim() !== "");

    expect(lines.length).toBeGreaterThanOrEqual(2);

    const events = lines.map((l) => JSON.parse(l).event);
    expect(events).toContain("start");
    expect(events).toContain("result");
  });

  test("running same command twice appends to log, resulting in >= 4 lines", () => {
    const tmpDir = makeTmpDir("3");
    tmps.push(tmpDir);
    const logFile = join(tmpDir, "both.log");

    runForge(["--log-file", logFile, CMD], tmpDir);
    runForge(["--log-file", logFile, CMD], tmpDir);

    expect(existsSync(logFile)).toBe(true);

    const lines = readFileSync(logFile, "utf8")
      .trim()
      .split("\n")
      .filter((l) => l.trim() !== "");

    expect(lines.length).toBeGreaterThanOrEqual(4);
  });

  test("without --log-file, no log file is created in cwd", () => {
    const tmpDir = makeTmpDir("4");
    tmps.push(tmpDir);

    runForge([CMD], tmpDir);

    // No .log files should appear in cwd
    const files = readdirSync(tmpDir);
    const logFiles = files.filter((f) => f.endsWith(".log"));
    expect(logFiles).toHaveLength(0);
  });
});
