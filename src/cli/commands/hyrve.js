'use strict';

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../utils/config.js';
import { showMiniBanner } from '../utils/banner.js';
import { listAvailableJobs, listOrders, acceptJob, deliverJob, getAgentProfile, getWallet } from '../../integrations/hyrve-bridge.js';
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
    .command('accept <jobId>')
    .description('Accept a job from the HYRVE marketplace')
    .action(async (jobId) => {
      showMiniBanner();
      console.log(chalk.cyan('  Accepting job...'));
      const result = await acceptJob(jobId);
      if (result.success) {
        console.log(chalk.green(`  ✔ Job accepted! Order created.`));
        if (result.order_id) console.log(chalk.gray(`    Order ID: ${result.order_id}`));
      } else {
        console.log(chalk.red(`  ✖ ${result.message}`));
      }
    });

  hyrve
    .command('deliver <orderId>')
    .description('Deliver work for a HYRVE order')
    .option('--url <url>', 'Deliverables URL')
    .option('--summary <text>', 'Delivery summary/notes')
    .action(async (orderId, opts) => {
      showMiniBanner();
      if (!opts.url) {
        console.log(chalk.red('  ✖ --url is required (deliverables link)'));
        return;
      }
      console.log(chalk.cyan('  Delivering work...'));
      const result = await deliverJob(orderId, { deliverables: opts.url, notes: opts.summary || '' });
      if (result.success) {
        console.log(chalk.green(`  ✔ Work delivered! Waiting for client approval.`));
      } else {
        console.log(chalk.red(`  ✖ ${result.message}`));
      }
    });

  hyrve
    .command('profile')
    .description('View your HYRVE marketplace profile')
    .action(async () => {
      showMiniBanner();
      console.log(chalk.cyan('  Fetching profile...'));
      const result = await getAgentProfile();
      if (result.success || result.agent) {
        const a = result.agent || result;
        console.log(`\n  ${chalk.bold(a.name || 'Unknown')}`);
        console.log(`  ${chalk.gray('ID:')} ${a.id || 'N/A'}`);
        console.log(`  ${chalk.gray('Slug:')} ${a.slug || 'N/A'}`);
        console.log(`  ${chalk.gray('Rating:')} ${a.avg_rating || '0'}/5`);
        console.log(`  ${chalk.gray('Jobs:')} ${a.total_jobs || 0} total, ${a.completed_jobs || 0} completed`);
        console.log(`  ${chalk.gray('Earned:')} $${parseFloat(a.total_earned || 0).toFixed(2)}`);
        console.log(`  ${chalk.gray('Online:')} ${a.is_online ? chalk.green('Yes') : chalk.red('No')}`);
        console.log(`  ${chalk.gray('URL:')} https://app.hyrveai.com/agents/${a.slug}`);
      } else {
        console.log(chalk.red(`  ✖ ${result.message || 'Profile not available'}`));
      }
    });

  hyrve
    .command('orders')
    .description('List your HYRVE marketplace orders')
    .option('--status <status>', 'Filter by status (all/active/completed)', 'all')
    .action(async (opts) => {
      showMiniBanner();
      console.log(chalk.cyan('  Fetching orders...'));
      const result = await listOrders({ status: opts.status });
      const orders = result.orders || result.data || [];
      if (orders.length === 0) {
        console.log(chalk.gray('  No orders found.'));
        return;
      }
      console.log(`\n  ${chalk.bold('HYRVE Orders')} (${orders.length})\n`);
      for (const o of orders) {
        const statusColor = { completed: 'green', escrow: 'yellow', delivered: 'cyan', disputed: 'red' }[o.status] || 'gray';
        console.log(`  ${chalk.gray(o.id?.slice(0, 8) || '?')}  ${o.task_description?.slice(0, 40) || 'Order'}  $${parseFloat(o.amount_usd || 0).toFixed(2)}  ${chalk[statusColor](o.status)}`);
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
