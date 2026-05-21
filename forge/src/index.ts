#!/usr/bin/env tsx
// Forge CLI - AI-driven software development orchestration

import { Command } from 'commander';
import { runInit } from './commands/init';
import { runStatus } from './commands/status';
import { runConfigGet, runConfigSet, runConfigList } from './commands/config';
import { runValidate } from './commands/validate';
import { runResume } from './commands/resume';

const program = new Command();

program
  .name('forge')
  .description('AI-driven software development orchestration CLI')
  .version('0.1.0');

// forge init
program
  .command('init')
  .description('Initialize Forge in the current project')
  .option('--platforms <platforms>', 'Comma-separated list of platforms (claude,opencode,codex)', 'opencode')
  .action(async (opts) => {
    const projectRoot = process.cwd();
    const platforms = opts.platforms.split(',').map((p: string) => p.trim());
    const result = await runInit(projectRoot, { platforms });
    console.log(result.message);
    if (result.warnings.length > 0) {
      process.exitCode = 1;
    }
  });

// forge status
program
  .command('status')
  .description('Show current Forge status')
  .action(async () => {
    const projectRoot = process.cwd();
    const result = await runStatus(projectRoot);
    if (result.success) {
      console.log(result.output);
    } else {
      console.error(result.error);
      process.exitCode = 1;
    }
  });

// forge config
const configCmd = program
  .command('config')
  .description('Manage Forge configuration');

configCmd
  .command('get <key>')
  .description('Get a config value')
  .action(async (key) => {
    const projectRoot = process.cwd();
    const result = await runConfigGet(projectRoot, key);
    if (result.success) {
      console.log(result.value);
    } else {
      console.error(result.error);
      process.exitCode = 1;
    }
  });

configCmd
  .command('set <key> <value>')
  .description('Set a config value')
  .action(async (key, value) => {
    const projectRoot = process.cwd();
    let parsed: unknown = value;
    if (value === 'true') parsed = true;
    else if (value === 'false') parsed = false;
    else if (!isNaN(Number(value))) parsed = Number(value);
    else {
      try { parsed = JSON.parse(value); } catch { /* keep as string */ }
    }
    const result = await runConfigSet(projectRoot, key, parsed);
    if (result.success) {
      console.log(`Config updated: ${key} = ${JSON.stringify(parsed)}`);
    } else {
      console.error(result.error);
      process.exitCode = 1;
    }
  });

configCmd
  .command('list')
  .description('List all config values')
  .action(async () => {
    const projectRoot = process.cwd();
    const result = await runConfigList(projectRoot);
    if (result.success) {
      console.log(result.output);
    } else {
      console.error(result.error);
      process.exitCode = 1;
    }
  });

// forge validate
program
  .command('validate')
  .description('Validate Forge state files')
  .action(async () => {
    const projectRoot = process.cwd();
    const result = await runValidate(projectRoot);
    console.log(result.output);
    if (!result.success) {
      process.exitCode = 1;
    }
  });

// forge resume
program
  .command('resume')
  .description('Resume an interrupted feature')
  .action(async () => {
    const projectRoot = process.cwd();
    const result = await runResume(projectRoot);
    if (result.success) {
      console.log(result.output);
    } else {
      console.error(result.error);
      process.exitCode = 1;
    }
  });

program.parse();
