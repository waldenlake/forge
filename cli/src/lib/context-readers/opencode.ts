/**
 * OpenCode SQLite context reader.
 *
 * Reads token usage from OpenCode's session database at
 * `~/.local/share/opencode/opencode.db`. The database stores sessions
 * (with a `directory` column linking to the project cwd) and messages
 * (with per-message token breakdowns as JSON in a `tokens` column).
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
      /** Model id from the latest assistant message, or null when the schema doesn't expose one. */
      model: string | null;
    }
  | {
      ok: false;
      reason: string;
    };

/**
 * SQL constants — all queries in one place for maintainability.
 */
const SQL = {
  /** Find the most recently active session matching a working directory. */
  FIND_SESSION: `
    SELECT s.id
    FROM session s
    JOIN message m ON m.session_id = s.id
    WHERE s.directory = ?
    GROUP BY s.id
    ORDER BY MAX(m.time_created) DESC
    LIMIT 1
  `,
  /**
   * Get latest assistant message tokens + model for a specific session.
   * `model_id` is the column OpenCode uses today; defensive `SELECT *` is
   * avoided so query plans stay readable. If the schema rename happens we
   * surface model:null and fall back to platform defaults.
   */
  LATEST_ASSISTANT_TOKENS: `
    SELECT m.tokens, m.model_id AS model
    FROM message m
    WHERE m.session_id = ? AND m.role = 'assistant'
    ORDER BY m.time_created DESC
    LIMIT 1
  `,
} as const;

/**
 * Extract total context tokens from a JSON `tokens` column.
 * Expected shape: `{ "input": N, "cache": { "read": N } }`.
 * Returns input + cache.read.
 */
function extractContextTokens(tokensJson: string): number | null {
  try {
    const parsed = JSON.parse(tokensJson);
    const input = typeof parsed.input === "number" ? parsed.input : 0;
    const cacheRead =
      typeof parsed.cache?.read === "number" ? parsed.cache.read : 0;
    return input + cacheRead;
  } catch {
    return null;
  }
}

/**
 * Read context usage from OpenCode's SQLite database.
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
    // node:sqlite is experimental in Node 22.x. If unavailable, degrade.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("node:sqlite");
    DatabaseSync = mod.DatabaseSync;
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
    // Resolve session_id
    let resolvedSessionId: string | undefined = sessionId;
    if (!resolvedSessionId) {
      const row = db.prepare(SQL.FIND_SESSION).get(cwd) as
        | { id: string }
        | undefined;
      if (!row) {
        return { ok: false, reason: `no session found for directory: ${cwd}` };
      }
      resolvedSessionId = row.id;
    }

    // Get latest assistant message
    let msgRow: { tokens: string; model: string | null } | undefined;
    try {
      msgRow = db.prepare(SQL.LATEST_ASSISTANT_TOKENS).get(resolvedSessionId) as
        | { tokens: string; model: string | null }
        | undefined;
    } catch {
      // Older OpenCode schemas may not have a model column. Retry without it
      // so the rest of the pipeline still works (model resolves to null →
      // platform default window).
      msgRow = db
        .prepare(
          "SELECT m.tokens FROM message m WHERE m.session_id = ? AND m.role = 'assistant' ORDER BY m.time_created DESC LIMIT 1",
        )
        .get(resolvedSessionId) as { tokens: string } | undefined as any;
      if (msgRow) (msgRow as any).model = null;
    }
    if (!msgRow) {
      return {
        ok: false,
        reason: `no assistant messages in session ${resolvedSessionId}`,
      };
    }

    const totalContext = extractContextTokens(msgRow.tokens);
    if (totalContext === null) {
      return { ok: false, reason: "failed to parse tokens JSON" };
    }

    return {
      ok: true,
      session_id: resolvedSessionId,
      total_context: totalContext,
      source: dbPath,
      model: msgRow.model ?? null,
    };
  } finally {
    try {
      db.close();
    } catch {
      // ignore close errors
    }
  }
}
