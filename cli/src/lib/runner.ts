import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export type ShellCommandResult = {
  ok: boolean;
  command: string;
  cwd: string;
  status: number | null;
  stdout: string;
  stderr: string;
  duration_ms: number;
};

export function runShellCommand(
  root: string,
  workingDir: string,
  command: string,
): ShellCommandResult {
  const cwd = resolve(root, workingDir);
  const startedAt = Date.now();
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: "utf8",
  });
  const durationMs = Date.now() - startedAt;
  const stdout = result.stdout ?? "";
  const stderrOutput = result.stderr ?? "";
  const stderr =
    result.error && stderrOutput.length === 0
      ? result.error.message
      : stderrOutput;

  return {
    ok: result.status === 0 && !result.error,
    command,
    cwd,
    status: result.status,
    stdout,
    stderr,
    duration_ms: durationMs,
  };
}
