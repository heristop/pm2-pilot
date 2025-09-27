import 'reflect-metadata';
import { injectable, inject } from 'tsyringe';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { BaseCommand } from './BaseCommand';
import type { IPM2Client } from '../interfaces/IPM2Client';
import type { IRenderer } from '../interfaces/IRenderer';

@injectable()
export class AllCommand extends BaseCommand {
  public readonly name = 'all';
  public readonly description = 'Perform batch operations on all processes';

  constructor(
    @inject('IPM2Client') private pm2Client: IPM2Client,
    @inject('IRenderer') private renderer: IRenderer
  ) {
    super();
  }

  public async execute(args: string[]): Promise<void> {
    const operation = args[0];
    
    if (!operation) {
      console.log(chalk.red('Usage: /all <operation>'));
      console.log(chalk.gray('Operations: restart, stop, start, delete'));
      console.log(chalk.gray('Example: /all restart'));
      return;
    }

    const validOperations = ['restart', 'stop', 'start', 'delete'];
    if (!validOperations.includes(operation)) {
      console.log(chalk.red(`Invalid operation. Choose from: ${validOperations.join(', ')}`));
      return;
    }

    try {
      const processes = await this.pm2Client.list();
      
      if (processes.length === 0) {
        console.log(chalk.gray('No PM2 processes found'));
        return;
      }

      console.log(chalk.blue.bold(`\n🔄 Batch Operation: ${operation.toUpperCase()} all processes`));
      console.log(chalk.yellow(`This will affect ${processes.length} process(es):\n`));
      
      processes.forEach(p => {
        const status = this.renderer.colorizeStatus(p.pm2_env.status);
        console.log(`  • ${p.name} (${status})`);
      });

      const { confirm } = await inquirer.prompt<{ confirm: boolean }>([{
        type: 'confirm',
        name: 'confirm',
        message: `Are you sure you want to ${operation} all processes?`,
        default: false
      }]);

      if (!confirm) {
        console.log(chalk.gray('Operation cancelled'));
        return;
      }

      console.log();
      
      // Perform operation on each process
      for (const process of processes) {
        try {
          console.log(chalk.gray(`${this.getOperationEmoji(operation)} ${operation}ing ${process.name}...`));
          
          switch (operation) {
            case 'restart':
              await this.pm2Client.restart(process.name);
              break;
            case 'stop':
              await this.pm2Client.stop(process.name);
              break;
            case 'start':
              await this.pm2Client.start(process.name);
              break;
            case 'delete':
              await this.pm2Client.delete(process.name);
              break;
          }
          
          console.log(chalk.green(`  ✓ ${process.name} ${operation}ed successfully`));
        } catch {
          console.log(chalk.red(`  ✗ Failed to ${operation} ${process.name}`));
        }
      }

      console.log();
      console.log(chalk.green.bold(`✅ Batch ${operation} completed`));
      
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to perform batch operation: ${message}`));
    }
  }

  private getOperationEmoji(operation: string): string {
    switch (operation) {
      case 'restart': return '♻️';
      case 'stop': return '⏹️';
      case 'start': return '▶️';
      case 'delete': return '🗑️';
      default: return '🔄';
    }
  }
}