import { describe, expect, test } from "vitest";
import {
  resolveWindowSize,
  DEFAULT_WINDOW_SIZE,
  ONE_MILLION_WINDOW,
} from "../src/lib/context-window.js";

describe("resolveWindowSize", () => {
  test("returns 1M for [1m] suffix on any model id", () => {
    expect(resolveWindowSize("claude-opus-4-6[1m]")).toBe(ONE_MILLION_WINDOW);
    expect(resolveWindowSize("claude-sonnet-4-6[1m]")).toBe(ONE_MILLION_WINDOW);
  });

  test("returns 200k for current Claude families without [1m]", () => {
    expect(resolveWindowSize("claude-opus-4-6")).toBe(DEFAULT_WINDOW_SIZE);
    expect(resolveWindowSize("claude-sonnet-4-6")).toBe(DEFAULT_WINDOW_SIZE);
    expect(resolveWindowSize("claude-haiku-4-5-20251001")).toBe(DEFAULT_WINDOW_SIZE);
    expect(resolveWindowSize("claude-3-5-sonnet-20241022")).toBe(DEFAULT_WINDOW_SIZE);
  });

  test("returns 128k for gpt-4o / gpt-4-turbo", () => {
    expect(resolveWindowSize("gpt-4o")).toBe(128_000);
    expect(resolveWindowSize("gpt-4o-mini-2024-07-18")).toBe(128_000);
    expect(resolveWindowSize("gpt-4-turbo")).toBe(128_000);
  });

  test("returns 200k for o1 / o3 reasoning models", () => {
    expect(resolveWindowSize("o1-preview")).toBe(DEFAULT_WINDOW_SIZE);
    expect(resolveWindowSize("o3-mini")).toBe(DEFAULT_WINDOW_SIZE);
  });

  test("returns 128k for deepseek and qwen", () => {
    expect(resolveWindowSize("deepseek-chat")).toBe(128_000);
    expect(resolveWindowSize("deepseek-r1")).toBe(128_000);
    expect(resolveWindowSize("qwen2.5-coder-32b")).toBe(128_000);
  });

  test("returns 1M for gemini 1.5 / 2", () => {
    expect(resolveWindowSize("gemini-1.5-pro")).toBe(ONE_MILLION_WINDOW);
    expect(resolveWindowSize("gemini-2.0-flash")).toBe(ONE_MILLION_WINDOW);
  });

  test("returns 200k fallback for null / undefined / unknown model", () => {
    expect(resolveWindowSize(null)).toBe(DEFAULT_WINDOW_SIZE);
    expect(resolveWindowSize(undefined)).toBe(DEFAULT_WINDOW_SIZE);
    expect(resolveWindowSize("")).toBe(DEFAULT_WINDOW_SIZE);
    expect(resolveWindowSize("custom-model-a1")).toBe(DEFAULT_WINDOW_SIZE);
  });

  test("[1m] takes precedence over family pattern", () => {
    // Sonnet on the 1M tier should still resolve to 1M, not the 200k Claude default.
    expect(resolveWindowSize("claude-sonnet-4-6[1m]")).toBe(ONE_MILLION_WINDOW);
  });
});
