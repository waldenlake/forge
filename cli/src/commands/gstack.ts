import type { Command } from 'commander';
import { readConfig } from '../state/config.js';
import { runGstack, type GstackOptions } from '../lib/gstack/runner.js';

type GstackCommandOptions = {
  type: string;
  updateBaseline?: boolean;
  compare?: boolean;
  threshold?: string;
  config?: string;
};

function writeJson(payload: unknown): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function registerGstackCommand(program: Command): void {
  program
    .command('test:gstack')
    .requiredOption('--type <type>', 'gstack test type (e2e|visual|performance)')
    .option('--update-baseline', 'update visual baselines')
    .option('--compare', 'compare against baselines')
    .option('--threshold <pct>', 'visual diff threshold percentage')
    .option('--config <path>', 'Playwright config path')
    .action((options: GstackCommandOptions) => {
      const cwd = process.cwd();
      const config = readConfig(cwd);

      if (config.gstack_installed !== true) {
        process.exitCode = 1;
        writeJson({
          ok: false,
          unavailable: true,
          type: options.type,
          message: 'gstack is not installed or not enabled in config.json',
        });
        return;
      }

      const gstackOptions: GstackOptions = {
        type: options.type as 'e2e' | 'visual' | 'performance',
        updateBaseline: options.updateBaseline,
        compare: options.compare,
        threshold: options.threshold ? parseFloat(options.threshold) : undefined,
        config: options.config,
      };

      const result = runGstack(cwd, gstackOptions);
      if (!result.ok) process.exitCode = 1;
      writeJson(result);
    });
}
