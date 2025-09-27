import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { IPM2Client } from '../interfaces/IPM2Client';

const execAsync = promisify(exec);

interface DetailedConfig {
  timestamp: string;
  processes: Array<{
    name: string;
    exec_mode: string;
  }>;
}

@injectable()
export class LoadCommand extends BaseCommand {
  public readonly name = 'load';
  public readonly description = 'Load saved PM2 ecosystem configuration';

  constructor(
    @inject('IPM2Client') private pm2Client: IPM2Client,
    @inject('IRenderer') private renderer: IRenderer
  ) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    const filename = args[0] || 'ecosystem.config.js';
    const loadPath = path.resolve(filename);

    try {
      // Check if file exists
      await fs.access(loadPath);
      
      console.log(chalk.blue(`📂 Loading configuration from: ${loadPath}`));

      // Check for JSON detailed config
      const jsonPath = loadPath.replace('.js', '.json');
      let detailedConfig: DetailedConfig | null = null;
      
      try {
        const jsonContent = await fs.readFile(jsonPath, 'utf-8');
        detailedConfig = JSON.parse(jsonContent) as DetailedConfig;
        console.log(chalk.gray(`  Timestamp: ${detailedConfig.timestamp}`));
        console.log(chalk.gray(`  Processes: ${detailedConfig.processes.length}`));
      } catch {
        // JSON file not found or invalid
      }

      // Show what will be loaded
      if (detailedConfig) {
        console.log(chalk.cyan('\n📋 Configuration to load:'));
        detailedConfig.processes.forEach((p) => {
          console.log(`  • ${p.name} (${p.exec_mode})`);
        });
      }

      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([{
        type: 'confirm',
        name: 'confirm',
        message: 'Load this configuration? (This will start new processes)',
        default: false
      }]);

      if (!confirm) {
        console.log(chalk.gray('Load cancelled'));
        return;
      }

      console.log(chalk.yellow('\n🔄 Loading ecosystem...'));
      
      // Use PM2 to load the ecosystem file
      const { stderr } = await execAsync(`pm2 start ${loadPath}`);
      
      if (stderr && !stderr.includes('Spawning PM2')) {
        console.error(chalk.red(`Error: ${stderr}`));
      }
      
      console.log(chalk.green('✓ Configuration loaded successfully'));
      
      // Show status of loaded processes
      const processes = await this.pm2Client.list();
      console.log(chalk.cyan('\n📊 Current status:'));
      processes.forEach(p => {
        console.log(`  • ${p.name}: ${this.renderer.colorizeStatus(p.pm2_env.status)}`);
      });

    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        console.error(chalk.red(`Configuration file not found: ${loadPath}`));
        console.log(chalk.gray('Use /save to create a configuration first'));
      } else {
        const message = error instanceof Error ? error.message : String(error);
        console.error(chalk.red(`Failed to load configuration: ${message}`));
      }
    }
  }
}