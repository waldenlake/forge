import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(repoRoot, path), "utf8"));
}

function readText(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

describe("release metadata", () => {
  test("declares Forge v2 metadata and Claude install script", () => {
    const rootPackage = readJson("package.json") as {
      version?: unknown;
    };
    const claudePlugin = readJson(".claude-plugin/plugin.json") as {
      version?: unknown;
      install?: {
        script?: unknown;
      };
    };

    expect(rootPackage.version).toBe("0.2.0");
    expect(claudePlugin.version).toBe("0.2.0");
    expect(claudePlugin.install?.script).toBe("cli/install.sh");
  });

  test("documents executable OpenCode runtime commands", () => {
    const readme = readText("README.md");
    const openCodeInstall = readText(".opencode/INSTALL.md");
    const docs = `${readme}\n${openCodeInstall}`;

    expect(docs).toContain("cli/dist/index.js");
    expect(docs).toContain(
      "node ~/.config/opencode/plugins/forge/cli/dist/index.js doctor",
    );
    expect(docs).toContain(
      'node "%USERPROFILE%\\.config\\opencode\\plugins\\forge\\cli\\dist\\index.js" doctor',
    );
    expect(docs).toContain(
      "node ~/.config/opencode/plugins/forge/cli/dist/index.js migrate --from 1.0 --to 2.0",
    );
    expect(docs).toContain(
      'node "%USERPROFILE%\\.config\\opencode\\plugins\\forge\\cli\\dist\\index.js" migrate --from 1.0 --to 2.0',
    );
    expect(docs).toContain(
      "OpenCode skills can invoke the plugin runtime directly",
    );
  });

  test("documents the scenarios artifact exception to Runtime-owned JSON", () => {
    const readme = readText("README.md");
    const openCodeInstall = readText(".opencode/INSTALL.md");
    const usingForge = readText("skills/forge_using-forge/SKILL.md");
    const docs = `${readme}\n${openCodeInstall}\n${usingForge}`;

    expect(docs).toContain("Runtime-owned `.forge/*.json`");
    expect(docs).toMatch(/the `scenarios` skill is the narrow exception/i);
    expect(docs).toContain("forge schema:validate");
  });

  test("Windows OpenCode installer restores directory before build failure exits", () => {
    const installer = readText("scripts/install-opencode.cmd");

    expect(installer).toMatch(
      /git pull --ff-only\r?\n  if errorlevel 1 \(\r?\n    popd >nul\r?\n    exit \/b 1\r?\n  \)\r?\n  popd >nul/,
    );
    expect(installer).toMatch(
      /call npm install --production=false\r?\nif errorlevel 1 \(\r?\n  popd >nul\r?\n  exit \/b 1\r?\n\)/,
    );
    expect(installer).toMatch(
      /call npm run build\r?\nif errorlevel 1 \(\r?\n  popd >nul\r?\n  exit \/b 1\r?\n\)/,
    );
  });
});
