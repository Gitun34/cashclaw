'use strict';

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../utils/config.js';
import { listAvailableJobs, listOrders } from '../../integrations/hyrve-bridge.js';
import MppBridge from '../../integrations/mpp-bridge.js';

export function createHyrveCommand() {
  const hyrve = new Command('hyrve')
    .description('HYRVE AI Marketplace commands');

  hyrve
    .command('status')
    .description('Check HYRVE connection status')
    .action(async () => {
      const config = await loadConfig();
      const spinner = ora('Checking HYRVE connection...').start();
      try {
        const mpp = new MppBridge(config);

        const [apiStatus, mppStatus] = await Promise.all([
          fetch(`${config?.hyrve?.api_url || 'https://api.hyrveai.com/v1'}/health`)
            .then(r => r.json()).catch(() => ({ status: 'error' })),
          mpp.getStatus(),
        ]);

        spinner.stop();
        console.log('');
        console.log(chalk.bold('  HYRVE AI Connection Status'));
        console.log(chalk.dim('  ─────────────────────────'));
        console.log(`  API:        ${apiStatus.status === 'ok' ? chalk.green('● Connected') : chalk.red('● Disconnected')}`);
        console.log(`  API URL:    ${chalk.dim(config?.hyrve?.api_url || 'https://api.hyrveai.com/v1')}`);
        console.log(`  Agent ID:   ${config?.hyrve?.agent_id ? chalk.cyan(config.hyrve.agent_id) : chalk.yellow('Not registered')}`);
        console.log(`  API Key:    ${config?.hyrve?.api_key ? chalk.green('● Set') : chalk.yellow('● Not set')}`);
        console.log(`  MPP:        ${mppStatus.connected ? chalk.green('● Available (USDC, 1.5% fee)') : chalk.yellow('● Pending')}`);
        console.log(`  Dashboard:  ${chalk.dim('https://app.hyrveai.com')}`);
        console.log('');
      } catch (err) {
        spinner.fail('Connection check failed: ' + err.message);
      }
    });

  hyrve
    .command('jobs')
    .description('List available jobs on HYRVE marketplace')
    .action(async () => {
      const spinner = ora('Fetching available jobs...').start();
      try {
        const result = await listAvailableJobs();
        spinner.stop();

        if (!result.jobs || result.jobs.length === 0) {
          console.log(chalk.yellow('\n  No matching jobs found.\n'));
          return;
        }

        console.log(chalk.bold(`\n  Available Jobs (${result.jobs.length})\n`));
        for (const job of result.jobs) {
          console.log(`  ${chalk.cyan(job.title)}`);
          console.log(`  ${chalk.dim(job.description?.substring(0, 80))}...`);
          console.log(`  Budget: ${chalk.green('$' + job.budget_usd)} | Category: ${job.category} | ID: ${chalk.dim(job.id)}`);
          console.log('');
        }
      } catch (err) {
        spinner.fail('Failed: ' + err.message);
      }
    });

  hyrve
    .command('wallet')
    .description('Check HYRVE wallet balance')
    .action(async () => {
      const spinner = ora('Fetching wallet...').start();
      try {
        const result = await listOrders({ status: 'completed', limit: 5 });
        spinner.stop();
        console.log(chalk.bold('\n  HYRVE Wallet'));
        console.log(chalk.dim('  ──────────────'));
        console.log(`  Open dashboard for details: ${chalk.cyan('https://app.hyrveai.com/wallet')}`);
        console.log('');
      } catch (err) {
        spinner.fail('Failed: ' + err.message);
      }
    });

  hyrve
    .command('dashboard')
    .description('Open HYRVE AI dashboard in browser')
    .action(async () => {
      const url = 'https://app.hyrveai.com';
      console.log(chalk.cyan(`\n  Opening ${url}...\n`));
      const { exec } = await import('child_process');
      const cmd = process.platform === 'win32' ? `start ${url}` : process.platform === 'darwin' ? `open ${url}` : `xdg-open ${url}`;
      exec(cmd);
    });

  return hyrve;
}
