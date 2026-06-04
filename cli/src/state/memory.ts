import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ForgeConfig } from "./config.js";

type SectionBounds = {
  headingStart: number;
  bodyStart: number;
  end: number;
};

const forgeHeading = /^## Forge[^\S\r\n]*(?:\r?\n|$)/m;
const nextHeading = /^## [^\r\n]+[^\S\r\n]*$/m;
const currentFeature = /^\*\*Current Feature:?\*\*[^\S\r\n]*(?:\r?\n|$)/m;
const completedFeatures = /^\*\*Completed Features:?\*\*[^\S\r\n]*(?:\r?\n|$)/m;
const workflowRules = /^\*\*Workflow Rules:?\*\*[^\S\r\n]*(?:\r?\n|$)/m;
const compactInstructionsHeading = /^## Compact Instructions[^\S\r\n]*(?:\r?\n|$)/m;

/**
 * Compact Instructions block template. Injected as a top-level `## Compact
 * Instructions` heading in the memory file by `feature:start`. This heading
 * sits at the same level as `## Forge` so compaction/summarization engines
 * treat it as a preserve-worthy section in its own right.
 */
export const COMPACT_INSTRUCTIONS_BLOCK = `## Compact Instructions

When this conversation is compacted, preserve / recover:
1. Active forge feature & status (from .forge/progress.json)
2. Read .forge/handoff.md for the next task
3. After compaction, run /resume to reload canonical state
`;

export function memoryPath(cwd: string, config: ForgeConfig): string {
  return join(cwd, config.memory_file);
}

export function ensureForgeSection(content: string): string {
  if (forgeHeading.test(content)) {
    return content;
  }

  if (content.length === 0) {
    return "# Project Instructions\n\n## Forge\n";
  }

  const separator = content.endsWith("\n") ? "\n" : "\n\n";
  return `${content}${separator}## Forge\n`;
}

function forgeSectionBounds(content: string): SectionBounds {
  const match = forgeHeading.exec(content);

  if (!match) {
    throw new Error("missing Forge memory section");
  }

  const bodyStart = match.index + match[0].length;
  const afterHeading = content.slice(bodyStart);
  const next = nextHeading.exec(afterHeading);

  return {
    headingStart: match.index,
    bodyStart,
    end: next ? bodyStart + next.index : content.length,
  };
}

function updateForgeSection(
  content: string,
  update: (section: string) => string,
): string {
  const bounds = forgeSectionBounds(content);
  const before = content.slice(0, bounds.bodyStart);
  const section = content.slice(bounds.bodyStart, bounds.end);
  const after = content.slice(bounds.end);

  return `${before}${update(section)}${after}`;
}

function trimBlankLines(value: string): string {
  return value.replace(/^\s*\n/, "").replace(/\s+$/, "");
}

function formattedBlock(block: string): string {
  return `${trimBlankLines(block)}\n\n`;
}

function removeCurrentFeature(section: string): string {
  const match = currentFeature.exec(section);
  if (!match) {
    return section;
  }

  const before = section.slice(0, match.index).replace(/\s+$/, "");
  const afterCurrent = section.slice(match.index);
  const completed = completedFeatures.exec(afterCurrent);
  const after = completed ? afterCurrent.slice(completed.index) : "";

  return [before, after.replace(/^\s*\n/, "")]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

function removeWorkflowRules(section: string): string {
  const match = workflowRules.exec(section);
  if (!match) {
    return section;
  }

  const before = section.slice(0, match.index).replace(/\s+$/, "");
  const afterRules = section.slice(match.index + match[0].length);
  const nextBold = /^\*\*[^\r\n]+\*\*[^\S\r\n]*(?:\r?\n|$)/m.exec(afterRules);
  const after = nextBold ? afterRules.slice(nextBold.index) : "";

  return [before, after.replace(/^\s*\n/, "")]
    .filter((part) => part.length > 0)
    .join("\n\n");
}

export function replaceWorkflowRules(content: string, block: string): string {
  return updateForgeSection(content, (section) => {
    const withoutRules = removeWorkflowRules(section);
    const replacement = formattedBlock(block);

    if (withoutRules.trim().length === 0) {
      return `\n${replacement}`;
    }

    return `\n${replacement}${withoutRules.replace(/^\s*\n/, "")}`;
  });
}

export function clearWorkflowRules(content: string): string {
  return updateForgeSection(content, (section) => {
    return removeWorkflowRules(section);
  });
}

export function replaceCurrentFeature(content: string, block: string): string {
  return updateForgeSection(content, (section) => {
    const withoutCurrent = removeCurrentFeature(section);
    const replacement = formattedBlock(block);

    if (withoutCurrent.trim().length === 0) {
      return `\n${replacement}`;
    }

    return `\n${replacement}${withoutCurrent.replace(/^\s*\n/, "")}`;
  });
}

export function appendCompletedFeature(content: string, entry: string): string {
  return updateForgeSection(content, (section) => {
    const withoutCurrent = removeCurrentFeature(section);
    const cleanEntry = trimBlankLines(entry);
    const marker = "**Completed Features**";

    if (completedFeatures.test(withoutCurrent)) {
      return withoutCurrent.replace(
        completedFeatures,
        `${marker}\n${cleanEntry}\n`,
      );
    }

    const prefix =
      withoutCurrent.trim().length > 0 ? `${withoutCurrent.trimEnd()}\n\n` : "\n";
    return `${prefix}${marker}\n${cleanEntry}\n\n`;
  });
}

export function writeAndVerify(
  file: string,
  content: string,
  marker: string,
): boolean {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    writeFileSync(file, content, "utf8");
    if (readFileSync(file, "utf8").includes(marker)) {
      return true;
    }
  }

  return false;
}

/**
 * Ensure the memory file has a `## Compact Instructions` section. If missing,
 * injects it just before `## Forge` (so both top-level sections survive
 * compaction). If already present, leaves it unchanged.
 *
 * Designed to be called from `feature:start` after `ensureForgeSection`.
 */
export function ensureCompactInstructions(content: string): string {
  if (compactInstructionsHeading.test(content)) {
    return content;
  }

  // Insert just before ## Forge heading if it exists, otherwise append.
  const forgeMatch = forgeHeading.exec(content);
  if (forgeMatch) {
    const before = content.slice(0, forgeMatch.index);
    const after = content.slice(forgeMatch.index);
    const separator = before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    return `${before}${separator}${COMPACT_INSTRUCTIONS_BLOCK}\n${after}`;
  }

  const separator = content.endsWith("\n") ? "\n" : "\n\n";
  return `${content}${separator}${COMPACT_INSTRUCTIONS_BLOCK}`;
}

/**
 * Remove the `## Compact Instructions` section from the memory file.
 * Used by `phase:finish` to clean up after a feature completes.
 */
export function clearCompactInstructions(content: string): string {
  const match = compactInstructionsHeading.exec(content);
  if (!match) return content;

  const before = content.slice(0, match.index);
  const afterHeading = content.slice(match.index + match[0].length);
  const next = nextHeading.exec(afterHeading);
  const after = next ? afterHeading.slice(next.index) : "";

  // Clean up trailing blank lines between sections
  return (before.replace(/\n{3,}$/, "\n\n") + after).replace(/\n{3,}/g, "\n\n");
}
