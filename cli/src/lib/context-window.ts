/**
 * Context window-size resolution from a model id.
 *
 * The `usage_pct = total_context / window_size` calculation is only as
 * correct as `window_size`. A 100k-token usage is 50% of a 200k window but
 * 10% of a 1M window — getting this wrong triggers spurious handoffs (or
 * misses real ones).
 *
 * Source of truth is the model id reported by the platform's session
 * transcript (Claude Code: `message.model` in JSONL; OpenCode: `model_id`
 * column on the latest assistant message). The CLI never reads config or
 * env vars to size the window — auto-detection is mandatory because users
 * can swap models mid-session and a stale config would silently miscount.
 *
 * Resolution rules (in order):
 *   1. Model id contains "[1m]" suffix (Claude Code 1M-context tier)         → 1_000_000
 *   2. Model id matches a known Claude family (claude-sonnet/opus/haiku-N)   → 200_000
 *   3. Model id matches a known third-party family (gpt-, deepseek-, qwen-)  → that family's documented window
 *   4. Unknown / null model                                                  → 200_000 (Anthropic standard)
 *
 * The fallback is conservative: 200k is the most common Claude window, so
 * an unknown model gets a defensive estimate that errs toward early
 * handoffs rather than late ones. Add new families to KNOWN_FAMILIES below
 * as they appear in real session transcripts.
 */

export const DEFAULT_WINDOW_SIZE = 200_000;
export const ONE_MILLION_WINDOW = 1_000_000;

/**
 * Known model-family → window mapping. Order matters: the first matching
 * pattern wins. Patterns are tested case-insensitively against the model id.
 *
 * When adding entries, cite the source so future maintainers can verify:
 *   - Claude: https://docs.claude.com/en/docs/about-claude/models
 *   - OpenAI gpt-*:  https://platform.openai.com/docs/models
 *   - DeepSeek:      https://api-docs.deepseek.com/quick_start/pricing
 */
const KNOWN_FAMILIES: Array<{ pattern: RegExp; window: number }> = [
  // 1M-context tier marker — Anthropic prefixes the model id with "[1m]"
  // (e.g. "claude-opus-4-6[1m]"). Match anywhere in the id to stay robust.
  { pattern: /\[1m\]/i, window: ONE_MILLION_WINDOW },

  // Claude families — all current generations ship with a 200k window
  // unless the [1m] tier marker is present.
  { pattern: /^claude-(opus|sonnet|haiku)-/i, window: DEFAULT_WINDOW_SIZE },
  { pattern: /^claude-3/i, window: DEFAULT_WINDOW_SIZE },

  // OpenAI gpt-4o / gpt-4-turbo: 128k native window
  { pattern: /^gpt-4(o|-turbo)/i, window: 128_000 },
  // OpenAI o1 / o3: 200k
  { pattern: /^o[13]/i, window: DEFAULT_WINDOW_SIZE },

  // DeepSeek-V3 / R1: 128k; DeepSeek-V4+: 200k.
  // The v4 family ("deepseek-v4-*") ships with a 200k context window.
  // Must be checked before the generic deepseek fallback.
  { pattern: /^deepseek-v4/i, window: DEFAULT_WINDOW_SIZE },
  // DeepSeek-V3 / R1 and other older variants: 128k
  { pattern: /^deepseek/i, window: 128_000 },

  // Qwen 2.5 / 3 — 128k typical
  { pattern: /^qwen/i, window: 128_000 },

  // Google Gemini 1.5+ — 1M window
  { pattern: /^gemini-(1\.5|2)/i, window: ONE_MILLION_WINDOW },
];

/**
 * Resolve the active context window size in tokens from a model id.
 *
 * @param model Model id from the platform's last assistant message, or null.
 * @returns Window size in tokens. Always returns a positive integer.
 */
export function resolveWindowSize(model: string | null | undefined): number {
  if (!model) return DEFAULT_WINDOW_SIZE;
  for (const { pattern, window } of KNOWN_FAMILIES) {
    if (pattern.test(model)) return window;
  }
  return DEFAULT_WINDOW_SIZE;
}
