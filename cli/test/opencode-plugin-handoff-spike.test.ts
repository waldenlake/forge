import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");
const pluginPath = resolve(repoRoot, ".opencode/plugins/forge.js");
const tuiPluginPath = resolve(repoRoot, ".opencode/plugins/forge-tui.js");

type TuiCall = { method: string; payload?: unknown };

function withTempProject(run: (ctx: { cwd: string; home: string; calls: TuiCall[] }) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), "forge-opencode-plugin-"));
  const cwd = join(root, "project");
  const home = join(root, "home");
  mkdirSync(join(cwd, ".forge"), { recursive: true });
  mkdirSync(home, { recursive: true });

  const oldHome = process.env.HOME;
  const oldUserprofile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  const calls: TuiCall[] = [];
  return run({ cwd, home, calls }).finally(() => {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldUserprofile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = oldUserprofile;
    rmSync(root, { recursive: true, force: true });
  });
}

function fakeServerInput(cwd: string, calls: TuiCall[]) {
  return {
    directory: cwd,
    serverUrl: new URL("http://127.0.0.1:4096"),
    client: {
      tui: {
        executeCommand: async (payload: unknown) => {
          calls.push({ method: "executeCommand", payload });
        },
        appendPrompt: async (payload: unknown) => {
          calls.push({ method: "appendPrompt", payload });
        },
        submitPrompt: async (payload?: unknown) => {
          calls.push({ method: "submitPrompt", payload });
        },
      },
    },
  };
}

describe("OpenCode plugin handoff spike", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("server plugin does not attempt session handoff through TUI command events", async () => {
    await withTempProject(async ({ cwd, calls }) => {
      writeFileSync(
        join(cwd, ".forge", "progress.json"),
        JSON.stringify({ status: "executing" }) + "\n",
        "utf8",
      );
      writeFileSync(
        join(cwd, ".forge", "handoff-signal.json"),
        JSON.stringify({
          action: "handoff-session",
          method: "in-place",
          written_at: new Date().toISOString(),
          ttl_ms: 30_000,
        }) + "\n",
        "utf8",
      );

      const { ForgePlugin } = await import(`${pluginPath}?t=${Date.now()}`);
      const hooks = await ForgePlugin(fakeServerInput(cwd, calls));

      expect(hooks.event).toBeUndefined();
      expect(calls).toEqual([]);
      expect(existsSync(join(cwd, ".forge", "handoff-signal.json"))).toBe(true);
      expect(existsSync(join(cwd, ".forge", "opencode-resume-pending.json"))).toBe(false);
    });
  });

  test("TUI plugin consumes handoff signal, creates a new session, navigates to it, and prompts resume", async () => {
    await withTempProject(async ({ cwd }) => {
      writeFileSync(
        join(cwd, ".forge", "progress.json"),
        JSON.stringify({ status: "executing" }) + "\n",
        "utf8",
      );
      writeFileSync(
        join(cwd, ".forge", "handoff-signal.json"),
        JSON.stringify({
          action: "handoff-session",
          method: "in-place",
          reason: "context high",
          written_at: new Date().toISOString(),
          ttl_ms: 30_000,
        }) + "\n",
        "utf8",
      );

      const calls: TuiCall[] = [];
      const disposers: Array<() => void> = [];
      const eventHandlers: Record<string, Array<(event: unknown) => void>> = {};
      let routeName = "session";
      const api = {
        app: { version: "1.17.4" },
        state: {
          path: { directory: cwd },
        },
        event: {
          on: (type: string, handler: (event: unknown) => void) => {
            eventHandlers[type] = eventHandlers[type] ?? [];
            eventHandlers[type].push(handler);
            return () => {};
          },
        },
        lifecycle: {
          onDispose: (fn: () => void) => {
            disposers.push(fn);
            return () => {};
          },
        },
        route: {
          get current() {
            return { name: routeName };
          },
          navigate: (name: string, params?: unknown) => {
            routeName = name;
            calls.push({ method: "route.navigate", payload: { name, params } });
          },
        },
        client: {
          session: {
            create: async (payload: unknown) => {
              calls.push({ method: "session.create", payload });
              const event = {
                type: "session.created",
                properties: { sessionID: "new-session", info: { id: "new-session" } },
              };
              for (const handler of eventHandlers["session.created"] ?? []) handler(event);
              return { data: { id: "new-session" } };
            },
            promptAsync: async (payload: unknown) => {
              calls.push({ method: "session.promptAsync", payload });
              return { data: {} };
            },
          },
        },
      };

      const mod = await import(`${tuiPluginPath}?t=${Date.now()}`);
      await mod.default.tui(api);

      const idleEvent = { type: "session.idle", properties: { sessionID: "old-session" } };
      for (const handler of eventHandlers["session.idle"] ?? []) handler(idleEvent);
      await vi.waitFor(() => {
        expect(calls.map((call) => call.method)).toEqual([
          "session.create",
          "route.navigate",
          "session.promptAsync",
        ]);
      });

      expect(calls[0]).toEqual({
        method: "session.create",
        payload: {
          directory: cwd,
          title: "Forge handoff",
        },
      });
      expect(calls[1]).toEqual({
        method: "route.navigate",
        payload: { name: "session", params: { sessionID: "new-session" } },
      });
      expect(calls[2]).toEqual({
        method: "session.promptAsync",
        payload: {
          sessionID: "new-session",
          directory: cwd,
          noReply: false,
          parts: [{ type: "text", text: "Resume the Forge workflow by running the forge:resume skill." }],
        },
      });
      expect(existsSync(join(cwd, ".forge", "handoff-signal.json"))).toBe(false);

      for (const dispose of disposers) dispose();
    });
  });
});
