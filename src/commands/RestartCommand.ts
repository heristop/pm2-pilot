import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import { BaseCommand } from './BaseCommand';
import type { IPM2Client } from '../interfaces/IPM2Client';

@injectable()
export class RestartCommand extends BaseCommand {
  public readonly name = 'restart';
  public readonly description = 'Restart a PM2 process';

  constructor(@inject('IPM2Client') private pm2Client: IPM2Client) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    if (args.length === 0) {
      console.log(chalk.red('Usage: /restart <process-name|process-id>'));
      return;
    }

    const processName = args[0]!;
    
    try {
      console.log(chalk.yellow(`Restarting process: ${processName}...`));
      await this.pm2Client.restart(processName);
      console.log(chalk.green(`✓ Process ${processName} restarted successfully`));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to restart ${processName}: ${message}`));
    }
  }
}