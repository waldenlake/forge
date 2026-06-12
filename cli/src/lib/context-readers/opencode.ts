/**
 * OpenCode SQLite context reader.
 *
 * Reads token usage from OpenCode's session database at
 * `~/.local/share/opencode/opencode.db`.
 *
 * Context usage is derived from the LATEST assistant message's `data->tokens.total`
 * field — this is the same value OpenCode displays in its "Context X tokens Y% used"
 * status bar. The session-level `tokens_*` columns are CUMULATIVE sums across all
 * turns and do NOT represent current context window occupancy.
 *
 * This module is intentionally tolerant of node:sqlite unavailability
 * (experimental in Node 22.x) — callers get an {ok:false} result and
 * degrade gracefully.
 */

export type OpencodeUsageResult =
  | {
      ok: true;
      session_id: string;
      total_context: number;
      source: string;
      /** Model id from the session or latest message, or null. */
      model: string | null;
    }
  | {
      ok: false;
      reason: string;
    };

import { createRequire } from "node:module";

// ESM has no global `require`; build one bound to this module so we can load
// the built-in `node:sqlite` (which has no ESM named export we can statically
// import without a top-level await). This was the real cause of the old
// "node:sqlite unavailable" failures: bare `require` threw in the ESM build.
const nodeRequire = createRequire(import.meta.url);

let _sqliteWarningSuppressed = false;

/**
 * Load `node:sqlite`, suppressing the one-time ExperimentalWarning it prints to
 * stderr. forge uses this builtin deliberately; the warning is noise that also
 * pollutes JSON/stdout-adjacent tooling. Returns the module or throws.
 */
function loadSqlite(): { DatabaseSync: new (path: string, opts?: unknown) => unknown } {
  if (!_sqliteWarningSuppressed) {
    _sqliteWarningSuppressed = true;
    const original = process.emit.bind(process);
    // @ts-expect-error - narrow override of the overloaded emit signature
    process.emit = (name: string, data: unknown, ...rest: unknown[]) => {
      if (
        name === "warning" &&
        data &&
        (data as { name?: string }).name === "ExperimentalWarning" &&
        /sqlite/i.test((data as { message?: string }).message ?? "")
      ) {
        return false;
      }
      // @ts-expect-error - forward to original emit
      return original(name, data, ...rest);
    };
  }
  return nodeRequire("node:sqlite");
}

/**
 * SQL constants — all queries in one place for maintainability.
 *
 * Schema notes (verified against opencode-ai 1.15.x):
 *   - `session.directory` stores POSIX-style paths even on Windows
 *     (e.g. "E:/space/open/project/forge"), so callers must normalise
 *     backslashes before binding the parameter.
 *   - `session.model` is a JSON object: {"id":"…","providerID":"…","variant":"…"}.
 *   - `message.data` is a JSON blob containing a `tokens` object on assistant
 *     messages: {"total":N,"input":N,"output":N,"reasoning":N,"cache":{...}}.
 *     The `total` field is the CURRENT context size (what OpenCode displays).
 *   - Session-level `tokens_*` columns are cumulative across all turns and
 *     must NOT be used for context window occupancy checks.
 */
const SQL = {
  /** Find the most recently updated session whose directory matches. */
  FIND_LATEST_SESSION_FOR_DIR: `
    SELECT id, directory, model
    FROM session
    WHERE directory = ?
    ORDER BY time_updated DESC
    LIMIT 1
  `,
  /** Same but keyed on explicit session id. */
  FIND_SESSION_BY_ID: `
    SELECT id, directory, model
    FROM session
    WHERE id = ?
    LIMIT 1
  `,
  /**
   * Get the most recent message for a session that has a `tokens` object in
   * its data. We filter by checking the JSON contains "total" to avoid
   * user messages (which have no tokens field). ORDER BY time_created DESC
   * gives us the latest turn.
   */
  LATEST_MESSAGE_WITH_TOKENS: `
    SELECT data
    FROM message
    WHERE session_id = ?
      AND data LIKE '%"tokens"%'
      AND data LIKE '%"total"%'
    ORDER BY time_created DESC
    LIMIT 1
  `,
} as const;

/**
 * Convert a Windows path to the POSIX form `session.directory` actually stores.
 * No-op on platforms that already use forward slashes.
 */
function normaliseDirectoryForLookup(cwd: string): string {
  return cwd.replace(/\\/g, "/");
}

/**
 * `session.model` is a JSON blob like `{"id":"big-pickle","providerID":"…"}`.
 * Pull just the `id`, which is what resolveWindowSize matches against.
 * Returns null when the column is missing or unparseable.
 */
function extractModelId(modelJson: string | null | undefined): string | null {
  if (!modelJson) return null;
  try {
    const parsed = JSON.parse(modelJson);
    return typeof parsed?.id === "string" ? parsed.id : null;
  } catch {
    // Tolerate older rows where `model` was stored as a plain id string.
    return typeof modelJson === "string" ? modelJson : null;
  }
}

type SessionRow = {
  id: string;
  directory: string;
  model: string | null;
};

type MessageRow = {
  data: string;
};

/**
 * Extract the `tokens.total` value from a message's data JSON. This is the
 * same number OpenCode displays as "Context X tokens Y% used" — the actual
 * current context window occupancy for that turn.
 *
 * Returns null if parsing fails or the field is absent.
 */
function extractTotalFromMessageData(data: string | null | undefined): number | null {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data);
    const total = parsed?.tokens?.total;
    return typeof total === "number" && total > 0 ? total : null;
  } catch {
    return null;
  }
}

/**
 * Read context usage from OpenCode's SQLite database.
 *
 * Strategy: find the session, then read the latest message's `tokens.total`
 * which represents the actual current context window occupancy (same value
 * OpenCode displays in its status bar).
 *
 * @param dbPath - Absolute path to opencode.db
 * @param cwd - Project working directory to match against session.directory
 * @param sessionId - Optional explicit session ID (skips directory lookup)
 */
export function readOpencodeUsage(
  dbPath: string,
  cwd: string,
  sessionId?: string,
): OpencodeUsageResult {
  let DatabaseSync: any;
  try {
    DatabaseSync = loadSqlite().DatabaseSync;
  } catch {
    return { ok: false, reason: "node:sqlite unavailable" };
  }

  let db: any;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
  } catch (err) {
    return {
      ok: false,
      reason: `cannot open database: ${(err as Error).message}`,
    };
  }

  try {
    // Resolve the session: explicit id wins, else most recent for cwd.
    const lookupDir = normaliseDirectoryForLookup(cwd);
    const row = (sessionId
      ? db.prepare(SQL.FIND_SESSION_BY_ID).get(sessionId)
      : db.prepare(SQL.FIND_LATEST_SESSION_FOR_DIR).get(lookupDir)) as
      | SessionRow
      | undefined;

    if (!row) {
      return {
        ok: false,
        reason: sessionId
          ? `session not found: ${sessionId}`
          : `no session found for directory: ${cwd}`,
      };
    }

    // Read the latest message's tokens.total — the real context occupancy.
    const msgRow = db
      .prepare(SQL.LATEST_MESSAGE_WITH_TOKENS)
      .get(row.id) as MessageRow | undefined;

    const totalContext = msgRow ? extractTotalFromMessageData(msgRow.data) : null;

    if (totalContext === null) {
      return {
        ok: false,
        reason: "no token data in latest message",
      };
    }

    return {
      ok: true,
      session_id: row.id,
      total_context: totalContext,
      source: dbPath,
      model: extractModelId(row.model),
    };
  } finally {
    try {
      db.close();
    } catch {
      // ignore close errors
    }
  }
}
