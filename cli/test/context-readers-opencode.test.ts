import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { readOpencodeUsage } from "../src/lib/context-readers/opencode.js";

// Check if node:sqlite is available; if not, skip tests gracefully.
let DatabaseSync: any;
let sqliteAvailable = false;
try {
  const mod = require("node:sqlite");
  DatabaseSync = mod.DatabaseSync;
  sqliteAvailable = true;
} catch {
  // node:sqlite not available
}

function withFixtureDb(
  run: (dbPath: string) => void,
  opts?: { cwd?: string; sessionId?: string; messages?: any[] },
): void {
  if (!sqliteAvailable) return;

  const dir = mkdtempSync(join(tmpdir(), "forge-opencode-reader-"));
  const dbPath = join(dir, "opencode.db");
  const db = new DatabaseSync(dbPath);

  try {
    db.exec(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
        directory TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE message (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        time_created INTEGER NOT NULL,
        tokens TEXT
      );
    `);

    const sessionCwd = opts?.cwd ?? "/home/user/project";
    const sessionId = opts?.sessionId ?? "ses_abc123";

    db.prepare(
      "INSERT INTO session (id, directory, created_at) VALUES (?, ?, ?)",
    ).run(sessionId, sessionCwd, 1717500000000);

    const messages = opts?.messages ?? [
      {
        id: "msg_1",
        session_id: sessionId,
        role: "user",
        time_created: 1717500001000,
        tokens: JSON.stringify({ input: 1000, output: 0, cache: { read: 0, write: 0 } }),
      },
      {
        id: "msg_2",
        session_id: sessionId,
        role: "assistant",
        time_created: 1717500002000,
        tokens: JSON.stringify({ input: 5000, output: 500, cache: { read: 160000, write: 2000 } }),
      },
      {
        id: "msg_3",
        session_id: sessionId,
        role: "user",
        time_created: 1717500003000,
        tokens: JSON.stringify({ input: 6000, output: 0, cache: { read: 0, write: 0 } }),
      },
      {
        id: "msg_4",
        session_id: sessionId,
        role: "assistant",
        time_created: 1717500004000,
        tokens: JSON.stringify({ input: 2688, output: 800, cache: { read: 160000, write: 0 } }),
      },
    ];

    const insertMsg = db.prepare(
      "INSERT INTO message (id, session_id, role, time_created, tokens) VALUES (?, ?, ?, ?, ?)",
    );
    for (const msg of messages) {
      insertMsg.run(msg.id, msg.session_id, msg.role, msg.time_created, msg.tokens);
    }

    db.close();
    run(dbPath);
  } finally {
    try {
      db.close();
    } catch {
      // already closed
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!sqliteAvailable)("readOpencodeUsage", () => {
  test("returns total_context = input + cache.read from latest assistant message", () => {
    withFixtureDb((dbPath) => {
      const result = readOpencodeUsage(dbPath, "/home/user/project");

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Latest assistant msg_4: input=2688, cache.read=160000
      expect(result.total_context).toBe(2688 + 160000);
      expect(result.session_id).toBe("ses_abc123");
      expect(result.source).toBe(dbPath);
    });
  });

  test("locates session by cwd matching directory column", () => {
    withFixtureDb(
      (dbPath) => {
        const result = readOpencodeUsage(dbPath, "/different/project");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.session_id).toBe("ses_other");
      },
      {
        cwd: "/different/project",
        sessionId: "ses_other",
        messages: [
          {
            id: "msg_x",
            session_id: "ses_other",
            role: "assistant",
            time_created: 1717500001000,
            tokens: JSON.stringify({ input: 100, output: 10, cache: { read: 200, write: 0 } }),
          },
        ],
      },
    );
  });

  test("returns ok:false when no session matches cwd", () => {
    withFixtureDb((dbPath) => {
      const result = readOpencodeUsage(dbPath, "/nonexistent/path");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toContain("no session found");
    });
  });

  test("accepts explicit sessionId to bypass cwd lookup", () => {
    withFixtureDb((dbPath) => {
      const result = readOpencodeUsage(
        dbPath,
        "/irrelevant",
        "ses_abc123",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.session_id).toBe("ses_abc123");
      expect(result.total_context).toBe(2688 + 160000);
    });
  });

  test("returns ok:false when database does not exist", () => {
    const result = readOpencodeUsage(
      "/tmp/nonexistent-abc.db",
      "/some/path",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("cannot open database");
  });

  test("returns ok:false when session has no assistant messages", () => {
    withFixtureDb(
      (dbPath) => {
        const result = readOpencodeUsage(dbPath, "/empty/project");
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("no assistant messages");
      },
      {
        cwd: "/empty/project",
        sessionId: "ses_empty",
        messages: [
          {
            id: "msg_user_only",
            session_id: "ses_empty",
            role: "user",
            time_created: 1717500001000,
            tokens: JSON.stringify({ input: 100, output: 0, cache: { read: 0, write: 0 } }),
          },
        ],
      },
    );
  });

  test("picks most recently active session when multiple match same cwd", () => {
    if (!sqliteAvailable) return;

    const dir = mkdtempSync(join(tmpdir(), "forge-opencode-multi-"));
    const dbPath = join(dir, "opencode.db");
    const db = new DatabaseSync(dbPath);

    try {
      db.exec(`
        CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, time_created INTEGER NOT NULL, tokens TEXT);
      `);

      // Two sessions for same directory
      db.prepare("INSERT INTO session VALUES (?, ?, ?)").run("ses_old", "/project", 1717400000000);
      db.prepare("INSERT INTO session VALUES (?, ?, ?)").run("ses_new", "/project", 1717500000000);

      // Old session: assistant message at t=1000
      db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
        "msg_old", "ses_old", "assistant", 1717400001000,
        JSON.stringify({ input: 1000, cache: { read: 5000 } }),
      );
      // New session: assistant message at t=2000 (more recent)
      db.prepare("INSERT INTO message VALUES (?, ?, ?, ?, ?)").run(
        "msg_new", "ses_new", "assistant", 1717500002000,
        JSON.stringify({ input: 9000, cache: { read: 50000 } }),
      );

      db.close();

      const result = readOpencodeUsage(dbPath, "/project");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.session_id).toBe("ses_new");
      expect(result.total_context).toBe(9000 + 50000);
    } finally {
      try { db.close(); } catch { /* already closed */ }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
