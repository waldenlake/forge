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
