/**
 * Claude Code JSONL context reader.
 *
 * Reads token usage from Claude Code's session transcripts stored at
 * `~/.claude/projects/<encoded-cwd>/<session>.jsonl`. Each line is a JSON
 * object with `type: "user"|"assistant"` and for assistant messages a
 * `message.usage` block containing token breakdowns.
 *
 * Formula: total_context = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type ClaudeUsageResult =
  | {
      ok: true;
      session_id: string;
      total_context: number;
      source: string;
      /** Model id from the last assistant message (e.g. "claude-sonnet-4-6", "claude-opus-4-6[1m]"). null when absent. */
      model: string | null;
    }
  | {
      ok: false;
      reason: string;
    };

/**
 * Encode a cwd path into the directory name Claude Code uses under
 * `~/.claude/projects/`. The encoding replaces `:` and path separators
 * (`/` and `\`) with `-`.
 *
 * Examples:
 *   /home/user/project  → -home-user-project
 *   C:\Users\user\proj  → C--Users-user-proj
 *   E:\space\open\forge → E--space-open-forge
 */
export function encodeCwdForClaude(cwd: string): string {
  return cwd.replace(/[:\\/]/g, "-");
}

/**
 * Locate the Claude Code projects root directory.
 * Typically `~/.claude/projects/`.
 */
function claudeProjectsDir(): string {
  const home =
    process.env.HOME ?? process.env.USERPROFILE ?? "";
  return join(home, ".claude", "projects");
}

/**
 * Find the most recently modified `.jsonl` file in a directory.
 */
function mostRecentJsonl(dir: string): string | null {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }

  const jsonlFiles = entries
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => {
      const full = join(dir, f);
      try {
        return { path: full, mtime: statSync(full).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((x): x is { path: string; mtime: number } => x !== null)
    .sort((a, b) => b.mtime - a.mtime);

  return jsonlFiles.length > 0 ? jsonlFiles[0].path : null;
}

/**
 * Extract session ID from a JSONL file path.
 * File is named `<uuid>.jsonl`, ID is the uuid part.
 */
function sessionIdFromPath(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? "";
  return base.replace(/\.jsonl$/, "");
}

type AssistantUsage = {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
};

type AssistantEntry = {
  usage: AssistantUsage;
  model: string | null;
};

/**
 * Read the JSONL file backwards (via full read + reverse scan) and find
 * the last assistant line with a `message.usage` block. Returns both the
 * usage and the assistant message's `model` id (used to size the context
 * window — see lib/context-window.ts). The model field is part of the
 * Anthropic message schema; a missing value means "unknown".
 *
 * For very large files, a streaming reverse-read would be more efficient;
 * JSONL files are typically <50MB so full read is acceptable for CLI use.
 */
function findLastAssistantUsage(filePath: string): AssistantEntry | null {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return null;
  }

  // Split into lines and scan from end
  const lines = content.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const entry = JSON.parse(line);
      if (entry.type === "assistant" && entry.message?.usage) {
        return {
          usage: entry.message.usage as AssistantUsage,
          model: typeof entry.message.model === "string" ? entry.message.model : null,
        };
      }
    } catch {
      // Skip unparseable lines
      continue;
    }
  }

  return null;
}

/**
 * Read context usage from Claude Code's JSONL session files.
 *
 * @param cwd - Project working directory (will be encoded to locate the project dir)
 * @param sessionId - Optional explicit session ID (picks that specific .jsonl file)
 * @param projectsDir - Override for ~/.claude/projects/ (useful for testing)
 */
export function readClaudeUsage(
  cwd: string,
  sessionId?: string,
  projectsDir?: string,
): ClaudeUsageResult {
  const baseDir = projectsDir ?? claudeProjectsDir();
  const encodedCwd = encodeCwdForClaude(cwd);
  const projectDir = join(baseDir, encodedCwd);

  if (!existsSync(projectDir)) {
    return {
      ok: false,
      reason: `project directory not found: ${encodedCwd}`,
    };
  }

  let targetFile: string;
  if (sessionId) {
    targetFile = join(projectDir, `${sessionId}.jsonl`);
    if (!existsSync(targetFile)) {
      return { ok: false, reason: `session file not found: ${sessionId}.jsonl` };
    }
  } else {
    const recent = mostRecentJsonl(projectDir);
    if (!recent) {
      return { ok: false, reason: "no .jsonl session files found" };
    }
    targetFile = recent;
  }

  const entry = findLastAssistantUsage(targetFile);
  if (!entry) {
    return {
      ok: false,
      reason: "no assistant message with usage found in session",
    };
  }

  const inputTokens = entry.usage.input_tokens ?? 0;
  const cacheCreation = entry.usage.cache_creation_input_tokens ?? 0;
  const cacheRead = entry.usage.cache_read_input_tokens ?? 0;
  const totalContext = inputTokens + cacheCreation + cacheRead;

  return {
    ok: true,
    session_id: sessionIdFromPath(targetFile),
    total_context: totalContext,
    source: targetFile,
    model: entry.model,
  };
}
