import * as fs from 'fs';
import * as path from 'path';
import { readJson, fileExists } from '../utils/filesystem';
import { validateConfigJson, validateProgressJson, validateScenariosJson } from '../utils/schema';

export interface ValidateResult {
  success: boolean;
  output: string;
}

export async function runValidate(projectRoot: string): Promise<ValidateResult> {
  const lines: string[] = ['Forge Validate', '=============='];
  let allValid = true;
  const warnings: string[] = [];

  // Validate config.json
  const configPath = path.join(projectRoot, '.forge', 'config.json');
  if (await fileExists(configPath)) {
    const config = await readJson(configPath);
    const result = validateConfigJson(config);
    if (result.success) {
      lines.push('config.json: ✅ valid');
    } else {
      lines.push(`config.json: ❌ invalid — ${result.error}`);
      allValid = false;
    }
  } else {
    lines.push('config.json: ❌ missing');
    allValid = false;
  }

  // Validate progress.json
  const progressPath = path.join(projectRoot, '.forge', 'progress.json');
  if (await fileExists(progressPath)) {
    const progress = await readJson(progressPath);
    const result = validateProgressJson(progress);
    if (result.success) {
      lines.push('progress.json: ✅ valid');
    } else {
      lines.push(`progress.json: ❌ invalid — ${result.error}`);
      allValid = false;
    }
  } else {
    lines.push('progress.json: ❌ missing');
    allValid = false;
  }

  // Validate scenarios.json (if active feature has one)
  const changesDir = path.join(projectRoot, 'docs', 'forge', 'changes');
  if (await fileExists(changesDir)) {
    const entries = await fs.promises.readdir(changesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== 'archive') {
        const scenariosPath = path.join(changesDir, entry.name, 'scenarios.json');
        if (await fileExists(scenariosPath)) {
          const scenarios = await readJson(scenariosPath);
          const result = validateScenariosJson(scenarios);
          const scenarioCount = scenarios.scenarios?.length || 0;
          const p0Count = scenarios.scenarios?.filter((s: { priority: string }) => s.priority === 'P0').length || 0;
          const p1Count = scenarios.scenarios?.filter((s: { priority: string }) => s.priority === 'P1').length || 0;
          if (result.success) {
            lines.push(`scenarios.json: ✅ valid (${scenarioCount} scenarios, ${p0Count} P0, ${p1Count} P1)`);
          } else {
            lines.push(`scenarios.json: ❌ invalid — ${result.error}`);
            allValid = false;
          }
        }
      }
    }
  }

  // Check for inconsistencies
  if (await fileExists(progressPath)) {
    const progress = await readJson(progressPath);
    if (progress.status !== 'idle') {
      for (const batch of progress.batches || []) {
        for (const task of batch.tasks || []) {
          if (task.status === 'done' && !task.commit) {
            warnings.push(`task ${task.id} marked done but no commit found`);
          }
        }
      }
    }
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of warnings) {
      lines.push(`  - ${w}`);
    }
  }

  return { success: allValid && warnings.length === 0, output: lines.join('\n') };
}
