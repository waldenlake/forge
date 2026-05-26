import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type LogEntry = {
  ts: string;
  cmd: string;
  event: "start" | "result" | "error";
  [key: string]: unknown;
};

export class ForgeLogger {
  private readonly logFile: string | null;

  constructor(logFile: string | null) {
    this.logFile = logFile;
    if (logFile !== null) {
      mkdirSync(dirname(logFile), { recursive: true });
    }
  }

  log(entry: Omit<LogEntry, "ts">): void {
    if (this.logFile === null) {
      return;
    }

    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      ...entry,
    };

    appendFileSync(this.logFile, `${JSON.stringify(record)}\n`, "utf8");
  }

  get enabled(): boolean {
    return this.logFile !== null;
  }
}

let globalLogger: ForgeLogger = new ForgeLogger(null);

export function initLogger(logFile: string | null): ForgeLogger {
  globalLogger = new ForgeLogger(logFile);
  return globalLogger;
}

export function getLogger(): ForgeLogger {
  return globalLogger;
}
