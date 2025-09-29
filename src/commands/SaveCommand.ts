import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'util';
import type { IPM2Client } from '../interfaces/IPM2Client';

const execAsync = promisify(exec);

@injectable()
export class SaveCommand extends BaseCommand {
  public readonly name = 'save';
  public readonly description = 'Save current PM2 ecosystem configuration';

  constructor(
    @inject('IPM2Client') private pm2Client: IPM2Client,
    @inject('IRenderer') private renderer: IRenderer
  ) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    const filename = args[0] || 'ecosystem.config.js';
    const savePath = path.resolve(filename);

    try {
      console.log(chalk.blue('💾 Saving PM2 ecosystem configuration...'));
      
      // Generate ecosystem file using PM2
      await execAsync(`pm2 ecosystem`);
      
      // Also save detailed state
      const processes = await this.pm2Client.list();
      const detailedConfig = {
        timestamp: new Date().toISOString(),
        processes: processes.map(p => ({
          name: p.name,
          script: p.pm2_env.pm_exec_path,
          args: p.pm2_env.args,
          instances: p.pm2_env.instances || 1,
          exec_mode: p.pm2_env.exec_mode,
          env: p.pm2_env.env,
          cwd: p.pm2_env.pm_cwd,
          error_file: p.pm2_env.pm_err_log_path,
          out_file: p.pm2_env.pm_out_log_path,
          merge_logs: p.pm2_env.merge_logs,
          autorestart: p.pm2_env.autorestart,
          watch: p.pm2_env.watch,
          max_memory_restart: p.pm2_env.max_memory_restart,
          node_args: p.pm2_env.node_args,
          status: p.pm2_env.status
        }))
      };

      // Save detailed JSON configuration
      const jsonPath = savePath.replace('.js', '.json');
      await fs.writeFile(jsonPath, JSON.stringify(detailedConfig, null, 2));

      console.log(chalk.green(`✓ Ecosystem saved to: ${savePath}`));
      console.log(chalk.green(`✓ Detailed config saved to: ${jsonPath}`));
      console.log(chalk.gray(`  ${processes.length} process configuration(s) saved`));
      
      // Show saved processes
      console.log(chalk.cyan('\n📋 Saved processes:'));
      processes.forEach(p => {
        console.log(`  • ${p.name} (${this.renderer.colorizeStatus(p.pm2_env.status)})`);
      });

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to save configuration: ${message}`));
    }
  }
}