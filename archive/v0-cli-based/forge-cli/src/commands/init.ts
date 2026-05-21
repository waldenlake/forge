import * as path from 'path';
import { ensureDir, writeJson, readTextFile, writeTextFile, fileExists } from '../utils/filesystem';
import { detectGit, detectSuperpowers, detectTestFramework } from '../utils/detect';
import { generateManifest, Platform } from '../utils/manifest';
import type { ConfigJson, ProgressJson } from '../types';

export interface InitOptions {
  platforms: ('claude' | 'opencode' | 'codex')[];
}

export interface InitResult {
  success: boolean;
  message: string;
  warnings: string[];
}

export async function runInit(
  projectRoot: string,
  options: InitOptions,
): Promise<InitResult> {
  const warnings: string[] = [];

  try {
    // 1. Detect project type
    const hasGit = await detectGit(projectRoot);
    const projectType = hasGit ? 'existing' : 'new';

    // 2. Detect Superpowers
    const hasSuperpowers = await detectSuperpowers(projectRoot);
    if (!hasSuperpowers) {
      warnings.push(
        'Superpowers not detected. Install with: git clone https://github.com/anomalyco/superpowers ~/.agents/skills/superpowers',
      );
    }

    // 3. Detect GitNexus (existing projects only)
    if (projectType === 'existing') {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const gitnexusPath = path.join(homeDir, '.agents', 'skills', 'gitnexus');
      const hasGitnexus = await fileExists(gitnexusPath);
      if (!hasGitnexus) {
        warnings.push(
          'GitNexus not detected. For existing projects, install with: npm install -g @gitnexus/cli',
        );
      }
    }

    // 4. Detect test framework
    const testInfo = await detectTestFramework(projectRoot);
    const testCommand = testInfo?.command || 'npm test';
    const testFramework = testInfo?.framework || 'unknown';

    // 5. Generate directory structure
    const dirs = [
      path.join(projectRoot, 'docs', 'forge', 'specs'),
      path.join(projectRoot, 'docs', 'forge', 'changes'),
      path.join(projectRoot, 'docs', 'forge', 'changes', 'archive'),
      path.join(projectRoot, 'docs', 'forge', 'decisions'),
      path.join(projectRoot, '.forge'),
    ];
    for (const dir of dirs) {
      await ensureDir(dir);
    }

    // 6. Generate config.json
    const config: ConfigJson = {
      version: '1.0',
      test_mode: 'normal',
      gstack_installed: false,
      batch_size: 6,
      test_command: testCommand,
      test_framework: testFramework,
      test_coverage: {
        unit: 80,
        integration: 60,
        e2e: 'P0',
      },
      project_type: projectType,
      platforms: options.platforms,
    };
    await writeJson(path.join(projectRoot, '.forge', 'config.json'), config);

    // 7. Generate progress.json
    const progress: ProgressJson = {
      version: '1.0',
      feature: '',
      status: 'idle',
      phase: 'brainstorming',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      total_batches: 0,
      current_batch: 0,
      batches: [],
      verification: {
        status: 'pending',
        test_mode: 'normal',
        last_run: null,
        report_path: null,
      },
    };
    await writeJson(path.join(projectRoot, '.forge', 'progress.json'), progress);

    // 8. Generate platform manifests
    for (const platform of options.platforms) {
      await generateManifest(projectRoot, platform as Platform);
    }

    // 9. Initialize CLAUDE.md
    await initializeClaudeMd(projectRoot, options.platforms);

    const message = `Forge initialized successfully.

Project type: ${projectType}
Test framework: ${testFramework} (${testCommand})
Platforms: ${options.platforms.join(', ')}
${warnings.length > 0 ? '\nWarnings:\n' + warnings.map((w) => `  - ${w}`).join('\n') : ''}

Next steps:
  1. Install Forge skills: npx forge skills install
  2. Start a feature: /start "your feature description"
`;

    return { success: true, message, warnings };
  } catch (error) {
    return {
      success: false,
      message: `Forge initialization failed: ${(error as Error).message}`,
      warnings,
    };
  }
}

async function initializeClaudeMd(projectRoot: string, platforms: string[]): Promise<void> {
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');

  const platformText = platforms.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' + ');

  const forgeSection = `## Forge

**Project Info**
- Test mode: normal
- Platforms: ${platformText}

**Current Feature**
- None (idle)

**Key Decisions**
- (Will be recorded as features are completed)

**Completed Features**
- (None yet)
`;

  if (await fileExists(claudeMdPath)) {
    const existing = await readTextFile(claudeMdPath);
    if (!existing.includes('## Forge')) {
      await writeTextFile(claudeMdPath, existing + '\n' + forgeSection);
    }
  } else {
    await writeTextFile(claudeMdPath, forgeSection);
  }
}
