import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { readOpencodeUsage } from "../src/lib/context-readers/opencode.js";

// Build a require bound to this module so the ESM test can probe node:sqlite
// the same way the production code loads it.
const nodeRequire = createRequire(import.meta.url);

let DatabaseSync: any;
let sqliteAvailable = false;
try {
  const mod = nodeRequire("node:sqlite");
  DatabaseSync = mod.DatabaseSync;
  sqliteAvailable = true;
} catch {
  // node:sqlite not available
}

/**
 * Minimal session/message-table schema mirroring the columns the production reader
 * SELECTs against opencode-ai 1.15.x. We deliberately don't recreate every
 * column the real DB has — only the ones the reader reads. Other columns
 * (tokens_output, tokens_reasoning, etc.) are nullable and unused.
 */
const SCHEMA = `
  CREATE TABLE session (
    id                  TEXT PRIMARY KEY,
    directory           TEXT NOT NULL,
    model               TEXT,
    tokens_input        INTEGER,
    tokens_cache_read   INTEGER,
    tokens_cache_write  INTEGER,
    tokens_output       INTEGER,
    tokens_reasoning    INTEGER,
    time_updated        INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE message (
    id                  TEXT PRIMARY KEY,
    session_id          TEXT NOT NULL,
    data                TEXT,
    time_created        INTEGER NOT NULL DEFAULT 0
  );
`;

type MessageFixture = {
  id: string;
  data: string;
  time_created?: number;
};

type SessionFixture = {
  id: string;
  directory: string;
  model?: string | null;
  tokens_input?: number;
  tokens_cache_read?: number;
  tokens_cache_write?: number;
  time_updated?: number;
  token_total?: number;
  messages?: MessageFixture[];
};

function withFixtureDb(
  sessions: SessionFixture[],
  run: (dbPath: string) => void,
): void {
  if (!sqliteAvailable) return;

  const dir = mkdtempSync(join(tmpdir(), "forge-opencode-reader-"));
  const dbPath = join(dir, "opencode.db");
  const db = new DatabaseSync(dbPath);

  try {
    db.exec(SCHEMA);
    const insert = db.prepare(
      `INSERT INTO session
         (id, directory, model, tokens_input, tokens_cache_read,
          tokens_cache_write, time_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertMessage = db.prepare(
      `INSERT INTO message
         (id, session_id, data, time_created)
       VALUES (?, ?, ?, ?)`,
    );
    for (const s of sessions) {
      insert.run(
        s.id,
        s.directory,
        s.model ?? null,
        s.tokens_input ?? 0,
        s.tokens_cache_read ?? 0,
        s.tokens_cache_write ?? 0,
        s.time_updated ?? 0,
      );
      const messages =
        s.messages ??
        (s.token_total === undefined
          ? []
          : [
              {
                id: `msg_${s.id}`,
                data: JSON.stringify({ tokens: { total: s.token_total } }),
              },
            ]);
      for (const message of messages) {
        insertMessage.run(
          message.id,
          s.id,
          message.data,
          message.time_created ?? 0,
        );
      }
    }
    db.close();
    run(dbPath);
  } finally {
    try { db.close(); } catch { /* already closed */ }
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!sqliteAvailable)("readOpencodeUsage", () => {
  test("returns latest message tokens.total as total_context", () => {
    withFixtureDb(
      [
        {
          id: "ses_abc",
          directory: "/home/user/project",
          model: JSON.stringify({ id: "claude-sonnet-4-6", providerID: "opencode" }),
          tokens_input: 12_000,
          tokens_cache_read: 88_000,
          tokens_cache_write: 1234,
          token_total: 100_000,
        },
      ],
      (dbPath) => {
        const result = readOpencodeUsage(dbPath, "/home/user/project");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.total_context).toBe(100_000);
        expect(result.session_id).toBe("ses_abc");
        expect(result.source).toBe(dbPath);
        // model JSON is unwrapped to its `id`
        expect(result.model).toBe("claude-sonnet-4-6");
      },
    );
  });

  test("normalises Windows backslashes to the POSIX directory the DB stores", () => {
    // session.directory holds POSIX paths even on Windows, so the reader must
    // accept a Windows cwd and find the row.
    withFixtureDb(
      [
        {
          id: "ses_win",
          directory: "E:/space/open/project/forge",
          tokens_input: 1000,
          tokens_cache_read: 5000,
          token_total: 6000,
        },
      ],
      (dbPath) => {
        const result = readOpencodeUsage(dbPath, "E:\\space\\open\\project\\forge");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.session_id).toBe("ses_win");
        expect(result.total_context).toBe(6000);
      },
    );
  });

  test("returns ok:false when no session matches cwd", () => {
    withFixtureDb(
      [{ id: "ses_other", directory: "/somewhere/else" }],
      (dbPath) => {
        const result = readOpencodeUsage(dbPath, "/nonexistent");
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("no session found");
      },
    );
  });

  test("accepts explicit sessionId to bypass cwd lookup", () => {
    withFixtureDb(
      [
        {
          id: "ses_target",
          directory: "/somewhere",
          tokens_input: 200,
          tokens_cache_read: 300,
          token_total: 500,
        },
      ],
      (dbPath) => {
        const result = readOpencodeUsage(dbPath, "/irrelevant", "ses_target");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.session_id).toBe("ses_target");
        expect(result.total_context).toBe(500);
      },
    );
  });

  test("explicit sessionId returning no row reports 'session not found'", () => {
    withFixtureDb([{ id: "ses_a", directory: "/dir" }], (dbPath) => {
      const result = readOpencodeUsage(dbPath, "/dir", "ses_missing");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toContain("session not found");
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

  test("picks most recently updated session when multiple match same cwd", () => {
    withFixtureDb(
      [
        {
          id: "ses_old",
          directory: "/project",
          tokens_input: 1000,
          tokens_cache_read: 5000,
          time_updated: 1_717_400_000_000,
          token_total: 6000,
        },
        {
          id: "ses_new",
          directory: "/project",
          tokens_input: 9000,
          tokens_cache_read: 50_000,
          time_updated: 1_717_500_000_000, // newer
          token_total: 59_000,
        },
      ],
      (dbPath) => {
        const result = readOpencodeUsage(dbPath, "/project");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.session_id).toBe("ses_new");
        expect(result.total_context).toBe(59_000);
      },
    );
  });

  test("model column missing / unparseable yields model: null without crashing", () => {
    withFixtureDb(
      [
        {
          id: "ses_no_model",
          directory: "/dir",
          model: null, // no model recorded
          tokens_input: 1,
          tokens_cache_read: 2,
          token_total: 3,
        },
        {
          id: "ses_bad_json",
          directory: "/dir2",
          model: "not-json-but-a-bare-string", // tolerated as legacy id
          tokens_input: 4,
          tokens_cache_read: 8,
          token_total: 12,
        },
      ],
      (dbPath) => {
        const r1 = readOpencodeUsage(dbPath, "/dir");
        expect(r1.ok).toBe(true);
        if (!r1.ok) return;
        expect(r1.model).toBeNull();

        const r2 = readOpencodeUsage(dbPath, "/dir2");
        expect(r2.ok).toBe(true);
        if (!r2.ok) return;
        // Bare string gets passed through as a best-effort id.
        expect(r2.model).toBe("not-json-but-a-bare-string");
      },
    );
  });
});
