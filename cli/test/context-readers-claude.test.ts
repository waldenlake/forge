import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import {
  encodeCwdForClaude,
  readClaudeUsage,
} from "../src/lib/context-readers/claude.js";

function withFixtureProject(
  cwd: string,
  sessions: Array<{ id: string; lines: object[]; mtimeMs?: number }>,
  run: (projectsDir: string) => void,
): void {
  const tmpDir = mkdtempSync(join(tmpdir(), "forge-claude-reader-"));
  const encoded = encodeCwdForClaude(cwd);
  const projectDir = join(tmpDir, encoded);
  mkdirSync(projectDir, { recursive: true });

  for (const session of sessions) {
    const file = join(projectDir, `${session.id}.jsonl`);
    const content = session.lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
    writeFileSync(file, content, "utf8");
    if (session.mtimeMs !== undefined) {
      const { utimesSync } = require("node:fs");
      const t = new Date(session.mtimeMs);
      utimesSync(file, t, t);
    }
  }

  try {
    run(tmpDir);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function assistantLine(usage: {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens?: number;
}, model?: string): object {
  return {
    type: "assistant",
    message: {
      role: "assistant",
      ...(model ? { model } : {}),
      usage: {
        input_tokens: usage.input_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens,
        cache_read_input_tokens: usage.cache_read_input_tokens,
        output_tokens: usage.output_tokens ?? 100,
      },
    },
    timestamp: "2026-06-04T10:00:00.000Z",
  };
}

function userLine(): object {
  return {
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "hello" }] },
    timestamp: "2026-06-04T09:59:00.000Z",
  };
}

describe("encodeCwdForClaude", () => {
  test("encodes Unix path", () => {
    expect(encodeCwdForClaude("/home/user/project")).toBe(
      "-home-user-project",
    );
  });

  test("encodes Windows path with drive letter", () => {
    expect(encodeCwdForClaude("E:\\space\\open\\project\\forge")).toBe(
      "E--space-open-project-forge",
    );
  });

  test("encodes path with forward slashes", () => {
    expect(encodeCwdForClaude("C:/Users/user")).toBe("C--Users-user");
  });
});

describe("readClaudeUsage", () => {
  test("returns total_context = input + cache_creation + cache_read from last assistant message", () => {
    withFixtureProject(
      "/home/user/myproject",
      [
        {
          id: "ses_001",
          lines: [
            userLine(),
            assistantLine({
              input_tokens: 1000,
              cache_creation_input_tokens: 500,
              cache_read_input_tokens: 50000,
            }),
            userLine(),
            assistantLine({
              input_tokens: 2000,
              cache_creation_input_tokens: 200,
              cache_read_input_tokens: 160000,
            }),
          ],
        },
      ],
      (projectsDir) => {
        const result = readClaudeUsage("/home/user/myproject", undefined, projectsDir);
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // Last assistant: 2000 + 200 + 160000 = 162200
        expect(result.total_context).toBe(162200);
        expect(result.session_id).toBe("ses_001");
      },
    );
  });

  test("picks most recently modified .jsonl when multiple sessions exist", () => {
    withFixtureProject(
      "/project",
      [
        {
          id: "old-session",
          lines: [
            assistantLine({
              input_tokens: 100,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 1000,
            }),
          ],
          mtimeMs: Date.now() - 60000, // 1 minute ago
        },
        {
          id: "new-session",
          lines: [
            assistantLine({
              input_tokens: 9000,
              cache_creation_input_tokens: 1000,
              cache_read_input_tokens: 90000,
            }),
          ],
          mtimeMs: Date.now(), // now
        },
      ],
      (projectsDir) => {
        const result = readClaudeUsage("/project", undefined, projectsDir);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.session_id).toBe("new-session");
        expect(result.total_context).toBe(9000 + 1000 + 90000);
      },
    );
  });

  test("accepts explicit sessionId", () => {
    withFixtureProject(
      "/project",
      [
        {
          id: "specific-session",
          lines: [
            assistantLine({
              input_tokens: 5000,
              cache_creation_input_tokens: 300,
              cache_read_input_tokens: 80000,
            }),
          ],
        },
      ],
      (projectsDir) => {
        const result = readClaudeUsage(
          "/project",
          "specific-session",
          projectsDir,
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.session_id).toBe("specific-session");
        expect(result.total_context).toBe(5000 + 300 + 80000);
      },
    );
  });

  test("returns ok:false when project directory does not exist", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "forge-claude-empty-"));
    try {
      const result = readClaudeUsage("/nonexistent/project", undefined, tmpDir);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toContain("project directory not found");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("returns ok:false when session has no assistant messages", () => {
    withFixtureProject(
      "/project",
      [
        {
          id: "no-assistant",
          lines: [userLine(), userLine()],
        },
      ],
      (projectsDir) => {
        const result = readClaudeUsage("/project", undefined, projectsDir);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("no assistant message with usage");
      },
    );
  });

  test("returns ok:false when explicit sessionId file is missing", () => {
    withFixtureProject(
      "/project",
      [{ id: "exists", lines: [assistantLine({ input_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 })] }],
      (projectsDir) => {
        const result = readClaudeUsage("/project", "missing-session", projectsDir);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toContain("session file not found");
      },
    );
  });

  test("handles missing usage fields gracefully (defaults to 0)", () => {
    withFixtureProject(
      "/project",
      [
        {
          id: "partial",
          lines: [
            {
              type: "assistant",
              message: {
                role: "assistant",
                usage: {
                  input_tokens: 5000,
                  // cache_creation_input_tokens and cache_read_input_tokens missing
                  output_tokens: 50,
                },
              },
            },
          ],
        },
      ],
      (projectsDir) => {
        const result = readClaudeUsage("/project", undefined, projectsDir);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.total_context).toBe(5000);
      },
    );
  });

  test("returns model id from latest assistant message", () => {
    withFixtureProject(
      "/project",
      [
        {
          id: "with-model",
          lines: [
            assistantLine(
              {
                input_tokens: 100,
                cache_creation_input_tokens: 0,
                cache_read_input_tokens: 0,
              },
              "claude-opus-4-6[1m]",
            ),
          ],
        },
      ],
      (projectsDir) => {
        const result = readClaudeUsage("/project", undefined, projectsDir);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.model).toBe("claude-opus-4-6[1m]");
      },
    );
  });

  test("returns model: null when assistant message omits model field", () => {
    withFixtureProject(
      "/project",
      [
        {
          id: "no-model",
          lines: [
            assistantLine({
              input_tokens: 100,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            }),
          ],
        },
      ],
      (projectsDir) => {
        const result = readClaudeUsage("/project", undefined, projectsDir);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.model).toBeNull();
      },
    );
  });
});
